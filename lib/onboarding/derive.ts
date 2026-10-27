// Pure onboarding helpers: wizard answers → payload, and payload → the rows complete_onboarding() writes.
import { e1rm } from '@/lib/engine/e1rm';
import type { OnboardingData, OnboardingPayload } from '@/lib/schemas/onboarding';
import { fromDisplay, type Units } from '@/lib/utils/units';

type Seeds = NonNullable<OnboardingPayload['seeds']>;
type Custom = NonNullable<OnboardingPayload['customSports']>[number];

/** Best-set seeds as entered (display units) → kg, dropping lifts with no load or reps. */
export function seedsToKg(seeds: Seeds, units: Units): Seeds {
  const out: Seeds = {};
  for (const [lift, v] of Object.entries(seeds) as [keyof Seeds, Seeds[keyof Seeds]][]) {
    if (v && v.load > 0 && v.reps > 0) out[lift] = { load: fromDisplay(v.load, units), reps: v.reps };
  }
  return out;
}

/** Custom sports that are still selected. A removed chip must not create a catalog row. */
export const selectedCustomSports = (customs: Custom[], sports: { sportId: string }[]): Custom[] =>
  customs.filter((c) => sports.some((s) => s.sportId === c.tempId));

/** e1RM seeds (kg, 1 decimal) from best sets: load × 36 / (37 − reps). */
export function e1rmSeeds(seeds: OnboardingData['seeds']): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(seeds)) {
    if (v) {
      const est = e1rm(v.load, v.reps, 0);
      if (est) out[k] = Math.round(est * 10) / 10;
    }
  }
  return out;
}

/** Argument of the complete_onboarding() RPC; keys match the column names. */
export interface OnboardingWrite {
  today: string;
  profile: {
    display_name: string;
    sex: string;
    birth_year: number | null;
    height_cm: number | null;
    bodyweight_kg: number;
    body_fat_pct: number | null;
    units: string;
    timezone: string;
  };
  settings: {
    goal: string;
    priority: string;
    training_status: string;
    available_days: number[];
    session_minutes: number;
    max_lift_days: number | null;
    lifestyle: string;
    equipment: string[];
    e1rm_seeds: Record<string, number>;
    trained_last_month: boolean;
  };
  custom_sports: { id: string; name: string; lower_body_load: number; upper_body_load: number; eccentric_impact: number; conditioning: number; muscles_stressed: string[] }[];
  sports: { sport_id: string; weekdays: number[]; intensity: string; minutes: number; time_of_day: string | null }[];
  injuries: { muscle_id: string; label: string; severity: string; status: string; rehab_note: string | null; avoid_slugs: string[] }[];
}

const sortedUnique = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);

/** Validated input → RPC payload. `newId` names custom sports (their ids are text, so the caller picks them). */
export function buildOnboardingWrite(d: OnboardingData, today: string, newId: () => string): OnboardingWrite {
  const customs = selectedCustomSports(d.customSports, d.sports);
  const idByTemp = new Map(customs.map((c) => [c.tempId, newId()]));
  return {
    today,
    profile: {
      display_name: d.displayName,
      sex: d.sex,
      birth_year: d.birthYear ?? null,
      height_cm: d.heightCm ?? null,
      bodyweight_kg: d.bodyweightKg,
      body_fat_pct: d.bodyFatPct ?? null,
      units: d.units,
      timezone: d.timezone,
    },
    settings: {
      goal: d.goal,
      priority: d.goal === 'sport_support' ? 'sport' : d.sports.length ? d.priority : 'lifting',
      training_status: d.status,
      available_days: sortedUnique(d.availableDays),
      session_minutes: d.sessionMinutes,
      max_lift_days: d.maxLiftDays ?? null,
      lifestyle: d.lifestyle,
      equipment: d.equipment,
      e1rm_seeds: e1rmSeeds(d.seeds),
      trained_last_month: d.trainedLastMonth,
    },
    custom_sports: customs.map((c) => ({
      id: idByTemp.get(c.tempId)!,
      name: c.name,
      lower_body_load: c.lower,
      upper_body_load: c.upper,
      eccentric_impact: c.impact,
      conditioning: c.conditioning,
      muscles_stressed: c.muscles,
    })),
    sports: d.sports.map((s) => ({
      sport_id: idByTemp.get(s.sportId) ?? s.sportId,
      weekdays: sortedUnique(s.weekdays),
      intensity: s.intensity,
      minutes: s.minutes,
      time_of_day: s.timeOfDay ?? null,
    })),
    injuries: d.injuries.map((i) => ({
      muscle_id: i.muscleId,
      label: i.label,
      severity: i.severity,
      status: i.status,
      rehab_note: i.note?.trim() ? i.note : null,
      avoid_slugs: [...new Set(i.avoidSlugs)],
    })),
  };
}
