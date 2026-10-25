// Nutrition engine (Section 7). Rules: N-PHS-01, N-MNT-01…04, N-RAT-01…04, N-SPT-01…03, N-PRO-01/02, N-FAT-01, N-CHO-01, N-MAC-01.
import { NUTRITION } from '@/lib/knowledge/constants';
import type { Goal, Lifestyle, NutritionPhase, Sex, SportIntensity, Status, UserSport } from './types';
import { clamp, lerp, round10, round5 } from './util';

export function phaseForGoal(goal: Goal): NutritionPhase {
  if (goal === 'lean_gain') return 'gain';
  if (goal === 'fat_loss') return 'loss';
  return 'maintain'; // recomp, strength, sport_support (N-PHS-01)
}

export const defaultMultiplier = (l: Lifestyle) => NUTRITION.multiplierDefault[l];

/** N-SPT-02: sport intensity → cardio factor (kcal per kg per 10 min). */
export function sportFactor(i: SportIntensity): number {
  const f = NUTRITION.cardioKcalPerKgPer10Min;
  if (i === 'light') return f.light;
  if (i === 'moderate') return f.moderate;
  if (i === 'hard') return f.vigorous;
  return 0.5 * (f.moderate + f.vigorous);
}

/** N-SPT-03: average daily sport energy. */
export function sportKcalPerDay(sports: Pick<UserSport, 'weekdays' | 'minutes' | 'intensity'>[], kg: number): number {
  const weekly = sports.reduce((a, s) => a + s.weekdays.length * (s.minutes / 10) * sportFactor(s.intensity) * kg, 0);
  return Math.round(weekly / 7);
}

/** N-SPT-01: kcal for a single logged session from its session RPE (1–10). */
export function sessionKcalFromRpe(minutes: number, rpe: number, kg: number): number {
  const f = NUTRITION.cardioKcalPerKgPer10Min;
  const factor = rpe <= 4 ? f.light : rpe <= 7 ? f.moderate : f.vigorous;
  return Math.round((minutes / 10) * factor * kg);
}

export interface NutritionInput {
  bodyweightKg: number;
  sex: Sex | null;
  bodyFatPct?: number | null;
  status: Status;
  phase: NutritionPhase;
  lifestyle: Lifestyle;
  multiplier?: number | null;
  sports: Pick<UserSport, 'weekdays' | 'minutes' | 'intensity'>[];
  /** loss: % bodyweight per week (positive); gain: % per month. */
  targetRatePct?: number | null;
  kcalOverride?: number | null; // after accepted calorie adjustments
}

export interface NutritionTargets {
  phase: NutritionPhase;
  bmr: number;
  multiplier: number;
  maintenanceExSport: number;
  sportKcalPerDay: number;
  maintenance: number;
  ratePct: number; // loss: %/week (positive); gain: %/month; maintain: 0
  delta: number;
  kcal: number;
  kcalLow: number;
  kcalHigh: number;
  proteinG: number;
  fatMinG: number;
  fatG: number;
  carbsMinG: number;
  carbsG: number;
  flexibleKcal: number;
  warnings: { code: string; message: string; ruleIds: string[] }[];
  ruleIds: string[];
}

export function defaultRatePct(phase: NutritionPhase, status: Status, sex: Sex | null, bf?: number | null): number {
  if (phase === 'loss') {
    const lean = bf != null && bf <= NUTRITION.leanBodyFat[sex ?? 'unspecified'];
    return lean ? NUTRITION.lossRatePctPerWeek.lean : NUTRITION.lossRatePctPerWeek.default;
  }
  if (phase === 'gain') return NUTRITION.gainDefault[status];
  return 0;
}

export function isAboveFatThreshold(sex: Sex | null, bf?: number | null): boolean {
  if (bf == null) return false;
  return bf > NUTRITION.protein.leanThresholdBf[sex ?? 'unspecified'];
}

