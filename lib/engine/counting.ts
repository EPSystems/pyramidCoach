// Fractional set counting (T-VOL-05) and the "does this set count" rule (T-VOL-06).
import { VOLUME } from '@/lib/knowledge/constants';
import { ALL_MUSCLES, type ExerciseDef, type LoggedSet, type MuscleId } from './types';
import { addDays } from './util';

export function muscleWeight(ex: Pick<ExerciseDef, 'muscles'>, m: MuscleId): number {
  const em = ex.muscles.find((x) => x.muscle === m);
  if (!em) return 0;
  return em.role === 'primary' ? VOLUME.fractional.primary : VOLUME.fractional.secondary;
}

/** Fractional sets per muscle for `sets` sets of an exercise. */
export function fractionalSets(ex: Pick<ExerciseDef, 'muscles'>, sets: number): Partial<Record<MuscleId, number>> {
  const out: Partial<Record<MuscleId, number>> = {};
  for (const em of ex.muscles) {
    out[em.muscle] = (out[em.muscle] ?? 0) + sets * (em.role === 'primary' ? VOLUME.fractional.primary : VOLUME.fractional.secondary);
  }
  return out;
}

/** T-VOL-06: ≥4 reps, ≤4 RIR, not a warm-up. */
export function setCounts(s: Pick<LoggedSet, 'reps' | 'rir' | 'isWarmup'>): boolean {
  if (s.isWarmup) return false;
  if (s.reps < VOLUME.countingMinReps) return false;
  if (s.rir != null && s.rir > VOLUME.countingMaxRir) return false;
  return true;
}

export function emptyMuscleMap(): Record<MuscleId, number> {
  return Object.fromEntries(ALL_MUSCLES.map((m) => [m, 0])) as Record<MuscleId, number>;
}

/** Logged fractional sets per muscle between [from, from+days). */
export function loggedMuscleSets(
  sets: LoggedSet[],
  exercises: Map<string, Pick<ExerciseDef, 'muscles'>>,
  from: string,
  days = 7,
): Record<MuscleId, number> {
  const to = addDays(from, days);
  const out = emptyMuscleMap();
  for (const s of sets) {
    if (s.performedOn < from || s.performedOn >= to) continue;
    if (!setCounts(s)) continue;
    const ex = exercises.get(s.exerciseId);
    if (!ex) continue;
    for (const em of ex.muscles) out[em.muscle] += muscleWeight(ex, em.muscle);
  }
  return out;
}
