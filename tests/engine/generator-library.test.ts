import { describe, expect, it } from 'vitest';
import { blockWeekIndex, checkinSoreness, generateSession, setsInLast48h, trainedLast48h } from '@/lib/engine/generator';
import { deriveSlotTags, rankCandidates, substitutionsFor } from '@/lib/engine/selection';
import { incrementFor } from '@/lib/engine/block';
import { TRACKED_MUSCLES, type ExerciseDef, type LoggedSet, type TrackedMuscle } from '@/lib/engine/types';
import { SEED_EXERCISES } from '@/lib/knowledge/exercises';
import { exById } from './helpers';

const targets = Object.fromEntries(TRACKED_MUSCLES.map((m) => [m, 10])) as Record<TrackedMuscle, number>;
const base = {
  today: '2026-10-28',
  minutes: 45,
  equipmentPreset: 'full' as const,
  focus: 'auto' as const,
  readiness: 'normal' as const,
  exercises: SEED_EXERCISES,
  injuries: [],
  increments: {},
  targets,
  loggedThisWeek: {},
  recentPain: [],
  trainedLast48h: {},
  sportStressed: [],
  sets: [],
};
const primaries = (id: string) => exById.get(id)!.muscles.filter((m) => m.role === 'primary').map((m) => m.muscle);

describe('generator: soreness and the 48 h window', () => {
  it('skips sore muscles', () => {
    const g = generateSession({ ...base, focus: 'upper', recentSore: ['chest', 'back'] });
    expect(g.exercises.length).toBeGreaterThan(0);
    expect(g.muscles).not.toContain('chest');
    expect(g.muscles).not.toContain('back');
    expect(g.notes.some((n) => /sore in the last 48 h/.test(n))).toBe(true);
  });
  it('keeps sore muscles when nothing else would be left', () => {
    const g = generateSession({ ...base, focus: ['biceps'], recentSore: ['biceps'] });
    expect(g.muscles).toEqual(['biceps']);
    expect(g.notes.some((n) => /still sore/.test(n))).toBe(true);
  });
  it('pain still excludes even when it empties the pool', () => {
    const g = generateSession({ ...base, focus: ['biceps'], recentPain: ['biceps'] });
    expect(g.exercises).toHaveLength(0);
  });
  it('48 h uses log timestamps, not calendar days', () => {
    const now = new Date('2026-10-28T18:00:00Z');
    const set = (performedOn: string, loggedAt: string | null): LoggedSet => ({ exerciseId: 'bench-press', performedOn, setIndex: 0, loadKg: 60, reps: 8, rir: 2, isWarmup: false, loggedAt });
    const sets = [set('2026-10-26', '2026-10-26T17:00:00Z'), set('2026-10-26', '2026-10-26T19:00:00Z'), set('2026-10-20', '2026-10-28T09:00:00Z'), set('2026-10-27', null), set('2026-10-26', null)];
    expect(setsInLast48h(sets, now, '2026-10-28').map((s) => [s.performedOn, s.loggedAt])).toEqual([
      ['2026-10-26', '2026-10-26T19:00:00Z'],
      ['2026-10-27', null],
    ]);
    expect(trainedLast48h(sets, exById, now, '2026-10-28').chest).toBe(2);
  });
  it('check-in soreness: pain from any check-in, sore only from today/yesterday', () => {
    const r = checkinSoreness(
      [
        { day: '2026-10-28', soreness: { chest: 'sore' } },
        { day: '2026-10-27', soreness: { quads: 'sore', biceps: 'pain' } },
        { day: '2026-10-25', soreness: { back: 'sore', calves: 'pain' } },
      ],
      '2026-10-28',
    );
    expect(r.pain.sort()).toEqual(['biceps', 'calves']);
    expect(r.sore.sort()).toEqual(['chest', 'quads']);
  });
});

