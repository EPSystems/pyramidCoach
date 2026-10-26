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
import { createLogger } from '@/lib/log';

const log = createLogger('actions/settings');
const issuePaths = (e: z.ZodError) => e.issues.map((i) => i.path.join('.'));

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
  if (!p.success) {
    log.warn('updateTraining: invalid input', { issues: issuePaths(p.error) });
    return { ok: false, error: p.error.issues[0]?.message };
  }
  const d = p.data;
  const { supabase, user } = await requireUser();
  log.debug('updateTraining', { userId: user.id, goal: d.goal, status: d.status });
  const { data: before, error: readErr } = log.db('select user_settings', await supabase.from('user_settings').select('goal, training_status').eq('user_id', user.id).single(), { userId: user.id });
  // Without the previous goal/status we can't tell what changed (a wrong guess resets the nutrition phase).
  if (readErr || !before) return { ok: false, error: readErr?.message ?? 'Settings not found' };
  const { error } = log.db('update user_settings (training)', await supabase
    .from('user_settings')
    .update({
      goal: d.goal,
      priority: d.goal === 'sport_support' ? 'sport' : d.priority,
      training_status: d.status,
      status_source: before.training_status !== d.status ? 'self' : undefined,
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
    .eq('user_id', user.id), { userId: user.id });
  if (error) return { ok: false, error: error.message };
  const goalChanged = before.goal !== d.goal;
  // Settings are saved at this point. We don't roll them back: regeneratePlan may already have
  // rewritten part of the plan, so restoring old settings could leave a plan built from the new ones.
  // Instead say exactly what happened; "Regenerate plan" retries from the saved settings.
  const step = await afterSettingsSaved(user.id, 'updateTraining', async () => {
    await regeneratePlan(supabase, user.id, { reason: goalChanged ? 'goal_change' : 'settings_change' });
    if (goalChanged) {
      const phase = phaseForGoal(d.goal);
      await recomputeNutrition(supabase, user.id, 'goal change N-PHS-01', { phase, resetPhase: true });
    }
  });
  revalidatePath('/', 'layout');
  return step;
}

/**
 * Runs the plan/nutrition recompute that follows a saved change. Those helpers throw on failure,
 * so catch here and tell the user the change itself was saved but the plan wasn't updated.
 */
async function afterSettingsSaved(userId: string, op: string, fn: () => Promise<unknown>): Promise<R> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    log.error(`${op}: recompute failed after the change was saved`, { userId, err: e });
    return { ok: false, error: 'Your change was saved, but your plan could not be updated. Use "Regenerate plan" in Settings to retry.' };
  }
}

const Profile = z.object({
  displayName: z.string().min(1).max(60),
  sex: z.enum(['male', 'female'], { error: 'Choose Male or Female for Sex.' }),
  heightCm: z.number().min(120).max(230).nullable(),
  bodyFatPct: z.number().min(3).max(60).nullable(),
  units: z.enum(['kg', 'lb']),
  timezone: z.string().min(1).max(60).refine(isTimeZone, { error: 'Unknown timezone' }),
  hideBodyweight: z.boolean(),
  lifestyle: z.enum(['sedentary', 'lightly_active', 'active', 'very_active']),
});

export async function updateProfile(raw: z.input<typeof Profile>): Promise<R> {
  const p = Profile.safeParse(raw);
  if (!p.success) {
    log.warn('updateProfile: invalid input', { issues: issuePaths(p.error) });
    return { ok: false, error: p.error.issues[0]?.message };
  }
  const d = p.data;
  const { supabase, user } = await requireUser();
  log.debug('updateProfile', { userId: user.id });
  // A failed read must not look like "lifestyle changed": that would reset the activity multiplier.
  const { data: s, error: readErr } = log.db('select user_settings.lifestyle', await supabase.from('user_settings').select('lifestyle').eq('user_id', user.id).single(), { userId: user.id });
  if (readErr || !s) return { ok: false, error: readErr?.message ?? 'Settings not found' };
  const { error: profErr } = log.db(
    'update profiles',
    await supabase
      .from('profiles')
      .update({ display_name: d.displayName, sex: d.sex, height_cm: d.heightCm, body_fat_pct: d.bodyFatPct, units: d.units, timezone: d.timezone, hide_bodyweight: d.hideBodyweight })
      .eq('user_id', user.id),
    { userId: user.id },
  );
  if (profErr) return { ok: false, error: profErr.message };
  let step: R = { ok: true };
  if (s.lifestyle !== d.lifestyle) {
    const { error: lsErr } = log.db('update user_settings.lifestyle', await supabase.from('user_settings').update({ lifestyle: d.lifestyle }).eq('user_id', user.id), { userId: user.id });
    if (lsErr) {
      revalidatePath('/', 'layout');
      return { ok: false, error: `Profile saved, but lifestyle could not be updated: ${lsErr.message}` };
    }
    // Lifestyle changes the activity factor: reset it to the new default.
    const { NUTRITION } = await import('@/lib/knowledge/constants');
    step = await afterSettingsSaved(user.id, 'updateProfile', async () => {
      await recomputeNutrition(supabase, user.id, 'lifestyle change N-MNT-02', { multiplier: NUTRITION.multiplierDefault[d.lifestyle] });
    });
  }
  revalidatePath('/', 'layout');
  return step;
}

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---------------- Sports ----------------
const SportEdit = SportInput.extend({ id: z.guid().optional(), active: z.boolean().default(true) });

