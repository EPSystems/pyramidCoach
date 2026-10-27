// All numeric constants used by the rules engine. Every value carries the rule ID it implements.
// Sources: MSP-T = Training Pyramid, MSP-N = Nutrition Pyramid, GEN = general guidance, APP = product heuristic.

export const ENGINE_VERSION = '1.0.0';

export const VOLUME = {
  minEffective: 4, // T-VOL-01
  practical: [10, 20] as const, // T-VOL-02
  ceiling: 30, // T-VOL-03
  baseByStatus: { novice: 10, intermediate: 12, advanced: 14 }, // APP
  sportPriorityBase: 6, // APP from T-PRI-01
  balancedSportPenalty: 2, // APP: when ≥2 hard sport sessions
  balancedSportThreshold: 2, // APP
  fatLossCap: 14, // APP
  frontDeltFactor: 0.5, // APP
  normalCap: 20, // T-VOL-02
  specialization: { up: 1.5, others: 0.6, weeks: [8, 12] as const }, // T-VOL-08
  countingMinReps: 4, // T-VOL-06
  countingMaxRir: 4, // T-VOL-06
  fractional: { primary: 1, secondary: 0.5 }, // T-VOL-05
  sportPriorityLowerCap: 8, // S-05
  plateauAddSets: 2, // T-VOL-07 / plateau flowchart
};

export const FREQUENCY = {
  maxSetsPerMusclePerSession: 11, // T-FRQ-01
  byWeeklySets: [
    { max: 10, freq: [1, 2] },
    { max: 20, freq: [2, 3] },
    { max: 30, freq: [3, 6] },
  ] as const, // T-FRQ-02
  liftDays: { min: 2, typical: [3, 5] as const, max: 6 }, // T-FRQ-04
};

export type RepRange = readonly [number, number];

export const INTENSITY = {
  // T-INT-03: rep range and RIR range per exercise category
  lower_free_compound: { reps: [4, 8] as RepRange, rir: [2, 4] as RepRange },
  lower_machine_compound: { reps: [4, 12] as RepRange, rir: [1, 4] as RepRange },
  upper_free_press: { reps: [4, 12] as RepRange, rir: [1, 4] as RepRange },
  upper_machine_press: { reps: [6, 15] as RepRange, rir: [0, 3] as RepRange },
  pulling_compound: { reps: [6, 15] as RepRange, rir: [0, 3] as RepRange },
  isolation: { reps: [8, 20] as RepRange, rir: [0, 2] as RepRange },
  sportPriorityRirBump: 1, // T-INT-05
};

// APP from T-INT-04: concrete sub-ranges for rep-range variation.
export const SUB_RANGES = {
  lower_free_compound: { low: [4, 6] as RepRange, mid: [6, 8] as RepRange },
  lower_machine_compound: { low: [5, 8] as RepRange, mid: [8, 12] as RepRange },
  upper_free_press: { low: [5, 8] as RepRange, mid: [8, 12] as RepRange },
  upper_machine_press: { low: [6, 10] as RepRange, mid: [10, 15] as RepRange },
  pulling_compound: { low: [6, 10] as RepRange, mid: [10, 15] as RepRange },
  isolation: { low: [10, 15] as RepRange, mid: [10, 15] as RepRange, high: [15, 20] as RepRange },
};

export const REST_SECONDS = {
  strengthMain: 180, // T-RST-01
  lowerFreeCompound: 180, // T-RST-02
  compound: 150, // T-RST-02
  isolation: 90, // T-RST-02
  minimumHypertrophy: 90, // T-RST-02
};

export const SESSION_TIME = {
  workSecondsCompound: 50, // APP (6.8)
  workSecondsIsolation: 40, // APP (6.8)
  warmupMinutes: 8, // APP (6.8)
  minSetsPerExercise: 2, // 6.8
  maxSetsPerExercise: 5, // 6.8
  startSetsCompound: 3, // 6.8
  startSetsIsolation: 2, // APP
  maxExercisesPerSession: 8, // 6.8
};

export const PROGRESSION = {
  loadAdjustPerRep: 0.04, // T-PRG-03
  heavyLowerJumpThresholdKg: 100, // APP (6.10)
  heavyLowerJumpKg: 5, // APP (6.10)
};

export const DELOAD = { setCutDefault: 0.4, setCutRange: [0.3, 0.5] as const, yesThreshold: 2 }; // T-FAT-01/03
export const TARGETED_DELOAD = { reduceSetsPct: 0.5 }; // APP from T-FAT-04
export const INTRO_WEEK = { setPct: 0.75, rirBump: 1, volumeJumpTrigger: 0.2, weeksOffTrigger: 2 }; // T-FAT-06

export const PLATEAU_WINDOW = {
  novice: { exposures: 3 },
  intermediate: { weeks: 4 },
  advanced: { weeks: 8 },
} as const; // APP from T-PRG-06

