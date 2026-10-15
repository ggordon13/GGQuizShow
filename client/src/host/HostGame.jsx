import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { answerStyle, CountUp, QuestionImage, Shape, TimerRing } from '../components/ui.jsx';
import { useCountdown } from '../lib/hooks.js';
import Confetti3D from '../three/Confetti3D.jsx';

export default function HostGame({ game, onAction, onEnd, onDownload }) {
  const next = () => onAction('next');
  const screens = {
    lobby: <HostLobby game={game} onAction={onAction} />,
    intro: <HostIntro game={game} onNext={next} />,
    question: <HostQuestion game={game} onNext={next} />,
    reveal: <HostReveal game={game} onNext={next} />,
    leaderboard: <HostLeaderboard game={game} onNext={next} />,
    podium: <HostPodium game={game} onFinish={onEnd} onDownload={onDownload} />,
  };

  return (
    <div className="host-game">
      <header className="host-bar">
        <span className="pin-chip">
          PIN <strong>{game.pin}</strong>
        </span>
        <span className="host-title">{game.title}</span>
        <span className="player-count" title="Players">
          👥 {game.playerCount}
        </span>
        {game.hasResults && game.phase !== 'podium' && (
          <button type="button" className="btn btn-ghost btn-small" onClick={onDownload} title="Download results so far">
            ⬇ Results
          </button>
        )}
        {game.phase !== 'podium' && (
          <button type="button" className="btn btn-ghost btn-small" onClick={onEnd}>
            End game
          </button>
        )}
      </header>
      <div className="host-stage" key={`${game.phase}-${game.questionIndex}`}>
        {screens[game.phase]}
      </div>
    </div>
  );
}

/** Players' phones can't reach "localhost", so swap in this machine's LAN address. */
function useJoinBase() {
  const [base, setBase] = useState(window.location.origin);
  useEffect(() => {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return;
    fetch('/api/info')
      .then((r) => r.json())
      .then(({ lanAddresses }) => {
        const ip = lanAddresses?.[0];
        if (ip) setBase(`${window.location.protocol}//${ip}${window.location.port ? `:${window.location.port}` : ''}`);
      })
      .catch(() => {});
  }, []);
  return base;
}

function PlayerChip({ player, onKick }) {
  const ref = useRef(null);
  useGSAP(() => {
    gsap.from(ref.current, { scale: 0, rotate: gsap.utils.random(-20, 20), duration: 0.5, ease: 'back.out(2.5)' });
  });
  return (
    <button
      ref={ref}
      type="button"
      className={`player-chip ${player.connected ? '' : 'offline'}`}
      onClick={() => onKick(player)}
      title={`Remove ${player.name}`}
    >
      {player.name}
    </button>
  );
}

