// Split selection + session templates (Section 6.6, Appendix D). Rules: T-SPL-01, T-SPL-02.
import type { Category, MainLift, MuscleId, SlotTag, SplitStyle, Goal } from './types';

export type Region = 'upper' | 'lower' | 'full';

export interface Slot {
  key: string;
  label: string;
  tags: SlotTag[]; // acceptable tags, in preference order
  prefer?: Category[]; // category preference
  mainLift?: MainLift; // strength-only main-lift slot (*)
  /** In strength mode this slot is covered by the main lift's working sets and skipped. */
  replacedByMain?: MainLift;
}

export interface Template {
  key: string;
  title: string;
  region: Region;
  slots: Slot[];
}

const s = (key: string, label: string, tags: SlotTag[], prefer?: Category[], extra?: Partial<Slot>): Slot => ({
  key,
  label,
  tags,
  prefer,
  ...extra,
});

const UF: Category = 'upper_free_press';
const UM: Category = 'upper_machine_press';
const LF: Category = 'lower_free_compound';
const LM: Category = 'lower_machine_compound';

const main = (lift: MainLift): Slot => ({ key: `main_${lift}`, label: `Main lift: ${lift}`, tags: [], mainLift: lift });

const SQUAT_FREE = (key = 'squat') => s(key, 'Squat', ['squat_free', 'squat_machine', 'split_squat'], [LF, LM], { replacedByMain: 'squat' });
const RDL = s('hinge', 'Hip hinge (RDL)', ['hinge_rdl'], [LF, LM]);
const INCLINE = s('incline_press', 'Incline press', ['press_incline', 'press_flat'], [UF, UM]);
const VPULL = s('vertical_pull', 'Vertical pull', ['pull_vertical', 'pullover']);
const ROW_FLARED = s('row_flared', 'Row (elbows wide)', ['row_flared', 'row_extension']);
const ROW_EXT = s('row_extension', 'Row (elbows in)', ['row_extension', 'row_flared']);
const LEG_CURL = s('leg_curl', 'Leg curl', ['leg_curl', 'leg_curl_seated']);
const LEG_CURL_SEATED = s('leg_curl', 'Leg curl (seated)', ['leg_curl_seated', 'leg_curl']);
const LEG_EXT = s('leg_ext', 'Leg extension', ['leg_ext']);
const CALF = s('calf', 'Calf raise', ['calf']);
const LAT_RAISE = s('lat_raise', 'Lateral raise', ['lat_raise']);
const REAR = s('rear_delt', 'Rear-delt isolation', ['rear_delt']);
const BI = (key = 'biceps') => s(key, 'Biceps isolation', ['biceps_iso']);
const TRI = (key = 'triceps') => s(key, 'Triceps isolation', ['triceps_iso']);
const HIP_EXT = s('hip_ext', 'Hip extension', ['hip_ext']);

