import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import { requireOnboarded, loadExercises } from '@/lib/server/context';
import { buildWeeklyState, nutritionReviewFor } from '@/lib/server/review';
import { autofillReview, reviewWeekFor } from '@/lib/engine/fatigue';
import { loggedMuscleSets } from '@/lib/engine/counting';
import { addDays, isoWeekday } from '@/lib/engine/util';
import { TRACKED_MUSCLES, type ReviewKey } from '@/lib/engine/types';
import { MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { Disclosure, PageHeader, Stat, Why } from '@/components/app/bits';
import { ProposalCard, type ProposalView } from '@/components/app/proposal-card';
import { prettyDate } from '@/lib/utils/dates';
import { ReviewForm } from './review-form';

export const metadata: Metadata = { title: 'Weekly review' };

export default async function ReviewPage() {
  const ctx = await requireOnboarded();
  const { supabase, user, today } = ctx;
  const weekStart = reviewWeekFor(today, isoWeekday(today));
  const [{ state, block }, { data: existing }, { data: proposals }, exercises] = await Promise.all([
    buildWeeklyState(supabase, user.id, today, weekStart),
    supabase.from('weekly_reviews').select('*').eq('user_id', user.id).eq('week_start', weekStart).maybeSingle(),
    supabase.from('proposals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
    loadExercises(supabase),
  ]);
  const autofill = autofillReview(state);
  // Nutrition notes (e.g. "trend on target") are informational; a failed read only hides them.
  const nutritionNotes = await nutritionReviewFor(supabase, user.id, today, state.status).then(
    (r) => r.notes,
    () => [] as string[],
  );
  const pending = (proposals ?? []).filter((p) => p.status === 'pending');
  const decided = (proposals ?? []).filter((p) => p.status !== 'pending').slice(0, 6);

  // Weekly summary.
  const done = state.sessionsThisWeek.filter((s) => s.status === 'done').length;
  const planned = state.sessionsThisWeek.length;
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const logged = loggedMuscleSets(state.sets, exMap, weekStart);
  const weekIdx = block ? Math.floor((Date.parse(weekStart) - Date.parse(block.starts_on)) / 604800000) : -1;
  const { data: targets } = block && weekIdx >= 0 ? await supabase.from('weekly_targets').select('muscle_id, target_sets').eq('block_id', block.id).eq('week_index', weekIdx) : { data: [] };
  const onTarget = TRACKED_MUSCLES.filter((m) => {
    const t = targets?.find((x) => x.muscle_id === m);
    return t && Math.abs(logged[m] - Number(t.target_sets)) <= 1;
  });
  const weekSets = state.sets.filter((s) => s.performedOn >= weekStart && s.performedOn < addDays(weekStart, 7));
  const view = (p: NonNullable<typeof proposals>[number]): ProposalView => ({
    id: p.id,
    kind: p.kind,
    title: p.title,
    rationale: p.rationale,
    rule_ids: p.rule_ids,
    status: p.status,
    preview: p.preview as ProposalView['preview'],
    payload: p.payload as Record<string, unknown>,
    expires_on: p.expires_on,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker={`Week of ${prettyDate(weekStart)}`} title="Weekly review" back={{ href: '/today', label: 'Today' }} />
      <div className="grid gap-4 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:px-8">
        <div className="space-y-4">
          <section className="bg-card rounded-2xl border p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">How was the week?</h2>
              <Why ruleIds={['T-FAT-01', 'T-FAT-02']} />
            </div>
            <p className="text-muted-foreground text-sm">Pre-filled from your logs. Confirm or flip, then submit.</p>
            <ReviewForm
              initial={existing?.completed_at ? (Object.fromEntries((['dreading_gym', 'sleep_worse', 'performance_down', 'stress_worse', 'aches_worse'] as ReviewKey[]).map((k) => [k, !!existing[k]])) as Record<ReviewKey, boolean>) : autofill.answers}
              evidence={autofill.evidence}
              completed={!!existing?.completed_at}
            />
          </section>

          <section className="bg-card rounded-2xl border p-5">
            <h2 className="text-lg font-semibold">Week summary</h2>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat label="Sessions" value={`${done}/${planned}`} />
              <Stat label="Working sets" value={weekSets.length} />
              <Stat label="On target" value={`${onTarget.length}/${TRACKED_MUSCLES.length}`} />
            </div>
            <Disclosure summary="Sets per muscle" className="-mx-5 -mb-5 mt-3 border-t">
              <ul className="num divide-y text-sm">
                {TRACKED_MUSCLES.map((m) => (
                  <li key={m} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex items-center gap-2">
                      {MUSCLE_SHORT[m]}
                      {onTarget.includes(m) && <Check className="text-ok size-4" aria-label="on target" />}
                    </span>
                    <span className="text-muted-foreground">{Math.round(logged[m] * 10) / 10}</span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          </section>

          {nutritionNotes.length > 0 && (
            <section className="bg-card rounded-2xl border p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">Nutrition check</h2>
                <Why ruleIds={['N-WGT-02', 'N-ADJ-02']} />
              </div>
              <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
                {nutritionNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* With decisions waiting, they come first on a phone: that's the job of this screen. */}
        <div className={pending.length > 0 ? 'order-first space-y-4 lg:order-none' : 'space-y-4'}>
          <h2 className="text-lg font-semibold">
            Proposals {pending.length > 0 && <span className="text-muted-foreground font-normal">({pending.length})</span>}
          </h2>
          {pending.length === 0 && <p className="bg-card text-muted-foreground rounded-2xl border p-5 text-sm">Nothing waiting. Submit your weekly review to get this week’s recommendations.</p>}
          {pending.map((p) => (
            <ProposalCard key={p.id} p={view(p)} />
          ))}
          {decided.length > 0 && (
            <Disclosure summary="Recent decisions" className="bg-card rounded-2xl border">
              <div className="space-y-3">
                {decided.map((p) => (
                  <ProposalCard key={p.id} p={view(p)} />
                ))}
              </div>
            </Disclosure>
          )}
        </div>
      </div>
    </div>
  );
}

