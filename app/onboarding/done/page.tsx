import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { getUserContext } from '@/lib/server/context';
import { Button } from '@/components/ui/button';
import { BodyMap } from '@/components/app/body-map';
import { Why } from '@/components/app/bits';
import { mixVolt } from '@/components/app/colors';
import { prettyDate } from '@/lib/utils/dates';
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
    <main className="relative z-10 mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="rise space-y-6">
        <div>
          <p className="stamp text-muted-foreground">Plan ready</p>
          <h1 className="font-display mt-1 text-5xl leading-none font-extrabold uppercase">
            Your first <span className="text-volt">week</span>
          </h1>
        </div>

        <section className="bg-card rounded-2xl border p-5">
          <h2 className="font-display text-2xl font-bold uppercase">
            {SPLITS[block.split_key]?.name ?? block.split_key} · {firstWeek.length} lifting days
          </h2>
          <ul className="mt-3 space-y-2">
            {firstWeek.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-3 border-b border-dashed pb-2 last:border-0">
                <span className="font-medium">{prettyDate(s.scheduled_on)}</span>
                <span className="text-muted-foreground flex-1 truncate text-right text-sm">
                  {s.title} · ~{s.est_minutes} min {s.kind === 'intro' && <span className="stamp text-volt ml-1">intro</span>}
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
            <p key={i} className="text-warn mt-3 text-sm">
              ⚠ {w.message}
            </p>
          ))}
        </section>

        <section className="bg-card rounded-2xl border p-5">
          <h2 className="font-display text-2xl font-bold uppercase">Weekly sets per muscle</h2>
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
            <h2 className="font-display text-2xl font-bold uppercase">Daily nutrition targets</h2>
            <div className="num mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="stamp text-muted-foreground">Calories</p>
                <p className="font-display text-3xl font-bold">{nt.kcal}</p>
                <p className="text-muted-foreground text-xs">
                  {nt.kcal_low}–{nt.kcal_high}
                </p>
              </div>
              <div>
                <p className="stamp text-muted-foreground">Protein</p>
                <p className="font-display text-3xl font-bold">{nt.protein_g}g</p>
                <p className="text-muted-foreground text-xs">at least</p>
              </div>
              <div>
                <p className="stamp text-muted-foreground">Fat</p>
                <p className="font-display text-3xl font-bold">{nt.fat_g}g</p>
                <p className="text-muted-foreground text-xs">min {nt.fat_min_g}g</p>
              </div>
              <div>
                <p className="stamp text-muted-foreground">Carbs</p>
                <p className="font-display text-3xl font-bold">{nt.carbs_g}g</p>
                <p className="text-muted-foreground text-xs">min {nt.carbs_min_g}g</p>
              </div>
            </div>
            <p className="text-muted-foreground mt-3 text-xs">
              Includes ~{nt.sport_kcal_per_day} kcal/day for sports. The estimate is refined from your weigh-ins. <Why ruleIds={['N-MNT-03', 'N-SPT-03']} />
            </p>
          </section>
        )}

        <Button asChild size="lg" className="w-full">
          <Link href="/today">
            Start <ArrowRight />
          </Link>
        </Button>
      </div>
    </main>
  );
}
