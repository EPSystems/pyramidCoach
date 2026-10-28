import 'server-only';
import type { Supa } from '@/lib/supabase/server';
import { generateBlock } from '@/lib/engine/block';
import { loggedMuscleSets } from '@/lib/engine/counting';
import { nutritionTargets, phaseForGoal, applyKcalChange, defaultRatePct } from '@/lib/engine/nutrition';
import {
  TRACKED_MUSCLES,
  type BlockInput,
  type BlockKind,
  type Equipment,
  type Goal,
  type Lifestyle,
  type MainLift,
  type NutritionPhase,
  type Priority,
  type RepVariation,
  type Sex,
  type SplitStyle,
  type Status,
  type TimeOfDay,
  type TrackedMuscle,
} from '@/lib/engine/types';
import { addDays, daysBetween, median, mondayOf } from '@/lib/engine/util';
import { carryOverEdits, type PriorSession } from '@/lib/engine/carryover';
import { isFeasible } from '@/lib/engine/selection';
import { loadExercises, mapInjury, mapSet, mapUserSport, type SportRow } from './context';
import { todayIn } from '@/lib/utils/dates';
import type { Json, TablesInsert } from '@/lib/db/database.types';
import { createLogger } from '@/lib/log';

const log = createLogger('server/plan');

export const toJson = (x: unknown): NonNullable<Json> => JSON.parse(JSON.stringify(x ?? {})) as NonNullable<Json>;

export interface RegenOptions {
  reason: string;
  blockKind?: BlockKind;
  startsOn?: string;
  fromHeavyPhase?: boolean;
  /** Added to the persistent per-muscle adjustments (plateau / volume_change proposals). */
  addAdjustments?: Partial<Record<TrackedMuscle, number>>;
  resetAdjustments?: boolean;
  /** Plan with this status and store it as inferred, in the same transaction (status_change proposals). */
  inferredStatus?: Status;
}

/**
 * Everything one atomic apply_plan_writes call can write (supabase/migrations/20261027120001_plan_carryover_atomic.sql).
 * Proposal accepts and plan regenerations both go through it, so a failure leaves nothing half-applied.
 */
export interface PlanWrites {
  settings?: { training_status?: Status; status_source?: 'inferred' | 'self'; target_adjustments?: Partial<Record<TrackedMuscle, number>> };
  exercise_updates?: { id: string; sets?: number; rir_min?: number; rir_max?: number; exercise_id?: string }[];
  exercise_deletes?: string[];
  session_updates?: { id: string; status?: string; kind?: string }[];
  plan?: { block: unknown; targets: unknown; sessions: unknown; from: string };
  nutrition_target?: Omit<TablesInsert<'nutrition_targets'>, 'user_id'>;
  nutrition_settings?: Omit<TablesInsert<'nutrition_settings'>, 'user_id'>;
  accept_proposal_id?: string;
}

/** Runs the writes in one transaction (RLS applies). Throws on failure; then nothing was written. */
export async function applyPlanWrites(supabase: Supa, userId: string, writes: PlanWrites, ctx: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc('apply_plan_writes', { p: toJson(writes) });
  if (error) {
    log.error('rpc apply_plan_writes failed', { userId, ...ctx, keys: Object.keys(writes), err: error });
    // P0001 carries a message meant for the user (e.g. "Already decided").
    throw new Error(error.code === 'P0001' ? error.message : 'Could not save the changes. Nothing was changed; please try again.');
  }
  return (data as { block_id: string | null } | null)?.block_id ?? null;
}

/** Re-runs the engine and replaces future planned sessions (Section 6.14). History is never touched. */
export async function regeneratePlan(supabase: Supa, userId: string, opts: RegenOptions) {
  const { plan, writes, carried } = await buildRegeneration(supabase, userId, opts);
  await applyPlanWrites(supabase, userId, writes, { reason: opts.reason });
  log.debug('plan replaced', { userId, kind: plan.kind, weeks: plan.weeks, warnings: plan.warnings.length, ...carried });
  return plan;
}

/**
 * Builds a regeneration without writing it: the new plan, with the user's moves, skips and session-only swaps
 * carried over (lib/engine/carryover.ts), as `settings` + `plan` writes for applyPlanWrites.
 */
