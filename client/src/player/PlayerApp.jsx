import { useEffect, useRef, useState } from 'react';
import { Spinner } from '../components/ui.jsx';
import { loadJSON, saveJSON } from '../lib/hooks.js';
import { request, useOnConnect, useSocketEvent } from '../lib/socket.js';
import { toast } from '../lib/toast.js';
import {
  AnswerPad,
  Ended,
  NicknameForm,
  PlayerFinal,
  PlayerHeader,
  PlayerIntro,
  PlayerLobby,
  PlayerResult,
  PlayerStanding,
  Waiting,
} from './screens.jsx';

export const PLAYER_SESSION_KEY = 'ggquiz.player';

const ENERGY = { lobby: 0.25, intro: 0.55, question: 0.9, reveal: 0.4, leaderboard: 0.35, podium: 0.85 };

export default function PlayerApp({ pin, onExit, setEnergy }) {
  const [session, setSession] = useState(() => {
    const saved = loadJSON(localStorage, PLAYER_SESSION_KEY);
    return saved?.pin === pin ? saved : null;
  });
  const [state, setState] = useState(null);
  const [ended, setEnded] = useState(null);
  // Answer tapped for the current question, shown instantly before the server confirms.
  const [pending, setPending] = useState(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const forget = () => {
    saveJSON(localStorage, PLAYER_SESSION_KEY, null);
    setSession(null);
  };

  useSocketEvent('player:state', (next) => next && setState(next));
  useSocketEvent('player:kicked', () => {
    forget();
    setEnded({ title: 'You were removed', body: 'The host removed you from this game.' });
  });
  useSocketEvent('game:ended', ({ reason } = {}) => {
    saveJSON(localStorage, PLAYER_SESSION_KEY, null);
    // Keep the final results on screen if the game finished normally.
    if (stateRef.current?.phase !== 'podium') setEnded({ title: 'Game over', body: reason });
  });

  // Rejoin after a refresh or a dropped connection.
  useOnConnect(() => {
    if (!session?.playerId) return;
    request('player:join', { pin, playerId: session.playerId }).then((res) => {
      if (res.ok) setState(res.state);
      else if (res.code === 'NOT_FOUND') {
        forget();
        setEnded({ title: 'Game not found', body: 'This game has ended or the PIN is wrong.' });
      } else if (res.code === 'NOT_IN_GAME') {
        forget();
        setState(null);
      }
    });
  }, [pin, session?.playerId]);

  useEffect(() => setEnergy(ENERGY[state?.phase] ?? 0.3), [state?.phase, setEnergy]);
  useEffect(() => setPending(null), [state?.questionIndex]);

  function joined(res, name) {
    const next = { pin, playerId: res.playerId, name };
    saveJSON(localStorage, PLAYER_SESSION_KEY, next);
    setSession(next);
    setState(res.state);
  }

  async function answer(answerIndex) {
    setPending(answerIndex);
    const res = await request('player:answer', { questionIndex: state.questionIndex, answerIndex });
    if (!res.ok && res.code !== 'ALREADY_ANSWERED') {
      setPending(null);
      toast(res.error);
    }
  }

  async function leave() {
    if (!window.confirm('Leave this game? Your score will be lost.')) return;
    await request('player:leave');
    forget();
    onExit();
  }

  if (ended) return <Ended {...ended} onExit={onExit} />;
  if (!session) return <NicknameForm pin={pin} onJoined={joined} onBack={onExit} />;
  if (!state) return <Spinner label="Joining game…" />;

  const answered = state.answered || pending !== null;
  let screen;
  switch (state.phase) {
    case 'lobby':
      screen = <PlayerLobby state={state} />;
      break;
    case 'intro':
      screen = <PlayerIntro state={state} />;
      break;
    case 'question':
      screen = answered ? (
        <Waiting answerIndex={state.myAnswer ?? pending} />
      ) : (
        <AnswerPad state={state} onAnswer={answer} />
      );
      break;
    case 'reveal':
      screen = <PlayerResult state={state} />;
      break;
    case 'leaderboard':
      screen = <PlayerStanding state={state} />;
      break;
    case 'podium':
      screen = <PlayerFinal state={state} onExit={() => { forget(); onExit(); }} />;
      break;
    default:
      screen = <Spinner />;
  }

  return (
    <div className="player">
      <PlayerHeader state={state} onLeave={state.phase === 'podium' ? null : leave} />
      <div className="player-body" key={`${state.phase}-${state.questionIndex}`}>
        {screen}
      </div>
    </div>
  );
}