export function nutritionTargets(input: NutritionInput): NutritionTargets {
  const kg = input.bodyweightKg;
  const ruleIds = ['N-MNT-01', 'N-MNT-02', 'N-MNT-04', 'N-SPT-01', 'N-SPT-02', 'N-SPT-03', 'N-PRO-01', 'N-FAT-01', 'N-CHO-01', 'N-MAC-01'];
  const warnings: NutritionTargets['warnings'] = [];
  const multiplier = input.multiplier ?? defaultMultiplier(input.lifestyle);
  const bmr = NUTRITION.bmrPerKg * kg;
  const maintenanceExSport = Math.round(bmr * multiplier);
  const sportKcal = sportKcalPerDay(input.sports, kg);
  const maintenance = maintenanceExSport + sportKcal;

  let ratePct = input.targetRatePct ?? defaultRatePct(input.phase, input.status, input.sex, input.bodyFatPct);
  let delta = 0;
  if (input.phase === 'loss') {
    ruleIds.push('N-RAT-01', 'N-RAT-03');
    if (ratePct > NUTRITION.safety.maxLossPctPerWeek) {
      warnings.push({ code: 'RATE_TOO_FAST', message: 'Losing more than 1% of bodyweight per week is blocked; the rate was set to 1%.', ruleIds: ['N-RAT-01'] });
      ratePct = NUTRITION.safety.maxLossPctPerWeek;
    }
    delta = -kg * (ratePct / 100) * NUTRITION.kcalPerKgWeeklyChange;
    if (-delta > NUTRITION.bigDeficitWarn) {
      warnings.push({ code: 'BIG_DEFICIT', message: `A ${Math.round(-delta)} kcal/day deficit risks losing muscle. Consider a slower rate.`, ruleIds: ['N-RAT-04'] });
    }
  } else if (input.phase === 'gain') {
    ruleIds.push('N-RAT-02', 'N-RAT-03');
    delta = ((kg * (ratePct / 100)) / 4) * NUTRITION.kcalPerKgWeeklyChange;
  }

  let kcal = input.kcalOverride ?? round10(maintenance + delta);
  const floor = Math.ceil(bmr * NUTRITION.safety.minKcalVsBmr);
  if (kcal < floor) {
    warnings.push({ code: 'KCAL_TOO_LOW', message: `Targets below ${round10(floor)} kcal (resting needs × 1.1) are blocked.`, ruleIds: ['N-MNT-01'] });
    kcal = round10(floor + 5);
  }

  // Macros (N-MAC-01): protein → fat → carbs.
  const leanDeficit = input.phase === 'loss' && !isAboveFatThreshold(input.sex, input.bodyFatPct);
  if (leanDeficit) ruleIds.push('N-PRO-02');
  const proteinG = round5(kg * (leanDeficit ? NUTRITION.protein.leanDeficit : NUTRITION.protein.base));
  const fm = NUTRITION.fatMin;
  const fatMinG = round5(lerp(fm.low, fm.high, clamp((kg - fm.lightKg) / (fm.heavyKg - fm.lightKg), 0, 1)));
  let fatG = Math.max(fatMinG, round5((NUTRITION.fatShareOfMaintenance * maintenanceExSport) / 9));
  const carbsMinG = round5(kg * (input.phase === 'loss' ? NUTRITION.carbMin.deficit : NUTRITION.carbMin.surplusOrMaint));
  let carbsG = round5((kcal - proteinG * 4 - fatG * 9) / 4);
  if (carbsG < carbsMinG) {
    fatG = Math.max(fatMinG, fatG - Math.ceil(((carbsMinG - carbsG) * 4) / 9));
    carbsG = round5((kcal - proteinG * 4 - fatG * 9) / 4);
    if (carbsG < carbsMinG) {
      carbsG = carbsMinG;
      kcal = proteinG * 4 + fatG * 9 + carbsG * 4;
      warnings.push({ code: 'TARGET_BELOW_MINIMUMS', message: 'Your calorie target is below the protein, fat and carb minimums. Try a slower rate.', ruleIds: ['N-MAC-01', 'N-CHO-01'] });
    }
  }
  const flexibleKcal = Math.max(0, kcal - (proteinG * 4 + fatMinG * 9 + carbsMinG * 4));
  return {
    phase: input.phase,
    bmr,
    multiplier,
    maintenanceExSport,
    sportKcalPerDay: sportKcal,
    maintenance,
    ratePct,
    delta: Math.round(delta),
    kcal,
    kcalLow: kcal - NUTRITION.kcalBand,
    kcalHigh: kcal + NUTRITION.kcalBand,
    proteinG,
    fatMinG,
    fatG,
    carbsMinG,
    carbsG,
    flexibleKcal,
    warnings,
    ruleIds,
  };
}

/**
 * N-ADJ-04: apply a calorie change keeping protein fixed and taking the change from fat and carbs
 * above their minimums (in proportion to how much each sits above its minimum).
 */
export function applyKcalChange(
  t: Pick<NutritionTargets, 'kcal' | 'proteinG' | 'fatG' | 'fatMinG' | 'carbsG' | 'carbsMinG'>,
  newKcal: number,
): { kcal: number; proteinG: number; fatG: number; carbsG: number } {
  const change = newKcal - t.kcal;
  const fatAboveKcal = Math.max(0, t.fatG - t.fatMinG) * 9;
  const carbAboveKcal = Math.max(0, t.carbsG - t.carbsMinG) * 4;
  let fatG = t.fatG;
  if (change < 0) {
    const pool = fatAboveKcal + carbAboveKcal;
    const fatShare = pool > 0 ? fatAboveKcal / pool : 0;
    fatG = Math.max(t.fatMinG, round5(t.fatG + (change * fatShare) / 9));
  } else {
    // Increases go mostly to carbs; a quarter to fat.
    fatG = round5(t.fatG + (change * 0.25) / 9);
  }
  let carbsG = round5((newKcal - t.proteinG * 4 - fatG * 9) / 4);
  if (carbsG < t.carbsMinG) {
    carbsG = t.carbsMinG;
    fatG = Math.max(t.fatMinG, Math.floor((newKcal - t.proteinG * 4 - carbsG * 4) / 9));
  }
  return { kcal: newKcal, proteinG: t.proteinG, fatG, carbsG };
}
