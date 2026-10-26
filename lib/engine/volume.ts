// Weekly volume targets per muscle (Section 6.3). Rules: T-VOL-01…08, T-PRI-01, S-02, S-05, T-STR-02…04.
import { STRENGTH, VOLUME } from '@/lib/knowledge/constants';
import { sportTrims, hardSportSessionsPerWeek } from './sports';
import { LOWER_MUSCLES, TRACKED_MUSCLES, type BlockInput, type BlockKind, type MuscleTarget, type TrackedMuscle } from './types';
import { clamp } from './util';

export interface TargetResult {
  base: number;
  targets: MuscleTarget[];
  ruleIds: string[];
  notes: string[];
}

export function baseVolume(input: Pick<BlockInput, 'status' | 'goal' | 'priority' | 'sports' | 'history'>, kind: BlockKind): { base: number; ruleIds: string[]; notes: string[] } {
  const ruleIds = ['T-VOL-01', 'T-VOL-02', 'T-VOL-07'];
  const notes: string[] = [];
  const prev = input.history.previousBlock;
  let base = prev?.medianTargetBeforeTrims ?? VOLUME.baseByStatus[input.status];
  if (prev) notes.push(`Starts from your previous block's ${base} sets per muscle.`);
  else notes.push(`Starting volume for ${input.status === 'intermediate' || input.status === 'advanced' ? 'an' : 'a'} ${input.status} lifter: ${base} sets per muscle per week.`);

  const hard = hardSportSessionsPerWeek(input.sports);
  if (input.goal === 'sport_support' || input.priority === 'sport') {
    base = Math.min(base, VOLUME.sportPriorityBase);
    ruleIds.push('T-PRI-01');
    notes.push('Your sport comes first, so lifting volume stays minimal.');
  } else if (input.priority === 'balanced' && hard >= VOLUME.balancedSportThreshold) {
    base -= VOLUME.balancedSportPenalty;
    ruleIds.push('T-PRI-01', 'S-01');
    notes.push(`${hard} hard sport sessions a week: base volume −${VOLUME.balancedSportPenalty}.`);
  }
  if (input.goal === 'fat_loss' && base > VOLUME.fatLossCap) {
    base = VOLUME.fatLossCap;
    notes.push('Capped at 14 sets while dieting, since recovery is worse in a deficit.');
  }
  if (input.goal === 'strength') {
    ruleIds.push('T-STR-02');
    if (kind === 'strength_load') base = STRENGTH.secondaryTargetLoad + 2;
    else if (kind === 'strength_peak') base = STRENGTH.secondaryTargetPeak;
    else base = clamp(base, STRENGTH.volume.secondarySets[0], STRENGTH.volume.secondarySets[1]);
  }
  return { base, ruleIds, notes };
}

export function computeTargets(input: BlockInput, kind: BlockKind): TargetResult {
  const { base, ruleIds, notes } = baseVolume(input, kind);
  const trims = sportTrims(input.sports);
  const spec = input.status === 'advanced' ? input.specialization.slice(0, 2) : [];
  const specActive = spec.length > 0;
  if (specActive) ruleIds.push('T-VOL-08');
  const sportPriority = input.goal === 'sport_support' || input.priority === 'sport';
  const floor = kind === 'strength_peak' ? 2 : VOLUME.minEffective;

  const targets: MuscleTarget[] = TRACKED_MUSCLES.map((m) => {
    const mRules: string[] = ['T-VOL-01', 'T-VOL-02'];
    const trim = trims.total[m];
    let t: number;
    if (m === 'front_delts') {
      t = Math.max(VOLUME.minEffective, Math.round(base * VOLUME.frontDeltFactor) - trim);
      if (spec.includes(m)) t = Math.round(base * VOLUME.specialization.up);
    } else if (specActive) {
      t = spec.includes(m) ? Math.round(base * VOLUME.specialization.up) : Math.round(base * VOLUME.specialization.others);
      t -= trim;
      mRules.push('T-VOL-08');
    } else {
      t = base - trim;
    }
    if (trim > 0) mRules.push('S-02');
    const adj = input.targetAdjustments?.[m] ?? 0;
    t += adj;
    if (sportPriority && LOWER_MUSCLES.includes(m)) {
      t = Math.min(t, VOLUME.sportPriorityLowerCap);
      mRules.push('S-05');
    }
    const cap = spec.includes(m) ? VOLUME.ceiling : VOLUME.normalCap;
    t = clamp(t, floor, cap);
    return { muscle: m, base, sportTrim: trim, target: t, trimBySport: trims.bySport[m], ruleIds: mRules };
  });

  return { base, targets, ruleIds, notes };
}

/** Strength Load phase: supporting volume is cut by about one set per week (T-STR-03). */
export function weeklyTargetFor(kind: BlockKind, target: number, weekIndex: number): number {
  if (kind === 'strength_load') return Math.max(STRENGTH.load.secondarySets[0], target - weekIndex);
  return target;
}

export function targetsMap(targets: MuscleTarget[]): Record<TrackedMuscle, number> {
  return Object.fromEntries(targets.map((t) => [t.muscle, t.target])) as Record<TrackedMuscle, number>;
}
