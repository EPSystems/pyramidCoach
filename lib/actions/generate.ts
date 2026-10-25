'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { generateSession } from '@/lib/engine/generator';
import { loggedMuscleSets } from '@/lib/engine/counting';
import { addDays, isoWeekday, mondayOf } from '@/lib/engine/util';
import { TRACKED_MUSCLES, type MuscleId, type TrackedMuscle } from '@/lib/engine/types';
import { formatRx } from '@/lib/engine/prescription';
import { getUserContext, loadExercises, mapSet } from '@/lib/server/context';
import { todayIn } from '@/lib/utils/dates';

const GenInput = z.object({
  minutes: z.union([z.literal(20), z.literal(30), z.literal(45), z.literal(60), z.literal(75)]),
  preset: z.enum(['full', 'dumbbells', 'bodyweight', 'custom']),
  equipment: z.array(z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'])).optional(),
  focus: z.union([z.enum(['auto', 'upper', 'lower', 'full']), z.array(z.enum(TRACKED_MUSCLES)).min(1)]),
  readiness: z.enum(['normal', 'tired']),
});
export type GenFormInput = z.input<typeof GenInput>;

export interface GenPreview {
  title: string;
  estMinutes: number;
  notes: string[];
  ruleIds: string[];
  exercises: { name: string; rx: string; load: number | null; ruleIds: string[] }[];
}

async function build(raw: GenFormInput) {
  const input = GenInput.parse(raw);
  const ctx = await getUserContext();
  const { supabase, user } = ctx;
  if (!ctx.settings) throw new Error('Finish onboarding first');
  const today = todayIn(ctx.profile?.timezone ?? 'Europe/Sofia');
  const [exercises, { data: setRows }, { data: checkins }, { data: block }] = await Promise.all([
    loadExercises(supabase),
    supabase.from('logged_sets').select('*').eq('user_id', user.id).gte('performed_on', addDays(today, -112)),
    supabase.from('checkins').select('day, soreness').eq('user_id', user.id).lte('day', today).order('day', { ascending: false }).limit(3),
    supabase.from('blocks').select('id, starts_on').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
  ]);
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const sets = (setRows ?? []).map(mapSet);
  const weekStart = mondayOf(today);
  const weekIdx = block ? Math.max(0, Math.floor((Date.parse(weekStart) - Date.parse(block.starts_on)) / 604800000)) : 0;
  const { data: tRows } = block ? await supabase.from('weekly_targets').select('muscle_id, target_sets').eq('block_id', block.id).eq('week_index', weekIdx) : { data: [] };
  const targets = Object.fromEntries(TRACKED_MUSCLES.map((m) => [m, Number(tRows?.find((t) => t.muscle_id === m)?.target_sets ?? 10)])) as Record<TrackedMuscle, number>;
  const logged = loggedMuscleSets(sets, exMap, weekStart);
  const last48 = loggedMuscleSets(sets, exMap, addDays(today, -2), 3);
  const recentPain = [...new Set((checkins ?? []).flatMap((c) => Object.entries((c.soreness as Record<string, string>) ?? {}).filter(([, v]) => v === 'pain').map(([m]) => m as MuscleId)))];
  const wds = [isoWeekday(addDays(today, -1)), isoWeekday(today), isoWeekday(addDays(today, 1))];
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
    recentPain,
    trainedLast48h: last48,
    sportStressed,
    sets,
    sportPriority: ctx.settings.goal === 'sport_support' || ctx.settings.priority === 'sport',
    disliked: ctx.settings.disliked_exercise_ids,
  });
  return { gen, exMap, today, ctx, weekIdx, block };
}

export async function previewWorkout(raw: GenFormInput): Promise<{ ok: boolean; error?: string; preview?: GenPreview }> {
  try {
    const { gen, exMap } = await build(raw);
    return {
      ok: true,
      preview: {
        title: gen.title,
        estMinutes: gen.estMinutes,
        notes: gen.notes,
        ruleIds: gen.ruleIds,
        exercises: gen.exercises.map((e) => ({ name: exMap.get(e.exerciseId)?.name ?? '', rx: formatRx(e), load: e.suggestedLoadKg ?? null, ruleIds: e.ruleIds })),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not generate' };
  }
}

/** Saves the generated session for today (kind 'generated'); it counts toward weekly volume like any session. */
export async function saveWorkout(raw: GenFormInput, startNow: boolean) {
  const { gen, today, ctx, weekIdx, block } = await build(raw);
  if (!gen.exercises.length) throw new Error('Nothing to generate with these settings');
  const { supabase, user } = ctx;
  const { data: s, error } = await supabase
    .from('planned_sessions')
    .insert({
      user_id: user.id,
      block_id: block?.id ?? null,
      week_index: weekIdx,
      scheduled_on: today,
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
  if (error) throw error;
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
      note: null,
      rule_ids: e.ruleIds,
    })),
  );
  if (eErr) throw eErr;
  revalidatePath('/', 'layout');
  redirect(startNow ? `/session/${s.id}` : '/today');
}
