import { z } from 'zod';
import { ALL_MUSCLES } from '@/lib/engine/types';

const weekday = z.number().int().min(1).max(7);
const muscle = z.enum(ALL_MUSCLES);

export const SportInput = z.object({
  sportId: z.string().min(1),
  weekdays: z.array(weekday).min(1),
  intensity: z.enum(['light', 'moderate', 'hard', 'match']),
  minutes: z.number().int().min(10).max(300),
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

const LiftSeed = z.object({ load: z.number().positive().max(500), reps: z.number().int().min(1).max(12) }).nullable().optional();

export const OnboardingInput = z.object({
  displayName: z.string().min(1).max(60),
  sex: z.enum(['male', 'female', 'unspecified']),
  birthYear: z.number().int().min(1920).max(2015).nullable().optional(),
  heightCm: z.number().min(120).max(230).nullable().optional(),
  bodyweightKg: z.number().min(35).max(250),
  bodyFatPct: z.number().min(3).max(60).nullable().optional(),
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

