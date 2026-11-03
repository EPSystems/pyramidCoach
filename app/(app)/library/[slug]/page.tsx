import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { requireOnboarded, loadExercises } from '@/lib/server/context';
import { Group, PageHeader } from '@/components/app/bits';
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
import { CustomExerciseDialog, type ExerciseDraft } from '../exercise-form';

export const metadata: Metadata = { title: 'Exercise' };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-2">
      <dt className="text-muted-foreground text-[0.95rem]">{label}</dt>
      <dd className="num text-right text-[0.95rem] font-medium">{children}</dd>
    </div>
  );
}

export default async function ExercisePage({ params }: PageProps<'/library/[slug]'>) {
  const { slug } = await params;
  const ctx = await requireOnboarded();
  const { supabase, user, units, settings } = ctx;
  const exercises = await loadExercises(supabase);
  const ex = exercises.find((e) => e.slug === slug);
  if (!ex) notFound();
  const { data: row } = await supabase.from('exercises').select('cues, mistakes, owner_user_id, default_increment_kg').eq('id', ex.id).single();
  const { data: sets } = await supabase.from('logged_sets').select('*').eq('user_id', user.id).eq('exercise_id', ex.id).eq('is_warmup', false).order('performed_on', { ascending: false }).limit(60);
  const seed = EXERCISE_SEEDS.find((s) => s.slug === slug);
  const cues = row?.cues?.length ? row.cues : (seed?.cues ?? []);
  const mistakes = row?.mistakes?.length ? row.mistakes : (seed?.mistakes ?? []);
  const dislikedIds = settings.disliked_exercise_ids as string[];
  const subs = substitutionsFor(ex, { exercises, equipment: settings.equipment as never, injuries: ctx.injuries, disliked: dislikedIds });
  const range = INTENSITY[ex.category];
  const byDay = new Map<string, NonNullable<typeof sets>>();
  for (const s of sets ?? []) byDay.set(s.performed_on, [...(byDay.get(s.performed_on) ?? []), s]);
  const best = (sets ?? []).reduce((a, s) => Math.max(a, e1rm(s.load_kg, s.reps, s.rir) ?? 0), 0);
  const primary = ex.muscles.filter((m) => m.role === 'primary');
  const secondary = ex.muscles.filter((m) => m.role === 'secondary');
  const styles = Object.fromEntries(ex.muscles.map((m) => [m.muscle, { fill: m.role === 'primary' ? 'var(--volt)' : 'color-mix(in oklch, var(--volt) 40%, var(--card))', label: m.role }]));
  const disliked = dislikedIds.includes(ex.id);
  const custom = !!row?.owner_user_id;
  const draft: ExerciseDraft | null = custom
    ? {
        name: ex.name,
        pattern: ex.pattern,
        category: ex.category,
        equipment: ex.equipment,
        primary: primary.map((m) => m.muscle),
        secondary: secondary.map((m) => m.muscle),
        long: ex.longLengthBias,
        axial: ex.axialLoad,
        impact: ex.impactLowerBody,
        unilateral: ex.unilateral,
        increment: row?.default_increment_kg != null ? String(row.default_increment_kg) : '',
        main: ex.mainLiftKey ?? null,
        cues: cues.join('\n'),
        mistakes: mistakes.join('\n'),
        substitutions: ex.substitutions,
      }
    : null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader back={{ href: '/library', label: 'Library' }} kicker={CATEGORY_LABEL[ex.category]} title={ex.name} />
      <div className="grid gap-6 px-4 sm:px-6 md:grid-cols-[1fr_16rem] lg:px-8">
        <div className="space-y-6">
          <Group
            title="At a glance"
            why={['T-VOL-05', 'T-INT-03', ...(ex.longLengthBias ? ['T-SEL-03'] : [])]}
            footer={secondary.length > 0 ? 'A set counts in full for the main muscles and half for the others.' : undefined}
          >
            <dl className="divide-y">
              <Fact label="Main muscles">{primary.map((m) => MUSCLE_SHORT[m.muscle]).join(', ')}</Fact>
              {secondary.length > 0 && <Fact label="Also works">{secondary.map((m) => MUSCLE_SHORT[m.muscle]).join(', ')}</Fact>}
              <Fact label="Reps">
                {range.reps[0]}–{range.reps[1]}, stopping {range.rir[0]}–{range.rir[1]} reps short of failure
              </Fact>
              <Fact label="Equipment">
                <span className="capitalize">{ex.equipment.join(' or ')}</span>
              </Fact>
              {row?.default_increment_kg != null && <Fact label="Load step">{fmtLoad(row.default_increment_kg, units)}</Fact>}
              {ex.longLengthBias && <Fact label="Long-length work">Yes</Fact>}
            </dl>
          </Group>

          {cues.length > 0 && (
            <Group title="Cues" why={['T-TMP-01']} footer="Lower under control (about 1–4 s) and lift with intent.">
              <ol className="list-decimal space-y-1.5 py-3 pr-4 pl-9 text-[0.95rem]">
                {cues.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
            </Group>
          )}

          {mistakes.length > 0 && (
            <Group title="Common mistakes">
              <ul className="list-disc space-y-1.5 py-3 pr-4 pl-9 text-[0.95rem]">
                {mistakes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </Group>
          )}

          {subs.length > 0 && (
            <Group title="Substitutions">
              {subs.slice(0, 8).map((s) => (
                <Link key={s.id} href={`/library/${s.slug}`} className="hover:bg-muted/50 flex min-h-12 items-center justify-between gap-3 px-4 py-2 text-[0.95rem] transition-colors">
                  {s.name}
                  <ChevronRight className="text-muted-foreground size-5 shrink-0" aria-hidden />
                </Link>
              ))}
            </Group>
          )}

          <Group title="Your history" footer={byDay.size > 0 ? `Best estimated 1-rep max: ${fmtLoad(Math.round(best * 10) / 10, units)}` : undefined}>
            {byDay.size === 0 ? (
              <p className="text-muted-foreground px-4 py-3 text-sm">Not logged yet. Your sets will show up here.</p>
            ) : (
              <ul className="num divide-y text-sm">
                {[...byDay.entries()].slice(0, 10).map(([d, ss]) => (
                  <li key={d} className="px-4 py-2.5">
                    <p className="font-medium">{prettyDate(d)}</p>
                    <p className="text-muted-foreground">
                      {ss
                        .sort((a, b) => a.set_index - b.set_index)
                        .map((s) => `${fmtLoad(s.load_kg, units)} × ${s.reps}`)
                        .join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Group>
        </div>
        <aside className="space-y-4">
          <div className="bg-card rounded-2xl border p-3">
            <BodyMap side="both" styles={styles} interactive={false} />
          </div>
          {draft && <CustomExerciseDialog exerciseId={ex.id} initial={draft} options={exercises.filter((e) => e.id !== ex.id).map((e) => ({ slug: e.slug, name: e.name }))} />}
          <ExerciseActions exerciseId={ex.id} disliked={disliked} custom={custom} />
        </aside>
      </div>
    </div>
  );
}
