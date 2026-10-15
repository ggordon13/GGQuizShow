import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculatePoints, streakBonus } from '../src/scoring.js';

const base = { correct: true, timeLimitMs: 20_000 };

test('an instant correct answer is worth 1000 points', () => {
  assert.equal(calculatePoints({ ...base, responseMs: 0 }), 1000);
});

test('points fall linearly to 500 at the buzzer', () => {
  assert.equal(calculatePoints({ ...base, responseMs: 10_000 }), 750);
  assert.equal(calculatePoints({ ...base, responseMs: 20_000 }), 500);
  assert.equal(calculatePoints({ ...base, responseMs: 99_000 }), 500, 'late answers are clamped');
});

test('faster answers always score more', () => {
  const fast = calculatePoints({ ...base, responseMs: 1_200 });
  const slow = calculatePoints({ ...base, responseMs: 1_900 });
  assert.ok(fast > slow);
});

test('wrong answers and no-points questions score 0', () => {
  assert.equal(calculatePoints({ ...base, correct: false, responseMs: 0 }), 0);
  assert.equal(calculatePoints({ ...base, responseMs: 0, multiplier: 0 }), 0);
});

test('double points doubles the score', () => {
  assert.equal(calculatePoints({ ...base, responseMs: 10_000, multiplier: 2 }), 1500);
});

test('streak bonus grows and caps', () => {
  assert.deepEqual([1, 2, 3, 6, 10].map(streakBonus), [0, 100, 200, 500, 500]);
});
