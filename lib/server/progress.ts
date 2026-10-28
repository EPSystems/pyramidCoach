import 'server-only';
import type { Supa } from '@/lib/supabase/server';
import type { Tables } from '@/lib/db/database.types';
import { addDays, mondayOf } from '@/lib/engine/util';
import { rangeStart, type ProgressRange } from '@/lib/engine/progress';
import { loadExercises, mapSet } from './context';
import { activeBlock, blockWeekIndex, fetchAllPages } from './queries';
import { createLogger } from '@/lib/log';

const log = createLogger('server/progress');

/** Stall flags always look back this far, whatever range is shown, so they don't change with the selector. */
const STALL_LOOKBACK_DAYS = 182;
/** Weekly sets per muscle stay an 8-week view; the range selector applies to the trend charts. */
export const VOLUME_WEEKS = 8;

/**
 * Everything the Progress page reads, for a history range (DECISIONS 55). Sets and weigh-ins are paged past
 * PostgREST's 1000-row cap. Sets are fetched from the earlier of the range start and the stall lookback.
 */
export async function loadProgressData(supabase: Supa, userId: string, today: string, range: ProgressRange) {
  const from = rangeStart(today, range);
  const setsFrom = from == null ? null : [from, addDays(today, -STALL_LOOKBACK_DAYS), addDays(mondayOf(today), -7 * (VOLUME_WEEKS - 1))].sort()[0];
  const nextMonday = addDays(mondayOf(today), 7);

  const [exercises, setsRes, sessionsRes, block] = await Promise.all([
    loadExercises(supabase),
    fetchAllPages<Tables<'logged_sets'>>(
      'select logged_sets',
      (a, b) => {
        let q = supabase.from('logged_sets').select('*').eq('user_id', userId).eq('is_warmup', false);
        if (setsFrom) q = q.gte('performed_on', setsFrom);
        return q.order('performed_on').order('id').range(a, b);
      },
      { userId, range },
    ),
    fetchAllPages<Pick<Tables<'planned_sessions'>, 'scheduled_on' | 'status'>>(
      'select planned_sessions',
      (a, b) => {
        let q = supabase.from('planned_sessions').select('scheduled_on, status').eq('user_id', userId).lt('scheduled_on', nextMonday);
        if (from) q = q.gte('scheduled_on', mondayOf(from));
        return q.order('scheduled_on').order('id').range(a, b);
      },
      { userId, range },
    ),
    activeBlock(supabase, userId),
  ]);
  if (setsRes.error) throw new Error(setsRes.error.message);
  const { data: targets } = block
    ? log.db('select weekly_targets', await supabase.from('weekly_targets').select('muscle_id, target_sets, week_index').eq('block_id', block.id), { userId })
    : { data: [] as { muscle_id: string; target_sets: number; week_index: number }[] };
  const sessions = sessionsRes.data;
  return {
    from,
    exercises,
    sets: setsRes.data.map(mapSet),
    sessions,
    // Adherence starts at the range start, or at the first planned session for "all".
    adherenceFrom: from ?? sessions[0]?.scheduled_on ?? mondayOf(today),
    targets: targets ?? [],
    blockWeek: block ? Math.max(0, blockWeekIndex(block, today) ?? 0) : 0,
  };
}
