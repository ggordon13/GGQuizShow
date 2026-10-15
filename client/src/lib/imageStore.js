/**
 * Question images live in IndexedDB (as data URLs keyed by id) because
 * localStorage is only ~5 MB. Quizzes in localStorage refer to them by id.
 */
const DB_NAME = 'ggquiz';
const STORE = 'images';

let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Image storage is full'));
  });
}

/** Resolves to the image's data URL, or null if it's missing. */
export async function getImage(id) {
  if (!id) return null;
  try {
    return (await run('readonly', (s) => s.get(id))) ?? null;
  } catch {
    return null;
  }
}

export function putImage(id, dataUrl) {
  return run('readwrite', (s) => s.put(dataUrl, id));
}

/** Deletes images no quiz refers to any more (e.g. replaced, or from deleted quizzes). */
export async function pruneImages(keepIds) {
  const keep = new Set(keepIds);
  try {
    const ids = await run('readonly', (s) => s.getAllKeys());
    const stale = ids.filter((id) => !keep.has(id));
    if (stale.length) {
      await run('readwrite', (s) => {
        stale.forEach((id) => s.delete(id));
        return null;
      });
    }
  } catch {
    // Housekeeping only; ignore storage errors.
  }
}
