// Pure helpers for the live session logger (Section 8.3): set cap, finish summary, rest timer.
import { FREQUENCY } from '@/lib/knowledge/constants';
import { muscleWeight, setCounts } from './counting';
import type { ExerciseMuscle, MuscleId } from './types';

/**
 * "Add set" cap per exercise. Every set of an exercise trains its primary muscle, and past ~11 sets for one
 * muscle in one session extra sets are mostly junk volume (T-FRQ-01), so one exercise can't go past that.
 */
export const MAX_SETS_PER_EXERCISE = FREQUENCY.maxSetsPerMusclePerSession;

export const canAddSet = (current: number) => current < MAX_SETS_PER_EXERCISE;

export interface SummarySet {
  load: number | null;
  reps: number;
  rir: number | null;
}

/** Fractional counted sets per muscle (T-VOL-05/06) for working sets logged in this session. */
export function sessionMuscleSets(items: { muscles: ExerciseMuscle[]; sets: SummarySet[] }[]): Partial<Record<MuscleId, number>> {
  const out: Partial<Record<MuscleId, number>> = {};
  for (const it of items) {
    for (const s of it.sets) {
      if (!setCounts({ reps: s.reps, rir: s.rir, isWarmup: false })) continue;
      for (const m of it.muscles) out[m.muscle] = (out[m.muscle] ?? 0) + muscleWeight(it, m.muscle);
    }
  }
  return out;
}

/** Week totals for the muscles trained today: sets logged earlier this week plus this session. */
export function weekTotals(
  earlier: Partial<Record<MuscleId, number>>,
  session: Partial<Record<MuscleId, number>>,
): { muscle: MuscleId; session: number; week: number }[] {
  return (Object.keys(session) as MuscleId[]).map((m) => ({ muscle: m, session: session[m]!, week: (earlier[m] ?? 0) + session[m]! }));
}

// ---------------------------------------------------------------------------
// Rest timer persistence: the running timer is kept in localStorage per session so a reload doesn't lose it.
// ---------------------------------------------------------------------------
export interface RestState {
  start: number;
  target: number;
  name: string;
}

/** A saved timer older than this is stale (the user left the gym or forgot to dismiss it). */
export const REST_RESTORE_MAX_MS = 30 * 60 * 1000;

export const restStorageKey = (sessionId: string) => `pc:rest:${sessionId}`;

/** Parses a stored timer; null when missing, malformed, in the future or stale. */
export function restoreRest(raw: string | null, now: number): RestState | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const { start, target, name } = v as Record<string, unknown>;
  if (typeof start !== 'number' || typeof target !== 'number' || typeof name !== 'string') return null;
  if (!Number.isFinite(start) || start > now || now - start > REST_RESTORE_MAX_MS) return null;
  return { start, target, name };
}
