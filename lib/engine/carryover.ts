// Carry the user's own edits (moves, skips, session-only swaps) from a replaced plan into the regenerated one.
// Sessions are matched by a stable key, not by row id or date: week Monday | template | occurrence (docs/DECISIONS.md, "Plan carry-over").
import type { PlannedSession } from './types';
import { mondayOf } from './util';

/** Stable identity of a planned session: which week, which template, which occurrence of it in that week (0-based). */
export function planKey(engineDate: string, templateKey: string, occurrence: number): string {
  return `${mondayOf(engineDate)}|${templateKey}|${occurrence}`;
}

/** A session of the plan being replaced, as stored. */
export interface PriorSession {
  planKey: string;
  /** The engine's date. */
  plannedOn: string;
  /** The user's date (differs from plannedOn after a move). */
  scheduledOn: string;
  /** 'done' covers in-progress and finished sessions: the regenerated copy is dropped so it isn't trained twice. */
  status: 'planned' | 'skipped' | 'done';
  /** Session-only swaps: the engine chose `fromExerciseId` for the slot and the user trains `toExerciseId`. */
  swaps: { slotKey: string; fromExerciseId: string; toExerciseId: string }[];
  /** Set when an accepted deload changed this session: sets per remaining slot (slots it removed are absent). */
  deload?: { setsBySlot: Record<string, number> };
}

export interface CarryOverInput {
  /** The regenerated sessions (materialised from this Monday, so sessions moved off a past day can still match). */
  sessions: PlannedSession[];
  prior: PriorSession[];
  today: string;
  /** Swapped-in exercises must still be allowed (equipment, dislikes, injuries); otherwise the engine's choice stands. */
  allowExercise: (exerciseId: string) => boolean;
}

export interface CarryOverResult {
  sessions: PlannedSession[];
  kept: { moves: number; skips: number; swaps: number; deloads: number };
  dropped: { moves: number; swaps: number };
}

/**
 * Re-applies the user's edits to matching regenerated sessions:
 * - skip: the session stays skipped;
 * - move: the session goes to the user's date, unless that date is in the past or now holds another session
 *   (the engine's dates win; a move that would collide falls back to the engine's date);
 * - session-only swap: re-applied when the engine picked the same exercise for that slot again and the swapped-in
 *   exercise is still allowed. If the engine now picks something else, the new choice reflects new settings and stands;
 * - deload: an accepted deload's set cuts and removed exercises are re-applied;
 * - done / in progress: the regenerated copy is dropped.
 * New sessions before today that no move carries forward are dropped (they were never trained or were missed).
 */
export function carryOverEdits(input: CarryOverInput): CarryOverResult {
  const { today } = input;
  const byKey = new Map(input.prior.map((p) => [p.planKey, p]));
  const kept = { moves: 0, skips: 0, swaps: 0, deloads: 0 };
  const dropped = { moves: 0, swaps: 0 };

  type Work = { s: PlannedSession; engineDate: string; moveTo: string | null };
  const work: Work[] = [];
  for (const s of input.sessions) {
    const p = s.planKey ? byKey.get(s.planKey) : undefined;
    if (p?.status === 'done') continue;
    const next: PlannedSession = { ...s, exercises: s.exercises.map((e) => ({ ...e })) };
    if (p?.status === 'skipped') {
      next.status = 'skipped';
      kept.skips++;
    }
    if (p?.deload) {
      // Re-apply an accepted deload (T-FAT-01/04): never more sets than the deloaded session had, removed slots stay removed.
      const by = p.deload.setsBySlot;
      next.exercises = next.exercises
        .filter((e) => e.slotKey in by)
        .map((e, position) => ({ ...e, position, sets: Math.min(e.sets, by[e.slotKey]) }));
      next.kind = 'deload';
      kept.deloads++;
    }
    if (p) {
      const usedIds = new Set(next.exercises.map((e) => e.exerciseId));
      for (const sw of p.swaps) {
        const e = next.exercises.find((x) => x.slotKey === sw.slotKey);
        if (e && e.exerciseId === sw.fromExerciseId && !usedIds.has(sw.toExerciseId) && input.allowExercise(sw.toExerciseId)) {
          e.originalExerciseId = e.exerciseId;
          e.exerciseId = sw.toExerciseId;
          e.suggestedLoadKg = null;
          usedIds.add(sw.toExerciseId);
          kept.swaps++;
        } else dropped.swaps++;
      }
    }
    const moveTo = p && p.scheduledOn !== p.plannedOn && p.scheduledOn >= today ? p.scheduledOn : null;
    work.push({ s: next, engineDate: s.date, moveTo });
  }

  // Accept every move, then revert moves that collide with another (non-skipped) session until none do.
  // Reverting only returns sessions to engine dates, which never collide with each other, so this terminates.
  const accepted = new Set(work.filter((w) => w.moveTo));
  const dateOf = (w: Work) => (accepted.has(w) ? w.moveTo! : w.engineDate);
  for (let changed = true; changed; ) {
    changed = false;
    const byDate = new Map<string, Work[]>();
    for (const w of work) if (w.s.status !== 'skipped') byDate.set(dateOf(w), [...(byDate.get(dateOf(w)) ?? []), w]);
    for (const group of byDate.values()) {
      if (group.length < 2) continue;
      for (const w of group) {
        if (accepted.delete(w)) changed = true;
      }
    }
  }

  const out: PlannedSession[] = [];
  for (const w of work) {
    if (w.moveTo) {
      if (accepted.has(w)) kept.moves++;
      else dropped.moves++;
    }
    const date = dateOf(w);
    if (date < today) continue;
    out.push(date === w.engineDate ? w.s : { ...w.s, date, plannedOn: w.engineDate });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.orderInWeek - b.orderInWeek));
  return { sessions: out, kept, dropped };
}
