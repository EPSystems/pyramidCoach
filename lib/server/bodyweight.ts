import 'server-only';
import type { Supa } from '@/lib/supabase/server';
import { NUTRITION } from '@/lib/knowledge/constants';
import { runningAverage, weeklyAverages, trendDirection, ratePctPerWeek, type WeekAverage } from '@/lib/engine/trend';
import { addDays, daysBetween, mondayOf } from '@/lib/engine/util';
import type { Status } from '@/lib/engine/types';
import { toDisplay, type Units } from '@/lib/utils/units';
import type { BwPoint } from '@/components/app/charts';

export async function bodyweightSeries(supabase: Supa, userId: string, today: string, units: Units, opts: { days?: number; status: Status }) {
  const from = addDays(today, -(opts.days ?? 120));
  const [{ data: rows }, { data: ns }] = await Promise.all([
    supabase.from('checkins').select('day, bodyweight_kg').eq('user_id', userId).gte('day', from).not('bodyweight_kg', 'is', null).order('day'),
    supabase.from('nutrition_settings').select('*').eq('user_id', userId).maybeSingle(),
  ]);
  const ins = (rows ?? []).map((r) => ({ day: r.day, kg: Number(r.bodyweight_kg) }));
  const weeks = weeklyAverages(ins);
  const running = runningAverage(ins, NUTRITION.weighIns.runningAvgDays[0]);

  // Target-rate corridor from the phase start (7.6).
  let band: [number, number] = [-NUTRITION.adjust.maintainDriftPctPerWeek, NUTRITION.adjust.maintainDriftPctPerWeek];
  if (ns?.phase === 'loss') {
    const t = Math.abs(Number(ns.target_rate_pct));
    band = [-(t + NUTRITION.lossRatePctPerWeek.tolerance), -(t - NUTRITION.lossRatePctPerWeek.tolerance)];
  } else if (ns?.phase === 'gain') {
    const [lo, hi] = NUTRITION.gainRatePctPerMonth[opts.status];
    band = [lo / 4, hi / 4];
  }
  const phaseStart = ns ? mondayOf(ns.phase_started_on) : null;
  const anchor = phaseStart ? weeks.find((w) => w.weekStart >= phaseStart) : undefined;

  const d = (kg: number | null | undefined) => (kg == null ? null : toDisplay(kg, units));
  const byDay = new Map<string, BwPoint>();
  for (const i of ins) byDay.set(i.day, { day: i.day, kg: d(i.kg) });
  for (const r of running) byDay.set(r.day, { ...byDay.get(r.day)!, running: d(r.avg) });
  for (const w of weeks) {
    const mid = addDays(w.weekStart, 3);
    byDay.set(mid, { ...(byDay.get(mid) ?? { day: mid }), weekly: w.lowData ? null : d(w.avg) });
  }
  const points = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  if (anchor) {
    for (const p of points) {
      if (p.day < anchor.weekStart) continue;
      const wk = daysBetween(anchor.weekStart, p.day) / 7;
      const lo = anchor.avg * (1 + (band[0] * wk) / 100);
      const hi = anchor.avg * (1 + (band[1] * wk) / 100);
      p.corridor = [d(lo)!, d(hi)!];
    }
  }
  const reliable = weeks.filter((w) => !w.lowData);
  const lastRate = reliable.length >= 2 ? ratePctPerWeek(reliable[reliable.length - 2], reliable[reliable.length - 1]) : null;
  return { points, weeks, direction: trendDirection(weeks), lastRate, settings: ns, latest: ins[ins.length - 1] ?? null };
}

export type WeekAvg = WeekAverage;
