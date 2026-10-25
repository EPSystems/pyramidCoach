'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ALL_MUSCLES, TRACKED_MUSCLES } from '@/lib/engine/types';
import { phaseForGoal } from '@/lib/engine/nutrition';
import { requireUser } from '@/lib/server/context';
import { recomputeNutrition, regeneratePlan } from '@/lib/server/plan';
import { todayIn } from '@/lib/utils/dates';
import { SportInput } from '@/lib/schemas/onboarding';

type R = { ok: boolean; error?: string };
const weekday = z.number().int().min(1).max(7);

const Training = z.object({
  goal: z.enum(['lean_gain', 'recomp', 'strength', 'fat_loss', 'sport_support']),
  priority: z.enum(['lifting', 'balanced', 'sport']),
  status: z.enum(['novice', 'intermediate', 'advanced']),
  availableDays: z.array(weekday).min(1),
  sessionMinutes: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(75), z.literal(90), z.literal(120)]),
  maxLiftDays: z.number().int().min(1).max(6).nullable(),
  splitStyle: z.enum(['default', 'alternative']),
  repVariation: z.enum(['within_session', 'between_session', 'alternating_week']),
  equipment: z.array(z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'])).min(1),
  increments: z.object({ barbell: z.number().positive().max(10), dumbbell: z.number().positive().max(10), machine: z.number().positive().max(20), cable: z.number().positive().max(10) }),
  specialization: z.array(z.enum(TRACKED_MUSCLES)).max(2),
  strengthLifts: z.array(z.enum(['squat', 'bench', 'deadlift', 'ohp'])).min(1),
  testDate: z.iso.date().nullable(),
});