export const TEMPLATES: Record<string, Template> = {
  full_a: {
    key: 'full_a', title: 'Full Body A', region: 'full',
    slots: [main('squat'), SQUAT_FREE(), INCLINE, VPULL, LEG_CURL, LAT_RAISE, CALF],
  },
  full_b: {
    key: 'full_b', title: 'Full Body B', region: 'full',
    slots: [main('deadlift'), RDL, s('press', 'Overhead or flat press', ['press_vertical', 'press_flat'], [UF, UM]), ROW_FLARED, LEG_EXT, TRI(), BI()],
  },
  full_c: {
    key: 'full_c', title: 'Full Body C', region: 'full',
    slots: [main('bench'), s('squat_machine', 'Squat (machine)', ['squat_machine', 'split_squat', 'squat_free'], [LM, LF]), s('machine_press', 'Machine press', ['press_machine', 'press_flat'], [UM, UF]), ROW_EXT, HIP_EXT, REAR, CALF],
  },
  upper_a: {
    key: 'upper_a', title: 'Upper A', region: 'upper',
    slots: [main('bench'), INCLINE, VPULL, ROW_FLARED, LAT_RAISE, TRI(), BI()],
  },
  upper_b: {
    key: 'upper_b', title: 'Upper B', region: 'upper',
    slots: [main('ohp'), s('press', 'Flat press or OHP', ['press_flat', 'press_vertical'], [UF, UM]), ROW_EXT, s('chest_iso', 'Chest machine or fly', ['chest_iso', 'press_machine']), s('pulldown', 'Pulldown or pullover', ['pull_vertical', 'pullover']), REAR, BI(), TRI()],
  },
  lower_a: {
    key: 'lower_a', title: 'Lower A', region: 'lower',
    slots: [main('squat'), SQUAT_FREE(), RDL, LEG_EXT, LEG_CURL, CALF],
  },
  lower_b: {
    key: 'lower_b', title: 'Lower B', region: 'lower',
    slots: [main('deadlift'), s('squat_machine', 'Squat (machine or split squat)', ['squat_machine', 'split_squat', 'squat_free'], [LM, LF]), HIP_EXT, LEG_CURL_SEATED, LEG_EXT, CALF],
  },
  pyr_cb_qc: {
    key: 'pyr_cb_qc', title: 'Chest & Back + Quads & Calves', region: 'full',
    slots: [INCLINE, ROW_FLARED, s('flat_press', 'Flat or machine press', ['press_flat', 'press_machine'], [UF, UM]), s('pulldown', 'Pulldown', ['pull_vertical']), s('squat', 'Squat or leg press', ['squat_free', 'squat_machine', 'split_squat'], [LF, LM]), LEG_EXT, CALF],
  },
  pyr_arms_gh: {
    key: 'pyr_arms_gh', title: 'Arms & Delts + Glutes & Hams', region: 'full',
    slots: [RDL, HIP_EXT, LEG_CURL, LAT_RAISE, REAR, BI(), TRI()],
  },
  upper_push: {
    key: 'upper_push', title: 'Upper Push', region: 'upper',
    slots: [INCLINE, s('flat_press', 'Flat or machine press', ['press_flat', 'press_machine'], [UF, UM]), s('ohp', 'Shoulder press', ['press_vertical']), LAT_RAISE, TRI('triceps'), TRI('triceps_2')],
  },
  upper_pull: {
    key: 'upper_pull', title: 'Upper Pull', region: 'upper',
    slots: [VPULL, ROW_FLARED, ROW_EXT, REAR, BI('biceps'), BI('biceps_2')],
  },
  full_push: {
    key: 'full_push', title: 'Full Push', region: 'full',
    slots: [INCLINE, s('flat_press', 'Flat or machine press', ['press_flat', 'press_machine'], [UF, UM]), s('ohp', 'Shoulder press', ['press_vertical']), LAT_RAISE, TRI(), s('squat', 'Squat or leg press', ['squat_free', 'squat_machine', 'split_squat'], [LF, LM]), LEG_EXT, CALF],
  },
  full_pull: {
    key: 'full_pull', title: 'Full Pull', region: 'full',
    slots: [VPULL, ROW_FLARED, ROW_EXT, REAR, BI(), RDL, LEG_CURL, HIP_EXT],
  },
};

export interface SplitDef {
  key: string;
  name: string;
  templates: string[];
}

