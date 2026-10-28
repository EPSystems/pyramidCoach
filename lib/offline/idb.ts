/**
 * Minimal IndexedDB-backed `SetStore` (no dependency). One database, one object store keyed by `key`.
 * Falls back to an in-memory store when IndexedDB is unavailable (old WebView, blocked storage).
 */
import { createLogger } from '@/lib/log';
import { memoryStore, type QueuedSet, type SetStore } from './queue';

const log = createLogger('offline/idb');

const DB_NAME = 'pyramid-coach';
const DB_VERSION = 1;
export const SETS_STORE = 'pending-sets';

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(SETS_STORE)) r.result.createObjectStore(SETS_STORE, { keyPath: 'key' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('IndexedDB open blocked'));
  }).catch((e: unknown) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  const t = db.transaction(SETS_STORE, mode);
  // Listen for completion before issuing the request, so a write only counts once it is durable.
  const done = new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  const [result] = await Promise.all([req(fn(t.objectStore(SETS_STORE))), done]);
  return result;
}

export function idbStore(): SetStore {
  if (typeof indexedDB === 'undefined') {
    log.warn('IndexedDB unavailable; offline sets are kept in memory only');
    return memoryStore();
  }
  return {
    put: async (item: QueuedSet) => void (await tx('readwrite', (s) => s.put(item))),
    delete: async (key: string) => void (await tx('readwrite', (s) => s.delete(key))),
    all: async () => (await tx('readonly', (s) => s.getAll())) as QueuedSet[],
  };
}
