import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { generateSession } from '@/lib/engine/generator';
import { detectPlateaus, isPlateaued } from '@/lib/engine/plateau';
import { inferTrainingStatus, statusFromYears } from '@/lib/engine/status';
import { loggedMuscleSets, setCounts } from '@/lib/engine/counting';
import { runningAverage, trendDirection, weeklyAverages, ratePctPerWeek } from '@/lib/engine/trend';
import { applyProposal, validateProposal } from '@/lib/engine/proposals';
import { nutritionTargets, phaseForGoal, sessionKcalFromRpe, defaultRatePct } from '@/lib/engine/nutrition';
import { formatRx, warmupRamp, showRirHint, rpeToRir, rirToRpe, rangeLevel, restFor } from '@/lib/engine/prescription';
import { substitutionsFor, selectMainLift, isFeasible } from '@/lib/engine/selection';
import { chooseSplit, sessionVariant, templateRegionMuscles } from '@/lib/engine/split';
import { blockWeeks, nextStrengthKind, peakWeeks, defaultBlockKind, backoffSets } from '@/lib/engine/strength';
import { moveWarnings, placeSessions, scorePlacement } from '@/lib/engine/schedule';
import { nudgeLoad, suggestNextSession, suggestNextSet } from '@/lib/engine/progression';
import { computeTargets } from '@/lib/engine/volume';
import { generateBlock } from '@/lib/engine/block';
import { autofillReview, reviewWeekFor, weeklyReview } from '@/lib/engine/fatigue';
import { nutritionReview } from '@/lib/engine/nutrition-review';
import { bestRecentE1rm, e1rmToLoad } from '@/lib/engine/e1rm';
import { TEMPLATES } from '@/lib/engine/split';
import { TRACKED_MUSCLES, type LoggedSet, type TrackedMuscle, type Proposal } from '@/lib/engine/types';
import { SEED_EXERCISES } from '@/lib/knowledge/exercises';
import { RULES, RULE_LIST, ruleSourceLabel } from '@/lib/knowledge/rules';
import { addDays, combinations, median, roundDownToStep, roundUpToStep } from '@/lib/engine/util';
import { baseInput, exById, sport } from './helpers';

const zeroTargets = (n: number) => Object.fromEntries(TRACKED_MUSCLES.map((m) => [m, n])) as Record<TrackedMuscle, number>;

describe('generator (6.15)', () => {
  const base = {
    today: '2026-10-28',
    minutes: 30,
    equipmentPreset: 'dumbbells' as const,
    focus: 'upper' as const,
    readiness: 'normal' as const,
    exercises: SEED_EXERCISES,
    injuries: [],
    increments: { dumbbell: 2 },
    targets: zeroTargets(10),
    loggedThisWeek: {},
    recentPain: [],
    trainedLast48h: {},
    sportStressed: [],
    sets: [],
  };
  it('30-min dumbbells-only upper: ≤5 exercises, respects equipment, fast', () => {
    const t0 = performance.now();
    const g = generateSession(base);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(g.exercises.length).toBeGreaterThan(0);
    expect(g.exercises.length).toBeLessThanOrEqual(5);
    expect(g.estMinutes).toBeLessThanOrEqual(30);
    for (const e of g.exercises) {
      const ex = exById.get(e.exerciseId)!;
      expect(ex.equipment.some((q) => q === 'dumbbell' || q === 'bodyweight')).toBe(true);
      expect(ex.muscles.some((m) => ['quads', 'hamstrings', 'glutes', 'calves'].includes(m.muscle) && m.role === 'primary')).toBe(false);
    }
  });
  it('respects injuries and tired readiness', () => {
    const g = generateSession({ ...base, minutes: 60, equipmentPreset: 'full', focus: 'lower', readiness: 'tired', injuries: [{ id: 'x', muscleId: 'hamstrings', label: 'h', severity: 'pain', status: 'active', avoidExerciseIds: [] }] });
    for (const e of g.exercises) expect(exById.get(e.exerciseId)!.muscles.some((m) => m.muscle === 'hamstrings' && m.role === 'primary')).toBe(false);
    expect(g.notes.some((n) => /Tired/.test(n))).toBe(true);
  });
  it('auto focus prioritises the biggest deficit and picked muscles work', () => {
    const g = generateSession({ ...base, minutes: 45, equipmentPreset: 'full', focus: 'auto', loggedThisWeek: Object.fromEntries(TRACKED_MUSCLES.map((m) => [m, m === 'biceps' ? 0 : 10])) });
    expect(g.muscles[0]).toBe('biceps');
    const picked = generateSession({ ...base, minutes: 45, equipmentPreset: 'custom', equipment: ['cable', 'machine'], focus: ['calves', 'side_delts'] });
    expect(picked.muscles.every((m) => ['calves', 'side_delts'].includes(m))).toBe(true);
    const bw = generateSession({ ...base, equipmentPreset: 'bodyweight', focus: 'full', trainedLast48h: { chest: 8 }, sportStressed: ['quads'] });
    expect(bw.notes.length).toBeGreaterThan(0);
  });
});

