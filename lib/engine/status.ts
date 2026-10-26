// Training status inference (Section 6.1). Rules: T-STA-01…03.
import { STATUS_INFERENCE } from '@/lib/knowledge/constants';
import type { LoggedSet, Status, StatusInference } from './types';
import { daysBetween } from './util';

/** T-STA-02: status from onboarding answers when the user is unsure. */
export function statusFromYears(years: number): Status {
  return years < 1 ? 'novice' : 'intermediate'; // never auto-assign advanced
}

export function inferTrainingStatus(h: { sets: LoggedSet[]; today: string; anchorExerciseIds: string[] }): StatusInference {
  const working = h.sets.filter((s) => !s.isWarmup);
  if (!working.length) return { status: null, share: null, evidence: 'No training logged yet.', ruleIds: ['T-STA-03'] };
  const first = working.reduce((a, s) => (s.performedOn < a ? s.performedOn : a), working[0].performedOn);
  const weeks = daysBetween(first, h.today) / 7;
  if (weeks < STATUS_INFERENCE.minWeeks) {
    return { status: null, share: null, evidence: `Only ${Math.floor(weeks)} weeks of logs (need ${STATUS_INFERENCE.minWeeks}).`, ruleIds: ['T-STA-03'] };
  }
  let improved = 0;
  let total = 0;
  for (const id of h.anchorExerciseIds) {
    const byDay = new Map<string, LoggedSet>();
    for (const s of working.filter((x) => x.exerciseId === id).sort((a, b) => a.setIndex - b.setIndex)) {
      if (!byDay.has(s.performedOn)) byDay.set(s.performedOn, s);
    }
    const exps = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, s]) => s);
    for (let i = 1; i < exps.length; i++) {
      total++;
      const a = exps[i - 1];
      const b = exps[i];
      if ((b.loadKg ?? 0) > (a.loadKg ?? 0) || ((b.loadKg ?? 0) === (a.loadKg ?? 0) && b.reps > a.reps)) improved++;
    }
  }
  if (total < 6) return { status: null, share: null, evidence: 'Not enough repeated anchor-lift sessions yet.', ruleIds: ['T-STA-03'] };
  const share = improved / total;
  const status: Status = share >= STATUS_INFERENCE.novice ? 'novice' : share >= STATUS_INFERENCE.advanced ? 'intermediate' : 'advanced';
  return {
    status,
    share,
    evidence: `Your anchor lifts improved in ${Math.round(share * 100)}% of sessions over ${Math.floor(weeks)} weeks.`,
    ruleIds: ['T-STA-01', 'T-STA-03'],
  };
}
