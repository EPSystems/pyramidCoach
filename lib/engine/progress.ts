// Progress page series (Section 9): history range, e1RM trends with a high-rep fallback, adherence buckets and
// read-only stall flags. Rules: T-EST-01 (e1RM), T-PRG-06 (plateau window). Pure: no DB, no units.
import { e1rm } from './e1rm';
import { isPlateaued } from './plateau';
import type { ExerciseDef, LoggedSet, MainLift, Status } from './types';
import { addDays, mondayOf } from './util';

export const PROGRESS_RANGES = ['3m', '6m', '1y', 'all'] as const;
export type ProgressRange = (typeof PROGRESS_RANGES)[number];
export const DEFAULT_RANGE: ProgressRange = '6m';
const RANGE_DAYS: Record<Exclude<ProgressRange, 'all'>, number> = { '3m': 91, '6m': 182, '1y': 365 };

export function parseRange(v: unknown): ProgressRange {
  return (PROGRESS_RANGES as readonly unknown[]).includes(v) ? (v as ProgressRange) : DEFAULT_RANGE;
}

/** First day shown for a range; null = everything. */
export function rangeStart(today: string, range: ProgressRange): string | null {
  return range === 'all' ? null : addDays(today, -RANGE_DAYS[range]);
}

export interface Point {
  x: string;
  y: number;
}

/** Best e1RM per day across every variation of a main lift (kg, unrounded). */
export function mainLiftSeries(sets: LoggedSet[], exMap: Map<string, Pick<ExerciseDef, 'mainLiftKey'>>, lift: MainLift): Point[] {
  const byDay = new Map<string, number>();
  for (const s of sets) {
    if (s.isWarmup || exMap.get(s.exerciseId)?.mainLiftKey !== lift) continue;
    const v = e1rm(s.loadKg, s.reps, s.rir);
    if (v != null) byDay.set(s.performedOn, Math.max(byDay.get(s.performedOn) ?? 0, v));
  }
  return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([x, y]) => ({ x, y }));
}

export type TrendMetric = 'e1rm' | 'volume_load' | 'reps';

/**
 * Trend for one exercise's working sets, one point per day. First-set e1RM when at least half the days have one
 * (T-EST-01 skips sets above 12 effective reps); otherwise volume load (Σ load × reps) for loaded work, or total
 * reps for bodyweight work, so high-rep exercises still get a trend.
 */
export function exerciseTrend(sets: LoggedSet[]): { metric: TrendMetric; points: Point[] } {
  const byDay = new Map<string, LoggedSet[]>();
  for (const s of sets) if (!s.isWarmup) byDay.set(s.performedOn, [...(byDay.get(s.performedOn) ?? []), s]);
  const days = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, ss]) => [d, [...ss].sort((a, b) => a.setIndex - b.setIndex)] as const);
  const firstSet = days.map(([x, ss]) => ({ x, y: e1rm(ss[0].loadKg, ss[0].reps, ss[0].rir) }));
  const withE1rm = firstSet.filter((p): p is Point => p.y != null);
  if (days.length && withE1rm.length * 2 >= days.length) return { metric: 'e1rm', points: withE1rm };
  const loaded = sets.some((s) => !s.isWarmup && (s.loadKg ?? 0) > 0);
  return {
    metric: loaded ? 'volume_load' : 'reps',
    points: days.map(([x, ss]) => ({ x, y: ss.reduce((a, s) => a + (loaded ? (s.loadKg ?? 0) * s.reps : s.reps), 0) })),
  };
}

export interface AdherenceBucket {
  week: string; // bucket start (Monday or 1st of month)
  done: number;
  planned: number;
}

/** Sessions done vs planned per week (short ranges) or per month (long ranges), from `from` up to this week. */
export function adherenceBuckets(sessions: { scheduled_on: string; status: string }[], from: string, today: string, bucket: 'week' | 'month'): AdherenceBucket[] {
  const keyOf = (d: string) => (bucket === 'week' ? mondayOf(d) : `${d.slice(0, 7)}-01`);
  const out = new Map<string, AdherenceBucket>();
  for (let k = keyOf(from); k <= keyOf(today); k = bucket === 'week' ? addDays(k, 7) : nextMonth(k)) out.set(k, { week: k, done: 0, planned: 0 });
  for (const s of sessions) {
    const b = out.get(keyOf(s.scheduled_on));
    if (!b) continue;
    b.planned++;
    if (s.status === 'done') b.done++;
  }
  return [...out.values()];
}

function nextMonth(firstOfMonth: string): string {
  const [y, m] = firstOfMonth.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

export interface StallFlag {
  lift: MainLift;
  stalled: boolean;
  exposures: number;
  lastPrOn: string | null;
}

/**
 * Read-only stall flag per main lift with the weekly review's plateau test (isPlateaued, T-PRG-06) on the pooled
 * best-e1RM series. The weekly review still owns the follow-up proposals.
 */
export function liftStallFlags(series: Partial<Record<MainLift, Point[]>>, status: Status, today: string): StallFlag[] {
  return (Object.entries(series) as [MainLift, Point[]][])
    .filter(([, pts]) => pts.length > 0)
    .map(([lift, pts]) => {
      let best = -Infinity;
      let lastPrOn: string | null = null;
      for (const p of pts) if (p.y > best + 1e-9) [best, lastPrOn] = [p.y, p.x];
      return { lift, stalled: isPlateaued(pts.map((p) => ({ date: p.x, v: p.y })), status, today), exposures: pts.length, lastPrOn };
    });
}
