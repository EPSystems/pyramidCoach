// Sport load model + volume trims (Section 6.13). Rules: S-01, S-02, S-05.
import { SPORT_TRIM_MAX, SPORT_TRIM_PER_SESSION } from '@/lib/knowledge/constants';
import { LOWER_MUSCLES, TRACKED_MUSCLES, type TrackedMuscle, type UserSport } from './types';

export const isHardIntensity = (i: UserSport['intensity']) => i === 'moderate' || i === 'hard' || i === 'match';

/** S-01: every sport session at moderate or harder counts as one hard session. */
export function hardSportSessionsPerWeek(sports: UserSport[]): number {
  return sports.filter((s) => isHardIntensity(s.intensity)).reduce((n, s) => n + s.weekdays.length, 0);
}

export interface SportTrim {
  total: Record<TrackedMuscle, number>;
  bySport: Record<TrackedMuscle, { sport: string; sets: number }[]>;
}

/** S-02: trim sets from each sport's stressed muscles, capped at 4 per muscle. */
export function sportTrims(sports: UserSport[]): SportTrim {
  const total = Object.fromEntries(TRACKED_MUSCLES.map((m) => [m, 0])) as Record<TrackedMuscle, number>;
  const bySport = Object.fromEntries(TRACKED_MUSCLES.map((m) => [m, [] as { sport: string; sets: number }[]])) as SportTrim['bySport'];
  for (const sp of sports) {
    if (!isHardIntensity(sp.intensity)) continue;
    const sessions = sp.weekdays.length;
    for (const m of sp.musclesStressed) {
      if (!(TRACKED_MUSCLES as readonly string[]).includes(m)) continue;
      const tm = m as TrackedMuscle;
      const score = LOWER_MUSCLES.includes(tm) ? sp.lowerBodyLoad : sp.upperBodyLoad;
      const perSession = SPORT_TRIM_PER_SESSION[Math.max(0, Math.min(3, score))] ?? 0;
      const sets = perSession * sessions;
      if (sets <= 0) continue;
      bySport[tm].push({ sport: sp.name, sets });
      total[tm] += sets;
    }
  }
  for (const m of TRACKED_MUSCLES) total[m] = Math.min(SPORT_TRIM_MAX, total[m]);
  return { total, bySport };
}

/** Sports that happen on a given ISO weekday. */
export function sportsOnDay(sports: UserSport[], weekday: number): UserSport[] {
  return sports.filter((s) => s.weekdays.includes(weekday));
}

/** A sport that is hard on the legs (T-SCH-04 trigger). */
export const isLegHeavyHard = (s: UserSport) => s.lowerBodyLoad >= 2 && (s.intensity === 'hard' || s.intensity === 'match');