function seriesSets(exerciseId: string, start: string, n: number, everyDays: number, f: (i: number) => { load: number; reps: number }): LoggedSet[] {
  return Array.from({ length: n }, (_, i) => ({ exerciseId, performedOn: addDays(start, i * everyDays), setIndex: 0, ...f(i), loadKg: f(i).load, rir: 2, isWarmup: false }));
}

describe('plateau detection (6.12.5)', () => {
  const stalled = seriesSets('bench-press', '2026-08-01', 12, 7, (i) => ({ load: i < 4 ? 80 + i * 2.5 : 87.5, reps: 8 }));
  const state = {
    today: '2026-10-24',
    status: 'intermediate' as const,
    goal: 'lean_gain' as const,
    sets: stalled,
    exercises: SEED_EXERCISES,
    anchorExerciseIds: ['bench-press'],
    mainLiftExerciseIds: [],
    sleepAvg7: 7.5,
    nutritionPhase: 'gain' as const,
    lastReviewYesCount: 0,
    weeklyFrequency: { 'bench-press': 2 },
    targets: { chest: 10, front_delts: 5 },
  };
  it('add_volume when basics and recovery are fine', () => {
    const [p] = detectPlateaus(state);
    expect(p.kind).toBe('plateau_action');
    expect(p.payload).toMatchObject({ step: 'add_volume' });
    const diff = applyProposal({ sessions: [], exercises: SEED_EXERCISES, today: state.today }, p);
    expect(diff.regenerate?.targetAdjustments?.chest).toBe(2);
  });
  it('fix basics when sleep is short or dieting; deload when recovery flags are up', () => {
    expect(detectPlateaus({ ...state, sleepAvg7: 6 })[0].payload).toMatchObject({ step: 'fix_basics' });
    expect(detectPlateaus({ ...state, nutritionPhase: 'loss' })[0].payload).toMatchObject({ step: 'fix_basics' });
    expect(detectPlateaus({ ...state, goal: 'strength', mainLiftExerciseIds: ['bench-press'], weeklyFrequency: {} })[0].payload).toMatchObject({ step: 'fix_basics' });
    const d = detectPlateaus({ ...state, lastReviewYesCount: 3 })[0];
    expect(d.payload).toMatchObject({ step: 'deload' });
    const diff = applyProposal({ sessions: [], exercises: SEED_EXERCISES, today: state.today }, d);
    expect(diff.summary.length).toBeGreaterThan(0);
  });
  it('novice window = 3 exposures; progressing lifts are not plateaued', () => {
    expect(isPlateaued([{ date: 'a', v: 100 }, { date: 'b', v: 100 }, { date: 'c', v: 99 }, { date: 'd', v: 100 }], 'novice', '2026-01-01')).toBe(true);
    expect(isPlateaued([{ date: 'a', v: 100 }, { date: 'b', v: 101 }], 'novice', '2026-01-01')).toBe(false);
    const rising = seriesSets('bench-press', '2026-08-01', 12, 7, (i) => ({ load: 80 + i * 2.5, reps: 8 }));
    expect(detectPlateaus({ ...state, sets: rising })).toHaveLength(0);
    expect(isPlateaued([{ date: '2026-01-01', v: 1 }], 'advanced', '2026-10-01')).toBe(false);
    const fixBasics = detectPlateaus({ ...state, anchorExerciseIds: ['missing'] });
    expect(fixBasics).toHaveLength(0);
  });
});

describe('status inference (T-STA-03)', () => {
  it('needs 8 weeks; classifies novice/intermediate/advanced', () => {
    expect(inferTrainingStatus({ sets: [], today: '2026-10-24', anchorExerciseIds: [] }).status).toBeNull();
    const short = seriesSets('back-squat', '2026-10-01', 4, 3, (i) => ({ load: 100 + i, reps: 5 }));
    expect(inferTrainingStatus({ sets: short, today: '2026-10-24', anchorExerciseIds: ['back-squat'] }).status).toBeNull();
    const nov = seriesSets('back-squat', '2026-07-01', 20, 4, (i) => ({ load: 60 + i * 2.5, reps: 5 }));
    expect(inferTrainingStatus({ sets: nov, today: '2026-10-24', anchorExerciseIds: ['back-squat'] }).status).toBe('novice');
    const mid = seriesSets('back-squat', '2026-07-01', 20, 4, (i) => ({ load: 100 + Math.floor(i / 3) * 2.5, reps: 5 }));
    expect(inferTrainingStatus({ sets: mid, today: '2026-10-24', anchorExerciseIds: ['back-squat'] }).status).toBe('intermediate');
    const adv = seriesSets('back-squat', '2026-07-01', 20, 4, () => ({ load: 140, reps: 5 }));
    expect(inferTrainingStatus({ sets: adv, today: '2026-10-24', anchorExerciseIds: ['back-squat'] }).status).toBe('advanced');
    expect(inferTrainingStatus({ sets: adv.slice(0, 3).map((s) => ({ ...s, performedOn: addDays(s.performedOn, -90) })).concat(adv.slice(0, 2)), today: '2026-10-24', anchorExerciseIds: ['back-squat'] }).status).toBeNull();
    expect(statusFromYears(0.5)).toBe('novice');
    expect(statusFromYears(7)).toBe('intermediate');
    // Advanced only with 5+ years and stalled heavy lifts.
    expect(statusFromYears(6, true)).toBe('advanced');
    expect(statusFromYears(5, true)).toBe('advanced');
    expect(statusFromYears(3, true)).toBe('intermediate');
    expect(statusFromYears(0.5, true)).toBe('novice');
    expect(statusFromYears(6, false)).toBe('intermediate');
  });
});

