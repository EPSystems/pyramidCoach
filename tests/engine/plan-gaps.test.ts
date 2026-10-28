import { describe, expect, it } from 'vitest';
import { generateBlock } from '@/lib/engine/block';
import { carryOverEdits, planKey, type PriorSession } from '@/lib/engine/carryover';
import { placeSessions, scorePlacement, sportBeforeLifting } from '@/lib/engine/schedule';
import { chooseSplit, TEMPLATES } from '@/lib/engine/split';
import type { PlannedSession } from '@/lib/engine/types';
import { mondayOf } from '@/lib/engine/util';
import { baseInput, sport } from './helpers';

const T03 = (r: ReturnType<typeof scorePlacement>) => r.penalties.filter((p) => p.rule === 'T-SCH-03' && p.points === 3);

describe('lifting time of day (T-SCH-03)', () => {
  it('unknown lifting time keeps the old assumption: only a morning sport counts as before lifting', () => {
    expect(sportBeforeLifting('morning', null)).toBe('before');
    expect(sportBeforeLifting('evening', null)).toBeNull();
    expect(sportBeforeLifting(null, 'evening')).toBeNull();
  });
  it('known lifting time: earlier slot = before, same slot = close, later slot = fine', () => {
    expect(sportBeforeLifting('morning', 'evening')).toBe('before');
    expect(sportBeforeLifting('midday', 'evening')).toBe('before');
    expect(sportBeforeLifting('evening', 'evening')).toBe('close');
    expect(sportBeforeLifting('evening', 'morning')).toBeNull();
    expect(sportBeforeLifting('morning', 'morning')).toBe('close');
  });
  it('penalises a sport in the same slot as lifting, not one after it', () => {
    const placements = [{ weekday: 3, templateKey: 'upper_a' }];
    const evening = [sport('running', [3], 'moderate', 45, 'evening')];
    expect(T03(scorePlacement(placements, evening, 'lean_gain', 'morning'))).toHaveLength(0);
    expect(T03(scorePlacement(placements, evening, 'lean_gain', 'evening'))).toHaveLength(1);
    expect(T03(scorePlacement(placements, evening, 'lean_gain', null))).toHaveLength(0);
    const morning = [sport('running', [3], 'moderate', 45, 'morning')];
    expect(T03(scorePlacement(placements, morning, 'lean_gain', 'evening'))[0].detail).toMatch(/before your evening lifting/);
  });
  it('placement avoids an evening sport day when the user lifts in the evening', () => {
    const sports = [sport('running', [1], 'moderate', 45, 'evening')];
    const evening = placeSessions({ availableDays: [1, 2, 4, 5], templates: ['full_a', 'full_b'], sports, goal: 'lean_gain', liftingTime: 'evening' });
    expect(evening.placements.map((p) => p.weekday)).not.toContain(1);
    // With unknown time an evening sport carries no time penalty, only the moderate same-day cost.
    const unknown = scorePlacement([{ weekday: 1, templateKey: 'full_a' }], sports, 'lean_gain', null);
    expect(unknown.penalties.some((p) => /evening/.test(p.detail))).toBe(false);
  });
});

describe('strength goal on 6 days', () => {
  it('chooseSplit gives strength a 6-day split with main-lift slots', () => {
    const sp = chooseSplit(6, { goal: 'strength', lowerTargetAvg: 10, maxTarget: 10 }).split;
    expect(sp.key).toBe('ULF6');
    const mains = sp.templates.flatMap((t) => TEMPLATES[t].slots.filter((s) => s.mainLift).map((s) => s.mainLift));
    // T-FRQ-03 / T-STR-05: squat and bench get 2 exposures, deadlift and OHP 1.
    expect(mains.filter((m) => m === 'squat')).toHaveLength(2);
    expect(mains.filter((m) => m === 'bench')).toHaveLength(2);
    // Non-strength goals are unchanged.
    expect(chooseSplit(6, { goal: 'lean_gain', lowerTargetAvg: 10, maxTarget: 10 }).split.key).toBe('PYR6');
  });
  it('a strength block can use 6 days with short sessions when the user allows 6', () => {
    const plan = generateBlock(
      baseInput({ goal: 'strength', sessionMinutes: 30, maxLiftDays: 6, history: { sets: [], e1rmSeeds: { squat: 120, bench: 100, deadlift: 150 } } }),
    );
    expect(plan.liftDays).toBeLessThanOrEqual(6);
    if (plan.liftDays === 6) expect(plan.splitKey).toBe('ULF6');
    // Never above the user's cap.
    const capped = generateBlock(baseInput({ goal: 'strength', sessionMinutes: 30, maxLiftDays: 5 }));
    expect(capped.liftDays).toBeLessThanOrEqual(5);
  });
});

