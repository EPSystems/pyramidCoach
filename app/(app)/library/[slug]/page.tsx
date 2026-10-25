import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireOnboarded, loadExercises } from '@/lib/server/context';
import { Why } from '@/components/app/bits';
import { BodyMap } from '@/components/app/body-map';
import { INTENSITY } from '@/lib/knowledge/constants';
import { EXERCISE_SEEDS } from '@/lib/knowledge/exercises';
import { MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { e1rm } from '@/lib/engine/e1rm';
import { substitutionsFor } from '@/lib/engine/selection';
import { fmtLoad } from '@/lib/utils/units';
import { prettyDate } from '@/lib/utils/dates';
import { CATEGORY_LABEL } from '@/lib/knowledge/labels';
import { ExerciseActions } from './actions-ui';

export const metadata: Metadata = { title: 'Exercise' };

export default async function ExercisePage({ params }: PageProps<'/library/[slug]'>) {
  const { slug } = await params;
  const ctx = await requireOnboarded();
  const { supabase, user, units, settings } = ctx;
  const exercises = await loadExercises(supabase);
  const ex = exercises.find((e) => e.slug === slug);
  if (!ex) notFound();
  const { data: row } = await supabase.from('exercises').select('cues, mistakes, owner_user_id').eq('id', ex.id).single();
  const { data: sets } = await supabase.from('logged_sets').select('*').eq('user_id', user.id).eq('exercise_id', ex.id).eq('is_warmup', false).order('performed_on', { ascending: false }).limit(60);
  const seed = EXERCISE_SEEDS.find((s) => s.slug === slug);
  const cues = row?.cues?.length ? row.cues : (seed?.cues ?? []);
  const mistakes = row?.mistakes?.length ? row.mistakes : (seed?.mistakes ?? []);
  const subs = substitutionsFor(ex, { exercises, equipment: settings.equipment as never, injuries: ctx.injuries, disliked: [] });
  const range = INTENSITY[ex.category];
  const byDay = new Map<string, NonNullable<typeof sets>>();
  for (const s of sets ?? []) byDay.set(s.performed_on, [...(byDay.get(s.performed_on) ?? []), s]);
  const best = (sets ?? []).reduce((a, s) => Math.max(a, e1rm(s.load_kg, s.reps, s.rir) ?? 0), 0);
  const primary = ex.muscles.filter((m) => m.role === 'primary');
  const secondary = ex.muscles.filter((m) => m.role === 'secondary');
  const styles = Object.fromEntries(ex.muscles.map((m) => [m.muscle, { fill: m.role === 'primary' ? 'var(--volt)' : 'color-mix(in oklch, var(--volt) 40%, var(--card))', label: m.role }]));
  const disliked = (settings.disliked_exercise_ids as string[]).includes(ex.id);

  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6 lg:px-8">
      <Link href="/library" className="text-muted-foreground inline-flex h-11 items-center gap-1 text-sm">
        <ArrowLeft className="size-4" /> Library
      </Link>
      <div className="rise mt-2 space-y-4">
        <header>
          <p className="stamp text-muted-foreground">{CATEGORY_LABEL[ex.category]}</p>
          <h1 className="font-display mt-1 text-5xl leading-none font-extrabold uppercase">{ex.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {primary.map((m) => (
              <span key={m.muscle} className="bg-volt text-volt-ink rounded-full px-2.5 py-1 text-xs font-semibold">
                {MUSCLE_SHORT[m.muscle]} · 1.0
              </span>
            ))}
            {secondary.map((m) => (
              <span key={m.muscle} className="rounded-full border px-2.5 py-1 text-xs">
                {MUSCLE_SHORT[m.muscle]} · 0.5
              </span>
            ))}
            {ex.longLengthBias && (
              <span className="bg-accent text-accent-foreground rounded-full px-2.5 py-1 text-xs font-semibold">
                Long-length <Why ruleIds={['T-SEL-03']} label="" className="h-5 border-0 px-0" />
              </span>
            )}
            <Why ruleIds={['T-VOL-05']} />
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
          <div className="space-y-4">
            <section className="bg-card rounded-2xl border p-5">
              <h2 className="font-display text-xl font-bold uppercase">Default range</h2>
              <p className="num mt-1 text-lg">
                {range.reps[0]}–{range.reps[1]} reps @ {range.rir[1]}–{range.rir[0]} RIR <Why ruleIds={['T-INT-03']} />
              </p>
              <p className="text-muted-foreground text-sm">Equipment: {ex.equipment.join(' or ')}</p>
            </section>
            {cues.length > 0 && (
              <section className="bg-card rounded-2xl border p-5">
                <h2 className="font-display text-xl font-bold uppercase">Cues</h2>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-[0.95rem]">
                  {cues.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ol>
                <p className="text-muted-foreground mt-3 text-xs">
                  Lower under control (~1–4 s), lift with intent. <Why ruleIds={['T-TMP-01']} />
                </p>
              </section>
            )}
            {mistakes.length > 0 && (
              <section className="bg-card rounded-2xl border p-5">
                <h2 className="font-display text-xl font-bold uppercase">Common mistakes</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.95rem]">
                  {mistakes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </section>
            )}
            {subs.length > 0 && (
              <section className="bg-card rounded-2xl border p-5">
                <h2 className="font-display text-xl font-bold uppercase">Substitutions</h2>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {subs.slice(0, 8).map((s) => (
                    <li key={s.id}>
                      <Link href={`/library/${s.slug}`} className="bg-muted hover:bg-accent inline-flex h-10 items-center rounded-lg px-3 text-sm">
                        {s.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="bg-card rounded-2xl border p-5">
              <h2 className="font-display text-xl font-bold uppercase">Your history</h2>
              {byDay.size === 0 ? (
                <p className="text-muted-foreground mt-1 text-sm">Not logged yet.</p>
              ) : (
                <>
                  <p className="num text-muted-foreground text-sm">Best e1RM: {fmtLoad(best, units)}</p>
                  <ul className="num mt-2 divide-y text-sm">
                    {[...byDay.entries()].slice(0, 10).map(([d, ss]) => (
                      <li key={d} className="flex justify-between gap-3 py-1.5">
                        <span className="whitespace-nowrap">{prettyDate(d)}</span>
                        <span className="text-muted-foreground text-right">
                          {ss
                            .sort((a, b) => a.set_index - b.set_index)
                            .map((s) => `${fmtLoad(s.load_kg, units)}×${s.reps}`)
                            .join(' · ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
          <aside className="space-y-4">
            <div className="bg-card rounded-2xl border p-3">
              <BodyMap side="both" styles={styles} interactive={false} />
            </div>
            <ExerciseActions exerciseId={ex.id} disliked={disliked} custom={!!row?.owner_user_id} />
          </aside>
        </div>
      </div>
    </div>
  );
}
