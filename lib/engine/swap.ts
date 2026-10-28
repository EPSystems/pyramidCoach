// Logger swap choices (6.15). The page and swapExercise share this list, so the server only accepts what the UI offers.
import { substitutionsFor } from './selection';
import type { ExerciseDef } from './types';

type SwapCtx = Parameters<typeof substitutionsFor>[1];

/** How many substitutes the swap dialog lists. */
export const SWAP_OPTION_LIMIT = 8;

export function swapOptions(ex: ExerciseDef, ctx: SwapCtx): ExerciseDef[] {
  return substitutionsFor(ex, ctx).slice(0, SWAP_OPTION_LIMIT);
}

export function isValidSwap(from: ExerciseDef, toExerciseId: string, ctx: SwapCtx): boolean {
  return swapOptions(from, ctx).some((e) => e.id === toExerciseId);
}
