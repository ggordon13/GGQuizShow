import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { answerStyle, CountUp, Logo, QuestionImage, Shape, TimerRing } from '../components/ui.jsx';
import { LIMITS } from '../lib/constants.js';
import { ordinal, useCountdown } from '../lib/hooks.js';
import { request } from '../lib/socket.js';
import Confetti3D from '../three/Confetti3D.jsx';

/** Common entrance: children with .pop / .rise classes animate in. */
function useEntrance(scope, deps = []) {
  useGSAP(
    () => {
      gsap.from('.pop', { scale: 0, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'back.out(2)' });
      gsap.from('.rise', { y: 30, opacity: 0, duration: 0.6, stagger: 0.1, delay: 0.15, ease: 'power3.out' });
    },
    { scope, dependencies: deps },
  );
}

export function NicknameForm({ pin, onJoined, onBack }) {
  const root = useRef(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEntrance(root);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Pick a nickname');
      return;
    }
    setBusy(true);
    const res = await request('player:join', { pin, name });
    setBusy(false);
    if (res.ok) onJoined(res, name.trim());
    else setError(res.error);
  }

  return (
    <section ref={root} className="screen-center">
      <Logo size="md" />
      <form className="card join-card rise" onSubmit={submit} noValidate>
        <p className="muted center">Game PIN {pin}</p>
        <label htmlFor="nickname" className="sr-only">
          Nickname
        </label>
        <input
          id="nickname"
          className="big-input"
          placeholder="Nickname"
          autoComplete="nickname"
          maxLength={LIMITS.nickname}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          autoFocus
        />
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Joining…' : 'OK, go!'}
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <button type="button" className="link-button rise" onClick={onBack}>
        ← Use a different PIN
      </button>
    </section>
  );
}

export function PlayerHeader({ state, onLeave }) {
  return (
    <header className="player-header">
      <span className="player-name">{state.me.name}</span>
      {state.questionIndex >= 0 && (
        <span className="muted small">
          {Math.min(state.questionIndex + 1, state.totalQuestions)} / {state.totalQuestions}
        </span>
      )}
      <span className="score-chip">{state.me.score.toLocaleString()}</span>
      {onLeave && (
        <button type="button" className="icon-button" onClick={onLeave} aria-label="Leave game" title="Leave game">
          ✕
        </button>
      )}
    </header>
  );
}

export function PlayerLobby({ state }) {
  const root = useRef(null);
  useEntrance(root);
  useGSAP(
    () => {
      gsap.to('.lobby-shapes .shape-tile', {
        y: -14,
        rotate: 12,
        duration: 0.7,
        ease: 'sine.inOut',
        stagger: { each: 0.15, repeat: -1, yoyo: true },
      });
    },
    { scope: root },
  );
  return (
    <section ref={root} className="screen-center">
      <h2 className="headline pop">You're in!</h2>
      <p className="lead rise">See your nickname on the big screen?</p>
      <div className="lobby-shapes rise">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="shape-tile" style={{ background: answerStyle(i).color }}>
            <Shape shape={answerStyle(i).shape} size={28} />
          </span>
        ))}
      </div>
      <p className="muted rise">Waiting for the host to start…</p>
    </section>
  );
}

export function PlayerIntro({ state }) {
  const root = useRef(null);
  const barRef = useRef(null);
  useEntrance(root);
  useGSAP(
    () => {
      if (!state.timing) return;
      gsap.fromTo(
        barRef.current,
        { scaleX: state.timing.remainingMs / state.timing.durationMs },
        { scaleX: 0, duration: state.timing.remainingMs / 1000, ease: 'none' },
      );
    },
    { scope: root },
  );
  return (
    <section ref={root} className="screen-center">
      <p className="eyebrow pop">
        Question {state.questionIndex + 1} of {state.totalQuestions}
      </p>
      <h2 className="question-text rise">{state.question.text}</h2>
      {state.question.image && (
        <div className="rise">
          <QuestionImage src={state.question.image} className="player-intro-image" />
        </div>
      )}
      {state.question.points === 2 && <p className="badge badge-gold pop">Double points!</p>}
      {state.question.points === 0 && <p className="badge pop">Practice: no points</p>}
      <div className="progress rise">
        <div ref={barRef} className="progress-fill" />
      </div>
      <p className="muted rise">Get ready…</p>
    </section>
  );
}

