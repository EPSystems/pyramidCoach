// Weekly review gaps (2026-10-27): RIR drift, low-readiness swap, plan proposals, T-FAT-05, plateau swap, dedupe keys.
import { describe, expect, it } from 'vitest';
import { autofillReview, lighterSessionFor, rirDrift, statusAnchorIds, weeklyReview } from '@/lib/engine/fatigue';
import { dislikeSwapProposals, injuryProposals, introWeekProposals, planReview, stalePlanProposals, volumeProposals } from '@/lib/engine/plan-review';
import { detectPlateaus } from '@/lib/engine/plateau';
import { applyProposal, proposalKey, stableJson, validateProposal } from '@/lib/engine/proposals';
import { injuryNote } from '@/lib/engine/selection';
import { generateBlock } from '@/lib/engine/block';
import type { Injury, LoggedSet, PlannedSessionState, WeeklyState } from '@/lib/engine/types';
import { SEED_EXERCISES } from '@/lib/knowledge/exercises';
import { addDays } from '@/lib/engine/util';
import { baseInput, exById } from './helpers';

const set = (exerciseId: string, performedOn: string, loadKg: number, rir: number, plannedRirMin: number | null = 2, reps = 8): LoggedSet => ({
  exerciseId,
  performedOn,
  setIndex: 0,
  loadKg,
  reps,
  rir,
  isWarmup: false,
  plannedRirMin,
});

const session = (id: string, date: string, exerciseIds: string[], extra: Partial<PlannedSessionState> = {}): PlannedSessionState => ({
  id,
  date,
  status: 'planned',
  templateKey: 'upper_a',
  exercises: exerciseIds.map((e, i) => ({ id: `${id}-${i}`, exerciseId: e, sets: 3, rirMin: 1, rirMax: 3, repMin: 6, repMax: 10 })),
  ...extra,
});

function state(over: Partial<WeeklyState> = {}): WeeklyState {
  return {
    today: '2026-10-27', // Tuesday; reviews the week of 2026-10-19
    weekStart: '2026-10-19',
    checkins: [],
    sessionsThisWeek: [],
    nextWeekSessions: [session('n1', '2026-10-28', ['back-squat', 'leg-extension']), session('n2', '2026-10-30', ['bench-press', 'lat-pulldown'])],
    sets: [],
    exercises: SEED_EXERCISES,
    mainLiftExerciseIds: [],
    status: 'intermediate',
    goal: 'lean_gain',
    block: { id: 'b1', kind: 'hypertrophy', startsOn: '2026-10-05', weeks: 6 },
    ...over,
  };
}

const injury = (over: Partial<Injury> = {}): Injury => ({ id: 'inj1', muscleId: 'quads', label: 'Knee', severity: 'pain', status: 'active', avoidExerciseIds: [], ...over });

describe('RIR drift (T-RIR-01 / T-FAT-01)', () => {
  it('flags exercises logged below the RIR floor on consecutive exposures at a similar load', () => {
    const sets = [set('bench-press', '2026-10-13', 80, 0), set('bench-press', '2026-10-20', 80, 0), set('lat-pulldown', '2026-10-14', 60, 1, 3), set('lat-pulldown', '2026-10-21', 61, 1, 3)];
    const d = rirDrift(sets, '2026-10-19');
    expect(d.exerciseIds).toEqual(['bench-press', 'lat-pulldown']);
    expect(d.avgBelow).toBe(2);
    const af = autofillReview(state({ sets }));
    expect(af.answers.performance_down).toBe(true);
    expect(af.evidence.performance_down).toMatch(/harder than planned/);
  });
  it('ignores load jumps, on-target RIR, unplanned sets and single exposures', () => {
    expect(rirDrift([set('bench-press', '2026-10-13', 80, 0), set('bench-press', '2026-10-20', 85, 0)], '2026-10-19').exerciseIds).toEqual([]);
    expect(rirDrift([set('bench-press', '2026-10-13', 80, 2), set('bench-press', '2026-10-20', 80, 1)], '2026-10-19').exerciseIds).toEqual([]);
    expect(rirDrift([set('bench-press', '2026-10-13', 80, 0, null), set('bench-press', '2026-10-20', 80, 0, null)], '2026-10-19').exerciseIds).toEqual([]);
    expect(rirDrift([set('bench-press', '2026-10-20', 80, 0)], '2026-10-19').exerciseIds).toEqual([]);
    // Drift on only one exercise is not enough to flag performance.
    const one = [set('bench-press', '2026-10-13', 80, 0), set('bench-press', '2026-10-20', 80, 0)];
    expect(autofillReview(state({ sets: one })).answers.performance_down).toBe(false);
  });
});

