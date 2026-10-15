import { GameError } from './errors.js';

export const QUIZ_LIMITS = Object.freeze({
  title: 120,
  questionText: 300,
  answerText: 100,
  questions: 100,
  minAnswers: 2,
  maxAnswers: 4,
  minTime: 5,
  maxTime: 240,
});

/** 0 = no points, 1 = standard, 2 = double points. */
const POINT_MULTIPLIERS = [0, 1, 2];

const cleanText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Validates quiz JSON sent by a host and returns a trusted copy. Throws GameError('BAD_QUIZ'). */
export function sanitizeQuiz(input) {
  const bad = (message) => new GameError('BAD_QUIZ', message);

  if (!input || typeof input !== 'object') throw bad('Quiz data is missing');
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    throw bad('Add at least one question');
  }
  if (input.questions.length > QUIZ_LIMITS.questions) {
    throw bad(`A quiz can have at most ${QUIZ_LIMITS.questions} questions`);
  }

  const questions = input.questions.map((q, i) => {
    const label = `Question ${i + 1}`;
    const text = cleanText(q?.text, QUIZ_LIMITS.questionText);
    if (!text) throw bad(`${label} needs question text`);

    const answers = (Array.isArray(q.answers) ? q.answers : [])
      .slice(0, QUIZ_LIMITS.maxAnswers)
      .map((a) => ({ text: cleanText(a?.text, QUIZ_LIMITS.answerText), correct: a?.correct === true }))
      .filter((a) => a.text);
    if (answers.length < QUIZ_LIMITS.minAnswers) throw bad(`${label} needs at least 2 answers`);
    if (!answers.some((a) => a.correct)) throw bad(`${label} needs a correct answer`);

    const seconds = Math.round(Number(q.timeLimit));
    const timeLimit = Number.isFinite(seconds)
      ? Math.min(Math.max(seconds, QUIZ_LIMITS.minTime), QUIZ_LIMITS.maxTime)
      : 20;
    const points = POINT_MULTIPLIERS.includes(q.points) ? q.points : 1;

    return { text, answers, timeLimit, points };
  });

  return { title: cleanText(input.title, QUIZ_LIMITS.title) || 'Untitled quiz', questions };
}
