import { describe, expect, it } from 'vitest';
import { nutritionTargets, applyKcalChange } from '@/lib/engine/nutrition';
import { nutritionReview } from '@/lib/engine/nutrition-review';
import { suggestNextSession, suggestNextSet } from '@/lib/engine/progression';
import { weeklyReview } from '@/lib/engine/fatigue';
import { applyProposal } from '@/lib/engine/proposals';
import { generateBlock } from '@/lib/engine/block';
import { e1rm, loadAtRpe } from '@/lib/engine/e1rm';
import { weeklyAverages } from '@/lib/engine/trend';
import type { CheckinDay, ExposureSet, PlannedSessionState, WeeklyState } from '@/lib/engine/types';
import { SEED_EXERCISES } from '@/lib/knowledge/exercises';
import { addDays } from '@/lib/engine/util';
import { baseInput, sport } from './helpers';

describe('G1 — nutrition for Emo', () => {
  it('72 kg, lightly active, intermediate, lean gain 1%/month, football 2×90 hard', () => {
    const t = nutritionTargets({
      bodyweightKg: 72,
      sex: 'male',
      status: 'intermediate',
      phase: 'gain',
      lifestyle: 'lightly_active',
      sports: [{ weekdays: [2, 6], minutes: 90, intensity: 'hard' }],
    });
    expect(t.maintenanceExSport).toBe(2614);
    expect(t.sportKcalPerDay).toBe(285);
    expect(Math.round(t.delta)).toBe(198);
    expect(Math.abs(t.kcal - 3100)).toBeLessThanOrEqual(20);
    expect(t.proteinG).toBe(115);
    expect(t.fatMinG).toBe(50);
    expect(t.fatG).toBe(75);
    expect(Math.abs(t.carbsG - 490)).toBeLessThanOrEqual(5);
    expect(t.kcalLow).toBe(t.kcal - 100);
    expect(t.kcalHigh).toBe(t.kcal + 100);
  });
});

describe('G2 — double progression', () => {
  it('12@2 → 13@2 → 14@2 → 15@1 → 15@2 gives 13, 14, 15, 15 then +2 kg × 11', () => {
    const rx = { repMin: 10, repMax: 15, rirMin: 0, rirMax: 2 };
    const firsts: ExposureSet[] = [
      { load: 20, reps: 12, rir: 2 },
      { load: 20, reps: 13, rir: 2 },
      { load: 20, reps: 14, rir: 2 },
      { load: 20, reps: 15, rir: 1 },
      { load: 20, reps: 15, rir: 2 },
    ];
    const targets: number[] = [];
    let last = null as null | { load: number | null; repsTarget: number };
    for (let i = 0; i < firsts.length; i++) {
      const exposures = firsts.slice(0, i + 1).map((s, j) => ({ date: `2026-01-0${j + 1}`, sets: [s] }));
      last = suggestNextSession({ exposures, increment: 2 }, rx);
      targets.push(last.repsTarget);
    }
    expect(targets.slice(0, 4)).toEqual([13, 14, 15, 15]);
    expect(last).toMatchObject({ load: 22, repsTarget: 11 });
  });
});

describe('G3 — set-1 correction', () => {
  it('8–12 range, 50 kg × 6 → 45 kg, target 8', () => {
    const s = suggestNextSet({ rx: { repMin: 8, repMax: 12, rirMin: 1, rirMax: 4 }, setIndex: 0, load: 50, reps: 6, increment: 2.5 });
    expect(s.load).toBe(45);
    expect(s.repsTarget).toBe(8);
    expect(s.ruleIds).toContain('T-PRG-03');
  });
  it('above the range rounds up and targets repMin + 1', () => {
    const s = suggestNextSet({ rx: { repMin: 8, repMax: 12, rirMin: 1, rirMax: 4 }, setIndex: 0, load: 50, reps: 14, increment: 2.5 });
    expect(s.load).toBe(55); // 50 × 1.08 = 54 → 55
    expect(s.repsTarget).toBe(9);
  });
  it('in range keeps load and reps; later sets keep load', () => {
    expect(suggestNextSet({ rx: { repMin: 8, repMax: 12, rirMin: 1, rirMax: 4 }, setIndex: 0, load: 50, reps: 10, increment: 2.5 })).toMatchObject({ load: 50, repsTarget: 10 });
    expect(suggestNextSet({ rx: { repMin: 8, repMax: 12, rirMin: 1, rirMax: 4 }, setIndex: 1, load: 50, reps: 6, increment: 2.5 })).toMatchObject({ load: 50, repsTarget: 7 });
  });
});

