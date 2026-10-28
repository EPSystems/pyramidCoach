// Weekly self-assessment, deloads, intro weeks (Section 6.12). Rules: T-FAT-01…05, T-FAT-08, T-RIR-01, T-STR-01, T-STA-03.
import { DELOAD, REVIEW, RIR_DRIFT, TARGETED_DELOAD } from '@/lib/knowledge/constants';
import { bestRecentE1rm, e1rm } from './e1rm';
import { isPrimary } from './selection';
import { inferTrainingStatus } from './status';
import { isStrengthKind, nextStrengthKind } from './strength';
import type { CheckinDay, ExerciseDef, LoggedSet, MuscleId, Proposal, ReviewAutofill, ReviewKey, StatusInference, WeeklyState } from './types';
import { addDays, daysBetween, mean, mondayOf, round1 } from './util';

const REVIEW_KEYS: ReviewKey[] = ['dreading_gym', 'sleep_worse', 'performance_down', 'stress_worse', 'aches_worse'];

const avgOf = (days: CheckinDay[], f: (c: CheckinDay) => number | null) => {
  const xs = days.map(f).filter((x): x is number => x != null);
  return xs.length ? mean(xs) : null;
};

export function autofillReview(state: WeeklyState): ReviewAutofill {
  const weekEnd = addDays(state.weekStart, 7);
  const week = state.checkins.filter((c) => c.day >= state.weekStart && c.day < weekEnd);
  const baselineFrom = addDays(state.weekStart, -28);
  const baseline = state.checkins.filter((c) => c.day >= baselineFrom && c.day < state.weekStart);
  const answers = {} as Record<ReviewKey, boolean>;
  const evidence = {} as Record<ReviewKey, string>;

  // Dreading the gym?
  const energy7 = avgOf(week, (c) => c.energy);
  const skipped = state.sessionsThisWeek.filter((s) => s.status === 'skipped' || (s.status === 'planned' && s.date < state.today)).length;
  answers.dreading_gym = (energy7 != null && energy7 <= REVIEW.energyDreadThreshold) || skipped >= REVIEW.skippedDreadThreshold;
  evidence.dreading_gym = `Energy avg ${energy7 == null ? '-' : round1(energy7)}/5 · ${skipped} session${skipped === 1 ? '' : 's'} skipped`;

  // Sleep worse than normal?
  const sleep7 = avgOf(week, (c) => c.sleepHours);
  const sleepBase = baseline.filter((c) => c.sleepHours != null).length >= 7 ? avgOf(baseline, (c) => c.sleepHours) : null;
  answers.sleep_worse = sleep7 != null && (sleepBase != null ? sleep7 < sleepBase - REVIEW.sleepDropHours : sleep7 < REVIEW.sleepNoBaseline);
  evidence.sleep_worse =
    sleep7 == null ? 'No sleep logged' : sleepBase != null ? `Sleep avg ${round1(sleep7)} h vs ${round1(sleepBase)} h normal` : `Sleep avg ${round1(sleep7)} h (no baseline yet; flag below 7 h)`;

  // Performance decreasing?
  const exMap = new Map(state.exercises.map((e) => [e.id, e]));
  const weekSets = state.sets.filter((s) => s.performedOn >= state.weekStart && s.performedOn < weekEnd && !s.isWarmup);
  const declined: string[] = [];
  for (const exId of new Set(weekSets.map((s) => s.exerciseId))) {
    const exposures = firstSets(state.sets, exId).filter((x) => x.date < weekEnd);
    const iThis = exposures.findIndex((x) => x.date >= state.weekStart);
    if (iThis <= 0) continue;
    const cur = exposures[iThis];
    const prev = exposures[iThis - 1];
    if (cur.load != null && prev.load != null && cur.load === prev.load && cur.reps < prev.reps) declined.push(exMap.get(exId)?.name ?? exId);
  }
  let mainDrop: string | null = null;
  for (const id of state.mainLiftExerciseIds) {
    const now = bestRecentE1rm(weekSets, id, 1);
    if (now == null) continue;
    const before = state.sets.filter((s) => s.exerciseId === id && s.performedOn >= addDays(state.weekStart, -21) && s.performedOn < state.weekStart && !s.isWarmup);
    let best: number | null = null;
    for (const s of before) {
      const v = e1rm(s.loadKg, s.reps, s.rir);
      if (v != null && (best == null || v > best)) best = v;
    }
    if (best != null && now < best * (1 - REVIEW.e1rmDropPct)) mainDrop = exMap.get(id)?.name ?? id;
  }
  const drift = rirDrift(state.sets, state.weekStart);
  const drifting = drift.exerciseIds.length >= RIR_DRIFT.exercises;
  answers.performance_down = declined.length >= REVIEW.perfDropExercises || mainDrop != null || drifting;
  const driftNames = drift.exerciseIds.slice(0, 3).map((id) => exMap.get(id)?.name ?? id);
  evidence.performance_down = mainDrop
    ? `${mainDrop} e1RM fell more than 3% vs its 3-week best`
    : declined.length >= REVIEW.perfDropExercises
      ? `Fewer reps at the same load on: ${declined.slice(0, 3).join(', ')}`
      : drifting
        ? `Sets felt harder than planned (about ${round1(drift.avgBelow ?? 0)} reps closer to failure) at the same load on: ${driftNames.join(', ')}`
        : declined.length
          ? `Fewer reps at the same load on: ${declined.slice(0, 3).join(', ')}`
          : 'No drops in first-set reps at the same load';

  // Stress worse?
  const stress7 = avgOf(week, (c) => c.stress);
  const stressBase = avgOf(baseline, (c) => c.stress);
  answers.stress_worse = stress7 != null && stressBase != null && stress7 >= stressBase + REVIEW.stressRise;
  evidence.stress_worse = stress7 == null ? 'No stress logged' : `Stress avg ${round1(stress7)}/5${stressBase != null ? ` vs ${round1(stressBase)} normal` : ''}`;

  // Aches and pains?
  const pain = week.some((c) => Object.values(c.soreness).includes('pain'));
  const soreThisWeek = week.reduce((a, c) => a + Object.values(c.soreness).filter((v) => v === 'sore').length, 0);
  const soreBaseWeekly = baseline.reduce((a, c) => a + Object.values(c.soreness).filter((v) => v === 'sore').length, 0) / 4;
  answers.aches_worse = pain || soreThisWeek > soreBaseWeekly + REVIEW.soreAboveAverage;
  evidence.aches_worse = pain ? 'Pain tagged this week' : `${soreThisWeek} sore tags vs ~${round1(soreBaseWeekly)} per week normally`;

  return { answers, evidence };
}

