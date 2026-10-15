import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { ANSWER_STYLES } from '../lib/constants.js';
import { useConnected } from '../lib/socket.js';
import { useToasts } from '../lib/toast.js';

export function Shape({ shape, size = 32 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="currentColor" aria-hidden="true" className="shape">
      {shape === 'triangle' && <polygon points="16,3 30,28 2,28" />}
      {shape === 'diamond' && <polygon points="16,1 31,16 16,31 1,16" />}
      {shape === 'circle' && <circle cx="16" cy="16" r="14" />}
      {shape === 'square' && <rect x="3" y="3" width="26" height="26" rx="3" />}
    </svg>
  );
}

export const answerStyle = (index) => ANSWER_STYLES[index % ANSWER_STYLES.length];

/** A question's reference image. With `zoomable`, tapping opens it full screen (for phones). */
export function QuestionImage({ src, className = '', zoomable = false }) {
  const [zoomed, setZoomed] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!zoomed) return undefined;
    const onKey = (e) => e.key === 'Escape' && setZoomed(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed]);

  if (!src || failed) return null;
  const img = (
    <img src={src} alt="Question reference" className={`question-image ${className}`} onError={() => setFailed(true)} />
  );
  if (!zoomable) return img;
  return (
    <>
      <button type="button" className="image-zoom-button" onClick={() => setZoomed(true)} aria-label="Enlarge image">
        {img}
      </button>
      {zoomed && (
        <div className="image-lightbox" role="dialog" aria-label="Question image" onClick={() => setZoomed(false)}>
          <img src={src} alt="Question reference, enlarged" />
          <span className="image-lightbox-hint">Tap anywhere to close</span>
        </div>
      )}
    </>
  );
}

/** "GG Quiz Show" with letters that drop in. */
export function Logo({ size = 'lg' }) {
  const ref = useRef(null);
  useGSAP(
    () => {
      gsap.from('.logo-letter', {
        y: -60,
        opacity: 0,
        rotate: () => gsap.utils.random(-25, 25),
        stagger: 0.04,
        duration: 0.8,
        ease: 'back.out(2.2)',
      });
    },
    { scope: ref },
  );
  const words = ['GG', 'Quiz', 'Show'];
  return (
    <h1 ref={ref} className={`logo logo-${size}`} aria-label="GG Quiz Show">
      {words.map((word, w) => (
        <span key={word} className={`logo-word logo-word-${w}`} aria-hidden="true">
          {[...word].map((ch, i) => (
            <span key={i} className="logo-letter">
              {ch}
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}

/** A number that rolls from `from` to `to`. */
export function CountUp({ from = 0, to, duration = 1.2, delay = 0, className }) {
  const ref = useRef(null);
  useGSAP(() => {
    const counter = { value: from };
    ref.current.textContent = Math.round(from).toLocaleString();
    gsap.to(counter, {
      value: to,
      duration,
      delay,
      ease: 'power2.out',
      onUpdate: () => {
        if (ref.current) ref.current.textContent = Math.round(counter.value).toLocaleString();
      },
    });
  }, [from, to]);
  return <span ref={ref} className={className} />;
}

/** Circular countdown. `fraction` is 1 at the start and 0 at the buzzer. */
export function TimerRing({ seconds, fraction, size = 120 }) {
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const urgent = seconds <= 5;
  return (
    <div className={`timer-ring ${urgent ? 'urgent' : ''}`} style={{ width: size, height: size }} role="timer">
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} className="timer-track" />
        <circle
          cx="50"
          cy="50"
          r={r}
          className="timer-fill"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className="timer-number" style={{ fontSize: size * 0.32 }}>
        {seconds}
      </span>
    </div>
  );
}

export function Toaster() {
  const items = useToasts();
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function ConnectionBanner() {
  const connected = useConnected();
  if (connected) return null;
  return (
    <div className="connection-banner" role="alert">
      <span className="spinner small" /> Reconnecting…
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="center-stack">
      <span className="spinner" />
      {label && <p className="muted">{label}</p>}
    </div>
  );
}
