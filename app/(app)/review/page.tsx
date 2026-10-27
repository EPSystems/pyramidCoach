import type { Metadata } from 'next';
import { requireOnboarded, loadExercises } from '@/lib/server/context';
import { buildWeeklyState, nutritionReviewFor } from '@/lib/server/review';
import { autofillReview, reviewWeekFor } from '@/lib/engine/fatigue';
import { loggedMuscleSets } from '@/lib/engine/counting';
import { addDays, isoWeekday } from '@/lib/engine/util';
import { TRACKED_MUSCLES, type ReviewKey } from '@/lib/engine/types';
import { MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { PageHeader, Why } from '@/components/app/bits';
import { ProposalCard, type ProposalView } from '@/components/app/proposal-card';
import { prettyDate } from '@/lib/utils/dates';
import { ReviewForm } from './review-form';
import { cn } from '@/lib/utils';

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
      <PageHeader kicker={`Week of ${prettyDate(weekStart)}`} title="Weekly review" />
      <div className="rise grid gap-4 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:px-8">
        <div className="space-y-4">
          <section className="bg-card rounded-2xl border p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-bold uppercase">How was the week?</h2>
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
            <h2 className="font-display text-2xl font-bold uppercase">Week summary</h2>
            <dl className="num mt-3 grid grid-cols-3 gap-3">
              <div>
                <dt className="stamp text-muted-foreground">Sessions</dt>
                <dd className="font-display text-3xl font-bold">
                  {done}/{planned}
                </dd>
              </div>
              <div>
                <dt className="stamp text-muted-foreground">Working sets</dt>
                <dd className="font-display text-3xl font-bold">{weekSets.length}</dd>
              </div>
              <div>
                <dt className="stamp text-muted-foreground">On target</dt>
                <dd className="font-display text-3xl font-bold">
                  {onTarget.length}/{TRACKED_MUSCLES.length}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {TRACKED_MUSCLES.map((m) => (
                <span key={m} className={cn('rounded-full px-2.5 py-1 text-xs', onTarget.includes(m) ? 'bg-volt/20 text-foreground' : 'bg-muted text-muted-foreground')}>
                  {MUSCLE_SHORT[m]} {Math.round(logged[m] * 10) / 10}
                </span>
              ))}
            </div>
          </section>

          {nutritionNotes.length > 0 && (
            <section className="bg-card rounded-2xl border p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-2xl font-bold uppercase">Nutrition check</h2>
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

        <div className="space-y-4">
          <h2 className="font-display text-2xl font-bold uppercase">
            Proposals {pending.length > 0 && <span className="text-volt">({pending.length})</span>}
          </h2>
          {pending.length === 0 && <p className="bg-card text-muted-foreground rounded-2xl border p-5 text-sm">Nothing waiting. Submit your weekly review to get this week’s recommendations.</p>}
          {pending.map((p) => (
            <ProposalCard key={p.id} p={view(p)} />
          ))}
          {decided.length > 0 && (
            <details className="group">
              <summary className="text-muted-foreground cursor-pointer text-sm">Recent decisions</summary>
              <div className="mt-3 space-y-3">
                {decided.map((p) => (
                  <ProposalCard key={p.id} p={view(p)} />
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