function firstSets(sets: WeeklyState['sets'], exId: string) {
  const byDay = new Map<string, WeeklyState['sets']>();
  for (const s of sets) {
    if (s.exerciseId !== exId || s.isWarmup) continue;
    byDay.set(s.performedOn, [...(byDay.get(s.performedOn) ?? []), s]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, ss]) => {
      const f = ss.sort((a, b) => a.setIndex - b.setIndex)[0];
      return { date, load: f.loadKg, reps: f.reps, rir: f.rir, plannedRirMin: f.plannedRirMin ?? null };
    });
}

/**
 * RIR drift (APP from T-RIR-01 / T-FAT-01): exercises whose first working set ended closer to failure than the
 * prescribed RIR floor on the last `RIR_DRIFT.consecutiveExposures` exposures (the latest in the reviewed week),
 * without a load jump between them. The same load feeling harder session after session is accumulated fatigue,
 * the same signal as "fewer reps at the same load". Sets logged without a plan or without RIR are ignored.
 */
export function rirDrift(sets: LoggedSet[], weekStart: string): { exerciseIds: string[]; avgBelow: number | null } {
  const weekEnd = addDays(weekStart, 7);
  const ids = new Set(sets.filter((s) => s.performedOn >= weekStart && s.performedOn < weekEnd && !s.isWarmup).map((s) => s.exerciseId));
  const out: string[] = [];
  const gaps: number[] = [];
  const n = RIR_DRIFT.consecutiveExposures;
  for (const id of ids) {
    const recent = firstSets(sets, id).filter((x) => x.date < weekEnd).slice(-n);
    if (recent.length < n || recent[n - 1].date < weekStart) continue;
    const harder = recent.every((x) => x.rir != null && x.plannedRirMin != null && x.rir <= x.plannedRirMin - RIR_DRIFT.minBelowFloor);
    if (!harder) continue;
    // A heavier load explains a lower RIR; only count it at the same (or a similar) load.
    const similarLoad = recent.every((x, i) => i === 0 || (x.load ?? 0) <= (recent[i - 1].load ?? 0) * (1 + RIR_DRIFT.similarLoadPct) + 1e-9);
    if (!similarLoad) continue;
    out.push(id);
    gaps.push(mean(recent.map((x) => x.plannedRirMin! - x.rir!)));
  }
  return { exerciseIds: out.sort(), avgBelow: gaps.length ? mean(gaps) : null };
}

/**
 * T-FAT-08 prompted by a low readiness score (APP, DECISIONS #29): the lightest other planned session left this week,
 * if it has fewer total sets than today's. Mirrors swapForLightest so the prompt only shows when the swap would work.
 */