async function afterSportChange(userId: string): Promise<R> {
  const { supabase } = await requireUser();
  log.debug('afterSportChange', { userId });
  const step = await afterSettingsSaved(userId, 'afterSportChange', async () => {
    await regeneratePlan(supabase, userId, { reason: 'sport_change' });
    await recomputeNutrition(supabase, userId, 'sport change N-SPT-03');
  });
  revalidatePath('/', 'layout');
  return step;
}

export async function saveSport(raw: z.input<typeof SportEdit>): Promise<R> {
  const p = SportEdit.safeParse(raw);
  if (!p.success) {
    log.warn('saveSport: invalid input', { issues: issuePaths(p.error) });
    return { ok: false, error: p.error.issues[0]?.message };
  }
  const { supabase, user } = await requireUser();
  log.debug('saveSport', { userId: user.id, userSportId: p.data.id, sportId: p.data.sportId });
  const row = { user_id: user.id, sport_id: p.data.sportId, weekdays: [...new Set(p.data.weekdays)].sort(), intensity: p.data.intensity, minutes: p.data.minutes, time_of_day: p.data.timeOfDay ?? null, active: p.data.active };
  const { error } = log.db(
    p.data.id ? 'update user_sports' : 'insert user_sports',
    p.data.id ? await supabase.from('user_sports').update(row).eq('id', p.data.id).eq('user_id', user.id) : await supabase.from('user_sports').insert(row),
    { userSportId: p.data.id },
  );
  if (error) return { ok: false, error: error.message };
  return afterSportChange(user.id);
}

export async function toggleSport(id: string, active: boolean): Promise<R> {
  const { supabase, user } = await requireUser();
  const { error } = log.db('update user_sports.active', await supabase.from('user_sports').update({ active }).eq('id', id).eq('user_id', user.id), { userSportId: id, active });
  if (error) return { ok: false, error: error.message };
  return afterSportChange(user.id);
}

export async function deleteSport(id: string): Promise<R> {
  const { supabase, user } = await requireUser();
  const { error } = log.db('delete user_sports', await supabase.from('user_sports').delete().eq('id', id).eq('user_id', user.id), { userSportId: id });
  if (error) return { ok: false, error: error.message };
  return afterSportChange(user.id);
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
  if (!p.success) {
    log.warn('saveInjury: invalid input', { issues: issuePaths(p.error) });
    return { ok: false, error: p.error.issues[0]?.message };
  }
  const { supabase, user } = await requireUser();
  log.debug('saveInjury', { userId: user.id, injuryId: p.data.id, status: p.data.status });
  const { data: prof } = log.db('select profiles.timezone', await supabase.from('profiles').select('timezone').eq('user_id', user.id).single(), { userId: user.id });
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
  const { error } = log.db(
    p.data.id ? 'update injuries' : 'insert injuries',
    p.data.id ? await supabase.from('injuries').update(row).eq('id', p.data.id).eq('user_id', user.id) : await supabase.from('injuries').insert({ ...row, started_on: today }),
    { injuryId: p.data.id },
  );
  if (error) return { ok: false, error: error.message };
  // Injury added/resolved: re-run selection on future sessions (6.14).
  const step = await afterSettingsSaved(user.id, 'saveInjury', () => regeneratePlan(supabase, user.id, { reason: 'injury_change' }));
  revalidatePath('/', 'layout');
  return step;
}

export async function deleteInjury(id: string): Promise<R> {
  const { supabase, user } = await requireUser();
  const { error } = log.db('delete injuries', await supabase.from('injuries').delete().eq('id', id).eq('user_id', user.id), { injuryId: id });
  if (error) return { ok: false, error: error.message };
  const step = await afterSettingsSaved(user.id, 'deleteInjury', () => regeneratePlan(supabase, user.id, { reason: 'injury_change' }));
  revalidatePath('/', 'layout');
  return step;
}

export async function regenerateNow(): Promise<R> {
  const { supabase, user } = await requireUser();
  log.debug('regenerateNow', { userId: user.id });
  try {
    await regeneratePlan(supabase, user.id, { reason: 'manual' });
  } catch (e) {
    log.error('regenerateNow failed', { userId: user.id, err: e });
    return { ok: false, error: 'Could not regenerate your plan. Please try again.' };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deleteAccount(confirm: string): Promise<R> {
  if (confirm !== 'DELETE') return { ok: false, error: 'Type DELETE to confirm' };
  const { supabase, user } = await requireUser();
  log.info('deleteAccount', { userId: user.id });
  const { error } = log.db('rpc delete_my_account', await supabase.rpc('delete_my_account'), { userId: user.id });
  if (error) return { ok: false, error: error.message };
  log.db('signOut after account delete', await supabase.auth.signOut());
  redirect('/login');
}
