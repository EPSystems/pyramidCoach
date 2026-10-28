// Nutrition engine (Section 7). Rules: N-PHS-01, N-MNT-01…04, N-RAT-01…04, N-SPT-01…03, N-PRO-01/02, N-FAT-01, N-CHO-01, N-MAC-01.
import { NUTRITION } from '@/lib/knowledge/constants';
import type { Goal, Lifestyle, NutritionPhase, Sex, SportIntensity, Status, UserSport } from './types';
import { clamp, daysBetween, lerp, round10, round5 } from './util';
import { createLogger } from '@/lib/log';

const log = createLogger('engine/nutrition');

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

/** N-SPT-01: session RPE (1–10) → cardio factor: ≤4 light, ≤7 moderate, else vigorous. */
function rpeFactor(rpe: number): number {
  const f = NUTRITION.cardioKcalPerKgPer10Min;
  return rpe <= 4 ? f.light : rpe <= 7 ? f.moderate : f.vigorous;
}

/** N-SPT-01: kcal for a single logged session from its session RPE (1–10). */
export function sessionKcalFromRpe(minutes: number, rpe: number, kg: number): number {
  return Math.round((minutes / 10) * rpeFactor(rpe) * kg);
}

export type SportForKcal = Pick<UserSport, 'weekdays' | 'minutes' | 'intensity'> & { sportId?: string };

/** A logged sport session (sport_logs) as used for calorie calibration. */
export interface SportLogForKcal {
  sportId: string;
  minutes: number;
  rpe: number | null;
}

/**
 * N-SPT-03: average daily sport energy. Frequency always comes from the weekly schedule; the energy of one
 * session comes from the declared minutes × intensity or, once a sport has at least
 * NUTRITION.sportCalibration.minLoggedSessions recent logs with a session RPE, from the mean of those logs (N-SPT-01).
 */
export function sportKcalPerDay(sports: SportForKcal[], kg: number, logs: SportLogForKcal[] = []): number {
  const weekly = sports.reduce((a, s) => {
    const rated = s.sportId ? logs.filter((l) => l.sportId === s.sportId && l.rpe != null && l.minutes > 0) : [];
    const perSession =
      rated.length >= NUTRITION.sportCalibration.minLoggedSessions
        ? rated.reduce((b, l) => b + (l.minutes / 10) * rpeFactor(l.rpe!) * kg, 0) / rated.length
        : (s.minutes / 10) * sportFactor(s.intensity) * kg;
    return a + s.weekdays.length * perSession;
  }, 0);
  return Math.round(weekly / 7);
}