export async function updateTraining(raw: z.input<typeof Training>): Promise<R> {
  const p = Training.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
  const d = p.data;
  const { supabase, user } = await requireUser();
  const { data: before } = await supabase.from('user_settings').select('goal, training_status').eq('user_id', user.id).single();
  const { error } = await supabase
    .from('user_settings')
    .update({
      goal: d.goal,
      priority: d.goal === 'sport_support' ? 'sport' : d.priority,
      training_status: d.status,
      status_source: before?.training_status !== d.status ? 'self' : undefined,
      available_days: [...new Set(d.availableDays)].sort(),
      session_minutes: d.sessionMinutes,
      max_lift_days: d.maxLiftDays,
      split_style: d.splitStyle,
      rep_variation: d.repVariation,
      equipment: d.equipment,
      increments: d.increments,
      specialization_muscles: d.status === 'advanced' ? d.specialization : [],
      strength_lifts: d.strengthLifts,
      test_date: d.testDate,
    })
    .eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };
  const goalChanged = before?.goal !== d.goal;
  try {
    await regeneratePlan(supabase, user.id, { reason: goalChanged ? 'goal_change' : 'settings_change' });
    if (goalChanged) {
      const phase = phaseForGoal(d.goal);
      await recomputeNutrition(supabase, user.id, 'goal change N-PHS-01', { phase, resetPhase: true });
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Regeneration failed' };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

const Profile = z.object({
  displayName: z.string().min(1).max(60),
  sex: z.enum(['male', 'female', 'unspecified']),
  heightCm: z.number().min(120).max(230).nullable(),
  bodyFatPct: z.number().min(3).max(60).nullable(),
  units: z.enum(['kg', 'lb']),
  timezone: z.string().min(1).max(60),
  hideBodyweight: z.boolean(),
  lifestyle: z.enum(['sedentary', 'lightly_active', 'active', 'very_active']),
});

export async function updateProfile(raw: z.input<typeof Profile>): Promise<R> {
  const p = Profile.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
  const d = p.data;
  const { supabase, user } = await requireUser();
  const { data: s } = await supabase.from('user_settings').select('lifestyle').eq('user_id', user.id).single();
  await supabase
    .from('profiles')
    .update({ display_name: d.displayName, sex: d.sex, height_cm: d.heightCm, body_fat_pct: d.bodyFatPct, units: d.units, timezone: d.timezone, hide_bodyweight: d.hideBodyweight })
    .eq('user_id', user.id);
  if (s?.lifestyle !== d.lifestyle) {
    await supabase.from('user_settings').update({ lifestyle: d.lifestyle }).eq('user_id', user.id);
    // Lifestyle changes the activity factor: reset it to the new default.
    const { NUTRITION } = await import('@/lib/knowledge/constants');
    await recomputeNutrition(supabase, user.id, 'lifestyle change N-MNT-02', { multiplier: NUTRITION.multiplierDefault[d.lifestyle] });
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

// ---------------- Sports ----------------
const SportEdit = SportInput.extend({ id: z.guid().optional(), active: z.boolean().default(true) });

async function afterSportChange(userId: string) {
  const { supabase } = await requireUser();
  await regeneratePlan(supabase, userId, { reason: 'sport_change' });
  await recomputeNutrition(supabase, userId, 'sport change N-SPT-03');
  revalidatePath('/', 'layout');
}

export async function saveSport(raw: z.input<typeof SportEdit>): Promise<R> {
  const p = SportEdit.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
  const { supabase, user } = await requireUser();
  const row = { user_id: user.id, sport_id: p.data.sportId, weekdays: [...new Set(p.data.weekdays)].sort(), intensity: p.data.intensity, minutes: p.data.minutes, time_of_day: p.data.timeOfDay ?? null, active: p.data.active };
  const { error } = p.data.id ? await supabase.from('user_sports').update(row).eq('id', p.data.id).eq('user_id', user.id) : await supabase.from('user_sports').insert(row);
  if (error) return { ok: false, error: error.message };
  await afterSportChange(user.id);
  return { ok: true };
}

export async function toggleSport(id: string, active: boolean): Promise<R> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from('user_sports').update({ active }).eq('id', id).eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };
  await afterSportChange(user.id);
  return { ok: true };
}

export async function deleteSport(id: string): Promise<R> {
  const { supabase, user } = await requireUser();
  await supabase.from('user_sports').delete().eq('id', id).eq('user_id', user.id);
  await afterSportChange(user.id);
  return { ok: true };
}

// ---------------- Injuries ----------------
const InjuryEdit = z.object({
  id: z.guid().optional(),
  muscleId: z.enum(ALL_MUSCLES),
  label: z.string().min(2).max(80),
  severity: z.enum(['niggle', 'pain', 'injury']),
  status: z.enum(['active', 'rehab', 'resolved']),
  note: z.string().max(500).nullable(),
  avoidExerciseIds: z.array(z.guid()),
});

export async function saveInjury(raw: z.input<typeof InjuryEdit>): Promise<R> {
  const p = InjuryEdit.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
  const { supabase, user } = await requireUser();
  const { data: prof } = await supabase.from('profiles').select('timezone').eq('user_id', user.id).single();
  const today = todayIn(prof?.timezone ?? 'Europe/Sofia');
  const row = {
    user_id: user.id,
    muscle_id: p.data.muscleId,
    label: p.data.label,
    severity: p.data.severity,
    status: p.data.status,
    rehab_note: p.data.note,
    avoid_exercise_ids: p.data.avoidExerciseIds,
    resolved_on: p.data.status === 'resolved' ? today : null,
  };
  const { error } = p.data.id
    ? await supabase.from('injuries').update(row).eq('id', p.data.id).eq('user_id', user.id)
    : await supabase.from('injuries').insert({ ...row, started_on: today });
  if (error) return { ok: false, error: error.message };
  // Injury added/resolved: re-run selection on future sessions (6.14).
  await regeneratePlan(supabase, user.id, { reason: 'injury_change' });
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deleteInjury(id: string): Promise<R> {
  const { supabase, user } = await requireUser();
  await supabase.from('injuries').delete().eq('id', id).eq('user_id', user.id);
  await regeneratePlan(supabase, user.id, { reason: 'injury_change' });
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function regenerateNow(): Promise<R> {
  const { supabase, user } = await requireUser();
  await regeneratePlan(supabase, user.id, { reason: 'manual' });
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deleteAccount(confirm: string): Promise<R> {
  if (confirm !== 'DELETE') return { ok: false, error: 'Type DELETE to confirm' };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return { ok: false, error: error.message };
  await supabase.auth.signOut();
  redirect('/login');
}
