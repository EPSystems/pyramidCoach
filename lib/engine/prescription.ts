// Prescription: reps, RIR, rest (Section 6.9). Rules: T-INT-01…05, T-RST-01/02, T-RIR-01.
import { INTENSITY, REST_SECONDS, SUB_RANGES, type RepRange } from '@/lib/knowledge/constants';
import type { Category, ExerciseDef, RepVariation } from './types';

export type RangeLevel = 'low' | 'mid' | 'high';

export const isCompound = (c: Category) => c !== 'isolation';

export function restFor(ex: Pick<ExerciseDef, 'category'>, opts?: { strengthMain?: boolean }): number {
  if (opts?.strengthMain) return REST_SECONDS.strengthMain;
  if (ex.category === 'lower_free_compound') return REST_SECONDS.lowerFreeCompound;
  if (ex.category === 'isolation') return REST_SECONDS.isolation;
  return REST_SECONDS.compound;
}

export function subRange(category: Category, level: RangeLevel): RepRange {
  const sr = SUB_RANGES[category] as Record<string, RepRange>;
  if (category === 'isolation') return level === 'high' ? sr.high : sr.mid;
  return level === 'low' ? sr.low : sr.mid;
}

/** Decide the range level for an exercise in a session (T-INT-04). */
export function rangeLevel(opts: {
  category: Category;
  compoundIndex: number; // index among compounds in the session (0-based), -1 for isolations
  isolationIndex: number; // index among isolations, -1 for compounds
  variation: RepVariation;
  variant: 'A' | 'B';
  weekIndex: number;
}): RangeLevel {
  const { category, compoundIndex, isolationIndex, variation, variant, weekIndex } = opts;
  if (variation === 'within_session') {
    if (category === 'isolation') return isolationIndex % 2 === 0 ? 'mid' : 'high';
    return compoundIndex === 0 ? 'low' : 'mid';
  }
  const heavy = variation === 'between_session' ? variant === 'A' : weekIndex % 2 === 0;
  if (category === 'isolation') return heavy ? 'mid' : 'high';
  return heavy ? 'low' : 'mid';
}

export interface RxOptions {
  level: RangeLevel;
  sportPriority: boolean;
  isLowerCompound: boolean;
}

/** Rep range, RIR range and rest for one exercise. */
export function prescribe(ex: Pick<ExerciseDef, 'category'>, opts: RxOptions): {
  repMin: number;
  repMax: number;
  rirMin: number;
  rirMax: number;
  restSeconds: number;
  ruleIds: string[];
} {
  const ruleIds = ['T-INT-03', 'T-INT-04', 'T-RST-02'];
  let level = opts.level;
  if (opts.sportPriority && opts.isLowerCompound && level === 'low') {
    level = 'mid'; // T-INT-05: drop the heaviest sub-range on leg compounds
  }
  const [repMin, repMax] = subRange(ex.category, level);
  const base = INTENSITY[ex.category];
  let [rirMin, rirMax] = base.rir;
  if (opts.sportPriority) {
    rirMin += INTENSITY.sportPriorityRirBump;
    rirMax += INTENSITY.sportPriorityRirBump;
    ruleIds.push('T-INT-05');
  }
  return { repMin, repMax, rirMin, rirMax, restSeconds: restFor(ex), ruleIds };
}

/** Short human-readable prescription, e.g. "3 × 8–12 @ 2–0 RIR". */
export function formatRx(rx: { sets: number; repMin: number; repMax: number; rirMin: number; rirMax: number }): string {
  const reps = rx.repMin === rx.repMax ? `${rx.repMin}` : `${rx.repMin}–${rx.repMax}`;
  const rir = rx.rirMin === rx.rirMax ? `${rx.rirMin}` : `${rx.rirMax}–${rx.rirMin}`;
  return `${rx.sets} × ${reps} @ ${rir} RIR`;
}

/** RPE ↔ RIR (T-RIR-01). */
export const rpeToRir = (rpe: number) => Math.max(0, 10 - rpe);
export const rirToRpe = (rir: number) => Math.min(10, 10 - rir);

/** T-RIR-01: show the underestimation hint on high-rep sets. */
export const showRirHint = (repMax: number) => repMax > 12;

/** Warm-up ramp for compounds ≥ 40 kg (T-WUP-01). */
export function warmupRamp(workingLoad: number, increment: number): { load: number; reps: number }[] {
  if (workingLoad < 40) return [];
  const r = (x: number) => Math.round((workingLoad * x) / increment) * increment;
  return [
    { load: r(0.5), reps: 8 },
    { load: r(0.7), reps: 4 },
    { load: r(0.85), reps: 2 },
  ];
}
