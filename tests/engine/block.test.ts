import { describe, expect, it } from 'vitest';
import { generateBlock } from '@/lib/engine/block';
import { computeTargets } from '@/lib/engine/volume';
import { TEMPLATES } from '@/lib/engine/split';
import { fractionalSets } from '@/lib/engine/counting';
import { TRACKED_MUSCLES } from '@/lib/engine/types';
import { baseInput, exById, sport } from './helpers';

const g4 = () => baseInput({ sports: [sport('football', [2], 'hard'), sport('football', [6], 'match')] });

describe('G4 — schedule around football', () => {
  it('picks 4 lift days (Upper/Lower ×2), no lower on Mon/Fri/Sun, ≥1 rest day, deterministic', () => {
    const a = generateBlock(g4());
    const b = generateBlock(g4());
    expect(a.liftDays).toBe(4);
    expect(a.splitKey).toBe('UL4');
    const lowerDays = a.schedule.placements.filter((p) => TEMPLATES[p.templateKey].region !== 'upper').map((p) => p.weekday);
    for (const d of [1, 5, 7]) expect(lowerDays).not.toContain(d);
    const liftDays = new Set(a.schedule.placements.map((p) => p.weekday));
    const restDays = [1, 2, 3, 4, 5, 6, 7].filter((d) => !liftDays.has(d) && d !== 2 && d !== 6);
    expect(restDays.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(a.schedule)).toBe(JSON.stringify(b.schedule));
    expect(JSON.stringify(a.sessions)).toBe(JSON.stringify(b.sessions));
  });
});

describe('G5 — volume targets for G4', () => {
  it('base 12 − 2 = 10; football trims legs to 7; upper 10; front delts 5', () => {
    const { targets, base } = computeTargets(g4(), 'hypertrophy');
    const t = Object.fromEntries(targets.map((x) => [x.muscle, x.target]));
    expect(base).toBe(10);
    for (const m of ['quads', 'hamstrings', 'glutes', 'calves']) expect(t[m]).toBe(7);
    for (const m of ['chest', 'back', 'side_delts', 'rear_delts', 'biceps', 'triceps']) expect(t[m]).toBe(10);
    expect(t.front_delts).toBe(5);
  });
});

describe('G14 — fractional sets', () => {
  it('bench press 3 sets → chest 3, front delts 3, triceps 1.5', () => {
    const bench = exById.get('bench-press')!;
    expect(fractionalSets(bench, 3)).toEqual({ chest: 3, front_delts: 3, triceps: 1.5 });
  });
});

describe('G15 — hamstring pain', () => {
  it('removes axial hamstring exercises and keeps leg curls', () => {
    const plan = generateBlock(
      baseInput({ injuries: [{ id: 'i1', muscleId: 'hamstrings', label: 'Hamstring', severity: 'pain', status: 'active', avoidExerciseIds: [] }] }),
    );
    const ids = new Set(plan.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)));
    for (const bad of ['romanian-deadlift', 'conventional-deadlift', 'sumo-deadlift', 'good-morning', 'dumbbell-romanian-deadlift']) expect(ids.has(bad)).toBe(false);
    expect([...ids].some((id) => id.includes('leg-curl'))).toBe(true);
    expect(plan.warnings.some((w) => w.code === 'INJURY_RED_FLAG' && /physio/.test(w.message))).toBe(true);
  });
});

describe('generateBlock invariants (Appendix F-like profile)', () => {
  it('6-week plan within limits and fast', () => {
    const t0 = performance.now();
    const plan = generateBlock(
      baseInput({
        sports: [sport('football', [3], 'hard'), sport('boxing', [6], 'moderate')],
        injuries: [{ id: 'h', muscleId: 'hamstrings', label: 'Hamstring rehab', severity: 'niggle', status: 'rehab', avoidExerciseIds: ['conventional-deadlift', 'sumo-deadlift', 'good-morning'] }],
        history: { sets: [], e1rmSeeds: { squat: 96, bench: 95, ohp: 44 } },
      }),
    );
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(500);
    expect(plan.weeks).toBe(6);
    expect(plan.sessions.length).toBe(plan.liftDays * 6);
    const byWeek = new Map<number, typeof plan.sessions>();
    for (const s of plan.sessions) byWeek.set(s.weekIndex, [...(byWeek.get(s.weekIndex) ?? []), s]);
    for (const s of plan.sessions) {
      expect(s.exercises.length).toBeLessThanOrEqual(8);
      expect(s.estMinutes).toBeLessThanOrEqual(69);
      for (const e of s.exercises) {
        if (!e.isMainLiftSingle) {
          expect(e.sets).toBeGreaterThanOrEqual(2);
          expect(e.sets).toBeLessThanOrEqual(5);
        }
        expect(e.ruleIds.length).toBeGreaterThan(0);
      }
      for (const m of TRACKED_MUSCLES) {
        const perSession = s.exercises.reduce((a, e) => a + (fractionalSets(exById.get(e.exerciseId)!, e.sets)[m] ?? 0), 0);
        expect(perSession).toBeLessThanOrEqual(11);
      }
    }
  });
});
