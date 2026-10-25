// Weigh-in averages and trend (Section 7.6). Rules: N-WGT-01…04.
import { NUTRITION } from '@/lib/knowledge/constants';
import { addDays, daysBetween, isWeekend, mean, mondayOf } from './util';

export interface WeighIn {
  day: string;
  kg: number;
}

export interface WeekAverage {
  weekStart: string;
  avg: number;
  n: number;
  hasWeekend: boolean;
  lowData: boolean;
}

/** N-WGT-02: weekly averages; a week is reliable with ≥3 weigh-ins including a weekend day. */
export function weeklyAverages(weighIns: WeighIn[]): WeekAverage[] {
  const byWeek = new Map<string, WeighIn[]>();
  for (const w of weighIns) {
    const k = mondayOf(w.day);
    byWeek.set(k, [...(byWeek.get(k) ?? []), w]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([weekStart, ws]) => {
      const hasWeekend = ws.some((w) => isWeekend(w.day));
      const lowData = ws.length < NUTRITION.weighIns.minPerWeek || (NUTRITION.weighIns.needsWeekendDay && !hasWeekend);
      return { weekStart, avg: Math.round(mean(ws.map((w) => w.kg)) * 100) / 100, n: ws.length, hasWeekend, lowData };
    });
}

/** N-WGT-03: running average over the previous `days` days, one point per weigh-in day. */
export function runningAverage(weighIns: WeighIn[], days = NUTRITION.weighIns.runningAvgDays[0]): { day: string; avg: number }[] {
  const sorted = [...weighIns].sort((a, b) => (a.day < b.day ? -1 : 1));
  return sorted.map((w) => {
    const from = addDays(w.day, -(days - 1));
    const window = sorted.filter((x) => x.day >= from && x.day <= w.day);
    return { day: w.day, avg: Math.round(mean(window.map((x) => x.kg)) * 100) / 100 };
  });
}

/** % bodyweight change per week between two weekly averages. */
export function ratePctPerWeek(from: WeekAverage, to: WeekAverage): number {
  const weeks = daysBetween(from.weekStart, to.weekStart) / 7;
  if (weeks <= 0 || from.avg <= 0) return 0;
  return ((to.avg - from.avg) / from.avg / weeks) * 100;
}

/** Simple trend direction for "hide bodyweight numbers" mode (7.7). */
export function trendDirection(weeks: WeekAverage[]): 'up' | 'down' | 'flat' | 'unknown' {
  const reliable = weeks.filter((w) => !w.lowData);
  if (reliable.length < 2) return 'unknown';
  const r = ratePctPerWeek(reliable[reliable.length - 2], reliable[reliable.length - 1]);
  if (r > 0.15) return 'up';
  if (r < -0.15) return 'down';
  return 'flat';
}