export function AnswerPad({ state, onAnswer }) {
  const root = useRef(null);
  const { seconds, fraction } = useCountdown(state.timing);
  const { contextSafe } = useGSAP(
    () => {
      gsap.from('.answer-btn', { scale: 0.4, opacity: 0, duration: 0.45, stagger: 0.06, ease: 'back.out(1.8)' });
    },
    { scope: root },
  );
  const choose = contextSafe((index, el) => {
    navigator.vibrate?.(20);
    gsap.to(el, { scale: 0.92, duration: 0.08, yoyo: true, repeat: 1 });
    onAnswer(index);
  });
  const { answers } = state.question;
  return (
    <section ref={root} className="answer-screen">
      <div className="answer-top">
        <p className="answer-question">{state.question.text}</p>
        <TimerRing seconds={seconds} fraction={fraction} size={56} />
      </div>
      {state.question.image && (
        <div className="answer-image">
          <QuestionImage src={state.question.image} zoomable />
        </div>
      )}
      <div className={`answer-grid count-${answers.length} ${state.question.image ? 'compact' : ''}`}>
        {answers.map((a, i) => {
          const s = answerStyle(i);
          return (
            <button
              key={i}
              type="button"
              className="answer-btn"
              style={{ '--answer': s.color }}
              onClick={(e) => choose(i, e.currentTarget)}
              disabled={seconds === 0}
              aria-label={`${s.label}: ${a.text}`}
            >
              <Shape shape={s.shape} size={44} />
              <span className="answer-label">{a.text}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

const WAITING_LINES = ['Was that the fastest finger?', 'Answer locked in!', 'Fingers crossed…', 'Bold choice.'];

export function Waiting({ answerIndex }) {
  const root = useRef(null);
  const [line] = useState(() => WAITING_LINES[Math.floor(Math.random() * WAITING_LINES.length)]);
  useEntrance(root);
  useGSAP(
    () => {
      gsap.to('.waiting-shape', { rotate: 360, duration: 2.4, repeat: -1, ease: 'none' });
    },
    { scope: root },
  );
  const s = answerStyle(answerIndex ?? 0);
  return (
    <section ref={root} className="screen-center">
      <span className="waiting-shape pop" style={{ color: s.color }}>
        <Shape shape={s.shape} size={110} />
      </span>
      <h2 className="headline rise">{line}</h2>
      <p className="muted rise">Waiting for everyone else…</p>
    </section>
  );
}

function Standing({ state }) {
  const { me, ahead } = state;
  return (
    <div className="standing rise">
      <p className="standing-rank">You're in {ordinal(me.rank)} place</p>
      <p className="muted">
        {ahead
          ? ahead.gap === 0
            ? `Tied with ${ahead.name}!`
            : `${ahead.gap.toLocaleString()} points behind ${ahead.name}`
          : me.rank === 1
            ? "You're in the lead!"
            : ''}
      </p>
    </div>
  );
}

export function PlayerResult({ state }) {
  const root = useRef(null);
  const r = state.result;
  const tone = !r ? 'neutral' : r.correct ? 'correct' : 'wrong';
  useEntrance(root);
  useEffect(() => {
    if (r) navigator.vibrate?.(r.correct ? [30, 40, 30] : 120);
  }, [r]);

  let title = 'You joined mid-question';
  if (r && !r.answered) title = "Time's up!";
  else if (r) title = r.correct ? 'Correct!' : 'Incorrect';

  return (
    <section ref={root} className={`screen-center result result-${tone}`}>
      <div className="result-icon pop" aria-hidden="true">
        {tone === 'correct' ? '✓' : tone === 'wrong' ? '✕' : '…'}
      </div>
      <h2 className="headline pop">{title}</h2>
      {r?.correct && (
        <p className="points-pill pop">
          +<CountUp to={r.points + r.bonus} duration={1} delay={0.3} />
        </p>
      )}
      {r?.streak > 1 && <p className="streak rise">🔥 Answer streak: {r.streak}</p>}
      {r && !r.correct && r.answered && <p className="muted rise">Streak lost. Get the next one!</p>}
      <Standing state={state} />
    </section>
  );
}

export function PlayerStanding({ state }) {
  const root = useRef(null);
  useEntrance(root);
  return (
    <section ref={root} className="screen-center">
      <p className="eyebrow pop">Scoreboard</p>
      <p className="big-score pop">
        <CountUp to={state.me.score} duration={1} />
      </p>
      <Standing state={state} />
      <p className="muted rise">Look at the big screen!</p>
    </section>
  );
}

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

export function PlayerFinal({ state, onExit }) {
  const root = useRef(null);
  const { rank, score } = state.me;
  const podium = rank <= 3;
  useEntrance(root);
  return (
    <section ref={root} className="screen-center">
      {podium && <Confetti3D pieces={200} />}
      <p className="eyebrow pop">Final results</p>
      <div className="medal pop" aria-hidden="true">
        {MEDALS[rank] ?? '🎉'}
      </div>
      <h2 className="headline rise">
        {ordinal(rank)} of {state.playerCount}
      </h2>
      <p className="big-score rise">
        <CountUp to={score} duration={1.4} />
      </p>
      <p className="muted rise">{podium ? 'You made the podium!' : 'Great game. Thanks for playing!'}</p>
      <button type="button" className="btn btn-primary rise" onClick={onExit}>
        Play another game
      </button>
    </section>
  );
}

export function Ended({ title, body, onExit }) {
  const root = useRef(null);
  useEntrance(root);
  return (
    <section ref={root} className="screen-center">
      <h2 className="headline pop">{title}</h2>
      {body && <p className="muted rise">{body}</p>}
      <button type="button" className="btn btn-primary rise" onClick={onExit}>
        Back to start
      </button>
    </section>
  );
}
