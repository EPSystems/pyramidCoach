// Shared validation for user-made exercises (library) and owner edits of global ones (admin).
import { z } from 'zod';
import { ALL_MUSCLES } from '@/lib/engine/types';

const lines = (max: number, maxLen: number) =>
  z
    .string()
    .max(max * (maxLen + 1))
    .optional()
    .transform((s) =>
      (s ?? '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, max)
        .map((x) => x.slice(0, maxLen)),
    );

/** Muscles and flags: the parts the owner may also edit on global exercises. */
export const ExerciseTraits = z.object({
  primary: z.array(z.enum(ALL_MUSCLES)).min(1, 'Pick at least one primary muscle'),
  secondary: z.array(z.enum(ALL_MUSCLES)),
  long: z.boolean().default(false),
  axial: z.boolean().default(false),
  impact: z.boolean().default(false),
  unilateral: z.boolean().default(false),
  /** Load step in kg; null = use the equipment default from Settings. */
  increment: z.number().positive().max(20).nullable().default(null),
});

export const CustomExercise = ExerciseTraits.extend({
  name: z.string().trim().min(2, 'Name needs at least 2 characters').max(60),
  pattern: z.enum(['squat', 'hinge', 'vertical_pull', 'vertical_push', 'horizontal_pull', 'horizontal_push', 'hip_extension', 'pullover', 'upright_row', 'fly', 'isolation', 'carry', 'core']),
  category: z.enum(['lower_free_compound', 'lower_machine_compound', 'upper_free_press', 'upper_machine_press', 'pulling_compound', 'isolation']),
  equipment: z.array(z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'])).min(1, 'Pick at least one piece of equipment'),
  main: z.enum(['squat', 'bench', 'deadlift', 'ohp']).nullable().default(null),
  cues: lines(5, 160),
  mistakes: lines(4, 160),
  substitutions: z.array(z.string().max(120)).max(8).default([]),
});
export type CustomExerciseInput = z.input<typeof CustomExercise>;

/** exercise_muscles rows; a secondary that is also primary is dropped. */
export function muscleRows(exerciseId: string, primary: string[], secondary: string[]) {
  return [
    ...primary.map((m) => ({ exercise_id: exerciseId, muscle_id: m, role: 'primary' })),
    ...secondary.filter((m) => !primary.includes(m)).map((m) => ({ exercise_id: exerciseId, muscle_id: m, role: 'secondary' })),
  ];
}