export const SPLITS: Record<string, SplitDef> = {
  FB2: { key: 'FB2', name: 'Full Body ×2', templates: ['full_a', 'full_b'] },
  UL2: { key: 'UL2', name: 'Upper / Lower', templates: ['upper_a', 'lower_a'] },
  FB3: { key: 'FB3', name: 'Full Body ×3', templates: ['full_a', 'full_b', 'full_c'] },
  FPF3: { key: 'FPF3', name: 'Full Push / Full Pull / Full Body', templates: ['full_push', 'full_pull', 'full_a'] },
  UL4: { key: 'UL4', name: 'Upper / Lower ×2', templates: ['upper_a', 'lower_a', 'upper_b', 'lower_b'] },
  PYR4: { key: 'PYR4', name: 'Pyramid alternating ×2', templates: ['pyr_cb_qc', 'pyr_arms_gh', 'pyr_cb_qc', 'pyr_arms_gh'] },
  UL5: { key: 'UL5', name: 'Upper / Lower ×2 + Full Body', templates: ['upper_a', 'lower_a', 'upper_b', 'lower_b', 'full_c'] },
  LPP5: { key: 'LPP5', name: 'Lower / Push / Pull / Full Push / Full Pull', templates: ['lower_a', 'upper_push', 'upper_pull', 'full_push', 'full_pull'] },
  PYR6: { key: 'PYR6', name: 'Pyramid alternating ×3', templates: ['pyr_cb_qc', 'pyr_arms_gh', 'pyr_cb_qc', 'pyr_arms_gh', 'pyr_cb_qc', 'pyr_arms_gh'] },
  FPP6: { key: 'FPP6', name: 'Full Push / Full Pull ×3', templates: ['full_push', 'full_pull', 'full_push', 'full_pull', 'full_push', 'full_pull'] },
  // Strength 6-day: UL4 + two full-body days, so squat and bench get 2 main-lift exposures (T-FRQ-03, T-STR-05).
  ULF6: { key: 'ULF6', name: 'Upper / Lower ×2 + Full Body ×2', templates: ['upper_a', 'lower_a', 'full_c', 'upper_b', 'lower_b', 'full_a'] },
};

/**
 * T-SPL-01/02: choose the split for k lift days.
 * Strength goal always uses the default splits because only they carry main-lift slots.
 */
export function chooseSplit(
  k: number,
  opts: { style?: SplitStyle; goal: Goal; lowerTargetAvg: number; maxTarget: number },
): { split: SplitDef; ruleIds: string[] } {
  const alt = opts.style === 'alternative' && opts.goal !== 'strength';
  const ruleIds = ['T-SPL-01'];
  let key: string;
  switch (k) {
    case 2:
      key = alt && opts.maxTarget <= 8 ? 'UL2' : 'FB2';
      break;
    case 3:
      if (alt) key = 'FPF3';
      else if (opts.goal !== 'strength' && opts.lowerTargetAvg >= 16) {
        key = 'FPF3';
        ruleIds.push('T-SPL-02');
      } else key = 'FB3';
      break;
    case 4:
      key = alt ? 'PYR4' : 'UL4';
      break;
    case 5:
      key = alt ? 'LPP5' : 'UL5';
      break;
    default:
      // Strength needs main-lift slots, which PYR6/FPP6 don't have (T-FRQ-03: spread the lifts over as many sessions as possible).
      key = opts.goal === 'strength' ? 'ULF6' : alt ? 'FPP6' : 'PYR6';
      break;
  }
  return { split: SPLITS[key], ruleIds };
}

/** Occurrence label per template inside a week (first occurrence = 'A' day, later = 'B'). */
export function sessionVariant(templates: string[], index: number): 'A' | 'B' {
  const key = templates[index];
  if (key.endsWith('_a')) return 'A';
  if (key.endsWith('_b') || key.endsWith('_c')) return 'B';
  const firstIdx = templates.indexOf(key);
  return firstIdx === index ? 'A' : 'B';
}

/** Muscles a template is designed to load heavily (used by scheduling heuristics). */
export function templateRegionMuscles(region: Region): MuscleId[] {
  if (region === 'upper') return ['chest', 'back', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps'];
  if (region === 'lower') return ['quads', 'hamstrings', 'glutes', 'calves'];
  return ['chest', 'back', 'quads', 'hamstrings', 'glutes'];
}

export function regionsOverlap(a: Region, b: Region): boolean {
  return a === b || a === 'full' || b === 'full';
}
export function loadsLower(r: Region): boolean {
  return r === 'lower' || r === 'full';
}
