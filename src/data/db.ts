// Mini-surcouche IndexedDB (sans dépendance) : une base, quelques "stores" clé → objet.
// Ajouter un store : l'ajouter à STORES et incrémenter VERSION.

const DB_NAME = 'echecs';
const VERSION = 2;
export const STORES = ['accounts', 'games', 'kv', 'srs', 'userLines', 'puzzles'] as const; // kv = réglages, notes
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Exécute une requête dans une transaction et renvoie son résultat. */
async function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error);
  });
}

export const db = {
  get: <T>(store: StoreName, key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key)),
  getAll: <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll()),
  keys: (store: StoreName) => run<string[]>(store, 'readonly', (s) => s.getAllKeys()),
  put: (store: StoreName, key: string, value: unknown) => run<void>(store, 'readwrite', (s) => s.put(value, key)),
  del: (store: StoreName, key: string) => run<void>(store, 'readwrite', (s) => s.delete(key)),
  clear: (store: StoreName) => run<void>(store, 'readwrite', (s) => s.clear()),
};

/** Prévient les pages qu'il faut se rafraîchir (nouvelles parties, analyse terminée…). */
export function notifyChange(): void {
  dispatchEvent(new Event('data-changed'));
}