describe('low readiness → lighter session (T-FAT-08)', () => {
  const today = '2026-10-27';
  const others = [
    { id: 'a', title: 'Upper A', date: '2026-10-29', status: 'planned', totalSets: 12 },
    { id: 'b', title: 'Lower B', date: '2026-10-31', status: 'planned', totalSets: 18 },
    { id: 'c', title: 'Next week', date: '2026-11-03', status: 'planned', totalSets: 4 },
  ];
  it('suggests the lightest remaining session this week only when readiness is low', () => {
    expect(lighterSessionFor(1, { id: 't', status: 'planned', totalSets: 20 }, others, today)).toMatchObject({ id: 'a' });
    expect(lighterSessionFor(2, { id: 't', status: 'planned', totalSets: 20 }, others, today)).toBeNull();
    expect(lighterSessionFor(null, { id: 't', status: 'planned', totalSets: 20 }, others, today)).toBeNull();
    expect(lighterSessionFor(0, { id: 't', status: 'planned', totalSets: 10 }, others, today)).toBeNull();
    expect(lighterSessionFor(0, { id: 't', status: 'done', totalSets: 20 }, others, today)).toBeNull();
    expect(lighterSessionFor(0, null, others, today)).toBeNull();
  });
});

describe('injury_adjust (T-SEL-08)', () => {
  it('flags a stale plan that still contains avoided or axial exercises for a painful area', () => {
    const [p] = injuryProposals(state({ injuries: [injury({ avoidExerciseIds: ['leg-extension'] })] }));
    expect(p.kind).toBe('injury_adjust');
    expect(p.payload).toMatchObject({ injuryId: 'inj1', removeExerciseIds: ['back-squat', 'leg-extension'] });
    validateProposal(p);
    expect(injuryProposals(state({ injuries: [injury({ status: 'resolved', avoidExerciseIds: ['leg-extension'] })] }))).toHaveLength(0);
  });
  it('turns recurring check-in pain into a new injury, or raises a niggle', () => {
    const checkins = ['2026-10-15', '2026-10-21'].map((day) => ({ day, sleepHours: 7, energy: 3, stress: 3, soreness: { quads: 'pain' as const }, bodyweightKg: null }));
    const [p] = injuryProposals(state({ checkins }));
    expect(p.payload).toMatchObject({ injuryId: null, muscle: 'quads', severity: 'pain', removeExerciseIds: ['back-squat'] });
    const diff = applyProposal({ sessions: [], exercises: SEED_EXERCISES, today: '2026-10-27' }, validateProposal(p));
    expect(diff.injury).toMatchObject({ id: null, muscleId: 'quads', severity: 'pain', addAvoidIds: ['back-squat'] });
    expect(diff.regenerate).toBeDefined();
    const [n] = injuryProposals(state({ checkins, injuries: [injury({ severity: 'niggle' })] }));
    expect(n.payload).toMatchObject({ injuryId: 'inj1', severity: 'pain' });
    // One pain day, or a plan that doesn't load the area, proposes nothing.
    expect(injuryProposals(state({ checkins: checkins.slice(1) }))).toHaveLength(0);
    expect(injuryProposals(state({ checkins, nextWeekSessions: [session('n1', '2026-10-28', ['leg-extension'])] }))).toHaveLength(0);
  });
});