describe('plan keys and carry-over', () => {
  const input = baseInput({ today: '2026-10-28', startsOn: '2026-10-26', materialiseFrom: '2026-10-26' }); // Wednesday
  const plan = generateBlock(input);
  const week0 = plan.sessions.filter((s) => s.weekIndex === 0);

  it('materialises from the given Monday and gives every session a unique stable key', () => {
    expect(plan.sessions[0].date >= '2026-10-26').toBe(true);
    expect(week0.some((s) => s.date < '2026-10-28')).toBe(true);
    const keys = plan.sessions.map((s) => s.planKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of plan.sessions) expect(s.planKey!.startsWith(`${mondayOf(s.date)}|${s.templateKey}|`)).toBe(true);
    // Same inputs → same keys (regeneration-stable).
    expect(generateBlock(input).sessions.map((s) => s.planKey)).toEqual(keys);
  });

  const prior = (s: PlannedSession, over: Partial<PriorSession> = {}): PriorSession => ({ planKey: s.planKey!, plannedOn: s.date, scheduledOn: s.date, status: 'planned', swaps: [], ...over });
  const run = (p: PriorSession[], allow: (id: string) => boolean = () => true) => carryOverEdits({ sessions: plan.sessions, prior: p, today: '2026-10-28', allowExercise: allow });
  const future = plan.sessions.filter((s) => s.date >= '2026-10-28');
  const free = (from: string) => {
    const taken = new Set(plan.sessions.map((s) => s.date));
    for (let d = new Date(`${from}T00:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (!taken.has(iso)) return iso;
    }
  };

  it('drops past sessions that nothing carries, keeps the rest unchanged', () => {
    const r = run([]);
    expect(r.sessions.every((s) => s.date >= '2026-10-28')).toBe(true);
    expect(r.sessions).toHaveLength(future.length);
  });

  it('keeps a skip', () => {
    const target = future[1];
    const r = run([prior(target, { status: 'skipped' })]);
    expect(r.sessions.find((s) => s.planKey === target.planKey)?.status).toBe('skipped');
    expect(r.kept.skips).toBe(1);
  });

  it('keeps a move to a free day and records the engine date', () => {
    const target = future[0];
    const to = free(target.date);
    const r = run([prior(target, { scheduledOn: to })]);
    const s = r.sessions.find((x) => x.planKey === target.planKey)!;
    expect(s.date).toBe(to);
    expect(s.plannedOn).toBe(target.date);
    expect(r.kept.moves).toBe(1);
  });

  it('carries a session moved off a past day this week into the future', () => {
    const past = week0.find((s) => s.date < '2026-10-28')!;
    const to = free('2026-10-28');
    const r = run([prior(past, { scheduledOn: to })]);
    expect(r.sessions.find((x) => x.planKey === past.planKey)?.date).toBe(to);
  });

  it('drops a move that now collides with another session (engine dates win)', () => {
    const [a, b] = future;
    const r = run([prior(a, { scheduledOn: b.date })]);
    expect(r.sessions.find((x) => x.planKey === a.planKey)?.date).toBe(a.date);
    expect(r.dropped.moves).toBe(1);
  });

  it('keeps a date swap between two sessions (swap for lightest)', () => {
    const [a, b] = future;
    const r = run([prior(a, { scheduledOn: b.date }), prior(b, { scheduledOn: a.date })]);
    expect(r.sessions.find((x) => x.planKey === a.planKey)?.date).toBe(b.date);
    expect(r.sessions.find((x) => x.planKey === b.planKey)?.date).toBe(a.date);
  });

  it('drops the copy of a session already trained', () => {
    const target = future[0];
    const r = run([prior(target, { status: 'done' })]);
    expect(r.sessions.some((x) => x.planKey === target.planKey)).toBe(false);
  });

  it('re-applies a session-only swap when the engine picks the same exercise and the swap is still allowed', () => {
    const target = future[0];
    const ex = target.exercises.find((e) => !e.isMainLiftSingle)!;
    const sw = { slotKey: ex.slotKey, fromExerciseId: ex.exerciseId, toExerciseId: 'swapped-in' };
    const r = run([prior(target, { swaps: [sw] })]);
    const got = r.sessions.find((x) => x.planKey === target.planKey)!.exercises.find((e) => e.slotKey === ex.slotKey)!;
    expect(got.exerciseId).toBe('swapped-in');
    expect(got.originalExerciseId).toBe(ex.exerciseId);
    expect(got.suggestedLoadKg).toBeNull();
    // Other sessions are untouched.
    expect(r.sessions.find((x) => x.planKey === future[1].planKey)!.exercises.some((e) => e.exerciseId === 'swapped-in')).toBe(false);
  });

  it('drops a swap when the engine now picks another exercise or the swapped-in one is no longer allowed', () => {
    const target = future[0];
    const ex = target.exercises.find((e) => !e.isMainLiftSingle)!;
    const stale = run([prior(target, { swaps: [{ slotKey: ex.slotKey, fromExerciseId: 'something-else', toExerciseId: 'swapped-in' }] })]);
    expect(stale.dropped.swaps).toBe(1);
    const banned = run([prior(target, { swaps: [{ slotKey: ex.slotKey, fromExerciseId: ex.exerciseId, toExerciseId: 'swapped-in' }] })], () => false);
    expect(banned.sessions.find((x) => x.planKey === target.planKey)!.exercises.find((e) => e.slotKey === ex.slotKey)!.exerciseId).toBe(ex.exerciseId);
  });

  it('re-applies an accepted deload: set cuts per slot, removed exercises stay removed', () => {
    const target = future[0];
    const [first, removed, ...rest] = target.exercises;
    const setsBySlot = Object.fromEntries([first, ...rest].map((e) => [e.slotKey, Math.max(1, e.sets - 2)]));
    const r = run([prior(target, { deload: { setsBySlot } })]);
    const got = r.sessions.find((x) => x.planKey === target.planKey)!;
    expect(got.kind).toBe('deload');
    expect(got.exercises.some((e) => e.slotKey === removed.slotKey)).toBe(false);
    expect(got.exercises.map((e) => e.sets)).toEqual([first, ...rest].map((e) => Math.min(e.sets, setsBySlot[e.slotKey])));
    expect(got.exercises.map((e) => e.position)).toEqual(got.exercises.map((_, i) => i));
    expect(r.kept.deloads).toBe(1);
  });

  it('planKey is week Monday | template | occurrence', () => {
    expect(planKey('2026-10-29', 'upper_a', 1)).toBe('2026-10-26|upper_a|1');
  });
});
