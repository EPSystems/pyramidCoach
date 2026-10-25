// Day placement around sports (Section 6.5). Rules: T-SCH-02…05, S-03.
import { loadsLower, regionsOverlap, TEMPLATES, type Region } from './split';
import { isHardIntensity, isLegHeavyHard, sportsOnDay } from './sports';
import type { DayPlacement, Goal, ScheduleResult, UserSport } from './types';
import { combinations, variance } from './util';

const prevDay = (d: number) => (d === 1 ? 7 : d - 1);
const nextDay = (d: number) => (d === 7 ? 1 : d + 1);

export interface ScheduleInput {
  availableDays: number[];
  templates: string[]; // split session order
  sports: UserSport[];
  goal: Goal;
}

/** Score one candidate placement. Lower is better. */
export function scorePlacement(placements: DayPlacement[], sports: UserSport[], goal: Goal): ScheduleResult {
  const penalties: ScheduleResult['penalties'] = [];
  const add = (rule: string, points: number, detail: string) => penalties.push({ rule, points, detail });
  const byDay = new Map(placements.map((p) => [p.weekday, p]));
  const region = (p: DayPlacement): Region => TEMPLATES[p.templateKey].region;

  for (const p of placements) {
    const r = region(p);
    const today = sportsOnDay(sports, p.weekday);
    if (loadsLower(r)) {
      for (const s of sportsOnDay(sports, nextDay(p.weekday))) {
        if (isLegHeavyHard(s)) add('T-SCH-04', 10, `Leg session the day before ${s.name}`);
      }
      for (const s of sportsOnDay(sports, prevDay(p.weekday))) {
        if (isLegHeavyHard(s) && s.intensity === 'match') add('T-SCH-04', 10, `Leg session the day after a ${s.name} match`);
      }
      for (const s of today) {
        // APP: legs on the same day as a leg-heavy hard sport session is discouraged (not a hard violation).
        if (isLegHeavyHard(s)) add('T-SCH-04', 1, `Leg session on the same day as ${s.name}`);
      }
    }
    for (const s of today) {
      if (s.intensity === 'hard' || s.intensity === 'match') add('T-SCH-03', 4, `Lifting on the same day as hard ${s.name}`);
      else if (s.intensity === 'moderate') add('T-SCH-03', 2, `Lifting on the same day as ${s.name}`);
      if (s.timeOfDay === 'morning') add('T-SCH-03', 3, `${s.name} is in the morning, before lifting`);
    }
    const prev = byDay.get(prevDay(p.weekday));
    if (prev) {
      const same = regionsOverlap(region(prev), r);
      add('T-SCH-06', same ? 3 : 1, same ? 'Back-to-back sessions for the same body region' : 'Back-to-back lifting days');
      if (goal === 'strength') {
        const t = TEMPLATES[p.templateKey];
        const mainHere = t.slots.find((s) => s.mainLift)?.mainLift;
        const prevT = TEMPLATES[prev.templateKey];
        const prevMain = prevT.slots.find((s) => s.mainLift)?.mainLift;
        if (mainHere && same && prevMain !== mainHere) add('T-SCH-05', 3, `Heavy work for the same muscles the day before ${mainHere}`);
      }
    }
  }

  // T-SCH-02: at least one full rest day (no lifting, no sport at moderate or harder).
  let restDays = 0;
  for (let d = 1; d <= 7; d++) {
    if (byDay.has(d)) continue;
    if (sportsOnDay(sports, d).some((s) => isHardIntensity(s.intensity))) continue;
    restDays++;
  }
  if (restDays === 0) add('T-SCH-02', 8, 'No full rest day this week');

  // Even spacing between lift days (cyclic week).
  const days = placements.map((p) => p.weekday).sort((a, b) => a - b);
  if (days.length > 1) {
    const gaps = days.map((d, i) => (i === days.length - 1 ? days[0] + 7 - d : days[i + 1] - d));
    const v = variance(gaps);
    if (v > 0) add('SPACING', 0.5 * v, 'Uneven spacing between lifting days');
  }

  const score = Math.round(penalties.reduce((a, p) => a + p.points, 0) * 1000) / 1000;
  return { placements, score, penalties };
}

/** Enumerate every k-combination of available days × every rotation of the split; pick the lowest score. */
export function placeSessions(input: ScheduleInput): ScheduleResult {
  const k = input.templates.length;
  const days = [...new Set(input.availableDays)].sort((a, b) => a - b);
  if (days.length < k) throw new Error(`Need ${k} available days, got ${days.length}`);
  let best: (ScheduleResult & { tie: number[] }) | null = null;
  for (const combo of combinations(days, k)) {
    for (let rot = 0; rot < k; rot++) {
      const order = [...input.templates.slice(rot), ...input.templates.slice(0, rot)];
      const placements = combo.map((d, i) => ({ weekday: d, templateKey: order[i] }));
      const res = scorePlacement(placements, input.sports, input.goal);
      const tie = [...combo, rot];
      if (!best || res.score < best.score - 1e-9 || (Math.abs(res.score - best.score) < 1e-9 && lexLess(tie, best.tie))) {
        best = { ...res, tie };
      }
    }
  }
  const { tie: _tie, ...result } = best!;
  void _tie;
  return result;
}

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return a.length < b.length;
}

/** Warnings when the user moves a session manually (Week view). */
export function moveWarnings(templateKey: string, weekday: number, sports: UserSport[]): string[] {
  const region = TEMPLATES[templateKey]?.region ?? 'full';
  const out: string[] = [];
  if (!loadsLower(region)) return out;
  for (const s of sportsOnDay(sports, nextDay(weekday))) if (isLegHeavyHard(s)) out.push(`Legs the day before ${s.name}`);
  for (const s of sportsOnDay(sports, prevDay(weekday))) if (isLegHeavyHard(s) && s.intensity === 'match') out.push(`Legs the day after a ${s.name} match`);
  for (const s of sportsOnDay(sports, weekday)) if (isLegHeavyHard(s)) out.push(`Legs on the same day as ${s.name}`);
  return out;
}
