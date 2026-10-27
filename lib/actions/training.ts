'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ALL_MUSCLES } from '@/lib/engine/types';
import { suggestNextSet } from '@/lib/engine/progression';
import { moveWarnings } from '@/lib/engine/schedule';
import { MAX_SETS_PER_EXERCISE } from '@/lib/engine/session';
import { isValidSwap } from '@/lib/engine/swap';
import type { Equipment } from '@/lib/engine/types';
import { isoWeekday, mondayOf, addDays } from '@/lib/engine/util';
import { getUserContext, loadExercises, requireUser } from '@/lib/server/context';
import { recomputeNutrition } from '@/lib/server/plan';
import { refreshTargetsAfterWeighIn } from '@/lib/server/bodyweight';
import { todayIn } from '@/lib/utils/dates';
import { createLogger } from '@/lib/log';

const log = createLogger('actions/training');

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
  if (!p.success) {
    log.warn('saveCheckin: invalid input', { issues: p.error.issues.map((i) => i.path.join('.')) });
    return fail('Invalid check-in');
  }
  const { supabase, user, today } = await userToday();
  const day = p.data.day ?? today;
  log.debug('saveCheckin', { userId: user.id, day });
  // A failed read must not be treated as "no check-in yet": the upsert would wipe the stored bodyweight.
  const { data: existing, error: readErr } = log.db('select checkins', await supabase.from('checkins').select('bodyweight_kg').eq('user_id', user.id).eq('day', day).maybeSingle(), { userId: user.id, day });
  if (readErr) return fail(readErr.message);
  const { error } = log.db('upsert checkins', await supabase.from('checkins').upsert({
    user_id: user.id,
    day,
    sleep_hours: p.data.sleepHours,
    energy: p.data.energy,
    stress: p.data.stress,
    soreness: p.data.soreness,
    bodyweight_kg: p.data.bodyweightKg ?? existing?.bodyweight_kg ?? null,
    note: p.data.note ?? null,
  }), { userId: user.id, day });
  if (error) return fail(error.message);
  log.db('update profiles.last_active_at', await supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('user_id', user.id), { userId: user.id });
  if (p.data.bodyweightKg != null) await refreshTargetsAfterWeighIn(supabase, user.id);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Merge soreness tags into today's check-in (logger finish screen). */
const SorenessTags = z.partialRecord(z.enum(ALL_MUSCLES), z.enum(['sore', 'pain']));