describe('counting (T-VOL-05/06)', () => {
  it('only sets with ≥4 reps, ≤4 RIR, non-warm-up count', () => {
    expect(setCounts({ reps: 3, rir: 1, isWarmup: false })).toBe(false);
    expect(setCounts({ reps: 8, rir: 5, isWarmup: false })).toBe(false);
    expect(setCounts({ reps: 8, rir: 2, isWarmup: true })).toBe(false);
    expect(setCounts({ reps: 8, rir: null, isWarmup: false })).toBe(true);
    const sets: LoggedSet[] = [
      { exerciseId: 'bench-press', performedOn: '2026-10-20', setIndex: 0, loadKg: 80, reps: 8, rir: 2, isWarmup: false },
      { exerciseId: 'bench-press', performedOn: '2026-10-20', setIndex: 1, loadKg: 80, reps: 8, rir: 2, isWarmup: false },
      { exerciseId: 'bench-press', performedOn: '2026-10-20', setIndex: 2, loadKg: 40, reps: 8, rir: 6, isWarmup: false },
      { exerciseId: 'bench-press', performedOn: '2026-10-28', setIndex: 0, loadKg: 80, reps: 8, rir: 2, isWarmup: false },
      { exerciseId: 'unknown', performedOn: '2026-10-20', setIndex: 0, loadKg: 80, reps: 8, rir: 2, isWarmup: false },
    ];
    const m = loggedMuscleSets(sets, exById, '2026-10-19');
    expect(m.chest).toBe(2);
    expect(m.triceps).toBe(1);
  });
});

describe('trend (N-WGT)', () => {
  it('weekly averages, running average and direction', () => {
    const ins = [
      { day: '2026-10-05', kg: 72 }, { day: '2026-10-07', kg: 72.2 }, { day: '2026-10-11', kg: 72.1 },
      { day: '2026-10-12', kg: 72.6 }, { day: '2026-10-14', kg: 72.8 }, { day: '2026-10-18', kg: 72.7 },
    ];
    const w = weeklyAverages(ins);
    expect(w).toHaveLength(2);
    expect(w.every((x) => !x.lowData)).toBe(true);
    expect(ratePctPerWeek(w[0], w[1])).toBeGreaterThan(0);
    expect(ratePctPerWeek(w[1], w[0])).toBe(0);
    expect(trendDirection(w)).toBe('up');
    expect(trendDirection([w[0]])).toBe('unknown');
    expect(trendDirection([w[0], { ...w[0], weekStart: '2026-10-12', avg: 71.5 }])).toBe('down');
    expect(trendDirection([w[0], { ...w[0], weekStart: '2026-10-12' }])).toBe('flat');
    const ra = runningAverage(ins, 14);
    expect(ra).toHaveLength(6);
    expect(ra[0].avg).toBe(72);
  });
});

