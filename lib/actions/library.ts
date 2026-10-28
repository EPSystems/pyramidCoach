'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { deriveSlotTags, substitutionsFor } from '@/lib/engine/selection';
import type { Equipment } from '@/lib/engine/types';
import { CustomExercise, muscleRows, type CustomExerciseInput } from '@/lib/schemas/exercise';
import { getUserContext, loadExercises, requireUser } from '@/lib/server/context';
import { replaceExerciseMuscles } from '@/lib/server/exercises';
import { todayIn } from '@/lib/utils/dates';
import { createLogger } from '@/lib/log';

const log = createLogger('actions/library');

type Parsed = z.output<typeof CustomExercise>;

function parse(raw: CustomExerciseInput): { ok: true; data: Parsed } | { ok: false; error: string } {
  const p = CustomExercise.safeParse(raw);
  if (!p.success) {
    log.warn('custom exercise: invalid input', { issues: p.error.issues.map((i) => i.path.join('.')) });
    return { ok: false, error: p.error.issues[0]?.message ?? 'Invalid exercise' };
  }
  return { ok: true, data: p.data };
}

/** The exercises row for a custom exercise (everything except id, slug, owner and popularity). */
function rowFor(d: Parsed) {
  return {
    name: d.name,
    pattern_id: d.pattern,
    category: d.category,
    equipment: d.equipment,
    cues: d.cues,
    mistakes: d.mistakes,
    substitutions: d.substitutions,
    slot_tags: deriveSlotTags(d.pattern, d.primary),
    long_length_bias: d.long,
    axial_load: d.axial,
    impact_lower_body: d.impact,
    unilateral: d.unilateral,
    is_main_lift: !!d.main,
    main_lift_key: d.main,
    default_increment_kg: d.increment,
  };
}

export async function createCustomExercise(raw: CustomExerciseInput): Promise<{ ok: boolean; error?: string; slug?: string }> {
  const p = parse(raw);
  if (!p.ok) return p;
  const d = p.data;
  const { supabase, user } = await requireUser();
  log.debug('createCustomExercise', { userId: user.id, pattern: d.pattern });
  const slug = `${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${user.id.slice(0, 6)}-${Date.now().toString(36)}`;
  const { data, error } = log.db('insert exercises (custom)', await supabase
    .from('exercises')
    .insert({ ...rowFor(d), slug, popularity: 1000, owner_user_id: user.id })
    .select('id')
    .single(), { userId: user.id });
  if (error) return { ok: false, error: error.message };
  const rows = muscleRows(data.id, d.primary, d.secondary);
  const { error: mErr } = log.db('insert exercise_muscles', await supabase.from('exercise_muscles').insert(rows), { exerciseId: data.id, count: rows.length });
  if (mErr) {
    // Don't leave an exercise with no muscles behind: remove it so the user can simply retry.
    const { error: delErr } = log.db('delete exercises (orphan cleanup)', await supabase.from('exercises').delete().eq('id', data.id).eq('owner_user_id', user.id), { exerciseId: data.id });
    if (delErr) {
      revalidatePath('/library');
      return { ok: false, error: `Could not save the exercise's muscles (${mErr.message}). It was created without muscles; delete it from the library and try again.` };
    }
    return { ok: false, error: `Could not save the exercise's muscles: ${mErr.message}` };
  }
  revalidatePath('/library');
  return { ok: true, slug };
}

/** Edits a custom exercise. The slug (its URL) stays the same; slot tags are derived again. */
export async function updateCustomExercise(id: string, raw: CustomExerciseInput): Promise<{ ok: boolean; error?: string; slug?: string }> {
  if (!z.guid().safeParse(id).success) return { ok: false, error: 'Invalid exercise' };
  const p = parse(raw);
  if (!p.ok) return p;
  const d = p.data;
  const { supabase, user } = await requireUser();
  log.debug('updateCustomExercise', { userId: user.id, exerciseId: id });
  const { data, error } = log.db('update exercises (custom)', await supabase.from('exercises').update(rowFor(d)).eq('id', id).eq('owner_user_id', user.id).select('slug').maybeSingle(), { exerciseId: id });
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Only your own exercises can be edited' };
  const mErr = await replaceExerciseMuscles(supabase, id, d.primary, d.secondary);
  revalidatePath('/library', 'layout');
  if (mErr) return { ok: false, error: `Saved, but the muscles could not be updated: ${mErr}` };
  return { ok: true, slug: data.slug };
}

