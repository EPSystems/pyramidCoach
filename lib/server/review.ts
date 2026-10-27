import 'server-only';
import type { Supa } from '@/lib/supabase/server';
import { weeklyReview } from '@/lib/engine/fatigue';
import { planReview } from '@/lib/engine/plan-review';
import { detectPlateaus } from '@/lib/engine/plateau';
import { nutritionReview } from '@/lib/engine/nutrition-review';
import { addDays, mean } from '@/lib/engine/util';
import type { BlockKind, CheckinDay, Equipment, Goal, MuscleId, NutritionPhase, Proposal, ReviewKey, Status, TrackedMuscle, WeeklyState } from '@/lib/engine/types';
import { loadExercises, mapInjury, mapSet } from './context';
import { loadStoredPlan } from './proposals';
import { createLogger } from '@/lib/log';

const log = createLogger('server/review');

export async function buildWeeklyState(supabase: Supa, userId: string, today: string, weekStart: string, overrides?: Partial<Record<ReviewKey, boolean>>) {
  const [settingsRes, checkinsRes, setsRes, exercises, blockRes, nsRes, injuriesRes, reviewsRes] = await Promise.all([
    supabase.from('user_settings').select('*').eq('user_id', userId).single(),
    supabase.from('checkins').select('*').eq('user_id', userId).gte('day', addDays(weekStart, -35)).lt('day', addDays(weekStart, 7)),
    // The planned RIR floor rides along for the RIR-drift signal (T-RIR-01).
    supabase.from('logged_sets').select('*, planned_exercises(rir_min)').eq('user_id', userId).gte('performed_on', addDays(weekStart, -42)),
    loadExercises(supabase),
    supabase.from('blocks').select('*').eq('user_id', userId).eq('status', 'active').maybeSingle(),
    supabase.from('nutrition_settings').select('phase').eq('user_id', userId).maybeSingle(),
    supabase.from('injuries').select('*').eq('user_id', userId),
    // Earlier reviews, one row per week: status inferences (T-STA-03) and last week's yes-count (volume_change).
    supabase.from('weekly_reviews').select('week_start, yes_count, inferred_status, completed_at').eq('user_id', userId).lt('week_start', weekStart).order('week_start', { ascending: false }).limit(6),
  ]);
  // Failed reads fall back to defaults below (intermediate / lean_gain / no sets), which skews every weekly proposal.
  // They're listed in `failedReads` so callers that write (runWeeklyEngines) can refuse; the review page can still render.
  const { data: settings, error: settingsErr } = log.db('select user_settings', settingsRes, { userId });
  const { data: checkins, error: checkinsErr } = log.db('select checkins', checkinsRes, { userId });
  const { data: setRows, error: setsErr } = log.db('select logged_sets', setsRes, { userId });
  const { data: block, error: blockErr } = log.db('select active block', blockRes, { userId });
  const { data: ns, error: nsErr } = log.db('select nutrition_settings.phase', nsRes, { userId });
  const { data: injuryRows, error: injuriesErr } = log.db('select injuries', injuriesRes, { userId });
  const { data: reviews, error: reviewsErr } = log.db('select previous weekly_reviews', reviewsRes, { userId });
  // Targets of the reviewed week's block week (not week 0), clamped into the block.
  const weekIdx = block ? Math.min(Math.max(0, Math.floor((Date.parse(weekStart) - Date.parse(block.starts_on)) / 604800000)), block.weeks - 1) : 0;
  const { data: targetRows, error: targetsErr } = block
    ? log.db('select weekly_targets', await supabase.from('weekly_targets').select('muscle_id, target_sets').eq('block_id', block.id).eq('week_index', weekIdx), { blockId: block.id })
    : { data: [], error: null };
  const failedReads = Object.entries({
    user_settings: settingsErr,
    checkins: checkinsErr,
    logged_sets: setsErr,
    blocks: blockErr,
    nutrition_settings: nsErr,
    injuries: injuriesErr,
    weekly_reviews: reviewsErr,
    weekly_targets: targetsErr,
  })
    .filter(([, e]) => e)
    .map(([t]) => t);
  if (!settings) log.warn('no user_settings, using engine defaults', { userId });
  let all: Awaited<ReturnType<typeof loadStoredPlan>> = [];
  try {
    all = await loadStoredPlan(supabase, userId, weekStart);
  } catch {
    failedReads.push('planned_sessions');
  }
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
    sets: (setRows ?? []).map((r) => ({ ...mapSet(r), plannedRirMin: r.planned_exercises?.rir_min != null ? Number(r.planned_exercises.rir_min) : null })),
    exercises,
    mainLiftExerciseIds: exercises.filter((e) => e.mainLiftKey).map((e) => e.id),
    overrides,
    block: block ? { id: block.id, kind: block.kind as BlockKind, startsOn: block.starts_on, weeks: block.weeks, testDate: settings?.test_date } : null,
    status: (settings?.training_status ?? 'intermediate') as Status,
    // One inference per reviewed week, oldest first (T-STA-03: "two reviews in a row" = two different weeks).
    statusHistory: [...(reviews ?? [])].reverse().filter((r) => r.inferred_status).map((r) => r.inferred_status as Status),
    goal: (settings?.goal ?? 'lean_gain') as Goal,
    nutritionPhase: (ns?.phase as NutritionPhase | undefined) ?? 'maintain',
    injuries: (injuryRows ?? []).map(mapInjury),
    targets: Object.fromEntries((targetRows ?? []).map((x) => [x.muscle_id, Number(x.target_sets)])) as Partial<Record<TrackedMuscle, number>>,
    specialization: (settings?.specialization_muscles ?? []) as TrackedMuscle[],
    previousYesCount: previousYes(reviews ?? [], addDays(weekStart, -7)),
    dislikedExerciseIds: settings?.disliked_exercise_ids ?? [],
    equipment: settings ? (settings.equipment as Equipment[]) : undefined,
    availableDays: settings?.available_days,
  };
  return { state, settings, exercises, block, failedReads };
}