describe('nutrition branches', () => {
  it('loss phase: lean protein 2.0 g/kg, deficit warning, rate clamp, kcal floor', () => {
    const t = nutritionTargets({ bodyweightKg: 80, sex: 'male', bodyFatPct: 12, status: 'intermediate', phase: 'loss', lifestyle: 'sedentary', sports: [], targetRatePct: 1.5 });
    expect(t.proteinG).toBe(160);
    expect(t.ratePct).toBe(1);
    expect(t.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['RATE_TOO_FAST', 'BIG_DEFICIT']));
    const low = nutritionTargets({ bodyweightKg: 50, sex: 'female', status: 'novice', phase: 'loss', lifestyle: 'sedentary', sports: [], kcalOverride: 900 });
    expect(low.warnings.some((w) => w.code === 'KCAL_TOO_LOW')).toBe(true);
    expect(low.kcal).toBeGreaterThanOrEqual(50 * 22 * 1.1);
    const tight = nutritionTargets({ bodyweightKg: 100, sex: 'male', status: 'novice', phase: 'maintain', lifestyle: 'sedentary', sports: [], kcalOverride: 2450 });
    expect(tight.carbsG).toBeGreaterThanOrEqual(tight.carbsMinG);
  });
  it('defaults and helpers', () => {
    expect(phaseForGoal('lean_gain')).toBe('gain');
    expect(phaseForGoal('fat_loss')).toBe('loss');
    expect(phaseForGoal('strength')).toBe('maintain');
    expect(defaultRatePct('loss', 'novice', 'female', 20)).toBe(0.5);
    expect(defaultRatePct('loss', 'novice', null, null)).toBe(0.75);
    expect(defaultRatePct('maintain', 'novice', null, null)).toBe(0);
    expect(sessionKcalFromRpe(60, 3, 70)).toBe(Math.round(6 * 0.44 * 70));
    expect(sessionKcalFromRpe(60, 6, 70)).toBe(Math.round(6 * 0.99 * 70));
    expect(sessionKcalFromRpe(60, 9, 70)).toBe(Math.round(6 * 1.54 * 70));
    const withMatch = nutritionTargets({ bodyweightKg: 70, sex: 'male', status: 'intermediate', phase: 'maintain', lifestyle: 'active', sports: [{ weekdays: [6], minutes: 90, intensity: 'match' }, { weekdays: [3], minutes: 60, intensity: 'light' }, { weekdays: [1], minutes: 60, intensity: 'moderate' }] });
    expect(withMatch.sportKcalPerDay).toBeGreaterThan(0);
  });
  it('nutrition review: gain too fast/slow, loss too fast, maintain drift, waiting', () => {
    const mk = (kgs: number[], start = '2026-09-07') => kgs.flatMap((kg, i) => [0, 2, 5].map((o) => ({ day: addDays(addDays(start, i * 7), o), kg })));
    const base = { today: '2026-10-12', phaseStartedOn: '2026-09-07', kcal: 2800, multiplier: 1.65, bodyweightKg: 72, status: 'intermediate' as const, targetRatePct: 1, initialAdjustDone: true };
    expect(nutritionReview({ ...base, phase: 'gain', weighIns: mk([72, 72, 72, 72, 72]) }).proposals[0].payload).toMatchObject({ toKcal: 2950 });
    expect(nutritionReview({ ...base, phase: 'gain', weighIns: mk([72, 72.5, 73, 73.5, 74]) }).proposals[0].payload).toMatchObject({ toKcal: 2650 });
    expect(nutritionReview({ ...base, phase: 'loss', targetRatePct: 0.5, weighIns: mk([80, 79, 78, 77, 76]) }).proposals[0].payload).toMatchObject({ toKcal: 2950 });
    expect(nutritionReview({ ...base, phase: 'maintain', weighIns: mk([72, 72.3, 72.6, 72.9, 73.2]) }).proposals[0].payload).toMatchObject({ toKcal: 2675 });
    expect(nutritionReview({ ...base, phase: 'maintain', weighIns: mk([72, 72, 72, 72, 72]) }).proposals).toHaveLength(0);
    expect(nutritionReview({ ...base, phase: 'gain', lastAdjustedOn: '2026-10-05', weighIns: mk([72, 72, 72, 72, 72]) }).proposals).toHaveLength(0);
    expect(nutritionReview({ ...base, phase: 'gain', weighIns: [] }).proposals).toHaveLength(0);
    expect(nutritionReview({ ...base, phase: 'gain', weighIns: mk([72, 72]) }).proposals).toHaveLength(0);
    // Initial adjustment without a prior week: compare week 2 with week 1.
    const init = nutritionReview({ ...base, today: '2026-09-21', initialAdjustDone: false, phase: 'loss', kcal: 2300, weighIns: mk([80, 80.2]) });
    expect(init.proposals[0].kind).toBe('multiplier_adjust');
    expect(init.proposals[0].payload).toMatchObject({ to: 1.45 });
    const ok = nutritionReview({ ...base, today: '2026-09-21', initialAdjustDone: false, phase: 'gain', weighIns: mk([72, 72.4]) });
    expect(ok.notes.join(' ')).toMatch(/First-week check passed/);
  });
});

describe('prescription helpers', () => {
  it('formats, warm-up, RIR hint and conversions', () => {
    expect(formatRx({ sets: 3, repMin: 8, repMax: 12, rirMin: 0, rirMax: 2 })).toBe('3 × 8–12 @ 2–0 RIR');
    expect(formatRx({ sets: 1, repMin: 1, repMax: 1, rirMin: 2, rirMax: 2 })).toBe('1 × 1 @ 2 RIR');
    expect(warmupRamp(100, 2.5)).toEqual([{ load: 50, reps: 8 }, { load: 70, reps: 4 }, { load: 85, reps: 2 }]);
    expect(warmupRamp(30, 2.5)).toEqual([]);
    expect(showRirHint(15)).toBe(true);
    expect(showRirHint(10)).toBe(false);
    expect(rpeToRir(8)).toBe(2);
    expect(rirToRpe(1)).toBe(9);
    expect(rangeLevel({ category: 'isolation', compoundIndex: -1, isolationIndex: 0, variation: 'between_session', variant: 'B', weekIndex: 0 })).toBe('high');
    expect(rangeLevel({ category: 'upper_free_press', compoundIndex: 0, isolationIndex: -1, variation: 'alternating_week', variant: 'A', weekIndex: 1 })).toBe('mid');
    expect(rangeLevel({ category: 'upper_free_press', compoundIndex: 0, isolationIndex: -1, variation: 'between_session', variant: 'A', weekIndex: 1 })).toBe('low');
    expect(restFor({ category: 'pulling_compound' })).toBe(150);
  });
});

