// generateBlock: the whole training block (Sections 6.3–6.11).
import { DEFAULT_INCREMENTS, ENGINE_VERSION, FREQUENCY, INTRO_WEEK, SESSION_TIME, VOLUME } from '@/lib/knowledge/constants';
import { bestRecentE1rm } from './e1rm';
import { distribute, estimateMinutes, orderSession, sessionMuscleSets, type WorkExercise, type WorkSession } from './distribute';
import { formatRx, isCompound, prescribe, rangeLevel, restFor } from './prescription';
import { suggestNextSession } from './progression';
import { planKey } from './carryover';
import { placeSessions } from './schedule';
import { createLogger } from '@/lib/log';
import { injuryNote, painfulMuscles, selectForSlot, selectMainLift, type SelectionContext } from './selection';
import { chooseSplit, sessionVariant, TEMPLATES, type SplitDef } from './split';
import { hardSportSessionsPerWeek } from './sports';
import { backoffLoad, backoffReps, backoffSets, blockWeeks, defaultBlockKind, isStrengthKind, singleLoad, singleRpe } from './strength';
import {
  LOWER_MUSCLES,
  TRACKED_MUSCLES,
  type BlockInput,
  type BlockKind,
  type BlockPlan,
  type Equipment,
  type ExerciseDef,
  type ExerciseHistory,
  type LoggedSet,
  type MainLift,
  type PlannedExercise,
  type PlannedSession,
  type TrackedMuscle,
  type Warning,
} from './types';

const log = createLogger('engine/block');
import { computeTargets, targetsMap, weeklyTargetFor } from './volume';
import { addDays, isoWeekday, median, mondayOf, roundHalfUp } from './util';

/**
 * Load step for an exercise. A custom exercise's own step wins (the user knows that machine). A catalog step is a
 * minimum progression jump, so it never goes below the user's step for that equipment (the smallest jump they can make).
 */
export function incrementFor(ex: Pick<ExerciseDef, 'equipment' | 'defaultIncrementKg' | 'custom'>, equipment: Equipment[], increments: Record<string, number>): number {
  if (ex.custom && ex.defaultIncrementKg) return ex.defaultIncrementKg;
  const eq = ex.equipment.find((e) => equipment.includes(e)) ?? ex.equipment[0];
  const forEquipment = increments[eq] ?? DEFAULT_INCREMENTS[eq] ?? 2.5;
  return Math.max(ex.defaultIncrementKg ?? 0, forEquipment);
}

/** Exposures (sessions) of an exercise from logged sets, oldest first, working sets only. */
export function exposuresFor(sets: LoggedSet[], exerciseId: string): ExerciseHistory['exposures'] {
  const byDate = new Map<string, LoggedSet[]>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || s.isWarmup) continue;
    const key = s.sessionId ? `${s.performedOn}|${s.sessionId}` : s.performedOn;
    byDate.set(key, [...(byDate.get(key) ?? []), s]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, ss]) => ({
      date: k.slice(0, 10),
      sets: ss.sort((a, b) => a.setIndex - b.setIndex).map((s) => ({ load: s.loadKg, reps: s.reps, rir: s.rir })),
    }));
}

interface BuildCtx {
  input: BlockInput;
  kind: BlockKind;
  strength: boolean;
  sportPriority: boolean;
  selCtx: (templateKey: string) => SelectionContext;
  lifts: MainLift[];
  warnings: Warning[];
}

