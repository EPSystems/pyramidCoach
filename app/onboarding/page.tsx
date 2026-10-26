import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/server/context';
import { OnboardingWizard, type Prefill } from './wizard';

export const metadata: Metadata = { title: 'Set up' };

export default async function OnboardingPage() {
  const ctx = await getUserContext();
  if (ctx.profile?.onboarded_at) redirect('/today');
  const { data: sports } = await ctx.supabase.from('sports').select('*').order('name');
  const isOwner = ctx.profile?.role === 'owner';
  // Appendix F (Emo's profile import): pre-filled, confirmed step by step.
  const prefill: Prefill | undefined = isOwner
    ? {
        displayName: 'Emo',
        heightCm: 170,
        bodyweightKg: 72,
        bodyFatPct: 15,
        goal: 'lean_gain',
        status: 'intermediate',
        priority: 'balanced',
        sports: [
          { sportId: 'football', weekdays: [6], intensity: 'match', minutes: 90 },
          { sportId: 'boxing', weekdays: [2], intensity: 'moderate', minutes: 60 },
        ],
        availableDays: [1, 2, 3, 4, 5, 6, 7],
        sessionMinutes: 60,
        maxLiftDays: 5,
        equipmentPreset: 'full',
        injuries: [
          {
            muscleId: 'hamstrings',
            label: 'Hamstring strain (rehab)',
            severity: 'niggle',
            status: 'rehab',
            note: 'Daily rehab: isometric holds, single-leg RDL, Nordic negatives (physio-style protocol). Sprint test before full return to football. Avoid heavy hinges until cleared.',
            avoidSlugs: ['conventional-deadlift', 'sumo-deadlift', 'good-morning'],
          },
        ],
        seeds: { squat: { load: 90, reps: 3 }, bench: { load: 90, reps: 2 }, ohp: { load: 40, reps: 3 } },
      }
    : undefined;
  return (
    <OnboardingWizard
      sports={(sports ?? []).map((s) => ({ id: s.id, name: s.name, defaultMinutes: s.default_minutes, notes: s.notes, custom: !!s.owner_user_id }))}
      prefill={prefill}
      email={ctx.user.email ?? ''}
    />
  );
}
