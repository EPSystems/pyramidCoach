import 'server-only';
import type { Supa } from '@/lib/supabase/server';
import type { Tables } from '@/lib/db/database.types';
import { addDays, mondayOf } from '@/lib/engine/util';
import { createLogger } from '@/lib/log';

const log = createLogger('server/queries');

export type SessionWithExercises = Tables<'planned_sessions'> & {
  planned_exercises: (Tables<'planned_exercises'> & { exercises: { name: string; slug: string; category: string } | null })[];
};

export async function sessionsBetween(supabase: Supa, userId: string, from: string, to: string): Promise<SessionWithExercises[]> {
  const { data } = log.db(
    'select planned_sessions',
    await supabase
      .from('planned_sessions')
      .select('*, planned_exercises(*, exercises(name, slug, category))')
      .eq('user_id', userId)
      .gte('scheduled_on', from)
      .lt('scheduled_on', to)
      .order('scheduled_on')
      .order('order_in_week'),
    { userId, from, to },
  );
  return ((data ?? []) as SessionWithExercises[]).map((s) => ({ ...s, planned_exercises: [...s.planned_exercises].sort((a, b) => a.position - b.position) }));
}

export async function activeBlock(supabase: Supa, userId: string) {
  const { data } = log.db('select active block', await supabase.from('blocks').select('*').eq('user_id', userId).eq('status', 'active').maybeSingle(), { userId });
  return data;
}

export function blockWeekIndex(block: { starts_on: string; weeks: number } | null, today: string): number | null {
  if (!block) return null;
  const diff = Math.floor((Date.parse(mondayOf(today)) - Date.parse(block.starts_on)) / (7 * 86400000));
  return diff;
}

export function weekRange(today: string) {
  const start = mondayOf(today);
  return { start, end: addDays(start, 7) };
}

export async function latestNutrition(supabase: Supa, userId: string) {
  const { data } = log.db(
    'select latest nutrition_targets',
    await supabase.from('nutrition_targets').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    { userId },
  );
  return data;
}

/** Readiness pill from today's check-in [APP]. */
export function readiness(c: { sleep_hours: number | null; energy: number | null; stress: number | null; soreness: unknown } | null) {
  if (!c || (c.sleep_hours == null && c.energy == null)) return null;
  const sore = Object.values((c.soreness as Record<string, string>) ?? {});
  let score = 0;
  if ((c.sleep_hours ?? 7) >= 7) score++;
  if ((c.energy ?? 3) >= 3) score++;
  if ((c.stress ?? 3) <= 3) score++;
  if (!sore.includes('pain')) score++;
  if (score === 4) return { label: 'Ready', tone: 'ok' as const };
  if (score >= 2) return { label: 'Steady: autoregulate', tone: 'warn' as const };
  return { label: 'Take it easy', tone: 'danger' as const };
}

/**
 * Reads every row of a query, a page at a time. PostgREST caps a single response at `max_rows` (1000,
 * supabase/config.toml), so long histories and exports would otherwise be cut off without an error.
 * `page(from, to)` must apply a total order so pages don't overlap. The first error stops the read.
 */
export async function fetchAllPages<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ctx: Record<string, unknown> = {},
  pageSize = 1000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = log.db(label, await page(from, from + pageSize - 1), { ...ctx, from });
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) return { data: out, error: null };
  }
}
