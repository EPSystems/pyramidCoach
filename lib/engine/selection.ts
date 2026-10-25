// Exercise selection (Section 6.7). Rules: T-SEL-02…08, T-SEL-07.
import type { Slot } from './split';
import type { Equipment, ExerciseDef, Injury, MainLift, MuscleId, SlotTag } from './types';

export interface SelectionContext {
  exercises: ExerciseDef[];
  equipment: Equipment[];
  injuries: Injury[];
  disliked: string[];
  previous?: Record<string, string>; // slotKey → exerciseId (stability, T-SEL-06)
  sportPriority?: boolean;
  /** Exercises already used elsewhere this week — mildly deprioritised for variety (1–3 per pattern, T-SEL-01). */
  usedThisWeek?: Set<string>;
}

const MAIN_DEFAULT: Record<MainLift, string[]> = {
  squat: ['back-squat', 'low-bar-squat', 'safety-bar-squat'],
  bench: ['bench-press'],
  deadlift: ['conventional-deadlift', 'sumo-deadlift'],
  ohp: ['overhead-press'],
};

/** Muscles with pain/injury severity that restrict exercise choice (T-SEL-08). */
export function painfulMuscles(injuries: Injury[]): MuscleId[] {
  return injuries
    .filter((i) => i.status !== 'resolved' && (i.severity === 'pain' || i.severity === 'injury') && i.muscleId)
    .map((i) => i.muscleId as MuscleId);
}

export function isPrimary(ex: ExerciseDef, m: MuscleId): boolean {
  return ex.muscles.some((x) => x.muscle === m && x.role === 'primary');
}

export function hasEquipment(ex: ExerciseDef, equipment: Equipment[]): boolean {
  return ex.equipment.some((e) => equipment.includes(e));
}

/** T-SEL-04 / T-SEL-08 feasibility. */
export function isFeasible(ex: ExerciseDef, ctx: Pick<SelectionContext, 'equipment' | 'injuries' | 'disliked'>): boolean {
  if (!hasEquipment(ex, ctx.equipment)) return false;
  if (ctx.disliked.includes(ex.id)) return false;
  for (const inj of ctx.injuries) {
    if (inj.status === 'resolved') continue;
    if (inj.avoidExerciseIds.includes(ex.id)) return false;
  }
  for (const m of painfulMuscles(ctx.injuries)) {
    if (isPrimary(ex, m) && (ex.axialLoad || ex.impactLowerBody)) return false;
  }
  return true;
}

function tagRank(ex: ExerciseDef, tags: SlotTag[]): number {
  let best = Infinity;
  for (const t of ex.slotTags) {
    const i = tags.indexOf(t);
    if (i >= 0 && i < best) best = i;
  }
  return best;
}

/** Deterministic candidate ordering for a slot. */
export function rankCandidates(slot: Pick<Slot, 'tags' | 'prefer' | 'key'>, ctx: SelectionContext, exclude: Set<string>): ExerciseDef[] {
  const pain = painfulMuscles(ctx.injuries);
  const prevId = ctx.previous?.[slot.key];
  const candidates = ctx.exercises.filter((ex) => !exclude.has(ex.id) && tagRank(ex, slot.tags) < Infinity && isFeasible(ex, ctx));
  const key = (ex: ExerciseDef): (number | string)[] => {
    const painArea = pain.some((m) => isPrimary(ex, m));
    // T-SEL-08: near a painful area prefer isolation, then machines, then free weights.
    const painRank = !painArea
      ? 0
      : ex.category === 'isolation'
        ? 0
        : ex.category === 'lower_machine_compound' || ex.category === 'upper_machine_press'
          ? 1
          : 2;
    return [
      ex.id === prevId && !painArea ? 0 : 1, // T-SEL-06 stability
      painRank,
      tagRank(ex, slot.tags),
      ctx.sportPriority && ex.axialLoad ? 1 : 0, // T-PRI-01 / S-05 lower-risk choices
      slot.prefer ? (slot.prefer.indexOf(ex.category) === -1 ? 99 : slot.prefer.indexOf(ex.category)) : 0,
      ctx.usedThisWeek?.has(ex.id) ? 1 : 0,
      ex.longLengthBias ? 0 : 1, // T-SEL-03
      ex.custom ? 1 : 0,
      ex.popularity,
      ex.slug,
    ];
  };
  return candidates
    .map((ex) => ({ ex, k: key(ex) }))
    .sort((a, b) => {
      for (let i = 0; i < a.k.length; i++) {
        if (a.k[i] < b.k[i]) return -1;
        if (a.k[i] > b.k[i]) return 1;
      }
      return 0;
    })
    .map((x) => x.ex);
}

export function selectForSlot(slot: Slot, ctx: SelectionContext, exclude: Set<string>): ExerciseDef | null {
  return rankCandidates(slot, ctx, exclude)[0] ?? null;
}

/** T-SEL-07: the main lift itself (or the closest feasible variation). */
export function selectMainLift(lift: MainLift, ctx: SelectionContext): ExerciseDef | null {
  const prevId = ctx.previous?.[`main_${lift}`];
  const pool = ctx.exercises.filter((e) => e.mainLiftKey === lift && isFeasible(e, ctx));
  if (prevId) {
    const p = pool.find((e) => e.id === prevId);
    if (p) return p;
  }
  for (const slug of MAIN_DEFAULT[lift]) {
    const e = pool.find((x) => x.slug === slug);
    if (e) return e;
  }
  return pool.sort((a, b) => a.popularity - b.popularity)[0] ?? null;
}

/** Isolation tag used when the distributor needs to add an exercise for a muscle (6.8). */
export const ISOLATION_TAG_FOR: Partial<Record<MuscleId, SlotTag[]>> = {
  chest: ['chest_iso'],
  back: ['pullover', 'pull_vertical'],
  side_delts: ['lat_raise'],
  rear_delts: ['rear_delt'],
  biceps: ['biceps_iso'],
  triceps: ['triceps_iso'],
  quads: ['leg_ext', 'squat_machine'],
  hamstrings: ['leg_curl', 'leg_curl_seated'],
  glutes: ['hip_ext'],
  calves: ['calf'],
};

/** Substitutions for the logger's Swap exercise (6.15): same primary muscle, feasible. */
export function substitutionsFor(ex: ExerciseDef, ctx: Pick<SelectionContext, 'exercises' | 'equipment' | 'injuries' | 'disliked'>): ExerciseDef[] {
  const primaries = ex.muscles.filter((m) => m.role === 'primary').map((m) => m.muscle);
  const listed = ex.substitutions
    .map((slug) => ctx.exercises.find((e) => e.slug === slug))
    .filter((e): e is ExerciseDef => !!e);
  const sameSlot = ctx.exercises.filter((e) => e.id !== ex.id && e.slotTags.some((t) => ex.slotTags.includes(t)));
  const out: ExerciseDef[] = [];
  for (const e of [...listed, ...sameSlot]) {
    if (e.id === ex.id || out.some((o) => o.id === e.id)) continue;
    if (!isFeasible(e, ctx)) continue;
    if (!primaries.some((m) => isPrimary(e, m))) continue;
    out.push(e);
  }
  return out;
}
