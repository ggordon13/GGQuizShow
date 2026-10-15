/**
 * Simulates a full game with many players over real WebSockets.
 *
 *   npm run loadtest                 # 150 players
 *   PLAYERS=300 npm run loadtest     # more
 *
 * Starts its own server on a random port, so nothing else needs to be running.
 */
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { createGameServer } from '../src/sockets.js';

const PLAYERS = Number(process.env.PLAYERS) || 150;
const QUESTIONS = 3;

const httpServer = createServer();
const io = new Server(httpServer);
const gameServer = createGameServer(io, { maxPlayers: PLAYERS, introMs: 300 });
await new Promise((resolve) => httpServer.listen(0, resolve));
const url = `http://localhost:${httpServer.address().port}`;

const client = () => connect(url, { transports: ['websocket'], forceNew: true });
const request = (socket, event, payload) =>
  new Promise((resolve, reject) =>
    socket.timeout(10_000).emit(event, payload, (err, res) => (err ? reject(err) : resolve(res))),
  );
const waitFor = (socket, event, predicate) =>
  new Promise((resolve) => {
    const handler = (data) => {
      if (!predicate || predicate(data)) {
        socket.off(event, handler);
        resolve(data);
      }
    };
    socket.on(event, handler);
  });

const quiz = {
  title: 'Load test',
  questions: Array.from({ length: QUESTIONS }, (_, i) => ({
    text: `Question ${i + 1}`,
    timeLimit: 5,
    answers: [{ text: 'A', correct: true }, { text: 'B' }, { text: 'C' }, { text: 'D' }],
  })),
};

const host = client();
const created = await request(host, 'host:create', { quiz });
if (!created.ok) throw new Error(created.error);
const { pin } = created;
console.log(`Game ${pin}: connecting ${PLAYERS} players...`);

let t0 = performance.now();
const players = await Promise.all(
  Array.from({ length: PLAYERS }, async (_, i) => {
    const socket = client();
    const res = await request(socket, 'player:join', { pin, name: `Bot ${i + 1}` });
    if (!res.ok) throw new Error(`Bot ${i + 1}: ${res.error}`);
    return socket;
  }),
);
console.log(`  all joined in ${Math.round(performance.now() - t0)}ms`);

const latencies = [];
for (let q = 0; q < QUESTIONS; q++) {
  const questionOpen = Promise.all(players.map((s) => waitFor(s, 'player:state', (st) => st.phase === 'question')));
  await request(host, 'host:action', { action: q === 0 ? 'start' : 'next' });
  await questionOpen;

  const revealed = waitFor(host, 'host:state', (st) => st.phase === 'reveal');
  t0 = performance.now();
  await Promise.all(
    players.map(async (socket, i) => {
      await new Promise((r) => setTimeout(r, Math.random() * 1500));
      const start = performance.now();
      const res = await request(socket, 'player:answer', { questionIndex: q, answerIndex: i % 4 });
      latencies.push(performance.now() - start);
      if (!res.ok) throw new Error(res.error);
    }),
  );
  const reveal = await revealed;
  const total = reveal.distribution.reduce((a, b) => a + b, 0);
  console.log(`  Q${q + 1}: ${total}/${PLAYERS} answers counted, revealed ${Math.round(performance.now() - t0)}ms after open`);
  if (total !== PLAYERS) throw new Error('Some answers were lost');
  if (q < QUESTIONS - 1) await request(host, 'host:action', { action: 'next' }); // -> leaderboard
}

const podium = waitFor(host, 'host:state', (st) => st.phase === 'podium');
await request(host, 'host:action', { action: 'next' });
const final = await podium;

const results = await request(host, 'host:results');
const csvRows = results.csv.trim().split('\r\n').length - 1;
console.log(`  results CSV: ${csvRows} player rows, ${results.filename}`);
if (csvRows !== PLAYERS) throw new Error('Results are missing players');

latencies.sort((a, b) => a - b);
const pct = (p) => latencies[Math.floor((latencies.length - 1) * p)].toFixed(1);
console.log(`  answer round-trip: p50 ${pct(0.5)}ms, p95 ${pct(0.95)}ms, max ${pct(1)}ms`);
console.log(`  winner: ${final.leaderboard[0].name} with ${final.leaderboard[0].score} points`);

for (const s of [host, ...players]) s.close();
gameServer.close();
io.close();
console.log('Load test passed.');
process.exit(0);
