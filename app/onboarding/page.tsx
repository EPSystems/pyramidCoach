import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/server/context';
import type { MuscleId } from '@/lib/engine/types';
import { prefillFor } from '@/lib/onboarding/owner-prefill';
import { OnboardingWizard } from './wizard';

export const metadata: Metadata = { title: 'Set up' };

export default async function OnboardingPage() {
  const ctx = await getUserContext();
  if (ctx.profile?.onboarded_at) redirect('/today');
  // Catalog sports only: before onboarding is done, a user's own custom sports are leftovers of an earlier attempt that
  // complete_onboarding() deletes on the next submit (so picking one would fail).
  const [{ data: sports }, { data: exercises }] = await Promise.all([
    ctx.supabase.from('sports').select('*').is('owner_user_id', null).order('name'),
    // For "exercises to avoid" on an injury.
    ctx.supabase.from('exercises').select('slug, name, exercise_muscles(muscle_id, role)').order('popularity'),
  ]);
  return (
    <OnboardingWizard
      sports={(sports ?? []).map((s) => ({ id: s.id, name: s.name, defaultMinutes: s.default_minutes, notes: s.notes, custom: !!s.owner_user_id }))}
      prefill={prefillFor(ctx.profile?.role)}
      exercises={(exercises ?? []).map((e) => ({ slug: e.slug, name: e.name, primary: e.exercise_muscles.filter((m) => m.role === 'primary' && m.muscle_id).map((m) => m.muscle_id as MuscleId) }))}
      email={ctx.user.email ?? ''}
    />
  );
}
