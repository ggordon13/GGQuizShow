import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { Game, PHASE } from '../src/game.js';
import { sanitizeQuiz } from '../src/quiz.js';

const quiz = sanitizeQuiz({
  title: 'Test quiz',
  questions: [
    {
      text: '2 + 2?',
      timeLimit: 20,
      answers: [
        { text: '3' },
        { text: '4', correct: true },
        { text: '5' },
        { text: '22' },
      ],
    },
    { text: 'Sky is blue?', timeLimit: 10, answers: [{ text: 'True', correct: true }, { text: 'False' }] },
  ],
});

let games = [];
let clock = 0;

function makeGame(opts = {}) {
  clock = 1_000_000;
  const game = new Game({ pin: '123456', quiz, now: () => clock, introMs: 5000, ...opts });
  games.push(game);
  return game;
}

/** Puts a game into the answering phase of question 1. */
function startAnswering(game) {
  game.start();
  assert.equal(game.phase, PHASE.INTRO);
  game.next();
  assert.equal(game.phase, PHASE.QUESTION);
}

afterEach(() => {
  games.forEach((g) => g.destroy());
  games = [];
});

test('faster correct answers earn more points; wrong answers earn none', () => {
  const game = makeGame();
  const fast = game.addPlayer('Fast');
  const slow = game.addPlayer('Slow');
  const wrong = game.addPlayer('Wrong');
  startAnswering(game);

  clock += 2_000;
  game.submitAnswer(fast.id, 1);
  clock += 8_000;
  game.submitAnswer(slow.id, 1);
  game.submitAnswer(wrong.id, 0); // last answer ends the question

  assert.equal(game.phase, PHASE.REVEAL);
  assert.equal(fast.score, 950);
  assert.equal(slow.score, 750);
  assert.equal(wrong.score, 0);
  assert.deepEqual(game.distribution, [1, 2, 0, 0]);
  assert.deepEqual(
    game.standings.map((p) => [p.name, p.rank]),
    [['Fast', 1], ['Slow', 2], ['Wrong', 3]],
  );
});

test('streaks add a bonus and reset on a miss', () => {
  const game = makeGame();
  const p = game.addPlayer('Streaky');
  startAnswering(game);
  game.submitAnswer(p.id, 1); // instant correct: 1000
  game.next(); // reveal -> leaderboard
  game.next(); // -> intro q2
  game.next(); // -> question q2
  game.submitAnswer(p.id, 0); // instant correct: 1000 + 100 streak bonus
  assert.equal(p.score, 2100);
  assert.equal(p.lastResult.bonus, 100);
  assert.equal(p.streak, 2);
});

test('the question waits for connected players only', () => {
  const game = makeGame();
  const a = game.addPlayer('A');
  const b = game.addPlayer('B');
  startAnswering(game);
  game.submitAnswer(a.id, 1);
  assert.equal(game.phase, PHASE.QUESTION);
  game.setConnected(b.id, false);
  assert.equal(game.phase, PHASE.REVEAL, 'B dropping out means everyone left has answered');
});

test('rejects duplicate, invalid and late answers', () => {
  const game = makeGame();
  const a = game.addPlayer('A');
  game.addPlayer('B');
  assert.throws(() => game.submitAnswer(a.id, 1), { code: 'NOT_ACCEPTING' });
  startAnswering(game);
  assert.throws(() => game.submitAnswer(a.id, 7), { code: 'BAD_ANSWER' });
  assert.throws(() => game.submitAnswer(a.id, 1, 5), { code: 'STALE' });
  game.submitAnswer(a.id, 1);
  assert.throws(() => game.submitAnswer(a.id, 2), { code: 'ALREADY_ANSWERED' });
});

test('nicknames are trimmed and unique; the game caps player count', () => {
  const game = makeGame({ maxPlayers: 2 });
  assert.equal(game.addPlayer('  Ada   Lovelace ').name, 'Ada Lovelace');
  assert.throws(() => game.addPlayer('ada lovelace'), { code: 'NAME_TAKEN' });
  assert.throws(() => game.addPlayer('   '), { code: 'BAD_NAME' });
  game.addPlayer('Grace');
  assert.throws(() => game.addPlayer('Linus'), { code: 'FULL' });
});

