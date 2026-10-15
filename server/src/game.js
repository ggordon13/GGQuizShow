import { randomUUID } from 'node:crypto';
import { GameError } from './errors.js';
import { calculatePoints, streakBonus } from './scoring.js';

export const PHASE = Object.freeze({
  LOBBY: 'lobby',
  INTRO: 'intro', // question text shown, answers not yet open
  QUESTION: 'question', // accepting answers
  REVEAL: 'reveal', // correct answer + distribution
  LEADERBOARD: 'leaderboard',
  PODIUM: 'podium',
});

export const INTRO_MS = 5000;
/** Extra time after the visible countdown so in-flight answers aren't dropped. */
export const ANSWER_GRACE_MS = 400;
export const NAME_MAX = 20;
const LEADERBOARD_SIZE = 5;
const PODIUM_LIST_SIZE = 10;

export function cleanName(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

/**
 * One running quiz. Pure game logic: it knows nothing about sockets. Every
 * change it wants broadcast is reported through `onUpdate({ scope, playerId })`
 * where scope is 'all' | 'host' | 'answers'.
 */
export class Game {
  constructor({ pin, quiz, maxPlayers = 150, introMs = INTRO_MS, now = Date.now, onUpdate = () => {} }) {
    this.pin = pin;
    this.quiz = quiz;
    this.hostToken = randomUUID();
    this.maxPlayers = maxPlayers;
    this.introMs = introMs;
    this.now = now;
    this.onUpdate = onUpdate;

    this.players = new Map(); // playerId -> player
    this.standings = []; // players sorted by rank
    this.joinCounter = 0;
    this.locked = false;

    this.phase = PHASE.LOBBY;
    this.questionIndex = -1;
    this.phaseStartedAt = now();
    this.phaseEndsAt = 0;
    this.answers = new Map(); // playerId -> { answerIndex, responseMs }
    this.distribution = null;
    this.timer = null;
    this.startedAt = 0;
    this.finishedAt = 0;
    this.scoredCount = 0; // questions that have been scored (results cover these)
    this.resultsSaved = false;

    this.hostConnected = true;
    this.hostLeftAt = 0;
    this.lastActivity = now();
  }

  get question() {
    return this.quiz.questions[this.questionIndex] ?? null;
  }

  get isLastQuestion() {
    return this.questionIndex >= this.quiz.questions.length - 1;
  }

  // ---------------------------------------------------------------- players

  addPlayer(rawName) {
    if (this.phase === PHASE.PODIUM) throw new GameError('GAME_OVER', 'This game has already finished');
    if (this.locked) throw new GameError('LOCKED', 'The host has locked this game');
    if (this.players.size >= this.maxPlayers) {
      throw new GameError('FULL', `This game is full (${this.maxPlayers} players)`);
    }
    const name = cleanName(rawName);
    if (!name) throw new GameError('BAD_NAME', 'Please enter a nickname');
    const lower = name.toLowerCase();
    for (const p of this.players.values()) {
      if (p.name.toLowerCase() === lower) throw new GameError('NAME_TAKEN', 'That nickname is already taken');
    }

    const player = {
      id: randomUUID(),
      name,
      score: 0,
      prevScore: 0,
      rank: 0,
      prevRank: 0,
      streak: 0,
      joinOrder: this.joinCounter++,
      connected: true,
      socketId: null,
      lastResult: null,
      history: [], // questionIndex -> result; holes for questions before a late join
    };
    this.players.set(player.id, player);
    this.rankPlayers();
    this.touch();
    return player;
  }

  removePlayer(playerId) {
    if (!this.players.delete(playerId)) return false;
    this.answers.delete(playerId);
    this.rankPlayers();
    this.touch();
    this.endIfEveryoneAnswered();
    return true;
  }

  setConnected(playerId, connected) {
    const player = this.players.get(playerId);
    if (!player) return;
    player.connected = connected;
    // A player dropping out may mean everyone still here has answered.
    if (!connected) this.endIfEveryoneAnswered();
  }

  // ----------------------------------------------------------------- flow

  start() {
    if (this.phase !== PHASE.LOBBY) throw new GameError('BAD_PHASE', 'The game has already started');
    if (this.players.size === 0) throw new GameError('NO_PLAYERS', 'Wait for at least one player to join');
    this.startedAt = this.now();
    this.goToQuestion(0);
  }

  /** The host's single "advance" button. */
  next() {
    switch (this.phase) {
      case PHASE.LOBBY:
        return this.start();
      case PHASE.INTRO:
        return this.beginAnswering();
      case PHASE.QUESTION:
        return this.endQuestion();
      case PHASE.REVEAL:
        return this.isLastQuestion ? this.finish() : this.setPhase(PHASE.LEADERBOARD);
      case PHASE.LEADERBOARD:
        return this.goToQuestion(this.questionIndex + 1);
      default:
        throw new GameError('BAD_PHASE', 'The game is over');
    }
  }

  goToQuestion(index) {
    this.clearTimer();
    this.questionIndex = index;
    this.answers.clear();
    this.distribution = null;
    for (const p of this.players.values()) p.lastResult = null;
    this.timer = setTimeout(() => this.beginAnswering(), this.introMs);
    this.setPhase(PHASE.INTRO, this.introMs);
  }

  beginAnswering() {
    if (this.phase !== PHASE.INTRO) return;
    this.clearTimer();
    const ms = this.question.timeLimit * 1000;
    this.timer = setTimeout(() => this.endQuestion(), ms + ANSWER_GRACE_MS);
    this.setPhase(PHASE.QUESTION, ms);
  }

  submitAnswer(playerId, answerIndex, questionIndex) {
    if (this.phase !== PHASE.QUESTION) throw new GameError('NOT_ACCEPTING', "Time's up!");
    if (questionIndex !== undefined && questionIndex !== this.questionIndex) {
      throw new GameError('STALE', 'That question has already ended');
    }
    if (!this.players.has(playerId)) throw new GameError('NOT_IN_GAME', 'You are not in this game');
    if (this.answers.has(playerId)) throw new GameError('ALREADY_ANSWERED', 'You already answered');
    const q = this.question;
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= q.answers.length) {
      throw new GameError('BAD_ANSWER', 'Invalid answer');
    }

    const responseMs = Math.min(Math.max(this.now() - this.phaseStartedAt, 0), q.timeLimit * 1000);
    this.answers.set(playerId, { answerIndex, responseMs });
    this.touch();
    if (!this.endIfEveryoneAnswered()) this.onUpdate({ scope: 'answers' });
    return { responseMs };
  }

  endIfEveryoneAnswered() {
    if (this.phase !== PHASE.QUESTION) return false;
    let connected = 0;
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      connected++;
      if (!this.answers.has(p.id)) return false;
    }
    if (connected === 0) return false; // nobody here; let the clock run out
    this.endQuestion();
    return true;
  }

  endQuestion() {
    if (this.phase !== PHASE.QUESTION) return;
    this.clearTimer();
    const q = this.question;
    const timeLimitMs = q.timeLimit * 1000;
    const distribution = q.answers.map(() => 0);

    for (const p of this.players.values()) {
      p.prevScore = p.score;
      p.prevRank = p.rank;
      const answer = this.answers.get(p.id);
      if (answer) distribution[answer.answerIndex]++;
      const correct = Boolean(answer) && q.answers[answer.answerIndex].correct;

      let points = 0;
      let bonus = 0;
      if (correct) {
        p.streak++;
        points = calculatePoints({ correct, responseMs: answer.responseMs, timeLimitMs, multiplier: q.points });
        bonus = q.points > 0 ? streakBonus(p.streak) : 0;
      } else {
        p.streak = 0;
      }
      p.score += points + bonus;
      p.lastResult = {
        answered: Boolean(answer),
        answerIndex: answer ? answer.answerIndex : null,
        responseMs: answer ? answer.responseMs : null,
        correct,
        points,
        bonus,
        streak: p.streak,
      };
      p.history[this.questionIndex] = p.lastResult;
    }

    this.scoredCount = this.questionIndex + 1;
    this.distribution = distribution;
    this.rankPlayers();
    this.setPhase(PHASE.REVEAL);
  }

  finish() {
    this.clearTimer();
    this.finishedAt = this.now();
    this.setPhase(PHASE.PODIUM);
  }

  setLocked(locked) {
    this.locked = Boolean(locked);
    this.touch();
    this.onUpdate({ scope: 'host' });
  }

  destroy() {
    this.clearTimer();
    this.onUpdate = () => {};
  }

  // -------------------------------------------------------------- helpers

  setPhase(phase, durationMs = 0) {
    this.phase = phase;
    this.phaseStartedAt = this.now();
    this.phaseEndsAt = durationMs ? this.phaseStartedAt + durationMs : 0;
    this.touch();
    this.onUpdate({ scope: 'all' });
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  touch() {
    this.lastActivity = this.now();
  }

  /** Standard competition ranking: equal scores share a rank (1, 2, 2, 4). */
  rankPlayers() {
    this.standings = [...this.players.values()].sort((a, b) => b.score - a.score || a.joinOrder - b.joinOrder);
    this.standings.forEach((p, i) => {
      const prev = this.standings[i - 1];
      p.rank = prev && prev.score === p.score ? prev.rank : i + 1;
    });
  }

  timing() {
    if (!this.phaseEndsAt) return null;
    return {
      remainingMs: Math.max(0, this.phaseEndsAt - this.now()),
      durationMs: this.phaseEndsAt - this.phaseStartedAt,
    };
  }

  publicQuestion(revealCorrect) {
    const q = this.question;
    if (!q) return null;
    return {
      index: this.questionIndex,
      text: q.text,
      // Served over HTTP rather than inside every state message; ?v= busts caches if it changes.
      image: q.image ? `/api/media/${this.pin}/${this.questionIndex}?v=${q.image.hash}` : null,
      timeLimit: q.timeLimit,
      points: q.points,
      answers: q.answers.map((a) => (revealCorrect ? { text: a.text, correct: a.correct } : { text: a.text })),
    };
  }

  leaderboard(size) {
    return this.standings.slice(0, size).map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      prevScore: p.prevScore,
      rank: p.rank,
      prevRank: p.prevRank,
      streak: p.streak,
    }));
  }

  /** A question's image, but only once that question has been shown, so nobody can peek ahead. */
  imageFor(index) {
    if (!Number.isInteger(index) || index < 0 || index > this.questionIndex) return null;
    return this.quiz.questions[index]?.image ?? null;
  }

  get showsQuestion() {
    return [PHASE.INTRO, PHASE.QUESTION, PHASE.REVEAL, PHASE.LEADERBOARD].includes(this.phase);
  }

  get revealsAnswers() {
    return this.phase === PHASE.REVEAL || this.phase === PHASE.LEADERBOARD;
  }

  /** What the host screen (usually projected for everyone) sees. */
  hostView() {
    const { phase } = this;
    return {
      pin: this.pin,
      title: this.quiz.title,
      phase,
      locked: this.locked,
      maxPlayers: this.maxPlayers,
      questionIndex: this.questionIndex,
      totalQuestions: this.quiz.questions.length,
      playerCount: this.players.size,
      hasResults: this.scoredCount > 0,
      players:
        phase === PHASE.LOBBY
          ? [...this.players.values()].map((p) => ({ id: p.id, name: p.name, connected: p.connected }))
          : null,
      question: this.showsQuestion ? this.publicQuestion(this.revealsAnswers) : null,
      timing: this.timing(),
      answeredCount: this.answers.size,
      distribution: this.revealsAnswers ? this.distribution : null,
      leaderboard:
        phase === PHASE.LEADERBOARD || phase === PHASE.PODIUM
          ? this.leaderboard(phase === PHASE.PODIUM ? PODIUM_LIST_SIZE : LEADERBOARD_SIZE)
          : null,
    };
  }

  /** What one player's device sees. */
  playerView(playerId) {
    const p = this.players.get(playerId);
    if (!p) return null;
    const answer = this.answers.get(playerId);

    let ahead = null;
    if (this.revealsAnswers || this.phase === PHASE.PODIUM) {
      const idx = this.standings.indexOf(p);
      if (idx > 0) {
        const a = this.standings[idx - 1];
        ahead = { name: a.name, gap: a.score - p.score };
      }
    }

    return {
      pin: this.pin,
      title: this.quiz.title,
      phase: this.phase,
      questionIndex: this.questionIndex,
      totalQuestions: this.quiz.questions.length,
      playerCount: this.players.size,
      me: { id: p.id, name: p.name, score: p.score, rank: p.rank, streak: p.streak },
      question: this.showsQuestion ? this.publicQuestion(this.revealsAnswers) : null,
      timing: this.timing(),
      answered: Boolean(answer),
      myAnswer: answer ? answer.answerIndex : null,
      result: this.revealsAnswers ? p.lastResult : null,
      ahead,
    };
  }
}
