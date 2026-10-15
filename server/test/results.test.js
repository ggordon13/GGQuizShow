import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { Game } from '../src/game.js';
import { sanitizeQuiz } from '../src/quiz.js';
import { buildResults, resultsToCsv, saveResults } from '../src/results.js';

const quiz = sanitizeQuiz({
  title: 'Results quiz',
  questions: [
    { text: 'Q one', timeLimit: 10, answers: [{ text: 'a', correct: true }, { text: 'b' }] },
    { text: 'Q two', timeLimit: 10, answers: [{ text: 'a' }, { text: 'b', correct: true }] },
    { text: 'Q three', timeLimit: 10, answers: [{ text: 'a', correct: true }, { text: 'b' }] },
  ],
});

let game;
let clock;
afterEach(() => game?.destroy());

function setup() {
  clock = Date.UTC(2026, 9, 15, 18, 30, 0);
  game = new Game({ pin: '424242', quiz, now: () => clock });
  return game;
}

/** Plays the current question: `picks` maps player -> answer index (or undefined to skip). */
function playQuestion(picks) {
  game.next(); // intro -> question
  clock += 1000;
  for (const [player, answer] of picks) if (answer !== undefined) game.submitAnswer(player.id, answer);
  game.endQuestion();
}

test('results list every player with per-question points', () => {
  setup();
  const ada = game.addPlayer('Ada');
  const bob = game.addPlayer('Bob');
  game.start();
  playQuestion([[ada, 0], [bob, 1]]); // Ada right, Bob wrong
  game.next(); // leaderboard
  game.next(); // intro q2
  playQuestion([[ada, 1], [bob, undefined]]); // Ada right again, Bob no answer

  const results = buildResults(game, { completed: false });
  assert.equal(results.questions.length, 2, 'only scored questions are included');
  assert.equal(results.completed, false);
  assert.deepEqual(results.players.map((p) => [p.name, p.rank, p.correctCount]), [['Ada', 1, 2], ['Bob', 2, 0]]);
  assert.equal(results.players[0].answers[1].points, 950 + 100, 'streak bonus is included');
  assert.equal(results.players[1].answers[0].points, 0);
  assert.equal(results.players[1].answers[1], null);
  assert.deepEqual(results.questions.map((q) => [q.answeredCount, q.correctCount]), [[2, 1], [1, 1]]);
});

test('late joiners have blank answers for questions they missed', () => {
  setup();
  const ada = game.addPlayer('Ada');
  game.start();
  playQuestion([[ada, 0]]);
  const late = game.addPlayer('Late');
  game.next();
  game.next();
  playQuestion([[ada, 1], [late, 1]]);
  const row = buildResults(game, { completed: false }).players.find((p) => p.name === 'Late');
  assert.equal(row.answers[0], null);
  assert.equal(row.answers[1].correct, true);
});

test('CSV escapes commas, quotes and formula-like nicknames', () => {
  setup();
  const a = game.addPlayer('=HYPERLINK("x")');
  const b = game.addPlayer('Smith, "Jo"');
  game.start();
  playQuestion([[a, 0], [b, 1]]);
  const csv = resultsToCsv(buildResults(game, { completed: false }));
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines[0], 'Rank,Nickname,Score,Correct,Avg answer time (s),Q1: Q one');
  assert.equal(lines[1], `1,"'=HYPERLINK(""x"")",950,1/1,1.00,950`);
  assert.equal(lines[2], '2,"Smith, ""Jo""",0,0/1,1.00,0');
});

test('saveResults writes JSON and CSV files', async () => {
  setup();
  const ada = game.addPlayer('Ada');
  game.start();
  playQuestion([[ada, 0]]);
  const dir = await mkdtemp(path.join(tmpdir(), 'ggquiz-'));
  try {
    const file = await saveResults(buildResults(game, { completed: true }), dir);
    const files = (await readdir(dir)).sort();
    assert.equal(files.length, 2);
    assert.match(files[0], /^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-results-quiz-424242\.csv$/);
    assert.equal(files[1], files[0].replace(/csv$/, 'json'));
    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.players[0].name, 'Ada');
    assert.equal(saved.completed, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