// ---------- weekly review fixtures ----------
const WEEK = '2026-10-19'; // Monday
const TODAY = '2026-10-25'; // Sunday
const mkCheckins = (days: number, from: string, f: (i: number) => Partial<CheckinDay>): CheckinDay[] =>
  Array.from({ length: days }, (_, i) => ({ day: addDays(from, i), sleepHours: 7.5, energy: 4, stress: 2, soreness: {}, bodyweightKg: null, ...f(i) }));

function nextWeekSessions(): PlannedSessionState[] {
  const plan = generateBlock(baseInput({ today: '2026-10-26', startsOn: '2026-10-26' }));
  return plan.sessions
    .filter((s) => s.weekIndex === 0)
    .map((s, i) => ({
      id: `s${i}`,
      date: s.date,
      status: 'planned' as const,
      templateKey: s.templateKey,
      exercises: s.exercises.map((e, j) => ({ id: `s${i}e${j}`, exerciseId: e.exerciseId, sets: e.sets, rirMin: e.rirMin, rirMax: e.rirMax })),
    }));
}

function reviewState(over: Partial<WeeklyState>): WeeklyState {
  return {
    today: TODAY,
    weekStart: WEEK,
    checkins: [...mkCheckins(28, addDays(WEEK, -28), () => ({})), ...mkCheckins(7, WEEK, () => ({}))],
    sessionsThisWeek: [],
    nextWeekSessions: nextWeekSessions(),
    sets: [],
    exercises: SEED_EXERCISES,
    mainLiftExerciseIds: [],
    status: 'intermediate',
    goal: 'lean_gain',
    ...over,
  };
}

describe('G6 — 2 yes answers → standard deload', () => {
  it('sets × 0.6 rounded half-up, min 1; loads and RIR unchanged', () => {
    const state = reviewState({
      checkins: [...mkCheckins(28, addDays(WEEK, -28), () => ({ sleepHours: 8, stress: 2 })), ...mkCheckins(7, WEEK, () => ({ sleepHours: 6, stress: 4 }))],
    });
    const res = weeklyReview(state);
    expect(res.yesCount).toBe(2);
    expect(res.answers.sleep_worse).toBe(true);
    expect(res.answers.stress_worse).toBe(true);
    const deloads = res.proposals.filter((p) => p.kind === 'standard_deload');
    expect(deloads).toHaveLength(1);
    const diff = applyProposal({ sessions: state.nextWeekSessions, exercises: SEED_EXERCISES, today: TODAY }, deloads[0]);
    for (const s of state.nextWeekSessions) {
      for (const e of s.exercises) {
        const upd = diff.exerciseUpdates.find((u) => u.id === e.id);
        const expected = Math.max(1, Math.floor(e.sets * 0.6 + 0.5));
        expect(upd?.sets ?? e.sets).toBe(expected);
        expect(upd?.rirMin).toBeUndefined();
        expect(upd?.rirMax).toBeUndefined();
      }
    }
    expect(diff.exerciseDeletes).toHaveLength(0);
    expect(diff.sessionUpdates.filter((u) => u.status === 'skipped')).toHaveLength(0);
  });
  it('0–1 yes → no deload', () => {
    expect(weeklyReview(reviewState({})).proposals.filter((p) => p.kind === 'standard_deload')).toHaveLength(0);
  });
});

describe('G7 — intro week after a volume jump', () => {
  it('planned 14 after 4 weeks averaging 10 → week 1 at 75% sets and +1 RIR', () => {
    const input = baseInput({ status: 'advanced', history: { sets: [], recentAvgWeeklySets: 10 } });
    const plan = generateBlock(input);
    const noIntro = generateBlock({ ...input, history: { sets: [], recentAvgWeeklySets: 14 } });
    expect(plan.introWeek).toBe(true);
    expect(noIntro.introWeek).toBe(false);
    const w0 = plan.sessions.filter((s) => s.weekIndex === 0);
    const ref = noIntro.sessions.filter((s) => s.weekIndex === 0);
    expect(w0.every((s) => s.kind === 'intro')).toBe(true);
    w0.forEach((s, i) =>
      s.exercises.forEach((e, j) => {
        const r = ref[i].exercises[j];
        expect(e.sets).toBe(Math.max(1, Math.floor(r.sets * 0.75 + 0.5)));
        expect(e.rirMin).toBe(r.rirMin + 1);
        expect(e.rirMax).toBe(r.rirMax + 1);
      }),
    );
    expect(plan.sessions.filter((s) => s.weekIndex === 1).every((s) => s.kind === 'lift')).toBe(true);
  });
});

