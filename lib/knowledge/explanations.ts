// Own-words "Why?" strings per rule ID (Section 9.3). Plain language; no book text.
// Where no bespoke line exists we fall back to the rule's own-words summary.
import { RULES } from './rules';

const WHY: Record<string, string> = {
  'T-VOL-01': 'Below about 4 hard sets a week a muscle barely grows, so no target goes lower.',
  'T-VOL-02': 'Most people grow best somewhere between 10 and 20 hard sets per muscle each week.',
  'T-VOL-05': 'Compound lifts count fully for the main muscles and half for the helpers — that is how the body map adds up sets.',
  'T-VOL-07': 'You start with the least volume that should work; more is added only if you stall while recovering well.',
  'T-FRQ-01': 'Past roughly 11 sets for one muscle in one session, extra sets are mostly junk — so volume is split across days.',
  'T-SCH-01': 'The app chose the fewest lifting days that keep sessions within your time limit.',
  'T-SCH-04': 'Heavy legs right before a match or the day after one hurts both — so leg days were moved away from matches.',
  'T-INT-03': 'Big free-weight lifts stay a few reps short of failure; machines and isolation can go closer.',
  'T-INT-04': 'Mixing heavier and lighter rep ranges covers more ground for growth than always doing the same reps.',
  'T-PRG-02': 'Your first set landed in range: keep the weight and aim to match those reps.',
  'T-PRG-03': 'Your first set missed the range, so the weight moved about 4% for every rep you were off.',
  'T-PRG-04': 'You hit the top of the rep range with reps to spare — time to add weight.',
  'T-PRG-01': 'Pick a first-set weight that lands in the range while leaving the top-of-range reps in reserve.',
  'T-FAT-01': 'Two or more “yes” answers in the weekly check means fatigue is building — a lighter week helps you bounce back.',
  'T-FAT-03': 'A deload keeps the weights and effort but cuts sets, so you recover without losing strength.',
  'T-FAT-06': 'Jumping straight into a lot more volume makes you very sore; an easier first week avoids that.',
  'T-RIR-01': 'Most people have about one more rep in them than they think, especially on high-rep sets.',
  'S-02': 'Your sport already works these muscles, so lifting volume for them is trimmed to protect recovery.',
  'N-MNT-03': 'Every calorie formula is a guess — your weight trend over the next weeks corrects it.',
  'N-WGT-02': 'Single weigh-ins bounce around; a weekly average from 3+ days including a weekend day is what counts.',
  'N-ADJ-03': 'After any calorie change the app waits two weeks before judging again, so water swings don’t fool it.',
};

export function whyText(id: string): string {
  return WHY[id] ?? RULES[id]?.summary ?? 'General guidance.';
}
