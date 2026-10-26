'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { reviewWeekFor } from '@/lib/engine/fatigue';
import { inferTrainingStatus } from '@/lib/engine/status';
import { isoWeekday } from '@/lib/engine/util';
import { requireUser } from '@/lib/server/context';
import { runWeeklyEngines } from '@/lib/server/review';
import { acceptProposalById, insertProposals } from '@/lib/server/proposals';
import { toJson } from '@/lib/server/plan';
import { todayIn } from '@/lib/utils/dates';
import { createLogger } from '@/lib/log';

const log = createLogger('actions/review');

const Answers = z.object({
  dreading_gym: z.boolean(),
  sleep_worse: z.boolean(),
  performance_down: z.boolean(),
  stress_worse: z.boolean(),
  aches_worse: z.boolean(),
});

async function ctxToday() {
  const { supabase, user } = await requireUser();
  const { data: p } = log.db('select profiles.timezone', await supabase.from('profiles').select('timezone').eq('user_id', user.id).single(), { userId: user.id });
  return { supabase, user, today: todayIn(p?.timezone ?? 'Europe/Sofia') };
}

export async function submitReview(raw: z.input<typeof Answers>): Promise<{ ok: boolean; error?: string; created?: number }> {
  const parsed = Answers.safeParse(raw);
  if (!parsed.success) {
    log.warn('submitReview: invalid input', { issues: parsed.error.issues.map((i) => i.path.join('.')) });
    return { ok: false, error: 'Invalid answers' };
  }
  const { supabase, user, today } = await ctxToday();
  const weekStart = reviewWeekFor(today, isoWeekday(today));
  log.debug('submitReview', { userId: user.id, weekStart });
  // Runs before any write, so a failed read here leaves nothing half-saved.
  let engines: Awaited<ReturnType<typeof runWeeklyEngines>>;
  try {
    engines = await runWeeklyEngines(supabase, user.id, today, weekStart, parsed.data);
  } catch (e) {
    log.error('submitReview: weekly engines failed', { userId: user.id, err: e });
    return { ok: false, error: e instanceof Error ? e.message : 'Could not run the weekly review' };
  }
  const { review, proposals, state, settings } = engines;
  log.debug('weekly engines done', { userId: user.id, proposals: proposals.length, yesCount: review.yesCount });
  const { error } = log.db('upsert weekly_reviews', await supabase.from('weekly_reviews').upsert({
    user_id: user.id,
    week_start: weekStart,
    ...parsed.data,
    autofilled: toJson({ answers: review.autofill.answers, evidence: review.autofill.evidence }),
    completed_at: new Date().toISOString(),
  }), { userId: user.id, weekStart });
  if (error) return { ok: false, error: error.message };
  let created: number;
  try {
    created = await insertProposals(supabase, user.id, today, proposals);
  } catch (e) {
    log.error('submitReview: insertProposals failed', { userId: user.id, err: e });
    revalidatePath('/', 'layout');
    return { ok: false, error: 'Your answers were saved, but the proposals could not be created. Please submit again.' };
  }
  // Remember this review's status inference (T-STA-03 needs two in a row).
  const inf = inferTrainingStatus({ sets: state.sets, today, anchorExerciseIds: state.mainLiftExerciseIds });
  if (inf.status) {
    const { error: shErr } = log.db(
      'update user_settings.status_history',
      await supabase.from('user_settings').update({ status_history: [...(settings?.status_history ?? []), inf.status].slice(-6) }).eq('user_id', user.id),
      { userId: user.id, status: inf.status },
    );
    if (shErr) {
      revalidatePath('/', 'layout');
      return { ok: false, created, error: `Your review was saved, but your training status history could not be updated: ${shErr.message}` };
    }
  }
  revalidatePath('/', 'layout');
  return { ok: true, created };
}

export async function acceptProposal(id: string): Promise<{ ok: boolean; error?: string; summary?: string[] }> {
  const { supabase, user, today } = await ctxToday();
  try {
    const diff = await acceptProposalById(supabase, user.id, id, today);
    revalidatePath('/', 'layout');
    return { ok: true, summary: diff.summary };
  } catch (e) {
    log.error('acceptProposal failed', { proposalId: id, err: e });
    return { ok: false, error: e instanceof Error ? e.message : 'Could not apply' };
  }
}

export async function rejectProposal(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user } = await requireUser();
  log.debug('rejectProposal', { proposalId: id });
  const { error } = log.db(
    'update proposals -> rejected',
    await supabase.from('proposals').update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id).eq('status', 'pending'),
    { proposalId: id },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}
