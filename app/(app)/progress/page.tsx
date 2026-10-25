import type { Metadata } from 'next';
import { requireOnboarded, loadExercises, mapSet } from '@/lib/server/context';
import { bodyweightSeries } from '@/lib/server/bodyweight';
import { PageHeader, Why } from '@/components/app/bits';
import { AdherenceBars, BodyweightChart, TrendLine, VolumeMini } from '@/components/app/charts';
import { addDays, mondayOf } from '@/lib/engine/util';
import { e1rm } from '@/lib/engine/e1rm';
import { loggedMuscleSets } from '@/lib/engine/counting';
import { TRACKED_MUSCLES, type MainLift, type Status } from '@/lib/engine/types';
import { MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { fmtLoad, toDisplay } from '@/lib/utils/units';
import { ExerciseHistory, type HistoryExercise } from './exercise-history';

export const metadata: Metadata = { title: 'Progress' };

const LIFT_NAMES: Record<MainLift, string> = { squat: 'Squat', bench: 'Bench press', deadlift: 'Deadlift', ohp: 'Overhead press' };

export default async function ProgressPage() {
  const ctx = await requireOnboarded();
  const { supabase, user, today, units, settings } = ctx;
  const since = addDays(today, -180);
  const [exercises, { data: setRows }, { data: sessions }, bw] = await Promise.all([
    loadExercises(supabase),
    supabase.from('logged_sets').select('*').eq('user_id', user.id).gte('performed_on', since).order('performed_on'),
    supabase.from('planned_sessions').select('scheduled_on, status').eq('user_id', user.id).gte('scheduled_on', addDays(mondayOf(today), -7 * 7)).lt('scheduled_on', addDays(mondayOf(today), 7)),
    bodyweightSeries(supabase, user.id, today, units, { status: settings.training_status as Status }),
  ]);
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const sets = (setRows ?? []).map(mapSet).filter((s) => !s.isWarmup);
  const seeds = settings.e1rm_seeds as Partial<Record<MainLift, number>>;

  // Main lifts: best e1RM per day across all variations of that lift.
  const lifts = (Object.keys(LIFT_NAMES) as MainLift[]).map((lift) => {
    const byDay = new Map<string, number>();
    for (const s of sets) {
      const ex = exMap.get(s.exerciseId);
      if (ex?.mainLiftKey !== lift) continue;
      const v = e1rm(s.loadKg, s.reps, s.rir);
      if (v != null) byDay.set(s.performedOn, Math.max(byDay.get(s.performedOn) ?? 0, v));
    }
    const series = [...byDay.entries()].sort().map(([x, y]) => ({ x, y: toDisplay(Math.round(y * 10) / 10, units)! }));
    const baseline = seeds[lift] ?? (series[0] ? series[0].y : null);
    const best = series.length ? Math.max(...series.map((p) => p.y)) : null;
    const latest = series.at(-1)?.y ?? null;
    return { lift, series, baseline: baseline != null ? toDisplay(baseline, units) : null, best, latest };
  });
  const shownLifts = lifts.filter((l) => l.series.length || l.baseline != null);

  // Weekly volume, last 8 weeks.
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(mondayOf(today), -7 * (7 - i)));
  const vol = weeks.map((w) => ({ w, m: loggedMuscleSets(sets, exMap, w) }));
  const { data: block } = await supabase.from('blocks').select('id, starts_on').eq('user_id', user.id).eq('status', 'active').maybeSingle();
  const { data: targets } = block ? await supabase.from('weekly_targets').select('muscle_id, target_sets, week_index').eq('block_id', block.id) : { data: [] };
  const curWeek = block ? Math.max(0, Math.floor((Date.parse(mondayOf(today)) - Date.parse(block.starts_on)) / 604800000)) : 0;
  const maxVol = Math.max(20, ...vol.flatMap((v) => TRACKED_MUSCLES.map((m) => v.m[m])));

  // Adherence.
  const adherence = weeks.map((w) => {
    const inWeek = (sessions ?? []).filter((s) => s.scheduled_on >= w && s.scheduled_on < addDays(w, 7));
    return { week: w, done: inWeek.filter((s) => s.status === 'done').length, planned: inWeek.length };
  });

  // Per-exercise history.
  const history: HistoryExercise[] = [...new Set(sets.map((s) => s.exerciseId))]
    .map((id) => {
      const ex = exMap.get(id);
      const byDay = new Map<string, typeof sets>();
      for (const s of sets.filter((x) => x.exerciseId === id)) byDay.set(s.performedOn, [...(byDay.get(s.performedOn) ?? []), s]);
      const days = [...byDay.entries()].sort(([a], [b]) => (a < b ? 1 : -1));
      return {
        id,
        name: ex?.name ?? 'Exercise',
        rows: days.map(([date, ss]) => {
          const sorted = ss.sort((a, b) => a.setIndex - b.setIndex);
          return { date, text: sorted.map((s) => `${fmtLoad(s.loadKg, units)} × ${s.reps}`).join(' · '), rir: sorted.map((s) => s.rir ?? '–').join(', ') };
        }),
        trend: days
          .map(([date, ss]) => {
            const f = ss.sort((a, b) => a.setIndex - b.setIndex)[0];
            const v = e1rm(f.loadKg, f.reps, f.rir);
            return v ? { x: date, y: toDisplay(Math.round(v * 10) / 10, units)! } : null;
          })
          .filter((x): x is { x: string; y: number } => !!x)
          .reverse(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="Trends" title="Progress" />
      <div className="rise space-y-4 px-4 sm:px-6 lg:px-8">
        <section className="bg-card rounded-2xl border p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-bold uppercase">Main lifts · e1RM</h2>
            <Why ruleIds={['T-STR-01']} label="How?" />
          </div>
          <p className="text-muted-foreground text-xs">Estimated 1-rep max from your best set each day (reps + RIR ≤ 12).</p>
          {shownLifts.length ? (
            <>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                {shownLifts.map((l) => (
                  <div key={l.lift}>
                    <p className="text-sm font-semibold">{LIFT_NAMES[l.lift]}</p>
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
                      <td>{l.baseline ?? '—'}</td>
                      <td>{l.latest ?? '—'}</td>
                      <td>{l.best ?? '—'}</td>
                      <td className={l.latest != null && l.baseline != null && l.latest >= l.baseline ? 'text-ok' : ''}>
                        {l.latest != null && l.baseline != null ? `${l.latest - l.baseline >= 0 ? '+' : ''}${Math.round((l.latest - l.baseline) * 10) / 10}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="text-muted-foreground py-6 text-sm">Log squat, bench, deadlift or OHP sets to see estimates here.</p>
          )}
        </section>

        <ExerciseHistory exercises={history} />

        <section className="bg-card rounded-2xl border p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-bold uppercase">Weekly sets · 8 weeks</h2>
            <Why ruleIds={['T-VOL-05', 'T-VOL-06']} />
          </div>
          <p className="text-muted-foreground text-xs">Same scale (0–{maxVol}) on every panel; shaded band = this block’s target ±1.</p>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
            {TRACKED_MUSCLES.map((m) => {
              const t = targets?.find((x) => x.muscle_id === m && x.week_index === curWeek);
              const thisWeek = vol[vol.length - 1].m[m];
              return (
                <div key={m}>
                  <p className="flex justify-between text-xs">
                    <span className="font-medium">{MUSCLE_SHORT[m]}</span>
                    <span className="num text-muted-foreground">
                      {Math.round(thisWeek * 10) / 10}/{t ? Number(t.target_sets) : '—'}
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
            <p className="text-muted-foreground text-xs">Sessions done vs planned per week</p>
            <div className="mt-3">
              <AdherenceBars data={adherence} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