function buildBaseWeek(split: SplitDef, ctx: BuildCtx, weekIndex: number, weeks: number): WorkSession[] {
  const selections = new Map<string, WorkExercise[]>();
  const usedThisWeek = new Set<string>();
  for (const key of new Set(split.templates)) {
    const t = TEMPLATES[key];
    const sc = { ...ctx.selCtx(key), usedThisWeek };
    const used = new Set<string>();
    const list: WorkExercise[] = [];
    const mainsHere = new Set<MainLift>();
    for (const slot of t.slots) {
      if (slot.mainLift) {
        if (!ctx.strength || ctx.sportPriority || !ctx.lifts.includes(slot.mainLift)) continue;
        const ex = selectMainLift(slot.mainLift, sc);
        if (!ex) {
          log.debug('no feasible main lift', { template: key, lift: slot.mainLift });
          continue;
        }
        mainsHere.add(slot.mainLift);
        used.add(ex.id);
        list.push({ ex, slotKey: slot.key, sets: 1, kind: 'single', fixed: true, repsForCounting: 1 });
        if (ctx.kind === 'strength_volume') {
          list.push({ ex, slotKey: `${slot.key}_work`, sets: SESSION_TIME.startSetsCompound, kind: 'normal', fixed: false });
        } else {
          const n = backoffSets(ctx.kind, weekIndex, weeks);
          if (n > 0) list.push({ ex, slotKey: `${slot.key}_backoff`, sets: n, kind: 'backoff', fixed: true, repsForCounting: backoffReps(ctx.kind, weekIndex, weeks) });
        }
        continue;
      }
      if (ctx.strength && slot.replacedByMain && mainsHere.has(slot.replacedByMain)) continue;
      const ex = selectForSlot(slot, sc, used);
      if (!ex) {
        log.debug('no exercise for slot', { template: key, slot: slot.key });
        ctx.warnings.push({ code: 'NO_EXERCISE_FOR_SLOT', message: `No suitable exercise for “${slot.label}” in ${t.title} with your equipment and injuries.`, ruleIds: ['T-SEL-04'] });
        continue;
      }
      used.add(ex.id);
      usedThisWeek.add(ex.id);
      list.push({ ex, slotKey: slot.key, sets: isCompound(ex.category) ? SESSION_TIME.startSetsCompound : SESSION_TIME.startSetsIsolation, kind: 'normal', fixed: false });
    }
    selections.set(key, list);
  }
  return split.templates.map((key, i) => {
    const t = TEMPLATES[key];
    const dup = split.templates.filter((x) => x === key).length > 1;
    const variant = sessionVariant(split.templates, i);
    return {
      templateKey: key,
      title: dup ? `${t.title} · ${variant}` : t.title,
      region: t.region,
      variant,
      exercises: selections.get(key)!.map((w) => ({ ...w })),
    };
  });
}

function frequencyOk(sessions: WorkSession[], targets: Record<TrackedMuscle, number>): boolean {
  for (const m of TRACKED_MUSCLES) {
    const need = targets[m] <= 10 ? 1 : targets[m] <= 20 ? 2 : 3; // T-FRQ-02 (minimum frequency)
    const freq = sessions.filter((s) => sessionMuscleSets(s, m) >= 1).length;
    if (freq < need) return false;
  }
  return true;
}

function buildWeek(split: SplitDef, targets: Record<TrackedMuscle, number>, ctx: BuildCtx, weekIndex: number, weeks: number) {
  const base = buildBaseWeek(split, ctx, weekIndex, weeks);
  const anyCtx = ctx.selCtx(split.templates[0]);
  const { sessions, unmet } = distribute(base, targets, { ...anyCtx, previous: undefined });
  const ordered = sessions.map(orderSession);
  const minutes = ordered.map(estimateMinutes);
  const avgMinutes = minutes.reduce((a, b) => a + b, 0) / Math.max(1, minutes.length);
  return { sessions: ordered, unmet, maxMinutes: Math.max(...minutes), avgMinutes, minutes };
}

/** APP (6.3 time check): the week's average session fits, and no single session runs more than 15% over. */
export const SESSION_OVERRUN_TOLERANCE = 1.15;
function fitsTime(wk: { maxMinutes: number; avgMinutes: number }, sessionMinutes: number): boolean {
  return wk.avgMinutes <= sessionMinutes && wk.maxMinutes <= sessionMinutes * SESSION_OVERRUN_TOLERANCE;
}

