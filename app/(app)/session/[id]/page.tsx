import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireOnboarded, loadExercises, mapSet } from '@/lib/server/context';
import { exposuresFor, incrementFor } from '@/lib/engine/block';
import { bestRecentE1rm, e1rm } from '@/lib/engine/e1rm';
import { suggestNextSession } from '@/lib/engine/progression';
import { singleLoad, backoffLoad } from '@/lib/engine/strength';
import { substitutionsFor } from '@/lib/engine/selection';
import { warmupRamp } from '@/lib/engine/prescription';
import type { Equipment, MainLift } from '@/lib/engine/types';
import { Logger, type LoggerExercise } from './logger';

export const metadata: Metadata = { title: 'Session' };

export default async function SessionPage({ params }: PageProps<'/session/[id]'>) {
  const { id } = await params;
  const ctx = await requireOnboarded();
  const { supabase, user, settings } = ctx;
  const { data: session } = await supabase.from('planned_sessions').select('*, planned_exercises(*)').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (!session) notFound();
  const exercises = await loadExercises(supabase);
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const pes = [...session.planned_exercises].sort((a, b) => a.position - b.position);
  const exIds = [...new Set(pes.map((p) => p.exercise_id))];
  const { data: histRows } = await supabase
    .from('logged_sets')
    .select('*')
    .eq('user_id', user.id)
    .in('exercise_id', exIds.length ? exIds : ['00000000-0000-0000-0000-000000000000'])
    .order('performed_on', { ascending: false })
    .limit(600);
  const allSets = (histRows ?? []).map(mapSet);
  const thisSession = (histRows ?? []).filter((r) => r.session_id === id);
  const before = allSets.filter((s) => s.sessionId !== id);
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
    let suggestion = suggestNextSession({ exposures, increment: inc, e1rm: e1, heavyLowerBarbell: ex.category === 'lower_free_compound' && ex.equipment.includes('barbell') }, rx);
    // Strength singles / back-offs use RPE-based loads from the e1RM (6.11).
    if (pe.is_main_lift_single) suggestion = { load: singleLoad(e1, 10 - rx.rirMin, inc), repsTarget: 1, ruleIds: ['T-STR-02'] };
    else if (pe.note?.startsWith('Back-off')) suggestion = { load: backoffLoad(e1, rx.repMin, 10 - rx.rirMin, inc), repsTarget: rx.repMin, ruleIds: ['T-STR-03'] };
    const last = exposures[exposures.length - 1];
    const lastBest = before.filter((s) => s.exerciseId === ex.id).reduce((a, s) => Math.max(a, e1rm(s.loadKg, s.reps, s.rir) ?? 0), 0);
    const compound = ex.category !== 'isolation';
    const showWarmup = compound && pe.id === firstCompoundId;
    const load = suggestion.load ?? (pe.suggested_load_kg != null ? Number(pe.suggested_load_kg) : null);
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
      note: pe.note,
      skipped: pe.skipped,
      ruleIds: [...new Set([...pe.rule_ids, ...suggestion.ruleIds])],
      increment: inc,
      suggestion: { load, repsTarget: suggestion.repsTarget, hint: suggestion.hint ?? null },
      last: last ? { date: last.date, sets: last.sets.map((s) => ({ load: s.load, reps: s.reps })) } : null,
      bestE1rm: lastBest || null,
      warmup: showWarmup && load ? warmupRamp(load, inc) : [],
      logged: thisSession
        .filter((r) => r.planned_exercise_id === pe.id)
        .map((r) => ({ setIndex: r.set_index, load: r.load_kg, reps: r.reps, rir: r.rir })),
      subs: substitutionsFor(ex, ctxSel).slice(0, 8).map((s) => ({ id: s.id, name: s.name })),
    };
  });

  return (
    <Logger
      session={{ id: session.id, title: session.title, status: session.status, date: session.scheduled_on, kind: session.kind, estMinutes: session.est_minutes }}
      exercises={list}
      units={ctx.units}
    />
  );
}
