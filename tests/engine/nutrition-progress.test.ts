import { describe, expect, it } from 'vitest';
import {
  allowedRatePcts,
  bodyweightChangedEnough,
  buildCutDays,
  cutRatioWarning,
  nextAdjustState,
  nutritionTargets,
  rateError,
  sportKcalPerDay,
} from '@/lib/engine/nutrition';
import { adherenceBuckets, exerciseTrend, liftStallFlags, mainLiftSeries, parseRange, rangeStart } from '@/lib/engine/progress';
import { RULES } from '@/lib/knowledge/rules';
import type { LoggedSet } from '@/lib/engine/types';

const set = (performedOn: string, loadKg: number | null, reps: number, rir: number | null = 2, setIndex = 0, exerciseId = 'ex'): LoggedSet => ({
  exerciseId,
  performedOn,
  setIndex,
  loadKg,
  reps,
  rir,
  isWarmup: false,
});

describe('nutrition cadence (gap 4)', () => {
  const prev = { lastAdjustedOn: '2026-10-01', initialAdjustDone: false };
  it('a lifestyle rebase keeps the 14-day wait and the first-week check', () => {
    expect(nextAdjustState(prev, { phaseChanged: false }, '2026-10-27')).toEqual(prev);
  });
  it('an accepted multiplier proposal restarts the wait and closes the first-week check', () => {
    expect(nextAdjustState(prev, { phaseChanged: false, multiplierAdjust: true }, '2026-10-27')).toEqual({ lastAdjustedOn: '2026-10-27', initialAdjustDone: true });
  });
  it('an accepted kcal change restarts the wait only', () => {
    expect(nextAdjustState(prev, { phaseChanged: false, kcalOffsetDelta: -150 }, '2026-10-27')).toEqual({ lastAdjustedOn: '2026-10-27', initialAdjustDone: false });
  });
  it('a phase change reopens the first-week check', () => {
    expect(nextAdjustState({ lastAdjustedOn: null, initialAdjustDone: true }, { phaseChanged: true }, '2026-10-27')).toEqual({ lastAdjustedOn: null, initialAdjustDone: false });
    expect(nextAdjustState(null, { phaseChanged: true }, '2026-10-27')).toEqual({ lastAdjustedOn: null, initialAdjustDone: false });
  });
});

describe('weigh-in recompute threshold (gap 1)', () => {
  it('refreshes on a ≥ 0.5 kg move of the averaged weight or when the targets record none', () => {
    expect(bodyweightChangedEnough(80, 80.4)).toBe(false);
    expect(bodyweightChangedEnough(80, 80.5)).toBe(true);
    expect(bodyweightChangedEnough(80, 79.5)).toBe(true);
    expect(bodyweightChangedEnough(null, 80)).toBe(true);
    expect(bodyweightChangedEnough(80, null)).toBe(false);
  });
  it('targets follow bodyweight', () => {
    const base = { sex: 'male' as const, status: 'intermediate' as const, phase: 'maintain' as const, lifestyle: 'active' as const, sports: [] };
    expect(nutritionTargets({ ...base, bodyweightKg: 85 }).kcal).toBeGreaterThan(nutritionTargets({ ...base, bodyweightKg: 80 }).kcal);
  });
});

describe('sport calories from logged RPE (gap 3)', () => {
  const sports = [{ sportId: 'football', weekdays: [2, 6], minutes: 60, intensity: 'light' as const }];
  it('uses the declared intensity with fewer than 3 rated logs', () => {
    const logs = [{ sportId: 'football', minutes: 90, rpe: 9 }, { sportId: 'football', minutes: 90, rpe: 9 }];
    expect(sportKcalPerDay(sports, 70, logs)).toBe(sportKcalPerDay(sports, 70));
  });
  it('uses the mean logged session energy once 3 sessions have an RPE; frequency stays from the schedule', () => {
    const logs = [
      { sportId: 'football', minutes: 90, rpe: 9 },
      { sportId: 'football', minutes: 90, rpe: 9 },
      { sportId: 'football', minutes: 60, rpe: 6 },
      { sportId: 'football', minutes: 60, rpe: null },
      { sportId: 'tennis', minutes: 60, rpe: 9 },
    ];
    const perSession = (9 * 1.54 * 70 * 2 + 6 * 0.99 * 70) / 3;
    expect(sportKcalPerDay(sports, 70, logs)).toBe(Math.round((2 * perSession) / 7));
    expect(nutritionTargets({ bodyweightKg: 70, sex: 'male', status: 'novice', phase: 'maintain', lifestyle: 'active', sports, sportLogs: logs }).sportKcalPerDay).toBe(Math.round((2 * perSession) / 7));
  });
  it('sports without an id never calibrate', () => {
    const plain = [{ weekdays: [1], minutes: 60, intensity: 'hard' as const }];
    expect(sportKcalPerDay(plain, 70, [{ sportId: 'x', minutes: 10, rpe: 1 }, { sportId: 'x', minutes: 10, rpe: 1 }, { sportId: 'x', minutes: 10, rpe: 1 }])).toBe(sportKcalPerDay(plain, 70));
  });
});