describe('generator: inputs', () => {
  it('custom equipment with nothing picked falls back to bodyweight', () => {
    const g = generateSession({ ...base, equipmentPreset: 'custom', equipment: [], focus: 'upper' });
    expect(g.exercises.length).toBeGreaterThan(0);
    for (const e of g.exercises) expect(exById.get(e.exerciseId)!.equipment.some((q) => q === 'bodyweight' || q === 'band')).toBe(true);
    expect(g.notes.some((n) => /No equipment/.test(n))).toBe(true);
  });
  it('carries the progression hint as the exercise note', () => {
    const sets: LoggedSet[] = [0, 1, 2].map((i) => ({ exerciseId: 'dumbbell-lateral-raise', performedOn: '2026-10-21', setIndex: i, loadKg: 10, reps: 25, rir: 0, isWarmup: false }));
    const g = generateSession({ ...base, focus: ['side_delts'], equipmentPreset: 'dumbbells', sets });
    const e = g.exercises.find((x) => x.exerciseId === 'dumbbell-lateral-raise');
    expect(e).toBeDefined();
    expect('note' in e!).toBe(true);
  });
  it('week index is clamped to the block', () => {
    expect(blockWeekIndex('2026-10-26', '2026-10-26', 6)).toBe(0);
    expect(blockWeekIndex('2026-11-09', '2026-10-26', 6)).toBe(2);
    expect(blockWeekIndex('2027-01-04', '2026-10-26', 6)).toBe(5);
    expect(blockWeekIndex('2026-10-19', '2026-10-26', 6)).toBe(0);
  });
});

describe('custom exercise slot tags', () => {
  it('derives a tag for every isolation muscle, carries and core', () => {
    expect(deriveSlotTags('isolation', ['front_delts'])).toEqual(['front_raise']);
    expect(deriveSlotTags('isolation', ['back'])).toEqual(['pullover']);
    expect(deriveSlotTags('isolation', ['forearms'])).toEqual(['forearms']);
    expect(deriveSlotTags('isolation', ['erectors'])).toEqual(['erectors']);
    expect(deriveSlotTags('isolation', ['adductors'])).toEqual(['adductors']);
    expect(deriveSlotTags('carry', ['forearms', 'traps'])).toEqual(['carry', 'forearms', 'traps']);
    expect(deriveSlotTags('core', ['abs'])).toEqual(['abs']);
    expect(deriveSlotTags('horizontal_pull', ['back'])).toEqual(['row_extension', 'row_flared']);
  });
  it('the generator can pick a custom front-delt and back isolation', () => {
    const mk = (id: string, muscle: 'front_delts' | 'back'): ExerciseDef => ({
      id, slug: id, name: id, pattern: 'isolation', category: 'isolation', equipment: ['band'], isMainLift: false, longLengthBias: false, unilateral: false, axialLoad: false,
      impactLowerBody: false, muscles: [{ muscle, role: 'primary' }], substitutions: [], slotTags: deriveSlotTags('isolation', [muscle]), popularity: 1000, custom: true,
    });
    const exercises = [mk('band-front-raise', 'front_delts'), mk('band-straight-arm-pulldown', 'back')];
    const g = generateSession({ ...base, exercises, equipmentPreset: 'custom', equipment: ['band'], focus: ['front_delts', 'back'] });
    expect(g.exercises.map((e) => e.exerciseId).sort()).toEqual(['band-front-raise', 'band-straight-arm-pulldown']);
    expect(rankCandidates({ key: 'x', tags: ['pullover'] }, { exercises, equipment: ['band'], injuries: [], disliked: [] }, new Set())[0].id).toBe('band-straight-arm-pulldown');
  });
});

describe('library helpers', () => {
  it('substitutions leave out disliked exercises', () => {
    const all = substitutionsFor(exById.get('bench-press')!, { exercises: SEED_EXERCISES, equipment: ['barbell', 'dumbbell', 'machine'], injuries: [], disliked: [] });
    const first = all[0];
    const without = substitutionsFor(exById.get('bench-press')!, { exercises: SEED_EXERCISES, equipment: ['barbell', 'dumbbell', 'machine'], injuries: [], disliked: [first.id] });
    expect(without.map((e) => e.id)).not.toContain(first.id);
    expect(primaries('bench-press')).toContain('chest');
  });
  it('increments: catalog step is a floor over the equipment step; a custom step wins', () => {
    const squat = exById.get('back-squat')!;
    expect(squat.defaultIncrementKg).toBeNull(); // main lifts keep fine steps for top singles
    expect(incrementFor(squat, ['barbell'], { barbell: 2.5 })).toBe(2.5);
    expect(incrementFor(exById.get('romanian-deadlift')!, ['barbell'], { barbell: 2.5 })).toBe(5);
    expect(incrementFor(squat, ['barbell'], { barbell: 10 })).toBe(10);
    expect(incrementFor(exById.get('leg-press')!, ['machine'], { machine: 5 })).toBe(10);
    expect(incrementFor(exById.get('dumbbell-lateral-raise')!, ['dumbbell'], { dumbbell: 1 })).toBe(1);
    expect(incrementFor({ equipment: ['machine'], defaultIncrementKg: 1.25, custom: true }, ['machine'], { machine: 5 })).toBe(1.25);
  });
});
