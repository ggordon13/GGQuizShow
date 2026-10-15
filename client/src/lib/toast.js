import { useEffect, useState } from 'react';

const listeners = new Set();
let nextId = 1;

/** Shows a short message at the bottom of the screen from anywhere in the app. */
export function toast(message, tone = 'error') {
  const item = { id: nextId++, message, tone };
  listeners.forEach((fn) => fn(item));
}

export function useToasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const add = (item) => {
      setItems((list) => [...list.slice(-2), item]);
      setTimeout(() => setItems((list) => list.filter((i) => i.id !== item.id)), 3500);
    };
    listeners.add(add);
    return () => listeners.delete(add);
  }, []);
  return items;
}
