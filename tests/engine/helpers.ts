import { SEED_EXERCISES } from '@/lib/knowledge/exercises';
import { SPORT_SEEDS } from '@/lib/knowledge/sports';
import type { BlockInput, SportIntensity, UserSport } from '@/lib/engine/types';

export function sport(id: string, weekdays: number[], intensity: SportIntensity, minutes?: number, timeOfDay?: UserSport['timeOfDay']): UserSport {
  const s = SPORT_SEEDS.find((x) => x.id === id)!;
  return {
    sportId: s.id,
    name: s.name,
    lowerBodyLoad: s.lower,
    upperBodyLoad: s.upper,
    eccentricImpact: s.impact,
    conditioning: s.conditioning,
    musclesStressed: s.muscles,
    weekdays,
    intensity,
    minutes: minutes ?? s.defaultMinutes,
    timeOfDay: timeOfDay ?? null,
  };
}

export const FULL_GYM: BlockInput['equipment'] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'];

export function baseInput(over: Partial<BlockInput> = {}): BlockInput {
  return {
    today: '2026-10-26', // a Monday
    goal: 'lean_gain',
    priority: 'balanced',
    status: 'intermediate',
    availableDays: [1, 2, 3, 4, 5, 6, 7],
    sessionMinutes: 60,
    maxLiftDays: null,
    equipment: FULL_GYM,
    increments: { barbell: 2.5, dumbbell: 2, machine: 5, cable: 2.5 },
    sports: [],
    injuries: [],
    exercises: SEED_EXERCISES,
    history: { sets: [] },
    repVariation: 'within_session',
    specialization: [],
    ...over,
  };
}

export const exById = new Map(SEED_EXERCISES.map((e) => [e.id, e]));