describe('G8 — lumbar soreness only', () => {
  it('targeted deload removes axial exercises; others unchanged', () => {
    const state = reviewState({ checkins: [...mkCheckins(28, addDays(WEEK, -28), () => ({})), ...mkCheckins(7, WEEK, (i) => ({ soreness: i === 2 ? { erectors: 'pain' } : {} }))] });
    const res = weeklyReview(state);
    expect(res.yesCount).toBe(1);
    const p = res.proposals.find((x) => x.kind === 'targeted_deload')!;
    expect(p).toBeDefined();
    expect(res.proposals.some((x) => x.kind === 'standard_deload')).toBe(false);
    const diff = applyProposal({ sessions: state.nextWeekSessions, exercises: SEED_EXERCISES, today: TODAY }, p);
    const byId = new Map(SEED_EXERCISES.map((e) => [e.id, e]));
    const all = state.nextWeekSessions.flatMap((s) => s.exercises);
    for (const e of all) {
      const ex = byId.get(e.exerciseId)!;
      if (ex.axialLoad) expect(diff.exerciseDeletes).toContain(e.id);
      else {
        expect(diff.exerciseDeletes).not.toContain(e.id);
        const involvesErectors = ex.muscles.some((m) => m.muscle === 'erectors' && m.role === 'primary');
        if (!involvesErectors) expect(diff.exerciseUpdates.find((u) => u.id === e.id)).toBeUndefined();
      }
    }
    expect(all.some((e) => ['back-squat', 'romanian-deadlift'].includes(e.exerciseId))).toBe(true);
  });
});

describe('G9 / G13 — e1RM and singles', () => {
  it('100 kg × 5 @ RIR 1 → 116.1 kg', () => {
    expect(Math.round(e1rm(100, 5, 1)! * 10) / 10).toBe(116.1);
    expect(e1rm(100, 12, 2)).toBeNull();
    expect(e1rm(null, 5, 1)).toBeNull();
  });
  it('e1RM 120, single @ RPE 8 → 112.5 kg', () => {
    expect(loadAtRpe(120, 1, 8, 2.5)).toBe(112.5);
  });
});

// ---------- weigh-ins ----------
const wi = (day: string, kg: number) => ({ day, kg });

describe('G10 — low-data week', () => {
  it('2 weigh-ins (Tue, Thu) → low_data, no proposal', () => {
    const ins = [wi('2026-10-13', 72), wi('2026-10-15', 72.2)];
    expect(weeklyAverages(ins)[0].lowData).toBe(true);
    const res = nutritionReview({ today: '2026-10-19', phase: 'gain', phaseStartedOn: '2026-09-01', kcal: 3100, multiplier: 1.65, bodyweightKg: 72, status: 'intermediate', targetRatePct: 1, weighIns: ins });
    expect(res.proposals).toHaveLength(0);
  });
});

describe('G11 — gain phase week 1 not up', () => {
  it('→ multiplier_adjust +0.2', () => {
    const prev = ['2026-10-05', '2026-10-07', '2026-10-10'].map((d) => wi(d, 72.0));
    const w1 = ['2026-10-12', '2026-10-14', '2026-10-17'].map((d) => wi(d, 71.9));
    const res = nutritionReview({ today: '2026-10-19', phase: 'gain', phaseStartedOn: '2026-10-12', kcal: 3100, multiplier: 1.65, bodyweightKg: 72, status: 'intermediate', targetRatePct: 1, weighIns: [...prev, ...w1] });
    expect(res.proposals).toHaveLength(1);
    expect(res.proposals[0].kind).toBe('multiplier_adjust');
    expect(res.proposals[0].payload).toMatchObject({ from: 1.65, to: 1.85 });
  });
});