function HostLobby({ game, onAction }) {
  const root = useRef(null);
  const base = useJoinBase();
  const joinUrl = `${base}/?pin=${game.pin}`;
  const players = game.players ?? [];

  useGSAP(
    () => {
      gsap.from('.join-panel', { y: -30, opacity: 0, duration: 0.7, ease: 'power3.out' });
      gsap.from('.pin-digit', { rotateX: -90, opacity: 0, stagger: 0.07, duration: 0.6, delay: 0.2, ease: 'back.out(2)' });
    },
    { scope: root },
  );

  const kick = (player) => {
    if (window.confirm(`Remove ${player.name} from the game?`)) onAction('kick', { playerId: player.id });
  };

  return (
    <section ref={root} className="host-lobby">
      <div className="join-panel card">
        <div className="join-text">
          <p className="muted">
            Join at <strong className="join-host">{base.replace(/^https?:\/\//, '')}</strong>
          </p>
          <p className="eyebrow">Game PIN</p>
          <p className="pin-display" aria-label={`Game PIN ${game.pin}`}>
            {[...game.pin].map((d, i) => (
              <span key={i} className={`pin-digit ${i === 3 ? 'pin-gap' : ''}`}>
                {d}
              </span>
            ))}
          </p>
        </div>
        <div className="qr">
          <QRCodeSVG value={joinUrl} size={150} marginSize={2} />
          <span className="muted small">Scan to join</span>
        </div>
      </div>

      <div className="lobby-controls">
        <span className="player-total">
          <strong>{players.length}</strong> / {game.maxPlayers} players
        </span>
        <div className="row gap">
          <button type="button" className="btn btn-ghost" onClick={() => onAction(game.locked ? 'unlock' : 'lock')}>
            {game.locked ? '🔒 Locked' : '🔓 Open'}
          </button>
          <button type="button" className="btn btn-primary btn-large" onClick={() => onAction('start')} disabled={!players.length}>
            Start
          </button>
        </div>
      </div>

      {players.length === 0 ? (
        <p className="waiting-players">Waiting for players…</p>
      ) : (
        <div className="player-cloud">
          {players.map((p) => (
            <PlayerChip key={p.id} player={p} onKick={kick} />
          ))}
        </div>
      )}
    </section>
  );
}

function QuestionHeading({ game, className = '' }) {
  const q = game.question;
  return (
    <div className={`question-banner ${className}`}>
      <span className="eyebrow">
        Question {game.questionIndex + 1} of {game.totalQuestions}
        {q.points === 2 && <span className="badge badge-gold">Double points</span>}
        {q.points === 0 && <span className="badge">No points</span>}
      </span>
      <h2 className="question-text">{q.text}</h2>
    </div>
  );
}

function HostIntro({ game, onNext }) {
  const root = useRef(null);
  useGSAP(
    () => {
      const tl = gsap.timeline();
      tl.from('.question-banner', { scale: 0.6, opacity: 0, duration: 0.7, ease: 'back.out(1.7)' });
      if (root.current.querySelector('.question-image')) {
        tl.from('.question-image', { y: 40, opacity: 0, scale: 0.92, duration: 0.6, ease: 'power3.out' }, '-=0.3');
      }
      if (game.timing) {
        gsap.fromTo(
          '.progress-fill',
          { scaleX: game.timing.remainingMs / game.timing.durationMs },
          { scaleX: 0, duration: game.timing.remainingMs / 1000, ease: 'none' },
        );
      }
    },
    { scope: root },
  );
  return (
    <section ref={root} className="host-intro">
      <QuestionHeading game={game} />
      <QuestionImage src={game.question.image} className="host-intro-image" />
      <div className="progress wide">
        <div className="progress-fill" />
      </div>
      <button type="button" className="btn btn-ghost corner-btn" onClick={onNext}>
        Skip →
      </button>
    </section>
  );
}

function AnswerTiles({ answers, reveal = false }) {
  return (
    <div className={`host-answers count-${answers.length}`}>
      {answers.map((a, i) => {
        const s = answerStyle(i);
        const dim = reveal && !a.correct;
        return (
          <div
            key={i}
            className={`host-answer ${dim ? 'dim' : ''} ${reveal && a.correct ? 'correct' : ''}`}
            style={{ '--answer': s.color }}
          >
            <Shape shape={s.shape} size={36} />
            <span>{a.text}</span>
            {reveal && a.correct && <span className="tick">✓</span>}
          </div>
        );
      })}
    </div>
  );
}

function HostQuestion({ game, onNext }) {
  const root = useRef(null);
  const { seconds, fraction } = useCountdown(game.timing);
  const countRef = useRef(null);

  useGSAP(
    () => {
      gsap.from('.host-answer', { y: 60, opacity: 0, stagger: 0.07, duration: 0.5, ease: 'back.out(1.6)' });
      gsap.from('.timer-ring', { scale: 0, duration: 0.6, ease: 'back.out(2)' });
    },
    { scope: root },
  );
  // Bump the answer counter each time it changes.
  useGSAP(() => {
    if (countRef.current && game.answeredCount > 0) {
      gsap.fromTo(countRef.current, { scale: 1.35 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' });
    }
  }, [game.answeredCount]);

  return (
    <section ref={root} className="host-question">
      <QuestionHeading game={game} className="compact" />
      <div className={`question-middle ${game.question.image ? 'with-image' : ''}`}>
        <TimerRing seconds={seconds} fraction={fraction} size={150} />
        {game.question.image && (
          <div className="host-question-image">
            <QuestionImage src={game.question.image} />
          </div>
        )}
        <div className="answer-side">
          <div className="answer-counter">
            <span ref={countRef} className="answer-count">
              {game.answeredCount}
            </span>
            <span className="muted">of {game.playerCount} answered</span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onNext}>
            Skip
          </button>
        </div>
      </div>
      <AnswerTiles answers={game.question.answers} />
    </section>
  );
}

function HostReveal({ game, onNext }) {
  const root = useRef(null);
  const counts = game.distribution ?? [];
  const max = Math.max(1, ...counts);
  const correctCount = counts.reduce((sum, c, i) => sum + (game.question.answers[i].correct ? c : 0), 0);

  useGSAP(
    () => {
      const tl = gsap.timeline();
      tl.from('.bar-fill', { scaleY: 0, transformOrigin: 'bottom', duration: 0.8, stagger: 0.1, ease: 'power3.out' })
        .from('.host-answer', { y: 30, opacity: 0, stagger: 0.06, duration: 0.4 }, 0.1)
        .from('.bar-count', { opacity: 0, y: 10, stagger: 0.1, duration: 0.3 }, '-=0.5')
        .from('.bar.correct', { y: -12, duration: 0.5, ease: 'bounce.out', stagger: 0.1 });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="host-reveal">
      <QuestionHeading game={game} className="compact" />
      <div className="reveal-middle">
        <div className="bar-chart" role="img" aria-label={`${correctCount} of ${game.playerCount} players answered correctly`}>
          {counts.map((count, i) => {
            const s = answerStyle(i);
            const correct = game.question.answers[i].correct;
            return (
              <div key={i} className={`bar ${correct ? 'correct' : 'wrong'}`} style={{ '--answer': s.color }}>
                <span className="bar-count">
                  {count}
                  {correct && ' ✓'}
                </span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ height: `${Math.max(4, (count / max) * 100)}%` }} />
                </div>
                <span className="bar-shape">
                  <Shape shape={s.shape} size={22} />
                </span>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn btn-primary btn-large" onClick={onNext}>
          {game.questionIndex + 1 >= game.totalQuestions ? 'Final results →' : 'Next →'}
        </button>
      </div>
      <AnswerTiles answers={game.question.answers} reveal />
    </section>
  );
}

function HostLeaderboard({ game, onNext }) {
  const root = useRef(null);
  const rows = game.leaderboard ?? [];
  // Where each row sat before this question, so rows can slide into their new places.
  const prevIndex = useMemo(() => {
    const before = [...rows].sort((a, b) => b.prevScore - a.prevScore || a.prevRank - b.prevRank);
    return rows.map((r) => before.indexOf(r));
  }, [rows]);

  useGSAP(
    () => {
      const els = gsap.utils.toArray('.lb-row');
      if (!els.length) return;
      const step = els.length > 1 ? els[1].offsetTop - els[0].offsetTop : 0;
      els.forEach((el, i) => gsap.set(el, { y: (prevIndex[i] - i) * step }));
      gsap
        .timeline()
        .from('.lb-title', { y: -30, opacity: 0, duration: 0.5 })
        .from(els, { x: 120, opacity: 0, stagger: 0.08, duration: 0.5, ease: 'power3.out' })
        .to(els, { y: 0, duration: 0.9, ease: 'power3.inOut' }, '+=0.4')
        .from('.lb-move', { scale: 0, duration: 0.4, ease: 'back.out(3)', stagger: 0.05 }, '-=0.2');
    },
    { scope: root },
  );

  return (
    <section ref={root} className="host-leaderboard">
      <h2 className="lb-title">Scoreboard</h2>
      <ol className="lb-list">
        {rows.map((r) => {
          const moved = r.prevRank && r.prevRank > r.rank ? r.prevRank - r.rank : 0;
          return (
            <li key={r.id} className="lb-row">
              <span className="lb-rank">{r.rank}</span>
              <span className="lb-name">
                {r.name}
                {r.streak > 2 && <span className="lb-streak">🔥{r.streak}</span>}
              </span>
              {moved > 0 && <span className="lb-move">▲{moved}</span>}
              <CountUp className="lb-score" from={r.prevScore} to={r.score} duration={1.4} delay={1.2} />
            </li>
          );
        })}
      </ol>
      <button type="button" className="btn btn-primary btn-large" onClick={onNext}>
        Next question →
      </button>
    </section>
  );
}

const PODIUM_ORDER = [1, 0, 2]; // 2nd, 1st, 3rd from left to right

function HostPodium({ game, onFinish, onDownload }) {
  const root = useRef(null);
  const [celebrate, setCelebrate] = useState(false);
  const board = game.leaderboard ?? [];
  const top = board.slice(0, 3);
  const rest = board.slice(3);

  useGSAP(
    () => {
      const tl = gsap.timeline({ delay: 0.4 });
      tl.from('.podium-title', { y: -40, opacity: 0, duration: 0.6, ease: 'power3.out' });
      // Reveal 3rd, then 2nd, then (after a beat) the winner.
      [2, 1, 0].forEach((place) => {
        const col = `.podium-col[data-place="${place}"]`;
        if (!root.current.querySelector(col)) return;
        tl.from(`${col} .podium-block`, { scaleY: 0, transformOrigin: 'bottom', duration: 0.8, ease: 'power4.out' }, place === 0 ? '+=0.8' : '+=0.3');
        tl.from(`${col} .podium-name`, { y: 30, opacity: 0, scale: 0.5, duration: 0.6, ease: 'back.out(2.5)' }, '-=0.2');
        if (place === 0) tl.call(() => setCelebrate(true));
      });
      tl.from('.podium-rest li', { x: -30, opacity: 0, stagger: 0.05, duration: 0.4 });
      tl.from('.podium-actions', { opacity: 0, duration: 0.4 });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="host-podium">
      {celebrate && <Confetti3D />}
      <h2 className="podium-title">{game.title}</h2>
      <div className="podium">
        {PODIUM_ORDER.filter((place) => top[place]).map((place) => {
          const p = top[place];
          return (
            <div key={p.id} className={`podium-col place-${place + 1}`} data-place={place}>
              <div className="podium-name">
                <span className="podium-player">{p.name}</span>
                <span className="podium-score">{p.score.toLocaleString()}</span>
              </div>
              <div className="podium-block">
                <span className="podium-medal">{['🥇', '🥈', '🥉'][place]}</span>
                <span className="podium-rank">{p.rank}</span>
              </div>
            </div>
          );
        })}
      </div>
      {rest.length > 0 && (
        <ol className="podium-rest" start={4}>
          {rest.map((p) => (
            <li key={p.id}>
              <span>
                {p.rank}. {p.name}
              </span>
              <strong>{p.score.toLocaleString()}</strong>
            </li>
          ))}
        </ol>
      )}
      <div className="podium-actions row gap wrap">
        <button type="button" className="btn btn-ghost btn-large" onClick={onDownload}>
          ⬇ Download results (CSV)
        </button>
        <button type="button" className="btn btn-primary btn-large" onClick={onFinish}>
          Finish
        </button>
      </div>
    </section>
  );
}
