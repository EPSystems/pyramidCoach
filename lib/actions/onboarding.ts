'use server';

import { redirect } from 'next/navigation';
import { OnboardingInput, type OnboardingPayload } from '@/lib/schemas/onboarding';
import { buildOnboardingWrite } from '@/lib/onboarding/derive';
import type { Json } from '@/lib/db/database.types';
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

  // Profile, settings, sports, injuries and the first weigh-in in one transaction (complete_onboarding, RLS applies).
  // It refuses once onboarded_at is set: a resubmit from a stale tab would overwrite later edits and rebuild the plan.
  const write = buildOnboardingWrite(d, today, () => crypto.randomUUID());
  const { error: wErr } = await supabase.rpc('complete_onboarding', { p: write as unknown as Json });
  if (wErr) {
    if (wErr.hint === 'already_onboarded') {
      log.warn('completeOnboarding: already onboarded, ignoring resubmit', { userId: uid });
      return { error: 'Your setup is already complete. Change your details in Settings instead.' };
    }
    log.error('rpc complete_onboarding failed', { userId: uid, err: wErr });
    return { error: wErr.message };
  }

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
