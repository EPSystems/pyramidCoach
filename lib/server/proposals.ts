import 'server-only';
import type { Supa } from '@/lib/supabase/server';
import type { TablesUpdate } from '@/lib/db/database.types';
import { applyProposal } from '@/lib/engine/proposals';
import type { PlannedSessionState, Proposal, ProposalKind, Status } from '@/lib/engine/types';
import { loadExercises } from './context';
import { recomputeNutrition, regeneratePlan, toJson } from './plan';
import { createLogger } from '@/lib/log';

const log = createLogger('server/proposals');

export async function expireProposals(supabase: Supa, userId: string, today: string) {
  log.db('expire proposals', await supabase.from('proposals').update({ status: 'expired' }).eq('user_id', userId).eq('status', 'pending').lt('expires_on', today), { userId });
}

/** Future planned sessions in the engine's shape. Throws if the read fails (an empty plan would make diffs silently no-op). */
export async function loadStoredPlan(supabase: Supa, userId: string, from: string): Promise<PlannedSessionState[]> {
  const { data, error } = log.db(
    'select planned_sessions (stored plan)',
    await supabase
      .from('planned_sessions')
      .select('id, scheduled_on, status, template_key, planned_exercises(id, exercise_id, sets, rir_min, rir_max, position)')
      .eq('user_id', userId)
      .gte('scheduled_on', from)
      .order('scheduled_on'),
    { userId },
  );
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    date: s.scheduled_on,
    status: s.status as PlannedSessionState['status'],
    templateKey: s.template_key,
    exercises: [...(s.planned_exercises ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((e) => ({ id: e.id, exerciseId: e.exercise_id, sets: e.sets, rirMin: Number(e.rir_min), rirMax: Number(e.rir_max) })),
  }));
}

const SET_KINDS: ProposalKind[] = ['standard_deload', 'targeted_deload', 'intro_week', 'exercise_swap'];

/** Insert new proposals, skipping duplicates of a pending proposal of the same kind (and same exercise for plateaus). */
export async function insertProposals(supabase: Supa, userId: string, today: string, proposals: Proposal[]) {
  if (!proposals.length) return 0;
  // Stop on a failed read: otherwise every proposal looks new and duplicates of pending ones get inserted.
  const { data: pending, error: pendingErr } = log.db('select pending proposals', await supabase.from('proposals').select('kind, payload').eq('user_id', userId).eq('status', 'pending'), { userId });
  if (pendingErr) throw pendingErr;
  const key = (k: string, p: unknown) => (k === 'plateau_action' ? `${k}:${(p as { exerciseId?: string }).exerciseId}` : k);
  const existing = new Set((pending ?? []).map((p) => key(p.kind, p.payload)));
  const plan = proposals.some((p) => SET_KINDS.includes(p.kind)) ? await loadStoredPlan(supabase, userId, today) : [];
  const exercises = plan.length ? await loadExercises(supabase) : [];
  const exName = new Map(exercises.map((e) => [e.id, e.name]));
  const rows = proposals
    .filter((p) => !existing.has(key(p.kind, p.payload)))
    .map((p) => {
      let preview: unknown = null;
      if (SET_KINDS.includes(p.kind)) {
        const diff = applyProposal({ sessions: plan, exercises, today }, p);
        preview = plan
          .map((s) => ({
            date: s.date,
            rows: s.exercises
              .map((e) => {
                const upd = diff.exerciseUpdates.find((u) => u.id === e.id);
                const del = diff.exerciseDeletes.includes(e.id);
                if (!upd && !del) return null;
                return { name: exName.get(e.exerciseId) ?? 'Exercise', before: e.sets, after: del ? 0 : (upd?.sets ?? e.sets), swapTo: upd?.exerciseId ? exName.get(upd.exerciseId) : undefined };
              })
              .filter(Boolean),
          }))
          .filter((s) => s.rows.length);
      }
      return {
        user_id: userId,
        kind: p.kind,
        title: p.title,
        rationale: p.rationale,
        rule_ids: p.ruleIds,
        payload: toJson(p.payload),
        preview: preview ? toJson(preview) : null,
        applies_from: p.appliesFrom ?? null,
        expires_on: p.expiresOn ?? null,
      };
    });
  if (rows.length) {
    const { error } = log.db('insert proposals', await supabase.from('proposals').insert(rows), { userId, count: rows.length });
    if (error) throw error;
  }
  return rows.length;
}

