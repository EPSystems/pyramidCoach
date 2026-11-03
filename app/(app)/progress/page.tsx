import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOnboarded } from '@/lib/server/context';
import { bodyweightSeries } from '@/lib/server/bodyweight';
import { loadProgressData, VOLUME_WEEKS } from '@/lib/server/progress';
import { PageHeader, Why } from '@/components/app/bits';
import { AdherenceBars, BodyweightChart, TrendLine, VolumeMini } from '@/components/app/charts';
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
  const thisWeek = vol[vol.length - 1].m;
  const targetOf = (m: (typeof TRACKED_MUSCLES)[number]) => data.targets.find((x) => x.muscle_id === m && x.week_index === data.blockWeek);
  const onTarget = TRACKED_MUSCLES.filter((m) => {
    const t = targetOf(m);
    return t && Math.abs(thisWeek[m] - Number(t.target_sets)) <= 1;
  }).length;

  // Adherence: weekly for 3 months, monthly beyond.
  const bucket = range === '3m' ? 'week' : 'month';
  const adherence = adherenceBuckets(data.sessions, data.adherenceFrom, today, bucket);
  const sessionsDone = adherence.reduce((n, a) => n + a.done, 0);
  const sessionsPlanned = adherence.reduce((n, a) => n + a.planned, 0);

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
      <PageHeader title="Progress" />
      <nav aria-label="History range" className="bg-muted/70 mx-4 mb-4 flex gap-1 rounded-xl p-1 sm:mx-6 sm:max-w-sm lg:mx-8">
        {PROGRESS_RANGES.map((r) => (
          <Link
            key={r}
            href={`/progress?range=${r}`}
            aria-current={r === range ? 'page' : undefined}
            aria-label={RANGE_LABEL[r]}
            className={cn('num flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg px-3 text-sm font-semibold', r === range ? 'bg-volt text-volt-ink shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {RANGE_SHORT[r]}
          </Link>
        ))}
      </nav>
      <div className="space-y-4 px-4 sm:px-6 lg:px-8">
        <section>
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <h2 className="text-lg font-semibold">Main lifts</h2>
            <Why ruleIds={['T-EST-01']} label="How?" />
          </div>
          {shownLifts.length ? (
            <ul className="grid gap-4 md:grid-cols-2">
              {shownLifts.map((l) => {
                const change = l.latest != null && l.baseline != null ? Math.round((l.latest - l.baseline) * 10) / 10 : null;
                return (
                  <li key={l.lift} className="bg-card rounded-2xl border p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold">{LIFT_NAMES[l.lift]}</h3>
                        <p className="text-muted-foreground text-sm">Estimated 1-rep max</p>
                        {l.stall?.stalled && (
                          <p className="text-warn mt-1 text-sm font-medium">
                            Stalled{l.stall.lastPrOn ? ` since ${prettyDate(l.stall.lastPrOn, { weekday: false })}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-display num text-4xl leading-none font-bold">
                          {l.latest ?? '-'} <span className="text-muted-foreground font-sans text-sm font-normal">{units}</span>
                        </p>
                        {change != null && (
                          <p className={cn('num mt-1 text-sm', change > 0 ? 'text-ok' : 'text-muted-foreground')}>
                            {change > 0 ? '+' : ''}
                            {change} {units} since start
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2">
                      <TrendLine data={l.series} unit={units} baseline={l.baseline} label={`${LIFT_NAMES[l.lift]} estimated 1-rep max`} />
                    </div>
                    {l.best != null && <p className="num text-muted-foreground mt-1 text-sm">Best in this range: {l.best} {units}</p>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="bg-card text-muted-foreground rounded-2xl border p-5 text-sm">Log squat, bench, deadlift or overhead press to see your estimated 1-rep max here.</p>
          )}
          {shownLifts.some((l) => l.stall?.stalled) && (
            <p className="text-muted-foreground mt-2 px-1 text-sm">
              Stalled means no new best for longer than expected for a {status} lifter. The weekly review suggests what to do. <Why ruleIds={['T-PRG-06']} />
            </p>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="bg-card rounded-2xl border p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Bodyweight</h2>
              <Why ruleIds={['N-WGT-01', 'N-WGT-02', 'N-WGT-03']} />
            </div>
            {ctx.profile.hide_bodyweight && (
              <p className="text-muted-foreground text-sm">
                Trend: <span className="text-foreground font-medium capitalize">{bw.direction}</span>. Numbers are hidden in Settings.
              </p>
            )}
            <div className="mt-3">
              <BodyweightChart data={bw.points} unit={units} hideNumbers={!!ctx.profile.hide_bodyweight} />
            </div>
          </section>
          <section className="bg-card rounded-2xl border p-5">
            <h2 className="text-lg font-semibold">Sessions</h2>
            <p className="text-muted-foreground text-sm">
              {sessionsPlanned ? (
                <>
                  <span className="num text-foreground font-medium">
                    {sessionsDone} of {sessionsPlanned}
                  </span>{' '}
                  planned sessions done · {RANGE_LABEL[range].toLowerCase()}
                </>
              ) : (
                'No sessions planned in this range.'
              )}
            </p>
            <div className="mt-3">
              <AdherenceBars data={adherence} bucket={bucket} />
            </div>
          </section>
        </div>

        <section className="bg-card rounded-2xl border p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Weekly sets</h2>
            <Why ruleIds={['T-VOL-05', 'T-VOL-06']} />
          </div>
          <p className="text-muted-foreground text-sm">
            <span className="num text-foreground font-medium">
              {onTarget} of {TRACKED_MUSCLES.length}
            </span>{' '}
            muscles on target this week. The last {VOLUME_WEEKS} weeks are shown; the shaded band is the target.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
            {TRACKED_MUSCLES.map((m) => {
              const t = targetOf(m);
              return (
                <div key={m}>
                  <p className="flex justify-between gap-2 text-sm">
                    <span className="font-medium">{MUSCLE_SHORT[m]}</span>
                    <span className="num text-muted-foreground">
                      {Math.round(thisWeek[m] * 10) / 10}
                      {t ? ` of ${Number(t.target_sets)}` : ''}
                    </span>
                  </p>
                  <VolumeMini data={vol.map((v) => ({ week: v.w, sets: Math.round(v.m[m] * 10) / 10 }))} target={t ? Number(t.target_sets) : null} max={maxVol} label={MUSCLE_SHORT[m]} />
                </div>
              );
            })}
          </div>
        </section>

        <ExerciseHistory exercises={history} unit={units} />

        <Link href="/settings#data" className="text-muted-foreground hover:text-foreground flex h-11 items-center justify-center text-sm underline-offset-4 hover:underline">
          Export your data in Settings
        </Link>
      </div>
    </div>
  );
}