/** Runs every weekly engine check and returns proposals (training, plateau, nutrition). */
export async function runWeeklyEngines(supabase: Supa, userId: string, today: string, weekStart: string, overrides: Partial<Record<ReviewKey, boolean>>) {
  const { state, settings, exercises, block, failedReads } = await buildWeeklyState(supabase, userId, today, weekStart, overrides);
  // Proposals built from defaults would be wrong and get saved, so refuse instead.
  if (failedReads.length) throw new Error(`Could not load your data (${failedReads.join(', ')}). Please try again.`);
  const review = weeklyReview(state);
  const proposals: Proposal[] = [...review.proposals, ...planReview(state, review.yesCount)];

  // Plateaus (6.12.5) on anchor lifts: the first exercise of each upcoming session + main lifts.
  const anchors = new Set<string>();
  for (const s of [...state.sessionsThisWeek, ...state.nextWeekSessions]) if (s.exercises[0]) anchors.add(s.exercises[0].exerciseId);
  const sleep7 = state.checkins.filter((c) => c.day >= weekStart && c.sleepHours != null).map((c) => c.sleepHours!);
  const freq: Record<string, number> = {};
  for (const s of state.nextWeekSessions) for (const e of s.exercises) freq[e.exerciseId] = (freq[e.exerciseId] ?? 0) + 1;
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
      // The reviewed week's targets (buildWeeklyState), not the block's first week.
      targets: state.targets ?? {},
      selection: state.equipment ? { equipment: state.equipment, injuries: (state.injuries ?? []).filter((i) => i.status !== 'resolved'), disliked: state.dislikedExerciseIds ?? [] } : undefined,
    }),
  );

  const nutrition = await nutritionReviewFor(supabase, userId, today, state.status);
  proposals.push(...nutrition.proposals);
  return { review, proposals, nutritionNotes: nutrition.notes, settings, state, block };
}

function previousYes(reviews: { week_start: string; yes_count: number | null; completed_at: string | null }[], prevWeek: string): number | null {
  const prev = reviews.find((r) => r.week_start === prevWeek && r.completed_at);
  return prev ? (prev.yes_count ?? 0) : null;
}

/** Nutrition review (7.6). Also used by the review page to show its notes (e.g. "trend on target"). */
export async function nutritionReviewFor(supabase: Supa, userId: string, today: string, status: Status): Promise<{ proposals: Proposal[]; notes: string[] }> {
  const { data: ns, error: nsErr } = log.db('select nutrition_settings', await supabase.from('nutrition_settings').select('*').eq('user_id', userId).maybeSingle(), { userId });
  const { data: nt, error: ntErr } = log.db(
    'select latest nutrition_targets',
    await supabase.from('nutrition_targets').select('kcal').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    { userId },
  );
  const { data: weighRows, error: weighErr } = log.db(
    'select weigh-ins',
    await supabase.from('checkins').select('day, bodyweight_kg').eq('user_id', userId).not('bodyweight_kg', 'is', null).gte('day', addDays(today, -70)),
    { userId },
  );
  // Missing weigh-ins would make the nutrition review propose calorie changes from no data.
  if (nsErr || ntErr || weighErr) throw new Error('Could not load your nutrition data. Please try again.');
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
      status,
      targetRatePct: Math.abs(Number(ns.target_rate_pct)),
      weighIns: ins,
      initialAdjustDone: ns.initial_adjust_done,
    });
    return { proposals: nr.proposals, notes: nr.notes };
  }
  log.debug('nutrition review skipped', { userId, hasSettings: !!ns, hasTargets: !!nt });
  return { proposals: [], notes: [] };
}
