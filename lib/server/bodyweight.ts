import 'server-only';
import type { Supa } from '@/lib/supabase/server';
import { NUTRITION } from '@/lib/knowledge/constants';
import { runningAverage, weeklyAverages, trendDirection, ratePctPerWeek, type WeekAverage } from '@/lib/engine/trend';
import { addDays, daysBetween, mondayOf } from '@/lib/engine/util';
import type { Status } from '@/lib/engine/types';
import { bodyweightChangedEnough } from '@/lib/engine/nutrition';
import { latestBodyweight, recomputeNutrition } from './plan';
import { fetchAllPages } from './queries';
import { toDisplay, type Units } from '@/lib/utils/units';
import type { BwPoint } from '@/components/app/charts';
import { createLogger } from '@/lib/log';

const log = createLogger('server/bodyweight');

/** Weigh-in chart data. `days` defaults to 120; `null` means all history (paged past the 1000-row cap). */
export async function bodyweightSeries(supabase: Supa, userId: string, today: string, units: Units, opts: { days?: number | null; status: Status }) {
  const from = opts.days === null ? null : addDays(today, -(opts.days ?? 120));
  const [{ data: rows }, nsRes] = await Promise.all([
    fetchAllPages<{ day: string; bodyweight_kg: number | null }>(
      'select weigh-ins',
      (a, b) => {
        let q = supabase.from('checkins').select('day, bodyweight_kg').eq('user_id', userId).not('bodyweight_kg', 'is', null);
        if (from) q = q.gte('day', from);
        return q.order('day').range(a, b);
      },
      { userId },
    ),
    supabase.from('nutrition_settings').select('*').eq('user_id', userId).maybeSingle(),
  ]);
  const { data: ns } = log.db('select nutrition_settings', nsRes, { userId });
  const ins = rows.map((r) => ({ day: r.day, kg: Number(r.bodyweight_kg) }));
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

/**
 * After a weigh-in: rebase the nutrition targets when the averaged bodyweight they use (mean of the last 7
 * weigh-ins) moved by at least NUTRITION.recomputeOnBodyweightKg. This is a base-target recompute only: it keeps
 * the accepted kcal offset and never touches the N-ADJ-03 cadence (DECISIONS 48). Never throws: the weigh-in is
 * already saved, and a failed refresh only means the targets catch up at the next recompute.
 */
export async function refreshTargetsAfterWeighIn(supabase: Supa, userId: string): Promise<{ refreshed: boolean; kcal?: number }> {
  try {
    const [nsRes, ntRes] = await Promise.all([
      supabase.from('nutrition_settings').select('user_id').eq('user_id', userId).maybeSingle(),
      supabase.from('nutrition_targets').select('bodyweight_kg').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const { data: ns, error: nsErr } = log.db('select nutrition_settings', nsRes, { userId });
    const { data: nt, error: ntErr } = log.db('select latest nutrition_targets.bodyweight_kg', ntRes, { userId });
    if (nsErr || ntErr) return { refreshed: false };
    // No settings yet means onboarding hasn't set a phase; recomputing here would invent one.
    if (!ns) return { refreshed: false };
    const kg = await latestBodyweight(supabase, userId, null);
    const used = nt?.bodyweight_kg == null ? null : Number(nt.bodyweight_kg);
    if (!bodyweightChangedEnough(used, kg)) return { refreshed: false };
    const res = await recomputeNutrition(supabase, userId, 'weigh-in N-WGT-02');
    return { refreshed: true, kcal: res.kcal };
  } catch (e) {
    log.error('refreshTargetsAfterWeighIn failed', { userId, err: e });
    return { refreshed: false };
  }
}
