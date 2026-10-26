import Link from 'next/link';
import type { Metadata } from 'next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { requireOnboarded, loadExercises } from '@/lib/server/context';
import { activeBlock, sessionsBetween } from '@/lib/server/queries';
import { PageHeader, PyramidMeter, Why } from '@/components/app/bits';
import { addDays, daysBetween, isoWeekday, mondayOf } from '@/lib/engine/util';
import { fractionalSets } from '@/lib/engine/counting';
import { isHardIntensity } from '@/lib/engine/sports';
import { kindLabel } from '@/lib/engine/fatigue';
import { TRACKED_MUSCLES, type MuscleId } from '@/lib/engine/types';
import { MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { prettyDate } from '@/lib/utils/dates';
import { WeekBoard, type DayCell } from './week-board';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Week' };

export default async function WeekPage({ searchParams }: PageProps<'/week'>) {
  const sp = await searchParams;
  const offset = Number(sp.w ?? 0) || 0;
  const ctx = await requireOnboarded();
  const { supabase, user, today } = ctx;
  const start = addDays(mondayOf(today), offset * 7);
  const end = addDays(start, 7);
  const [block, sessions, exercises, { data: sportLogs }] = await Promise.all([
    activeBlock(supabase, user.id),
    sessionsBetween(supabase, user.id, start, end),
    loadExercises(supabase),
    supabase.from('sport_logs').select('*, sports(name)').eq('user_id', user.id).gte('performed_on', start).lt('performed_on', end),
  ]);
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const weekIdx = block ? Math.floor(daysBetween(block.starts_on, start) / 7) : null;
  const { data: targets } =
    block && weekIdx != null && weekIdx >= 0 && weekIdx < block.weeks
      ? await supabase.from('weekly_targets').select('*').eq('block_id', block.id).eq('week_index', weekIdx)
      : { data: [] as { muscle_id: string; target_sets: number; sport_trim: number }[] };

  const days: DayCell[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const wd = isoWeekday(date);
    return {
      date,
      isToday: date === today,
      isPast: date < today,
      sessions: sessions
        .filter((s) => s.scheduled_on === date)
        .map((s) => ({ id: s.id, title: s.title, status: s.status, kind: s.kind, est: s.est_minutes, templateKey: s.template_key, exercises: s.planned_exercises.length })),
      sports: ctx.sports.filter((s) => s.weekdays.includes(wd)).map((s) => ({ name: s.name, intensity: s.intensity, minutes: s.minutes })),
      sportLogs: (sportLogs ?? []).filter((l) => l.performed_on === date).map((l) => ({ name: (l.sports as { name: string } | null)?.name ?? 'Sport', minutes: l.minutes, rpe: l.session_rpe })),
    };
  });

  const planned: Partial<Record<MuscleId, number>> = {};
  for (const s of sessions) {
    if (s.status === 'skipped') continue;
    for (const pe of s.planned_exercises) {
      if (pe.is_main_lift_single || pe.skipped) continue;
      const ex = exMap.get(pe.exercise_id);
      if (!ex) continue;
      for (const [m, v] of Object.entries(fractionalSets(ex, pe.sets))) planned[m as MuscleId] = (planned[m as MuscleId] ?? 0) + (v ?? 0);
    }
  }
  const liftCount = sessions.filter((s) => s.status !== 'skipped').length;
  const hardSport = ctx.sports.filter((s) => isHardIntensity(s.intensity)).reduce((a, s) => a + s.weekdays.length, 0);
  const trims = (targets ?? []).filter((t) => Number(t.sport_trim) > 0);
  const sportNames = ctx.sports.filter((s) => isHardIntensity(s.intensity)).map((s) => s.name.split(' ')[0].toLowerCase());
  const maxBar = Math.max(20, ...Object.values(planned).map((v) => v ?? 0));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker={block ? `${kindLabel(block.kind)} block${weekIdx != null && weekIdx >= 0 && weekIdx < block.weeks ? ` · week ${weekIdx + 1} of ${block.weeks}` : ''}` : 'Week'} title="Week">
        <div className="flex items-center gap-1">
          <Link href={`/week?w=${offset - 1}`} className="bg-muted grid size-11 place-items-center rounded-lg" aria-label="Previous week">
            <ChevronLeft className="size-5" />
          </Link>
          <Link href="/week" className={cn('bg-muted grid h-11 place-items-center rounded-lg px-3 text-sm font-medium', offset === 0 && 'bg-accent text-accent-foreground')}>
            {prettyDate(start, { weekday: false })} – {prettyDate(addDays(start, 6), { weekday: false })}
          </Link>
          <Link href={`/week?w=${offset + 1}`} className="bg-muted grid size-11 place-items-center rounded-lg" aria-label="Next week">
            <ChevronRight className="size-5" />
          </Link>
        </div>
      </PageHeader>

      <div className="rise space-y-4 px-4 sm:px-6 lg:px-8">
        <WeekBoard days={days} today={today} />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section className="bg-card rounded-2xl border p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-bold uppercase">Sets per muscle</h2>
              <Why ruleIds={['T-VOL-02', 'T-VOL-05', 'S-02']} />
            </div>
            <p className="text-muted-foreground text-sm">Planned this week vs target band</p>
            <ul className="mt-3 space-y-2">
              {TRACKED_MUSCLES.map((m) => {
                const t = targets?.find((x) => x.muscle_id === m);
                const target = t ? Number(t.target_sets) : null;
                const v = planned[m] ?? 0;
                return (
                  <li key={m} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2 text-sm">
                    <span className="truncate">{MUSCLE_SHORT[m]}</span>
                    <div className="bg-muted relative h-3 overflow-hidden rounded-full">
                      {target != null && <div className="bg-volt/20 absolute inset-y-0" style={{ left: `${((target - 1) / maxBar) * 100}%`, width: `${(2 / maxBar) * 100}%` }} />}
                      <div className={cn('h-full rounded-full', target != null && v > target + 1 ? 'bg-warn' : 'bg-volt')} style={{ width: `${Math.min(100, (v / maxBar) * 100)}%` }} />
                    </div>
                    <span className="num text-right font-semibold">
                      {Math.round(v * 10) / 10}
                      <span className="text-muted-foreground font-normal">/{target ?? '-'}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="space-y-4">
            <section className="bg-card rounded-2xl border p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-2xl font-bold uppercase">Weekly load</h2>
                <Why ruleIds={['S-01']} />
              </div>
              <p className="font-display num mt-2 text-5xl font-extrabold">
                {liftCount + hardSport}
                <span className="text-muted-foreground text-xl font-semibold"> hard sessions</span>
              </p>
              <p className="text-muted-foreground text-sm">
                {liftCount} lifting + {hardSport} sport
              </p>
              {trims.length > 0 && (
                <p className="mt-3 text-sm">
                  Sport trims this week:{' '}
                  <span className="text-muted-foreground">
                    {trims.map((t) => `−${Number(t.sport_trim)} ${MUSCLE_SHORT[t.muscle_id as MuscleId].toLowerCase()}`).join(', ')} ({sportNames.join(', ')})
                  </span>
                </p>
              )}
            </section>

            {block && (
              <section className="bg-card rounded-2xl border p-5">
                <h2 className="font-display text-2xl font-bold uppercase">Block</h2>
                <div className="mt-3 flex items-end gap-5">
                  <div className="w-28">
                    <PyramidMeter weeks={block.weeks} current={Math.max(0, Math.min(block.weeks - 1, weekIdx ?? 0))} marks={block.intro_week ? { 0: 'intro' } : {}} />
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold">{kindLabel(block.kind)}</p>
                    <p className="text-muted-foreground">
                      {prettyDate(block.starts_on)} → {prettyDate(addDays(block.starts_on, block.weeks * 7 - 1))}
                    </p>
                    {block.intro_week && <p className="text-volt">Week 1 is an intro week</p>}
                    <p className="text-muted-foreground mt-1 text-xs">Deloads come only when your weekly review asks for one.</p>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