describe('G12 — loss phase too slow', () => {
  it('2,200 kcal, 0.4%/week vs 0.75 ± 0.25 → −150 kcal, protein unchanged, fat/carbs ≥ minimums', () => {
    // phase week 1 = Sep 28 (ignored); Oct 5 → Oct 19 shows 0.4%/week.
    const weeks = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'];
    const kgs = [80.6, 80.0, 79.68, 79.36];
    const ins = weeks.flatMap((w, i) => [0, 2, 5].map((o) => wi(addDays(w, o), kgs[i])));
    const res = nutritionReview({ today: '2026-10-26', phase: 'loss', phaseStartedOn: '2026-09-28', kcal: 2200, multiplier: 1.65, bodyweightKg: 79.4, status: 'intermediate', targetRatePct: 0.75, weighIns: ins, initialAdjustDone: true });
    expect(res.proposals).toHaveLength(1);
    const p = res.proposals[0];
    expect(p.kind).toBe('calorie_adjust');
    expect(p.payload).toMatchObject({ fromKcal: 2200, toKcal: 2050 });
    const t = nutritionTargets({ bodyweightKg: 79.4, sex: 'male', bodyFatPct: 22, status: 'intermediate', phase: 'loss', lifestyle: 'sedentary', sports: [], kcalOverride: 2200 });
    const after = applyKcalChange(t, 2050);
    expect(after.proteinG).toBe(t.proteinG);
    expect(after.fatG).toBeLessThanOrEqual(t.fatG);
    expect(after.carbsG).toBeLessThan(t.carbsG);
    expect(after.fatG).toBeGreaterThanOrEqual(t.fatMinG);
    expect(after.carbsG).toBeGreaterThanOrEqual(t.carbsMinG);
    expect(Math.abs(after.proteinG * 4 + after.fatG * 9 + after.carbsG * 4 - 2050)).toBeLessThanOrEqual(25);
  });
});

describe('Strength block (6.11)', () => {
  it('volume phase: top single with RPE rising 5 → 8, loads from e1RM seeds', () => {
    const plan = generateBlock(baseInput({ goal: 'strength', history: { sets: [], e1rmSeeds: { squat: 120, bench: 100, deadlift: 150 } } }));
    expect(plan.kind).toBe('strength_volume');
    expect(plan.weeks).toBe(8);
    const singles = plan.sessions.flatMap((s) => s.exercises.filter((e) => e.isMainLiftSingle).map((e) => ({ w: s.weekIndex, e })));
    expect(singles.length).toBeGreaterThan(0);
    const w0 = singles.find((x) => x.w === 0)!.e;
    const w7 = singles.find((x) => x.w === 7)!.e;
    expect(w0.rirMin).toBe(5); // RPE 5
    expect(w7.rirMin).toBe(2); // RPE 8
    const sq = singles.find((x) => x.e.exerciseId === 'back-squat' && x.w === 7)!.e;
    expect(sq.suggestedLoadKg).toBe(loadAtRpe(120, 1, 8, 2.5));
  });
  it('load phase: singles + 2 back-off sets of 5 → 3 reps, secondary targets cut weekly', () => {
    const plan = generateBlock(baseInput({ goal: 'strength', blockKind: 'strength_load', history: { sets: [], e1rmSeeds: { squat: 120, bench: 100, deadlift: 150 } } }));
    expect(plan.weeks).toBe(6);
    const backoffs = plan.sessions.flatMap((s) => s.exercises.filter((e) => /Back-off/.test(e.note ?? '')).map((e) => ({ w: s.weekIndex, e })));
    expect(backoffs.find((x) => x.w === 0)!.e).toMatchObject({ sets: 2, repMin: 5 });
    expect(backoffs.find((x) => x.w === 5)!.e).toMatchObject({ sets: 2, repMin: 3 });
    const chest = plan.weeklyTargets.filter((t) => t.muscle === 'chest');
    expect(chest[0].targetSets).toBeGreaterThan(chest[5].targetSets);
    expect(chest[5].targetSets).toBeGreaterThanOrEqual(5);
  });
  it('peak phase exists with a test date', () => {
    const plan = generateBlock(baseInput({ goal: 'strength', blockKind: 'strength_peak', testDate: '2026-12-01', history: { sets: [], e1rmSeeds: { squat: 120 } } }));
    expect(plan.kind).toBe('strength_peak');
    expect(plan.weeks).toBeGreaterThanOrEqual(2);
  });
});

describe('sport priority (T-INT-05, S-05)', () => {
  it('adds 1 RIR, caps lower-body targets at 8 and base at 6', () => {
    const plan = generateBlock(baseInput({ goal: 'sport_support', priority: 'sport', sports: [sport('running', [2, 4], 'moderate')] }));
    for (const t of plan.targets) {
      expect(t.target).toBeLessThanOrEqual(8);
    }
    for (const s of plan.sessions) for (const e of s.exercises) expect(e.rirMin).toBeGreaterThanOrEqual(1);
  });
});
