// Autoregulated double progression (Section 6.10). Rules: T-PRG-01…06.
import { PROGRESSION } from '@/lib/knowledge/constants';
import { e1rmToLoad } from './e1rm';
import type { ExerciseHistory, Prescription, SessionSuggestion, SetContext, SetSuggestion } from './types';
import { roundDownToStep, roundToStep, roundUpToStep } from './util';

/** Called after each logged set: what should the next set look like? */
export function suggestNextSet(ctx: SetContext): SetSuggestion {
  const { rx, setIndex, load, reps, increment } = ctx;
  if (setIndex === 0) {
    if (reps >= rx.repMin && reps <= rx.repMax) {
      return { load, repsTarget: reps, ruleIds: ['T-PRG-02'] };
    }
    if (load == null) {
      return { load, repsTarget: reps < rx.repMin ? rx.repMin : rx.repMin + 1, ruleIds: ['T-PRG-03'] };
    }
    if (reps < rx.repMin) {
      const next = roundDownToStep(load * (1 - PROGRESSION.loadAdjustPerRep * (rx.repMin - reps)), increment);
      return { load: Math.max(0, next), repsTarget: rx.repMin, ruleIds: ['T-PRG-03'] };
    }
    const next = roundUpToStep(load * (1 + PROGRESSION.loadAdjustPerRep * (reps - rx.repMax)), increment);
    return { load: next, repsTarget: rx.repMin + 1, ruleIds: ['T-PRG-03'] };
  }
  // Later sets keep the load and aim for the reps just achieved; dropping below the range is fine.
  return { load, repsTarget: Math.max(rx.repMin - 1, reps), ruleIds: ['T-PRG-02'] };
}

/** Builds the next exposure of an exercise from its history. */
export function suggestNextSession(
  history: ExerciseHistory,
  rx: Pick<Prescription, 'repMin' | 'repMax' | 'rirMin' | 'rirMax'>,
): SessionSuggestion {
  const last = history.exposures[history.exposures.length - 1];
  const first = last?.sets[0];
  if (!first || first.load == null) {
    if (history.e1rm) {
      const repMid = Math.round((rx.repMin + rx.repMax) / 2);
      return {
        load: e1rmToLoad(history.e1rm, repMid + rx.rirMax, history.increment),
        repsTarget: repMid,
        ruleIds: ['T-PRG-01'],
      };
    }
    const repMid = Math.round((rx.repMin + rx.repMax) / 2);
    return {
      load: null,
      repsTarget: repMid,
      ruleIds: ['T-PRG-01'],
      hint: `Pick a weight you could lift about ${repMid + rx.rirMax} times, stopping with ${rx.rirMax} reps in the tank.`,
    };
  }
  const rir = first.rir ?? rx.rirMax;
  if (first.reps >= rx.repMax && rir >= rx.rirMax) {
    let inc = history.increment;
    // APP: heavy barbell lower-body compounds may jump 5 kg after two consecutive top-of-range sessions.
    if (history.heavyLowerBarbell && first.load >= PROGRESSION.heavyLowerJumpThresholdKg && history.exposures.length >= 2) {
      const prevFirst = history.exposures[history.exposures.length - 2].sets[0];
      if (prevFirst && prevFirst.reps >= rx.repMax && (prevFirst.rir ?? rx.rirMax) >= rx.rirMax) {
        inc = Math.max(inc, PROGRESSION.heavyLowerJumpKg);
      }
    }
    return { load: roundToStep(first.load + inc, history.increment), repsTarget: rx.repMin + 1, ruleIds: ['T-PRG-04'] };
  }
  return { load: first.load, repsTarget: Math.min(rx.repMax, first.reps + 1), ruleIds: ['T-PRG-02'] };
}

/** T-PRG-05: “Feeling strong +1 step” / “Feeling flat −1 step”. */
export function nudgeLoad(load: number | null, increment: number, dir: 1 | -1): number | null {
  if (load == null) return null;
  return Math.max(0, roundToStep(load + dir * increment, increment));
}

/** T-PRG-06 expected sessions between load increases. */
export const EXPECTED_SESSIONS_PER_LOAD_JUMP = { novice: 2.5, intermediate: 5, advanced: 10 } as const;
