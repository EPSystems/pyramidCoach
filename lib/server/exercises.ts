import 'server-only';
import type { Supa } from '@/lib/supabase/server';
import { muscleRows } from '@/lib/schemas/exercise';
import { createLogger } from '@/lib/log';

const log = createLogger('server/exercises');

/**
 * Replaces an exercise's muscle rows (RLS: the user's own exercise, or a global one for the owner).
 * There is no transaction across the two statements, so if the insert fails the old rows are put back.
 */
export async function replaceExerciseMuscles(supabase: Supa, exerciseId: string, primary: string[], secondary: string[]): Promise<string | null> {
  const { data: old, error: readErr } = log.db('select exercise_muscles', await supabase.from('exercise_muscles').select('exercise_id, muscle_id, role').eq('exercise_id', exerciseId), { exerciseId });
  if (readErr) return readErr.message;
  const { error: delErr } = log.db('delete exercise_muscles', await supabase.from('exercise_muscles').delete().eq('exercise_id', exerciseId), { exerciseId });
  if (delErr) return delErr.message;
  const rows = muscleRows(exerciseId, primary, secondary);
  const { error: insErr } = log.db('insert exercise_muscles', await supabase.from('exercise_muscles').insert(rows), { exerciseId, count: rows.length });
  if (!insErr) return null;
  const { error: restoreErr } = log.db('restore exercise_muscles', await supabase.from('exercise_muscles').insert(old ?? []), { exerciseId });
  if (restoreErr) log.error('could not restore exercise_muscles; exercise has no muscles now', { exerciseId, err: restoreErr });
  return insErr.message;
}
