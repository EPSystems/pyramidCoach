// Plateau detection and flowchart (Section 6.12.5). Rules: T-PRG-06, T-VOL-07, T-FAT-01.
import { PLATEAU_WINDOW, VOLUME } from '@/lib/knowledge/constants';
import { e1rm } from './e1rm';
import type { ExerciseDef, Goal, LoggedSet, MuscleId, NutritionPhase, Proposal, Status, TrackedMuscle } from './types';
import { TRACKED_MUSCLES } from './types';
import { addDays } from './util';

export interface ProgressState {
  today: string;
  status: Status;
  goal: Goal;
  sets: LoggedSet[];
  exercises: ExerciseDef[];
  anchorExerciseIds: string[];
  mainLiftExerciseIds: string[];
  sleepAvg7: number | null;
  nutritionPhase: NutritionPhase;
  lastReviewYesCount: number | null;
  /** Exposures per week of each exercise in the current plan. */
  weeklyFrequency: Record<string, number>;
  targets: Partial<Record<TrackedMuscle, number>>;
}

/** Anchor metric per exposure: best e1RM for main lifts, first-set e1RM for everything else. */
function metricSeries(sets: LoggedSet[], exId: string, main: boolean): { date: string; v: number }[] {
  const byDay = new Map<string, LoggedSet[]>();
  for (const s of sets) {
    if (s.exerciseId !== exId || s.isWarmup) continue;
    byDay.set(s.performedOn, [...(byDay.get(s.performedOn) ?? []), s]);
  }
  const out: { date: string; v: number }[] = [];
  for (const [date, ss] of [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const sorted = ss.sort((a, b) => a.setIndex - b.setIndex);
    const vals = (main ? sorted : sorted.slice(0, 1)).map((s) => e1rm(s.loadKg, s.reps, s.rir)).filter((x): x is number => x != null);
    if (vals.length) out.push({ date, v: Math.max(...vals) });
  }
  return out;
}

export function isPlateaued(series: { date: string; v: number }[], status: Status, today: string): boolean {
  if (status === 'novice') {
    const n = PLATEAU_WINDOW.novice.exposures;
    if (series.length < n + 1) return false;
    const before = Math.max(...series.slice(0, series.length - n).map((x) => x.v));
    return series.slice(-n).every((x) => x.v <= before + 1e-9);
  }
  const weeks = status === 'advanced' ? PLATEAU_WINDOW.advanced.weeks : PLATEAU_WINDOW.intermediate.weeks;
  const cutoff = addDays(today, -weeks * 7);
  const before = series.filter((x) => x.date < cutoff);
  const recent = series.filter((x) => x.date >= cutoff);
  if (!before.length || recent.length < 2) return false;
  return Math.max(...recent.map((x) => x.v)) <= Math.max(...before.map((x) => x.v)) + 1e-9;
}

export function detectPlateaus(state: ProgressState): Proposal[] {
  const exMap = new Map(state.exercises.map((e) => [e.id, e]));
  const proposals: Proposal[] = [];
  const expires = addDays(state.today, 7);
  for (const id of state.anchorExerciseIds) {
    const ex = exMap.get(id);
    if (!ex) continue;
    const series = metricSeries(state.sets, id, state.mainLiftExerciseIds.includes(id));
    if (!isPlateaued(series, state.status, state.today)) continue;

    // Step 1: basics checklist.
    const fixes: string[] = [];
    if (state.sleepAvg7 != null && state.sleepAvg7 < 7) fixes.push(`you're sleeping ${state.sleepAvg7.toFixed(1)} h (aim for 7+)`);
    if (state.nutritionPhase === 'loss') fixes.push("you're in a calorie deficit, which slows strength gains");
    if (state.goal === 'strength' && ex.isMainLift && (state.weeklyFrequency[id] ?? 0) < 2) fixes.push('train this lift at least twice a week');
    const questions = 'Also check: protein ≥1.6 g/kg most days, honest RIR ratings, and the same range of motion and tempo each session.';
    if (fixes.length) {
      proposals.push({
        kind: 'plateau_action',
        title: `${ex.name} has stalled: fix the basics first`,
        rationale: `No progress on ${ex.name} for longer than expected for a ${state.status} lifter. Before changing the program: ${fixes.join('; ')}. ${questions}`,
        ruleIds: ['T-PRG-06'],
        payload: { exerciseId: id, step: 'fix_basics', details: fixes.join('; ') },
        expiresOn: expires,
      });
      continue;
    }
    // Step 2: recovering?
    if ((state.lastReviewYesCount ?? 0) >= 2) {
      proposals.push({
        kind: 'plateau_action',
        title: `${ex.name} has stalled: deload first`,
        rationale: `Your basics look fine but recovery flags are up. Deload for a week; if fatigue returns quickly, reduce or reorganise volume. ${questions}`,
        ruleIds: ['T-PRG-06', 'T-FAT-01', 'T-FAT-03'],
        payload: { exerciseId: id, step: 'deload', details: 'recovery flags ≥ 2' },
        expiresOn: expires,
      });
      continue;
    }
    const muscles = ex.muscles
      .filter((m) => m.role === 'primary' && (TRACKED_MUSCLES as readonly string[]).includes(m.muscle))
      .map((m) => m.muscle as TrackedMuscle)
      .filter((m) => (state.targets[m] ?? 0) + VOLUME.plateauAddSets <= VOLUME.normalCap);
    if (!muscles.length) continue;
    proposals.push({
      kind: 'plateau_action',
      title: `${ex.name} has stalled: add 2 sets/week for ${muscles.join(', ')}`,
      rationale: `Sleep, nutrition and recovery look good, so the next step is a bit more volume: +2 weekly sets for ${muscles.join(', ')}. ${questions}`,
      ruleIds: ['T-PRG-06', 'T-VOL-07'],
      payload: {
        exerciseId: id,
        step: 'add_volume',
        details: `+${VOLUME.plateauAddSets} sets/week`,
        changes: muscles.map((m) => ({ muscle: m, from: state.targets[m] ?? 0, to: (state.targets[m] ?? 0) + VOLUME.plateauAddSets })),
      },
      expiresOn: expires,
    });
  }
  return proposals;
}

export type { MuscleId };
