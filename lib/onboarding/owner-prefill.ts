// Onboarding pre-fill. Only the owner gets one (Appendix F: Emo's profile import), and it is confirmed step by step in
// the wizard rather than written straight to the database.
import type { Equipment } from '@/lib/engine/types';
import type { OnboardingPayload } from '@/lib/schemas/onboarding';

export type EquipmentPreset = 'full' | 'dumbbells' | 'bodyweight' | 'custom';

export interface Prefill {
  displayName?: string;
  sex?: OnboardingPayload['sex'];
  heightCm?: number;
  bodyweightKg?: number;
  bodyFatPct?: number;
  goal?: OnboardingPayload['goal'];
  status?: OnboardingPayload['status'];
  priority?: OnboardingPayload['priority'];
  sports?: OnboardingPayload['sports'];
  availableDays?: number[];
  sessionMinutes?: OnboardingPayload['sessionMinutes'];
  maxLiftDays?: number;
  equipmentPreset?: EquipmentPreset;
  injuries?: OnboardingPayload['injuries'];
  /** Loads in kg. */
  seeds?: OnboardingPayload['seeds'];
}

export const EQUIPMENT_PRESETS: Record<Exclude<EquipmentPreset, 'custom'>, Equipment[]> = {
  full: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'],
  dumbbells: ['dumbbell', 'bodyweight', 'band'],
  bodyweight: ['bodyweight', 'band'],
};

/** Appendix F. Sex is pre-selected but still shown on step 1 to confirm. */
export const OWNER_PREFILL: Prefill = {
  displayName: 'Emo',
  sex: 'male',
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
};

/** The pre-fill for a user, by role. Members start blank. */
export const prefillFor = (role: string | null | undefined): Prefill | undefined => (role === 'owner' ? OWNER_PREFILL : undefined);