describe('selection helpers', () => {
  it('substitutions keep the primary muscle and feasibility', () => {
    const subs = substitutionsFor(exById.get('romanian-deadlift')!, { exercises: SEED_EXERCISES, equipment: ['dumbbell', 'bodyweight'], injuries: [], disliked: [] });
    expect(subs.length).toBeGreaterThan(0);
    for (const s of subs) expect(s.equipment.some((e) => e === 'dumbbell' || e === 'bodyweight')).toBe(true);
    expect(selectMainLift('squat', { exercises: SEED_EXERCISES, equipment: ['dumbbell'], injuries: [], disliked: [] })).toBeNull();
    expect(selectMainLift('bench', { exercises: SEED_EXERCISES, equipment: ['barbell'], injuries: [], disliked: [], previous: { main_bench: 'bench-press' } })?.id).toBe('bench-press');
    expect(isFeasible(exById.get('bench-press')!, { equipment: ['barbell'], injuries: [], disliked: ['bench-press'] })).toBe(false);
    expect(isFeasible(exById.get('bench-press')!, { equipment: ['barbell'], injuries: [{ id: 'a', muscleId: null, label: 'x', severity: 'niggle', status: 'active', avoidExerciseIds: ['bench-press'] }], disliked: [] })).toBe(false);
  });
});

describe('split + strength helpers', () => {
  it('chooses splits by days and style', () => {
    const o = { goal: 'lean_gain' as const, lowerTargetAvg: 10, maxTarget: 10 };
    expect(chooseSplit(2, o).split.key).toBe('FB2');
    expect(chooseSplit(2, { ...o, style: 'alternative', maxTarget: 8 }).split.key).toBe('UL2');
    expect(chooseSplit(3, o).split.key).toBe('FB3');
    expect(chooseSplit(3, { ...o, lowerTargetAvg: 16 }).ruleIds).toContain('T-SPL-02');
    expect(chooseSplit(3, { ...o, style: 'alternative' }).split.key).toBe('FPF3');
    expect(chooseSplit(4, { ...o, style: 'alternative' }).split.key).toBe('PYR4');
    expect(chooseSplit(5, o).split.key).toBe('UL5');
    expect(chooseSplit(5, { ...o, style: 'alternative' }).split.key).toBe('LPP5');
    expect(chooseSplit(6, o).split.key).toBe('PYR6');
    expect(chooseSplit(6, { ...o, style: 'alternative' }).split.key).toBe('FPP6');
    expect(sessionVariant(['pyr_cb_qc', 'pyr_arms_gh', 'pyr_cb_qc'], 2)).toBe('B');
    expect(templateRegionMuscles('lower')).toContain('quads');
    expect(templateRegionMuscles('full')).toContain('chest');
  });
  it('strength sequencing', () => {
    expect(nextStrengthKind('strength_volume', null, '2026-10-01')).toBe('strength_load');
    expect(nextStrengthKind('strength_load', '2026-10-20', '2026-10-01')).toBe('strength_peak');
    expect(nextStrengthKind('strength_load', null, '2026-10-01')).toBe('strength_volume');
    expect(nextStrengthKind('strength_peak', null, '2026-10-01')).toBe('strength_volume');
    expect(peakWeeks(12)).toBe(2);
    expect(peakWeeks(14)).toBe(3);
    expect(peakWeeks(16)).toBe(4);
    expect(blockWeeks('strength_peak')).toBe(3);
    expect(defaultBlockKind('sport_support')).toBe('sport_support');
    expect(backoffSets('strength_volume', 0, 8)).toBe(0);
  });
});

describe('schedule', () => {
  it('warns when moving legs next to a match', () => {
    const sports = [sport('football', [6], 'match')];
    expect(moveWarnings('lower_a', 5, sports)[0]).toMatch(/day before/);
    expect(moveWarnings('lower_a', 7, sports)[0]).toMatch(/day after/);
    expect(moveWarnings('lower_a', 6, sports)[0]).toMatch(/same day/);
    expect(moveWarnings('upper_a', 5, sports)).toHaveLength(0);
  });
  it('flags no rest day and morning sports; throws with too few days', () => {
    const placements = [1, 2, 3, 4, 5, 6, 7].map((d, i) => ({ weekday: d, templateKey: ['upper_a', 'lower_a', 'upper_b', 'lower_b'][i % 4] }));
    const r = scorePlacement(placements, [sport('running', [7], 'moderate', 45, 'morning')], 'strength');
    expect(r.penalties.some((p) => p.rule === 'T-SCH-02')).toBe(true);
    expect(r.penalties.some((p) => /morning/.test(p.detail))).toBe(true);
    expect(() => placeSessions({ availableDays: [1], templates: ['full_a', 'full_b'], sports: [], goal: 'lean_gain' })).toThrow();
  });
});

