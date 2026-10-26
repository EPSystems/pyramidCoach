// Nutrition adjustments from the bodyweight trend (Section 7.6). Rules: N-ADJ-01…06, N-WGT-02/04.
import { NUTRITION } from '@/lib/knowledge/constants';
import { ratePctPerWeek, weeklyAverages, type WeekAverage, type WeighIn } from './trend';
import type { NutritionPhase, Proposal, Status } from './types';
import { addDays, daysBetween, mondayOf, round1 } from './util';

export interface WeighInState {
  today: string;
  phase: NutritionPhase;
  phaseStartedOn: string;
  lastAdjustedOn?: string | null;
  kcal: number;
  multiplier: number;
  bodyweightKg: number;
  status: Status;
  targetRatePct: number; // loss: %/week; gain: %/month
  weighIns: WeighIn[];
  initialAdjustDone?: boolean;
}

function stepFor(kcal: number): number {
  return kcal >= 3000 ? NUTRITION.adjust.defaultOver : NUTRITION.adjust.defaultUnder;
}

function calorieProposal(state: WeighInState, change: number, reason: string, ruleIds: string[], extra?: string): Proposal {
  const toKcal = state.kcal + change;
  const dir = change < 0 ? 'Lower' : 'Raise';
  return {
    kind: 'calorie_adjust',
    title: `${dir} calories by ${Math.abs(change)} kcal (to ${toKcal})`,
    rationale: `${reason}${change < 0 ? ' The cut comes from carbs and fat; protein stays the same.' : ''}${extra ? ` ${extra}` : ''}`,
    ruleIds: [...ruleIds, 'N-ADJ-03', ...(change < 0 ? ['N-ADJ-04'] : [])],
    payload: { fromKcal: state.kcal, toKcal, reason },
    appliesFrom: addDays(mondayOf(state.today), 7),
    expiresOn: addDays(state.today, 7),
  };
}