export async function addSoreness(raw: Partial<Record<string, 'sore' | 'pain'>>): Promise<Result> {
  const p = SorenessTags.safeParse(raw);
  if (!p.success) {
    log.warn('addSoreness: invalid input', { issues: p.error.issues.map((i) => i.path.join('.')) });
    return fail('Invalid soreness tags');
  }
  const tags = p.data;
  const { supabase, user, today } = await userToday();
  log.debug('addSoreness', { userId: user.id, muscles: Object.keys(tags).length });
  // A failed read must not be treated as "no check-in yet": the upsert would overwrite today's check-in with nulls.
  const { data: c, error: readErr } = log.db('select checkins', await supabase.from('checkins').select('*').eq('user_id', user.id).eq('day', today).maybeSingle(), { userId: user.id, day: today });
  if (readErr) return fail(readErr.message);
  const soreness = { ...((c?.soreness as Record<string, string>) ?? {}), ...tags };
  const { error } = log.db(
    'upsert checkins.soreness',
    await supabase.from('checkins').upsert({ user_id: user.id, day: today, soreness, sleep_hours: c?.sleep_hours ?? null, energy: c?.energy ?? null, stress: c?.stress ?? null, bodyweight_kg: c?.bodyweight_kg ?? null }),
    { userId: user.id, day: today },
  );
  if (error) return fail(error.message);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function logWeighIn(kg: number, day?: string): Promise<Result<{ targetsUpdated: boolean }>> {
  if (!(kg > 30 && kg < 300)) {
    log.warn('logWeighIn: invalid weight', { kg });
    return fail('Invalid weight');
  }
  const { supabase, user, today } = await userToday();
  const d = day ?? today;
  log.debug('logWeighIn', { userId: user.id, day: d });
  const { data: c, error: readErr } = log.db('select checkins', await supabase.from('checkins').select('day').eq('user_id', user.id).eq('day', d).maybeSingle(), { userId: user.id, day: d });
  if (readErr) return fail(readErr.message);
  const { error } = log.db(
    c ? 'update checkins.bodyweight_kg' : 'insert checkins',
    c
      ? await supabase.from('checkins').update({ bodyweight_kg: kg }).eq('user_id', user.id).eq('day', d)
      : await supabase.from('checkins').insert({ user_id: user.id, day: d, bodyweight_kg: kg }),
    { userId: user.id, day: d },
  );
  if (error) return fail(error.message);
  // The check-in is saved; a retry is idempotent (it takes the update branch above).
  const { error: pErr } = log.db('update profiles.bodyweight_kg', await supabase.from('profiles').update({ bodyweight_kg: kg }).eq('user_id', user.id), { userId: user.id });
  if (pErr) return fail(pErr.message);
  // New bodyweight flows straight into the targets when it moves the averaged weight enough (DECISIONS 37).
  const { refreshed } = await refreshTargetsAfterWeighIn(supabase, user.id);
  revalidatePath('/', 'layout');
  return { ok: true, data: { targetsUpdated: refreshed } };
}

// ---------------------------------------------------------------------------
// Logger (8.3)
// ---------------------------------------------------------------------------
export async function startSession(sessionId: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  log.debug('startSession', { userId: user.id, sessionId });
  const { error } = log.db(
    'update planned_sessions -> in_progress',
    await supabase
      .from('planned_sessions')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .in('status', ['planned', 'moved']),
    { sessionId },
  );
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
  /** Warm-up sets (T-WUP-01) have their own set_index sequence and never count toward volume, e1RM or PRs. */
  isWarmup: z.boolean().optional(),
});

/** Idempotent on (planned_exercise_id, is_warmup, set_index) (Section 11). Returns the next-set suggestion (6.10). */
export async function logSet(raw: z.input<typeof LogSetInput>): Promise<Result<{ id: string; next: { load: number | null; repsTarget: number; ruleIds: string[] } }>> {
  const p = LogSetInput.safeParse(raw);
  if (!p.success) {
    log.warn('logSet: invalid input', { issues: p.error.issues.map((i) => i.path.join('.')) });
    return fail('Invalid set');
  }
  const d = p.data;
  const { supabase, user, today } = await userToday();
  log.debug('logSet', { sessionId: d.sessionId, plannedExerciseId: d.plannedExerciseId, setIndex: d.setIndex });
  const { data, error } = log.db('upsert logged_sets', await supabase
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
        is_warmup: d.isWarmup ?? false,
      },
      { onConflict: 'planned_exercise_id,is_warmup,set_index' },
    )
    .select('id')
    .single(), { sessionId: d.sessionId, plannedExerciseId: d.plannedExerciseId, setIndex: d.setIndex });
  if (error) return fail(error.message);
  // A session left 'planned' would be deleted with its sets by the next plan regeneration. The set upsert is idempotent, so a retry is safe.
  const { error: sErr } = log.db('update planned_sessions -> in_progress', await supabase.from('planned_sessions').update({ status: 'in_progress' }).eq('id', d.sessionId).eq('user_id', user.id).eq('status', 'planned'), { sessionId: d.sessionId });
  if (sErr) return fail(sErr.message);
  // A warm-up doesn't steer the working sets: echo it back unchanged.
  const next = d.isWarmup
    ? { load: d.loadKg, repsTarget: d.reps, ruleIds: ['T-WUP-01'] }
    : suggestNextSet({ rx: d.rx, setIndex: d.setIndex, load: d.loadKg, reps: d.reps, increment: d.increment });
  return { ok: true, data: { id: data.id, next } };
}

