// On-demand workout generation (Section 6.15).
import { SESSION_TIME } from '@/lib/knowledge/constants';
import { exposuresFor, incrementFor } from './block';
import { orderSession, estimateMinutes, type WorkSession } from './distribute';
import { bestRecentE1rm } from './e1rm';
import { isCompound, prescribe, rangeLevel } from './prescription';
import { suggestNextSession } from './progression';
import { isPrimary, painfulMuscles, rankCandidates, type SelectionContext } from './selection';
import {
  LOWER_MUSCLES,
  TRACKED_MUSCLES,
  type Equipment,
  type ExerciseDef,
  type Injury,
  type LoggedSet,
  type MuscleId,
  type PlannedExercise,
  type SlotTag,
  type TrackedMuscle,
} from './types';

export type EquipmentPreset = 'full' | 'dumbbells' | 'bodyweight' | 'custom';
export type Focus = 'auto' | 'upper' | 'lower' | 'full' | TrackedMuscle[];

export const EQUIPMENT_PRESETS: Record<Exclude<EquipmentPreset, 'custom'>, Equipment[]> = {
  full: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'],
  dumbbells: ['dumbbell', 'bodyweight'],
  bodyweight: ['bodyweight', 'band'],
};

export interface GeneratorInput {
  today: string;
  minutes: number;
  equipmentPreset: EquipmentPreset;
  equipment?: Equipment[];
  focus: Focus;
  readiness: 'normal' | 'tired';
  exercises: ExerciseDef[];
  injuries: Injury[];
  increments: Record<string, number>;
  targets: Record<TrackedMuscle, number>;
  loggedThisWeek: Partial<Record<MuscleId, number>>;
  recentPain: MuscleId[]; // pain in the last 3 check-ins
  trainedLast48h: Partial<Record<MuscleId, number>>;
  sportStressed: MuscleId[]; // sport within 24 h before or after
  sets: LoggedSet[];
  sportPriority?: boolean;
  disliked?: string[];
}

export interface GeneratedSession {
  title: string;
  estMinutes: number;
  exercises: PlannedExercise[];
  muscles: TrackedMuscle[];
  notes: string[];
  ruleIds: string[];
}

const TAGS_FOR: Record<TrackedMuscle, SlotTag[]> = {
  chest: ['press_incline', 'press_flat', 'press_machine', 'chest_iso'],
  back: ['pull_vertical', 'row_flared', 'row_extension', 'pullover'],
  front_delts: ['press_vertical'],
  side_delts: ['lat_raise'],
  rear_delts: ['rear_delt'],
  biceps: ['biceps_iso'],
  triceps: ['triceps_iso'],
  quads: ['squat_machine', 'squat_free', 'split_squat', 'leg_ext'],
  hamstrings: ['leg_curl_seated', 'leg_curl', 'hinge_rdl'],
  glutes: ['hip_ext', 'split_squat', 'squat_machine'],
  calves: ['calf'],
};

