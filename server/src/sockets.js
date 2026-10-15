import { randomInt } from 'node:crypto';
import { GameError } from './errors.js';
import { Game, PHASE } from './game.js';
import { sanitizeQuiz } from './quiz.js';
import { buildResults, resultsFilename, resultsToCsv, saveResults } from './results.js';

const HOST_ABANDON_MS = 15 * 60 * 1000; // host gone this long -> game is closed
const IDLE_MS = 3 * 60 * 60 * 1000; // no activity at all this long -> game is closed
const SWEEP_INTERVAL_MS = 60 * 1000;
const JOIN_ATTEMPTS_PER_MINUTE = 20; // slows down PIN guessing

const hostRoom = (pin) => `host:${pin}`;
const playersRoom = (pin) => `players:${pin}`;

/**
 * Wires game events onto a Socket.IO server. Returns the live game registry.
 * Finished games are written to `resultsDir` (pass null to disable saving).
 */
export function createGameServer(io, { maxPlayers = 150, introMs, now = Date.now, resultsDir = null } = {}) {
  const games = new Map(); // pin -> Game

  /** Saves a game's results once. Games ended before any question was scored have none. */
  function persistResults(game, completed) {
    if (!resultsDir || game.resultsSaved || game.scoredCount === 0) return;
    game.resultsSaved = true;
    saveResults(buildResults(game, { completed }), resultsDir)
      .then((file) => console.log(`Saved results: ${file}`))
      .catch((err) => console.error(`Could not save results for game ${game.pin}:`, err));
  }

  // ------------------------------------------------------------ broadcasting

  function sendToPlayer(game, player) {
    if (player?.socketId) io.to(player.socketId).emit('player:state', game.playerView(player.id));
  }

  function broadcast(game, { scope = 'all' } = {}) {
    if (scope === 'answers') {
      io.to(hostRoom(game.pin)).emit('host:answers', {
        answeredCount: game.answers.size,
        playerCount: game.players.size,
      });
      return;
    }
    io.to(hostRoom(game.pin)).emit('host:state', game.hostView());
    if (scope === 'host') return;
    // Each player gets a personalised view (their own score, rank, result).
    for (const player of game.players.values()) sendToPlayer(game, player);
  }

  function endGame(game, reason = 'The host ended the game') {
    persistResults(game, game.phase === PHASE.PODIUM);
    game.destroy();
    games.delete(game.pin);
    io.to(playersRoom(game.pin)).to(hostRoom(game.pin)).emit('game:ended', { reason });
    io.socketsLeave([playersRoom(game.pin), hostRoom(game.pin)]);
  }

  function newPin() {
    let pin;
    do pin = String(randomInt(100000, 1000000));
    while (games.has(pin));
    return pin;
  }

  // ---------------------------------------------------------------- helpers

  /** Runs a handler and always answers the client's ack with { ok, ... }. */
  function respond(ack, fn) {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      reply({ ok: true, ...(fn() ?? {}) });
    } catch (err) {
      if (err instanceof GameError) {
        reply({ ok: false, code: err.code, error: err.message });
      } else {
        console.error(err);
        reply({ ok: false, code: 'SERVER_ERROR', error: 'Something went wrong on the server' });
      }
    }
  }

  function findGame(pin) {
    const game = games.get(String(pin ?? '').trim());
    if (!game) throw new GameError('NOT_FOUND', 'No game found with that PIN');
    return game;
  }

  function hostGame(socket) {
    const { role, pin } = socket.data;
    const game = role === 'host' ? games.get(pin) : null;
    if (!game) throw new GameError('NOT_HOST', 'You are not hosting a game');
    return game;
  }

  function playerContext(socket) {
    const { role, pin, playerId } = socket.data;
    const game = role === 'player' ? games.get(pin) : null;
    if (!game || !game.players.has(playerId)) throw new GameError('NOT_IN_GAME', 'You are not in this game');
    return { game, playerId };
  }

  function rateLimitJoins(socket) {
    const t = now();
    const recent = (socket.data.joinAttempts ?? []).filter((at) => t - at < 60_000);
    if (recent.length >= JOIN_ATTEMPTS_PER_MINUTE) {
      throw new GameError('RATE_LIMITED', 'Too many attempts. Wait a minute and try again.');
    }
    recent.push(t);
    socket.data.joinAttempts = recent;
  }

  /** Detaches a socket from whatever game it was in (e.g. hosting a second game). */
  function leaveCurrent(socket) {
    const { role, pin, playerId } = socket.data;
    if (role === 'host') socket.leave(hostRoom(pin));
    if (role === 'player') {
      socket.leave(playersRoom(pin));
      const player = games.get(pin)?.players.get(playerId);
      if (player?.socketId === socket.id) player.socketId = null;
    }
    socket.data.role = null;
  }

  // ----------------------------------------------------------------- events

  io.on('connection', (socket) => {
    socket.data = {};

    socket.on('host:create', (payload, ack) =>
      respond(ack, () => {
        const quiz = sanitizeQuiz(payload?.quiz);
        leaveCurrent(socket);
        const game = new Game({
          pin: newPin(),
          quiz,
          maxPlayers,
          now,
          ...(introMs !== undefined && { introMs }),
        });
        game.onUpdate = (update) => {
          broadcast(game, update);
          if (game.phase === PHASE.PODIUM) persistResults(game, true);
        };
        games.set(game.pin, game);
        socket.data = { ...socket.data, role: 'host', pin: game.pin };
        socket.join(hostRoom(game.pin));
        return { pin: game.pin, hostToken: game.hostToken, state: game.hostView() };
      }),
    );

    socket.on('host:rejoin', (payload, ack) =>
      respond(ack, () => {
        const game = findGame(payload?.pin);
        if (payload?.hostToken !== game.hostToken) throw new GameError('NOT_HOST', 'You are not the host of that game');
        leaveCurrent(socket);
        socket.data = { ...socket.data, role: 'host', pin: game.pin };
        socket.join(hostRoom(game.pin));
        game.hostConnected = true;
        game.touch();
        return { state: game.hostView() };
      }),
    );

    socket.on('host:action', (payload, ack) =>
      respond(ack, () => {
        const game = hostGame(socket);
        switch (payload?.action) {
          case 'start':
            game.start();
            break;
          case 'next':
            game.next();
            break;
          case 'lock':
            game.setLocked(true);
            break;
          case 'unlock':
            game.setLocked(false);
            break;
          case 'kick': {
            const player = game.players.get(payload.playerId);
            if (!player) throw new GameError('NOT_FOUND', 'That player already left');
            if (player.socketId) {
              io.to(player.socketId).emit('player:kicked');
              const kicked = io.sockets.sockets.get(player.socketId);
              if (kicked) {
                kicked.leave(playersRoom(game.pin));
                kicked.data.role = null;
              }
            }
            game.removePlayer(player.id);
            broadcast(game, { scope: 'host' });
            break;
          }
          case 'end':
            endGame(game);
            socket.data.role = null;
            break;
          default:
            throw new GameError('BAD_ACTION', 'Unknown action');
        }
      }),
    );

    socket.on('host:results', (_payload, ack) =>
      respond(ack, () => {
        const game = hostGame(socket);
        if (game.scoredCount === 0) throw new GameError('NO_RESULTS', 'No questions have been scored yet');
        const results = buildResults(game, { completed: game.phase === PHASE.PODIUM });
        return { csv: resultsToCsv(results), filename: resultsFilename(results, 'csv') };
      }),
    );

    socket.on('game:check', (payload, ack) =>
      respond(ack, () => {
        rateLimitJoins(socket);
        const game = findGame(payload?.pin);
        if (game.phase === PHASE.PODIUM) throw new GameError('GAME_OVER', 'This game has already finished');
        return { title: game.quiz.title };
      }),
    );

    socket.on('player:join', (payload, ack) =>
      respond(ack, () => {
        rateLimitJoins(socket);
        const game = findGame(payload?.pin);
        const existing = payload?.playerId ? game.players.get(payload.playerId) : null;
        if (!existing && !payload?.name) {
          throw new GameError('NOT_IN_GAME', 'Your spot in this game has expired. Join again.');
        }

        leaveCurrent(socket);
        const player = existing ?? game.addPlayer(payload.name);
        // If this player was open in another tab, that tab stops receiving updates.
        player.socketId = socket.id;
        game.setConnected(player.id, true);
        socket.data = { ...socket.data, role: 'player', pin: game.pin, playerId: player.id };
        socket.join(playersRoom(game.pin));
        broadcast(game, { scope: 'host' });
        return { playerId: player.id, state: game.playerView(player.id) };
      }),
    );

    socket.on('player:answer', (payload, ack) =>
      respond(ack, () => {
        const { game, playerId } = playerContext(socket);
        const { responseMs } = game.submitAnswer(playerId, payload?.answerIndex, payload?.questionIndex);
        if (game.phase === PHASE.QUESTION) sendToPlayer(game, game.players.get(playerId));
        return { responseMs };
      }),
    );

    socket.on('player:leave', (_payload, ack) =>
      respond(ack, () => {
        const { game, playerId } = playerContext(socket);
        leaveCurrent(socket);
        game.removePlayer(playerId);
        broadcast(game, { scope: 'host' });
      }),
    );

    socket.on('disconnect', () => {
      const { role, pin, playerId } = socket.data;
      const game = games.get(pin);
      if (!game) return;
      if (role === 'host') {
        // Only flag the host as gone if no other host socket is still in the room.
        if (!io.sockets.adapter.rooms.get(hostRoom(pin))?.size) {
          game.hostConnected = false;
          game.hostLeftAt = now();
        }
      } else if (role === 'player') {
        const player = game.players.get(playerId);
        if (player?.socketId !== socket.id) return; // already reconnected elsewhere
        player.socketId = null;
        game.setConnected(playerId, false);
        broadcast(game, { scope: 'host' });
      }
    });
  });

  // Close abandoned games so memory doesn't grow forever.
  const sweeper = setInterval(() => {
    const t = now();
    for (const game of games.values()) {
      const hostGone = !game.hostConnected && t - game.hostLeftAt > HOST_ABANDON_MS;
      if (hostGone || t - game.lastActivity > IDLE_MS) endGame(game, 'This game was closed due to inactivity');
    }
  }, SWEEP_INTERVAL_MS);
  sweeper.unref();

  return {
    games,
    close() {
      clearInterval(sweeper);
      for (const game of games.values()) game.destroy();
      games.clear();
    },
  };
}
