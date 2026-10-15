import { useEffect, useMemo, useState } from 'react';

/**
 * Counts down from a server `timing` ({ remainingMs, durationMs }). Uses the
 * remaining time rather than a timestamp so device clock skew doesn't matter.
 */
export function useCountdown(timing) {
  const deadline = useMemo(() => (timing ? performance.now() + timing.remainingMs : 0), [timing]);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (!deadline) return undefined;
    setNow(performance.now());
    const id = setInterval(() => {
      const t = performance.now();
      setNow(t);
      if (t >= deadline) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [deadline]);

  if (!timing) return { remainingMs: 0, seconds: 0, fraction: 0 };
  const remainingMs = Math.max(0, deadline - now);
  return {
    remainingMs,
    seconds: Math.ceil(remainingMs / 1000),
    fraction: timing.durationMs ? remainingMs / timing.durationMs : 0,
  };
}

export function loadJSON(storage, key) {
  try {
    return JSON.parse(storage.getItem(key)) ?? null;
  } catch {
    return null;
  }
}

export function saveJSON(storage, key, value) {
  try {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); the app still works without it.
  }
}

/** Saves text as a file on the user's device. */
export function downloadFile(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
