'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ALL_MUSCLES } from '@/lib/engine/types';
import { requireUser } from '@/lib/server/context';

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
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Invalid exercise' };
  const d = p.data;
  const { supabase, user } = await requireUser();
  const slug = `${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${user.id.slice(0, 6)}-${Date.now().toString(36)}`;
  const tags = d.pattern === 'isolation' ? d.primary.map((m) => ISO_TAG[m]).filter(Boolean) : (PATTERN_TAGS[d.pattern] ?? []);
  const { data, error } = await supabase
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
    .single();
  if (error) return { ok: false, error: error.message };
  const rows = [
    ...d.primary.map((m) => ({ exercise_id: data.id, muscle_id: m, role: 'primary' })),
    ...d.secondary.filter((m) => !d.primary.includes(m)).map((m) => ({ exercise_id: data.id, muscle_id: m, role: 'secondary' })),
  ];
  const { error: mErr } = await supabase.from('exercise_muscles').insert(rows);
  if (mErr) return { ok: false, error: mErr.message };
  revalidatePath('/library');
  return { ok: true, slug };
}

export async function deleteCustomExercise(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from('exercises').delete().eq('id', id).eq('owner_user_id', user.id);
  if (error) return { ok: false, error: error.message.includes('foreign key') ? 'This exercise is used in your plan or history.' : error.message };
  revalidatePath('/library');
  return { ok: true };
}

export async function toggleDislike(exerciseId: string): Promise<{ ok: boolean; disliked: boolean }> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from('user_settings').select('disliked_exercise_ids').eq('user_id', user.id).single();
  const cur = data?.disliked_exercise_ids ?? [];
  const disliked = !cur.includes(exerciseId);
  await supabase
    .from('user_settings')
    .update({ disliked_exercise_ids: disliked ? [...cur, exerciseId] : cur.filter((x) => x !== exerciseId) })
    .eq('user_id', user.id);
  revalidatePath('/library');
  return { ok: true, disliked };
}
