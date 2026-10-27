import { z } from 'zod';
import { ALL_MUSCLES } from '@/lib/engine/types';

const weekday = z.number().int().min(1).max(7);
const muscle = z.enum(ALL_MUSCLES);
const between = (lo: number, hi: number, what: string, unit = '') => ({ error: `${what} must be between ${lo} and ${hi}${unit}.` });
const NUMBER = { error: 'Enter a number.' };

// Field schemas shared by the server action and the wizard's inline errors (same limits, same messages).
export const BirthYear = z.number(NUMBER).int('Enter a whole year.').min(1920, between(1920, 2015, 'Birth year')).max(2015, between(1920, 2015, 'Birth year'));
export const HeightCm = z.number(NUMBER).min(120, between(120, 230, 'Height', ' cm')).max(230, between(120, 230, 'Height', ' cm'));
export const BodyweightKg = z.number(NUMBER).min(35, between(35, 250, 'Bodyweight', ' kg')).max(250, between(35, 250, 'Bodyweight', ' kg'));
export const BodyFatPct = z.number(NUMBER).min(3, between(3, 60, 'Body fat', ' %')).max(60, between(3, 60, 'Body fat', ' %'));
export const SportMinutes = z.number(NUMBER).int('Enter whole minutes.').min(10, between(10, 300, 'Minutes')).max(300, between(10, 300, 'Minutes'));

/** First error for one value against one of the field schemas above, or null when it passes. */
export function fieldError(schema: z.ZodType, value: unknown): string | null {
  const r = schema.safeParse(value);
  return r.success ? null : (r.error.issues[0]?.message ?? 'Invalid value.');
}

export const SportInput = z.object({
  sportId: z.string().min(1),
  weekdays: z.array(weekday).min(1),
  intensity: z.enum(['light', 'moderate', 'hard', 'match']),
  minutes: SportMinutes,
  timeOfDay: z.enum(['morning', 'midday', 'evening']).nullable().optional(),
});

export const CustomSportInput = z.object({
  tempId: z.string(),
  name: z.string().min(2).max(40),
  lower: z.number().int().min(0).max(3),
  upper: z.number().int().min(0).max(3),
  impact: z.number().int().min(0).max(3),
  conditioning: z.number().int().min(0).max(3),
  muscles: z.array(muscle),
});

export const InjuryInput = z.object({
  muscleId: muscle,
  label: z.string().min(2).max(80),
  severity: z.enum(['niggle', 'pain', 'injury']),
  status: z.enum(['active', 'rehab']).default('active'),
  note: z.string().max(500).optional().nullable(),
  avoidSlugs: z.array(z.string()).default([]),
});

// Seed loads are kg (the wizard converts lb before sending, like bodyweight).
const LiftSeed = z.object({ load: z.number().positive().max(500), reps: z.number().int().min(1).max(12) }).nullable().optional();

export const OnboardingInput = z.object({
  displayName: z.string().min(1).max(60),
  sex: z.enum(['male', 'female'], { error: 'Choose Male or Female for Sex.' }),
  birthYear: BirthYear.nullable().optional(),
  heightCm: HeightCm.nullable().optional(),
  bodyweightKg: BodyweightKg,
  bodyFatPct: BodyFatPct.nullable().optional(),
  units: z.enum(['kg', 'lb']),
  timezone: z.string().min(1).max(60),
  goal: z.enum(['lean_gain', 'recomp', 'strength', 'fat_loss', 'sport_support']),
  status: z.enum(['novice', 'intermediate', 'advanced']),
  trainedLastMonth: z.boolean(),
  sports: z.array(SportInput),
  customSports: z.array(CustomSportInput).default([]),
  priority: z.enum(['lifting', 'balanced', 'sport']),
  availableDays: z.array(weekday).min(1),
  sessionMinutes: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(75), z.literal(90), z.literal(120)]),
  maxLiftDays: z.number().int().min(1).max(6).nullable().optional(),
  equipment: z.array(z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'])).min(1),
  injuries: z.array(InjuryInput),
  lifestyle: z.enum(['sedentary', 'lightly_active', 'active', 'very_active']),
  seeds: z.object({ squat: LiftSeed, bench: LiftSeed, deadlift: LiftSeed, ohp: LiftSeed }).partial().default({}),
});

export type OnboardingPayload = z.input<typeof OnboardingInput>;
export type OnboardingData = z.output<typeof OnboardingInput>;