describe('rate limits (gap 5)', () => {
  it('UI options and server checks agree with N-RAT-01/02', () => {
    expect(allowedRatePcts('loss', 'novice')).toEqual([0.5, 0.75, 1]);
    expect(allowedRatePcts('gain', 'novice')).toEqual([1, 1.5, 2]);
    expect(allowedRatePcts('gain', 'intermediate')).toEqual([0.5, 1, 1.5]);
    expect(allowedRatePcts('gain', 'advanced')).toEqual([0.25, 0.5]);
    expect(allowedRatePcts('maintain', 'novice')).toEqual([]);
    for (const status of ['novice', 'intermediate', 'advanced'] as const)
      for (const phase of ['loss', 'gain'] as const) for (const r of allowedRatePcts(phase, status)) expect(rateError(phase, status, r)).toBeNull();
  });
  it('rejects rates outside the range', () => {
    expect(rateError('loss', 'novice', 1.5)).toMatch(/N-RAT-01/);
    expect(rateError('loss', 'novice', 0.25)).toMatch(/N-RAT-01/);
    expect(rateError('gain', 'advanced', 1)).toMatch(/N-RAT-02/);
    expect(rateError('gain', 'novice', 3)).toMatch(/N-RAT-02/);
    expect(rateError('gain', 'novice', 0.5)).toMatch(/N-RAT-02/);
    expect(rateError('maintain', 'novice', 0)).toBeNull();
  });
});

describe('4:1 build vs cut (gap 6)', () => {
  const history = [
    { phase: 'maintain', from: '2026-01-05', to: '2026-03-02' }, // 56 days
    { phase: 'loss', from: '2026-03-02', to: '2026-03-30' }, // 28 days
    { phase: 'gain', from: '2026-03-30', to: null },
  ];
  it('counts days per side', () => {
    expect(buildCutDays(history, '2026-04-27')).toEqual({ buildDays: 56 + 28, cutDays: 28 });
  });
  it('warns (does not block) when a new cut would break 4:1', () => {
    expect(cutRatioWarning(history, '2026-04-27')).toMatch(/N-PHS-02/);
    expect(cutRatioWarning(history, '2026-12-28')).toBeNull();
    expect(cutRatioWarning([], '2026-04-27')).toMatch(/N-PHS-02/);
  });
});

describe('progress series (gaps 8–11)', () => {
  it('parses and resolves the history range', () => {
    expect(parseRange('1y')).toBe('1y');
    expect(parseRange('bogus')).toBe('6m');
    expect(parseRange(undefined)).toBe('6m');
    expect(rangeStart('2026-10-27', '3m')).toBe('2026-07-28');
    expect(rangeStart('2026-10-27', 'all')).toBeNull();
  });
  it('e1RM rule cited by the page exists', () => {
    expect(RULES['T-EST-01']?.source).toBe('GEN');
  });
  it('main-lift series pools variations and keeps the best set per day', () => {
    const exMap = new Map([
      ['bb', { mainLiftKey: 'squat' as const }],
      ['ssb', { mainLiftKey: 'squat' as const }],
      ['curl', { mainLiftKey: null }],
    ]);
    const s = mainLiftSeries([set('2026-10-01', 100, 5, 2, 0, 'bb'), set('2026-10-01', 110, 5, 2, 1, 'ssb'), set('2026-10-02', 20, 10, 0, 0, 'curl')], exMap, 'squat');
    expect(s).toHaveLength(1);
    expect(s[0].y).toBeCloseTo((110 * 36) / 30);
  });
  it('falls back to volume load for high-rep loaded work and to total reps for bodyweight work', () => {
    expect(exerciseTrend([set('2026-10-01', 100, 5), set('2026-10-03', 105, 5)]).metric).toBe('e1rm');
    const highRep = exerciseTrend([set('2026-10-01', 20, 15, 2, 0), set('2026-10-01', 20, 12, 2, 1), set('2026-10-03', 22, 15, 1, 0)]);
    expect(highRep.metric).toBe('volume_load');
    expect(highRep.points).toEqual([
      { x: '2026-10-01', y: 20 * 15 + 20 * 12 },
      { x: '2026-10-03', y: 22 * 15 },
    ]);
    const bw = exerciseTrend([set('2026-10-01', null, 20), set('2026-10-01', null, 18, 2, 1)]);
    expect(bw).toEqual({ metric: 'reps', points: [{ x: '2026-10-01', y: 38 }] });
  });
  it('buckets adherence by week or month', () => {
    const sessions = [
      { scheduled_on: '2026-09-29', status: 'done' },
      { scheduled_on: '2026-10-01', status: 'skipped' },
      { scheduled_on: '2026-10-27', status: 'planned' },
    ];
    const weekly = adherenceBuckets(sessions, '2026-09-29', '2026-10-27', 'week');
    expect(weekly).toHaveLength(5);
    expect(weekly[0]).toEqual({ week: '2026-09-28', done: 1, planned: 2 });
    const monthly = adherenceBuckets(sessions, '2025-12-15', '2026-10-27', 'month');
    expect(monthly.map((m) => m.week)).toEqual(['2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']);
    expect(monthly.find((m) => m.week === '2026-09-01')).toEqual({ week: '2026-09-01', done: 1, planned: 1 });
    expect(monthly.at(-1)).toEqual({ week: '2026-10-01', done: 0, planned: 2 });
  });
  it('flags a stalled main lift with the plateau engine', () => {
    const stalled = [
      { x: '2026-09-01', y: 150 },
      { x: '2026-10-05', y: 145 },
      { x: '2026-10-20', y: 148 },
    ];
    const rising = [
      { x: '2026-09-01', y: 100 },
      { x: '2026-10-05', y: 102 },
      { x: '2026-10-20', y: 105 },
    ];
    const flags = liftStallFlags({ squat: stalled, bench: rising, deadlift: [] }, 'intermediate', '2026-10-27');
    expect(flags).toHaveLength(2);
    expect(flags.find((f) => f.lift === 'squat')).toEqual({ lift: 'squat', stalled: true, exposures: 3, lastPrOn: '2026-09-01' });
    expect(flags.find((f) => f.lift === 'bench')?.stalled).toBe(false);
  });
});