export interface NutritionInput {
  bodyweightKg: number;
  sex: Sex | null;
  bodyFatPct?: number | null;
  status: Status;
  phase: NutritionPhase;
  lifestyle: Lifestyle;
  multiplier?: number | null;
  sports: SportForKcal[];
  /** Recent sport_logs; sports with enough RPE-rated logs use them instead of the declared intensity. */
  sportLogs?: SportLogForKcal[];
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
  // Callers pass Number(db value); a bad value would turn every target into NaN.
  if (!Number.isFinite(kg) || kg <= 0) log.debug('nutritionTargets: bad bodyweight', { kg });
  const ruleIds = ['N-MNT-01', 'N-MNT-02', 'N-MNT-04', 'N-SPT-01', 'N-SPT-02', 'N-SPT-03', 'N-PRO-01', 'N-FAT-01', 'N-CHO-01', 'N-MAC-01'];
  const warnings: NutritionTargets['warnings'] = [];
  const multiplier = input.multiplier ?? defaultMultiplier(input.lifestyle);
  const bmr = NUTRITION.bmrPerKg * kg;
  const maintenanceExSport = Math.round(bmr * multiplier);
  const sportKcal = sportKcalPerDay(input.sports, kg, input.sportLogs);
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

// ---------------------------------------------------------------------------
// Phase, rate and cadence helpers (shared by the server actions and the nutrition page)
// ---------------------------------------------------------------------------

/**
 * Target rates the app offers and accepts. Loss: N-RAT-01 (0.5–1 %/week). Gain: N-RAT-02, the options inside the
 * status's monthly range (advanced, whose range starts at 0, gets 0.25 and 0.5).
 */
export function allowedRatePcts(phase: NutritionPhase, status: Status): number[] {
  if (phase === 'loss') return [...NUTRITION.lossRateOptions];
  if (phase === 'gain') {
    const [lo, hi] = NUTRITION.gainRatePctPerMonth[status];
    return NUTRITION.gainRateOptions.filter((x) => x >= lo && x <= hi);
  }
  return [];
}

/** Null when `ratePct` is allowed for the phase and status, otherwise a message naming the rule. */
export function rateError(phase: NutritionPhase, status: Status, ratePct: number | undefined): string | null {
  if (phase === 'maintain' || ratePct == null) return null;
  if (phase === 'loss') {
    const { min, max } = NUTRITION.lossRatePctPerWeek;
    if (ratePct > max) return 'Losing more than 1% of bodyweight per week is blocked (N-RAT-01).';
    if (ratePct < min) return `Pick a loss rate between ${min} and ${max}% per week (N-RAT-01).`;
    return null;
  }
  const [lo, hi] = NUTRITION.gainRatePctPerMonth[status];
  const min = Math.min(...allowedRatePcts('gain', status));
  if (ratePct > hi || ratePct < min) return `For a ${status} lifter the gain rate is ${lo}–${hi}% per month (N-RAT-02).`;
  return null;
}

export interface PhaseSpan {
  phase: string;
  from: string;
  to: string | null;
}

/** N-PHS-02: days spent building/maintaining vs cutting, from nutrition_settings.phase_history. */
export function buildCutDays(history: PhaseSpan[], today: string): { buildDays: number; cutDays: number } {
  const days = (h: PhaseSpan) => Math.max(0, daysBetween(h.from, h.to ?? today));
  const cutDays = history.filter((h) => h.phase === 'loss').reduce((a, h) => a + days(h), 0);
  const buildDays = history.filter((h) => h.phase !== 'loss').reduce((a, h) => a + days(h), 0);
  return { buildDays, cutDays };
}

/**
 * N-PHS-02 is guidance, not a block: starting a cut early stays the user's call. Returns a warning when a new cut
 * (counted as at least one week) would leave less than 4× as much build/maintain time as total cut time.
 */
export function cutRatioWarning(history: PhaseSpan[], today: string): string | null {
  const { buildDays, cutDays } = buildCutDays(history, today);
  const needed = NUTRITION.gainToCutRatio * (cutDays + 7);
  if (buildDays >= needed) return null;
  const weeks = Math.ceil((needed - buildDays) / 7);
  return `So far: ${Math.round(buildDays / 7)} weeks building or maintaining, ${Math.round(cutDays / 7)} cutting. The 4:1 guideline suggests about ${weeks} more weeks of building or maintaining before this cut (N-PHS-02).`;
}

/**
 * Cadence fields written by every recompute (N-ADJ-01, N-ADJ-03). Only trend adjustments (an accepted calorie or
 * activity-factor proposal) restart the 14-day wait, and only the factor proposal closes the first-week check.
 * Rebases (lifestyle change, new weigh-in, sports, manual recalculation) keep both, so they never use up the cadence.
 */
export function nextAdjustState(
  prev: { lastAdjustedOn: string | null; initialAdjustDone: boolean } | null,
  change: { phaseChanged: boolean; kcalOffsetDelta?: number; multiplierAdjust?: boolean },
  today: string,
): { lastAdjustedOn: string | null; initialAdjustDone: boolean } {
  const adjusted = !!change.kcalOffsetDelta || !!change.multiplierAdjust;
  return {
    lastAdjustedOn: adjusted ? today : (prev?.lastAdjustedOn ?? null),
    initialAdjustDone: change.phaseChanged ? false : change.multiplierAdjust ? true : (prev?.initialAdjustDone ?? false),
  };
}

/**
 * APP: a weigh-in refreshes the targets when the averaged bodyweight they use moved by at least
 * NUTRITION.recomputeOnBodyweightKg, or when the stored targets don't record one. Smaller moves change kcal by < ~20.
 */
export function bodyweightChangedEnough(usedKg: number | null | undefined, currentKg: number | null | undefined): boolean {
  if (currentKg == null) return false;
  if (usedKg == null) return true;
  return Math.abs(currentKg - usedKg) >= NUTRITION.recomputeOnBodyweightKg - 1e-9;
}
