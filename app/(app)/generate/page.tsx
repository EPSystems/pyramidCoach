import type { Metadata } from 'next';
import { requireOnboarded } from '@/lib/server/context';
import { PageHeader } from '@/components/app/bits';
import { TRACKED_MUSCLES, type TrackedMuscle } from '@/lib/engine/types';
import { GenerateForm } from './form';

export const metadata: Metadata = { title: 'Generate a workout' };

export default async function GeneratePage({ searchParams }: PageProps<'/generate'>) {
  const sp = await searchParams;
  const ctx = await requireOnboarded();
  const m = typeof sp.muscle === 'string' && (TRACKED_MUSCLES as readonly string[]).includes(sp.muscle) ? (sp.muscle as TrackedMuscle) : null;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader kicker="Extra session · travel · short on time" title="Generate" />
      <div className="px-4 sm:px-6 lg:px-8">
        <GenerateForm initialMuscle={m} units={ctx.units} />
      </div>
    </div>
  );
}