describe('rehab and niggle notes (T-SEL-08)', () => {
  it('notes exercises for an area in rehab or with a niggle, never for resolved injuries', () => {
    const squat = exById.get('back-squat')!;
    expect(injuryNote(squat, [injury({ status: 'rehab' })])).toMatch(/higher reps/);
    expect(injuryNote(squat, [injury({ severity: 'niggle' })])).toMatch(/pain-free/);
    expect(injuryNote(squat, [injury({ status: 'resolved' })])).toBeNull();
    expect(injuryNote(exById.get('bench-press')!, [injury({ status: 'rehab' })])).toBeNull();
    const plan = generateBlock(baseInput({ injuries: [injury({ muscleId: 'chest', severity: 'niggle' })] }));
    const chest = plan.sessions.flatMap((s) => s.exercises).filter((e) => exById.get(e.exerciseId)?.muscles.some((m) => m.muscle === 'chest' && m.role === 'primary'));
    expect(chest.length).toBeGreaterThan(0);
    expect(chest.every((e) => e.note?.includes('Niggle') && e.ruleIds.includes('T-SEL-08'))).toBe(true);
  });
});

describe('T-FAT-05 higher-rep week', () => {
  it('offers a higher-rep alternative next to the targeted deload and applies it as rep changes', () => {
    const checkins = ['2026-10-20', '2026-10-22'].map((day) => ({ day, sleepHours: 7, energy: 3, stress: 3, soreness: { quads: 'sore' as const }, bodyweightKg: null }));
    const s = state({ weekStart: '2026-10-19', nextWeekSessions: [session('n1', '2026-10-26', ['back-squat', 'leg-extension'])], checkins, overrides: { aches_worse: true } });
    const res = weeklyReview(s);
    const td = res.proposals.filter((p) => p.kind === 'targeted_deload');
    expect(td.map((p) => p.payload.mode)).toEqual(['deload', 'higher_reps']);
    const hr = validateProposal(td[1]);
    expect(hr.ruleIds).toContain('T-FAT-05');
    const diff = applyProposal({ sessions: s.nextWeekSessions, exercises: SEED_EXERCISES, today: s.today }, hr);
    expect(diff.exerciseUpdates).toEqual([
      { id: 'n1-0', repMin: 10, repMax: 15 },
      { id: 'n1-1', repMin: 15, repMax: 25 },
    ]);
    expect(diff.exerciseDeletes).toEqual([]);
    expect(proposalKey(td[0].kind, td[0].payload)).not.toBe(proposalKey(td[1].kind, td[1].payload));
  });
});

