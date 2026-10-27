// Engine input/output types. The engine is pure: plain objects in, plain objects out.

export const TRACKED_MUSCLES = [
  'chest',
  'back',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
] as const;

export const UNTRACKED_MUSCLES = ['abs', 'forearms', 'traps', 'erectors', 'adductors'] as const;

export const ALL_MUSCLES = [...TRACKED_MUSCLES, ...UNTRACKED_MUSCLES] as const;

export type TrackedMuscle = (typeof TRACKED_MUSCLES)[number];
export type MuscleId = (typeof ALL_MUSCLES)[number];

export const LOWER_MUSCLES: readonly MuscleId[] = ['quads', 'hamstrings', 'glutes', 'calves', 'adductors'];
export const UPPER_MUSCLES: readonly MuscleId[] = [
  'chest',
  'back',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
  'traps',
];

export type Goal = 'lean_gain' | 'recomp' | 'strength' | 'fat_loss' | 'sport_support';
export type Priority = 'lifting' | 'balanced' | 'sport';
export type Status = 'novice' | 'intermediate' | 'advanced';
export type Category =
  | 'lower_free_compound'
  | 'lower_machine_compound'
  | 'upper_free_press'
  | 'upper_machine_press'
  | 'pulling_compound'
  | 'isolation';
export type Pattern =
  | 'squat'
  | 'hinge'
  | 'vertical_pull'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'horizontal_push'
  | 'hip_extension'
  | 'pullover'
  | 'upright_row'
  | 'fly'
  | 'isolation'
  | 'carry'
  | 'core';
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'band' | 'sled';
export type MainLift = 'squat' | 'bench' | 'deadlift' | 'ohp';
export type RepVariation = 'within_session' | 'between_session' | 'alternating_week';
export type SplitStyle = 'default' | 'alternative';
export type SportIntensity = 'light' | 'moderate' | 'hard' | 'match';
export type TimeOfDay = 'morning' | 'midday' | 'evening';
export type BlockKind = 'hypertrophy' | 'strength_volume' | 'strength_load' | 'strength_peak' | 'sport_support';
export type Lifestyle = 'sedentary' | 'lightly_active' | 'active' | 'very_active';
export type Sex = 'male' | 'female' | 'unspecified';
export type NutritionPhase = 'gain' | 'maintain' | 'loss';
export type SorenessLevel = 'sore' | 'pain';

/** Slot tags describe what job an exercise can do inside a session template (Appendix D). */
export type SlotTag =
  | 'squat_free'
  | 'squat_machine'
  | 'split_squat'
  | 'hinge_rdl'
  | 'hinge_deadlift'
  | 'hip_ext'
  | 'leg_curl'
  | 'leg_curl_seated'
  | 'leg_ext'
  | 'calf'
  | 'press_incline'
  | 'press_flat'
  | 'press_machine'
  | 'press_vertical'
  | 'chest_iso'
  | 'pull_vertical'
  | 'row_flared'
  | 'row_extension'
  | 'pullover'
  | 'lat_raise'
  | 'rear_delt'
  | 'biceps_iso'
  | 'triceps_iso'
  | 'abs'
  | 'traps';

export interface ExerciseMuscle {
  muscle: MuscleId;
  role: 'primary' | 'secondary';
}

export interface ExerciseDef {
  id: string;
  slug: string;
  name: string;
  pattern: Pattern;
  category: Category;
  equipment: Equipment[];
  isMainLift: boolean;
  mainLiftKey?: MainLift | null;
  longLengthBias: boolean;
  unilateral: boolean;
  axialLoad: boolean;
  impactLowerBody: boolean;
  defaultIncrementKg?: number | null;
  muscles: ExerciseMuscle[];
  substitutions: string[];
  slotTags: SlotTag[];
  popularity: number; // lower = more common
  custom?: boolean;
}