export function lighterSessionFor(
  readinessScore: number | null,
  todaySession: { id: string; status: string; totalSets: number } | null,
  others: { id: string; title: string; date: string; status: string; totalSets: number }[],
  today: string,
): { id: string; title: string; date: string } | null {
  if (readinessScore == null || readinessScore > REVIEW.lowReadinessScore) return null;
  if (!todaySession || todaySession.status !== 'planned') return null;
  const weekEnd = addDays(mondayOf(today), 7);
  const pool = others.filter((s) => s.id !== todaySession.id && s.status === 'planned' && s.date >= today && s.date < weekEnd);
  const lightest = [...pool].sort((a, b) => a.totalSets - b.totalSets || (a.date < b.date ? -1 : 1))[0];
  return lightest && lightest.totalSets < todaySession.totalSets ? { id: lightest.id, title: lightest.title, date: lightest.date } : null;
}

/** Local soreness: muscles tagged pain at least once or sore on ≥2 days this week. */
export function localSoreMuscles(state: WeeklyState): MuscleId[] {
  const weekEnd = addDays(state.weekStart, 7);
  const week = state.checkins.filter((c) => c.day >= state.weekStart && c.day < weekEnd);
  const counts = new Map<MuscleId, { sore: number; pain: number }>();
  for (const c of week) {
    for (const [m, lvl] of Object.entries(c.soreness) as [MuscleId, string][]) {
      const cur = counts.get(m) ?? { sore: 0, pain: 0 };
      if (lvl === 'pain') cur.pain++;
      else cur.sore++;
      counts.set(m, cur);
    }
  }
  return [...counts.entries()].filter(([, v]) => v.pain > 0 || v.sore >= 2).map(([m]) => m).sort();
}

/** T-FAT-04: which exercises a targeted deload removes for a sore/painful area. */
export function exercisesLoadingArea(ex: ExerciseDef, m: MuscleId): 'remove' | 'reduce' | 'keep' {
  if (m === 'erectors') return ex.axialLoad ? 'remove' : isPrimary(ex, m) ? 'reduce' : 'keep';
  if (!isPrimary(ex, m)) return 'keep';
  if (ex.axialLoad || ex.impactLowerBody || ex.category === 'lower_free_compound' || ex.category === 'upper_free_press') return 'remove';
  return 'reduce';
}

