'use server';

import { redirect } from 'next/navigation';
import { OnboardingInput, type OnboardingPayload } from '@/lib/schemas/onboarding';
import { e1rm } from '@/lib/engine/e1rm';
import { requireUser } from '@/lib/server/context';
import { recomputeNutrition, regeneratePlan } from '@/lib/server/plan';
import { todayIn } from '@/lib/utils/dates';

export async function completeOnboarding(raw: OnboardingPayload): Promise<{ error?: string }> {
  const parsed = OnboardingInput.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  const d = parsed.data;
  const { supabase, user } = await requireUser();
  const uid = user.id;
  const today = todayIn(d.timezone);

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
  if (pErr) return { error: pErr.message };

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
  if (sErr) return { error: sErr.message };

  // Sports (custom ones are private rows in the catalog).
  await supabase.from('user_sports').delete().eq('user_id', uid);
  const customIdMap = new Map<string, string>();
  for (const c of d.customSports) {
    const id = crypto.randomUUID();
    customIdMap.set(c.tempId, id);
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
    if (error) return { error: error.message };
  }
  if (d.sports.length) {
    const { error } = await supabase.from('user_sports').insert(
      d.sports.map((s) => ({
        user_id: uid,
        sport_id: customIdMap.get(s.sportId) ?? s.sportId,
        weekdays: [...new Set(s.weekdays)].sort(),
        intensity: s.intensity,
        minutes: s.minutes,
        time_of_day: s.timeOfDay ?? null,
      })),
    );
    if (error) return { error: error.message };
  }

  // Injuries.
  await supabase.from('injuries').delete().eq('user_id', uid);
  if (d.injuries.length) {
    const slugs = [...new Set(d.injuries.flatMap((i) => i.avoidSlugs))];
    const { data: exRows } = slugs.length ? await supabase.from('exercises').select('id, slug').in('slug', slugs) : { data: [] };
    const bySlug = new Map((exRows ?? []).map((r) => [r.slug, r.id]));
    const { error } = await supabase.from('injuries').insert(
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
    );
    if (error) return { error: error.message };
  }

  // Starting bodyweight counts as today's weigh-in.
  await supabase.from('checkins').upsert({ user_id: uid, day: today, bodyweight_kg: d.bodyweightKg });

  try {
    await regeneratePlan(supabase, uid, { reason: 'onboarding' });
    await recomputeNutrition(supabase, uid, 'onboarding', { resetPhase: true });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not build your plan' };
  }
  await supabase.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('user_id', uid);
  redirect('/onboarding/done');
}
