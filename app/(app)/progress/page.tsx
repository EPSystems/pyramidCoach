import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { requireOnboarded } from '@/lib/server/context';
import { bodyweightSeries } from '@/lib/server/bodyweight';
import { loadProgressData, VOLUME_WEEKS } from '@/lib/server/progress';
import { PageHeader, Why } from '@/components/app/bits';
import { AdherenceBars, BodyweightChart, TrendLine, VolumeMini } from '@/components/app/charts';
import { Button } from '@/components/ui/button';
import { addDays, daysBetween, mondayOf } from '@/lib/engine/util';
import { loggedMuscleSets } from '@/lib/engine/counting';
import { adherenceBuckets, exerciseTrend, liftStallFlags, mainLiftSeries, parseRange, PROGRESS_RANGES, rangeStart, type Point, type ProgressRange } from '@/lib/engine/progress';
import { TRACKED_MUSCLES, type MainLift, type Status } from '@/lib/engine/types';
import { MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { fmtLoad, toDisplay } from '@/lib/utils/units';
import { prettyDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';
import { ExerciseHistory, type HistoryExercise } from './exercise-history';

export const metadata: Metadata = { title: 'Progress' };

const LIFT_NAMES: Record<MainLift, string> = { squat: 'Squat', bench: 'Bench press', deadlift: 'Deadlift', ohp: 'Overhead press' };
const RANGE_LABEL: Record<ProgressRange, string> = { '3m': '3 months', '6m': '6 months', '1y': '1 year', all: 'All time' };
const RANGE_SHORT: Record<ProgressRange, string> = { '3m': '3M', '6m': '6M', '1y': '1Y', all: 'All' };
const EXPORTS = [
  { type: 'sets', label: 'Logged sets' },
  { type: 'weighins', label: 'Weigh-ins' },
  { type: 'checkins', label: 'Check-ins' },
  { type: 'nutrition', label: 'Nutrition targets' },
] as const;

export default async function ProgressPage({ searchParams }: PageProps<'/progress'>) {
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const ctx = await requireOnboarded();
  const { supabase, user, today, units, settings } = ctx;
  const status = settings.training_status as Status;
  const start = rangeStart(today, range);
  const [data, bw] = await Promise.all([
    loadProgressData(supabase, user.id, today, range),
    bodyweightSeries(supabase, user.id, today, units, { days: start ? daysBetween(start, today) : null, status }),
  ]);
  const { exercises, sets: allSets, from } = data;
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  // Sets inside the chosen range; stall flags use the full (≥ 26-week) fetch so they don't depend on the range.
  const sets = from ? allSets.filter((s) => s.performedOn >= from) : allSets;
  const seeds = settings.e1rm_seeds as Partial<Record<MainLift, number>>;
  const disp = (kg: number) => toDisplay(Math.round(kg * 10) / 10, units)!;
  const toDisp = (pts: Point[]) => pts.map((p) => ({ x: p.x, y: disp(p.y) }));

  // Main lifts: best e1RM per day across all variations of that lift (T-EST-01).
  const liftKeys = Object.keys(LIFT_NAMES) as MainLift[];
  const fullSeries = Object.fromEntries(liftKeys.map((l) => [l, mainLiftSeries(allSets, exMap, l)])) as Record<MainLift, Point[]>;
  const stalls = new Map(liftStallFlags(fullSeries, status, today).map((f) => [f.lift, f]));
  const lifts = liftKeys.map((lift) => {
    const series = toDisp(from ? fullSeries[lift].filter((p) => p.x >= from) : fullSeries[lift]);
    const baseline = seeds[lift] != null ? toDisplay(seeds[lift]!, units) : (series[0]?.y ?? null);
    const best = series.length ? Math.max(...series.map((p) => p.y)) : null;
    const latest = series.at(-1)?.y ?? null;
    return { lift, series, baseline, best, latest, stall: stalls.get(lift) };
  });
  const shownLifts = lifts.filter((l) => l.series.length || l.baseline != null);

  // Weekly volume, last 8 weeks (independent of the range).
  const weeks = Array.from({ length: VOLUME_WEEKS }, (_, i) => addDays(mondayOf(today), -7 * (VOLUME_WEEKS - 1 - i)));
  const vol = weeks.map((w) => ({ w, m: loggedMuscleSets(allSets, exMap, w) }));
  const maxVol = Math.max(20, ...vol.flatMap((v) => TRACKED_MUSCLES.map((m) => v.m[m])));

  // Adherence: weekly for 3 months, monthly beyond.
  const bucket = range === '3m' ? 'week' : 'month';
  const adherence = adherenceBuckets(data.sessions, data.adherenceFrom, today, bucket);

  // Per-exercise history.
  const history: HistoryExercise[] = [...new Set(sets.map((s) => s.exerciseId))]
    .map((id) => {
      const mine = sets.filter((x) => x.exerciseId === id);
      const byDay = new Map<string, typeof sets>();
      for (const s of mine) byDay.set(s.performedOn, [...(byDay.get(s.performedOn) ?? []), s]);
      const days = [...byDay.entries()].sort(([a], [b]) => (a < b ? 1 : -1));
      const trend = exerciseTrend(mine);
      return {
        id,
        name: exMap.get(id)?.name ?? 'Exercise',
        rows: days.map(([date, ss]) => {
          const sorted = [...ss].sort((a, b) => a.setIndex - b.setIndex);
          return { date, text: sorted.map((s) => `${fmtLoad(s.loadKg, units)} × ${s.reps}`).join(' · '), rir: sorted.map((s) => s.rir ?? '–').join(', ') };
        }),
        metric: trend.metric,
        trend: trend.metric === 'reps' ? trend.points : toDisp(trend.points),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="Trends" title="Progress">
        <nav aria-label="History range" className="bg-muted/70 flex gap-1 rounded-xl p-1">
          {PROGRESS_RANGES.map((r) => (
            <Link
              key={r}
              href={`/progress?range=${r}`}
              aria-current={r === range ? 'page' : undefined}
              aria-label={RANGE_LABEL[r]}
              className={cn('num flex h-11 min-w-12 items-center justify-center rounded-lg px-3 text-sm font-semibold', r === range ? 'bg-volt text-volt-ink shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {RANGE_SHORT[r]}
            </Link>
          ))}
        </nav>
      </PageHeader>
      <div className="rise space-y-4 px-4 sm:px-6 lg:px-8">
        <section className="bg-card rounded-2xl border p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-bold uppercase">Main lifts · e1RM</h2>
            <Why ruleIds={['T-EST-01']} label="How?" />
          </div>
          <p className="text-muted-foreground text-xs">
            Estimated 1-rep max from your best set each day (reps + RIR ≤ 12) · {RANGE_LABEL[range].toLowerCase()}.
          </p>
          {shownLifts.length ? (
            <>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                {shownLifts.map((l) => (
                  <div key={l.lift}>
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {LIFT_NAMES[l.lift]}
                      {l.stall?.stalled && (
                        <span className="bg-warn/15 text-warn rounded-full px-2 py-0.5 text-xs font-medium">
                          Stalled{l.stall.lastPrOn ? ` · best ${prettyDate(l.stall.lastPrOn, { weekday: false })}` : ''}
                        </span>
                      )}
                    </p>
                    <TrendLine data={l.series} unit={units} baseline={l.baseline} label={`${LIFT_NAMES[l.lift]} e1RM`} />
                  </div>
                ))}
              </div>
              <table className="num mt-4 w-full text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr>
                    <th className="py-1 font-medium">Lift</th>
                    <th className="font-medium">Baseline</th>
                    <th className="font-medium">Latest</th>
                    <th className="font-medium">Best</th>
                    <th className="font-medium">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {shownLifts.map((l) => (
                    <tr key={l.lift}>
                      <td className="py-1.5">{LIFT_NAMES[l.lift]}</td>
                      <td>{l.baseline ?? '-'}</td>
                      <td>{l.latest ?? '-'}</td>
                      <td>{l.best ?? '-'}</td>
                      <td className={l.latest != null && l.baseline != null && l.latest >= l.baseline ? 'text-ok' : ''}>
                        {l.latest != null && l.baseline != null ? `${l.latest - l.baseline >= 0 ? '+' : ''}${Math.round((l.latest - l.baseline) * 10) / 10}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shownLifts.some((l) => l.stall?.stalled) && (
                <p className="text-muted-foreground mt-3 text-xs">
                  Stalled = no new best for longer than expected for a {status} lifter (same test as the weekly review, which suggests what to do). <Why ruleIds={['T-PRG-06']} />
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground py-6 text-sm">Log squat, bench, deadlift or OHP sets to see estimates here.</p>
          )}
        </section>

        <ExerciseHistory exercises={history} unit={units} />

        <section className="bg-card rounded-2xl border p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-bold uppercase">Weekly sets · {VOLUME_WEEKS} weeks</h2>
            <Why ruleIds={['T-VOL-05', 'T-VOL-06']} />
          </div>
          <p className="text-muted-foreground text-xs">Same scale (0–{maxVol}) on every panel; shaded band = this block’s target ±1.</p>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
            {TRACKED_MUSCLES.map((m) => {
              const t = data.targets.find((x) => x.muscle_id === m && x.week_index === data.blockWeek);
              const thisWeek = vol[vol.length - 1].m[m];
              return (
                <div key={m}>
                  <p className="flex justify-between text-xs">
                    <span className="font-medium">{MUSCLE_SHORT[m]}</span>
                    <span className="num text-muted-foreground">
                      {Math.round(thisWeek * 10) / 10}/{t ? Number(t.target_sets) : '-'}
                    </span>
                  </p>
                  <VolumeMini data={vol.map((v) => ({ week: v.w, sets: Math.round(v.m[m] * 10) / 10 }))} target={t ? Number(t.target_sets) : null} max={maxVol} label={MUSCLE_SHORT[m]} />
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="bg-card rounded-2xl border p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-bold uppercase">Bodyweight</h2>
              <Why ruleIds={['N-WGT-01', 'N-WGT-02', 'N-WGT-03']} />
            </div>
            {ctx.profile.hide_bodyweight ? (
              <p className="mt-2 text-sm">
                Trend: <span className="font-semibold capitalize">{bw.direction}</span> <span className="text-muted-foreground">(numbers hidden in Settings)</span>
              </p>
            ) : null}
            <div className="mt-3">
              <BodyweightChart data={bw.points} unit={units} hideNumbers={!!ctx.profile.hide_bodyweight} />
            </div>
          </section>
          <section className="bg-card rounded-2xl border p-5">
            <h2 className="font-display text-2xl font-bold uppercase">Adherence</h2>
            <p className="text-muted-foreground text-xs">Sessions done vs planned per {bucket}</p>
            <div className="mt-3">
              <AdherenceBars data={adherence} bucket={bucket} />
            </div>
          </section>
        </div>

        <section className="bg-card rounded-2xl border p-5">
          <h2 className="font-display text-2xl font-bold uppercase">Your data</h2>
          <p className="text-muted-foreground text-xs">Full history, whatever range is shown above.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXPORTS.map((e) => (
              <Button key={e.type} asChild variant="outline">
                <a href={`/api/export?format=csv&type=${e.type}`}>
                  <Download /> {e.label} (CSV)
                </a>
              </Button>
            ))}
            <Button asChild variant="outline">
              <a href="/api/export?format=json">
                <Download /> Everything (JSON)
              </a>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
