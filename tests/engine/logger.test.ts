import { describe, expect, it } from 'vitest';
import { EXPECTED_SESSIONS_PER_LOAD_JUMP, loadPace, sessionsAtLoad, suggestNextSession } from '@/lib/engine/progression';
import { canAddSet, MAX_SETS_PER_EXERCISE, REST_RESTORE_MAX_MS, restoreRest, sessionMuscleSets, weekTotals } from '@/lib/engine/session';
import { isValidSwap, swapOptions, SWAP_OPTION_LIMIT } from '@/lib/engine/swap';
import { exposuresFor } from '@/lib/engine/block';
import { bestRecentE1rm } from '@/lib/engine/e1rm';
import { loggedMuscleSets } from '@/lib/engine/counting';
import { FREQUENCY } from '@/lib/knowledge/constants';
import { SEED_EXERCISES } from '@/lib/knowledge/exercises';
import type { ExerciseHistory, LoggedSet } from '@/lib/engine/types';
import { exById } from './helpers';

const exp = (loads: (number | null)[], reps = 8): ExerciseHistory['exposures'] =>
  loads.map((load, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, sets: [{ load, reps, rir: 2 }] }));
const rx = { repMin: 6, repMax: 10, rirMin: 1, rirMax: 3 };

describe('T-PRG-06 load pace', () => {
  it('counts sessions since the load last went up', () => {
    expect(sessionsAtLoad([])).toBe(0);
    expect(sessionsAtLoad(exp([50, 52.5, 52.5, 52.5]))).toBe(3);
    expect(sessionsAtLoad(exp([50, 50, 50]))).toBe(3);
    expect(sessionsAtLoad(exp([60, 55, 55]))).toBe(3); // a drop doesn't reset the clock
    expect(sessionsAtLoad(exp([50, null, 50]))).toBe(1);
  });

  it('flags a stall at twice the expected pace per status', () => {
    expect(loadPace(exp(Array(4).fill(50)), 'novice').stalled).toBe(false);
    expect(loadPace(exp(Array(5).fill(50)), 'novice').stalled).toBe(true);
    expect(loadPace(exp(Array(9).fill(50)), 'intermediate').stalled).toBe(false);
    expect(loadPace(exp(Array(10).fill(50)), 'intermediate')).toEqual({ sessions: 10, expected: EXPECTED_SESSIONS_PER_LOAD_JUMP.intermediate, stalled: true });
    expect(loadPace(exp(Array(19).fill(50)), 'advanced').stalled).toBe(false);
  });

  it('adds a T-PRG-06 hint to a same-load suggestion only when stalled and status is known', () => {
    const stalled = { exposures: exp(Array(5).fill(50)), increment: 2.5, status: 'novice' as const };
    const s = suggestNextSession(stalled, rx);
    expect(s.load).toBe(50);
    expect(s.ruleIds).toContain('T-PRG-06');
    expect(s.hint).toMatch(/5 sessions at this load/);
    expect(suggestNextSession({ ...stalled, status: undefined }, rx).ruleIds).not.toContain('T-PRG-06');
    // A load jump this session wins over the pace note.
    const top = suggestNextSession({ exposures: exp(Array(5).fill(50), 10).map((e) => ({ ...e, sets: [{ load: 50, reps: 10, rir: 3 }] })), increment: 2.5, status: 'novice' }, rx);
    expect(top.load).toBe(52.5);
    expect(top.ruleIds).not.toContain('T-PRG-06');
  });
});

describe('warm-ups never feed analytics (T-VOL-06)', () => {
  const set = (o: Partial<LoggedSet>): LoggedSet => ({ exerciseId: 'bench-press', performedOn: '2026-10-26', setIndex: 0, loadKg: 100, reps: 5, rir: 2, isWarmup: false, sessionId: 's1', ...o });
  const sets = [set({ isWarmup: true, loadKg: 140, reps: 8, rir: 0 }), set({ isWarmup: true, setIndex: 1, loadKg: 60 }), set({})];

  it('exposures, e1RM and set counts ignore warm-up rows sharing a set_index', () => {
    expect(exposuresFor(sets, 'bench-press')[0].sets).toEqual([{ load: 100, reps: 5, rir: 2 }]);
    expect(bestRecentE1rm(sets, 'bench-press')).toBeCloseTo((100 * 36) / 30);
    const exMap = new Map(SEED_EXERCISES.map((e) => [e.id, e]));
    expect(loggedMuscleSets(sets, exMap, '2026-10-26').chest).toBe(1);
  });
});

describe('session logger helpers', () => {
  it('caps sets per exercise at the T-FRQ-01 per-session ceiling', () => {
    expect(MAX_SETS_PER_EXERCISE).toBe(FREQUENCY.maxSetsPerMusclePerSession);
    expect(canAddSet(MAX_SETS_PER_EXERCISE - 1)).toBe(true);
    expect(canAddSet(MAX_SETS_PER_EXERCISE)).toBe(false);
  });

  it('counts session sets fractionally and adds earlier weekly sets', () => {
    const muscles = [
      { muscle: 'chest' as const, role: 'primary' as const },
      { muscle: 'triceps' as const, role: 'secondary' as const },
    ];
    const session = sessionMuscleSets([{ muscles, sets: [{ load: 80, reps: 8, rir: 2 }, { load: 80, reps: 3, rir: 0 }, { load: 80, reps: 8, rir: 5 }, { load: 80, reps: 8, rir: null }] }]);
    expect(session).toEqual({ chest: 2, triceps: 1 });
    expect(weekTotals({ chest: 6, back: 4 }, session)).toEqual([
      { muscle: 'chest', session: 2, week: 8 },
      { muscle: 'triceps', session: 1, week: 1 },
    ]);
  });

  it('restores a saved rest timer only when it is valid and fresh', () => {
    const now = 1_800_000_000_000;
    const ok = { start: now - 60_000, target: 120, name: 'Bench' };
    expect(restoreRest(JSON.stringify(ok), now)).toEqual(ok);
    expect(restoreRest(null, now)).toBeNull();
    expect(restoreRest('{not json', now)).toBeNull();
    expect(restoreRest(JSON.stringify({ ...ok, target: '120' }), now)).toBeNull();
    expect(restoreRest(JSON.stringify({ ...ok, start: now + 5000 }), now)).toBeNull();
    expect(restoreRest(JSON.stringify({ ...ok, start: now - REST_RESTORE_MAX_MS - 1 }), now)).toBeNull();
  });

  it('only accepts swaps the logger offers', () => {
    const ctx = { exercises: SEED_EXERCISES, equipment: ['dumbbell' as const, 'bodyweight' as const], injuries: [], disliked: [] };
    const rdl = exById.get('romanian-deadlift')!;
    const opts = swapOptions(rdl, ctx);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.length).toBeLessThanOrEqual(SWAP_OPTION_LIMIT);
    expect(isValidSwap(rdl, opts[0].id, ctx)).toBe(true);
    expect(isValidSwap(rdl, 'bench-press', ctx)).toBe(false); // different muscle
    expect(isValidSwap(rdl, rdl.id, ctx)).toBe(false);
    expect(isValidSwap(rdl, opts[0].id, { ...ctx, disliked: [opts[0].id] })).toBe(false);
  });
});