export function generateBlock(input: BlockInput): BlockPlan {
  const kind = input.blockKind ?? defaultBlockKind(input.goal);
  const strength = isStrengthKind(kind);
  const weeks = blockWeeks(kind);
  const startsOn = input.startsOn ?? (isoWeekday(input.today) <= 3 ? mondayOf(input.today) : addDays(mondayOf(input.today), 7));
  const sportPriority = input.goal === 'sport_support' || input.priority === 'sport';
  const warnings: Warning[] = [];
  const explanations: BlockPlan['explanations'] = [];

  const targetRes = computeTargets(input, kind);
  let targets = targetsMap(targetRes.targets);
  explanations.push(...targetRes.notes.map((text) => ({ text, ruleIds: targetRes.ruleIds })));

  const prevSel = input.history.previousBlock?.selections ?? {};
  const selCtx = (templateKey: string): SelectionContext => ({
    exercises: input.exercises,
    equipment: input.equipment,
    injuries: input.injuries,
    disliked: input.dislikedExerciseIds ?? [],
    previous: prevSel[templateKey],
    sportPriority,
  });
  const ctx: BuildCtx = {
    input,
    kind,
    strength,
    sportPriority,
    selCtx,
    lifts: input.strengthLifts ?? ['squat', 'bench', 'deadlift'],
    warnings,
  };

  // ---------- T-SCH-01: how many lift days ----------
  const avail = [...new Set(input.availableDays)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  const userCap = input.maxLiftDays ?? 5;
  let kMax = Math.min(5, avail.length, userCap);
  // 6 days only when the user allows it and sessions are short. Strength uses ULF6, which keeps the main-lift slots (T-FRQ-03).
  if (input.sessionMinutes <= 45 && (input.maxLiftDays ?? 0) >= 6 && avail.length >= 6) kMax = 6;
  let kMin = Math.min(FREQUENCY.liftDays.min, kMax);
  if (input.status !== 'novice' && avail.length >= 3) kMin = Math.min(3, kMax);
  if (kMax < 1) {
    log.debug('no lifting days', { availableDays: input.availableDays.length, maxLiftDays: input.maxLiftDays });
    throw new Error('No available lifting days');
  }
  if (kMax < FREQUENCY.liftDays.min) {
    warnings.push({ code: 'LOW_FREQUENCY', message: 'With one lifting day per week, progress beyond maintenance is hard. Add a second day if you can.', ruleIds: ['T-FRQ-04'] });
  }

  const lowerTargetAvg = LOWER_MUSCLES.filter((m) => (TRACKED_MUSCLES as readonly string[]).includes(m)).reduce((a, m) => a + targets[m as TrackedMuscle], 0) / 4;
  const maxTarget = Math.max(...TRACKED_MUSCLES.map((m) => targets[m]));
  const splitFor = (k: number) =>
    k < 2 ? { split: { key: 'FB1', name: 'Full Body ×1', templates: ['full_a'] }, ruleIds: ['T-SPL-01'] } : chooseSplit(k, { style: input.splitStyle, goal: input.goal, lowerTargetAvg, maxTarget });

  let chosenK = kMax;
  let chosen: ReturnType<typeof buildWeek> | null = null;
  let chosenSplit = splitFor(kMax);
  for (let k = kMin; k <= kMax; k++) {
    const sp = splitFor(k);
    const wk = buildWeek(sp.split, targets, ctx, 0, weeks);
    if (fitsTime(wk, input.sessionMinutes) && wk.unmet.length === 0 && frequencyOk(wk.sessions, targets)) {
      chosenK = k;
      chosen = wk;
      chosenSplit = sp;
      break;
    }
  }
  if (!chosen) {
    // Time check (6.3): at the most days allowed, lower every non-specialised target by 1 until sessions fit.
    chosenK = kMax;
    chosenSplit = splitFor(kMax);
    let wk = buildWeek(chosenSplit.split, targets, ctx, 0, weeks);
    let guard = 0;
    while (!fitsTime(wk, input.sessionMinutes) && guard++ < 20) {
      const before = JSON.stringify(targets);
      const next = { ...targets };
      for (const m of TRACKED_MUSCLES) {
        if (input.specialization.includes(m)) continue;
        next[m] = Math.max(VOLUME.minEffective, next[m] - 1);
      }
      if (JSON.stringify(next) === before) break;
      targets = next;
      wk = buildWeek(chosenSplit.split, targets, ctx, 0, weeks);
    }
    if (!fitsTime(wk, input.sessionMinutes)) {
      warnings.push({
        code: 'TIME_TOO_SHORT',
        message: `Even at minimum volume, sessions need about ${wk.maxMinutes} min. Add more time per session or more days.`,
        ruleIds: ['T-VOL-04', 'T-SCH-01'],
      });
    }
    chosen = wk;
  }
  explanations.push({
    text: `${chosenK} lifting day${chosenK === 1 ? '' : 's'} (${chosenSplit.split.name}): the fewest that keep every session within ${input.sessionMinutes} min and every muscle at a workable frequency.`,
    ruleIds: ['T-SCH-01', 'T-FRQ-02', 'T-FRQ-04', ...chosenSplit.ruleIds],
  });

  // ---------- Day placement ----------
  const schedule = placeSessions({ availableDays: avail, templates: chosenSplit.split.templates, sports: input.sports, goal: input.goal, liftingTime: input.liftingTime });
  if (schedule.penalties.some((p) => p.rule === 'T-SCH-02')) {
    warnings.push({ code: 'NO_REST_DAY', message: 'Your week has no full rest day. Consider freeing one day.', ruleIds: ['T-SCH-02'] });
  }
  if (schedule.penalties.some((p) => p.rule === 'T-SCH-04' && p.points >= 10)) {
    warnings.push({ code: 'SCHEDULE_CONFLICT', message: 'A leg session could not avoid the day before or after a hard sport session.', ruleIds: ['T-SCH-04'] });
  }
  if (input.sports.length) {
    explanations.push({ text: 'Sport days are fixed; lifting days were placed around them.', ruleIds: ['S-03', 'T-SCH-03', 'T-SCH-04'] });
  }

  // ---------- Intro week (T-FAT-06) ----------
  const avgTarget = median(TRACKED_MUSCLES.filter((m) => m !== 'front_delts').map((m) => targets[m]));
  const recent = input.history.recentAvgWeeklySets;
  let introWeek = false;
  if (!strength || kind === 'strength_volume') {
    if (input.fromHeavyPhase) introWeek = true;
    if ((input.history.weeksOff ?? 0) >= INTRO_WEEK.weeksOffTrigger) introWeek = true;
    if (recent != null && recent > 0 && avgTarget > recent * (1 + INTRO_WEEK.volumeJumpTrigger)) introWeek = true;
  }
  if (introWeek) explanations.push({ text: 'Week 1 is an intro week: about 75% of the sets and one more rep in reserve.', ruleIds: ['T-FAT-06'] });

  if (painfulMuscles(input.injuries).length) {
    warnings.push({
      code: 'INJURY_RED_FLAG',
      message: 'Exercises that load a painful area heavily were removed. If pain is persistent or reproducible, see a physio or sports doctor.',
      ruleIds: ['T-SEL-08'],
    });
  }

  // ---------- Materialise weeks ----------
  const rotation = schedule.placements.map((p) => p.templateKey);
  // Placements are in weekday order; map each to the session built for that template occurrence.
  const occurrences = new Map<string, number>();
  const weekSessionsBase = chosen.sessions;
  const sessionForPlacement = rotation.map((key) => {
    const n = occurrences.get(key) ?? 0;
    occurrences.set(key, n + 1);
    const idxs = weekSessionsBase.map((s, i) => (s.templateKey === key ? i : -1)).filter((i) => i >= 0);
    return idxs[n % idxs.length];
  });

  const lastSel: Record<string, Record<string, string>> = {};
  for (const s of weekSessionsBase) {
    lastSel[s.templateKey] = lastSel[s.templateKey] ?? {};
    for (const w of s.exercises) if (!w.slotKey.startsWith('extra_')) lastSel[s.templateKey][w.slotKey.replace(/_(work|backoff)$/, '')] = w.ex.id;
  }

  const e1rmCache = new Map<string, number | null>();
  const e1rmFor = (ex: ExerciseDef): number | null => {
    if (!e1rmCache.has(ex.id)) {
      const fromLogs = bestRecentE1rm(input.history.sets, ex.id);
      const seed = ex.mainLiftKey ? input.history.e1rmSeeds?.[ex.mainLiftKey] : undefined;
      e1rmCache.set(ex.id, fromLogs ?? seed ?? null);
    }
    return e1rmCache.get(ex.id)!;
  };

  const materialiseFrom = input.materialiseFrom && input.materialiseFrom < input.today ? input.materialiseFrom : input.today;
  const sessions: PlannedSession[] = [];
  const weeklyTargets: BlockPlan['weeklyTargets'] = [];
  let weekCache: ReturnType<typeof buildWeek> = chosen;
  for (let w = 0; w < weeks; w++) {
    const tw = Object.fromEntries(TRACKED_MUSCLES.map((m) => [m, weeklyTargetFor(kind, targets[m], w)])) as Record<TrackedMuscle, number>;
    for (const m of TRACKED_MUSCLES) {
      const t = targetRes.targets.find((x) => x.muscle === m)!;
      weeklyTargets.push({ weekIndex: w, muscle: m, targetSets: tw[m], sportTrim: t.sportTrim });
    }
    if (w > 0 && (strength || JSON.stringify(tw) !== JSON.stringify(targets))) {
      weekCache = buildWeek(chosenSplit.split, tw, ctx, w, weeks);
    } else if (w === 0) weekCache = chosen;
    const intro = introWeek && w === 0;
    schedule.placements.forEach((pl, order) => {
      const base = weekCache.sessions[sessionForPlacement[order]];
      const date = addDays(startsOn, w * 7 + (pl.weekday - 1));
      if (date < materialiseFrom) return;
      const occurrence = schedule.placements.slice(0, order).filter((x) => x.templateKey === pl.templateKey).length;
      sessions.push({
        ...materialiseSession(base, { date, weekIndex: w, orderInWeek: order, intro, kind, weeks, ctx, e1rmFor }),
        planKey: planKey(date, pl.templateKey, occurrence),
      });
    });
  }

  return {
    kind,
    startsOn,
    weeks,
    introWeek,
    splitKey: chosenSplit.split.key,
    liftDays: chosenK,
    engineVersion: ENGINE_VERSION,
    schedule,
    targets: targetRes.targets.map((t) => ({ ...t, target: targets[t.muscle] })),
    weeklyTargets,
    sessions,
    selections: lastSel,
    warnings: dedupeWarnings(warnings),
    explanations,
    hardSessionsPerWeek: hardSportSessionsPerWeek(input.sports),
  };
}

function dedupeWarnings(ws: Warning[]): Warning[] {
  const seen = new Set<string>();
  return ws.filter((w) => (seen.has(w.message) ? false : (seen.add(w.message), true)));
}

function materialiseSession(
  s: WorkSession,
  o: {
    date: string;
    weekIndex: number;
    orderInWeek: number;
    intro: boolean;
    kind: BlockKind;
    weeks: number;
    ctx: BuildCtx;
    e1rmFor: (ex: ExerciseDef) => number | null;
  },
): PlannedSession {
  const { input } = o.ctx;
  let compoundIdx = 0;
  let isoIdx = 0;
  const exercises: PlannedExercise[] = s.exercises.map((w, position) => {
    const inc = incrementFor(w.ex, input.equipment, input.increments);
    const e1 = o.e1rmFor(w.ex);
    if (w.kind === 'single') {
      const rpe = singleRpe(o.kind, o.weekIndex, o.weeks);
      const rir = 10 - rpe;
      const load = singleLoad(e1, rpe, inc);
      return {
        exerciseId: w.ex.id, slotKey: w.slotKey, position, sets: 1, repMin: 1, repMax: 1, rirMin: rir, rirMax: rir,
        restSeconds: restFor(w.ex, { strengthMain: true }), isMainLiftSingle: true,
        note: load ? `Top single @ RPE ${rpe}` : `Top single @ RPE ${rpe}. No estimate yet: work up to a weight you could do ~5 times`,
        suggestedLoadKg: load, ruleIds: ['T-STR-02', 'T-STR-03', 'T-RST-01', 'T-FRQ-03'],
      };
    }
    if (w.kind === 'backoff') {
      const reps = backoffReps(o.kind, o.weekIndex, o.weeks);
      const rpe = 7;
      return {
        exerciseId: w.ex.id, slotKey: w.slotKey, position, sets: w.sets, repMin: reps, repMax: reps, rirMin: 10 - rpe, rirMax: 10 - rpe,
        restSeconds: restFor(w.ex, { strengthMain: true }), note: `Back-off sets @ RPE ${rpe}`,
        suggestedLoadKg: backoffLoad(e1, reps, rpe, inc), ruleIds: ['T-STR-03', 'T-RST-01'],
      };
    }
    const compound = isCompound(w.ex.category);
    const level = rangeLevel({
      category: w.ex.category,
      compoundIndex: compound ? compoundIdx : -1,
      isolationIndex: compound ? -1 : isoIdx,
      variation: input.repVariation,
      variant: s.variant,
      weekIndex: o.weekIndex,
    });
    if (compound) compoundIdx++;
    else isoIdx++;
    const isLowerCompound = compound && (w.ex.category === 'lower_free_compound' || w.ex.category === 'lower_machine_compound');
    const rx = prescribe(w.ex, { level, sportPriority: o.ctx.sportPriority, isLowerCompound });
    let sets = w.sets;
    let rirMin = rx.rirMin;
    let rirMax = rx.rirMax;
    const ruleIds = [...rx.ruleIds, 'T-PRG-01'];
    if (o.intro) {
      sets = Math.max(1, roundHalfUp(sets * INTRO_WEEK.setPct));
      rirMin += INTRO_WEEK.rirBump;
      rirMax += INTRO_WEEK.rirBump;
      ruleIds.push('T-FAT-06');
    }
    const hist: ExerciseHistory = {
      exposures: exposuresFor(input.history.sets, w.ex.id),
      increment: inc,
      e1rm: e1,
      heavyLowerBarbell: w.ex.category === 'lower_free_compound' && w.ex.equipment.includes('barbell'),
    };
    const sug = suggestNextSession(hist, rx);
    const note = injuryNote(w.ex, input.injuries);
    if (note) ruleIds.push('T-SEL-08');
    return {
      exerciseId: w.ex.id, slotKey: w.slotKey, position, sets, repMin: rx.repMin, repMax: rx.repMax, rirMin, rirMax,
      restSeconds: rx.restSeconds, note, suggestedLoadKg: sug.load, ruleIds: [...ruleIds, ...sug.ruleIds],
    };
  });
  const est = estimateMinutes({ ...s, exercises: s.exercises.map((w, i) => ({ ...w, sets: exercises[i].sets })) });
  return {
    date: o.date,
    weekIndex: o.weekIndex,
    templateKey: s.templateKey,
    title: s.title,
    kind: o.intro ? 'intro' : 'lift',
    orderInWeek: o.orderInWeek,
    estMinutes: est,
    exercises,
  };
}

export { formatRx };