describe('progression edge cases', () => {
  it('no load, e1RM-based first exposure, heavy lower 5 kg jump, nudges', () => {
    expect(suggestNextSet({ rx: { repMin: 8, repMax: 12, rirMin: 0, rirMax: 2 }, setIndex: 0, load: null, reps: 5, increment: 2 }).repsTarget).toBe(8);
    const fromE1 = suggestNextSession({ exposures: [], increment: 2.5, e1rm: 100 }, { repMin: 6, repMax: 10, rirMin: 1, rirMax: 3 });
    expect(fromE1.load).toBe(e1rmToLoad(100, 11, 2.5));
    const none = suggestNextSession({ exposures: [], increment: 2.5 }, { repMin: 6, repMax: 10, rirMin: 1, rirMax: 3 });
    expect(none.load).toBeNull();
    expect(none.hint).toMatch(/Pick a weight/);
    const jump = suggestNextSession(
      { exposures: [{ date: 'a', sets: [{ load: 120, reps: 8, rir: 4 }] }, { date: 'b', sets: [{ load: 120, reps: 8, rir: 4 }] }], increment: 2.5, heavyLowerBarbell: true },
      { repMin: 4, repMax: 8, rirMin: 2, rirMax: 4 },
    );
    expect(jump.load).toBe(125);
    expect(nudgeLoad(50, 2.5, 1)).toBe(52.5);
    expect(nudgeLoad(null, 2.5, -1)).toBeNull();
    expect(roundDownToStep(46, 2.5)).toBe(45);
    expect(roundUpToStep(54, 2.5)).toBe(55);
    expect(bestRecentE1rm([], 'x')).toBeNull();
  });
});

describe('volume targets', () => {
  it('specialisation (advanced), fat loss cap, previous block carry-over, sport priority', () => {
    const spec = computeTargets(baseInput({ status: 'advanced', specialization: ['side_delts', 'chest'] }), 'hypertrophy');
    const t = Object.fromEntries(spec.targets.map((x) => [x.muscle, x.target]));
    expect(t.side_delts).toBe(21);
    expect(t.back).toBe(8);
    const fl = computeTargets(baseInput({ status: 'advanced', goal: 'fat_loss', history: { sets: [], previousBlock: { kind: 'hypertrophy', medianTargetBeforeTrims: 18, endedOn: '2026-10-01', selections: {} } } }), 'hypertrophy');
    expect(fl.base).toBe(14);
    const sp = computeTargets(baseInput({ priority: 'sport', sports: [sport('boxing', [2], 'hard')] }), 'hypertrophy');
    expect(sp.base).toBe(6);
    const peak = computeTargets(baseInput({ goal: 'strength' }), 'strength_peak');
    expect(peak.base).toBe(4);
  });
});

describe('block edge cases', () => {
  it('handles short sessions, low availability and dumbbell-only equipment with warnings', () => {
    const short = generateBlock(baseInput({ sessionMinutes: 30, availableDays: [1, 3] }));
    expect(short.warnings.some((w) => w.code === 'TIME_TOO_SHORT')).toBe(true);
    const one = generateBlock(baseInput({ availableDays: [2] }));
    expect(one.liftDays).toBe(1);
    expect(one.warnings.some((w) => w.code === 'LOW_FREQUENCY')).toBe(true);
    const db = generateBlock(baseInput({ equipment: ['dumbbell', 'bodyweight'] }));
    expect(db.warnings.some((w) => w.code === 'NO_EXERCISE_FOR_SLOT')).toBe(true);
    const six = generateBlock(baseInput({ sessionMinutes: 45, maxLiftDays: 6, status: 'advanced', specialization: ['quads'] }));
    expect(six.sessions.length).toBeGreaterThan(0);
    const late = generateBlock(baseInput({ today: '2026-10-30' }));
    expect(late.startsOn).toBe('2026-11-02');
    const alt = generateBlock(baseInput({ repVariation: 'alternating_week', splitStyle: 'alternative', history: { sets: [], weeksOff: 3 } }));
    expect(alt.introWeek).toBe(true);
    expect(() => generateBlock(baseInput({ availableDays: [] }))).toThrow();
    const conflict = generateBlock(baseInput({ availableDays: [1, 5, 7], sports: [sport('football', [2, 6], 'match')] }));
    expect(conflict.warnings.length).toBeGreaterThan(0);
    const transition = generateBlock(baseInput({ fromHeavyPhase: true, history: { sets: [], previousBlock: { kind: 'strength_load', medianTargetBeforeTrims: 10, endedOn: '2026-10-20', selections: { upper_a: { incline_press: 'incline-barbell-press' } } } } }));
    expect(transition.introWeek).toBe(true);
    expect(transition.sessions.find((s) => s.templateKey === 'upper_a')!.exercises.some((e) => e.exerciseId === 'incline-barbell-press')).toBe(true);
    for (const s of transition.sessions) expect(TEMPLATES[s.templateKey]).toBeDefined();
  });
  it('uses logged history for suggested loads', () => {
    const sets: LoggedSet[] = [{ exerciseId: 'incline-dumbbell-press', performedOn: '2026-10-20', setIndex: 0, loadKg: 30, reps: 8, rir: 4, isWarmup: false, sessionId: 's1' }];
    const plan = generateBlock(baseInput({ history: { sets } }));
    const e = plan.sessions[0].exercises.find((x) => x.exerciseId === 'incline-dumbbell-press')!;
    expect(e.suggestedLoadKg).toBe(32);
  });
});

