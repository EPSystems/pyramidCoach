// Rule registry. One entry per rule ID from the plan (Appendix B).
// Summaries are written in our own words (no text from the source books) and stay ≤ 280 characters.

export type RuleSource = 'MSP-T' | 'MSP-N' | 'GEN' | 'APP';

export interface RuleDef {
  id: string;
  source: RuleSource;
  page?: string;
  summary: string;
}

const r = (id: string, source: RuleSource, page: string | undefined, summary: string): RuleDef => ({
  id,
  source,
  page,
  summary,
});

export const RULE_LIST: RuleDef[] = [
  // Training status
  r('T-STA-01', 'MSP-T', '86–87, 240', 'Training status is judged by how fast you progress, not by years or strength: novices improve almost every session, intermediates week to week, advanced lifters month to month.'),
  r('T-STA-02', 'APP', undefined, 'If you are unsure of your status: under a year of consistent training counts as novice, otherwise intermediate. The app never auto-assigns advanced.'),
  r('T-STA-03', 'APP', undefined, 'After 8+ weeks of logs the app checks how often your anchor lifts improve and suggests a status change if your logs disagree with your setting twice in a row.'),
  r('T-STA-04', 'MSP-T', '86', 'Status can differ between body regions. The app stores one status for now.'),
  r('T-PRI-01', 'MSP-T', '18', 'When you lift and play a sport, one has to come first. If the sport comes first, lifting stays lower in volume, further from failure and avoids risky exercises and heavy soreness.'),
  // Volume
  r('T-VOL-01', 'MSP-T', '45–46, 231', 'About 4 hard sets per muscle per week is the minimum that reliably grows muscle. Targets never go below this.'),
  r('T-VOL-02', 'MSP-T', '45–46, 231', 'For most people 10–20 hard sets per muscle per week is the practical range; more is reserved for specialisation phases.'),
  r('T-VOL-03', 'MSP-T', '231', 'Extra sets give smaller and smaller returns around 30 per week, so 30 is the hard ceiling for a specialised muscle.'),
  r('T-VOL-04', 'MSP-T', '232', 'More weekly sets cost more time: roughly 4–8 sets per muscle ≈ 1–2.5 h/week, up to 9+ h/week at 21–30 sets. Fewer sets give more growth per set.'),
  r('T-VOL-05', 'MSP-T', '38, 243', 'Sets are counted fractionally: 1 set for each muscle an exercise mainly trains and half a set for each muscle it trains secondarily.'),
  r('T-VOL-06', 'MSP-T', '33–35, 231', 'A set only counts toward muscle growth if it has at least 4 reps and ends within about 4 reps of failure. Warm-ups never count.'),
  r('T-VOL-07', 'MSP-T', '44', 'Start with the least volume that still drives progress and add sets only after a real plateau with good recovery.'),
  r('T-VOL-08', 'MSP-T', '131–132, 237', 'Advanced lifters can specialise: raise 1–2 muscles by about half and cut the rest by a third to a half for 8–12 weeks, then return to a balanced phase.'),
  // Frequency
  r('T-FRQ-01', 'MSP-T', '226, 231, 233', 'Keep any single session at or below about 11 sets for one muscle; spread more volume over more sessions.'),
  r('T-FRQ-02', 'MSP-T', '233', 'Weekly sets set the frequency: 4–10 sets → 1–2 sessions per week, 11–20 → 2–3, 21–30 → 3 or more.'),
  r('T-FRQ-03', 'MSP-T', '231, 233', 'For strength, train each main lift 2–6 times a week with 1–2 direct sets per session, spread over as many sessions as possible.'),
  r('T-FRQ-04', 'MSP-T', '224, 230', 'Three to five lifting days with each muscle trained 2–4 times a week suits most lifters. Two days is the minimum and fine for maintenance.'),
  // Scheduling
  r('T-SCH-01', 'APP', '224–233', 'The app picks the fewest lifting days that keep every session within your time limit and every muscle at a workable frequency.'),
  r('T-SCH-02', 'GEN', undefined, 'Keep at least one full rest day per week with no lifting and no hard sport.'),
  r('T-SCH-03', 'MSP-T', '18–19', 'Cardio interferes least with lifting when done after lifting, at least 3 hours apart, or best of all on a different day.'),
  r('T-SCH-04', 'GEN', undefined, 'Avoid hard leg sessions within about 24 hours before a leg-heavy match or hard session, and the day after a match.'),
  r('T-SCH-05', 'MSP-T', '234', 'Avoid lots of work for a muscle the day before a main lift that relies on it (for example heavy quad work the day before squats).'),
  r('T-SCH-06', 'MSP-T', '17', 'Back-to-back hard days happen; on the second day simply expect to use a bit less load.'),
  // Split
  r('T-SPL-01', 'MSP-T', '226–229', 'Choose a split that keeps sessions practical and no muscle above about 11 sets per session; higher weekly volume needs more frequency.'),
  r('T-SPL-02', 'MSP-T', '228', 'Lower-body sessions are the most draining, so when leg volume is high, spread it over more days.'),
  // Exercise selection
  r('T-SEL-01', 'MSP-T', '242', 'Use 1–3 exercises per main movement and cover the gaps: an incline press, a wide-elbow row and a lat-focused pull, plus isolation for quads, hamstrings, biceps, triceps, side delts and calves.'),
  r('T-SEL-02', 'MSP-T', '160', 'An exercise must actually train the muscle it is meant to grow.'),
  r('T-SEL-03', 'MSP-T', '168', 'When options are otherwise equal, prefer exercises that load the muscle hard in its stretched position.'),
  r('T-SEL-04', 'MSP-T', '175', 'Exercises must be practical: available equipment, no injury conflict, something you do not hate, quick to set up.'),
  r('T-SEL-05', 'MSP-T', '178–179', 'Order sessions with free-weight compounds first, machines next and isolation last, unless a lagging muscle needs priority.'),
  r('T-SEL-06', 'MSP-T', '179', 'Keep the same exercises for a whole block so progress is measurable; change only one or two per session between blocks.'),
  r('T-SEL-07', 'MSP-T', '179, 242', 'For strength, the main lifts provide their own volume; extra muscle work uses quicker, less fatiguing exercises.'),
  r('T-SEL-08', 'MSP-T', '20–21', 'Work around pain: drop exercises that load a painful area heavily, favour machines and higher reps, and see a professional for persistent or red-flag pain.'),
  // Intensity
  r('T-INT-01', 'MSP-T', '231', 'Muscle grows from roughly 4–30 rep loads when sets end close to failure; the lower the reps, the more reps you can leave in the tank. Strength needs heavy loads (1–8 reps).'),
  r('T-INT-02', 'MSP-T', '231, 235', 'Hypertrophy sets need at least 4 reps. Avoid going to complete failure on free-weight squats, hinges and presses.'),
  r('T-INT-03', 'MSP-T', '235', 'Each exercise type has its own rep and effort range: heavy lower-body free weights 4–8 reps at 2–4 RIR, presses and leg machines 4–12, machines and rows 6–15, isolation 8–20 close to failure.'),
  r('T-INT-04', 'MSP-T', '125–126, 236–237', 'Vary rep ranges — within a session, between sessions or between weeks — but do not spend more than about 3 weeks outside hypertrophy ranges.'),
  r('T-INT-05', 'MSP-T', '18', 'When your sport comes first, every lifting set stops one rep further from failure and the heaviest rep range on leg compounds is dropped.'),
  r('T-RIR-01', 'MSP-T', '50–51', 'RPE 10 = 0 reps in reserve, 9 = 1, 8 = 2, 7 = 3. Most people underestimate how many reps they have left by about one, especially on high-rep sets.'),
  // Rest, tempo, warm-up
  r('T-RST-01', 'MSP-T', '201', 'For strength main lifts rest until ready — at least 2 minutes, usually about 3.'),
  r('T-RST-02', 'MSP-T', '201', 'For hypertrophy rest at least 90 seconds on average; longer for big lower-body lifts.'),
  r('T-RST-03', 'MSP-T', '201', 'Supersets and drop sets save time; a four-drop drop set counts as about three normal sets.'),
  r('T-TMP-01', 'MSP-T', '215–216', 'Lower the weight under control in about 1–4 seconds and lift with intent; any lifting speed works as long as the set gets close to failure.'),
  r('T-WUP-01', 'MSP-T', '244–246', 'Warm up generally, then ramp up on the first compound. Dynamic stretching is fine; keep static stretching brief for muscles you are about to train.'),
  // Progression
  r('T-PRG-01', 'MSP-T', '127–129, 238', 'Pick a first-set load that lands in the rep range at the top of the RIR range and stop the set there.'),
  r('T-PRG-02', 'MSP-T', '127–129, 238', 'If the first set lands in range, keep the load for the remaining sets and aim for the same reps. Reps falling on later sets is fine.'),
  r('T-PRG-03', 'MSP-T', '127–129, 238', 'If the first set misses the rep range, change the load by about 4% per rep you missed or exceeded and keep that load for the rest of the sets.'),
  r('T-PRG-04', 'MSP-T', '127–129, 238', 'When the first set hits the top of the rep range at the top of the RIR range, add load next session.'),
  r('T-PRG-05', 'MSP-T', '127–129, 238', 'Session-to-session swings are normal. On a strong day you can jump ahead; on a flat day drop a step and chase reps.'),
  r('T-PRG-06', 'MSP-T', '238–240', 'Typical pace: novices add load every 2–3 sessions, intermediates about every 5, advanced lifters about half as often.'),
  // Strength phases
  r('T-STR-01', 'MSP-T', '238–240', 'Strength training cycles a Volume phase and a Load phase (and a Peak phase before a test), with an easier intro week when coming back to volume.'),
  r('T-STR-02', 'MSP-T', '238–240', 'Volume phase: 1–3 top singles per lift per week getting harder (RPE 5 → 8), then normal working sets; 10–20 weekly sets for the supporting muscles.'),
  r('T-STR-03', 'MSP-T', '238–240', 'Load phase: 2–4 singles per lift per week (RPE 6 → 9), each followed by 2 back-off sets of 5 → 3 reps; supporting volume drops to 5–10 sets.'),
  r('T-STR-04', 'MSP-T', '238–240', 'Peak phase (only before a test): heavy singles up to RPE 10, few back-off sets and very little extra volume for 2–4 weeks.'),
  r('T-STR-05', 'MSP-T', '238–240', 'Train each main lift 2–4 times a week; a session that works the same muscles with another lift counts as half an exposure.'),
  // Fatigue
  r('T-FAT-01', 'MSP-T', '106, 242', 'Each week answer five quick recovery questions. Two or more “yes” answers means a deload next week.'),
  r('T-FAT-02', 'MSP-T', '104–105', 'Deloads happen when you need them, not on a fixed calendar.'),
  r('T-FAT-03', 'MSP-T', '106–107', 'A standard deload cuts sets on every exercise by about 30–50% while keeping loads, effort and number of sessions.'),
  r('T-FAT-04', 'MSP-T', '107', 'If only one area is beaten up, deload just that area: drop or reduce the exercises that load it and train everything else normally.'),
  r('T-FAT-05', 'MSP-T', '107', 'If aches flare with heavy loads but not with high reps, use a week of higher reps on those exercises.'),
  r('T-FAT-06', 'MSP-T', '107–108', 'After a big volume jump, time off, or moving from heavy work back to volume, run the first week at about 75% of the sets and one rep further from failure.'),
  r('T-FAT-07', 'MSP-T', '16–17', 'Missed a session? Move it to the next free day, never stack two missed hard sessions on one day, and drop the least important one if the week runs out.'),
  r('T-FAT-08', 'MSP-T', '15–16', 'Feeling drained? Swap today for the lightest session of the week.'),
  // Sports
  r('S-01', 'APP', undefined, 'Every sport session at moderate effort or harder counts as one hard session in your weekly load.'),
  r('S-02', 'GEN', undefined, 'Each weekly sport session trims lifting volume for the muscles that sport works hardest: 0.5–1.5 sets per session, at most 4 per muscle, never below 4 sets.'),
  r('S-03', 'MSP-T', '18–19', 'Sport days are fixed; lifting days move around them using the scheduling rules.'),
  r('S-04', 'MSP-T', '19', 'Extra conditioning should be low-impact (bike, rower, swimming), short and hard or under an hour, after lifting or on other days.'),
  r('S-05', 'MSP-T', '18', 'When the sport comes first, leg muscles are capped at 8 sets, sets stop further from failure and high-risk lifts are avoided.'),
  r('S-06', 'MSP-N', '45–46', 'Energy burned in sports is added to your calorie target.'),
  // Nutrition — phase
  r('N-PHS-01', 'APP', undefined, 'Your nutrition phase follows your goal (gain, maintain or lose) and you can override it.'),
  r('N-PHS-02', 'MSP-N', '35', 'Spend at least four times as long gaining or maintaining as cutting.'),
  r('N-PHS-03', 'MSP-N', '33, 56–58', 'Muscle can be built at maintenance or in a small deficit, especially by newer lifters — higher body fat does not stop gains.'),
  // Maintenance
  r('N-MNT-01', 'MSP-N', '28', 'Resting energy use is roughly 22 kcal per kg of bodyweight per day.'),
  r('N-MNT-02', 'MSP-N', '29', 'Multiply by an activity factor for lifters: sedentary 1.3–1.6, lightly active 1.5–1.8, active 1.7–2.0, very active 1.9–2.2.'),
  r('N-MNT-03', 'MSP-N', '28–29, 186', 'Any maintenance estimate is rough; adjusting from your weight trend is what makes it accurate.'),
  r('N-MNT-04', 'APP', undefined, 'Your lifestyle factor excludes sports — those are added separately so they are not counted twice.'),
  // Rate
  r('N-RAT-01', 'MSP-N', '18, 36–37', 'Lose 0.5–1% of bodyweight per week; leaner people should stay near 0.5%.'),
  r('N-RAT-02', 'MSP-N', '51–52', 'Gain per month: novices 1–2% of bodyweight, intermediates 0.5–1.5%, advanced up to 0.5%.'),
  r('N-RAT-03', 'MSP-N', '36, 55–56', 'About 7,700 kcal per kg of bodyweight change, so the daily calorie change ≈ weekly kg change × 1,100.'),
  r('N-RAT-04', 'MSP-N', '37', 'Deficits much bigger than 500 kcal/day cost more muscle; the app warns above 750.'),
  // Sport energy
  r('N-SPT-01', 'MSP-N', '45–46', 'Extra energy per 10 minutes of activity: light ≈ 0.44 kcal/kg, moderate ≈ 0.99, vigorous ≈ 1.54. Watches usually overestimate.'),
  r('N-SPT-02', 'APP', undefined, 'Sport intensity maps to cardio intensity: light → light, moderate → moderate, hard → vigorous, match → between moderate and vigorous.'),
  r('N-SPT-03', 'APP', undefined, 'Sport calories are averaged over the week and added to every day.'),
  // Macros
  r('N-PRO-01', 'MSP-N', '86', 'Eat at least 1.6 g of protein per kg of bodyweight when gaining or maintaining.'),
  r('N-PRO-02', 'MSP-N', '86, 89', 'In a deficit, lean people (or anyone with unknown body fat) should eat at least 2.0 g/kg.'),
  r('N-FAT-01', 'MSP-N', '84–85', 'Eat at least 40–60 g of fat per day depending on size; around a quarter of maintenance calories is a good default.'),
  r('N-CHO-01', 'MSP-N', '85–86', 'Eat at least 2 g/kg of carbohydrate when gaining or maintaining and at least 1 g/kg in a deficit.'),
  r('N-MAC-01', 'MSP-N', '75, 89', 'Set protein first, then fat, then fill the rest of your calories with carbohydrate.'),
  // Weigh-ins
  r('N-WGT-01', 'MSP-N', '18–19, 183', 'Weigh in the morning after the bathroom and before eating. Daily swings of 1–2% are normal.'),
  r('N-WGT-02', 'MSP-N', '19, 183–184', 'Use the weekly average. A week needs at least 3 weigh-ins including a weekend day to be trusted.'),
  r('N-WGT-03', 'MSP-N', '186', 'A 14–21-day running average shows the long-term trend.'),
  r('N-WGT-04', 'MSP-N', '184', 'Ignore the first week of a new gain or loss phase for rate decisions — water and food volume shift.'),
  // Adjustments
  r('N-ADJ-01', 'MSP-N', '186–187', 'If weight did not move in the right direction in week one of a phase, adjust the activity factor by 0.2.'),
  r('N-ADJ-02', 'MSP-N', '184, 187', 'Judge rate over 2 weeks when losing (3 if light) and 3–4 weeks when gaining; adjust by 100–200 kcal if off target.'),
  r('N-ADJ-03', 'MSP-N', '187', 'Wait at least 2 weeks after a calorie change before changing again.'),
  r('N-ADJ-04', 'MSP-N', '188', 'Calorie cuts come from carbs and fat; protein stays the same.'),
  r('N-ADJ-05', 'MSP-N', '189–190', 'A stalled cut can also be fixed with about 2,500 more steps a day or a few short cardio sessions, kept apart from lifting.'),
  r('N-ADJ-06', 'APP', undefined, 'At maintenance, if weight drifts more than 0.25% per week over 3 weeks, adjust by 100–150 kcal.'),
];

export const RULES: Record<string, RuleDef> = Object.fromEntries(RULE_LIST.map((x) => [x.id, x]));

export function ruleSourceLabel(id: string): string {
  const rule = RULES[id];
  if (!rule) return 'General guidance';
  if (rule.source === 'MSP-T') return `Training Pyramid${rule.page ? `, p. ${rule.page}` : ''}`;
  if (rule.source === 'MSP-N') return `Nutrition Pyramid${rule.page ? `, p. ${rule.page}` : ''}`;
  if (rule.source === 'GEN') return 'General guidance';
  return 'App heuristic';
}
