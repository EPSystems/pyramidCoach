import Link from 'next/link';
import type { Metadata } from 'next';
import { ChevronRight, Moon, Sparkles, Trophy } from 'lucide-react';
import { requireOnboarded } from '@/lib/server/context';
import { activeBlock, blockWeekIndex, readiness, sessionsBetween, weekRange } from '@/lib/server/queries';
import { Button } from '@/components/ui/button';
import { PageHeader, PyramidMeter, Why } from '@/components/app/bits';
import { CheckinCard } from '@/components/app/checkin-card';
import { formatRx } from '@/lib/engine/prescription';
import { addDays, isoWeekday } from '@/lib/engine/util';
import { kindLabel } from '@/lib/engine/fatigue';
import { prettyDate, weekdayLong } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';
import type { MuscleId } from '@/lib/engine/types';
import { DrainedButton, LogSportDialog, MoveSessionDialog, StartSessionButton } from './actions-ui';

export const metadata: Metadata = { title: 'Today' };

export default async function TodayPage() {
  const ctx = await requireOnboarded();
  const { supabase, user, today } = ctx;
  const week = weekRange(today);
  const [block, { data: checkin }, { data: yesterday }, sessions, { data: proposals }, upcoming] = await Promise.all([
    activeBlock(supabase, user.id),
    supabase.from('checkins').select('*').eq('user_id', user.id).eq('day', today).maybeSingle(),
    supabase.from('checkins').select('sleep_hours').eq('user_id', user.id).lt('day', today).not('sleep_hours', 'is', null).order('day', { ascending: false }).limit(1).maybeSingle(),
    sessionsBetween(supabase, user.id, week.start, addDays(week.end, 7)),
    supabase.from('proposals').select('id,title').eq('user_id', user.id).eq('status', 'pending').order('created_at'),
    supabase.from('planned_sessions').select('id,title,scheduled_on').eq('user_id', user.id).gt('scheduled_on', today).eq('status', 'planned').order('scheduled_on').limit(1),
  ]);
  const todays = sessions.filter((s) => s.scheduled_on === today && s.status !== 'skipped');
  const missed = sessions.filter((s) => s.scheduled_on < today && s.scheduled_on >= week.start && s.status === 'planned');
  const sportsToday = ctx.sports.filter((s) => s.weekdays.includes(isoWeekday(today)));
  const sportsTomorrow = ctx.sports.filter((s) => s.weekdays.includes(isoWeekday(addDays(today, 1))));
  const weekIdx = blockWeekIndex(block, today);
  const ready = readiness(checkin);
  const checkinDone = !!checkin && (checkin.sleep_hours != null || checkin.energy != null);
  const moveDates = Array.from({ length: 6 }, (_, i) => addDays(today, i + 1));
  const nextUp = upcoming.data?.[0];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        kicker={
          block && weekIdx != null && weekIdx >= 0
            ? `${kindLabel(block.kind)} block · week ${Math.min(weekIdx + 1, block.weeks)} of ${block.weeks}`
            : block
              ? `${kindLabel(block.kind)} block starts ${prettyDate(block.starts_on)}`
              : 'No active block'
        }
        title={
          <>
            {weekdayLong(isoWeekday(today))}
            <span className="text-muted-foreground block text-2xl sm:text-3xl">{prettyDate(today, { weekday: false })}</span>
          </>
        }
      >
        {ready && (
          <span
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-semibold',
              ready.tone === 'ok' && 'bg-ok/15 text-ok',
              ready.tone === 'warn' && 'bg-warn/15 text-warn',
              ready.tone === 'danger' && 'bg-danger/15 text-danger',
            )}
          >
            {ready.label}
          </span>
        )}
        {block && weekIdx != null && weekIdx >= 0 && (
          <div className="w-16">
            <PyramidMeter weeks={block.weeks} current={Math.min(weekIdx, block.weeks - 1)} marks={block.intro_week ? { 0: 'intro' } : {}} />
          </div>
        )}
      </PageHeader>

      <div className="rise grid gap-4 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:px-8">
        <div className="space-y-4">
          {/* Today's session */}
          {todays.map((s) => {
            const done = s.status === 'done';
            return (
              <section key={s.id} className="bg-card overflow-hidden rounded-2xl border">
                <div className="knurl flex items-start justify-between gap-3 border-b px-5 py-4">
                  <div className="min-w-0">
                    <p className="stamp text-muted-foreground">
                      {s.kind === 'deload' ? 'Deload' : s.kind === 'intro' ? 'Intro week' : s.kind === 'generated' ? 'Generated' : 'Today’s session'} · ~{s.est_minutes} min
                    </p>
                    <h2 className="font-display mt-1 text-4xl leading-none font-extrabold uppercase">{s.title}</h2>
                  </div>
                  {done && <span className="bg-ok/15 text-ok rounded-full px-3 py-1 text-sm font-semibold">Done</span>}
                </div>
                <ol className="divide-y">
                  {s.planned_exercises.map((e) => (
                    <li key={e.id} className="flex items-baseline justify-between gap-3 px-5 py-2.5">
                      <span className="min-w-0 truncate font-medium">{e.exercises?.name}</span>
                      <span className="num text-muted-foreground shrink-0 text-sm">
                        {e.is_main_lift_single ? (e.note ?? 'Top single') : formatRx({ sets: e.sets, repMin: e.rep_min, repMax: e.rep_max, rirMin: Number(e.rir_min), rirMax: Number(e.rir_max) })}
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="p-4">
                  <StartSessionButton sessionId={s.id} variant={done ? 'outline' : 'default'} label={done ? 'Review session' : s.status === 'in_progress' ? 'Continue session' : 'Start'} />
                </div>
              </section>
            );
          })}

          {/* Sport day */}
          {sportsToday.map((sp) => (
            <section key={sp.sportId} className="bg-card rounded-2xl border p-5">
              <p className="stamp text-muted-foreground">Sport today</p>
              <h2 className="font-display mt-1 text-3xl font-bold uppercase">
                {sp.name} <span className="text-muted-foreground text-xl">· {sp.intensity} · {sp.minutes} min</span>
              </h2>
              {todays.some((t) => ['lower_a', 'lower_b', 'full_a', 'full_b', 'full_c', 'full_push', 'full_pull', 'pyr_cb_qc', 'pyr_arms_gh'].includes(t.template_key)) && sp.lowerBodyLoad >= 2 ? (
                <p className="text-warn mt-2 text-sm">
                  Legs and {sp.name.toLowerCase()} on the same day: lift after the match if you can, or move the session. <Why ruleIds={['T-SCH-03', 'T-SCH-04']} />
                </p>
              ) : (
                <p className="text-muted-foreground mt-2 text-sm">
                  Lifting was scheduled around this. <Why ruleIds={['S-03', 'T-SCH-03']} />
                </p>
              )}
            </section>
          ))}

          {/* Rest day */}
          {todays.length === 0 && (
            <section className="bg-card rounded-2xl border p-5">
              <Moon className="text-volt size-6" />
              <h2 className="font-display mt-2 text-4xl font-extrabold uppercase">{sportsToday.length ? 'No lifting today' : 'Rest day'}</h2>
              {nextUp ? (
                <p className="text-muted-foreground mt-1">
                  Next: <span className="text-foreground font-medium">{nextUp.title}</span> on {prettyDate(nextUp.scheduled_on)}.
                </p>
              ) : (
                <p className="text-muted-foreground mt-1">Nothing scheduled yet.</p>
              )}
              {sportsTomorrow.some((s) => s.intensity === 'match') && <p className="text-muted-foreground mt-2 text-sm">Match tomorrow, so legs stay fresh.</p>}
            </section>
          )}

          {/* Missed sessions (T-FAT-07) */}
          {missed.map((m) => (
            <section key={m.id} className="border-warn/40 bg-warn/5 rounded-2xl border p-4">
              <p className="text-sm">
                Missed <span className="font-semibold">{m.title}</span> on {prettyDate(m.scheduled_on)}. Move it to the next free day. <Why ruleIds={['T-FAT-07']} />
              </p>
              <div className="mt-3">
                <MoveSessionDialog sessionId={m.id} title={m.title} dates={[today, ...moveDates]} triggerLabel="Move missed session" />
              </div>
            </section>
          ))}

          <div className="grid gap-2 sm:grid-cols-2">
            {todays[0] && todays[0].status === 'planned' && <DrainedButton sessionId={todays[0].id} />}
            {todays[0] && todays[0].status === 'planned' && <MoveSessionDialog sessionId={todays[0].id} title={todays[0].title} dates={moveDates} />}
            <Button asChild variant="outline" className="justify-start">
              <Link href="/generate">
                <Sparkles /> Generate a workout
              </Link>
            </Button>
            <LogSportDialog sports={ctx.sports.map((s) => ({ id: s.sportId, name: s.name, minutes: s.minutes }))} defaultSport={sportsToday[0]?.sportId} />
          </div>
        </div>

        <div className="space-y-4">
          {/* Proposals strip */}
          {(proposals?.length ?? 0) > 0 && (
            <Link href="/review" className="bg-accent text-accent-foreground hover:bg-accent/80 flex items-center gap-3 rounded-2xl p-4 transition-colors">
              <Trophy className="size-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="stamp opacity-80">{proposals!.length} proposal{proposals!.length > 1 ? 's' : ''} waiting</p>
                <p className="truncate font-semibold">{proposals![0].title}</p>
              </div>
              <ChevronRight className="size-5" />
            </Link>
          )}

          <section className="bg-card rounded-2xl border p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold uppercase">Morning check-in</h2>
              {checkinDone && <span className="stamp text-ok">Done</span>}
            </div>
            <CheckinCard
              compact
              units={ctx.units}
              hideWeight={!!ctx.profile.hide_bodyweight}
              initial={{
                sleepHours: checkin?.sleep_hours ?? yesterday?.sleep_hours ?? null,
                energy: checkin?.energy ?? null,
                stress: checkin?.stress ?? null,
                soreness: (checkin?.soreness as Partial<Record<MuscleId, 'sore' | 'pain'>>) ?? {},
                bodyweightKg: checkin?.bodyweight_kg ?? null,
              }}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
