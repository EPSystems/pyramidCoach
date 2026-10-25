import 'server-only';
import type { Supa } from '@/lib/supabase/server';
import type { Tables } from '@/lib/db/database.types';
import { addDays, mondayOf } from '@/lib/engine/util';

export type SessionWithExercises = Tables<'planned_sessions'> & {
  planned_exercises: (Tables<'planned_exercises'> & { exercises: { name: string; slug: string; category: string } | null })[];
};

export async function sessionsBetween(supabase: Supa, userId: string, from: string, to: string): Promise<SessionWithExercises[]> {
  const { data } = await supabase
    .from('planned_sessions')
    .select('*, planned_exercises(*, exercises(name, slug, category))')
    .eq('user_id', userId)
    .gte('scheduled_on', from)
    .lt('scheduled_on', to)
    .order('scheduled_on')
    .order('order_in_week');
  return ((data ?? []) as SessionWithExercises[]).map((s) => ({ ...s, planned_exercises: [...s.planned_exercises].sort((a, b) => a.position - b.position) }));
}

export async function activeBlock(supabase: Supa, userId: string) {
  const { data } = await supabase.from('blocks').select('*').eq('user_id', userId).eq('status', 'active').maybeSingle();
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
  const { data } = await supabase.from('nutrition_targets').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
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
  if (score >= 2) return { label: 'Steady — autoregulate', tone: 'warn' as const };
  return { label: 'Take it easy', tone: 'danger' as const };
}
