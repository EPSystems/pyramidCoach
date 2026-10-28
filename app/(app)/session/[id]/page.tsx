import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireOnboarded, loadExercises, mapSet } from '@/lib/server/context';
import { exposuresFor, incrementFor } from '@/lib/engine/block';
import { bestRecentE1rm } from '@/lib/engine/e1rm';
import { loggedMuscleSets } from '@/lib/engine/counting';
import { EXPECTED_SESSIONS_PER_LOAD_JUMP, LOAD_PACE_STALL_FACTOR, suggestNextSession } from '@/lib/engine/progression';
import { singleLoad, backoffLoad } from '@/lib/engine/strength';
import { swapOptions } from '@/lib/engine/swap';
import { warmupRamp } from '@/lib/engine/prescription';
import { mondayOf } from '@/lib/engine/util';
import type { Equipment, LoggedSet, MainLift, Status } from '@/lib/engine/types';
import { createLogger } from '@/lib/log';
import { Logger, type LoggerExercise } from './logger';

export const metadata: Metadata = { title: 'Session' };

const log = createLogger('session/page');

const SET_COLS = 'exercise_id, performed_on, set_index, load_kg, reps, rir, is_warmup, session_id';

export default async function SessionPage({ params }: PageProps<'/session/[id]'>) {
  const { id } = await params;
  const ctx = await requireOnboarded();
  const { supabase, user, settings } = ctx;
  const status = settings.training_status as Status;
  // Enough exposures for bestRecentE1rm (last 3) and the T-PRG-06 pace check at this status.
  const exposures = Math.max(3, Math.ceil(EXPECTED_SESSIONS_PER_LOAD_JUMP[status] * LOAD_PACE_STALL_FACTOR));
  const weekStart = mondayOf(ctx.today);
  // One round trip: the history RPCs find the session's exercises themselves, so nothing here waits on the session row.
  const [{ data: session }, exercises, historyRes, bestRes, { data: thisSession }, weekRes] = await Promise.all([
    supabase
      .from('planned_sessions')
      .select('id, title, status, scheduled_on, kind, est_minutes, planned_exercises(id, exercise_id, position, sets, rep_min, rep_max, rir_min, rir_max, rest_seconds, suggested_load_kg, is_main_lift_single, skipped, label, note, rule_ids)')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle(),
    loadExercises(supabase),
    supabase.rpc('session_exercise_history', { p_session_id: id, p_exposures: exposures }),
    supabase.rpc('session_exercise_best_e1rm', { p_session_id: id }),
    supabase.from('logged_sets').select('planned_exercise_id, set_index, load_kg, reps, rir, is_warmup').eq('user_id', user.id).eq('session_id', id),
    // Earlier sets this week (other sessions), for the finish screen's weekly totals.
    supabase.from('logged_sets').select(SET_COLS).eq('user_id', user.id).gte('performed_on', weekStart).or(`session_id.is.null,session_id.neq.${id}`),
  ]);
  if (!session) notFound();
  log.db('rpc session_exercise_history', historyRes, { sessionId: id });
  log.db('rpc session_exercise_best_e1rm', bestRes, { sessionId: id });
  log.db('select week logged_sets', weekRes, { sessionId: id });
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const pes = [...session.planned_exercises].sort((a, b) => a.position - b.position);
  const before = (historyRes.data ?? []).map(mapSet);
  const bestById = new Map((bestRes.data ?? []).map((r) => [r.exercise_id, Number(r.best_e1rm)]));
  const weekSets: LoggedSet[] = (weekRes.data ?? []).map((r) => ({ exerciseId: r.exercise_id, performedOn: r.performed_on, setIndex: r.set_index, loadKg: r.load_kg, reps: r.reps, rir: r.rir, isWarmup: r.is_warmup, sessionId: r.session_id }));
  const weekBefore = loggedMuscleSets(weekSets, exMap, weekStart);
  const equipment = settings.equipment as Equipment[];
  const increments = settings.increments as Record<string, number>;
  const seeds = settings.e1rm_seeds as Partial<Record<MainLift, number>>;
  const ctxSel = { exercises, equipment, injuries: ctx.injuries, disliked: settings.disliked_exercise_ids };
  const firstCompoundId = pes.find((pe) => exMap.get(pe.exercise_id)?.category !== 'isolation')?.id;

  const list: LoggerExercise[] = pes.map((pe) => {
    const ex = exMap.get(pe.exercise_id)!;
    const inc = incrementFor(ex, equipment, increments);
    const rx = { repMin: pe.rep_min, repMax: pe.rep_max, rirMin: Number(pe.rir_min), rirMax: Number(pe.rir_max) };
    const exposures = exposuresFor(before, ex.id);
    const e1 = bestRecentE1rm(before, ex.id) ?? (ex.mainLiftKey ? (seeds[ex.mainLiftKey] ?? null) : null);
    let suggestion = suggestNextSession({ exposures, increment: inc, e1rm: e1, heavyLowerBarbell: ex.category === 'lower_free_compound' && ex.equipment.includes('barbell'), status }, rx);
    // Strength singles / back-offs use RPE-based loads from the e1RM (6.11). Back-offs are recognised by their
    // rule (only the engine's back-off prescription carries T-STR-03 without being a single), not by note text.
    const isBackoff = !pe.is_main_lift_single && (pe.rule_ids.includes('T-STR-03') || !!pe.label?.startsWith('Back-off'));
    if (pe.is_main_lift_single) suggestion = { load: singleLoad(e1, 10 - rx.rirMin, inc), repsTarget: 1, ruleIds: ['T-STR-02'] };
    else if (isBackoff) suggestion = { load: backoffLoad(e1, rx.repMin, 10 - rx.rirMin, inc), repsTarget: rx.repMin, ruleIds: ['T-STR-03'] };
    const last = exposures[exposures.length - 1];
    const compound = ex.category !== 'isolation';
    const showWarmup = compound && pe.id === firstCompoundId;
    const load = suggestion.load ?? (pe.suggested_load_kg != null ? Number(pe.suggested_load_kg) : null);
    const mine = (thisSession ?? []).filter((r) => r.planned_exercise_id === pe.id);
    return {
      plannedId: pe.id,
      exerciseId: ex.id,
      name: ex.name,
      slug: ex.slug,
      category: ex.category,
      muscles: ex.muscles,
      sets: pe.sets,
      rx,
      restSeconds: pe.rest_seconds,
      isSingle: !!pe.is_main_lift_single,
      label: pe.label,
      note: pe.note,
      skipped: pe.skipped,
      ruleIds: [...new Set([...pe.rule_ids, ...suggestion.ruleIds])],
      increment: inc,
      suggestion: { load, repsTarget: suggestion.repsTarget, hint: suggestion.hint ?? null },
      last: last ? { date: last.date, sets: last.sets.map((s) => ({ load: s.load, reps: s.reps })) } : null,
      bestE1rm: bestById.get(ex.id) ?? null,
      warmup: showWarmup && load ? warmupRamp(load, inc) : [],
      warmupLogged: mine.filter((r) => r.is_warmup).map((r) => r.set_index),
      logged: mine.filter((r) => !r.is_warmup).map((r) => ({ setIndex: r.set_index, load: r.load_kg, reps: r.reps, rir: r.rir })),
      subs: swapOptions(ex, ctxSel).map((s) => ({ id: s.id, name: s.name })),
    };
  });

  return (
    <Logger
      session={{ id: session.id, title: session.title, status: session.status, date: session.scheduled_on, kind: session.kind, estMinutes: session.est_minutes }}
      exercises={list}
      weekBefore={weekBefore}
      units={ctx.units}
    />
  );
}
