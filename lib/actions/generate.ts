'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { blockWeekIndex, checkinSoreness, generateSession, trainedLast48h } from '@/lib/engine/generator';
import { loggedMuscleSets } from '@/lib/engine/counting';
import { addDays, isoWeekday, mondayOf } from '@/lib/engine/util';
import { TRACKED_MUSCLES, type TrackedMuscle } from '@/lib/engine/types';
import { formatRx } from '@/lib/engine/prescription';
import { getUserContext, loadExercises, mapSet } from '@/lib/server/context';
import { todayIn } from '@/lib/utils/dates';
import { createLogger } from '@/lib/log';

const log = createLogger('actions/generate');

const GenInput = z.object({
  minutes: z.union([z.literal(20), z.literal(30), z.literal(45), z.literal(60), z.literal(75)]),
  preset: z.enum(['full', 'dumbbells', 'bodyweight', 'custom']),
  equipment: z.array(z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'])).optional(),
  focus: z.union([z.enum(['auto', 'upper', 'lower', 'full']), z.array(z.enum(TRACKED_MUSCLES)).min(1)]),
  readiness: z.enum(['normal', 'tired']),
  /** Day to schedule it on; defaults to today. */
  date: z.iso.date().optional(),
});
export type GenFormInput = z.input<typeof GenInput>;

/** How far ahead a generated workout can be scheduled. */
const MAX_DAYS_AHEAD = 13;

/** A session already on the chosen day (planned, started or done). */
export interface ExistingSession {
  id: string;
  title: string;
  kind: string;
  status: string;
}

export interface GenPreview {
  title: string;
  estMinutes: number;
  notes: string[];
  ruleIds: string[];
  exercises: { name: string; rx: string; load: number | null; hint: string | null; ruleIds: string[] }[];
  date: string;
  existing: ExistingSession[];
}

async function build(raw: GenFormInput) {
  const input = GenInput.parse(raw);
  const ctx = await getUserContext();
  const { supabase, user } = ctx;
  if (!ctx.settings) throw new Error('Finish onboarding first');
  const today = todayIn(ctx.profile?.timezone ?? 'Europe/Sofia');
  const date = input.date ?? today;
  if (date < today || date > addDays(today, MAX_DAYS_AHEAD)) throw new Error('Pick today or a day in the next two weeks');
  log.debug('build', { userId: user.id, minutes: input.minutes, preset: input.preset, readiness: input.readiness, date });
  const [exercises, setsRes, checkinsRes, blockRes, sameDayRes] = await Promise.all([
    loadExercises(supabase),
    supabase.from('logged_sets').select('*').eq('user_id', user.id).gte('performed_on', addDays(today, -112)),
    supabase.from('checkins').select('day, soreness').eq('user_id', user.id).lte('day', today).order('day', { ascending: false }).limit(3),
    supabase.from('blocks').select('id, starts_on, weeks').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
    supabase.from('planned_sessions').select('id, title, kind, status').eq('user_id', user.id).eq('scheduled_on', date).in('status', ['planned', 'in_progress', 'done']).order('order_in_week'),
  ]);
  // A failed read must not be treated as "no history": saveWorkout writes what is generated from it.
  const { data: setRows, error: setsErr } = log.db('select logged_sets', setsRes, { userId: user.id });
  const { data: checkins, error: checkinsErr } = log.db('select checkins', checkinsRes, { userId: user.id });
  const { data: block, error: blockErr } = log.db('select active block', blockRes, { userId: user.id });
  // A failed read here must not look like "nothing that day", or the duplicate guard is skipped.
  const { data: sameDay, error: sameDayErr } = log.db('select same-day sessions', sameDayRes, { userId: user.id, date });
  const readErr = setsErr ?? checkinsErr ?? blockErr ?? sameDayErr;
  if (readErr) throw new Error(readErr.message);
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const sets = (setRows ?? []).map(mapSet);
  const weekStart = mondayOf(date);
  // Past the block's last week, its last week's targets still apply (instead of the 10-set default).
  const weekIdx = block ? blockWeekIndex(weekStart, block.starts_on, block.weeks) : 0;
  const { data: tRows, error: tErr } = block
    ? log.db('select weekly_targets', await supabase.from('weekly_targets').select('muscle_id, target_sets').eq('block_id', block.id).eq('week_index', weekIdx), { blockId: block.id, weekIdx })
    : { data: [], error: null };
  if (tErr) throw new Error(tErr.message);
  const targets = Object.fromEntries(TRACKED_MUSCLES.map((m) => [m, Number(tRows?.find((t) => t.muscle_id === m)?.target_sets ?? 10)])) as Record<TrackedMuscle, number>;
  const logged = loggedMuscleSets(sets, exMap, weekStart);
  const soreness = checkinSoreness((checkins ?? []).map((c) => ({ day: c.day, soreness: c.soreness as Record<string, string> | null })), today);
  // Recent soreness and training only matter for a workout today; pain applies to any day.
  const forToday = date === today;
  const last48 = forToday ? trainedLast48h(sets, exMap, new Date(), today) : {};
  const wds = [isoWeekday(addDays(date, -1)), isoWeekday(date), isoWeekday(addDays(date, 1))];
  const sportStressed = [...new Set(ctx.sports.filter((s) => s.weekdays.some((d) => wds.includes(d)) && s.intensity !== 'light').flatMap((s) => s.musclesStressed))];
  const gen = generateSession({
    today,
    minutes: input.minutes,
    equipmentPreset: input.preset,
    equipment: input.equipment,
    focus: input.focus,
    readiness: input.readiness,
    exercises,
    injuries: ctx.injuries,
    increments: ctx.settings.increments as Record<string, number>,
    targets,
    loggedThisWeek: logged,
    recentPain: soreness.pain,
    recentSore: forToday ? soreness.sore : [],
    trainedLast48h: last48,
    sportStressed,
    sets,
    sportPriority: ctx.settings.goal === 'sport_support' || ctx.settings.priority === 'sport',
    disliked: ctx.settings.disliked_exercise_ids,
  });
  const existing: ExistingSession[] = (sameDay ?? []).map((x) => ({ id: x.id, title: x.title, kind: x.kind, status: x.status }));
  return { gen, exMap, today, date, existing, ctx, weekIdx, block };
}

export async function previewWorkout(raw: GenFormInput): Promise<{ ok: boolean; error?: string; preview?: GenPreview }> {
  try {
    const { gen, exMap, date, existing } = await build(raw);
    return {
      ok: true,
      preview: {
        title: gen.title,
        estMinutes: gen.estMinutes,
        notes: gen.notes,
        ruleIds: gen.ruleIds,
        exercises: gen.exercises.map((e) => ({ name: exMap.get(e.exerciseId)?.name ?? '', rx: formatRx(e), load: e.suggestedLoadKg ?? null, hint: e.note ?? null, ruleIds: e.ruleIds })),
        date,
        existing,
      },
    };
  } catch (e) {
    log.error('previewWorkout failed', { err: e });
    return { ok: false, error: e instanceof Error ? e.message : 'Could not generate' };
  }
}

/**
 * Saves the generated session (kind 'generated') on the chosen day; it counts toward weekly volume like any session.
 * If that day already has a session, nothing is saved and the clashes come back, unless `onExisting` says what to do:
 * 'add' keeps both, 'replace' skips the planned ones (a generated one is deleted). Started or done sessions are never touched.
 */
export async function saveWorkout(raw: GenFormInput, startNow: boolean, onExisting?: 'add' | 'replace'): Promise<{ conflict: ExistingSession[] }> {
  const { gen, today, date, existing, ctx, weekIdx, block } = await build(raw);
  if (!gen.exercises.length) {
    log.warn('saveWorkout: generator returned no exercises', { minutes: raw.minutes, preset: raw.preset });
    throw new Error('Nothing to generate with these settings');
  }
  if (startNow && date !== today) throw new Error('Only a workout for today can be started now');
  if (existing.length && !onExisting) return { conflict: existing };
  const { supabase, user } = ctx;
  log.debug('saveWorkout', { userId: user.id, exercises: gen.exercises.length, startNow, date, existing: existing.length, onExisting });
  const { data: s, error } = await supabase
    .from('planned_sessions')
    .insert({
      user_id: user.id,
      block_id: block?.id ?? null,
      week_index: weekIdx,
      scheduled_on: date,
      template_key: 'generated',
      title: gen.title,
      kind: 'generated',
      status: startNow ? 'in_progress' : 'planned',
      est_minutes: gen.estMinutes,
      order_in_week: 9,
      started_at: startNow ? new Date().toISOString() : null,
    })
    .select('id')
    .single();
  if (error) {
    log.error('insert planned_sessions (generated) failed', { userId: user.id, err: error });
    throw error;
  }
  const { error: eErr } = await supabase.from('planned_exercises').insert(
    gen.exercises.map((e) => ({
      session_id: s.id,
      user_id: user.id,
      exercise_id: e.exerciseId,
      slot_key: e.slotKey,
      position: e.position,
      sets: e.sets,
      rep_min: e.repMin,
      rep_max: e.repMax,
      rir_min: e.rirMin,
      rir_max: e.rirMax,
      rest_seconds: e.restSeconds,
      suggested_load_kg: e.suggestedLoadKg ?? null,
      note: e.note ?? null, // the progression hint (system text), shown in the logger like other planned notes
      rule_ids: e.ruleIds,
    })),
  );
  if (eErr) {
    // The session row above is already saved; delete it so no empty generated session is left behind.
    log.error('insert planned_exercises (generated) failed', { sessionId: s.id, count: gen.exercises.length, err: eErr });
    const { error: delErr } = log.db('delete empty planned_sessions (generated)', await supabase.from('planned_sessions').delete().eq('id', s.id).eq('user_id', user.id), { sessionId: s.id });
    if (delErr) revalidatePath('/', 'layout');
    throw new Error('Could not save the workout. Please try again.');
  }
  if (onExisting === 'replace') await replaceExisting(ctx, existing);
  revalidatePath('/', 'layout');
  redirect(startNow ? `/session/${s.id}` : '/today');
}

/**
 * Runs after the new session is saved, so a failure here leaves both sessions rather than neither.
 * Planned plan sessions are marked skipped (their place in the week stays visible); a planned generated one is deleted.
 */
async function replaceExisting(ctx: Awaited<ReturnType<typeof getUserContext>>, existing: ExistingSession[]) {
  const { supabase, user } = ctx;
  const planned = existing.filter((x) => x.status === 'planned');
  const generated = planned.filter((x) => x.kind === 'generated').map((x) => x.id);
  const lifts = planned.filter((x) => x.kind !== 'generated').map((x) => x.id);
  if (generated.length) {
    const { error } = log.db('delete replaced generated sessions', await supabase.from('planned_sessions').delete().in('id', generated).eq('user_id', user.id).eq('status', 'planned'), { count: generated.length });
    if (error) log.warn('replace: could not delete the old generated session; both are kept', { err: error });
  }
  if (lifts.length) {
    const { error } = log.db('skip replaced planned sessions', await supabase.from('planned_sessions').update({ status: 'skipped' }).in('id', lifts).eq('user_id', user.id).eq('status', 'planned'), { count: lifts.length });
    if (error) log.warn('replace: could not skip the planned session; both are kept', { err: error });
  }
}
