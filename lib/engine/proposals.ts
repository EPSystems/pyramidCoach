// Proposal payload schemas + applyProposal (Section 6.14). Pure: returns a diff the server applies in one go.
import { z } from 'zod';
import { INTRO_WEEK } from '@/lib/knowledge/constants';
import { exercisesLoadingArea } from './fatigue';
import { isPrimary } from './selection';
import { ALL_MUSCLES, TRACKED_MUSCLES, type BlockKind, type ExerciseDef, type MuscleId, type PlannedSessionState, type Proposal, type Status, type TrackedMuscle } from './types';
import { addDays, roundHalfUp } from './util';

const muscle = z.enum(ALL_MUSCLES);
const tracked = z.enum(TRACKED_MUSCLES);
const status = z.enum(['novice', 'intermediate', 'advanced']);

export const PAYLOAD_SCHEMAS = {
  standard_deload: z.object({ weekStart: z.string(), setCutPct: z.number().min(0.3).max(0.5), mode: z.enum(['sets', 'fewer_sessions']) }),
  targeted_deload: z.object({ weekStart: z.string(), muscles: z.array(muscle), removeExerciseIds: z.array(z.string()), reduceSetsPct: z.number().min(0).max(1) }),
  intro_week: z.object({ blockId: z.string(), setPct: z.literal(0.75), rirBump: z.literal(1) }),
  volume_change: z.object({ changes: z.array(z.object({ muscle: tracked, from: z.number(), to: z.number() })) }),
  exercise_swap: z.object({ plannedExerciseIds: z.array(z.string()), fromExerciseId: z.string(), toExerciseId: z.string(), reason: z.string() }),
  block_transition: z.object({ fromKind: z.string(), toKind: z.string(), startsOn: z.string() }),
  plan_regenerate: z.object({ reason: z.string() }),
  status_change: z.object({ from: status, to: status, evidence: z.string() }),
  plateau_action: z.object({
    exerciseId: z.string(),
    step: z.enum(['fix_basics', 'deload', 'add_volume']),
    details: z.string(),
    changes: z.array(z.object({ muscle: tracked, from: z.number(), to: z.number() })).optional(),
  }),
  injury_adjust: z.object({ injuryId: z.string(), removeExerciseIds: z.array(z.string()), addExerciseIds: z.array(z.string()) }),
  calorie_adjust: z.object({ fromKcal: z.number(), toKcal: z.number(), reason: z.string() }),
  multiplier_adjust: z.object({ from: z.number(), to: z.number(), reason: z.string() }),
} as const;

export function validateProposal(p: Proposal): Proposal {
  const schema = PAYLOAD_SCHEMAS[p.kind];
  schema.parse(p.payload);
  return p;
}

export interface StoredPlan {
  sessions: PlannedSessionState[];
  exercises: ExerciseDef[];
  today: string;
}

export interface PlanDiff {
  exerciseUpdates: { id: string; sets?: number; rirMin?: number; rirMax?: number; exerciseId?: string }[];
  exerciseDeletes: string[];
  sessionUpdates: { id: string; status?: 'skipped'; kind?: 'deload' | 'intro' }[];
  regenerate?: {
    reason: string;
    blockKind?: BlockKind;
    startsOn?: string;
    fromHeavyPhase?: boolean;
    targetAdjustments?: Partial<Record<TrackedMuscle, number>>;
  };
  settings?: { trainingStatus?: Status };
  nutrition?: { kcal?: number; multiplier?: number };
  summary: string[];
}

const empty = (): PlanDiff => ({ exerciseUpdates: [], exerciseDeletes: [], sessionUpdates: [], summary: [] });

function inWeek(s: PlannedSessionState, weekStart: string) {
  return s.date >= weekStart && s.date < addDays(weekStart, 7) && s.status === 'planned';
}

/** Standard deload: cut sets on every exercise, keep loads/RIR/sessions (T-FAT-03). */
export function deloadDiff(plan: StoredPlan, weekStart: string, cutPct: number, mode: 'sets' | 'fewer_sessions'): PlanDiff {
  const d = empty();
  const week = plan.sessions.filter((s) => inWeek(s, weekStart)).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (mode === 'fewer_sessions') {
    week.slice(2).forEach((s) => d.sessionUpdates.push({ id: s.id, status: 'skipped' }));
    week.slice(0, 2).forEach((s) => d.sessionUpdates.push({ id: s.id, kind: 'deload' }));
    d.summary.push(`Keep 2 sessions in the week of ${weekStart}; skip ${Math.max(0, week.length - 2)}.`);
    return d;
  }
  for (const s of week) {
    d.sessionUpdates.push({ id: s.id, kind: 'deload' });
    for (const e of s.exercises) {
      const sets = Math.max(1, roundHalfUp(e.sets * (1 - cutPct)));
      if (sets !== e.sets) d.exerciseUpdates.push({ id: e.id, sets });
    }
  }
  d.summary.push(`Week of ${weekStart}: sets × ${(1 - cutPct).toFixed(1)} on ${week.length} sessions; loads and RIR unchanged.`);
  return d;
}