export async function buildRegeneration(supabase: Supa, userId: string, opts: RegenOptions) {
  log.debug('buildRegeneration', { userId, reason: opts.reason, blockKind: opts.blockKind });
  const [profileRes, settingsRes, sportsRes, injuriesRes, exercises, blockRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).single(),
    supabase.from('user_settings').select('*').eq('user_id', userId).single(),
    supabase.from('user_sports').select('*, sports(*)').eq('user_id', userId),
    supabase.from('injuries').select('*').eq('user_id', userId).neq('status', 'resolved'),
    loadExercises(supabase),
    supabase.from('blocks').select('*').eq('user_id', userId).eq('status', 'active').maybeSingle(),
  ]);
  // A failed sports/injuries/block read would silently plan as if there were none, so fail instead.
  const { data: profile, error: profileErr } = log.db('select profiles', profileRes, { userId });
  const { data: settings, error: settingsErr } = log.db('select user_settings', settingsRes, { userId });
  const { data: sportRows, error: sportsErr } = log.db('select user_sports', sportsRes, { userId });
  const { data: injuries, error: injuriesErr } = log.db('select injuries', injuriesRes, { userId });
  const { data: activeBlock, error: blockErr } = log.db('select active block', blockRes, { userId });
  const readErr = profileErr ?? settingsErr ?? sportsErr ?? injuriesErr ?? blockErr;
  if (readErr) throw new Error(readErr.message);
  if (!profile || !settings) throw new Error('Profile or settings missing');
  const today = todayIn(profile.timezone);
  const monday = mondayOf(today);
  const since = addDays(today, -16 * 7);
  const [setsRes, priorRes] = await Promise.all([
    supabase.from('logged_sets').select('*').eq('user_id', userId).gte('performed_on', since),
    // This week's and future sessions: what the user changed (moves, skips, swaps) and what is already trained.
    supabase
      .from('planned_sessions')
      .select('plan_key, planned_on, scheduled_on, status, kind, planned_exercises(slot_key, exercise_id, original_exercise_id, sets)')
      .eq('user_id', userId)
      .neq('kind', 'generated')
      .or(`planned_on.gte.${monday},scheduled_on.gte.${today}`),
  ]);
  const { data: setRows, error: setsErr } = log.db('select logged_sets', setsRes, { userId });
  if (setsErr) throw new Error(setsErr.message);
  // A failed read would silently drop the user's moves and skips, so fail instead.
  const { data: priorRows, error: priorErr } = log.db('select planned_sessions (carry-over)', priorRes, { userId });
  if (priorErr) throw new Error(priorErr.message);
  const sets = (setRows ?? []).map(mapSet);

  // History summary for T-VOL-07 / T-FAT-06 / T-SEL-06.
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  let recentAvg: number | null = null;
  if (sets.length) {
    const weekly: number[] = [];
    for (let w = 1; w <= 4; w++) {
      const from = addDays(monday, -7 * w);
      const m = loggedMuscleSets(sets, exMap, from);
      weekly.push(median(TRACKED_MUSCLES.filter((x) => x !== 'front_delts').map((x) => m[x])));
    }
    recentAvg = weekly.reduce((a, b) => a + b, 0) / weekly.length;
  }
  const lastLogged = sets.reduce<string | null>((a, s) => (!a || s.performedOn > a ? s.performedOn : a), null);
  const weeksOff = lastLogged ? Math.floor(daysBetween(lastLogged, today) / 7) : settings.trained_last_month ? 0 : 4;

  let adjustments = (opts.resetAdjustments ? {} : (settings.target_adjustments as Partial<Record<TrackedMuscle, number>>)) ?? {};
  if (opts.addAdjustments) {
    adjustments = { ...adjustments };
    for (const [m, v] of Object.entries(opts.addAdjustments)) adjustments[m as TrackedMuscle] = (adjustments[m as TrackedMuscle] ?? 0) + (v ?? 0);
  }
  const adjustmentsChanged = !!(opts.addAdjustments || opts.resetAdjustments);

  const sports = ((sportRows ?? []) as SportRow[]).filter((s) => s.active && s.sports).map(mapUserSport);
  const kind = opts.blockKind ?? (activeBlock && opts.reason !== 'goal_change' ? (activeBlock.kind as BlockKind) : undefined);
  const goal = settings.goal as Goal;
  const kindForGoal: BlockKind | undefined =
    goal === 'strength' ? (kind && kind.startsWith('strength') ? kind : 'strength_volume') : goal === 'sport_support' ? 'sport_support' : kind && !kind.startsWith('strength') && kind !== 'sport_support' ? kind : 'hypertrophy';

  const injuryList = (injuries ?? []).map(mapInjury);
  const input: BlockInput = {
    today,
    goal,
    priority: (goal === 'sport_support' ? 'sport' : settings.priority) as Priority,
    status: (opts.inferredStatus ?? settings.training_status) as Status,
    availableDays: settings.available_days,
    sessionMinutes: settings.session_minutes,
    maxLiftDays: settings.max_lift_days,
    equipment: settings.equipment as Equipment[],
    increments: settings.increments as Record<string, number>,
    sports,
    injuries: injuryList,
    exercises,
    history: {
      sets,
      previousBlock: activeBlock && activeBlock.median_target != null
        ? {
            kind: activeBlock.kind as BlockKind,
            medianTargetBeforeTrims: Math.round(Number(activeBlock.median_target)),
            endedOn: today,
            selections: activeBlock.selections as Record<string, Record<string, string>>,
          }
        : null,
      recentAvgWeeklySets: recentAvg,
      weeksOff,
      e1rmSeeds: settings.e1rm_seeds as Partial<Record<MainLift, number>>,
    },
    repVariation: settings.rep_variation as RepVariation,
    specialization: settings.specialization_muscles as TrackedMuscle[],
    testDate: settings.test_date,
    splitStyle: settings.split_style as SplitStyle,
    blockKind: opts.blockKind ?? kindForGoal,
    startsOn: opts.startsOn ?? (activeBlock ? monday : undefined),
    dislikedExerciseIds: settings.disliked_exercise_ids,
    strengthLifts: settings.strength_lifts as MainLift[],
    targetAdjustments: adjustments,
    fromHeavyPhase: opts.fromHeavyPhase,
    liftingTime: (settings.lifting_time as TimeOfDay | null) ?? null,
    // From this Monday, so a session moved off an earlier day this week can still be matched and carried.
    materialiseFrom: monday,
  };
  const plan = generateBlock(input);

  // Carry over the user's moves, skips and session-only swaps (docs/DECISIONS.md, "Plan carry-over").
  const prior: PriorSession[] = [];
  for (const r of priorRows ?? []) {
    if (!r.plan_key || !r.planned_on) continue;
    const started = r.status === 'in_progress' || r.status === 'done';
    if (!started && r.scheduled_on < today) continue; // missed: nothing to carry
    prior.push({
      planKey: r.plan_key,
      plannedOn: r.planned_on,
      scheduledOn: r.scheduled_on,
      status: started ? 'done' : r.status === 'skipped' ? 'skipped' : 'planned',
      swaps: (r.planned_exercises ?? [])
        .filter((e) => e.slot_key && e.original_exercise_id && e.original_exercise_id !== e.exercise_id)
        .map((e) => ({ slotKey: e.slot_key!, fromExerciseId: e.original_exercise_id!, toExerciseId: e.exercise_id })),
      // An accepted deload survives regenerations from other proposals or settings (re-applied by slot).
      deload:
        r.kind === 'deload'
          ? { setsBySlot: Object.fromEntries((r.planned_exercises ?? []).filter((e) => e.slot_key).map((e) => [e.slot_key!, e.sets])) }
          : undefined,
    });
  }
  const selection = { equipment: input.equipment, injuries: injuryList, disliked: input.dislikedExerciseIds ?? [] };
  const carry = carryOverEdits({
    sessions: plan.sessions,
    prior,
    today,
    allowExercise: (id) => {
      const ex = exMap.get(id);
      return !!ex && isFeasible(ex, selection);
    },
  });

  // Don't create a second session today if today's session is already started or done.
  // A failed read must not count as "nothing started today", or a second session would be planned.
  const { data: todays, error: todaysErr } = log.db(
    'select started sessions today',
    await supabase.from('planned_sessions').select('id,status,kind').eq('user_id', userId).eq('scheduled_on', today).in('status', ['in_progress', 'done']),
    { userId },
  );
  if (todaysErr) throw new Error(todaysErr.message);
  const todayLocked = (todays ?? []).some((s) => s.kind !== 'generated');
  const sessions = carry.sessions.filter((s) => !(todayLocked && s.date === today));

  const medianTarget = median(plan.targets.filter((t) => t.muscle !== 'front_delts').map((t) => t.target + t.sportTrim - (adjustments[t.muscle] ?? 0)));
  const writes: PlanWrites = {
    plan: {
      from: today,
      block: {
        kind: plan.kind,
        starts_on: plan.startsOn,
        weeks: plan.weeks,
        intro_week: plan.introWeek,
        split_key: plan.splitKey,
        engine_version: plan.engineVersion,
        inputs_snapshot: { reason: opts.reason, ...input, exercises: undefined, history: { ...input.history, sets: sets.length } },
        schedule: plan.schedule,
        selections: plan.selections,
        explanations: plan.explanations,
        warnings: plan.warnings,
        median_target: medianTarget,
      },
      targets: plan.weeklyTargets.map((t) => ({ week_index: t.weekIndex, muscle_id: t.muscle, target_sets: t.targetSets, sport_trim: t.sportTrim })),
      sessions: sessions.map((s) => ({
        week_index: s.weekIndex,
        scheduled_on: s.date,
        planned_on: s.plannedOn ?? s.date,
        plan_key: s.planKey ?? null,
        status: s.status ?? 'planned',
        template_key: s.templateKey,
        title: s.title,
        kind: s.kind,
        est_minutes: s.estMinutes,
        order_in_week: s.orderInWeek,
        exercises: s.exercises.map((e) => ({
          exercise_id: e.exerciseId,
          original_exercise_id: e.originalExerciseId ?? e.exerciseId,
          slot_key: e.slotKey,
          position: e.position,
          sets: e.sets,
          rep_min: e.repMin,
          rep_max: e.repMax,
          rir_min: e.rirMin,
          rir_max: e.rirMax,
          rest_seconds: e.restSeconds,
          suggested_load_kg: e.suggestedLoadKg ?? '',
          is_main_lift_single: !!e.isMainLiftSingle,
          note: e.note ?? null,
          rule_ids: e.ruleIds,
        })),
      })),
    },
  };
  if (adjustmentsChanged || opts.inferredStatus) {
    writes.settings = {
      ...(adjustmentsChanged ? { target_adjustments: adjustments } : {}),
      ...(opts.inferredStatus ? { training_status: opts.inferredStatus, status_source: 'inferred' as const } : {}),
    };
  }
  return { plan, writes, carried: { sessions: sessions.length, kept: carry.kept, dropped: carry.dropped } };
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export async function latestBodyweight(supabase: Supa, userId: string, fallback: number | null): Promise<number | null> {
  const { data, error } = log.db(
    'select recent bodyweights',
    await supabase.from('checkins').select('bodyweight_kg, day').eq('user_id', userId).not('bodyweight_kg', 'is', null).order('day', { ascending: false }).limit(7),
    { userId },
  );
  // Callers write targets from this value, so a failed read must not fall back to a stale weight.
  if (error) throw new Error(error.message);
  const ws = (data ?? []).map((d) => Number(d.bodyweight_kg));
  if (!ws.length) return fallback;
  return Math.round((ws.reduce((a, b) => a + b, 0) / ws.length) * 10) / 10;
}

