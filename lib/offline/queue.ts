/**
 * Offline set-logging queue (DECISIONS 95–41). Gyms have bad reception: when `logSet` can't reach the server,
 * the set is stored on the phone and replayed in order once the connection is back.
 *
 * The idempotency key is the set's natural key `(planned_exercise_id, set_index)`, the same key the server
 * upserts on, so replaying a set that did reach the server is harmless and re-logging a queued set replaces it.
 *
 * Storage is injected (`SetStore`) so the logic is unit-tested without IndexedDB; the browser store is in ./idb.
 */
import { createLogger } from '@/lib/log';

const log = createLogger('offline/queue');

/** Everything `logSet` needs, plus the day the set was performed (it may sync on a later day). */
export interface QueuedSetInput {
  sessionId: string;
  plannedExerciseId: string;
  exerciseId: string;
  setIndex: number;
  loadKg: number | null;
  reps: number;
  rir: number | null;
  rx: { repMin: number; repMax: number; rirMin: number; rirMax: number };
  increment: number;
  performedOn: string;
  /** Warm-up sets (T-WUP-01) have their own set_index sequence on the server. */
  isWarmup?: boolean;
}

export interface QueuedSet {
  key: string;
  queuedAt: number;
  input: QueuedSetInput;
}

export interface SetStore {
  put(item: QueuedSet): Promise<void>;
  delete(key: string): Promise<void>;
  all(): Promise<QueuedSet[]>;
}

export type SendResult = { ok: true } | { ok: false; error: string };

/** Mirrors the server's unique key (planned_exercise_id, is_warmup, set_index). */
export const setKey = (plannedExerciseId: string, setIndex: number, isWarmup = false) => `${plannedExerciseId}:${isWarmup ? 'w' : ''}${setIndex}`;
export const keyOf = (input: Pick<QueuedSetInput, 'plannedExerciseId' | 'setIndex' | 'isWarmup'>) => setKey(input.plannedExerciseId, input.setIndex, input.isWarmup);

/** Local calendar day (YYYY-MM-DD) on the phone, i.e. the day the user is actually training. */
export const localDay = (now: Date = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/**
 * True when a failure means "no connection" (queue and retry) rather than "the server said no" (show the error).
 * Server actions reject with a TypeError ("Failed to fetch" / "Load failed" / "NetworkError…") when offline.
 */
export function isNetworkError(e: unknown, online: boolean = typeof navigator === 'undefined' ? true : navigator.onLine): boolean {
  if (!online) return true;
  if (e instanceof OfflineTimeoutError) return true;
  if (!(e instanceof Error)) return false;
  if (e.name === 'TypeError' || e.name === 'NetworkError' || e.name === 'AbortError') return true;
  return /failed to fetch|network ?error|load failed|fetch failed|network request failed|connection closed/i.test(e.message);
}

export class OfflineTimeoutError extends Error {
  constructor(ms: number) {
    super(`No response within ${ms} ms`);
    this.name = 'OfflineTimeoutError';
  }
}

/** Lie-fi (one bar, requests that never finish) is treated like offline after `ms`. The idempotent upsert makes a late arrival harmless. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new OfflineTimeoutError(ms)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Queue order: oldest first, so sets replay in the order they were logged. */
export const ordered = (items: QueuedSet[]) => [...items].sort((a, b) => a.queuedAt - b.queuedAt || a.key.localeCompare(b.key));

export interface FlushOutcome {
  synced: string[];
  /** Rejected by the server (validation, RLS, deleted plan): dropped so they don't block the queue forever. */
  failed: { key: string; error: string }[];
  /** Still queued because the connection dropped mid-flush. */
  remaining: number;
}

/**
 * Replay queued sets in order. Stops at the first network failure (the rest stay queued for the next attempt);
 * a set the server rejects is dropped and reported.
 */
export async function flushQueue(store: SetStore, send: (input: QueuedSetInput) => Promise<SendResult>, online?: () => boolean): Promise<FlushOutcome> {
  const items = ordered(await store.all());
  const out: FlushOutcome = { synced: [], failed: [], remaining: 0 };
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let res: SendResult;
    try {
      res = await send(item.input);
    } catch (e) {
      if (isNetworkError(e, online ? online() : undefined)) {
        log.info('flush paused: offline', { remaining: items.length - i });
        out.remaining = items.length - i;
        return out;
      }
      log.error('flush: send threw', { key: item.key, err: e });
      res = { ok: false, error: 'Could not sync a set logged offline.' };
    }
    await store.delete(item.key);
    if (res.ok) out.synced.push(item.key);
    else {
      log.warn('flush: set rejected', { key: item.key, error: res.error });
      out.failed.push({ key: item.key, error: res.error });
    }
  }
  return out;
}

/** In-memory store (tests, and the fallback when IndexedDB is unavailable, e.g. private mode). */
export function memoryStore(): SetStore {
  const m = new Map<string, QueuedSet>();
  return {
    put: async (item) => void m.set(item.key, structuredClone(item)),
    delete: async (key) => void m.delete(key),
    all: async () => [...m.values()].map((v) => structuredClone(v)),
  };
}
