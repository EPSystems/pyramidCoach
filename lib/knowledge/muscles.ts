// Muscle groups (body map + volume counting) and movement patterns.
import type { MuscleId, Pattern } from '@/lib/engine/types';

export interface MuscleSeed {
  id: MuscleId;
  name: string;
  region: 'upper' | 'lower' | 'core';
  tracked: boolean;
  sides: ('front' | 'back')[];
}

export const MUSCLE_SEEDS: MuscleSeed[] = [
  { id: 'chest', name: 'Chest', region: 'upper', tracked: true, sides: ['front'] },
  { id: 'back', name: 'Back (lats & upper back)', region: 'upper', tracked: true, sides: ['back'] },
  { id: 'front_delts', name: 'Front delts', region: 'upper', tracked: true, sides: ['front'] },
  { id: 'side_delts', name: 'Side delts', region: 'upper', tracked: true, sides: ['front', 'back'] },
  { id: 'rear_delts', name: 'Rear delts', region: 'upper', tracked: true, sides: ['back'] },
  { id: 'biceps', name: 'Biceps', region: 'upper', tracked: true, sides: ['front'] },
  { id: 'triceps', name: 'Triceps', region: 'upper', tracked: true, sides: ['back'] },
  { id: 'quads', name: 'Quads', region: 'lower', tracked: true, sides: ['front'] },
  { id: 'hamstrings', name: 'Hamstrings', region: 'lower', tracked: true, sides: ['back'] },
  { id: 'glutes', name: 'Glutes', region: 'lower', tracked: true, sides: ['back'] },
  { id: 'calves', name: 'Calves', region: 'lower', tracked: true, sides: ['front', 'back'] },
  { id: 'abs', name: 'Abs', region: 'core', tracked: false, sides: ['front'] },
  { id: 'forearms', name: 'Forearms', region: 'upper', tracked: false, sides: ['front', 'back'] },
  { id: 'traps', name: 'Traps', region: 'upper', tracked: false, sides: ['front', 'back'] },
  { id: 'erectors', name: 'Lower back (erectors)', region: 'core', tracked: false, sides: ['back'] },
  { id: 'adductors', name: 'Adductors', region: 'lower', tracked: false, sides: ['front'] },
];

export const MUSCLE_NAME: Record<MuscleId, string> = Object.fromEntries(MUSCLE_SEEDS.map((m) => [m.id, m.name])) as Record<MuscleId, string>;
export const MUSCLE_SHORT: Record<MuscleId, string> = {
  chest: 'Chest', back: 'Back', front_delts: 'Front delts', side_delts: 'Side delts', rear_delts: 'Rear delts',
  biceps: 'Biceps', triceps: 'Triceps', quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves',
  abs: 'Abs', forearms: 'Forearms', traps: 'Traps', erectors: 'Lower back', adductors: 'Adductors',
};

export const PATTERN_SEEDS: { id: Pattern; name: string }[] = [
  { id: 'squat', name: 'Squat' },
  { id: 'hinge', name: 'Hip hinge' },
  { id: 'vertical_pull', name: 'Vertical pull' },
  { id: 'vertical_push', name: 'Vertical push' },
  { id: 'horizontal_pull', name: 'Horizontal pull' },
  { id: 'horizontal_push', name: 'Horizontal push' },
  { id: 'hip_extension', name: 'Hip extension' },
  { id: 'pullover', name: 'Pullover' },
  { id: 'upright_row', name: 'Upright row' },
  { id: 'fly', name: 'Fly' },
  { id: 'isolation', name: 'Isolation' },
  { id: 'carry', name: 'Carry / sled' },
  { id: 'core', name: 'Core' },
];