describe('volume_change / exercise_swap / plan_regenerate / intro_week', () => {
  it('volume_change: cut 2 sets on higher-volume muscles after two bad reviews in a row', () => {
    const s = state({ targets: { chest: 12, biceps: 8, quads: 10 }, previousYesCount: 3 });
    const [p] = volumeProposals(s, 2);
    expect(p.payload).toEqual({ changes: [{ muscle: 'chest', from: 12, to: 10 }, { muscle: 'quads', from: 10, to: 8 }] });
    expect(applyProposal({ sessions: [], exercises: SEED_EXERCISES, today: s.today }, validateProposal(p)).regenerate?.targetAdjustments).toEqual({ chest: -2, quads: -2 });
    expect(volumeProposals({ ...s, previousYesCount: 1 }, 3)).toHaveLength(0);
    expect(volumeProposals(s, 1)).toHaveLength(0);
  });
  it('exercise_swap for a disliked exercise still in the plan', () => {
    const [p] = dislikeSwapProposals(state({ dislikedExerciseIds: ['lat-pulldown'], equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'] }));
    expect(p.kind).toBe('exercise_swap');
    expect(p.payload).toMatchObject({ fromExerciseId: 'lat-pulldown', reason: 'disliked' });
    expect(p.payload.toExerciseId).not.toBe('lat-pulldown');
    validateProposal(p);
    expect(dislikeSwapProposals(state({ dislikedExerciseIds: ['lat-pulldown'] }))).toHaveLength(0); // no equipment info
  });
  it('plan_regenerate when the plan drifted from settings', () => {
    expect(stalePlanProposals(state({ availableDays: [1, 2], equipment: ['barbell', 'dumbbell', 'machine', 'cable'] }))[0].payload.reason).toMatch(/2 sessions next week/);
    expect(stalePlanProposals(state({ equipment: ['dumbbell'] }))[0].payload.reason).toMatch(/equipment/);
    expect(stalePlanProposals(state({ availableDays: [3, 5], equipment: ['barbell', 'machine', 'cable'] }))).toHaveLength(0);
  });
  it('intro_week after 2+ weeks without training, not when already easing in', () => {
    const old = [set('bench-press', '2026-10-05', 80, 2)];
    const [p] = introWeekProposals(state({ sets: old }));
    expect(p.kind).toBe('intro_week');
    validateProposal(p);
    expect(introWeekProposals(state({ sets: [set('bench-press', '2026-10-20', 80, 2)] }))).toHaveLength(0);
    expect(introWeekProposals(state({ sets: old, nextWeekSessions: [session('n1', '2026-10-28', ['bench-press'], { kind: 'intro' })] }))).toHaveLength(0);
    // Nothing logged and a block older than the break window also counts; a brand-new block does not.
    expect(introWeekProposals(state())).toHaveLength(1);
    expect(introWeekProposals(state({ block: { id: 'b', kind: 'hypertrophy', startsOn: '2026-10-26', weeks: 6 } }))).toHaveLength(0);
    expect(planReview(state({ sets: old }), 0).map((x) => x.kind)).toContain('intro_week');
  });
});

describe('status inference and plateau fixes', () => {
  it('weeklyReview returns its inference over main lifts plus session anchors', () => {
    const s = state({ mainLiftExerciseIds: ['back-squat'] });
    expect(statusAnchorIds(s).sort()).toEqual(['back-squat', 'bench-press']);
    expect(weeklyReview(s).inference.ruleIds).toContain('T-STA-03');
  });
  it('plateau at the volume cap proposes a variation swap', () => {
    const stalled = Array.from({ length: 12 }, (_, i) => set('bench-press', addDays('2026-08-01', i * 7), i < 4 ? 80 + i * 2.5 : 87.5, 2));
    const base = {
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
      targets: { chest: 20, front_delts: 20 },
    };
    expect(detectPlateaus(base)).toHaveLength(0);
    const [p] = detectPlateaus({ ...base, selection: { equipment: ['barbell', 'dumbbell', 'machine', 'cable'], injuries: [], disliked: [] } });
    expect(p.kind).toBe('exercise_swap');
    expect(p.payload).toMatchObject({ fromExerciseId: 'bench-press', reason: 'plateau' });
    validateProposal(p);
  });
});

describe('proposal dedupe keys', () => {
  it('keys by target and compares payloads regardless of key order', () => {
    expect(proposalKey('plateau_action', { exerciseId: 'x' })).toBe('plateau_action:x');
    expect(proposalKey('injury_adjust', { injuryId: null, muscle: 'quads' })).toBe('injury_adjust:quads');
    expect(proposalKey('standard_deload', { weekStart: 'a' })).toBe('standard_deload');
    expect(stableJson({ a: 1, b: [1, { d: 2, c: 3 }] })).toBe(stableJson({ b: [1, { c: 3, d: 2 }], a: 1 }));
    expect(stableJson({ a: 1 })).not.toBe(stableJson({ a: 2 }));
  });
  it('fix_basics acceptance pins the checklist without changing the plan', () => {
    const d = applyProposal({ sessions: [], exercises: SEED_EXERCISES, today: '2026-10-27' }, validateProposal({ kind: 'plateau_action', title: 't', rationale: 'r', ruleIds: [], payload: { exerciseId: 'x', step: 'fix_basics', details: 'd' } }));
    expect(d.regenerate).toBeUndefined();
    expect(d.summary[0]).toMatch(/Today/);
  });
});
