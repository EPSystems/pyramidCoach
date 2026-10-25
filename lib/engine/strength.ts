// Strength phases for main lifts (Section 6.11). Rules: T-STR-01…05, T-FRQ-03.
import { BLOCK_WEEKS, STRENGTH } from '@/lib/knowledge/constants';
import { loadAtRpe } from './e1rm';
import type { BlockKind, Goal } from './types';
import { daysBetween } from './util';

const halfStep = (x: number) => Math.round(x * 2) / 2;

function progress(weekIndex: number, weeks: number): number {
  return weeks <= 1 ? 1 : weekIndex / (weeks - 1);
}

/** RPE of the top single for a week of a phase. */
export function singleRpe(kind: BlockKind, weekIndex: number, weeks: number): number {
  const t = progress(weekIndex, weeks);
  if (kind === 'strength_load') return halfStep(STRENGTH.load.rpe[0] + (STRENGTH.load.rpe[1] - STRENGTH.load.rpe[0]) * t);
  if (kind === 'strength_peak') return halfStep(STRENGTH.peak.rpe[0] + (STRENGTH.peak.rpe[1] - STRENGTH.peak.rpe[0]) * t);
  return halfStep(STRENGTH.volume.rpe[0] + (STRENGTH.volume.rpe[1] - STRENGTH.volume.rpe[0]) * t);
}

/** Back-off reps for Load (5 → 3) and Peak (4 → 2) phases. */
export function backoffReps(kind: BlockKind, weekIndex: number, weeks: number): number {
  const t = progress(weekIndex, weeks);
  const [a, b] = kind === 'strength_peak' ? STRENGTH.peak.reps : STRENGTH.load.backoffReps;
  return Math.round(a + (b - a) * t);
}

export function backoffSets(kind: BlockKind, weekIndex: number, weeks: number): number {
  if (kind === 'strength_load') return STRENGTH.load.backoffSets;
  if (kind === 'strength_peak') return Math.max(0, Math.round(2 - 2 * progress(weekIndex, weeks)));
  return 0;
}

/** Peak length: 2 weeks if Volume+Load lasted 10–12 weeks, 3 if 13–15, 4 if 16+. */
export function peakWeeks(volumeLoadWeeks: number): number {
  if (volumeLoadWeeks >= 16) return 4;
  if (volumeLoadWeeks >= 13) return 3;
  return 2;
}

export function singleLoad(e1rmKg: number | null | undefined, rpe: number, increment: number): number | null {
  if (!e1rmKg) return null;
  return loadAtRpe(e1rmKg, 1, rpe, increment);
}

export function backoffLoad(e1rmKg: number | null | undefined, reps: number, rpe: number, increment: number): number | null {
  if (!e1rmKg) return null;
  return loadAtRpe(e1rmKg, reps, rpe, increment);
}

/** Which block kind comes next (T-STR-01). */
export function nextStrengthKind(current: BlockKind, testDate: string | null | undefined, today: string): BlockKind {
  if (current === 'strength_volume') return 'strength_load';
  if (current === 'strength_load') {
    if (testDate && daysBetween(today, testDate) > 0 && daysBetween(today, testDate) <= 5 * 7) return 'strength_peak';
    return 'strength_volume';
  }
  return 'strength_volume';
}

export function defaultBlockKind(goal: Goal): BlockKind {
  if (goal === 'strength') return 'strength_volume';
  if (goal === 'sport_support') return 'sport_support';
  return 'hypertrophy';
}

export function blockWeeks(kind: BlockKind, opts?: { volumeLoadWeeks?: number }): number {
  if (kind === 'strength_peak') return peakWeeks(opts?.volumeLoadWeeks ?? STRENGTH.volume.defaultWeeks + STRENGTH.load.defaultWeeks);
  return BLOCK_WEEKS[kind];
}

export const isStrengthKind = (k: BlockKind) => k === 'strength_volume' || k === 'strength_load' || k === 'strength_peak';
