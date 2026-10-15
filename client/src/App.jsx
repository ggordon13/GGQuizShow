import { useCallback, useEffect, useState } from 'react';
import { ConnectionBanner, Toaster } from './components/ui.jsx';
import Home from './Home.jsx';
import HostApp from './host/HostApp.jsx';
import { loadJSON } from './lib/hooks.js';
import { PLAYER_SESSION_KEY } from './player/PlayerApp.jsx';
import PlayerApp from './player/PlayerApp.jsx';
import Background3D from './three/Background3D.jsx';

function routeFromLocation() {
  if (window.location.pathname.startsWith('/host')) return { name: 'host' };
  const params = new URLSearchParams(window.location.search);
  const pin = params.get('pin')?.replace(/\D/g, '').slice(0, 6) ?? '';
  const session = loadJSON(localStorage, PLAYER_SESSION_KEY);
  // Resume a game this device was already playing (e.g. after a refresh).
  if (session?.pin && (!pin || pin === session.pin)) return { name: 'play', pin: session.pin };
  return { name: 'home', pin };
}

export default function App() {
  const [route, setRoute] = useState(routeFromLocation);
  const [energy, setEnergy] = useState(0.3);

  const navigate = useCallback((next) => {
    const path = next.name === 'host' ? '/host' : '/';
    if (window.location.pathname !== path || window.location.search) window.history.pushState(null, '', path);
    setRoute(next);
    setEnergy(0.3);
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const goHome = useCallback(() => navigate({ name: 'home', pin: '' }), [navigate]);

  return (
    <>
      <Background3D energy={energy} />
      <ConnectionBanner />
      <main className="app">
        {route.name === 'home' && (
          <Home
            initialPin={route.pin}
            onJoin={(pin) => navigate({ name: 'play', pin })}
            onHost={() => navigate({ name: 'host' })}
          />
        )}
        {route.name === 'play' && <PlayerApp key={route.pin} pin={route.pin} onExit={goHome} setEnergy={setEnergy} />}
        {route.name === 'host' && <HostApp onExit={goHome} setEnergy={setEnergy} />}
      </main>
      <Toaster />
    </>
  );
}
