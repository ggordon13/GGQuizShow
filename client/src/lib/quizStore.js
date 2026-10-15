import { LIMITS } from './constants.js';
import { downloadFile, loadJSON, saveJSON } from './hooks.js';
import { getImage, putImage } from './imageStore.js';
import { SAMPLE_QUIZZES } from './sampleQuizzes.js';

const KEY = 'ggquiz.quizzes';

export const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function blankQuestion() {
  return {
    id: newId(),
    text: '',
    timeLimit: 20,
    points: 1,
    imageId: null, // key into imageStore
    answers: [0, 1, 2, 3].map(() => ({ text: '', correct: false })),
  };
}

export function blankQuiz() {
  return { id: newId(), title: '', questions: [blankQuestion()], updatedAt: Date.now() };
}

/** Normalises imported/stored data into the editor's shape (always 4 answer slots). */
export function normalizeQuiz(raw) {
  const questions = (Array.isArray(raw?.questions) ? raw.questions : []).map((q) => {
    const answers = (Array.isArray(q?.answers) ? q.answers : []).slice(0, 4).map((a) => ({
      text: String(a?.text ?? a ?? ''),
      correct: a?.correct === true,
    }));
    while (answers.length < 4) answers.push({ text: '', correct: false });
    return {
      id: q?.id ?? newId(),
      text: String(q?.text ?? ''),
      timeLimit: Number(q?.timeLimit) || 20,
      points: [0, 1, 2].includes(q?.points) ? q.points : 1,
      imageId: typeof q?.imageId === 'string' ? q.imageId : null,
      answers,
    };
  });
  return {
    id: raw?.id ?? newId(),
    title: String(raw?.title ?? ''),
    questions: questions.length ? questions : [blankQuestion()],
    updatedAt: raw?.updatedAt ?? Date.now(),
  };
}

export function loadQuizzes() {
  const stored = loadJSON(localStorage, KEY);
  if (Array.isArray(stored)) return stored.map(normalizeQuiz);
  const seeded = SAMPLE_QUIZZES.map(normalizeQuiz);
  saveQuizzes(seeded);
  return seeded;
}

export function saveQuizzes(quizzes) {
  saveJSON(localStorage, KEY, quizzes);
}

/** Returns a list of human-readable problems; empty means the quiz can be hosted. */
export function validateQuiz(quiz) {
  const issues = [];
  if (!quiz.questions.length) issues.push('Add at least one question.');
  if (quiz.questions.length > LIMITS.questions) issues.push(`Keep it to ${LIMITS.questions} questions or fewer.`);
  quiz.questions.forEach((q, i) => {
    const n = i + 1;
    const filled = q.answers.filter((a) => a.text.trim());
    if (!q.text.trim()) issues.push(`Question ${n} has no question text.`);
    if (filled.length < 2) issues.push(`Question ${n} needs at least 2 answers.`);
    if (!filled.some((a) => a.correct)) issues.push(`Question ${n} needs a correct answer.`);
    if (q.answers.some((a) => a.correct && !a.text.trim())) issues.push(`Question ${n} marks an empty answer as correct.`);
  });
  return issues;
}

/**
 * The payload the server expects: empty answers removed, images inlined as
 * data URLs. `missingImages` lists question numbers whose image was lost.
 */
export async function toServerQuiz(quiz) {
  const missingImages = [];
  const questions = await Promise.all(
    quiz.questions.map(async (q, i) => {
      const image = await getImage(q.imageId);
      if (q.imageId && !image) missingImages.push(i + 1);
      return {
        text: q.text,
        timeLimit: q.timeLimit,
        points: q.points,
        image,
        answers: q.answers.filter((a) => a.text.trim()),
      };
    }),
  );
  return { quiz: { title: quiz.title.trim() || 'Untitled quiz', questions }, missingImages };
}

/** Downloads a quiz as JSON, images included, so it can be imported on another computer. */
export async function exportQuiz(quiz) {
  const { quiz: data } = await toServerQuiz(quiz);
  const filename = `${(quiz.title || 'quiz').replace(/[^\w-]+/g, '-').toLowerCase()}.json`;
  downloadFile(JSON.stringify(data, null, 2), filename, 'application/json');
}

/** Turns exported JSON back into a library quiz, moving embedded images into the image store. */
export async function importQuiz(raw) {
  const quiz = normalizeQuiz({ ...raw, id: newId(), updatedAt: Date.now() });
  await Promise.all(
    quiz.questions.map(async (q, i) => {
      const image = raw?.questions?.[i]?.image;
      q.imageId = null;
      if (typeof image === 'string' && image.startsWith('data:image/')) {
        q.imageId = newId();
        await putImage(q.imageId, image);
      }
    }),
  );
  return quiz;
}
