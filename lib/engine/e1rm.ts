// Estimated 1RM (Section 6.16) and load-at-RPE (6.11). Brzycki on effective reps [GEN].
import type { LoggedSet } from './types';
import { roundToStep } from './util';

/** e1RM from a set; effective reps r = reps + RIR. No estimate above 12 effective reps. */
export function e1rm(load: number | null | undefined, reps: number, rir?: number | null): number | null {
  if (load == null || load <= 0 || reps <= 0) return null;
  const r = reps + (rir ?? 0);
  if (r > 12) return null;
  return (load * 36) / (37 - r);
}

/** Load for `reps` at a target RPE: pct = (37 − (reps + (10 − rpe))) / 36. */
export function loadAtRpe(e1rmKg: number, reps: number, rpe: number, increment: number): number {
  const pct = (37 - (reps + (10 - rpe))) / 36;
  return roundToStep(e1rmKg * pct, increment);
}

/** Load you could lift for `targetEffectiveReps` (reps + RIR) given an e1RM (6.10, no history case). */
export function e1rmToLoad(e1rmKg: number, targetEffectiveReps: number, increment: number): number {
  const r = Math.min(12, Math.max(1, targetEffectiveReps));
  return roundToStep((e1rmKg * (37 - r)) / 36, increment);
}

/** Best e1RM over the last `n` exposures (dates) of an exercise. */
export function bestRecentE1rm(sets: LoggedSet[], exerciseId: string, n = 3): number | null {
  const working = sets.filter((s) => s.exerciseId === exerciseId && !s.isWarmup);
  const dates = [...new Set(working.map((s) => s.performedOn))].sort().slice(-n);
  let best: number | null = null;
  for (const s of working) {
    if (!dates.includes(s.performedOn)) continue;
    const v = e1rm(s.loadKg, s.reps, s.rir);
    if (v != null && (best == null || v > best)) best = v;
  }
  return best;
}

export function round1(x: number | null): number | null {
  return x == null ? null : Math.round(x * 10) / 10;
}
