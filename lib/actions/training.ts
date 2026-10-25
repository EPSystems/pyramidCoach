'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ALL_MUSCLES } from '@/lib/engine/types';
import { suggestNextSet } from '@/lib/engine/progression';
import { moveWarnings } from '@/lib/engine/schedule';
import { isoWeekday, mondayOf, addDays } from '@/lib/engine/util';
import { getUserContext, requireUser } from '@/lib/server/context';
import { recomputeNutrition } from '@/lib/server/plan';
import { todayIn } from '@/lib/utils/dates';

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

async function userToday() {
  const ctx = await getUserContext();
  return { ...ctx, today: todayIn(ctx.profile?.timezone ?? 'Europe/Sofia') };
}

// ---------------------------------------------------------------------------
// Check-in (8.2)
// ---------------------------------------------------------------------------
const CheckinInput = z.object({
  day: z.iso.date().optional(),
  sleepHours: z.number().min(0).max(16).nullable(),
  energy: z.number().int().min(1).max(5).nullable(),
  stress: z.number().int().min(1).max(5).nullable(),
  soreness: z.partialRecord(z.enum(ALL_MUSCLES), z.enum(['sore', 'pain'])),
  bodyweightKg: z.number().min(30).max(300).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function saveCheckin(raw: z.input<typeof CheckinInput>): Promise<Result> {
  const p = CheckinInput.safeParse(raw);
  if (!p.success) return fail('Invalid check-in');
  const { supabase, user, today } = await userToday();
  const day = p.data.day ?? today;
  const { data: existing } = await supabase.from('checkins').select('bodyweight_kg').eq('user_id', user.id).eq('day', day).maybeSingle();
  const { error } = await supabase.from('checkins').upsert({
    user_id: user.id,
    day,
    sleep_hours: p.data.sleepHours,
    energy: p.data.energy,
    stress: p.data.stress,
    soreness: p.data.soreness,
    bodyweight_kg: p.data.bodyweightKg ?? existing?.bodyweight_kg ?? null,
    note: p.data.note ?? null,
  });
  if (error) return fail(error.message);
  await supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('user_id', user.id);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Merge soreness tags into today's check-in (logger finish screen). */
export async function addSoreness(tags: Partial<Record<string, 'sore' | 'pain'>>): Promise<Result> {
  const { supabase, user, today } = await userToday();
  const { data: c } = await supabase.from('checkins').select('*').eq('user_id', user.id).eq('day', today).maybeSingle();
  const soreness = { ...((c?.soreness as Record<string, string>) ?? {}), ...tags };
  const { error } = await supabase.from('checkins').upsert({ user_id: user.id, day: today, soreness, sleep_hours: c?.sleep_hours ?? null, energy: c?.energy ?? null, stress: c?.stress ?? null, bodyweight_kg: c?.bodyweight_kg ?? null });
  if (error) return fail(error.message);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function logWeighIn(kg: number, day?: string): Promise<Result> {
  if (!(kg > 30 && kg < 300)) return fail('Invalid weight');
  const { supabase, user, today } = await userToday();
  const d = day ?? today;
  const { data: c } = await supabase.from('checkins').select('day').eq('user_id', user.id).eq('day', d).maybeSingle();
  const { error } = c
    ? await supabase.from('checkins').update({ bodyweight_kg: kg }).eq('user_id', user.id).eq('day', d)
    : await supabase.from('checkins').insert({ user_id: user.id, day: d, bodyweight_kg: kg });
  if (error) return fail(error.message);
  await supabase.from('profiles').update({ bodyweight_kg: kg }).eq('user_id', user.id);
  revalidatePath('/', 'layout');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Logger (8.3)
// ---------------------------------------------------------------------------
export async function startSession(sessionId: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from('planned_sessions')
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .in('status', ['planned', 'moved']);
  if (error) return fail(error.message);
  return { ok: true };
}

const LogSetInput = z.object({
  sessionId: z.guid(),
  plannedExerciseId: z.guid(),
  exerciseId: z.guid(),
  setIndex: z.number().int().min(0).max(20),
  loadKg: z.number().min(0).max(600).nullable(),
  reps: z.number().int().min(0).max(100),
  rir: z.number().min(0).max(10).nullable(),
  rx: z.object({ repMin: z.number(), repMax: z.number(), rirMin: z.number(), rirMax: z.number() }),
  increment: z.number().positive(),
});

/** Idempotent on (planned_exercise_id, set_index) (Section 11). Returns the next-set suggestion (6.10). */
export async function logSet(raw: z.input<typeof LogSetInput>): Promise<Result<{ id: string; next: { load: number | null; repsTarget: number; ruleIds: string[] } }>> {
  const p = LogSetInput.safeParse(raw);
  if (!p.success) return fail('Invalid set');
  const d = p.data;
  const { supabase, user, today } = await userToday();
  const { data, error } = await supabase
    .from('logged_sets')
    .upsert(
      {
        user_id: user.id,
        session_id: d.sessionId,
        planned_exercise_id: d.plannedExerciseId,
        exercise_id: d.exerciseId,
        performed_on: today,
        set_index: d.setIndex,
        load_kg: d.loadKg,
        reps: d.reps,
        rir: d.rir,
        is_warmup: false,
      },
      { onConflict: 'planned_exercise_id,set_index' },
    )
    .select('id')
    .single();
  if (error) return fail(error.message);
  await supabase.from('planned_sessions').update({ status: 'in_progress' }).eq('id', d.sessionId).eq('status', 'planned');
  const next = suggestNextSet({ rx: d.rx, setIndex: d.setIndex, load: d.loadKg, reps: d.reps, increment: d.increment });
  return { ok: true, data: { id: data.id, next } };
}

export async function deleteSet(plannedExerciseId: string, setIndex: number): Promise<Result> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from('logged_sets').delete().eq('user_id', user.id).eq('planned_exercise_id', plannedExerciseId).eq('set_index', setIndex);
  if (error) return fail(error.message);
  return { ok: true };
}

export async function addSetToExercise(plannedExerciseId: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from('planned_exercises').select('sets').eq('id', plannedExerciseId).eq('user_id', user.id).single();
  if (!data) return fail('Not found');
  await supabase.from('planned_exercises').update({ sets: Math.min(10, data.sets + 1) }).eq('id', plannedExerciseId);
  return { ok: true };
}

export async function skipExercise(plannedExerciseId: string, skipped: boolean): Promise<Result> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from('planned_exercises').update({ skipped }).eq('id', plannedExerciseId).eq('user_id', user.id);
  if (error) return fail(error.message);
  return { ok: true };
}

export async function saveExerciseNote(plannedExerciseId: string, note: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from('planned_exercises').update({ note: note.slice(0, 300) || null }).eq('id', plannedExerciseId).eq('user_id', user.id);
  if (error) return fail(error.message);
  return { ok: true };
}

/** Swap exercise (6.15). scope 'session' = local; 'block' = every future planned exercise of the same kind. */
export async function swapExercise(plannedExerciseId: string, toExerciseId: string, scope: 'session' | 'block'): Promise<Result> {
  const { supabase, user, today } = await userToday();
  const { data: pe } = await supabase.from('planned_exercises').select('exercise_id, session_id').eq('id', plannedExerciseId).eq('user_id', user.id).single();
  if (!pe) return fail('Not found');
  await supabase.from('planned_exercises').update({ exercise_id: toExerciseId, suggested_load_kg: null }).eq('id', plannedExerciseId);
  if (scope === 'block') {
    const { data: future } = await supabase
      .from('planned_exercises')
      .select('id, planned_sessions!inner(scheduled_on, status)')
      .eq('user_id', user.id)
      .eq('exercise_id', pe.exercise_id)
      .gte('planned_sessions.scheduled_on', today)
      .eq('planned_sessions.status', 'planned');
    const ids = (future ?? []).map((f) => f.id);
    if (ids.length) await supabase.from('planned_exercises').update({ exercise_id: toExerciseId, suggested_load_kg: null }).in('id', ids);
    // Keep the swap for future blocks too (T-SEL-06 stability).
    const { data: block } = await supabase.from('blocks').select('id, selections').eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (block) {
      const sel = block.selections as Record<string, Record<string, string>>;
      for (const t of Object.values(sel)) for (const k of Object.keys(t)) if (t[k] === pe.exercise_id) t[k] = toExerciseId;
      await supabase.from('blocks').update({ selections: sel }).eq('id', block.id);
    }
  }
  revalidatePath(`/session/${pe.session_id}`);
  return { ok: true };
}

export async function finishSession(sessionId: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from('planned_sessions')
    .update({ status: 'done', finished_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', user.id);
  if (error) return fail(error.message);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function skipSession(sessionId: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  await supabase.from('planned_sessions').update({ status: 'skipped' }).eq('id', sessionId).eq('user_id', user.id);
  revalidatePath('/', 'layout');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Moving sessions (T-FAT-07 / T-FAT-08 / 8.4)
// ---------------------------------------------------------------------------
export async function moveSession(sessionId: string, toDate: string, force = false): Promise<Result<{ warnings: string[] }>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return fail('Invalid date');
  const { supabase, user, today, sports } = await userToday();
  if (toDate < today) return fail('Pick today or a later day');
  const { data: s } = await supabase.from('planned_sessions').select('*').eq('id', sessionId).eq('user_id', user.id).single();
  if (!s) return fail('Not found');
  const { data: sameDay } = await supabase
    .from('planned_sessions')
    .select('id, kind')
    .eq('user_id', user.id)
    .eq('scheduled_on', toDate)
    .neq('id', sessionId)
    .in('status', ['planned', 'in_progress', 'done']);
  if ((sameDay ?? []).some((x) => x.kind !== 'generated')) return fail('There is already a lifting session that day — never double up two hard sessions (T-FAT-07).');
  const warnings = moveWarnings(s.template_key, isoWeekday(toDate), sports);
  if (warnings.length && !force) return { ok: true, data: { warnings } };
  await supabase.from('planned_sessions').update({ scheduled_on: toDate, status: 'planned' }).eq('id', sessionId);
  revalidatePath('/', 'layout');
  return { ok: true, data: { warnings: [] } };
}

/** T-FAT-08: swap today's session with this week's lightest remaining session. */
export async function swapForLightest(sessionId: string): Promise<Result<{ title: string }>> {
  const { supabase, user, today } = await userToday();
  const weekEnd = addDays(mondayOf(today), 7);
  const { data: rows } = await supabase
    .from('planned_sessions')
    .select('id, title, scheduled_on, planned_exercises(sets)')
    .eq('user_id', user.id)
    .eq('status', 'planned')
    .gte('scheduled_on', today)
    .lt('scheduled_on', weekEnd);
  const cur = (rows ?? []).find((r) => r.id === sessionId);
  const others = (rows ?? []).filter((r) => r.id !== sessionId);
  if (!cur || !others.length) return fail('No other session left this week to swap with.');
  const total = (r: (typeof others)[number]) => (r.planned_exercises ?? []).reduce((a, e) => a + e.sets, 0);
  const lightest = others.sort((a, b) => total(a) - total(b))[0];
  if (total(lightest) >= total(cur)) return fail('Today is already the lightest session this week.');
  await supabase.from('planned_sessions').update({ scheduled_on: lightest.scheduled_on }).eq('id', cur.id);
  await supabase.from('planned_sessions').update({ scheduled_on: cur.scheduled_on }).eq('id', lightest.id);
  revalidatePath('/', 'layout');
  return { ok: true, data: { title: lightest.title } };
}

// ---------------------------------------------------------------------------
// Sport logging (8.3)
// ---------------------------------------------------------------------------
const SportLog = z.object({ sportId: z.string().min(1), minutes: z.number().int().min(5).max(400), rpe: z.number().int().min(1).max(10), note: z.string().max(300).optional(), day: z.iso.date().optional() });

export async function logSport(raw: z.input<typeof SportLog>): Promise<Result> {
  const p = SportLog.safeParse(raw);
  if (!p.success) return fail('Invalid sport log');
  const { supabase, user, today } = await userToday();
  const { error } = await supabase.from('sport_logs').insert({
    user_id: user.id,
    sport_id: p.data.sportId,
    performed_on: p.data.day ?? today,
    minutes: p.data.minutes,
    session_rpe: p.data.rpe,
    note: p.data.note ?? null,
  });
  if (error) return fail(error.message);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function goToSession(sessionId: string) {
  await startSession(sessionId);
  redirect(`/session/${sessionId}`);
}

export async function refreshNutritionNow(): Promise<Result> {
  const { supabase, user } = await requireUser();
  await recomputeNutrition(supabase, user.id, 'manual refresh');
  revalidatePath('/nutrition');
  return { ok: true };
}
