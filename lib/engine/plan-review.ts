// Weekly review → plan proposals (Section 6.12 / 6.14): the kinds that change the plan itself rather than one week.
// Rules: T-SEL-08 / T-SEL-04 (injury_adjust, exercise_swap), T-FAT-02/03 + T-VOL-07 (volume_change),
// T-SCH-01 / T-SEL-04 (plan_regenerate), T-FAT-06 (intro_week). Pure: plain objects in, proposals out.
import { DELOAD, INTRO_WEEK, REVIEW, REVIEW_PLAN, VOLUME } from '@/lib/knowledge/constants';
import { exercisesLoadingArea, label } from './fatigue';
import { hasEquipment, isPrimary, painfulMuscles, substitutionsFor } from './selection';
import { TRACKED_MUSCLES, type ExerciseDef, type MuscleId, type PlannedSessionState, type Proposal, type WeeklyState } from './types';
import { addDays, daysBetween, isoWeekday } from './util';

/** Planned sessions still ahead of `today` in the reviewed week and the one after it. */
function upcomingSessions(state: WeeklyState): PlannedSessionState[] {
  return [...state.sessionsThisWeek, ...state.nextWeekSessions].filter((s) => s.status === 'planned' && s.date >= state.today);
}

function plannedExercises(state: WeeklyState): ExerciseDef[] {
  const exMap = new Map(state.exercises.map((e) => [e.id, e]));
  const ids = new Set(upcomingSessions(state).flatMap((s) => s.exercises.map((e) => e.exerciseId)));
  return [...ids].map((id) => exMap.get(id)).filter((e): e is ExerciseDef => !!e);
}

const names = (xs: ExerciseDef[]) => xs.map((e) => e.name).join(', ');

/**
 * injury_adjust (T-SEL-08):
 * - a logged injury whose avoid list (or, for pain/injury severity, axial or impact work on the area) is still in the plan;
 * - pain tagged on the same area on ≥ 2 days in the last two reviewed weeks while the plan still loads it heavily.
 *   With no injury logged for the area, accepting logs one; a logged niggle is raised to "pain".
 * Resolved injuries get no proposal: the plan already regenerates when an injury is resolved, and previously avoided
 * exercises come back at the next block, when T-SEL-06 allows exercise changes.
 */
