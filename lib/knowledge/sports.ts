// Sport catalog seed (Appendix C) [GEN]. Scheduling notes in our own words.
import type { MuscleId } from '@/lib/engine/types';

export interface SportSeed {
  id: string;
  name: string;
  lower: number;
  upper: number;
  impact: number;
  conditioning: number;
  muscles: MuscleId[];
  defaultMinutes: number;
  notes: string;
}

export const SPORT_SEEDS: SportSeed[] = [
  { id: 'football', name: 'Football (soccer)', lower: 3, upper: 0, impact: 3, conditioning: 3, muscles: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors'], defaultMinutes: 90, notes: 'Sprints, cuts and kicks load the legs hard; keep heavy leg work at least 24 h before a match or hard session and not the day after a match.' },
  { id: 'running', name: 'Running', lower: 2, upper: 0, impact: 2, conditioning: 3, muscles: ['quads', 'calves', 'hamstrings'], defaultMinutes: 45, notes: 'Running interferes most with leg training; do easy runs after lifting or on other days and keep intervals away from leg day.' },
  { id: 'boxing', name: 'Boxing', lower: 1, upper: 2, impact: 1, conditioning: 3, muscles: ['front_delts', 'side_delts', 'triceps', 'calves'], defaultMinutes: 60, notes: 'Rounds tax shoulders, arms and footwork; avoid heavy pressing right before. Legs are mostly fine.' },
  { id: 'tennis', name: 'Tennis', lower: 2, upper: 2, impact: 2, conditioning: 2, muscles: ['quads', 'calves', 'side_delts', 'front_delts', 'forearms'], defaultMinutes: 90, notes: 'Lateral cuts and serves; treat it like a moderate leg and shoulder day.' },
  { id: 'swimming', name: 'Swimming', lower: 1, upper: 2, impact: 0, conditioning: 3, muscles: ['back', 'front_delts', 'side_delts', 'triceps'], defaultMinutes: 45, notes: 'Low impact and great conditioning; shoulders and lats get extra work.' },
  { id: 'cycling', name: 'Cycling', lower: 2, upper: 0, impact: 0, conditioning: 3, muscles: ['quads', 'glutes', 'calves'], defaultMinutes: 60, notes: 'Little eccentric load, so it is the most lifting-friendly cardio — but hard intervals still tire the quads.' },
  { id: 'basketball', name: 'Basketball', lower: 3, upper: 1, impact: 3, conditioning: 3, muscles: ['quads', 'calves', 'hamstrings', 'glutes'], defaultMinutes: 90, notes: 'Jumps and landings are hard on knees and calves; schedule it like football.' },
];