describe('fatigue extras', () => {
  it('dreading via skipped sessions, performance via reps drop, block transition and status change', () => {
    const sets: LoggedSet[] = [
      ...['incline-dumbbell-press', 'lat-pulldown'].flatMap((id) => [
        { exerciseId: id, performedOn: '2026-10-14', setIndex: 0, loadKg: 30, reps: 10, rir: 2, isWarmup: false },
        { exerciseId: id, performedOn: '2026-10-21', setIndex: 0, loadKg: 30, reps: 8, rir: 2, isWarmup: false },
      ]),
      ...seriesSets('back-squat', '2026-07-01', 30, 3, () => ({ load: 140, reps: 5 })),
    ];
    const state = {
      today: '2026-10-25',
      weekStart: '2026-10-19',
      checkins: [],
      sessionsThisWeek: [
        { id: 'a', date: '2026-10-20', status: 'skipped' as const, templateKey: 'upper_a', exercises: [] },
        { id: 'b', date: '2026-10-22', status: 'planned' as const, templateKey: 'lower_a', exercises: [] },
      ],
      nextWeekSessions: [],
      sets,
      exercises: SEED_EXERCISES,
      mainLiftExerciseIds: ['back-squat'],
      status: 'intermediate' as const,
      statusHistory: ['advanced' as const],
      goal: 'strength' as const,
      block: { id: 'b1', kind: 'strength_volume' as const, startsOn: '2026-09-07', weeks: 7 },
    };
    const af = autofillReview(state);
    expect(af.answers.dreading_gym).toBe(true);
    expect(af.answers.performance_down).toBe(true);
    const res = weeklyReview(state);
    expect(res.proposals.map((p) => p.kind)).toEqual(expect.arrayContaining(['standard_deload', 'block_transition', 'status_change']));
    const bt = res.proposals.find((p) => p.kind === 'block_transition')!;
    expect(bt.payload).toMatchObject({ toKind: 'strength_load' });
    expect(reviewWeekFor('2026-10-25', 7)).toBe('2026-10-19');
    expect(reviewWeekFor('2026-10-27', 2)).toBe('2026-10-19');
    const hyp = weeklyReview({ ...state, goal: 'lean_gain', block: { id: 'b', kind: 'hypertrophy', startsOn: '2026-09-14', weeks: 6 } });
    expect(hyp.proposals.find((p) => p.kind === 'block_transition')!.payload).toMatchObject({ toKind: 'hypertrophy' });
    const load = weeklyReview({ ...state, block: { id: 'b', kind: 'strength_load', startsOn: '2026-09-14', weeks: 6 } });
    expect(load.proposals.find((p) => p.kind === 'block_transition')!.ruleIds).toContain('T-FAT-06');
  });
});

describe('proposals: every kind applies', () => {
  const sessions = [
    { id: 's1', date: '2026-11-02', status: 'planned' as const, templateKey: 'upper_a', exercises: [{ id: 'e1', exerciseId: 'bench-press', sets: 3, rirMin: 1, rirMax: 3 }] },
    { id: 's2', date: '2026-11-03', status: 'planned' as const, templateKey: 'lower_a', exercises: [{ id: 'e2', exerciseId: 'back-squat', sets: 4, rirMin: 2, rirMax: 4 }] },
    { id: 's3', date: '2026-11-05', status: 'planned' as const, templateKey: 'upper_b', exercises: [{ id: 'e3', exerciseId: 'leg-extension', sets: 3, rirMin: 0, rirMax: 2 }] },
  ];
  const plan = { sessions, exercises: SEED_EXERCISES, today: '2026-10-28' };
  const P = (kind: Proposal['kind'], payload: Record<string, unknown>): Proposal => validateProposal({ kind, title: 't', rationale: 'r', ruleIds: ['X'], payload });
  it('works', () => {
    expect(applyProposal(plan, P('standard_deload', { weekStart: '2026-11-02', setCutPct: 0.4, mode: 'fewer_sessions' })).sessionUpdates.filter((u) => u.status === 'skipped')).toHaveLength(1);
    const td = applyProposal(plan, P('targeted_deload', { weekStart: '2026-11-02', muscles: ['quads'], removeExerciseIds: ['back-squat'], reduceSetsPct: 0.5 }));
    expect(td.exerciseDeletes).toEqual(['e2']);
    expect(td.exerciseUpdates).toEqual([{ id: 'e3', sets: 2 }]);
    const intro = applyProposal(plan, P('intro_week', { blockId: 'b', setPct: 0.75, rirBump: 1 }));
    expect(intro.exerciseUpdates.find((u) => u.id === 'e1')).toMatchObject({ sets: 2, rirMin: 2, rirMax: 4 });
    expect(applyProposal({ ...plan, sessions: [] }, P('intro_week', { blockId: 'b', setPct: 0.75, rirBump: 1 })).exerciseUpdates).toHaveLength(0);
    expect(applyProposal(plan, P('volume_change', { changes: [{ muscle: 'chest', from: 10, to: 12 }] })).regenerate?.targetAdjustments).toEqual({ chest: 2 });
    expect(applyProposal(plan, P('exercise_swap', { plannedExerciseIds: [], fromExerciseId: 'bench-press', toExerciseId: 'flat-dumbbell-press', reason: 'x' })).exerciseUpdates).toEqual([{ id: 'e1', exerciseId: 'flat-dumbbell-press' }]);
    expect(applyProposal(plan, P('block_transition', { fromKind: 'strength_load', toKind: 'strength_volume', startsOn: '2026-11-02' })).regenerate).toMatchObject({ fromHeavyPhase: true });
    expect(applyProposal(plan, P('plan_regenerate', { reason: 'x' })).regenerate).toBeDefined();
    expect(applyProposal(plan, P('injury_adjust', { injuryId: 'i', removeExerciseIds: [], addExerciseIds: [] })).regenerate).toBeDefined();
    expect(applyProposal(plan, P('status_change', { from: 'novice', to: 'intermediate', evidence: 'x' })).settings).toEqual({ trainingStatus: 'intermediate' });
    expect(applyProposal(plan, P('calorie_adjust', { fromKcal: 2200, toKcal: 2050, reason: 'x' })).nutrition).toEqual({ kcal: 2050 });
    expect(applyProposal(plan, P('multiplier_adjust', { from: 1.65, to: 1.85, reason: 'x' })).nutrition).toEqual({ multiplier: 1.85 });
    expect(applyProposal(plan, P('plateau_action', { exerciseId: 'x', step: 'fix_basics', details: 'd' })).regenerate).toBeUndefined();
    expect(() => validateProposal({ kind: 'standard_deload', title: '', rationale: '', ruleIds: [], payload: { weekStart: 'x', setCutPct: 0.9, mode: 'sets' } })).toThrow();
  });
});

