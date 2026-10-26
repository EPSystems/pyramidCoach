import type { Metadata } from 'next';
import { requireOnboarded, loadExercises } from '@/lib/server/context';
import { PageHeader } from '@/components/app/bits';
import { SettingsForms } from './forms';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const ctx = await requireOnboarded();
  const { supabase, settings, profile } = ctx;
  const [{ data: sports }, exercises] = await Promise.all([supabase.from('sports').select('*').order('name'), loadExercises(supabase)]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader kicker={ctx.user.email ?? ''} title="Settings" />
      <div className="px-4 sm:px-6 lg:px-8">
        <SettingsForms
          training={{
            goal: settings.goal as never,
            priority: settings.priority as never,
            status: settings.training_status as never,
            availableDays: settings.available_days,
            sessionMinutes: settings.session_minutes as never,
            maxLiftDays: settings.max_lift_days,
            splitStyle: settings.split_style as never,
            repVariation: settings.rep_variation as never,
            equipment: settings.equipment as never,
            increments: settings.increments as never,
            specialization: settings.specialization_muscles as never,
            strengthLifts: settings.strength_lifts as never,
            testDate: settings.test_date,
          }}
          profile={{
            displayName: profile.display_name ?? '',
            // Older rows may hold null or 'unspecified': show nothing selected until the user picks one.
            sex: profile.sex === 'male' || profile.sex === 'female' ? profile.sex : null,
            heightCm: profile.height_cm,
            bodyFatPct: profile.body_fat_pct,
            units: profile.units as never,
            timezone: profile.timezone,
            hideBodyweight: profile.hide_bodyweight,
            lifestyle: settings.lifestyle as never,
          }}
          userSports={ctx.sportRows.map((s) => ({ id: s.id, sportId: s.sport_id, name: s.sports?.name ?? s.sport_id, weekdays: s.weekdays, intensity: s.intensity as never, minutes: s.minutes, timeOfDay: s.time_of_day as never, active: s.active }))}
          catalog={(sports ?? []).map((s) => ({ id: s.id, name: s.name, defaultMinutes: s.default_minutes }))}
          injuries={ctx.injuryRows.map((i) => ({ id: i.id, muscleId: i.muscle_id as never, label: i.label, severity: i.severity as never, status: i.status as never, note: i.rehab_note, avoidExerciseIds: i.avoid_exercise_ids }))}
          exercises={exercises.map((e) => ({ id: e.id, name: e.name }))}
        />
      </div>
    </div>
  );
}
