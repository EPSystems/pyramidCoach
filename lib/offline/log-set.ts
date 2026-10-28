'use client';

/**
 * Offline-aware wrappers around the `logSet` / `deleteSet` server actions, used by the session logger.
 * Without a connection the set goes to the outbox and the next-set suggestion is computed on the phone
 * (the same pure engine function the server uses), so the logger keeps working set to set.
 */
import { deleteSet, logSet } from '@/lib/actions/training';
import { suggestNextSet } from '@/lib/engine/progression';
import { createLogger } from '@/lib/log';
import { dequeueSet, enqueueSet } from './outbox';
import { isNetworkError, localDay, withTimeout, type QueuedSetInput } from './queue';

const log = createLogger('offline/log-set');

/** How long a live save may take before the set is queued instead (lie-fi). */
const LIVE_TIMEOUT_MS = 8_000;

type Next = ReturnType<typeof suggestNextSet>;
export type LogSetOutcome = { ok: true; queued: boolean; data: { next: Next } } | { ok: false; error: string };

export async function logSetOrQueue(raw: Omit<QueuedSetInput, 'performedOn'>): Promise<LogSetOutcome> {
  const input: QueuedSetInput = { ...raw, performedOn: localDay() };
  const queue = async (): Promise<LogSetOutcome> => {
    try {
      await enqueueSet(input);
    } catch (e) {
      log.error('enqueue failed', { plannedExerciseId: raw.plannedExerciseId, setIndex: raw.setIndex, err: e });
      return { ok: false, error: 'No connection, and the set could not be saved on this phone. Try again.' };
    }
    // Same as the server: a warm-up doesn't steer the working sets.
    const next: Next = raw.isWarmup
      ? { load: raw.loadKg, repsTarget: raw.reps, ruleIds: ['T-WUP-01'] }
      : suggestNextSet({ rx: raw.rx, setIndex: raw.setIndex, load: raw.loadKg, reps: raw.reps, increment: raw.increment });
    return { ok: true, queued: true, data: { next } };
  };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return queue();
  try {
    const res = await withTimeout(logSet(input), LIVE_TIMEOUT_MS);
    if (!res.ok) return res;
    return { ok: true, queued: false, data: { next: res.data!.next } };
  } catch (e) {
    if (isNetworkError(e)) {
      log.info('logSet: no connection, queued', { plannedExerciseId: raw.plannedExerciseId, setIndex: raw.setIndex, err: e });
      return queue();
    }
    throw e;
  }
}

/** Undo a set: a queued set is simply dropped from the outbox; a synced one needs the server. */
export async function deleteSetOrDequeue(plannedExerciseId: string, setIndex: number, isWarmup = false): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await dequeueSet(plannedExerciseId, setIndex, isWarmup).catch(() => false)) {
    // A flush may have sent it a moment ago; clear the server copy too when we can (no-op if absent).
    if (navigator.onLine) void deleteSet(plannedExerciseId, setIndex, isWarmup).catch(() => undefined);
    return { ok: true };
  }
  return deleteSet(plannedExerciseId, setIndex, isWarmup);
}