describe('knowledge registry', () => {
  it('every rule has an own-words summary ≤ 280 chars and a source label', () => {
    for (const r of RULE_LIST) {
      expect(r.summary.length).toBeLessThanOrEqual(280);
      expect(ruleSourceLabel(r.id)).toBeTruthy();
    }
    expect(ruleSourceLabel('T-VOL-02')).toBe('Training Pyramid, p. 45–46, 231');
    expect(ruleSourceLabel('N-PRO-01')).toBe('Nutrition Pyramid, p. 86');
    expect(ruleSourceLabel('S-02')).toBe('General guidance');
    expect(ruleSourceLabel('nope')).toBe('General guidance');
    expect(ruleSourceLabel('N-PHS-01')).toBe('App heuristic');
    expect(Object.keys(RULES).length).toBe(RULE_LIST.length);
  });
  it('every rule ID used by the engine exists in the registry', () => {
    const plan = generateBlock(baseInput({ goal: 'strength', sports: [sport('football', [3], 'hard')], injuries: [{ id: 'i', muscleId: 'quads', label: 'knee', severity: 'pain', status: 'active', avoidExerciseIds: [] }] }));
    const ids = new Set([...plan.sessions.flatMap((s) => s.exercises.flatMap((e) => e.ruleIds)), ...plan.explanations.flatMap((e) => e.ruleIds), ...plan.warnings.flatMap((w) => w.ruleIds)]);
    for (const id of ids) expect(RULES[id], id).toBeDefined();
  });
});

describe('properties (fast-check)', () => {
  it('targets within [4, cap], ≤11 sets/muscle/session, 2–5 sets per exercise, ≥1 rest day when possible', () => {
    fc.assert(
      fc.property(
        fc.subarray([1, 2, 3, 4, 5, 6, 7], { minLength: 3 }),
        fc.constantFrom(45, 60, 75, 90),
        fc.constantFrom('novice', 'intermediate', 'advanced'),
        fc.constantFrom('lean_gain', 'recomp', 'fat_loss', 'sport_support'),
        fc.boolean(),
        (days, minutes, status, goal, withSport) => {
          const plan = generateBlock(
            baseInput({ availableDays: days, sessionMinutes: minutes, status: status as never, goal: goal as never, sports: withSport ? [sport('football', [days[0]], 'hard')] : [] }),
          );
          for (const t of plan.targets) {
            expect(t.target).toBeGreaterThanOrEqual(4);
            expect(t.target).toBeLessThanOrEqual(20);
          }
          for (const s of plan.sessions) {
            for (const e of s.exercises) {
              expect(e.sets).toBeGreaterThanOrEqual(e.isMainLiftSingle ? 1 : s.kind === 'intro' ? 1 : 2);
              expect(e.sets).toBeLessThanOrEqual(5);
            }
            for (const m of TRACKED_MUSCLES) {
              const per = s.exercises.reduce((a, e) => {
                const ex = exById.get(e.exerciseId)!;
                const role = ex.muscles.find((x) => x.muscle === m)?.role;
                return a + (role === 'primary' ? e.sets : role === 'secondary' ? e.sets / 2 : 0);
              }, 0);
              expect(per).toBeLessThanOrEqual(11);
            }
          }
          if (days.length <= 6 || plan.liftDays < 7) {
            const lift = new Set(plan.schedule.placements.map((p) => p.weekday));
            expect(lift.size).toBeLessThan(7);
          }
        },
      ),
      { numRuns: 60 },
    );
  });
  it('utils', () => {
    expect(combinations([1, 2, 3, 4], 2)).toHaveLength(6);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBe(0);
  });
});
