import type { Metadata } from 'next';
import { requireOnboarded, loadExercises } from '@/lib/server/context';
import { PageHeader } from '@/components/app/bits';
import { EXERCISE_SEEDS } from '@/lib/knowledge/exercises';
import { MUSCLE_SEEDS, MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { LibraryBrowser } from './browser';

export const metadata: Metadata = { title: 'Library' };

export default async function LibraryPage() {
  const ctx = await requireOnboarded();
  const [exercises, { data: cueRows }] = await Promise.all([loadExercises(ctx.supabase), ctx.supabase.from('exercises').select('id, cues')]);
  const cuesById = new Map((cueRows ?? []).map((r) => [r.id, r.cues]));
  const muscleName = (m: string) => `${MUSCLE_SHORT[m as keyof typeof MUSCLE_SHORT] ?? ''} ${MUSCLE_SEEDS.find((x) => x.id === m)?.name ?? ''}`;
  // Same fallback as the detail page: database cues, else the seed file's.
  const cuesOf = (id: string, slug: string) => (cuesById.get(id)?.length ? cuesById.get(id)! : (EXERCISE_SEEDS.find((s) => s.slug === slug)?.cues ?? []));
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker={`${exercises.length} exercises`} title="Library" />
      <div className="px-4 sm:px-6 lg:px-8">
        <LibraryBrowser
          exercises={exercises.map((e) => ({
            id: e.id,
            slug: e.slug,
            name: e.name,
            pattern: e.pattern,
            category: e.category,
            equipment: e.equipment,
            primary: e.muscles.filter((m) => m.role === 'primary').map((m) => m.muscle),
            secondary: e.muscles.filter((m) => m.role === 'secondary').map((m) => m.muscle),
            long: e.longLengthBias,
            custom: !!e.custom,
            search: [e.name, ...cuesOf(e.id, e.slug), ...e.muscles.map((m) => muscleName(m.muscle))].join(' ').toLowerCase(),
          }))}
        />
      </div>
    </div>
  );
}
