import { describe, expect, it, vi } from 'vitest';
import {
  flushQueue,
  isNetworkError,
  localDay,
  memoryStore,
  ordered,
  OfflineTimeoutError,
  setKey,
  withTimeout,
  type QueuedSet,
  type QueuedSetInput,
} from '@/lib/offline/queue';

const PE = '11111111-1111-1111-1111-111111111111';

function input(setIndex: number, over: Partial<QueuedSetInput> = {}): QueuedSetInput {
  return {
    sessionId: '22222222-2222-2222-2222-222222222222',
    plannedExerciseId: PE,
    exerciseId: '33333333-3333-3333-3333-333333333333',
    setIndex,
    loadKg: 60,
    reps: 8,
    rir: 2,
    rx: { repMin: 6, repMax: 10, rirMin: 1, rirMax: 3 },
    increment: 2.5,
    performedOn: '2026-10-27',
    ...over,
  };
}
const item = (setIndex: number, queuedAt: number, over: Partial<QueuedSetInput> = {}): QueuedSet => ({ key: setKey(PE, setIndex), queuedAt, input: input(setIndex, over) });

describe('offline queue', () => {
  it('keys sets by (planned exercise, set index), the server upsert key', () => {
    expect(setKey(PE, 2)).toBe(`${PE}:2`);
  });

  it('re-logging a queued set replaces it instead of duplicating', async () => {
    const s = memoryStore();
    await s.put(item(0, 1, { reps: 8 }));
    await s.put(item(0, 2, { reps: 10 }));
    const all = await s.all();
    expect(all).toHaveLength(1);
    expect(all[0].input.reps).toBe(10);
  });

  it('orders oldest first', () => {
    expect(ordered([item(2, 30), item(0, 10), item(1, 20)]).map((i) => i.input.setIndex)).toEqual([0, 1, 2]);
  });

  it('flushes in order and empties the queue', async () => {
    const s = memoryStore();
    for (const it of [item(1, 20), item(0, 10), item(2, 30)]) await s.put(it);
    const sent: number[] = [];
    const out = await flushQueue(s, async (i) => {
      sent.push(i.setIndex);
      return { ok: true };
    });
    expect(sent).toEqual([0, 1, 2]);
    expect(out).toEqual({ synced: [setKey(PE, 0), setKey(PE, 1), setKey(PE, 2)], failed: [], remaining: 0 });
    expect(await s.all()).toEqual([]);
  });

  it('stops at a network failure and keeps the rest queued, in order', async () => {
    const s = memoryStore();
    for (const it of [item(0, 10), item(1, 20), item(2, 30)]) await s.put(it);
    let calls = 0;
    const out = await flushQueue(
      s,
      async () => {
        if (++calls === 2) throw new TypeError('Failed to fetch');
        return { ok: true };
      },
      () => true,
    );
    expect(out.synced).toEqual([setKey(PE, 0)]);
    expect(out.remaining).toBe(2);
    expect(ordered(await s.all()).map((i) => i.input.setIndex)).toEqual([1, 2]);

    // Next attempt (back online) picks up where it stopped.
    const again = await flushQueue(s, async () => ({ ok: true }), () => true);
    expect(again.synced).toEqual([setKey(PE, 1), setKey(PE, 2)]);
    expect(await s.all()).toEqual([]);
  });

  it('drops and reports a set the server rejects, then continues', async () => {
    const s = memoryStore();
    for (const it of [item(0, 10), item(1, 20)]) await s.put(it);
    const out = await flushQueue(s, async (i) => (i.setIndex === 0 ? { ok: false, error: 'Invalid set' } : { ok: true }), () => true);
    expect(out.failed).toEqual([{ key: setKey(PE, 0), error: 'Invalid set' }]);
    expect(out.synced).toEqual([setKey(PE, 1)]);
    expect(await s.all()).toEqual([]);
  });

  it('treats a non-network throw as a rejection, not a pause', async () => {
    const s = memoryStore();
    await s.put(item(0, 10));
    const out = await flushQueue(s, async () => {
      throw new Error('boom');
    }, () => true);
    expect(out.failed).toHaveLength(1);
    expect(out.remaining).toBe(0);
  });

  it('a replayed set that already reached the server is harmless (idempotent send)', async () => {
    const server = new Map<string, number>();
    const send = async (i: QueuedSetInput) => {
      server.set(setKey(i.plannedExerciseId, i.setIndex), i.reps); // upsert on the natural key
      return { ok: true as const };
    };
    const s = memoryStore();
    await s.put(item(0, 10));
    await send(input(0)); // the live request did arrive, late
    await flushQueue(s, send, () => true);
    expect(server.size).toBe(1);
  });
});

describe('isNetworkError', () => {
  it('is always true when the browser says offline', () => {
    expect(isNetworkError(new Error('anything'), false)).toBe(true);
  });
  it('recognises fetch failures across browsers', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'), true)).toBe(true);
    expect(isNetworkError(new TypeError('Load failed'), true)).toBe(true);
    expect(isNetworkError(new Error('NetworkError when attempting to fetch resource.'), true)).toBe(true);
    expect(isNetworkError(new OfflineTimeoutError(10), true)).toBe(true);
  });
  it('does not treat server errors as offline', () => {
    expect(isNetworkError(new Error('An error occurred in the Server Components render.'), true)).toBe(false);
    expect(isNetworkError('nope', true)).toBe(false);
  });
});

describe('withTimeout', () => {
  it('rejects with OfflineTimeoutError when the promise hangs', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 1000);
    vi.advanceTimersByTime(1001);
    await expect(p).rejects.toBeInstanceOf(OfflineTimeoutError);
    vi.useRealTimers();
  });
  it('passes through results and errors', async () => {
    await expect(withTimeout(Promise.resolve(5), 1000)).resolves.toBe(5);
    await expect(withTimeout(Promise.reject(new Error('x')), 1000)).rejects.toThrow('x');
  });
});

describe('localDay', () => {
  it('formats the local calendar day', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