export function weeklyReview(state: WeeklyState): {
  autofill: ReviewAutofill;
  answers: Record<ReviewKey, boolean>;
  yesCount: number;
  proposals: Proposal[];
  /** This week's status inference; the server stores it on the week's review row (one per week, T-STA-03). */
  inference: StatusInference;
} {
  const autofill = autofillReview(state);
  const answers = { ...autofill.answers, ...(state.overrides ?? {}) } as Record<ReviewKey, boolean>;
  const yesCount = REVIEW_KEYS.filter((k) => answers[k]).length;
  const nextWeek = addDays(state.weekStart, 7);
  const expires = addDays(state.today, REVIEW.proposalExpiryDays);
  const proposals: Proposal[] = [];
  const exMap = new Map(state.exercises.map((e) => [e.id, e]));

  if (yesCount >= DELOAD.yesThreshold) {
    proposals.push({
      kind: 'standard_deload',
      title: `Deload next week (${yesCount} of 5 recovery flags)`,
      rationale: `You answered “yes” to ${yesCount} recovery questions. Next week every exercise drops about 40% of its sets while loads, effort and the number of sessions stay the same.`,
      ruleIds: ['T-FAT-01', 'T-FAT-02', 'T-FAT-03'],
      payload: { weekStart: nextWeek, setCutPct: DELOAD.setCutDefault, mode: 'sets' },
      appliesFrom: nextWeek,
      expiresOn: expires,
    });
  }
  if (answers.aches_worse) {
    const muscles = localSoreMuscles(state);
    if (muscles.length) {
      const removeIds = new Set<string>();
      for (const s of state.nextWeekSessions) {
        for (const pe of s.exercises) {
          const ex = exMap.get(pe.exerciseId);
          if (!ex) continue;
          if (muscles.some((m) => exercisesLoadingArea(ex, m) === 'remove')) removeIds.add(ex.id);
        }
      }
      const names = [...removeIds].map((id) => exMap.get(id)?.name ?? id);
      const area = muscles.map(label).join(', ');
      proposals.push({
        kind: 'targeted_deload',
        title: `Ease off ${area} next week`,
        rationale: `${area} ${muscles.length > 1 ? 'have' : 'has'} been sore or painful. ${names.length ? `Remove ${names.join(', ')} for a week; ` : ''}other exercises for the area drop half their sets and everything else trains normally.`,
        ruleIds: ['T-FAT-04'],
        payload: { weekStart: nextWeek, muscles, removeExerciseIds: [...removeIds].sort(), reduceSetsPct: TARGETED_DELOAD.reduceSetsPct, mode: 'deload' },
        appliesFrom: nextWeek,
        expiresOn: expires,
      });
      // T-FAT-05: the alternative when heavy loads are the problem. Only offered when next week loads the area heavily.
      const heavy = new Set<string>();
      for (const s of state.nextWeekSessions) {
        for (const pe of s.exercises) {
          const ex = exMap.get(pe.exerciseId);
          if (ex && muscles.some((m) => isPrimary(ex, m) || (m === 'erectors' && ex.axialLoad)) && (ex.category !== 'isolation' || (pe.repMax != null && pe.repMax <= 10))) heavy.add(ex.id);
        }
      }
      if (heavy.size) {
        proposals.push({
          kind: 'targeted_deload',
          title: `Or: a higher-rep week for ${area}`,
          rationale: `If ${area} ache${muscles.length > 1 ? '' : 's'} with heavy loads but not with high reps, keep every exercise and set next week but switch the ones that work the area to higher reps with lighter loads. Pick this or the targeted deload, not both.`,
          ruleIds: ['T-FAT-05', 'T-FAT-04'],
          payload: { weekStart: nextWeek, muscles, removeExerciseIds: [], reduceSetsPct: 0, mode: 'higher_reps' },
          appliesFrom: nextWeek,
          expiresOn: expires,
        });
      }
    }
  }

  // Block end → transition proposal (T-STR-01 / 6.14).
  if (state.block) {
    const lastWeekStart = addDays(state.block.startsOn, (state.block.weeks - 1) * 7);
    if (state.weekStart >= lastWeekStart) {
      const fromKind = state.block.kind;
      const toKind = isStrengthKind(fromKind) ? nextStrengthKind(fromKind, state.block.testDate, state.today) : fromKind;
      proposals.push({
        kind: 'block_transition',
        title: `Start a new ${kindLabel(toKind)} block`,
        rationale:
          fromKind === 'strength_volume'
            ? `Your Volume phase is done. Next: a Load phase with heavier singles and fewer supporting sets.${yesCount >= 2 ? ' Take the deload first.' : ''}`
            : fromKind === 'strength_load' || fromKind === 'strength_peak'
              ? 'Heavy phase done. The next Volume phase starts with an intro week (75% sets, +1 RIR).'
              : 'Your block is complete. The next one keeps your exercises (swapping at most one or two) and carries your volume forward.',
        ruleIds: ['T-STR-01', 'T-SEL-06', ...(fromKind === 'strength_load' || fromKind === 'strength_peak' ? ['T-FAT-06'] : [])],
        payload: { fromKind, toKind, startsOn: nextWeek },
        appliesFrom: nextWeek,
        expiresOn: expires,
      });
    }
  }

  // Training status inference (T-STA-03).
  const inf = inferTrainingStatus({ sets: state.sets, today: state.today, anchorExerciseIds: statusAnchorIds(state) });
  const prevInf = state.statusHistory?.[state.statusHistory.length - 1];
  if (inf.status && inf.status !== state.status && prevInf === inf.status) {
    proposals.push({
      kind: 'status_change',
      title: `Update training status: ${state.status} → ${inf.status}`,
      rationale: `${inf.evidence} This matched ${inf.status} two reviews in a row.`,
      ruleIds: ['T-STA-01', 'T-STA-03'],
      payload: { from: state.status, to: inf.status, evidence: inf.evidence },
      expiresOn: expires,
    });
  }
  return { autofill, answers, yesCount, proposals, inference: inf };
}

/** Lifts that status inference looks at: main lifts plus each session's first exercise this week and next (T-STA-03). */
export function statusAnchorIds(state: Pick<WeeklyState, 'mainLiftExerciseIds' | 'sessionsThisWeek' | 'nextWeekSessions'>): string[] {
  const out = new Set<string>(state.mainLiftExerciseIds);
  for (const s of [...state.sessionsThisWeek, ...state.nextWeekSessions]) if (s.exercises[0]) out.add(s.exercises[0].exerciseId);
  return [...out];
}

const LABELS: Partial<Record<MuscleId, string>> = { erectors: 'lower back', front_delts: 'front delts', side_delts: 'side delts', rear_delts: 'rear delts' };
export const label = (m: MuscleId) => LABELS[m] ?? m;
export function kindLabel(k: string): string {
  return { hypertrophy: 'hypertrophy', strength_volume: 'strength Volume', strength_load: 'strength Load', strength_peak: 'strength Peak', sport_support: 'sport-support' }[k] ?? k;
}

/** Days until the weekly review is due (Sunday or first open after). */
export function reviewWeekFor(today: string, weekdayIso: number): string {
  // On Sunday review the current week, otherwise the previous Mon–Sun week.
  const monday = addDays(today, 1 - weekdayIso);
  return weekdayIso === 7 ? monday : addDays(monday, -7);
}

export const daysSince = (a: string, b: string) => daysBetween(a, b);
