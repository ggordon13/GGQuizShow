/**
 * Kahoot-style scoring.
 *
 * A correct answer is worth up to MAX_POINTS. Points fall linearly with response
 * time, down to half of MAX_POINTS at the buzzer:
 *
 *   points = round(MAX_POINTS * (1 - (responseTime / timeLimit) / 2) * multiplier)
 *
 * Wrong or missing answers score 0. Consecutive correct answers also earn a
 * streak bonus that grows by STREAK_BONUS_STEP per answer, up to STREAK_BONUS_MAX.
 */
export const MAX_POINTS = 1000;
export const STREAK_BONUS_STEP = 100;
export const STREAK_BONUS_MAX = 500;

export function calculatePoints({ correct, responseMs, timeLimitMs, multiplier = 1 }) {
  if (!correct || multiplier <= 0 || timeLimitMs <= 0) return 0;
  const ratio = Math.min(Math.max(responseMs / timeLimitMs, 0), 1);
  return Math.round(MAX_POINTS * (1 - ratio / 2) * multiplier);
}

/** Bonus for the `streak`-th correct answer in a row (no bonus for the first). */
export function streakBonus(streak) {
  if (streak < 2) return 0;
  return Math.min((streak - 1) * STREAK_BONUS_STEP, STREAK_BONUS_MAX);
}