/** Returns proposals (0 or 1) after a week closes. Pure. */
export function nutritionReview(state: WeighInState): { proposals: Proposal[]; weeks: WeekAverage[]; notes: string[] } {
  const notes: string[] = [];
  const thisMonday = mondayOf(state.today);
  const weeks = weeklyAverages(state.weighIns).filter((w) => w.weekStart < thisMonday); // completed weeks only
  const last = weeks[weeks.length - 1];
  if (!last) return { proposals: [], weeks, notes: ['No completed weigh-in weeks yet.'] };
  if (last.lowData) {
    notes.push('Last week had fewer than 3 weigh-ins or no weekend weigh-in, so no adjustment is made (N-WGT-02).');
    return { proposals: [], weeks, notes };
  }
  if (state.lastAdjustedOn && daysBetween(state.lastAdjustedOn, state.today) < NUTRITION.adjust.minDaysBetween) {
    notes.push('Calories changed less than 2 weeks ago, so waiting before judging again (N-ADJ-03).');
    return { proposals: [], weeks, notes };
  }
  const reliable = weeks.filter((w) => !w.lowData);
  const phaseWeek1 = mondayOf(state.phaseStartedOn);

  // ---------- N-ADJ-01: initial adjustment ----------
  if (!state.initialAdjustDone && state.phase !== 'maintain') {
    const w1 = reliable.find((w) => w.weekStart === phaseWeek1);
    const prior = reliable.find((w) => w.weekStart === addDays(phaseWeek1, -7));
    const w2 = reliable.find((w) => w.weekStart === addDays(phaseWeek1, 7));
    // Compare phase week 1 with the week before; with no prior week, compare week 2 with week 1.
    const pair: [WeekAverage, WeekAverage] | null = w1 && prior && last.weekStart === w1.weekStart ? [prior, w1] : !prior && w1 && w2 && last.weekStart === w2.weekStart ? [w1, w2] : null;
    if (pair) {
      const [a, b] = pair;
      const wrong = state.phase === 'gain' ? b.avg <= a.avg : b.avg >= a.avg;
      if (wrong) {
        const step = NUTRITION.adjust.initialMultiplierStep * (state.phase === 'gain' ? 1 : -1);
        const to = Math.round((state.multiplier + step) * 100) / 100;
        return {
          proposals: [
            {
              kind: 'multiplier_adjust',
              title: `Adjust activity factor ${state.multiplier.toFixed(2)} → ${to.toFixed(2)}`,
              rationale: `In the first week of your ${state.phase} phase your average weight went ${b.avg > a.avg ? 'up' : b.avg < a.avg ? 'down' : 'nowhere'} (${a.avg} → ${b.avg} kg). Your maintenance estimate is probably ${state.phase === 'gain' ? 'too low' : 'too high'}.`,
              ruleIds: ['N-ADJ-01', 'N-MNT-03'],
              payload: { from: state.multiplier, to, reason: 'initial week check' },
              appliesFrom: addDays(thisMonday, 0),
              expiresOn: addDays(state.today, 7),
            },
          ],
          weeks,
          notes,
        };
      }
      notes.push('First-week check passed: weight moved in the right direction.');
    }
  }

  // ---------- Ongoing adjustments (ignore the phase's first week, N-WGT-04) ----------
  const usable = reliable.filter((w) => w.weekStart > phaseWeek1);
  const window = state.phase === 'loss' ? (state.bodyweightKg < 60 ? 3 : 2) : 3;
  if (usable.length < 2) return { proposals: [], weeks, notes: [...notes, 'Not enough reliable weeks yet for a trend.'] };
  const end = usable[usable.length - 1];
  const startCandidates = usable.filter((w) => daysBetween(w.weekStart, end.weekStart) >= window * 7);
  const start = startCandidates[startCandidates.length - 1];
  if (!start) {
    return { proposals: [], weeks, notes: [...notes, `Waiting for ${window} weeks of trend data.`] };
  }
  const rate = ratePctPerWeek(start, end); // % per week, signed
  const step = stepFor(state.kcal);

  if (state.phase === 'loss') {
    const target = state.targetRatePct;
    const lo = target - NUTRITION.lossRatePctPerWeek.tolerance;
    const hi = target + NUTRITION.lossRatePctPerWeek.tolerance;
    const loss = -rate;
    if (loss < lo) {
      return {
        proposals: [
          calorieProposal(
            state,
            -step,
            `You're losing ${round1(loss)}% of bodyweight per week over ${window} weeks, below your ${target}% target (${lo}–${hi}%).`,
            ['N-ADJ-02'],
            'Alternative: add about 2,500 steps a day (~100 kcal) or up to three 30-minute moderate cardio sessions a week, kept apart from lifting (N-ADJ-05).',
          ),
        ],
        weeks,
        notes,
      };
    }
    if (loss > hi) {
      return { proposals: [calorieProposal(state, step, `You're losing ${round1(loss)}% per week, faster than your ${target}% target. Slower loss protects muscle.`, ['N-ADJ-02', 'N-RAT-01'])], weeks, notes };
    }
  } else if (state.phase === 'gain') {
    const monthly = rate * 4;
    const [lo, hi] = NUTRITION.gainRatePctPerMonth[state.status];
    if (monthly < lo) {
      return { proposals: [calorieProposal(state, step, `You're gaining ${round1(monthly)}% per month, below the ${lo}–${hi}% range for a ${state.status} lifter.`, ['N-ADJ-02', 'N-RAT-02'])], weeks, notes };
    }
    if (monthly > hi) {
      return { proposals: [calorieProposal(state, -step, `You're gaining ${round1(monthly)}% per month, above the ${lo}–${hi}% range, so most extra weight would be fat.`, ['N-ADJ-02', 'N-RAT-02'])], weeks, notes };
    }
  } else {
    const drift = NUTRITION.adjust.maintainDriftPctPerWeek;
    if (Math.abs(rate) > drift) {
      const change = rate > 0 ? -NUTRITION.adjust.maintainStep : NUTRITION.adjust.maintainStep;
      return { proposals: [calorieProposal(state, change, `At maintenance your weight drifted ${round1(rate)}% per week over 3 weeks.`, ['N-ADJ-06'])], weeks, notes };
    }
  }
  notes.push('Your weight trend is on target. No change.');
  return { proposals: [], weeks, notes };
}
