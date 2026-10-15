import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

// Same origin: Vite proxies /socket.io to the Node server in development.
export const socket = io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });

/** Emits an event and resolves with the server's { ok, ... } reply. Never rejects. */
export function request(event, payload = {}, timeoutMs = 8000) {
  return new Promise((resolve) => {
    socket.timeout(timeoutMs).emit(event, payload, (err, res) => {
      if (err) resolve({ ok: false, code: 'TIMEOUT', error: 'Connection timed out. Check your network and try again.' });
      else resolve(res ?? { ok: false, error: 'No response from server' });
    });
  });
}

/** Subscribes to a socket event for the lifetime of the component. */
export function useSocketEvent(event, handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const listener = (...args) => handlerRef.current(...args);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [event]);
}

/** Runs `fn` now if connected, and again after every reconnect. */
export function useOnConnect(fn, deps) {
  useEffect(() => {
    if (socket.connected) fn();
    socket.on('connect', fn);
    return () => socket.off('connect', fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useConnected() {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, []);
  return connected;
}