export function injuryProposals(state: WeeklyState): Proposal[] {
  const out: Proposal[] = [];
  const expires = addDays(state.today, REVIEW.proposalExpiryDays);
  const planned = plannedExercises(state);
  const active = (state.injuries ?? []).filter((i) => i.status !== 'resolved');
  const painful = new Set(painfulMuscles(active));

  for (const inj of active) {
    const conflicts = planned.filter(
      (ex) => inj.avoidExerciseIds.includes(ex.id) || (inj.muscleId != null && painful.has(inj.muscleId) && isPrimary(ex, inj.muscleId) && (ex.axialLoad || ex.impactLowerBody)),
    );
    if (!conflicts.length) continue;
    out.push({
      kind: 'injury_adjust',
      title: `Update your plan for ${inj.label}`,
      rationale: `Your plan still includes ${names(conflicts)}, which your ${inj.label} injury rules out. Rebuilding the plan from today swaps them for exercises that leave the area alone.`,
      ruleIds: ['T-SEL-08', 'T-SEL-04'],
      payload: { injuryId: inj.id, removeExerciseIds: conflicts.map((e) => e.id).sort(), addExerciseIds: [] },
      expiresOn: expires,
    });
  }

  // Recurring pain from check-ins.
  const weekEnd = addDays(state.weekStart, 7);
  const from = addDays(weekEnd, -REVIEW_PLAN.painLookbackDays);
  const painDays = new Map<MuscleId, number>();
  for (const c of state.checkins.filter((x) => x.day >= from && x.day < weekEnd)) {
    for (const [m, lvl] of Object.entries(c.soreness) as [MuscleId, string][]) if (lvl === 'pain') painDays.set(m, (painDays.get(m) ?? 0) + 1);
  }
  for (const [m, days] of [...painDays.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (days < REVIEW_PLAN.painDaysForInjury) continue;
    const logged = active.find((i) => i.muscleId === m);
    // A pain/injury entry already restricts the area; the first loop catches a stale plan.
    if (logged && logged.severity !== 'niggle') continue;
    const loading = planned.filter((ex) => exercisesLoadingArea(ex, m) === 'remove');
    if (!loading.length) continue;
    const area = label(m);
    out.push({
      kind: 'injury_adjust',
      title: logged ? `Treat your ${area} niggle as pain` : `Protect your ${area}: pain on ${days} days`,
      rationale: `You tagged ${area} as painful on ${days} of the last ${REVIEW_PLAN.painLookbackDays} days. ${logged ? `Raise "${logged.label}" to pain` : 'Log it as an injury (pain)'} and rebuild the plan without ${names(loading)}; machines, isolation work and higher reps take their place. If the pain is sharp or keeps coming back, see a physio.`,
      ruleIds: ['T-SEL-08', 'T-FAT-04'],
      payload: {
        injuryId: logged?.id ?? null,
        muscle: m,
        severity: 'pain',
        ...(logged ? {} : { label: `${area[0].toUpperCase()}${area.slice(1)} pain (from check-ins)` }),
        removeExerciseIds: loading.map((e) => e.id).sort(),
        addExerciseIds: [],
      },
      expiresOn: expires,
    });
  }
  return out;
}

/**
 * volume_change (T-FAT-02/03, T-VOL-07): two reviews in a row with a deload's worth of recovery flags means one deload
 * did not clear the fatigue, so cut 2 weekly sets for every muscle at or above the practical floor (never below 4).
 * More volume only ever follows a plateau with good recovery, which plateau_action (add_volume) already proposes.
 */
export function volumeProposals(state: WeeklyState, yesCount: number): Proposal[] {
  if (yesCount < DELOAD.yesThreshold || (state.previousYesCount ?? 0) < DELOAD.yesThreshold || !state.targets) return [];
  const changes = TRACKED_MUSCLES.flatMap((m) => {
    const from = state.targets?.[m];
    if (from == null || from < REVIEW_PLAN.volumeCutMinTarget) return [];
    const to = Math.max(VOLUME.minEffective, from - REVIEW_PLAN.volumeCutSets);
    return to < from ? [{ muscle: m, from, to }] : [];
  });
  if (!changes.length) return [];
  return [
    {
      kind: 'volume_change',
      title: `Trim weekly volume by ${REVIEW_PLAN.volumeCutSets} sets`,
      rationale: `Two weekly reviews in a row flagged poor recovery (${state.previousYesCount} then ${yesCount} of 5), so one deload is not enough. Train with ${REVIEW_PLAN.volumeCutSets} fewer weekly sets on your higher-volume muscles until recovery holds; add sets back only after a real plateau. This rebuilds the plan from today, so if you also want this week's deload, accept this first.`,
      ruleIds: ['T-FAT-02', 'T-FAT-03', 'T-VOL-07'],
      payload: { changes },
      expiresOn: addDays(state.today, REVIEW.proposalExpiryDays),
    },
  ];
}

/** exercise_swap (T-SEL-04): an exercise you marked as disliked is still planned; swap it for the closest feasible substitute. */
export function dislikeSwapProposals(state: WeeklyState): Proposal[] {
  const disliked = state.dislikedExerciseIds ?? [];
  if (!disliked.length || !state.equipment) return [];
  const ctx = { exercises: state.exercises, equipment: state.equipment, injuries: state.injuries ?? [], disliked };
  return plannedExercises(state)
    .filter((ex) => disliked.includes(ex.id))
    .flatMap((ex): Proposal[] => {
      const to = substitutionsFor(ex, ctx)[0];
      if (!to) return [];
      return [
        {
          kind: 'exercise_swap',
          title: `Swap ${ex.name} for ${to.name}`,
          rationale: `You marked ${ex.name} as an exercise you don't want, but it is still in your plan. ${to.name} trains the same muscles with your equipment.`,
          ruleIds: ['T-SEL-04'],
          payload: { plannedExerciseIds: [], fromExerciseId: ex.id, toExerciseId: to.id, reason: 'disliked' },
          expiresOn: addDays(state.today, REVIEW.proposalExpiryDays),
        },
      ];
    });
}

/**
 * plan_regenerate (T-SCH-01 / T-SEL-04): the stored plan no longer matches your settings, which happens when a settings
 * change saved but the automatic rebuild failed. Signals: 2+ sessions next week on days you are no longer available
 * (one could be a manual move), or a planned exercise that needs equipment you no longer have.
 */
export function stalePlanProposals(state: WeeklyState): Proposal[] {
  const reasons: string[] = [];
  if (state.availableDays?.length) {
    const off = state.nextWeekSessions.filter((s) => s.status === 'planned' && !state.availableDays!.includes(isoWeekday(s.date)));
    if (off.length >= 2) reasons.push(`${off.length} sessions next week fall on days you are not available`);
  }
  if (state.equipment) {
    const missing = plannedExercises(state).filter((ex) => !hasEquipment(ex, state.equipment!));
    if (missing.length) reasons.push(`${names(missing)} need${missing.length === 1 ? 's' : ''} equipment you no longer have`);
  }
  if (!reasons.length) return [];
  return [
    {
      kind: 'plan_regenerate',
      title: 'Rebuild your plan to match your settings',
      rationale: `Your plan is out of date: ${reasons.join('; ')}. Rebuilding from today keeps your logged history and uses your current days, equipment and preferences.`,
      ruleIds: ['T-SCH-01', 'T-SEL-04'],
      payload: { reason: reasons.join('; ') },
      expiresOn: addDays(state.today, REVIEW.proposalExpiryDays),
    },
  ];
}

/**
 * intro_week (T-FAT-06): coming back after 2+ weeks without a logged working set, run the next week at 75% of the sets
 * and one rep further from failure. Skipped when the upcoming week is already an intro or deload week, and when there
 * is no evidence of a break (no logs at all and no plan older than the break window, e.g. a brand-new user).
 */
export function introWeekProposals(state: WeeklyState): Proposal[] {
  if (!state.block) return [];
  const upcoming = upcomingSessions(state);
  if (!upcoming.length || upcoming.some((s) => s.kind === 'intro' || s.kind === 'deload')) return [];
  const breakDays = INTRO_WEEK.weeksOffTrigger * 7;
  const last = state.sets.filter((s) => !s.isWarmup && s.performedOn < state.today).reduce<string | null>((a, s) => (!a || s.performedOn > a ? s.performedOn : a), null);
  const daysOff = last ? daysBetween(last, state.today) : state.block.startsOn <= addDays(state.today, -breakDays) ? daysBetween(state.block.startsOn, state.today) : null;
  if (daysOff == null || daysOff < breakDays) return [];
  return [
    {
      kind: 'intro_week',
      title: 'Ease back in with an intro week',
      rationale: `${last ? `Your last logged set was ${daysOff} days ago` : `Nothing has been logged for ${daysOff} days`}. After time off, run the first week back at about 75% of the sets and one rep further from failure, then return to the full plan.`,
      ruleIds: ['T-FAT-06'],
      payload: { blockId: state.block.id, setPct: INTRO_WEEK.setPct, rirBump: INTRO_WEEK.rirBump },
      expiresOn: addDays(state.today, REVIEW.proposalExpiryDays),
    },
  ];
}

/** All plan-level proposals from the weekly review. */
export function planReview(state: WeeklyState, yesCount: number): Proposal[] {
  return [...injuryProposals(state), ...volumeProposals(state, yesCount), ...dislikeSwapProposals(state), ...stalePlanProposals(state), ...introWeekProposals(state)];
}