export async function deleteSet(plannedExerciseId: string, setIndex: number, isWarmup = false): Promise<Result> {
  const { supabase, user } = await requireUser();
  log.debug('deleteSet', { plannedExerciseId, setIndex, isWarmup });
  const { error } = log.db(
    'delete logged_sets',
    await supabase.from('logged_sets').delete().eq('user_id', user.id).eq('planned_exercise_id', plannedExerciseId).eq('is_warmup', isWarmup).eq('set_index', setIndex),
    { plannedExerciseId, setIndex, isWarmup },
  );
  if (error) return fail(error.message);
  return { ok: true };
}

export async function addSetToExercise(plannedExerciseId: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  const { data, error: readErr } = log.db('select planned_exercises.sets', await supabase.from('planned_exercises').select('sets').eq('id', plannedExerciseId).eq('user_id', user.id).maybeSingle(), { plannedExerciseId });
  if (readErr) return fail(readErr.message);
  if (!data) return fail('Not found');
  if (data.sets >= MAX_SETS_PER_EXERCISE) return fail(`${MAX_SETS_PER_EXERCISE} sets is the limit for one exercise: past ~11 sets for a muscle in one session, extra sets are mostly junk volume (T-FRQ-01).`);
  const { error } = log.db('update planned_exercises.sets', await supabase.from('planned_exercises').update({ sets: data.sets + 1 }).eq('id', plannedExerciseId).eq('user_id', user.id), { plannedExerciseId });
  if (error) return fail(error.message);
  return { ok: true };
}

export async function skipExercise(plannedExerciseId: string, skipped: boolean): Promise<Result> {
  const { supabase, user } = await requireUser();
  const { error } = log.db('update planned_exercises.skipped', await supabase.from('planned_exercises').update({ skipped }).eq('id', plannedExerciseId).eq('user_id', user.id), { plannedExerciseId, skipped });
  if (error) return fail(error.message);
  return { ok: true };
}

export async function saveExerciseNote(plannedExerciseId: string, note: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  const { error } = log.db('update planned_exercises.note', await supabase.from('planned_exercises').update({ note: note.slice(0, 300) || null }).eq('id', plannedExerciseId).eq('user_id', user.id), { plannedExerciseId });
  if (error) return fail(error.message);
  return { ok: true };
}