export interface UserSport {
  sportId: string;
  name: string;
  lowerBodyLoad: number; // 0..3
  upperBodyLoad: number;
  eccentricImpact: number;
  conditioning: number;
  musclesStressed: MuscleId[];
  weekdays: number[]; // ISO 1..7
  intensity: SportIntensity;
  minutes: number;
  timeOfDay?: TimeOfDay | null;
}

export interface Injury {
  id: string;
  muscleId: MuscleId | null;
  label: string;
  severity: 'niggle' | 'pain' | 'injury';
  status: 'active' | 'rehab' | 'resolved';
  avoidExerciseIds: string[];
}

export interface LoggedSet {
  exerciseId: string;
  performedOn: string; // ISO date
  setIndex: number;
  loadKg: number | null;
  reps: number;
  rir: number | null;
  isWarmup: boolean;
  sessionId?: string | null;
}

export interface PreviousBlockSummary {
  kind: BlockKind;
  medianTargetBeforeTrims: number;
  endedOn: string;
  /** templateKey -> slotKey -> exerciseId for stability (T-SEL-06). */
  selections: Record<string, Record<string, string>>;
  targetAdjustments?: Partial<Record<TrackedMuscle, number>>;
}

export interface History {
  sets: LoggedSet[];
  previousBlock?: PreviousBlockSummary | null;
  /** Average weekly fractional sets per tracked muscle over the last 4 weeks (from logs). */
  recentAvgWeeklySets?: number | null;
  /** Weeks since the user last trained. null = unknown. */
  weeksOff?: number | null;
  e1rmSeeds?: Partial<Record<MainLift, number>>;
}

export interface BlockInput {
  today: string;
  goal: Goal;
  priority: Priority;
  status: Status;
  availableDays: number[];
  sessionMinutes: number;
  maxLiftDays?: number | null;
  equipment: Equipment[];
  increments: Record<string, number>;
  sports: UserSport[];
  injuries: Injury[];
  exercises: ExerciseDef[];
  history: History;
  repVariation: RepVariation;
  specialization: TrackedMuscle[];
  testDate?: string | null;
  splitStyle?: SplitStyle;
  blockKind?: BlockKind; // forced kind (block transitions)
  startsOn?: string; // forced start (Monday)
  dislikedExerciseIds?: string[];
  strengthLifts?: MainLift[];
  /** Extra sets per muscle from accepted volume_change / plateau proposals. */
  targetAdjustments?: Partial<Record<TrackedMuscle, number>>;
  /** True when the block follows a Load/Peak phase (T-FAT-06). */
  fromHeavyPhase?: boolean;
}

export interface RuleTagged {
  ruleIds: string[];
}

export interface MuscleTarget {
  muscle: TrackedMuscle;
  base: number;
  sportTrim: number;
  target: number;
  trimBySport: { sport: string; sets: number }[];
  ruleIds: string[];
}

export interface Prescription {
  sets: number;
  repMin: number;
  repMax: number;
  rirMin: number;
  rirMax: number;
  restSeconds: number;
  isMainLiftSingle?: boolean;
  note?: string | null;
  suggestedLoadKg?: number | null;
  ruleIds: string[];
}

export interface PlannedExercise extends Prescription {
  exerciseId: string;
  slotKey: string;
  position: number;
}

export interface PlannedSession {
  date: string;
  weekIndex: number;
  templateKey: string;
  title: string;
  kind: 'lift' | 'deload' | 'intro' | 'generated';
  orderInWeek: number;
  estMinutes: number;
  exercises: PlannedExercise[];
}

export interface Warning {
  code: 'TIME_TOO_SHORT' | 'NO_REST_DAY' | 'SCHEDULE_CONFLICT' | 'INJURY_RED_FLAG' | 'NO_EXERCISE_FOR_SLOT' | 'LOW_FREQUENCY';
  message: string;
  ruleIds: string[];
}

export interface DayPlacement {
  weekday: number; // ISO 1..7
  templateKey: string;
}