/** Applies an accepted proposal (Section 6.14). */
export async function acceptProposalById(supabase: Supa, userId: string, id: string, today: string) {
  const { data: row, error } = await supabase.from('proposals').select('*').eq('id', id).eq('user_id', userId).single();
  if (error || !row) {
    log.warn('proposal not found', { proposalId: id, err: error });
    throw new Error('Proposal not found');
  }
  if (row.status !== 'pending') throw new Error('Already decided');
  log.debug('accept proposal', { proposalId: id, kind: row.kind });
  const proposal: Proposal = { kind: row.kind as ProposalKind, title: row.title, rationale: row.rationale, ruleIds: row.rule_ids, payload: row.payload as Record<string, unknown> };
  const [plan, exercises] = await Promise.all([loadStoredPlan(supabase, userId, today), loadExercises(supabase)]);
  const diff = applyProposal({ sessions: plan, exercises, today }, proposal);

  // Every write below is checked; the first failure throws so the proposal is never marked accepted
  // with only part of it applied. (No transaction is available app-side, so earlier rows stay written.)
  const must = <T extends { error: { message: string } | null }>(op: string, res: T, ctx: Record<string, unknown>) => {
    if (log.db(op, res, { proposalId: id, ...ctx }).error) throw new Error(`Could not apply the proposal (${op}). Please try again.`);
    return res;
  };
  for (const u of diff.exerciseUpdates) {
    const patch: TablesUpdate<'planned_exercises'> = {};
    if (u.sets != null) patch.sets = u.sets;
    if (u.rirMin != null) patch.rir_min = u.rirMin;
    if (u.rirMax != null) patch.rir_max = u.rirMax;
    if (u.exerciseId) patch.exercise_id = u.exerciseId;
    must('update planned_exercises', await supabase.from('planned_exercises').update(patch).eq('id', u.id).eq('user_id', userId), { plannedExerciseId: u.id });
  }
  if (diff.exerciseDeletes.length)
    must('delete planned_exercises', await supabase.from('planned_exercises').delete().in('id', diff.exerciseDeletes).eq('user_id', userId), { count: diff.exerciseDeletes.length });
  for (const s of diff.sessionUpdates) {
    const patch: TablesUpdate<'planned_sessions'> = {};
    if (s.status) patch.status = s.status;
    if (s.kind) patch.kind = s.kind;
    must('update planned_sessions', await supabase.from('planned_sessions').update(patch).eq('id', s.id).eq('user_id', userId), { sessionId: s.id });
  }
  if (diff.settings?.trainingStatus) {
    must(
      'update user_settings.training_status',
      await supabase.from('user_settings').update({ training_status: diff.settings.trainingStatus as Status, status_source: 'inferred' }).eq('user_id', userId),
      {},
    );
  }
  if (diff.regenerate) {
    const isTransition = proposal.kind === 'block_transition';
    await regeneratePlan(supabase, userId, {
      reason: diff.regenerate.reason,
      blockKind: diff.regenerate.blockKind,
      startsOn: diff.regenerate.startsOn,
      fromHeavyPhase: diff.regenerate.fromHeavyPhase,
      addAdjustments: diff.regenerate.targetAdjustments,
      resetAdjustments: isTransition,
    });
  }
  if (diff.nutrition?.kcal != null) {
    // A failed read would turn the kcal change into a zero delta, so it must stop here.
    const { data: cur } = must('select latest nutrition_targets', await supabase.from('nutrition_targets').select('kcal').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(), {});
    await recomputeNutrition(supabase, userId, 'calorie_adjust N-ADJ-02', { kcalOffsetDelta: diff.nutrition.kcal - (cur?.kcal ?? diff.nutrition.kcal) });
  }
  if (diff.nutrition?.multiplier != null) {
    await recomputeNutrition(supabase, userId, 'multiplier_adjust N-ADJ-01', { multiplier: diff.nutrition.multiplier });
  }
  must('mark proposal accepted', await supabase.from('proposals').update({ status: 'accepted', decided_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId), {});
  return diff;
}