export const SPORT_TRIM_PER_SESSION: Record<number, number> = { 0: 0, 1: 0.5, 2: 1, 3: 1.5 }; // S-02
export const SPORT_TRIM_MAX = 4; // S-02

export const STRENGTH = {
  volume: { weeks: [6, 12] as const, defaultWeeks: 8, singlesPerWeek: [1, 3] as const, rpe: [5, 8] as const, secondarySets: [10, 20] as const },
  load: {
    weeks: [4, 8] as const,
    defaultWeeks: 6,
    singlesPerWeek: [2, 4] as const,
    rpe: [6, 9] as const,
    backoffSets: 2,
    backoffRpe: 7,
    backoffReps: [5, 3] as const,
    secondarySets: [5, 10] as const,
  },
  peak: {
    singlesPerWeek: [2, 5] as const,
    rpe: [7, 10] as const,
    backoffSets: [0, 3] as const,
    backoffRpe: 7,
    reps: [4, 2] as const,
    secondarySets: [0, 4] as const,
  },
  secondaryTargetVolume: 12, // APP: inside 10–20 (T-STR-02)
  secondaryTargetLoad: 8, // APP: inside 5–10 (T-STR-03)
  secondaryTargetPeak: 4, // APP: inside 0–4 (T-STR-04)
};

export const BLOCK_WEEKS = {
  hypertrophy: 6, // APP
  sport_support: 6, // APP
  strength_volume: STRENGTH.volume.defaultWeeks,
  strength_load: STRENGTH.load.defaultWeeks,
};

export const NUTRITION = {
  bmrPerKg: 22, // N-MNT-01
  multipliers: {
    sedentary: [1.3, 1.6],
    lightly_active: [1.5, 1.8],
    active: [1.7, 2.0],
    very_active: [1.9, 2.2],
  } as const, // N-MNT-02
  multiplierDefault: { sedentary: 1.45, lightly_active: 1.65, active: 1.85, very_active: 2.05 } as const,
  kcalPerKgWeeklyChange: 1100, // N-RAT-03
  lossRatePctPerWeek: { min: 0.5, max: 1.0, default: 0.75, lean: 0.5, tolerance: 0.25 }, // N-RAT-01
  lossRateOptions: [0.5, 0.75, 1] as const, // N-RAT-01 choices offered in the app
  leanBodyFat: { male: 15, female: 23, unspecified: 15 }, // APP thresholds for N-RAT-01
  gainRatePctPerMonth: { novice: [1, 2], intermediate: [0.5, 1.5], advanced: [0, 0.5] } as const, // N-RAT-02
  gainDefault: { novice: 1.5, intermediate: 1.0, advanced: 0.5 } as const,
  gainRateOptions: [0.25, 0.5, 1, 1.5, 2] as const, // N-RAT-02 choices, filtered to the status range
  bigDeficitWarn: 750, // N-RAT-04
  cardioKcalPerKgPer10Min: { light: 0.44, moderate: 0.99, vigorous: 1.54 }, // N-SPT-01
  sportCalibration: { minLoggedSessions: 3, lookbackDays: 28 }, // APP: logged session RPE replaces declared intensity
  recomputeOnBodyweightKg: 0.5, // APP: a weigh-in refreshes targets when the averaged weight moves this much
  protein: { base: 1.6, leanDeficit: 2.0, leanThresholdBf: { male: 19, female: 27, unspecified: 19 } }, // N-PRO-01/02
  fatMin: { lightKg: 60, heavyKg: 90, low: 40, high: 60 }, // N-FAT-01
  fatShareOfMaintenance: 0.25, // N-FAT-01
  carbMin: { surplusOrMaint: 2, deficit: 1 }, // N-CHO-01
  kcalBand: 100,
  adjust: {
    initialMultiplierStep: 0.2,
    under3000: [100, 200] as const,
    over3000: [150, 200] as const,
    defaultUnder: 150,
    defaultOver: 175,
    minDaysBetween: 14,
    maintainDriftPctPerWeek: 0.25,
    maintainStep: 125,
  }, // N-ADJ
  weighIns: { minPerWeek: 3, needsWeekendDay: true, runningAvgDays: [14, 21] as const }, // N-WGT
  gainToCutRatio: 4, // N-PHS-02
  safety: { minKcalVsBmr: 1.1, maxLossPctPerWeek: 1.0 }, // Section 10
};

export const REVIEW = {
  energyDreadThreshold: 2, // avg energy ≤ 2
  skippedDreadThreshold: 2,
  sleepDropHours: 0.5,
  sleepNoBaseline: 7,
  stressRise: 1,
  soreAboveAverage: 2,
  perfDropExercises: 2,
  e1rmDropPct: 0.03,
  proposalExpiryDays: 7,
};

export const STATUS_INFERENCE = {
  minWeeks: 8,
  novice: 0.6,
  advanced: 0.15,
  consecutiveReviews: 2,
};

export const DEFAULT_INCREMENTS: Record<string, number> = { barbell: 2.5, dumbbell: 2, machine: 5, cable: 2.5 };
