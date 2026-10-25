// Distributing weekly sets across sessions (Section 6.8). Rules: T-FRQ-01, T-VOL-05, T-SEL-05.
import { FREQUENCY, SESSION_TIME } from '@/lib/knowledge/constants';
import { muscleWeight } from './counting';
import { isCompound, restFor } from './prescription';
import { ISOLATION_TAG_FOR, isPrimary, rankCandidates, type SelectionContext } from './selection';
import type { Region } from './split';
import { LOWER_MUSCLES, TRACKED_MUSCLES, type ExerciseDef, type TrackedMuscle } from './types';

export type WorkKind = 'normal' | 'single' | 'backoff';

export interface WorkExercise {
  ex: ExerciseDef;
  slotKey: string;
  sets: number;
  kind: WorkKind;
  fixed: boolean; // not adjustable by the distributor
  repsForCounting?: number; // fixed sets: only count if ≥ 4 reps
}

export interface WorkSession {
  templateKey: string;
  title: string;
  region: Region;
  variant: 'A' | 'B';
  exercises: WorkExercise[];
}

const counts = (w: WorkExercise) => w.kind === 'normal' || (w.repsForCounting ?? 0) >= 4;

export function sessionMuscleSets(s: WorkSession, m: string): number {
  let total = 0;
  for (const w of s.exercises) if (counts(w)) total += w.sets * muscleWeight(w.ex, m as TrackedMuscle);
  return total;
}

export function weeklyMuscleSets(sessions: WorkSession[], m: string): number {
  return sessions.reduce((a, s) => a + sessionMuscleSets(s, m), 0);
}

export function estimateMinutes(s: WorkSession): number {
  let secs = 0;
  for (const w of s.exercises) {
    const work = isCompound(w.ex.category) ? SESSION_TIME.workSecondsCompound : SESSION_TIME.workSecondsIsolation;
    const rest = restFor(w.ex, { strengthMain: w.kind !== 'normal' });
    secs += w.sets * (work + rest);
  }
  return Math.round(secs / 60 + SESSION_TIME.warmupMinutes);
}

const regionAllows = (region: Region, m: TrackedMuscle) =>
  region === 'full' || (region === 'lower' ? LOWER_MUSCLES.includes(m) : !LOWER_MUSCLES.includes(m));

/**
 * Adjusts set counts so each tracked muscle lands within target −0.5 … target +1
 * without exceeding ~11 sets per muscle per session (T-FRQ-01) or 2–5 sets per exercise.
 */
