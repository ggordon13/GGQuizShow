import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useRef, useState } from 'react';
import { Logo } from './components/ui.jsx';
import { request } from './lib/socket.js';

export default function Home({ initialPin = '', onJoin, onHost }) {
  const root = useRef(null);
  const [pin, setPin] = useState(initialPin);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const { contextSafe } = useGSAP(
    () => {
      gsap.from('.join-card', { y: 50, opacity: 0, scale: 0.94, duration: 0.8, delay: 0.35, ease: 'power3.out' });
      gsap.from('.host-link', { opacity: 0, duration: 0.6, delay: 0.8 });
    },
    { scope: root },
  );

  const shake = contextSafe(() => {
    gsap.fromTo('.join-card', { x: -14 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)' });
  });

  async function submit(e) {
    e.preventDefault();
    const clean = pin.replace(/\D/g, '');
    if (clean.length !== 6) {
      setError('Game PINs are 6 digits');
      shake();
      return;
    }
    setBusy(true);
    const res = await request('game:check', { pin: clean });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      shake();
      return;
    }
    onJoin(clean);
  }

  return (
    <section ref={root} className="home screen-center">
      <Logo />
      <form className="card join-card" onSubmit={submit} noValidate>
        <label htmlFor="pin" className="sr-only">
          Game PIN
        </label>
        <input
          id="pin"
          className="big-input"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Game PIN"
          maxLength={7}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/[^\d ]/g, ''));
            setError('');
          }}
          autoFocus={!initialPin}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'pin-error' : undefined}
        />
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Checking…' : 'Enter'}
        </button>
        {error && (
          <p id="pin-error" className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <button type="button" className="host-link link-button" onClick={onHost}>
        Want to run a quiz? <strong>Host a game →</strong>
      </button>
    </section>
  );
}
