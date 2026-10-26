'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ALL_MUSCLES } from '@/lib/engine/types';
import { requireUser } from '@/lib/server/context';
import { createLogger } from '@/lib/log';

const log = createLogger('actions/library');

const PATTERN_TAGS: Record<string, string[]> = {
  squat: ['squat_machine'],
  hinge: ['hinge_rdl'],
  vertical_pull: ['pull_vertical'],
  vertical_push: ['press_vertical'],
  horizontal_pull: ['row_extension', 'row_flared'],
  horizontal_push: ['press_flat'],
  hip_extension: ['hip_ext'],
  pullover: ['pullover'],
  upright_row: ['lat_raise'],
  fly: ['chest_iso'],
  core: ['abs'],
  carry: [],
};
const ISO_TAG: Record<string, string> = { quads: 'leg_ext', hamstrings: 'leg_curl', calves: 'calf', side_delts: 'lat_raise', rear_delts: 'rear_delt', biceps: 'biceps_iso', triceps: 'triceps_iso', glutes: 'hip_ext', chest: 'chest_iso', abs: 'abs', traps: 'traps' };

const CustomExercise = z.object({
  name: z.string().min(2).max(60),
  pattern: z.enum(['squat', 'hinge', 'vertical_pull', 'vertical_push', 'horizontal_pull', 'horizontal_push', 'hip_extension', 'pullover', 'upright_row', 'fly', 'isolation', 'carry', 'core']),
  category: z.enum(['lower_free_compound', 'lower_machine_compound', 'upper_free_press', 'upper_machine_press', 'pulling_compound', 'isolation']),
  equipment: z.array(z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'])).min(1),
  primary: z.array(z.enum(ALL_MUSCLES)).min(1),
  secondary: z.array(z.enum(ALL_MUSCLES)),
  cues: z.string().max(600).optional(),
});

export async function createCustomExercise(raw: z.input<typeof CustomExercise>): Promise<{ ok: boolean; error?: string; slug?: string }> {
  const p = CustomExercise.safeParse(raw);
  if (!p.success) {
    log.warn('createCustomExercise: invalid input', { issues: p.error.issues.map((i) => i.path.join('.')) });
    return { ok: false, error: p.error.issues[0]?.message ?? 'Invalid exercise' };
  }
  const d = p.data;
  const { supabase, user } = await requireUser();
  log.debug('createCustomExercise', { userId: user.id, pattern: d.pattern });
  const slug = `${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${user.id.slice(0, 6)}-${Date.now().toString(36)}`;
  const tags = d.pattern === 'isolation' ? d.primary.map((m) => ISO_TAG[m]).filter(Boolean) : (PATTERN_TAGS[d.pattern] ?? []);
  const { data, error } = log.db('insert exercises (custom)', await supabase
    .from('exercises')
    .insert({
      slug,
      name: d.name,
      pattern_id: d.pattern,
      category: d.category,
      equipment: d.equipment,
      cues: (d.cues ?? '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 5),
      slot_tags: tags,
      popularity: 1000,
      owner_user_id: user.id,
    })
    .select('id')
    .single(), { userId: user.id });
  if (error) return { ok: false, error: error.message };
  const rows = [
    ...d.primary.map((m) => ({ exercise_id: data.id, muscle_id: m, role: 'primary' })),
    ...d.secondary.filter((m) => !d.primary.includes(m)).map((m) => ({ exercise_id: data.id, muscle_id: m, role: 'secondary' })),
  ];
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

export async function deleteCustomExercise(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user } = await requireUser();
  log.debug('deleteCustomExercise', { exerciseId: id });
  const { error } = log.db('delete exercises (custom)', await supabase.from('exercises').delete().eq('id', id).eq('owner_user_id', user.id), { exerciseId: id });
  if (error) return { ok: false, error: error.message.includes('foreign key') ? 'This exercise is used in your plan or history.' : error.message };
  revalidatePath('/library');
  return { ok: true };
}

/** On failure `disliked` is the state before the call (or false if it couldn't be read). */
export async function toggleDislike(exerciseId: string): Promise<{ ok: boolean; disliked: boolean; error?: string }> {
  const { supabase, user } = await requireUser();
  // Stop on a failed read: treating it as [] would make the update below wipe every other dislike.
  const { data, error: readErr } = log.db('select user_settings.disliked_exercise_ids', await supabase.from('user_settings').select('disliked_exercise_ids').eq('user_id', user.id).single(), { userId: user.id });
  if (readErr || !data) return { ok: false, disliked: false, error: readErr?.message ?? 'Settings not found' };
  const cur = data.disliked_exercise_ids ?? [];
  const disliked = !cur.includes(exerciseId);
  const { error } = log.db(
    'update user_settings.disliked_exercise_ids',
    await supabase
      .from('user_settings')
      .update({ disliked_exercise_ids: disliked ? [...cur, exerciseId] : cur.filter((x) => x !== exerciseId) })
      .eq('user_id', user.id),
    { exerciseId, disliked },
  );
  if (error) return { ok: false, disliked: !disliked, error: error.message };
  revalidatePath('/library');
  return { ok: true, disliked };
}
