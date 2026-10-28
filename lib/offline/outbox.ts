'use client';

/**
 * Browser-side outbox for sets logged without a connection: wraps the IndexedDB store, serialises flushes,
 * and broadcasts changes so the logger and the offline banner stay in sync (same tab via an EventTarget,
 * other tabs via BroadcastChannel).
 */
import { logSet } from '@/lib/actions/training';
import { createLogger } from '@/lib/log';
import { idbStore } from './idb';
import { flushQueue, setKey, withTimeout, type FlushOutcome, type QueuedSet, type QueuedSetInput, type SetStore } from './queue';

const log = createLogger('offline/outbox');

export interface OutboxChange {
  synced: string[];
  failed: { key: string; error: string }[];
}

let store: SetStore | null = null;
const getStore = () => (store ??= idbStore());
const events = typeof EventTarget === 'undefined' ? null : new EventTarget();
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('pc-outbox');
channel?.addEventListener('message', (e: MessageEvent<OutboxChange>) => emit(e.data, false));

function emit(change: OutboxChange, broadcast = true) {
  events?.dispatchEvent(new CustomEvent<OutboxChange>('change', { detail: change }));
  if (broadcast) channel?.postMessage(change);
}

export function onOutboxChange(fn: (c: OutboxChange) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<OutboxChange>).detail);
  events?.addEventListener('change', h);
  return () => events?.removeEventListener('change', h);
}

export async function pendingSets(sessionId?: string): Promise<QueuedSet[]> {
  try {
    const all = await getStore().all();
    return sessionId ? all.filter((s) => s.input.sessionId === sessionId) : all;
  } catch (e) {
    log.error('read outbox failed', { err: e });
    return [];
  }
}

export async function enqueueSet(input: QueuedSetInput): Promise<void> {
  const key = setKey(input.plannedExerciseId, input.setIndex);
  await getStore().put({ key, queuedAt: Date.now(), input });
  log.info('set queued offline', { key });
  emit({ synced: [], failed: [] });
}

/** Drop a queued set (undo before it synced). Returns true when it was queued. */
export async function dequeueSet(plannedExerciseId: string, setIndex: number): Promise<boolean> {
  const key = setKey(plannedExerciseId, setIndex);
  const s = getStore();
  const had = (await s.all()).some((x) => x.key === key);
  if (had) {
    await s.delete(key);
    emit({ synced: [], failed: [] });
  }
  return had;
}

/** A replay that hangs this long (one bar of signal) pauses the flush; the next attempt retries it. */
const SEND_TIMEOUT_MS = 15_000;

let flushing: Promise<FlushOutcome> | null = null;

/** Replay the outbox (single-flight). Safe to call on every `online` event and page load. */
export function flushOutbox(): Promise<FlushOutcome> {
  flushing ??= (async () => {
    try {
      const out = await flushQueue(getStore(), async (input) => {
        const res = await withTimeout(logSet(input), SEND_TIMEOUT_MS);
        return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
      });
      if (out.synced.length || out.failed.length) emit({ synced: out.synced, failed: out.failed });
      return out;
    } catch (e) {
      log.error('flush failed', { err: e });
      return { synced: [], failed: [], remaining: 0 };
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
