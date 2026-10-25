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

const Answers = z.object({
  dreading_gym: z.boolean(),
  sleep_worse: z.boolean(),
  performance_down: z.boolean(),
  stress_worse: z.boolean(),
  aches_worse: z.boolean(),
});

async function ctxToday() {
  const { supabase, user } = await requireUser();
  const { data: p } = await supabase.from('profiles').select('timezone').eq('user_id', user.id).single();
  return { supabase, user, today: todayIn(p?.timezone ?? 'Europe/Sofia') };
}

export async function submitReview(raw: z.input<typeof Answers>): Promise<{ ok: boolean; error?: string; created?: number }> {
  const parsed = Answers.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Invalid answers' };
  const { supabase, user, today } = await ctxToday();
  const weekStart = reviewWeekFor(today, isoWeekday(today));
  const { review, proposals, state, settings } = await runWeeklyEngines(supabase, user.id, today, weekStart, parsed.data);
  const { error } = await supabase.from('weekly_reviews').upsert({
    user_id: user.id,
    week_start: weekStart,
    ...parsed.data,
    autofilled: toJson({ answers: review.autofill.answers, evidence: review.autofill.evidence }),
    completed_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  const created = await insertProposals(supabase, user.id, today, proposals);
  // Remember this review's status inference (T-STA-03 needs two in a row).
  const inf = inferTrainingStatus({ sets: state.sets, today, anchorExerciseIds: state.mainLiftExerciseIds });
  if (inf.status) await supabase.from('user_settings').update({ status_history: [...(settings?.status_history ?? []), inf.status].slice(-6) }).eq('user_id', user.id);
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
    return { ok: false, error: e instanceof Error ? e.message : 'Could not apply' };
  }
}

export async function rejectProposal(id: string): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireUser();
  await supabase.from('proposals').update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id).eq('status', 'pending');
  revalidatePath('/', 'layout');
  return { ok: true };
}