export async function deleteCustomExercise(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user } = await requireUser();
  log.debug('deleteCustomExercise', { exerciseId: id });
  const { error } = log.db('delete exercises (custom)', await supabase.from('exercises').delete().eq('id', id).eq('owner_user_id', user.id), { exerciseId: id });
  if (error) return { ok: false, error: error.message.includes('foreign key') ? 'This exercise is used in your plan or history.' : error.message };
  revalidatePath('/library');
  return { ok: true };
}

/** Where a just-disliked exercise still sits in the plan, plus swap options for it. */
export interface DislikeInPlan {
  /** A future planned exercise row; swapping it with scope 'block' swaps every future one. */
  plannedExerciseId: string;
  sessions: number;
  options: { id: string; name: string }[];
}

/** On failure `disliked` is the state before the call (or false if it couldn't be read). */
export async function toggleDislike(exerciseId: string): Promise<{ ok: boolean; disliked: boolean; error?: string; inPlan?: DislikeInPlan }> {
  const { supabase, user } = await requireUser();
  // Stop on a failed read: treating it as [] would make the update below wipe every other dislike.
  const { data, error: readErr } = log.db('select user_settings.disliked_exercise_ids', await supabase.from('user_settings').select('disliked_exercise_ids').eq('user_id', user.id).single(), { userId: user.id });
  if (readErr || !data) return { ok: false, disliked: false, error: readErr?.message ?? 'Settings not found' };
  const cur = data.disliked_exercise_ids ?? [];
  const disliked = !cur.includes(exerciseId);
  const next = disliked ? [...cur, exerciseId] : cur.filter((x) => x !== exerciseId);
  const { error } = log.db('update user_settings.disliked_exercise_ids', await supabase.from('user_settings').update({ disliked_exercise_ids: next }).eq('user_id', user.id), { exerciseId, disliked });
  if (error) return { ok: false, disliked: !disliked, error: error.message };
  revalidatePath('/library', 'layout');
  if (!disliked) return { ok: true, disliked };
  // The dislike is saved; finding it in the current plan is a best-effort offer, so failures only log.
  try {
    return { ok: true, disliked, inPlan: await findInPlan(exerciseId, next) };
  } catch (e) {
    log.warn('toggleDislike: could not check the current plan', { exerciseId, err: e });
    return { ok: true, disliked };
  }
}

async function findInPlan(exerciseId: string, disliked: string[]): Promise<DislikeInPlan | undefined> {
  const ctx = await getUserContext();
  const { supabase, user } = ctx;
  const today = todayIn(ctx.profile?.timezone ?? 'Europe/Sofia');
  const { data: rows, error } = log.db(
    'select future planned_exercises (disliked)',
    await supabase
      .from('planned_exercises')
      .select('id, session_id, planned_sessions!inner(scheduled_on, status)')
      .eq('user_id', user.id)
      .eq('exercise_id', exerciseId)
      .gte('planned_sessions.scheduled_on', today)
      .eq('planned_sessions.status', 'planned'),
    { exerciseId },
  );
  if (error) throw error;
  if (!rows?.length) return undefined;
  const exercises = await loadExercises(supabase);
  const ex = exercises.find((e) => e.id === exerciseId);
  if (!ex) return undefined;
  const subs = substitutionsFor(ex, { exercises, equipment: (ctx.settings?.equipment ?? []) as Equipment[], injuries: ctx.injuries, disliked });
  return { plannedExerciseId: rows[0].id, sessions: new Set(rows.map((r) => r.session_id)).size, options: subs.slice(0, 6).map((s) => ({ id: s.id, name: s.name })) };
}