export function applyProposal(plan: StoredPlan, p: Proposal): PlanDiff {
  const exMap = new Map(plan.exercises.map((e) => [e.id, e]));
  switch (p.kind) {
    case 'standard_deload': {
      const pl = PAYLOAD_SCHEMAS.standard_deload.parse(p.payload);
      return deloadDiff(plan, pl.weekStart, pl.setCutPct, pl.mode);
    }
    case 'targeted_deload': {
      const pl = PAYLOAD_SCHEMAS.targeted_deload.parse(p.payload);
      const d = empty();
      for (const s of plan.sessions.filter((x) => inWeek(x, pl.weekStart))) {
        for (const e of s.exercises) {
          if (pl.removeExerciseIds.includes(e.exerciseId)) {
            d.exerciseDeletes.push(e.id);
            continue;
          }
          const ex = exMap.get(e.exerciseId);
          if (ex && pl.muscles.some((m: MuscleId) => exercisesLoadingArea(ex, m) === 'reduce' || (m !== 'erectors' && isPrimary(ex, m)))) {
            const sets = Math.max(1, roundHalfUp(e.sets * (1 - pl.reduceSetsPct)));
            if (sets !== e.sets) d.exerciseUpdates.push({ id: e.id, sets });
          }
        }
      }
      d.summary.push(`Removed ${d.exerciseDeletes.length} exercises and reduced ${d.exerciseUpdates.length} for ${pl.muscles.join(', ')}.`);
      return d;
    }
    case 'intro_week': {
      const d = empty();
      const first = [...plan.sessions].filter((s) => s.status === 'planned').sort((a, b) => (a.date < b.date ? -1 : 1))[0];
      if (!first) return d;
      const ws = addDays(first.date, 0);
      for (const s of plan.sessions.filter((x) => x.date >= ws && x.date < addDays(ws, 7) && x.status === 'planned')) {
        d.sessionUpdates.push({ id: s.id, kind: 'intro' });
        for (const e of s.exercises) {
          d.exerciseUpdates.push({
            id: e.id,
            sets: Math.max(1, roundHalfUp(e.sets * INTRO_WEEK.setPct)),
            rirMin: e.rirMin + INTRO_WEEK.rirBump,
            rirMax: e.rirMax + INTRO_WEEK.rirBump,
          });
        }
      }
      d.summary.push('Intro week: 75% of sets, +1 RIR.');
      return d;
    }
    case 'volume_change': {
      const pl = PAYLOAD_SCHEMAS.volume_change.parse(p.payload);
      const adj: Partial<Record<TrackedMuscle, number>> = {};
      for (const c of pl.changes) adj[c.muscle] = (adj[c.muscle] ?? 0) + (c.to - c.from);
      return { ...empty(), regenerate: { reason: 'volume_change', targetAdjustments: adj }, summary: pl.changes.map((c) => `${c.muscle}: ${c.from} → ${c.to} sets/week`) };
    }
    case 'plateau_action': {
      const pl = PAYLOAD_SCHEMAS.plateau_action.parse(p.payload);
      if (pl.step === 'deload') {
        const next = addDays(plan.today, 8 - isoWd(plan.today));
        return deloadDiff(plan, next, 0.4, 'sets');
      }
      if (pl.step === 'add_volume' && pl.changes?.length) {
        const adj: Partial<Record<TrackedMuscle, number>> = {};
        for (const c of pl.changes) adj[c.muscle] = (adj[c.muscle] ?? 0) + (c.to - c.from);
        return { ...empty(), regenerate: { reason: 'plateau_add_volume', targetAdjustments: adj }, summary: pl.changes.map((c) => `${c.muscle}: +${c.to - c.from} sets/week`) };
      }
      return { ...empty(), summary: ['Noted — fix the basics and reassess after another block.'] };
    }
    case 'exercise_swap': {
      const pl = PAYLOAD_SCHEMAS.exercise_swap.parse(p.payload);
      const d = empty();
      for (const s of plan.sessions.filter((x) => x.status === 'planned')) {
        for (const e of s.exercises) {
          if (pl.plannedExerciseIds.includes(e.id) || e.exerciseId === pl.fromExerciseId) d.exerciseUpdates.push({ id: e.id, exerciseId: pl.toExerciseId });
        }
      }
      d.summary.push(`Swapped ${d.exerciseUpdates.length} planned exercises.`);
      return d;
    }
    case 'block_transition': {
      const pl = PAYLOAD_SCHEMAS.block_transition.parse(p.payload);
      const heavy = pl.fromKind === 'strength_load' || pl.fromKind === 'strength_peak';
      return { ...empty(), regenerate: { reason: 'block_transition', blockKind: pl.toKind as BlockKind, startsOn: pl.startsOn, fromHeavyPhase: heavy }, summary: [`New ${pl.toKind} block from ${pl.startsOn}.`] };
    }
    case 'plan_regenerate':
    case 'injury_adjust':
      return { ...empty(), regenerate: { reason: p.kind }, summary: ['Plan regenerated from today.'] };
    case 'status_change': {
      const pl = PAYLOAD_SCHEMAS.status_change.parse(p.payload);
      return { ...empty(), settings: { trainingStatus: pl.to }, regenerate: { reason: 'status_change' }, summary: [`Status ${pl.from} → ${pl.to}.`] };
    }
    case 'calorie_adjust': {
      const pl = PAYLOAD_SCHEMAS.calorie_adjust.parse(p.payload);
      return { ...empty(), nutrition: { kcal: pl.toKcal }, summary: [`Calories ${pl.fromKcal} → ${pl.toKcal}.`] };
    }
    case 'multiplier_adjust': {
      const pl = PAYLOAD_SCHEMAS.multiplier_adjust.parse(p.payload);
      return { ...empty(), nutrition: { multiplier: pl.to }, summary: [`Activity factor ${pl.from} → ${pl.to}.`] };
    }
  }
}

function isoWd(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