/** Swap exercise (6.15). scope 'session' = local; 'block' = every future planned exercise of the same kind. */
export async function swapExercise(plannedExerciseId: string, toExerciseId: string, scope: 'session' | 'block'): Promise<Result> {
  const { supabase, user, today, settings, injuries } = await userToday();
  log.debug('swapExercise', { plannedExerciseId, toExerciseId, scope });
  if (!settings) return fail('Not found');
  const [peRes, exercises] = await Promise.all([
    supabase.from('planned_exercises').select('exercise_id, session_id').eq('id', plannedExerciseId).eq('user_id', user.id).maybeSingle(),
    loadExercises(supabase),
  ]);
  const { data: pe, error: peErr } = log.db('select planned_exercises', peRes, { plannedExerciseId });
  if (peErr) return fail(peErr.message);
  if (!pe) return fail('Not found');
  // Same list the logger offers (same muscle, equipment, injuries, dislikes), so a crafted request can't swap in anything else.
  const from = exercises.find((e) => e.id === pe.exercise_id);
  const ctxSel = { exercises, equipment: settings.equipment as Equipment[], injuries, disliked: settings.disliked_exercise_ids };
  if (!from || !isValidSwap(from, toExerciseId, ctxSel)) {
    log.warn('swapExercise: not a valid substitute', { plannedExerciseId, from: pe.exercise_id, toExerciseId });
    return fail('That exercise is not a valid swap here. Pick one from the list.');
  }
  const { error: swapErr } = log.db('update planned_exercises.exercise_id', await supabase.from('planned_exercises').update({ exercise_id: toExerciseId, suggested_load_kg: null }).eq('id', plannedExerciseId).eq('user_id', user.id), { plannedExerciseId, toExerciseId });
  if (swapErr) return fail(swapErr.message);
  if (scope === 'block') {
    // The session swap above is saved; a block-wide failure below is reported so the user can retry with scope 'block'.
    revalidatePath(`/session/${pe.session_id}`);
    const { data: future, error: futureErr } = log.db(
      'select future planned_exercises',
      await supabase
        .from('planned_exercises')
        .select('id, planned_sessions!inner(scheduled_on, status)')
        .eq('user_id', user.id)
        .eq('exercise_id', pe.exercise_id)
        .gte('planned_sessions.scheduled_on', today)
        .eq('planned_sessions.status', 'planned'),
      { plannedExerciseId },
    );
    if (futureErr) return fail(futureErr.message);
    const ids = (future ?? []).map((f) => f.id);
    if (ids.length) {
      const { error } = log.db('update future planned_exercises.exercise_id', await supabase.from('planned_exercises').update({ exercise_id: toExerciseId, suggested_load_kg: null }).in('id', ids).eq('user_id', user.id), { count: ids.length, toExerciseId });
      if (error) return fail(error.message);
    }
    // Keep the swap for future blocks too (T-SEL-06 stability).
    const { data: block, error: blockErr } = log.db('select active block', await supabase.from('blocks').select('id, selections').eq('user_id', user.id).eq('status', 'active').maybeSingle(), { userId: user.id });
    if (blockErr) return fail(blockErr.message);
    if (block) {
      const sel = block.selections as Record<string, Record<string, string>>;
      for (const t of Object.values(sel)) for (const k of Object.keys(t)) if (t[k] === pe.exercise_id) t[k] = toExerciseId;
      const { error } = log.db('update blocks.selections', await supabase.from('blocks').update({ selections: sel }).eq('id', block.id).eq('user_id', user.id), { blockId: block.id });
      if (error) return fail(error.message);
    }
  }
  revalidatePath(`/session/${pe.session_id}`);
  return { ok: true };
}