type NutritionOpts = { phase?: NutritionPhase; ratePct?: number; multiplier?: number; kcalOffsetDelta?: number; resetPhase?: boolean };

/** Recomputes nutrition targets and writes a new nutrition_targets row (N-SPT-03: immediate, no proposal). */
export async function recomputeNutrition(supabase: Supa, userId: string, reason: string, opts?: NutritionOpts) {
  const { result, writes } = await buildNutritionWrites(supabase, userId, reason, opts);
  // The targets row and the settings upsert go in one transaction, so they never disagree.
  await applyPlanWrites(supabase, userId, writes, { reason });
  return result;
}

/** Computes new nutrition targets as `nutrition_target` + `nutrition_settings` writes for applyPlanWrites. */
export async function buildNutritionWrites(supabase: Supa, userId: string, reason: string, opts?: NutritionOpts) {
  log.debug('buildNutritionWrites', { userId, reason, phase: opts?.phase, resetPhase: opts?.resetPhase });
  const [profileRes, settingsRes, nsRes, sportsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).single(),
    supabase.from('user_settings').select('*').eq('user_id', userId).single(),
    supabase.from('nutrition_settings').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('user_sports').select('*, sports(*)').eq('user_id', userId),
  ]);
  const { data: profile, error: profileErr } = log.db('select profiles', profileRes, { userId });
  const { data: settings, error: settingsErr } = log.db('select user_settings', settingsRes, { userId });
  // A failed read would be treated as "no nutrition settings yet" (resetting the phase) or "no sports", so fail instead.
  const { data: ns, error: nsErr } = log.db('select nutrition_settings', nsRes, { userId });
  const { data: sportRows, error: sportsErr } = log.db('select user_sports', sportsRes, { userId });
  const readErr = profileErr ?? settingsErr ?? nsErr ?? sportsErr;
  if (readErr) throw new Error(readErr.message);
  if (!profile || !settings) throw new Error('missing profile');
  const today = todayIn(profile.timezone);
  const latestKg = await latestBodyweight(supabase, userId, profile.bodyweight_kg);
  if (latestKg == null) log.debug('no bodyweight on record, assuming 75 kg', { userId });
  const kg = latestKg ?? 75;
  const phase = (opts?.phase ?? (ns?.phase as NutritionPhase | undefined) ?? phaseForGoal(settings.goal as Goal)) as NutritionPhase;
  const phaseChanged = !ns || ns.phase !== phase || opts?.resetPhase;
  const lifestyle = settings.lifestyle as Lifestyle;
  const status = settings.training_status as Status;
  const sex = (profile.sex as Sex | null) ?? null;
  const ratePct =
    opts?.ratePct ?? (phaseChanged ? defaultRatePct(phase, status, sex, profile.body_fat_pct) : Math.abs(Number(ns!.target_rate_pct)));
  const multiplier = opts?.multiplier ?? (ns ? Number(ns.activity_multiplier) : undefined);
  const sports = ((sportRows ?? []) as SportRow[]).filter((s) => s.active && s.sports).map(mapUserSport);
  const base = nutritionTargets({ bodyweightKg: kg, sex, bodyFatPct: profile.body_fat_pct, status, phase, lifestyle, multiplier, sports, targetRatePct: ratePct });
  const offset = phaseChanged ? (opts?.kcalOffsetDelta ?? 0) : (ns?.kcal_offset ?? 0) + (opts?.kcalOffsetDelta ?? 0);
  const final = offset ? { ...base, ...applyKcalChange(base, base.kcal + offset) } : base;

  const history = (ns?.phase_history as { phase: string; from: string; to: string | null }[] | undefined) ?? [];
  const newHistory = phaseChanged
    ? [...history.map((h) => (h.to ? h : { ...h, to: today })), { phase, from: today, to: null }]
    : history;

  const writes: PlanWrites = {
    nutrition_target: {
      effective_from: today,
      kcal: final.kcal,
      kcal_low: final.kcal - 100,
      kcal_high: final.kcal + 100,
      protein_g: final.proteinG,
      fat_min_g: base.fatMinG,
      fat_g: final.fatG,
      carbs_min_g: base.carbsMinG,
      carbs_g: final.carbsG,
      sport_kcal_per_day: base.sportKcalPerDay,
      maintenance_kcal: base.maintenance,
      reason: `${reason}: ${base.ruleIds.join(', ')}`,
    },
    nutrition_settings: {
      phase,
      activity_multiplier: base.multiplier,
      maintenance_kcal: base.maintenance,
      target_rate_pct: phase === 'loss' ? -ratePct : ratePct,
      phase_started_on: phaseChanged ? today : ns!.phase_started_on,
      last_adjusted_on: opts?.kcalOffsetDelta || opts?.multiplier ? today : (ns?.last_adjusted_on ?? null),
      initial_adjust_done: phaseChanged ? false : opts?.multiplier ? true : (ns?.initial_adjust_done ?? false),
      kcal_offset: offset,
      phase_history: toJson(newHistory),
    },
  };
  return { result: { ...base, kcal: final.kcal, fatG: final.fatG, carbsG: final.carbsG, warnings: base.warnings }, writes };
}