export function generateSession(input: GeneratorInput): GeneratedSession {
  const equipment = input.equipmentPreset === 'custom' ? (input.equipment ?? EQUIPMENT_PRESETS.full) : EQUIPMENT_PRESETS[input.equipmentPreset];
  const notes: string[] = [];
  const excluded = new Set<MuscleId>([...painfulMuscles(input.injuries), ...input.recentPain]);
  if (excluded.size) notes.push(`Skipping ${[...excluded].join(', ')} (pain or injury).`);

  let pool: TrackedMuscle[] = [...TRACKED_MUSCLES].filter((m) => m !== 'front_delts' || (Array.isArray(input.focus) && input.focus.includes(m)));
  if (input.focus === 'upper') pool = pool.filter((m) => !LOWER_MUSCLES.includes(m));
  else if (input.focus === 'lower') pool = pool.filter((m) => LOWER_MUSCLES.includes(m));
  else if (Array.isArray(input.focus)) pool = pool.filter((m) => (input.focus as TrackedMuscle[]).includes(m));
  pool = pool.filter((m) => !excluded.has(m));

  const deficit = (m: TrackedMuscle) => (input.targets[m] ?? 0) - (input.loggedThisWeek[m] ?? 0);
  const deprioritised = (m: TrackedMuscle) => (input.trainedLast48h[m] ?? 0) >= 6 || input.sportStressed.includes(m);
  const ordered = [...pool].sort((a, b) => Number(deprioritised(a)) - Number(deprioritised(b)) || deficit(b) - deficit(a) || TRACKED_MUSCLES.indexOf(a) - TRACKED_MUSCLES.indexOf(b));
  if (ordered.some(deprioritised)) notes.push('Muscles trained hard in the last 48 h or stressed by a sport are last in line.');

  const selCtx: SelectionContext = { exercises: input.exercises, equipment, injuries: input.injuries, disliked: input.disliked ?? [], sportPriority: input.sportPriority };
  const session: WorkSession = { templateKey: 'generated', title: 'Generated workout', region: 'full', variant: 'A', exercises: [] };
  const used = new Set<string>();
  const covered: TrackedMuscle[] = [];
  const tired = input.readiness === 'tired';
  const maxExercises = input.minutes <= 30 ? 5 : SESSION_TIME.maxExercisesPerSession;

  for (const m of ordered) {
    if (session.exercises.length >= maxExercises) break;
    if (input.focus === 'auto' && deficit(m) <= 0 && covered.length >= 2) continue;
    const already = session.exercises.reduce((a, w) => a + (isPrimary(w.ex, m) ? w.sets : 0), 0);
    if (already >= 3) continue;
    const pick = TAGS_FOR[m].map((t) => rankCandidates({ key: `gen_${m}`, tags: [t] }, selCtx, used)[0]).find((e) => e && isPrimary(e, m));
    if (!pick) continue;
    const base = Math.min(4, Math.max(2, Math.ceil(Math.max(deficit(m), 2) / 2)));
    const sets = Math.max(SESSION_TIME.minSetsPerExercise, base - (tired ? 1 : 0));
    const trial: WorkSession = { ...session, exercises: [...session.exercises, { ex: pick, slotKey: `gen_${m}`, sets, kind: 'normal', fixed: false }] };
    if (estimateMinutes(trial) > input.minutes) {
      // Try a shorter version (2 sets) before giving up on this muscle.
      const short: WorkSession = { ...session, exercises: [...session.exercises, { ex: pick, slotKey: `gen_${m}`, sets: 2, kind: 'normal', fixed: false }] };
      if (estimateMinutes(short) > input.minutes) continue;
      session.exercises = short.exercises;
    } else session.exercises = trial.exercises;
    used.add(pick.id);
    covered.push(m);
  }

  const ordered2 = orderSession(session);
  let ci = 0;
  let ii = 0;
  const exercises: PlannedExercise[] = ordered2.exercises.map((w, position) => {
    const compound = isCompound(w.ex.category);
    const level = rangeLevel({ category: w.ex.category, compoundIndex: compound ? ci : -1, isolationIndex: compound ? -1 : ii, variation: 'within_session', variant: 'A', weekIndex: 0 });
    if (compound) ci++;
    else ii++;
    const rx = prescribe(w.ex, { level, sportPriority: !!input.sportPriority, isLowerCompound: compound && LOWER_MUSCLES.some((m) => isPrimary(w.ex, m)) });
    const rirMin = rx.rirMin + (tired ? 1 : 0);
    const rirMax = rx.rirMax + (tired ? 1 : 0);
    const inc = incrementFor(w.ex, equipment, input.increments);
    const sug = suggestNextSession({ exposures: exposuresFor(input.sets, w.ex.id), increment: inc, e1rm: bestRecentE1rm(input.sets, w.ex.id) }, rx);
    return {
      exerciseId: w.ex.id,
      slotKey: w.slotKey,
      position,
      sets: w.sets,
      repMin: rx.repMin,
      repMax: rx.repMax,
      rirMin,
      rirMax,
      restSeconds: rx.restSeconds,
      suggestedLoadKg: sug.load,
      note: sug.hint ?? null,
      ruleIds: [...rx.ruleIds, ...sug.ruleIds],
    };
  });
  if (tired) notes.push('Tired today: one set fewer per exercise and one more rep in reserve.');
  const focusLabel = Array.isArray(input.focus) ? input.focus.join(' + ') : input.focus === 'auto' ? 'catch-up' : input.focus;
  return {
    title: `Generated · ${focusLabel}`,
    estMinutes: estimateMinutes(ordered2),
    exercises,
    muscles: covered,
    notes,
    ruleIds: ['T-SEL-05', 'T-INT-03', 'T-VOL-05'],
  };
}