export async function finishSession(sessionId: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  log.debug('finishSession', { sessionId });
  const { error } = log.db(
    'update planned_sessions -> done',
    await supabase.from('planned_sessions').update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', sessionId).eq('user_id', user.id),
    { sessionId },
  );
  if (error) return fail(error.message);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function skipSession(sessionId: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  log.debug('skipSession', { sessionId });
  const { error } = log.db('update planned_sessions -> skipped', await supabase.from('planned_sessions').update({ status: 'skipped' }).eq('id', sessionId).eq('user_id', user.id), { sessionId });
  if (error) return fail(error.message);
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
  log.debug('moveSession', { sessionId, toDate, force });
  const { data: s, error: sErr } = log.db('select planned_sessions', await supabase.from('planned_sessions').select('*').eq('id', sessionId).eq('user_id', user.id).maybeSingle(), { sessionId });
  if (sErr) return fail(sErr.message);
  if (!s) return fail('Not found');
  // A failed read must not count as "nothing that day", or the double-session guard is skipped.
  const { data: sameDay, error: sameDayErr } = log.db(
    'select same-day sessions',
    await supabase.from('planned_sessions').select('id, kind').eq('user_id', user.id).eq('scheduled_on', toDate).neq('id', sessionId).in('status', ['planned', 'in_progress', 'done']),
    { sessionId, toDate },
  );
  if (sameDayErr) return fail(sameDayErr.message);
  if ((sameDay ?? []).some((x) => x.kind !== 'generated')) return fail('There is already a lifting session that day. Never double up two hard sessions (T-FAT-07).');
  const warnings = moveWarnings(s.template_key, isoWeekday(toDate), sports);
  if (warnings.length && !force) return { ok: true, data: { warnings } };
  const { error } = log.db('update planned_sessions.scheduled_on', await supabase.from('planned_sessions').update({ scheduled_on: toDate, status: 'planned' }).eq('id', sessionId).eq('user_id', user.id), { sessionId, toDate });
  if (error) return fail(error.message);
  revalidatePath('/', 'layout');
  return { ok: true, data: { warnings: [] } };
}

/** T-FAT-08: swap today's session with this week's lightest remaining session. */
export async function swapForLightest(sessionId: string): Promise<Result<{ title: string }>> {
  const { supabase, user, today } = await userToday();
  const weekEnd = addDays(mondayOf(today), 7);
  log.debug('swapForLightest', { sessionId });
  const { data: rows, error: rowsErr } = log.db(
    'select week sessions',
    await supabase.from('planned_sessions').select('id, title, scheduled_on, planned_exercises(sets)').eq('user_id', user.id).eq('status', 'planned').gte('scheduled_on', today).lt('scheduled_on', weekEnd),
    { sessionId },
  );
  if (rowsErr) return fail(rowsErr.message);
  const cur = (rows ?? []).find((r) => r.id === sessionId);
  const others = (rows ?? []).filter((r) => r.id !== sessionId);
  if (!cur || !others.length) return fail('No other session left this week to swap with.');
  const total = (r: (typeof others)[number]) => (r.planned_exercises ?? []).reduce((a, e) => a + e.sets, 0);
  const lightest = others.sort((a, b) => total(a) - total(b))[0];
  if (total(lightest) >= total(cur)) return fail('Today is already the lightest session this week.');
  // Two separate writes: if the second fails, put the first back so both sessions don't end up on the same day.
  const { error: e1 } = log.db('swap: move current session', await supabase.from('planned_sessions').update({ scheduled_on: lightest.scheduled_on }).eq('id', cur.id).eq('user_id', user.id), { sessionId: cur.id });
  if (e1) return fail(e1.message);
  const { error: e2 } = log.db('swap: move lightest session', await supabase.from('planned_sessions').update({ scheduled_on: cur.scheduled_on }).eq('id', lightest.id).eq('user_id', user.id), { sessionId: lightest.id });
  if (e2) {
    const { error: undoErr } = log.db('swap: undo move current session', await supabase.from('planned_sessions').update({ scheduled_on: cur.scheduled_on }).eq('id', cur.id).eq('user_id', user.id), { sessionId: cur.id });
    revalidatePath('/', 'layout');
    if (undoErr) return fail('Swap failed halfway and could not be undone. Check this week and move a session back.');
    return fail(e2.message);
  }
  revalidatePath('/', 'layout');
  return { ok: true, data: { title: lightest.title } };
}

// ---------------------------------------------------------------------------
// Sport logging (8.3)
// ---------------------------------------------------------------------------
const SportLog = z.object({ sportId: z.string().min(1), minutes: z.number().int().min(5).max(400), rpe: z.number().int().min(1).max(10), note: z.string().max(300).optional(), day: z.iso.date().optional() });

export async function logSport(raw: z.input<typeof SportLog>): Promise<Result> {
  const p = SportLog.safeParse(raw);
  if (!p.success) {
    log.warn('logSport: invalid input', { issues: p.error.issues.map((i) => i.path.join('.')) });
    return fail('Invalid sport log');
  }
  const { supabase, user, today } = await userToday();
  log.debug('logSport', { userId: user.id, sportId: p.data.sportId });
  const { error } = log.db('insert sport_logs', await supabase.from('sport_logs').insert({
    user_id: user.id,
    sport_id: p.data.sportId,
    performed_on: p.data.day ?? today,
    minutes: p.data.minutes,
    session_rpe: p.data.rpe,
    note: p.data.note ?? null,
  }), { userId: user.id });
  if (error) return fail(error.message);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function refreshNutritionNow(): Promise<Result> {
  const { supabase, user } = await requireUser();
  try {
    await recomputeNutrition(supabase, user.id, 'manual refresh');
  } catch (e) {
    log.error('refreshNutritionNow failed', { userId: user.id, err: e });
    return fail(e instanceof Error ? e.message : 'Could not refresh nutrition');
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}
