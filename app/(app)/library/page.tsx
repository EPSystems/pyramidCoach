import type { Metadata } from 'next';
import { requireOnboarded, loadExercises } from '@/lib/server/context';
import { PageHeader } from '@/components/app/bits';
import { LibraryBrowser } from './browser';

export const metadata: Metadata = { title: 'Library' };

export default async function LibraryPage() {
  const ctx = await requireOnboarded();
  const exercises = await loadExercises(ctx.supabase);
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
          }))}
        />
      </div>
    </div>
  );
}
