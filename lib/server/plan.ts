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
  type TrackedMuscle,
} from '@/lib/engine/types';
import { addDays, daysBetween, median, mondayOf } from '@/lib/engine/util';
import { loadExercises, mapInjury, mapSet, mapUserSport, type SportRow } from './context';
import { todayIn } from '@/lib/utils/dates';
import type { Json } from '@/lib/db/database.types';

export const toJson = (x: unknown): NonNullable<Json> => JSON.parse(JSON.stringify(x ?? {})) as NonNullable<Json>;

export interface RegenOptions {
  reason: string;
  blockKind?: BlockKind;
  startsOn?: string;
  fromHeavyPhase?: boolean;
  /** Added to the persistent per-muscle adjustments (plateau / volume_change proposals). */
  addAdjustments?: Partial<Record<TrackedMuscle, number>>;
  resetAdjustments?: boolean;
}

/** Re-runs the engine and replaces future planned sessions (Section 6.14). History is never touched. */
export async function regeneratePlan(supabase: Supa, userId: string, opts: RegenOptions) {
  const [{ data: profile }, { data: settings }, { data: sportRows }, { data: injuries }, exercises, { data: activeBlock }] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).single(),
    supabase.from('user_settings').select('*').eq('user_id', userId).single(),
    supabase.from('user_sports').select('*, sports(*)').eq('user_id', userId),
    supabase.from('injuries').select('*').eq('user_id', userId).neq('status', 'resolved'),
    loadExercises(supabase),
    supabase.from('blocks').select('*').eq('user_id', userId).eq('status', 'active').maybeSingle(),
  ]);
  if (!profile || !settings) throw new Error('Profile or settings missing');
  const today = todayIn(profile.timezone);
  const since = addDays(today, -16 * 7);
  const { data: setRows } = await supabase.from('logged_sets').select('*').eq('user_id', userId).gte('performed_on', since);
  const sets = (setRows ?? []).map(mapSet);

  // History summary for T-VOL-07 / T-FAT-06 / T-SEL-06.
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  let recentAvg: number | null = null;
  if (sets.length) {
    const weekly: number[] = [];
    for (let w = 1; w <= 4; w++) {
      const from = addDays(mondayOf(today), -7 * w);
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
  if (opts.addAdjustments || opts.resetAdjustments) {
    await supabase.from('user_settings').update({ target_adjustments: adjustments }).eq('user_id', userId);
  }

  const sports = ((sportRows ?? []) as SportRow[]).filter((s) => s.active && s.sports).map(mapUserSport);
  const kind = opts.blockKind ?? (activeBlock && opts.reason !== 'goal_change' ? (activeBlock.kind as BlockKind) : undefined);
  const goal = settings.goal as Goal;
  const kindForGoal: BlockKind | undefined =
    goal === 'strength' ? (kind && kind.startsWith('strength') ? kind : 'strength_volume') : goal === 'sport_support' ? 'sport_support' : kind && !kind.startsWith('strength') && kind !== 'sport_support' ? kind : 'hypertrophy';

  const input: BlockInput = {
    today,
    goal,
    priority: (goal === 'sport_support' ? 'sport' : settings.priority) as Priority,
    status: settings.training_status as Status,
    availableDays: settings.available_days,
    sessionMinutes: settings.session_minutes,
    maxLiftDays: settings.max_lift_days,
    equipment: settings.equipment as Equipment[],
    increments: settings.increments as Record<string, number>,
    sports,
    injuries: (injuries ?? []).map(mapInjury),
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
    startsOn: opts.startsOn ?? (activeBlock ? mondayOf(today) : undefined),
    dislikedExerciseIds: settings.disliked_exercise_ids,
    strengthLifts: settings.strength_lifts as MainLift[],
    targetAdjustments: adjustments,
    fromHeavyPhase: opts.fromHeavyPhase,
  };
  const plan = generateBlock(input);

  // Don't create a second session today if today's session is already started or done.
  const { data: todays } = await supabase
    .from('planned_sessions')
    .select('id,status,kind')
    .eq('user_id', userId)
    .eq('scheduled_on', today)
    .in('status', ['in_progress', 'done']);
  const todayLocked = (todays ?? []).some((s) => s.kind !== 'generated');
  const sessions = plan.sessions.filter((s) => !(todayLocked && s.date === today));

  const medianTarget = median(plan.targets.filter((t) => t.muscle !== 'front_delts').map((t) => t.target + t.sportTrim - (adjustments[t.muscle] ?? 0)));
  const { error } = await supabase.rpc('replace_future_plan', {
    p_from: today,
    p_block: toJson({
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
    }),
    p_targets: toJson(plan.weeklyTargets.map((t) => ({ week_index: t.weekIndex, muscle_id: t.muscle, target_sets: t.targetSets, sport_trim: t.sportTrim }))),
    p_sessions: toJson(sessions.map((s) => ({
      week_index: s.weekIndex,
      scheduled_on: s.date,
      template_key: s.templateKey,
      title: s.title,
      kind: s.kind,
      est_minutes: s.estMinutes,
      order_in_week: s.orderInWeek,
      exercises: s.exercises.map((e) => ({
        exercise_id: e.exerciseId,
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
    }))),
  });
  if (error) throw error;
  return plan;
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export async function latestBodyweight(supabase: Supa, userId: string, fallback: number | null): Promise<number | null> {
  const { data } = await supabase
    .from('checkins')
    .select('bodyweight_kg, day')
    .eq('user_id', userId)
    .not('bodyweight_kg', 'is', null)
    .order('day', { ascending: false })
    .limit(7);
  const ws = (data ?? []).map((d) => Number(d.bodyweight_kg));
  if (!ws.length) return fallback;
  return Math.round((ws.reduce((a, b) => a + b, 0) / ws.length) * 10) / 10;
}

/** Recomputes nutrition targets and writes a new nutrition_targets row (N-SPT-03: immediate, no proposal). */
export async function recomputeNutrition(
  supabase: Supa,
  userId: string,
  reason: string,
  opts?: { phase?: NutritionPhase; ratePct?: number; multiplier?: number; kcalOffsetDelta?: number; resetPhase?: boolean },
) {
  const [{ data: profile }, { data: settings }, { data: ns }, { data: sportRows }] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).single(),
    supabase.from('user_settings').select('*').eq('user_id', userId).single(),
    supabase.from('nutrition_settings').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('user_sports').select('*, sports(*)').eq('user_id', userId),
  ]);
  if (!profile || !settings) throw new Error('missing profile');
  const today = todayIn(profile.timezone);
  const kg = (await latestBodyweight(supabase, userId, profile.bodyweight_kg)) ?? 75;
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

  await supabase.from('nutrition_settings').upsert({
    user_id: userId,
    phase,
    activity_multiplier: base.multiplier,
    maintenance_kcal: base.maintenance,
    target_rate_pct: phase === 'loss' ? -ratePct : ratePct,
    phase_started_on: phaseChanged ? today : ns!.phase_started_on,
    last_adjusted_on: opts?.kcalOffsetDelta || opts?.multiplier ? today : (ns?.last_adjusted_on ?? null),
    initial_adjust_done: phaseChanged ? false : opts?.multiplier ? true : (ns?.initial_adjust_done ?? false),
    kcal_offset: offset,
    phase_history: toJson(newHistory),
  });
  await supabase.from('nutrition_targets').insert({
    user_id: userId,
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
  });
  return { ...base, kcal: final.kcal, fatG: final.fatG, carbsG: final.carbsG, warnings: base.warnings };
}
