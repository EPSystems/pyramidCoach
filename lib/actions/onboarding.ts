'use server';

import { redirect } from 'next/navigation';
import { OnboardingInput, type OnboardingPayload } from '@/lib/schemas/onboarding';
import { e1rm } from '@/lib/engine/e1rm';
import { requireUser } from '@/lib/server/context';
import { recomputeNutrition, regeneratePlan } from '@/lib/server/plan';
import { todayIn } from '@/lib/utils/dates';
import { createLogger } from '@/lib/log';

const log = createLogger('actions/onboarding');

export async function completeOnboarding(raw: OnboardingPayload): Promise<{ error?: string }> {
  const parsed = OnboardingInput.safeParse(raw);
  if (!parsed.success) {
    log.warn('completeOnboarding: invalid input', { issues: parsed.error.issues.map((i) => i.path.join('.')) });
    return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  const d = parsed.data;
  const { supabase, user } = await requireUser();
  const uid = user.id;
  const today = todayIn(d.timezone);
  log.debug('completeOnboarding', { userId: uid, goal: d.goal, sports: d.sports.length, customSports: d.customSports.length, injuries: d.injuries.length });

  // A resubmit from a stale tab would overwrite settings, sports and injuries the user has edited since, and rebuild their plan.
  const { data: existing, error: exErr } = log.db('select profiles.onboarded_at', await supabase.from('profiles').select('onboarded_at').eq('user_id', uid).maybeSingle(), { userId: uid });
  if (exErr) return { error: exErr.message };
  if (existing?.onboarded_at) {
    log.warn('completeOnboarding: already onboarded, ignoring resubmit', { userId: uid });
    return { error: 'Your setup is already complete. Change your details in Settings instead.' };
  }

  const { error: pErr } = await supabase
    .from('profiles')
    .update({
      display_name: d.displayName,
      sex: d.sex,
      birth_year: d.birthYear ?? null,
      height_cm: d.heightCm ?? null,
      bodyweight_kg: d.bodyweightKg,
      body_fat_pct: d.bodyFatPct ?? null,
      units: d.units,
      timezone: d.timezone,
      last_active_at: new Date().toISOString(),
    })
    .eq('user_id', uid);
  if (pErr) {
    log.error('update profiles failed', { userId: uid, err: pErr });
    return { error: pErr.message };
  }

  const seeds: Record<string, number> = {};
  for (const [k, v] of Object.entries(d.seeds)) {
    if (v) {
      const est = e1rm(v.load, v.reps, 0);
      if (est) seeds[k] = Math.round(est * 10) / 10;
    }
  }

  const { error: sErr } = await supabase.from('user_settings').upsert({
    user_id: uid,
    goal: d.goal,
    priority: d.goal === 'sport_support' ? 'sport' : d.sports.length || d.customSports.length ? d.priority : 'lifting',
    training_status: d.status,
    status_source: 'self',
    available_days: [...new Set(d.availableDays)].sort(),
    session_minutes: d.sessionMinutes,
    max_lift_days: d.maxLiftDays ?? null,
    lifestyle: d.lifestyle,
    equipment: d.equipment,
    e1rm_seeds: seeds,
    trained_last_month: d.trainedLastMonth,
  });
  if (sErr) {
    log.error('upsert user_settings failed', { userId: uid, err: sErr });
    return { error: sErr.message };
  }

  // Sports (custom ones are private rows in the catalog). New rows go in before the previous ones are deleted by id,
  // so a failure part-way leaves the old set (or a retry's leftovers), never nothing. No unique key to clash on.
  const { data: oldSports, error: osErr } = log.db('select user_sports ids', await supabase.from('user_sports').select('id').eq('user_id', uid), { userId: uid });
  if (osErr) return { error: osErr.message };
  const customIdMap = new Map<string, string>();
  // Deleting a custom sport cascades to the user_sports rows that point at it.
  const dropCustomSports = async () => {
    if (customIdMap.size) log.db('delete sports (custom, cleanup)', await supabase.from('sports').delete().in('id', [...customIdMap.values()]).eq('owner_user_id', uid), { userId: uid });
  };
  for (const c of d.customSports) {
    const id = crypto.randomUUID();
    const { error } = await supabase.from('sports').insert({
      id,
      name: c.name,
      lower_body_load: c.lower,
      upper_body_load: c.upper,
      eccentric_impact: c.impact,
      conditioning: c.conditioning,
      muscles_stressed: c.muscles,
      default_minutes: 60,
      owner_user_id: uid,
    });
    if (error) {
      log.error('insert sports (custom) failed', { userId: uid, err: error });
      await dropCustomSports();
      return { error: error.message };
    }
    customIdMap.set(c.tempId, id);
  }
  let newSportIds: string[] = [];
  if (d.sports.length) {
    const { data, error } = await supabase
      .from('user_sports')
      .insert(
        d.sports.map((s) => ({
          user_id: uid,
          sport_id: customIdMap.get(s.sportId) ?? s.sportId,
          weekdays: [...new Set(s.weekdays)].sort(),
          intensity: s.intensity,
          minutes: s.minutes,
          time_of_day: s.timeOfDay ?? null,
        })),
      )
      .select('id');
    if (error) {
      log.error('insert user_sports failed', { userId: uid, count: d.sports.length, err: error });
      await dropCustomSports();
      return { error: error.message };
    }
    newSportIds = data.map((r) => r.id);
  }
  if (oldSports.length) {
    const { error } = log.db('delete user_sports (previous)', await supabase.from('user_sports').delete().in('id', oldSports.map((r) => r.id)), { userId: uid, count: oldSports.length });
    if (error) {
      // Take the new rows back out so the user isn't left with both sets.
      if (newSportIds.length) log.db('delete user_sports (cleanup)', await supabase.from('user_sports').delete().in('id', newSportIds), { userId: uid });
      await dropCustomSports();
      return { error: error.message };
    }
  }

  // Injuries, same insert-then-delete order.
  const { data: oldInjuries, error: oiErr } = log.db('select injuries ids', await supabase.from('injuries').select('id').eq('user_id', uid), { userId: uid });
  if (oiErr) return { error: oiErr.message };
  let newInjuryIds: string[] = [];
  if (d.injuries.length) {
    const slugs = [...new Set(d.injuries.flatMap((i) => i.avoidSlugs))];
    const { data: exRows, error: exRowsErr } = slugs.length ? log.db('select exercises by slug', await supabase.from('exercises').select('id, slug').in('slug', slugs), { count: slugs.length }) : { data: [], error: null };
    if (exRowsErr) return { error: exRowsErr.message };
    const bySlug = new Map((exRows ?? []).map((r) => [r.slug, r.id]));
    const { data, error } = await supabase
      .from('injuries')
      .insert(
        d.injuries.map((i) => ({
          user_id: uid,
          muscle_id: i.muscleId,
          label: i.label,
          severity: i.severity,
          status: i.status,
          rehab_note: i.note ?? null,
          avoid_exercise_ids: i.avoidSlugs.map((s) => bySlug.get(s)).filter((x): x is string => !!x),
          started_on: today,
        })),
      )
      .select('id');
    if (error) {
      log.error('insert injuries failed', { userId: uid, count: d.injuries.length, err: error });
      return { error: error.message };
    }
    newInjuryIds = data.map((r) => r.id);
  }
  if (oldInjuries.length) {
    const { error } = log.db('delete injuries (previous)', await supabase.from('injuries').delete().in('id', oldInjuries.map((r) => r.id)), { userId: uid, count: oldInjuries.length });
    if (error) {
      if (newInjuryIds.length) log.db('delete injuries (cleanup)', await supabase.from('injuries').delete().in('id', newInjuryIds), { userId: uid });
      return { error: error.message };
    }
  }

  // Starting bodyweight counts as today's weigh-in.
  const { error: cErr } = log.db('upsert checkins (starting bodyweight)', await supabase.from('checkins').upsert({ user_id: uid, day: today, bodyweight_kg: d.bodyweightKg }), { userId: uid, day: today });
  if (cErr) return { error: cErr.message };

  // Both throw on any DB error. onboarded_at isn't set yet, so the user stays on the wizard and resubmitting retries cleanly.
  try {
    await regeneratePlan(supabase, uid, { reason: 'onboarding' });
    await recomputeNutrition(supabase, uid, 'onboarding', { resetPhase: true });
  } catch (e) {
    log.error('initial plan/nutrition build failed', { userId: uid, err: e });
    return { error: 'Could not build your plan. Your answers are saved, so please try again.' };
  }
  // Without onboarded_at the user is bounced back to /onboarding on the next page load, so report it instead of redirecting.
  const { data: done, error: oErr } = log.db(
    'update profiles.onboarded_at',
    await supabase.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('user_id', uid).select('user_id').maybeSingle(),
    { userId: uid },
  );
  if (oErr) return { error: oErr.message };
  if (!done) {
    log.error('update profiles.onboarded_at matched no row', { userId: uid });
    return { error: 'Could not finish setup. Please try again.' };
  }
  redirect('/onboarding/done');
}
