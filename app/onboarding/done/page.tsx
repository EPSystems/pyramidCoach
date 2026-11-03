import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ArrowRight, TriangleAlert } from 'lucide-react';
import { getUserContext } from '@/lib/server/context';
import { Button } from '@/components/ui/button';
import { BodyMap } from '@/components/app/body-map';
import { Stat, Why } from '@/components/app/bits';
import { mixVolt } from '@/components/app/colors';
import { prettyDate } from '@/lib/utils/dates';
import { fmtNum } from '@/lib/utils/units';
import { MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { SPLITS } from '@/lib/engine/split';
import type { MuscleId } from '@/lib/engine/types';

export const metadata: Metadata = { title: 'Your first week' };

export default async function DonePage() {
  const ctx = await getUserContext();
  if (!ctx.profile?.onboarded_at) redirect('/onboarding');
  const { data: block } = await ctx.supabase.from('blocks').select('*').eq('user_id', ctx.user.id).eq('status', 'active').single();
  if (!block) redirect('/today');
  const [{ data: targets }, { data: sessions }, { data: nt }] = await Promise.all([
    ctx.supabase.from('weekly_targets').select('*').eq('block_id', block.id).eq('week_index', 0),
    ctx.supabase.from('planned_sessions').select('*').eq('block_id', block.id).order('scheduled_on').limit(7),
    ctx.supabase.from('nutrition_targets').select('*').eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const firstWeekIdx = sessions?.[0]?.week_index ?? 0;
  const firstWeek = (sessions ?? []).filter((s) => s.week_index === firstWeekIdx);
  const explanations = (block.explanations as { text: string; ruleIds: string[] }[]) ?? [];
  const warnings = (block.warnings as { message: string; ruleIds: string[] }[]) ?? [];
  const styles = Object.fromEntries(
    (targets ?? []).map((t) => [t.muscle_id, { fill: mixVolt(20 + (Number(t.target_sets) / 20) * 80), label: `${t.target_sets} sets/week` }]),
  );

  return (
    <main className="relative z-10 mx-auto max-w-2xl px-4 pt-8 pb-28 sm:px-6">
      {/* The one place an entrance animation earns its keep: this is the app's first payoff. */}
      <div className="rise space-y-6">
        <div>
          <h1 className="font-display text-5xl leading-none font-extrabold uppercase">
            Your first <span className="text-volt">week</span>
          </h1>
          <p className="text-muted-foreground mt-2">Your plan is ready. Here’s what it looks like, and why.</p>
        </div>

        <section className="bg-card rounded-2xl border p-5">
          <h2 className="text-lg font-semibold">
            {SPLITS[block.split_key]?.name ?? block.split_key} · {firstWeek.length} lifting days
          </h2>
          <ul className="mt-3 space-y-2">
            {firstWeek.map((s) => (
              <li key={s.id} className="border-b pb-2 last:border-0">
                <span className="block font-medium">{s.title}</span>
                <span className="text-muted-foreground block text-sm">
                  {prettyDate(s.scheduled_on)} · about {s.est_minutes} min{s.kind === 'intro' && ' · easier intro week'}
                </span>
              </li>
            ))}
          </ul>
          <ul className="mt-4 space-y-2 text-sm">
            {explanations.map((e, i) => (
              <li key={i} className="flex items-start justify-between gap-2">
                <span className="text-muted-foreground">{e.text}</span>
                <Why ruleIds={e.ruleIds} />
              </li>
            ))}
          </ul>
          {warnings.map((w, i) => (
            <p key={i} className="text-warn mt-3 flex gap-2 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {w.message}
            </p>
          ))}
        </section>

        <section className="bg-card rounded-2xl border p-5">
          <h2 className="text-lg font-semibold">Weekly sets per muscle</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_12rem]">
            <BodyMap side="both" styles={styles} interactive={false} className="max-w-sm" />
            <ul className="num grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-1">
              {(targets ?? []).map((t) => (
                <li key={t.muscle_id} className="flex justify-between">
                  <span>{MUSCLE_SHORT[t.muscle_id as MuscleId]}</span>
                  <span className="font-semibold">
                    {t.target_sets}
                    {Number(t.sport_trim) > 0 && <span className="text-muted-foreground font-normal"> (−{t.sport_trim})</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {nt && (
          <section className="bg-card rounded-2xl border p-5">
            <h2 className="text-lg font-semibold">Daily nutrition targets</h2>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Calories" value={fmtNum(nt.kcal)} sub={`${fmtNum(nt.kcal_low)}–${fmtNum(nt.kcal_high)}`} />
              <Stat label="Protein" value={`${nt.protein_g}g`} sub="at least" />
              <Stat label="Fat" value={`${nt.fat_g}g`} sub={`min ${nt.fat_min_g}g`} />
              <Stat label="Carbs" value={`${nt.carbs_g}g`} sub={`min ${nt.carbs_min_g}g`} />
            </div>
            <p className="text-muted-foreground mt-3 text-sm">
              Includes about {nt.sport_kcal_per_day} kcal a day for sports. The estimate is refined from your weigh-ins. <Why ruleIds={['N-MNT-03', 'N-SPT-03']} />
            </p>
          </section>
        )}

      </div>
      <div className="bar-material pb-safe fixed inset-x-0 bottom-0 z-20 border-t">
        <div className="mx-auto max-w-2xl px-4 py-3 sm:px-6">
          <Button asChild size="lg" className="w-full">
            <Link href="/today">
              Go to Today <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