export interface ScheduleResult {
  placements: DayPlacement[];
  score: number;
  penalties: { rule: string; points: number; detail: string }[];
}

export interface BlockPlan {
  kind: BlockKind;
  startsOn: string;
  weeks: number;
  introWeek: boolean;
  splitKey: string;
  liftDays: number;
  engineVersion: string;
  schedule: ScheduleResult;
  targets: MuscleTarget[];
  /** Weekly targets per week index (strength load phase reduces over time). */
  weeklyTargets: { weekIndex: number; muscle: TrackedMuscle; targetSets: number; sportTrim: number }[];
  sessions: PlannedSession[];
  selections: Record<string, Record<string, string>>;
  warnings: Warning[];
  explanations: { text: string; ruleIds: string[] }[];
  hardSessionsPerWeek: number;
}

// ---------- Progression ----------

export interface SetContext {
  rx: { repMin: number; repMax: number; rirMin: number; rirMax: number };
  setIndex: number; // index of the set just logged
  load: number | null;
  reps: number;
  increment: number;
  previousReps?: number;
}

export interface SetSuggestion extends RuleTagged {
  load: number | null;
  repsTarget: number;
}

export interface ExposureSet {
  load: number | null;
  reps: number;
  rir: number | null;
}

export interface ExerciseHistory {
  exposures: { date: string; sets: ExposureSet[] }[]; // newest last
  increment: number;
  e1rm?: number | null;
  heavyLowerBarbell?: boolean;
  /** Training status, for the T-PRG-06 pace check. Omitted = no pace check. */
  status?: Status;
}

export interface SessionSuggestion extends RuleTagged {
  load: number | null;
  repsTarget: number;
  hint?: string;
}

// ---------- Weekly review & proposals ----------

export interface CheckinDay {
  day: string;
  sleepHours: number | null;
  energy: number | null;
  stress: number | null;
  soreness: Partial<Record<MuscleId, SorenessLevel>>;
  bodyweightKg: number | null;
}

export type ReviewKey = 'dreading_gym' | 'sleep_worse' | 'performance_down' | 'stress_worse' | 'aches_worse';

export interface ReviewAutofill {
  answers: Record<ReviewKey, boolean>;
  evidence: Record<ReviewKey, string>;
}

export type ProposalKind =
  | 'standard_deload'
  | 'targeted_deload'
  | 'intro_week'
  | 'volume_change'
  | 'exercise_swap'
  | 'block_transition'
  | 'plan_regenerate'
  | 'calorie_adjust'
  | 'multiplier_adjust'
  | 'status_change'
  | 'plateau_action'
  | 'injury_adjust';

export interface Proposal {
  kind: ProposalKind;
  title: string;
  rationale: string;
  ruleIds: string[];
  payload: Record<string, unknown>;
  appliesFrom?: string | null;
  expiresOn?: string | null;
}

export interface PlannedSessionState {
  id: string;
  date: string;
  status: 'planned' | 'in_progress' | 'done' | 'skipped' | 'moved';
  templateKey: string;
  exercises: { id: string; exerciseId: string; sets: number; rirMin: number; rirMax: number }[];
}

export interface WeeklyState {
  today: string;
  weekStart: string; // Monday of the reviewed week
  checkins: CheckinDay[]; // last 28+ days
  sessionsThisWeek: PlannedSessionState[];
  nextWeekSessions: PlannedSessionState[];
  sets: LoggedSet[]; // last 6 weeks
  exercises: ExerciseDef[];
  mainLiftExerciseIds: string[];
  overrides?: Partial<Record<ReviewKey, boolean>>;
  block?: { id: string; kind: BlockKind; startsOn: string; weeks: number; testDate?: string | null } | null;
  status: Status;
  statusHistory?: Status[]; // previous inferences (latest last)
  goal: Goal;
  nutritionPhase?: NutritionPhase;
}

export interface StatusInference extends RuleTagged {
  status: Status | null;
  share: number | null;
  evidence: string;
}