test('locked games refuse new players', () => {
  const game = makeGame();
  game.setLocked(true);
  assert.throws(() => game.addPlayer('Late'), { code: 'LOCKED' });
});

test('tied scores share a rank', () => {
  const game = makeGame();
  const a = game.addPlayer('A');
  const b = game.addPlayer('B');
  const c = game.addPlayer('C');
  startAnswering(game);
  game.submitAnswer(a.id, 1);
  game.submitAnswer(b.id, 1);
  game.submitAnswer(c.id, 0);
  assert.deepEqual([a.rank, b.rank, c.rank], [1, 1, 3]);
});

test('the last reveal goes to the podium', () => {
  const game = makeGame();
  const a = game.addPlayer('A');
  startAnswering(game);
  game.submitAnswer(a.id, 1);
  game.next(); // leaderboard
  game.next(); // intro q2
  game.next(); // question q2
  game.next(); // host skips -> reveal
  assert.equal(game.phase, PHASE.REVEAL);
  game.next();
  assert.equal(game.phase, PHASE.PODIUM);
  assert.throws(() => game.next(), { code: 'BAD_PHASE' });
});

test('the timer ends the question automatically', async () => {
  const game = makeGame({ introMs: 10, now: Date.now });
  const shortQuiz = sanitizeQuiz({
    questions: [{ text: 'Quick', timeLimit: 5, answers: [{ text: 'a', correct: true }, { text: 'b' }] }],
  });
  game.quiz = shortQuiz;
  game.quiz.questions[0].timeLimit = 0.05; // 50ms, below the editor minimum, for test speed
  game.addPlayer('A');
  game.start();
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(game.phase, PHASE.REVEAL);
});

test('players never see correct answers before the reveal', () => {
  const game = makeGame();
  const a = game.addPlayer('A');
  startAnswering(game);
  const view = game.playerView(a.id);
  assert.ok(view.question.answers.every((ans) => !('correct' in ans)));
  assert.ok(game.hostView().question.answers.every((ans) => !('correct' in ans)));
});

// 1x1 transparent PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('question images are validated and only served once their question starts', () => {
  const withImages = sanitizeQuiz({
    questions: [
      { text: 'One', image: PNG, answers: [{ text: 'a', correct: true }, { text: 'b' }] },
      { text: 'Two', image: PNG, answers: [{ text: 'a', correct: true }, { text: 'b' }] },
    ],
  });
  assert.equal(withImages.questions[0].image.mime, 'image/png');
  const game = new Game({ pin: '111111', quiz: withImages });
  games.push(game);
  const a = game.addPlayer('A');
  assert.equal(game.imageFor(0), null, 'not before the game starts');
  game.start();
  assert.ok(game.imageFor(0));
  assert.equal(game.imageFor(1), null, 'no peeking at the next question');
  assert.match(game.playerView(a.id).question.image, /^\/api\/media\/111111\/0\?v=[0-9a-f]{12}$/);
});

test('unsafe or oversized images are rejected', () => {
  const q = (image) => ({ questions: [{ text: 'x', image, answers: [{ text: 'a', correct: true }, { text: 'b' }] }] });
  assert.throws(() => sanitizeQuiz(q('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')), /unsupported image/);
  assert.throws(() => sanitizeQuiz(q('https://example.com/cat.png')), /unsupported image/);
  const huge = `data:image/jpeg;base64,${Buffer.alloc(1_600_000).toString('base64')}`;
  assert.throws(() => sanitizeQuiz(q(huge)), /too large/);
  assert.equal(sanitizeQuiz(q(null)).questions[0].image, null);
});

test('quiz validation rejects broken quizzes', () => {
  assert.throws(() => sanitizeQuiz({ questions: [] }), { code: 'BAD_QUIZ' });
  assert.throws(
    () => sanitizeQuiz({ questions: [{ text: 'No correct', answers: [{ text: 'a' }, { text: 'b' }] }] }),
    /needs a correct answer/,
  );
  const q = sanitizeQuiz({
    questions: [{ text: 'x', timeLimit: 9999, points: 7, answers: [{ text: 'a', correct: true }, { text: '' }, { text: 'b' }] }],
  });
  assert.equal(q.questions[0].timeLimit, 240);
  assert.equal(q.questions[0].points, 1);
  assert.equal(q.questions[0].answers.length, 2);
});
