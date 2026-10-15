import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * A snapshot of a game's results: every scored question, and every player's
 * final rank, score and individual answers. Only questions that were scored
 * are included, so a game ended early still produces consistent results.
 */
export function buildResults(game, { completed }) {
  const count = game.scoredCount;
  const finishedAt = game.finishedAt || game.now();
  const players = game.standings;

  const questions = game.quiz.questions.slice(0, count).map((q, i) => {
    const results = players.map((p) => p.history[i]).filter(Boolean);
    return {
      number: i + 1,
      text: q.text,
      timeLimit: q.timeLimit,
      points: q.points,
      answers: q.answers.map((a) => ({ text: a.text, correct: a.correct })),
      answeredCount: results.filter((r) => r.answered).length,
      correctCount: results.filter((r) => r.correct).length,
    };
  });

  return {
    id: `${stamp(finishedAt)}-${game.pin}`,
    title: game.quiz.title,
    pin: game.pin,
    completed,
    startedAt: new Date(game.startedAt || finishedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    totalQuestions: game.quiz.questions.length,
    playerCount: players.length,
    questions,
    players: players.map((p) => {
      const answers = Array.from({ length: count }, (_, i) => p.history[i] ?? null);
      const times = answers.filter((a) => a?.answered).map((a) => a.responseMs);
      return {
        rank: p.rank,
        name: p.name,
        score: p.score,
        correctCount: answers.filter((a) => a?.correct).length,
        avgResponseMs: times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : null,
        answers: answers.map((a) =>
          a?.answered
            ? { answerIndex: a.answerIndex, correct: a.correct, points: a.points + a.bonus, responseMs: a.responseMs }
            : null,
        ),
      };
    }),
  };
}

/**
 * One row per player. Per-question columns hold the points earned:
 * 0 means answered wrong, blank means no answer.
 */
export function resultsToCsv(results) {
  const header = [
    'Rank',
    'Nickname',
    'Score',
    'Correct',
    'Avg answer time (s)',
    ...results.questions.map((q) => `Q${q.number}: ${truncate(q.text, 40)}`),
  ];
  const rows = results.players.map((p) => [
    p.rank,
    p.name,
    p.score,
    `${p.correctCount}/${results.questions.length}`,
    p.avgResponseMs == null ? '' : (p.avgResponseMs / 1000).toFixed(2),
    ...p.answers.map((a) => (a ? a.points : '')),
  ]);
  // The BOM makes Excel read the file as UTF-8, so emoji and accents in nicknames survive.
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function resultsFilename(results, ext) {
  const slug = results.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'quiz';
  return `${results.id.slice(0, 19)}-${slug}-${results.pin}.${ext}`;
}

/** Writes results as JSON and CSV. Returns the JSON file path. */
export async function saveResults(results, dir) {
  await mkdir(dir, { recursive: true });
  const jsonPath = path.join(dir, resultsFilename(results, 'json'));
  await writeFile(jsonPath, JSON.stringify(results, null, 2));
  await writeFile(path.join(dir, resultsFilename(results, 'csv')), resultsToCsv(results));
  return jsonPath;
}

function csvCell(value) {
  let s = String(value ?? '');
  // Nicknames are user input: stop spreadsheets from running them as formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Local time as 2026-10-15T18-30-05, so file names match the clock in the room. */
function stamp(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
