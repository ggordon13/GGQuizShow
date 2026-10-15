import { useEffect, useState } from 'react';
import { Spinner } from '../components/ui.jsx';
import { downloadFile, loadJSON, saveJSON } from '../lib/hooks.js';
import { loadQuizzes, saveQuizzes, toServerQuiz, validateQuiz } from '../lib/quizStore.js';
import { request, useOnConnect, useSocketEvent } from '../lib/socket.js';
import { toast } from '../lib/toast.js';
import HostGame from './HostGame.jsx';
import QuizEditor from './QuizEditor.jsx';
import QuizLibrary from './QuizLibrary.jsx';

const HOST_SESSION_KEY = 'ggquiz.host';
const ENERGY = { lobby: 0.3, intro: 0.55, question: 0.9, reveal: 0.45, leaderboard: 0.4, podium: 1 };

export default function HostApp({ onExit, setEnergy }) {
  const [quizzes, setQuizzes] = useState(loadQuizzes);
  const [editingId, setEditingId] = useState(null);
  const [session, setSession] = useState(() => loadJSON(localStorage, HOST_SESSION_KEY));
  const [game, setGame] = useState(null);
  const [creating, setCreating] = useState(false);

  const closeSession = () => {
    saveJSON(localStorage, HOST_SESSION_KEY, null);
    setSession(null);
    setGame(null);
  };

  useSocketEvent('host:state', setGame);
  useSocketEvent('host:answers', (counts) => setGame((g) => g && { ...g, ...counts }));
  useSocketEvent('game:ended', ({ reason } = {}) => {
    if (game && game.phase !== 'podium' && reason) toast(reason, 'info');
    closeSession();
  });

  // Reattach to a running game after a refresh or reconnect.
  useOnConnect(() => {
    if (!session) return;
    request('host:rejoin', session).then((res) => {
      if (res.ok) setGame(res.state);
      else {
        closeSession();
        if (res.code === 'NOT_FOUND') toast('Your previous game has ended', 'info');
      }
    });
  }, [session?.pin]);

  useEffect(() => setEnergy(game ? (ENERGY[game.phase] ?? 0.3) : 0.2), [game?.phase, game, setEnergy]);

  function updateQuizzes(fn) {
    setQuizzes((list) => {
      const next = fn(list);
      saveQuizzes(next);
      return next;
    });
  }

  function saveQuiz(quiz) {
    updateQuizzes((list) =>
      list.some((q) => q.id === quiz.id) ? list.map((q) => (q.id === quiz.id ? quiz : q)) : [quiz, ...list],
    );
  }

  async function hostQuiz(quiz) {
    const issues = validateQuiz(quiz);
    if (issues.length) {
      toast(issues[0]);
      setEditingId(quiz.id);
      return;
    }
    setCreating(true);
    const { quiz: payload, missingImages } = await toServerQuiz(quiz);
    if (missingImages.length) toast(`Image missing for question ${missingImages.join(', ')}; hosting without it`, 'info');
    // Images make this upload bigger, so allow longer than the usual timeout.
    const res = await request('host:create', { quiz: payload }, 60_000);
    setCreating(false);
    if (!res.ok) {
      toast(res.error);
      return;
    }
    const next = { pin: res.pin, hostToken: res.hostToken };
    saveJSON(localStorage, HOST_SESSION_KEY, next);
    setSession(next);
    setGame(res.state);
    setEditingId(null);
  }

  async function action(name, extra = {}) {
    const res = await request('host:action', { action: name, ...extra });
    if (!res.ok) toast(res.error);
    return res;
  }

  async function downloadResults() {
    const res = await request('host:results');
    if (!res.ok) {
      toast(res.error);
      return;
    }
    downloadFile(res.csv, res.filename, 'text/csv;charset=utf-8');
  }

  async function endGame() {
    const message = game?.hasResults
      ? 'End this game for everyone? Results so far will be saved on the server.'
      : 'End this game for everyone?';
    if (game?.phase !== 'podium' && !window.confirm(message)) return;
    await action('end');
    closeSession();
  }

  if (session) {
    if (!game) return <Spinner label="Reconnecting to your game…" />;
    return <HostGame game={game} onAction={action} onEnd={endGame} onDownload={downloadResults} />;
  }
  if (creating) return <Spinner label="Creating game…" />;

  const editing = quizzes.find((q) => q.id === editingId);
  if (editingId) {
    return (
      <QuizEditor
        key={editingId}
        quiz={editing}
        onSave={saveQuiz}
        onBack={() => setEditingId(null)}
        onHost={(quiz) => {
          saveQuiz(quiz);
          hostQuiz(quiz);
        }}
      />
    );
  }

  return (
    <QuizLibrary
      quizzes={quizzes}
      onHome={onExit}
      onCreate={(quiz) => {
        saveQuiz(quiz);
        setEditingId(quiz.id);
      }}
      onEdit={setEditingId}
      onHost={hostQuiz}
      onUpdate={updateQuizzes}
    />
  );
}
