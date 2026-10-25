import 'server-only';
import type { Supa } from '@/lib/supabase/server';
import { weeklyReview } from '@/lib/engine/fatigue';
import { detectPlateaus } from '@/lib/engine/plateau';
import { nutritionReview } from '@/lib/engine/nutrition-review';
import { addDays, mean } from '@/lib/engine/util';
import type { BlockKind, CheckinDay, Goal, MuscleId, NutritionPhase, Proposal, ReviewKey, Status, TrackedMuscle, WeeklyState } from '@/lib/engine/types';
import { loadExercises, mapSet } from './context';
import { loadStoredPlan } from './proposals';

export async function buildWeeklyState(supabase: Supa, userId: string, today: string, weekStart: string, overrides?: Partial<Record<ReviewKey, boolean>>) {
  const [{ data: settings }, { data: checkins }, { data: setRows }, exercises, { data: block }, { data: ns }] = await Promise.all([
    supabase.from('user_settings').select('*').eq('user_id', userId).single(),
    supabase.from('checkins').select('*').eq('user_id', userId).gte('day', addDays(weekStart, -35)).lt('day', addDays(weekStart, 7)),
    supabase.from('logged_sets').select('*').eq('user_id', userId).gte('performed_on', addDays(weekStart, -42)),
    loadExercises(supabase),
    supabase.from('blocks').select('*').eq('user_id', userId).eq('status', 'active').maybeSingle(),
    supabase.from('nutrition_settings').select('phase').eq('user_id', userId).maybeSingle(),
  ]);
  const all = await loadStoredPlan(supabase, userId, weekStart);
  const nextWeek = addDays(weekStart, 7);
  const state: WeeklyState = {
    today,
    weekStart,
    checkins: (checkins ?? []).map(
      (c): CheckinDay => ({
        day: c.day,
        sleepHours: c.sleep_hours != null ? Number(c.sleep_hours) : null,
        energy: c.energy,
        stress: c.stress,
        soreness: (c.soreness as Partial<Record<MuscleId, 'sore' | 'pain'>>) ?? {},
        bodyweightKg: c.bodyweight_kg != null ? Number(c.bodyweight_kg) : null,
      }),
    ),
    sessionsThisWeek: all.filter((s) => s.date >= weekStart && s.date < nextWeek),
    nextWeekSessions: all.filter((s) => s.date >= nextWeek && s.date < addDays(nextWeek, 7)),
    sets: (setRows ?? []).map(mapSet),
    exercises,
    mainLiftExerciseIds: exercises.filter((e) => e.mainLiftKey).map((e) => e.id),
    overrides,
    block: block ? { id: block.id, kind: block.kind as BlockKind, startsOn: block.starts_on, weeks: block.weeks, testDate: settings?.test_date } : null,
    status: (settings?.training_status ?? 'intermediate') as Status,
    statusHistory: (settings?.status_history ?? []) as Status[],
    goal: (settings?.goal ?? 'lean_gain') as Goal,
    nutritionPhase: (ns?.phase as NutritionPhase | undefined) ?? 'maintain',
  };
  return { state, settings, exercises, block };
}

/** Runs every weekly engine check and returns proposals (training, plateau, nutrition). */
export async function runWeeklyEngines(supabase: Supa, userId: string, today: string, weekStart: string, overrides: Partial<Record<ReviewKey, boolean>>) {
  const { state, settings, exercises, block } = await buildWeeklyState(supabase, userId, today, weekStart, overrides);
  const review = weeklyReview(state);
  const proposals: Proposal[] = [...review.proposals];

  // Plateaus (6.12.5) on anchor lifts: the first exercise of each upcoming session + main lifts.
  const anchors = new Set<string>();
  for (const s of [...state.sessionsThisWeek, ...state.nextWeekSessions]) if (s.exercises[0]) anchors.add(s.exercises[0].exerciseId);
  const sleep7 = state.checkins.filter((c) => c.day >= weekStart && c.sleepHours != null).map((c) => c.sleepHours!);
  const freq: Record<string, number> = {};
  for (const s of state.nextWeekSessions) for (const e of s.exercises) freq[e.exerciseId] = (freq[e.exerciseId] ?? 0) + 1;
  let targets: Partial<Record<TrackedMuscle, number>> = {};
  if (block) {
    const { data: t } = await supabase.from('weekly_targets').select('muscle_id, target_sets').eq('block_id', block.id).eq('week_index', 0);
    targets = Object.fromEntries((t ?? []).map((x) => [x.muscle_id, Number(x.target_sets)]));
  }
  proposals.push(
    ...detectPlateaus({
      today,
      status: state.status,
      goal: state.goal,
      sets: state.sets,
      exercises,
      anchorExerciseIds: [...anchors],
      mainLiftExerciseIds: state.mainLiftExerciseIds.filter((id) => anchors.has(id)),
      sleepAvg7: sleep7.length ? mean(sleep7) : null,
      nutritionPhase: state.nutritionPhase ?? 'maintain',
      lastReviewYesCount: review.yesCount,
      weeklyFrequency: freq,
      targets,
    }),
  );

  // Nutrition (7.6).
  const { data: ns } = await supabase.from('nutrition_settings').select('*').eq('user_id', userId).maybeSingle();
  const { data: nt } = await supabase.from('nutrition_targets').select('kcal').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { data: weighRows } = await supabase.from('checkins').select('day, bodyweight_kg').eq('user_id', userId).not('bodyweight_kg', 'is', null).gte('day', addDays(today, -70));
  let nutritionNotes: string[] = [];
  if (ns && nt) {
    const ins = (weighRows ?? []).map((r) => ({ day: r.day, kg: Number(r.bodyweight_kg) }));
    const nr = nutritionReview({
      today,
      phase: ns.phase as NutritionPhase,
      phaseStartedOn: ns.phase_started_on,
      lastAdjustedOn: ns.last_adjusted_on,
      kcal: nt.kcal,
      multiplier: Number(ns.activity_multiplier),
      bodyweightKg: ins.length ? ins[ins.length - 1].kg : 75,
      status: state.status,
      targetRatePct: Math.abs(Number(ns.target_rate_pct)),
      weighIns: ins,
      initialAdjustDone: ns.initial_adjust_done,
    });
    proposals.push(...nr.proposals);
    nutritionNotes = nr.notes;
  }
  return { review, proposals, nutritionNotes, settings, state };
}