export function distribute(
  sessions: WorkSession[],
  targets: Record<TrackedMuscle, number>,
  selCtx: SelectionContext,
): { sessions: WorkSession[]; unmet: TrackedMuscle[] } {
  const maxPerSession = FREQUENCY.maxSetsPerMusclePerSession;
  const order = [...TRACKED_MUSCLES].sort((a, b) => targets[b] - targets[a] || TRACKED_MUSCLES.indexOf(a) - TRACKED_MUSCLES.indexOf(b));

  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    // ---- add sets ----
    for (const m of order) {
      let guard = 0;
      while (weeklyMuscleSets(sessions, m) < targets[m] - 0.5 && guard++ < 60) {
        // 1) add a set to an exercise below the soft cap; 2) spread to a session that doesn't train m yet;
        // 3) go up to the hard cap of 5 sets; 4) add an isolation anywhere it fits.
        if (addSetToExercise(sessions, m, SOFT_CAP, maxPerSession) || addIsolation(sessions, m, selCtx, maxPerSession, true) ||
            addSetToExercise(sessions, m, SESSION_TIME.maxSetsPerExercise, maxPerSession) || addIsolation(sessions, m, selCtx, maxPerSession, false)) {
          changed = true;
          continue;
        }
        break;
      }
    }
    // ---- remove sets ----
    for (const m of order) {
      if (m === 'front_delts') continue; // pressing covers front delts; never trimmed for being "over"
      let guard = 0;
      while (weeklyMuscleSets(sessions, m) > targets[m] + 1 && guard++ < 60) {
        let best: { si: number; ei: number; key: number[] } | null = null;
        sessions.forEach((s, si) => {
          s.exercises.forEach((w, ei) => {
            if (w.fixed || !isPrimary(w.ex, m) || w.sets <= SESSION_TIME.minSetsPerExercise) return;
            // Don't push another primary muscle of this exercise below its target.
            for (const em of w.ex.muscles) {
              if (em.role !== 'primary' || em.muscle === m || em.muscle === 'front_delts') continue;
              if (!(TRACKED_MUSCLES as readonly string[]).includes(em.muscle)) continue;
              const p = em.muscle as TrackedMuscle;
              if (weeklyMuscleSets(sessions, p) - 1 < targets[p] - 0.5) return;
            }
            const key = [-w.sets, -si, -ei];
            if (!best || lexLess(key, best.key)) best = { si, ei, key };
          });
        });
        if (!best) break;
        const b = best as { si: number; ei: number };
        sessions[b.si].exercises[b.ei].sets -= 1;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const unmet = TRACKED_MUSCLES.filter((m) => weeklyMuscleSets(sessions, m) < targets[m] - 0.5);
  return { sessions, unmet };
}

const SOFT_CAP = 4; // APP: spread volume to another session before taking an exercise to 5 sets

function addSetToExercise(sessions: WorkSession[], m: TrackedMuscle, cap: number, maxPerSession: number): boolean {
  let best: { si: number; ei: number; key: (number | string)[] } | null = null;
  sessions.forEach((s, si) => {
    const cur = sessionMuscleSets(s, m);
    const mins = estimateMinutes(s);
    s.exercises.forEach((w, ei) => {
      if (w.fixed || !isPrimary(w.ex, m) || w.sets >= cap) return;
      if (cur + muscleWeight(w.ex, m) > maxPerSession) return;
      const solePrimary = w.ex.muscles.filter((x) => x.role === 'primary').length === 1 ? 0 : 1;
      const key = [cur, mins, w.sets, solePrimary, si, ei];
      if (!best || lexLess(key, best.key)) best = { si, ei, key };
    });
  });
  if (!best) return false;
  const b = best as { si: number; ei: number };
  sessions[b.si].exercises[b.ei].sets += 1;
  return true;
}

function addIsolation(sessions: WorkSession[], m: TrackedMuscle, selCtx: SelectionContext, maxPerSession: number, onlyUntrained: boolean): boolean {
  const tags = ISOLATION_TAG_FOR[m];
  if (!tags) return false;
  const cands = sessions
    .map((s, si) => ({ s, si, cur: sessionMuscleSets(s, m), mins: estimateMinutes(s) }))
    .filter(({ s, cur }) => regionAllows(s.region, m) && s.exercises.length < SESSION_TIME.maxExercisesPerSession && cur + 2 <= maxPerSession)
    .filter(({ s }) => !onlyUntrained || !s.exercises.some((w) => isPrimary(w.ex, m)))
    .sort((a, b) => a.cur - b.cur || a.mins - b.mins || a.si - b.si);
  for (const { s } of cands) {
    const exclude = new Set(s.exercises.map((w) => w.ex.id));
    const pick = rankCandidates({ key: `extra_${m}`, tags }, selCtx, exclude).find((e) => isPrimary(e, m));
    if (!pick) continue;
    s.exercises.push({ ex: pick, slotKey: `extra_${m}`, sets: SESSION_TIME.minSetsPerExercise, kind: 'normal', fixed: false });
    return true;
  }
  return false;
}

function lexLess(a: (number | string)[], b: (number | string)[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}

/** T-SEL-05: main-lift singles first, then free-weight compounds, machines, isolation. */
export function orderSession(s: WorkSession): WorkSession {
  const tier = (w: WorkExercise) => {
    if (w.kind === 'single') return 0;
    if (w.kind === 'backoff') return 1;
    const c = w.ex.category;
    if (c === 'lower_free_compound' || c === 'upper_free_press') return 1;
    if (c === 'pulling_compound' && w.ex.equipment.some((e) => e === 'barbell' || e === 'bodyweight')) return 1;
    if (c === 'isolation') return 3;
    return 2;
  };
  const exercises = s.exercises
    .map((w, i) => ({ w, i }))
    .sort((a, b) => tier(a.w) - tier(b.w) || a.i - b.i)
    .map((x) => x.w);
  return { ...s, exercises };
}
