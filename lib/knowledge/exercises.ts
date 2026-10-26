// Global exercise library seed (Appendix E + extras for dumbbell/bodyweight presets).
// Cues and mistakes are written fresh in our own words. Muscle roles follow the pattern table (Section 9).
import type { Category, Equipment, ExerciseDef, MainLift, MuscleId, Pattern, SlotTag } from '@/lib/engine/types';

export interface ExerciseSeed {
  slug: string;
  name: string;
  pattern: Pattern;
  category: Category;
  equipment: Equipment[]; // any of these makes the exercise doable
  primary: MuscleId[];
  secondary: MuscleId[];
  long?: boolean;
  axial?: boolean;
  impact?: boolean;
  unilateral?: boolean;
  main?: MainLift;
  tags: SlotTag[];
  cues: string[];
  mistakes: string[];
  subs: string[];
}

const LF: Category = 'lower_free_compound';
const LM: Category = 'lower_machine_compound';
const UF: Category = 'upper_free_press';
const UM: Category = 'upper_machine_press';
const PC: Category = 'pulling_compound';
const ISO: Category = 'isolation';

export const EXERCISE_SEEDS: ExerciseSeed[] = [
  // ---------------- Squat pattern ----------------
  {
    slug: 'back-squat', name: 'Back squat (high bar)', pattern: 'squat', category: LF, equipment: ['barbell'],
    primary: ['quads', 'glutes'], secondary: ['erectors'], long: true, axial: true, main: 'squat', tags: ['squat_free'],
    cues: ['Bar sits on the upper traps, hands just outside the shoulders', 'Brace your trunk before every rep, as if about to be punched', 'Sit down between your heels, knees travelling over the toes', 'Reach a depth you can control, then drive up with chest and hips together'],
    mistakes: ['Hips shooting up first out of the hole', 'Losing the brace at the bottom'],
    subs: ['safety-bar-squat', 'front-squat', 'hack-squat', 'leg-press'],
  },
  {
    slug: 'low-bar-squat', name: 'Low-bar squat', pattern: 'squat', category: LF, equipment: ['barbell'],
    primary: ['quads', 'glutes'], secondary: ['erectors'], axial: true, main: 'squat', tags: ['squat_free'],
    cues: ['Bar rests on the rear delts, below the spine of the shoulder blade', 'Hinge slightly more at the hip than a high-bar squat', 'Keep wrists straight and let the back hold the bar', 'Push the floor away and keep the chest from caving'],
    mistakes: ['Turning it into a good morning on the way up'],
    subs: ['back-squat', 'safety-bar-squat', 'hack-squat'],
  },
  {
    slug: 'front-squat', name: 'Front squat', pattern: 'squat', category: LF, equipment: ['barbell'],
    primary: ['quads', 'glutes'], secondary: ['erectors'], long: true, axial: true, tags: ['squat_free'],
    cues: ['Bar on the front delts, elbows high', 'Stay upright and let the knees travel forward', 'Brace hard to stop the upper back rounding', 'Drive the elbows up as you stand'],
    mistakes: ['Elbows dropping so the bar rolls forward'],
    subs: ['back-squat', 'hack-squat', 'goblet-squat'],
  },
  {
    slug: 'safety-bar-squat', name: 'Safety-bar squat', pattern: 'squat', category: LF, equipment: ['barbell'],
    primary: ['quads', 'glutes'], secondary: ['erectors'], axial: true, tags: ['squat_free'],
    cues: ['Hold the handles lightly and let the yoke sit on the traps', 'Push the upper back into the pads to stay tall', 'Control the descent to full depth', 'A shoulder-friendly option when gripping a bar hurts'],
    mistakes: ['Letting the bar pull you forward onto your toes'],
    subs: ['back-squat', 'hack-squat', 'leg-press'],
  },
  {
    slug: 'hack-squat', name: 'Hack squat (machine)', pattern: 'squat', category: LM, equipment: ['machine'],
    primary: ['quads', 'glutes'], secondary: [], long: true, tags: ['squat_machine'],
    cues: ['Feet mid-platform, about shoulder width', 'Lower slowly until the hips sit well below the knees', 'Keep the back flat on the pad', 'Drive through the whole foot without locking out hard'],
    mistakes: ['Cutting depth as the weight goes up'],
    subs: ['leg-press', 'back-squat', 'bulgarian-split-squat'],
  },
  {
    slug: 'leg-press', name: 'Leg press', pattern: 'squat', category: LM, equipment: ['machine'],
    primary: ['quads', 'glutes'], secondary: [], tags: ['squat_machine'],
    cues: ['Feet mid-platform; lower placement biases quads', 'Lower until just before the lower back peels off the pad', 'Keep knees tracking over the toes', 'Press without slamming into lockout'],
    mistakes: ['Lower back rounding off the seat at the bottom'],
    subs: ['hack-squat', 'goblet-squat', 'bulgarian-split-squat'],
  },
  {
    slug: 'bulgarian-split-squat', name: 'Bulgarian split squat', pattern: 'squat', category: LM, equipment: ['dumbbell', 'bodyweight', 'barbell'],
    primary: ['quads', 'glutes'], secondary: [], long: true, unilateral: true, tags: ['split_squat', 'squat_machine'],
    cues: ['Rear foot on a bench, front foot far enough forward to sink deep', 'Drop the back knee straight down', 'Lean the torso slightly forward for more glutes, upright for more quads', 'Do all reps on the weaker leg first'],
    mistakes: ['Front heel lifting off the floor'],
    subs: ['walking-lunge', 'leg-press', 'goblet-squat'],
  },
  {
    slug: 'walking-lunge', name: 'Walking lunge', pattern: 'squat', category: LM, equipment: ['dumbbell', 'bodyweight', 'barbell'],
    primary: ['quads', 'glutes'], secondary: [], long: true, unilateral: true, impact: true, tags: ['split_squat'],
    cues: ['Take a long, controlled step', 'Let the back knee kiss the floor', 'Push through the front heel to step through', 'Keep the torso tall and steady'],
    mistakes: ['Short choppy steps that bang the knee'],
    subs: ['bulgarian-split-squat', 'leg-press', 'goblet-squat'],
  },
  {
    slug: 'goblet-squat', name: 'Goblet squat', pattern: 'squat', category: LM, equipment: ['dumbbell'],
    primary: ['quads', 'glutes'], secondary: [], tags: ['squat_free', 'squat_machine'],
    cues: ['Hold one dumbbell vertically at the chest', 'Sit between your heels, elbows inside the knees', 'Keep the chest up and the weight close', 'Pause briefly at the bottom'],
    mistakes: ['Letting the dumbbell drift away from the body'],
    subs: ['bulgarian-split-squat', 'leg-press', 'front-squat'],
  },
  {
    slug: 'backwards-sled-drag', name: 'Backwards sled drag', pattern: 'carry', category: ISO, equipment: ['sled'],
    primary: ['quads'], secondary: ['calves'], tags: [],
    cues: ['Lean back slightly and walk backwards with short steps', 'Push through the balls of the feet', 'Keep constant tension on the strap', 'Knee-friendly quad work with almost no eccentric load'],
    mistakes: ['Taking long steps that turn it into a pull with the back'],
    subs: ['leg-extension', 'leg-press'],
  },
  // ---------------- Hinge ----------------
  {
    slug: 'conventional-deadlift', name: 'Conventional deadlift', pattern: 'hinge', category: LF, equipment: ['barbell'],
    primary: ['glutes', 'hamstrings', 'erectors'], secondary: ['back'], axial: true, main: 'deadlift', tags: ['hinge_deadlift'],
    cues: ['Bar over mid-foot, shins close', 'Pull the slack out of the bar before it leaves the floor', 'Push the floor away, keeping the bar against the legs', 'Finish tall without leaning back'],
    mistakes: ['Jerking the bar off the floor', 'Hips rising before the bar moves'],
    subs: ['sumo-deadlift', 'romanian-deadlift', 'barbell-hip-thrust'],
  },
  {
    slug: 'sumo-deadlift', name: 'Sumo deadlift', pattern: 'hinge', category: LF, equipment: ['barbell'],
    primary: ['glutes', 'hamstrings', 'erectors'], secondary: ['back', 'adductors'], axial: true, main: 'deadlift', tags: ['hinge_deadlift'],
    cues: ['Wide stance, toes turned out, hands inside the knees', 'Push the knees out over the toes', 'Chest up, hips close to the bar', 'Spread the floor apart as you pull'],
    mistakes: ['Knees caving in off the floor'],
    subs: ['conventional-deadlift', 'romanian-deadlift'],
  },
  {
    slug: 'romanian-deadlift', name: 'Romanian deadlift', pattern: 'hinge', category: LF, equipment: ['barbell'],
    primary: ['glutes', 'hamstrings', 'erectors'], secondary: ['back'], long: true, axial: true, tags: ['hinge_rdl'],
    cues: ['Start standing, soft knees', 'Push the hips back and slide the bar down the thighs', 'Stop when the hamstrings are fully stretched and the back is still flat', 'Squeeze the glutes to stand tall'],
    mistakes: ['Rounding the lower back to reach lower', 'Bending the knees into a squat'],
    subs: ['dumbbell-romanian-deadlift', 'single-leg-rdl', 'back-extension-45', 'seated-leg-curl'],
  },
  {
    slug: 'dumbbell-romanian-deadlift', name: 'Dumbbell Romanian deadlift', pattern: 'hinge', category: LF, equipment: ['dumbbell'],
    primary: ['glutes', 'hamstrings', 'erectors'], secondary: ['back'], long: true, axial: true, tags: ['hinge_rdl'],
    cues: ['Dumbbells in front of the thighs, soft knees', 'Hinge back until the hamstrings are stretched', 'Keep the dumbbells close to the legs', 'Stand tall by driving the hips forward'],
    mistakes: ['Letting the weights swing away from the body'],
    subs: ['romanian-deadlift', 'single-leg-rdl', 'back-extension-45'],
  },
  {
    slug: 'single-leg-rdl', name: 'Single-leg Romanian deadlift', pattern: 'hinge', category: LM, equipment: ['dumbbell', 'bodyweight'],
    primary: ['glutes', 'hamstrings'], secondary: ['erectors'], long: true, unilateral: true, tags: ['hinge_rdl'],
    cues: ['Stand on one leg with a soft knee', 'Reach the free leg back as the torso tips forward', 'Keep the hips square to the floor', 'Use a support with one hand if balance limits you'],
    mistakes: ['Opening the hip so the body twists'],
    subs: ['dumbbell-romanian-deadlift', 'back-extension-45', 'seated-leg-curl'],
  },
  {
    slug: 'good-morning', name: 'Good morning', pattern: 'hinge', category: LF, equipment: ['barbell'],
    primary: ['glutes', 'hamstrings', 'erectors'], secondary: [], long: true, axial: true, tags: ['hinge_rdl'],
    cues: ['Bar on the upper back like a squat', 'Soft knees, push the hips back', 'Lower until the hamstrings limit you, back flat', 'Use moderate loads and control'],
    mistakes: ['Going too heavy and rounding the back'],
    subs: ['romanian-deadlift', 'back-extension-45'],
  },
  {
    slug: 'back-extension-45', name: '45° back extension', pattern: 'hinge', category: ISO, equipment: ['machine', 'bodyweight'],
    primary: ['glutes', 'hamstrings', 'erectors'], secondary: [], long: true, tags: ['hinge_rdl'],
    cues: ['Pad just below the hip crease', 'Hinge at the hips, not the spine', 'Squeeze the glutes to come up to a straight line', 'Hold a plate at the chest to add load'],
    mistakes: ['Hyper-extending the lower back at the top'],
    subs: ['romanian-deadlift', 'barbell-hip-thrust', 'seated-leg-curl'],
  },
  {
    slug: 'barbell-hip-thrust', name: 'Barbell hip thrust', pattern: 'hip_extension', category: LM, equipment: ['barbell', 'machine'],
    primary: ['glutes'], secondary: ['hamstrings'], tags: ['hip_ext'],
    cues: ['Upper back on a bench, bar padded over the hips', 'Feet flat, shins vertical at the top', 'Tuck the chin and ribs, drive the hips up', 'Pause and squeeze at the top'],
    mistakes: ['Arching the lower back instead of extending the hips'],
    subs: ['glute-bridge-machine', 'back-extension-45', 'bulgarian-split-squat'],
  },
  {
    slug: 'glute-bridge-machine', name: 'Glute bridge (machine)', pattern: 'hip_extension', category: ISO, equipment: ['machine'],
    primary: ['glutes'], secondary: ['hamstrings'], tags: ['hip_ext'],
    cues: ['Set the pad snug over the hips', 'Drive through the heels', 'Lock out with the glutes, not the lower back', 'Lower under control'],
    mistakes: ['Rushing reps with no pause at the top'],
    subs: ['barbell-hip-thrust', 'back-extension-45'],
  },
  // ---------------- Hamstrings / quads / calves isolation ----------------
  {
    slug: 'seated-leg-curl', name: 'Seated leg curl', pattern: 'isolation', category: ISO, equipment: ['machine'],
    primary: ['hamstrings'], secondary: [], long: true, tags: ['leg_curl_seated', 'leg_curl'],
    cues: ['Line the knee up with the machine pivot', 'Lean the torso forward to stretch the hamstrings more', 'Curl fully, then return slowly', 'Keep the hips pinned down'],
    mistakes: ['Lifting the hips off the seat to finish the rep'],
    subs: ['lying-leg-curl', 'nordic-curl', 'single-leg-rdl'],
  },
  {
    slug: 'lying-leg-curl', name: 'Lying leg curl', pattern: 'isolation', category: ISO, equipment: ['machine'],
    primary: ['hamstrings'], secondary: [], tags: ['leg_curl'],
    cues: ['Knees just off the pad edge', 'Press the hips into the bench', 'Curl the heels toward the glutes', 'Lower over 2–3 seconds'],
    mistakes: ['Hips popping up as reps get hard'],
    subs: ['seated-leg-curl', 'nordic-curl'],
  },
  {
    slug: 'nordic-curl', name: 'Nordic curl (assisted)', pattern: 'isolation', category: ISO, equipment: ['bodyweight', 'band'],
    primary: ['hamstrings'], secondary: [], long: true, tags: ['leg_curl'],
    cues: ['Kneel with the ankles anchored', 'Keep hips extended as you lower forward', 'Resist as long as possible, then catch yourself', 'Use a band or push off the floor to assist the way up'],
    mistakes: ['Bending at the hips to cheat the lowering'],
    subs: ['seated-leg-curl', 'lying-leg-curl'],
  },
  {
    slug: 'leg-extension', name: 'Leg extension', pattern: 'isolation', category: ISO, equipment: ['machine'],
    primary: ['quads'], secondary: [], tags: ['leg_ext'],
    cues: ['Knee lined up with the machine pivot', 'Hold the handles and stay seated', 'Extend fully and squeeze briefly', 'Lower slowly into the bend'],
    mistakes: ['Swinging the weight with momentum'],
    subs: ['backwards-sled-drag', 'goblet-squat', 'leg-press'],
  },
  {
    slug: 'standing-calf-raise', name: 'Standing calf raise', pattern: 'isolation', category: ISO, equipment: ['machine'],
    primary: ['calves'], secondary: [], long: true, tags: ['calf'],
    cues: ['Balls of the feet on the edge', 'Pause in the deep stretch at the bottom', 'Rise as high as possible', 'Keep the knees straight but not locked'],
    mistakes: ['Bouncing out of the bottom'],
    subs: ['leg-press-calf-raise', 'single-leg-dumbbell-calf-raise', 'seated-calf-raise'],
  },
  {
    slug: 'seated-calf-raise', name: 'Seated calf raise', pattern: 'isolation', category: ISO, equipment: ['machine'],
    primary: ['calves'], secondary: [], tags: ['calf'],
    cues: ['Pad snug above the knees', 'Full stretch at the bottom', 'Drive up onto the big toe', 'Slow, controlled reps'],
    mistakes: ['Using a tiny range of motion'],
    subs: ['standing-calf-raise', 'leg-press-calf-raise'],
  },
  {
    slug: 'leg-press-calf-raise', name: 'Leg-press calf raise', pattern: 'isolation', category: ISO, equipment: ['machine'],
    primary: ['calves'], secondary: [], long: true, tags: ['calf'],
    cues: ['Balls of the feet low on the platform', 'Keep the knees almost straight', 'Let the ankles stretch fully', 'Press through the big toe'],
    mistakes: ['Bending the knees to move more weight'],
    subs: ['standing-calf-raise', 'single-leg-dumbbell-calf-raise'],
  },
  {
    slug: 'single-leg-dumbbell-calf-raise', name: 'Single-leg dumbbell calf raise', pattern: 'isolation', category: ISO, equipment: ['dumbbell', 'bodyweight'],
    primary: ['calves'], secondary: [], long: true, unilateral: true, tags: ['calf'],
    cues: ['Stand on a step, dumbbell in the same-side hand', 'Hold a rail for balance', 'Sink into a deep stretch', 'Rise all the way up'],
    mistakes: ['Rushing the stretch at the bottom'],
    subs: ['standing-calf-raise', 'leg-press-calf-raise'],
  },
  {
    slug: 'tibialis-raise', name: 'Tibialis raise', pattern: 'isolation', category: ISO, equipment: ['bodyweight'],
    primary: [], secondary: [], tags: [],
    cues: ['Back against a wall, heels forward', 'Lift the toes as high as possible', 'Lower slowly', 'Prehab for shins and knees: high reps'],
    mistakes: ['Standing too upright so there is no resistance'],
    subs: [],
  },
  // ---------------- Horizontal push ----------------
  {
    slug: 'bench-press', name: 'Bench press', pattern: 'horizontal_push', category: UF, equipment: ['barbell'],
    primary: ['chest', 'front_delts'], secondary: ['triceps'], main: 'bench', tags: ['press_flat'],
    cues: ['Eyes under the bar, shoulder blades pinched and down', 'Feet planted, slight arch', 'Lower to the lower chest with forearms vertical', 'Press up and slightly back toward the face'],
    mistakes: ['Bouncing the bar off the chest', 'Elbows flaring straight out to the sides'],
    subs: ['flat-dumbbell-press', 'machine-chest-press', 'close-grip-bench-press'],
  },
  {
    slug: 'close-grip-bench-press', name: 'Close-grip bench press', pattern: 'horizontal_push', category: UF, equipment: ['barbell'],
    primary: ['chest', 'front_delts'], secondary: ['triceps'], tags: ['press_flat'],
    cues: ['Hands about shoulder width', 'Elbows tucked closer to the body', 'Touch slightly lower on the chest', 'Great triceps-biased pressing'],
    mistakes: ['Grip so narrow the wrists bend'],
    subs: ['bench-press', 'dip'],
  },
  {
    slug: 'incline-barbell-press', name: 'Incline barbell press', pattern: 'horizontal_push', category: UF, equipment: ['barbell'],
    primary: ['chest', 'front_delts'], secondary: ['triceps', 'side_delts'], tags: ['press_incline'],
    cues: ['Bench at about 30°', 'Lower to the upper chest', 'Keep the shoulder blades set', 'Press in a straight line over the shoulders'],
    mistakes: ['Bench too steep so it becomes a shoulder press'],
    subs: ['incline-dumbbell-press', 'incline-machine-press'],
  },
  {
    slug: 'incline-dumbbell-press', name: 'Incline dumbbell press', pattern: 'horizontal_push', category: UF, equipment: ['dumbbell'],
    primary: ['chest', 'front_delts'], secondary: ['triceps', 'side_delts'], long: true, tags: ['press_incline'],
    cues: ['Bench at about 30°', 'Lower the dumbbells deep, elbows slightly tucked', 'Feel a stretch across the chest at the bottom', 'Press up and slightly together'],
    mistakes: ['Cutting the bottom half of the rep'],
    subs: ['incline-barbell-press', 'incline-machine-press', 'push-up'],
  },
  {
    slug: 'flat-dumbbell-press', name: 'Flat dumbbell press', pattern: 'horizontal_push', category: UF, equipment: ['dumbbell'],
    primary: ['chest', 'front_delts'], secondary: ['triceps'], long: true, tags: ['press_flat'],
    cues: ['Kick the dumbbells up from the knees', 'Shoulder blades back and down', 'Lower until the chest is stretched', 'Press up without clanking the dumbbells'],
    mistakes: ['Losing tightness when getting into position'],
    subs: ['bench-press', 'machine-chest-press', 'push-up'],
  },
  {
    slug: 'machine-chest-press', name: 'Machine chest press', pattern: 'horizontal_push', category: UM, equipment: ['machine'],
    primary: ['chest', 'front_delts'], secondary: ['triceps'], tags: ['press_machine', 'press_flat'],
    cues: ['Set the seat so handles line up with mid-chest', 'Keep the shoulder blades on the pad', 'Let the handles come back to a deep stretch', 'Push without locking out hard'],
    mistakes: ['Seat set so high the shoulders roll forward'],
    subs: ['flat-dumbbell-press', 'bench-press', 'push-up'],
  },
  {
    slug: 'incline-machine-press', name: 'Incline machine press', pattern: 'horizontal_push', category: UM, equipment: ['machine'],
    primary: ['chest', 'front_delts'], secondary: ['triceps', 'side_delts'], tags: ['press_incline', 'press_machine'],
    cues: ['Handles start level with the upper chest', 'Chest up, shoulders back', 'Control the stretch', 'Drive through the palms'],
    mistakes: ['Shrugging the shoulders up during the press'],
    subs: ['incline-dumbbell-press', 'incline-barbell-press'],
  },
  {
    slug: 'dip', name: 'Dip', pattern: 'horizontal_push', category: UF, equipment: ['bodyweight'],
    primary: ['chest', 'front_delts'], secondary: ['triceps'], long: true, tags: ['press_flat'],
    cues: ['Lean slightly forward for more chest', 'Lower until the shoulders dip just below the elbows', 'Keep the shoulders away from the ears', 'Add weight with a belt once 15+ reps are easy'],
    mistakes: ['Dropping too deep with no control'],
    subs: ['flat-dumbbell-press', 'close-grip-bench-press', 'push-up'],
  },
  {
    slug: 'push-up', name: 'Push-up', pattern: 'horizontal_push', category: UF, equipment: ['bodyweight'],
    primary: ['chest', 'front_delts'], secondary: ['triceps'], tags: ['press_flat', 'press_incline'],
    cues: ['Hands slightly wider than shoulders', 'Body rigid from head to heels', 'Chest to the floor every rep', 'Elevate the feet or add a backpack to make it harder'],
    mistakes: ['Hips sagging toward the floor'],
    subs: ['flat-dumbbell-press', 'machine-chest-press'],
  },
  {
    slug: 'cable-fly', name: 'Cable fly', pattern: 'fly', category: ISO, equipment: ['cable'],
    primary: ['chest', 'front_delts'], secondary: [], long: true, tags: ['chest_iso'],
    cues: ['Step forward so the cables pull the arms back', 'Slight bend in the elbows, kept fixed', 'Open wide into a deep chest stretch', 'Bring the hands together in a hugging arc'],
    mistakes: ['Turning it into a press by bending the elbows more'],
    subs: ['pec-deck', 'dumbbell-fly'],
  },
  {
    slug: 'pec-deck', name: 'Pec deck', pattern: 'fly', category: ISO, equipment: ['machine'],
    primary: ['chest', 'front_delts'], secondary: [], tags: ['chest_iso'],
    cues: ['Handles level with the chest', 'Shoulders back against the pad', 'Let the arms open into a stretch', 'Squeeze the chest to close'],
    mistakes: ['Shoulders rolling forward at the end'],
    subs: ['cable-fly', 'dumbbell-fly'],
  },
  {
    slug: 'dumbbell-fly', name: 'Dumbbell fly', pattern: 'fly', category: ISO, equipment: ['dumbbell'],
    primary: ['chest', 'front_delts'], secondary: [], long: true, tags: ['chest_iso'],
    cues: ['Lie flat, dumbbells over the chest, palms facing', 'Lower in a wide arc with soft elbows', 'Stop at a strong stretch', 'Use light weights; the stretch does the work'],
    mistakes: ['Going so heavy the shoulders take over'],
    subs: ['cable-fly', 'pec-deck'],
  },
  // ---------------- Vertical push ----------------
  {
    slug: 'overhead-press', name: 'Overhead press (barbell)', pattern: 'vertical_push', category: UF, equipment: ['barbell'],
    primary: ['front_delts'], secondary: ['triceps', 'side_delts'], main: 'ohp', tags: ['press_vertical'],
    cues: ['Hands just outside the shoulders, forearms vertical', 'Squeeze glutes and brace', 'Move the head back, press the bar straight up', 'Finish with the bar over the mid-foot'],
    mistakes: ['Leaning back into a standing incline press'],
    subs: ['seated-dumbbell-shoulder-press', 'machine-shoulder-press'],
  },
  {
    slug: 'seated-dumbbell-shoulder-press', name: 'Seated dumbbell shoulder press', pattern: 'vertical_push', category: UF, equipment: ['dumbbell'],
    primary: ['front_delts'], secondary: ['triceps', 'side_delts'], tags: ['press_vertical'],
    cues: ['Bench nearly upright', 'Start with the dumbbells at ear height', 'Press up and slightly in', 'Keep the ribs down'],
    mistakes: ['Arching the lower back off the bench'],
    subs: ['overhead-press', 'machine-shoulder-press'],
  },
  {
    slug: 'machine-shoulder-press', name: 'Machine shoulder press', pattern: 'vertical_push', category: UM, equipment: ['machine'],
    primary: ['front_delts'], secondary: ['triceps', 'side_delts'], tags: ['press_vertical'],
    cues: ['Seat so handles start at shoulder height', 'Back flat against the pad', 'Press without shrugging', 'Lower under control to full depth'],
    mistakes: ['Partial reps at the top only'],
    subs: ['seated-dumbbell-shoulder-press', 'overhead-press'],
  },
  // ---------------- Vertical pull ----------------
  {
    slug: 'pull-up', name: 'Pull-up / weighted pull-up', pattern: 'vertical_pull', category: PC, equipment: ['bodyweight'],
    primary: ['back'], secondary: ['rear_delts', 'biceps'], long: true, tags: ['pull_vertical'],
    cues: ['Overhand grip slightly wider than shoulders', 'Start from a full dead hang', 'Drive the elbows down to the ribs', 'Chin over the bar, then lower all the way'],
    mistakes: ['Half reps that never reach a full hang', 'Kipping'],
    subs: ['lat-pulldown', 'chin-up', 'single-arm-cable-pulldown'],
  },
  {
    slug: 'chin-up', name: 'Chin-up', pattern: 'vertical_pull', category: PC, equipment: ['bodyweight'],
    primary: ['back'], secondary: ['rear_delts', 'biceps'], long: true, tags: ['pull_vertical'],
    cues: ['Underhand grip about shoulder width', 'Full hang at the bottom', 'Pull the chest toward the bar', 'Lower slowly'],
    mistakes: ['Swinging the legs for momentum'],
    subs: ['pull-up', 'lat-pulldown'],
  },
  {
    slug: 'lat-pulldown', name: 'Lat pulldown', pattern: 'vertical_pull', category: PC, equipment: ['cable', 'machine'],
    primary: ['back'], secondary: ['rear_delts', 'biceps'], long: true, tags: ['pull_vertical'],
    cues: ['Thighs locked under the pad', 'Let the arms fully stretch overhead', 'Pull the bar to the upper chest, elbows down and back', 'Lean back only slightly'],
    mistakes: ['Yanking with the lower back'],
    subs: ['pull-up', 'single-arm-cable-pulldown', 'cable-pullover'],
  },
  {
    slug: 'single-arm-cable-pulldown', name: 'Single-arm cable pulldown', pattern: 'vertical_pull', category: PC, equipment: ['cable'],
    primary: ['back'], secondary: ['rear_delts', 'biceps'], long: true, unilateral: true, tags: ['pull_vertical'],
    cues: ['Kneel or sit under a high cable', 'Reach up into a full stretch', 'Pull the elbow down to the hip', 'Keep the torso from twisting'],
    mistakes: ['Rotating the body to finish'],
    subs: ['lat-pulldown', 'pull-up'],
  },
  // ---------------- Horizontal pull ----------------
  {
    slug: 'barbell-row', name: 'Barbell bent-over row (elbow-flared)', pattern: 'horizontal_pull', category: PC, equipment: ['barbell'],
    primary: ['back'], secondary: ['rear_delts', 'biceps'], axial: true, tags: ['row_flared'],
    cues: ['Hinge to about 45°, back flat', 'Wider grip, elbows out at roughly 45–70°', 'Row to the lower chest', 'Lower until the arms are straight'],
    mistakes: ['Standing up more each rep to move the bar'],
    subs: ['chest-supported-t-bar-row', 'machine-row', 'single-arm-dumbbell-row'],
  },
  {
    slug: 'chest-supported-t-bar-row', name: 'Chest-supported T-bar row (elbow-flared)', pattern: 'horizontal_pull', category: PC, equipment: ['machine', 'barbell'],
    primary: ['back'], secondary: ['rear_delts', 'biceps'], tags: ['row_flared'],
    cues: ['Chest on the pad, feet braced', 'Wide handles, elbows flared', 'Pull the shoulder blades together at the top', 'Let them spread at the bottom'],
    mistakes: ['Lifting the chest off the pad'],
    subs: ['machine-row', 'barbell-row'],
  },
  {
    slug: 'seated-cable-row', name: 'Seated cable row (elbows in)', pattern: 'horizontal_pull', category: PC, equipment: ['cable'],
    primary: ['back'], secondary: ['rear_delts', 'biceps'], long: true, tags: ['row_extension'],
    cues: ['Neutral grip, elbows close to the sides', 'Reach forward into a stretch without rounding', 'Pull the elbows back past the torso', 'Sit tall at the finish'],
    mistakes: ['Rocking the torso back and forth'],
    subs: ['single-arm-dumbbell-row', 'machine-row'],
  },
  {
    slug: 'single-arm-dumbbell-row', name: 'Single-arm dumbbell row', pattern: 'horizontal_pull', category: PC, equipment: ['dumbbell'],
    primary: ['back'], secondary: ['rear_delts', 'biceps'], long: true, unilateral: true, tags: ['row_extension', 'row_flared'],
    cues: ['Hand and knee on a bench, back flat', 'Let the dumbbell hang into a stretch', 'Pull the elbow toward the hip', 'Avoid twisting the torso open'],
    mistakes: ['Jerking the weight with the whole body'],
    subs: ['seated-cable-row', 'machine-row', 'inverted-row'],
  },
  {
    slug: 'machine-row', name: 'Machine row', pattern: 'horizontal_pull', category: PC, equipment: ['machine'],
    primary: ['back'], secondary: ['rear_delts', 'biceps'], tags: ['row_flared', 'row_extension'],
    cues: ['Chest against the pad', 'Choose wide handles for upper back, narrow for lats', 'Pull smoothly and pause', 'Return to a full stretch'],
    mistakes: ['Shrugging the shoulders up'],
    subs: ['chest-supported-t-bar-row', 'seated-cable-row'],
  },
  {
    slug: 'inverted-row', name: 'Inverted row', pattern: 'horizontal_pull', category: PC, equipment: ['bodyweight'],
    primary: ['back'], secondary: ['rear_delts', 'biceps'], tags: ['row_flared'],
    cues: ['Hang under a bar or rings, body straight', 'Pull the chest to the bar', 'Elbows out for upper back', 'Walk the feet forward to make it easier'],
    mistakes: ['Hips sagging'],
    subs: ['single-arm-dumbbell-row', 'machine-row'],
  },
  {
    slug: 'face-pull', name: 'Face pull', pattern: 'horizontal_pull', category: PC, equipment: ['cable', 'band'],
    primary: ['back'], secondary: ['rear_delts', 'biceps', 'side_delts'], tags: [],
    cues: ['Rope at upper-chest height', 'Pull toward the eyes, hands apart', 'Elbows high and wide', 'Control the return'],
    mistakes: ['Using so much weight the torso leans back'],
    subs: ['reverse-pec-deck', 'cable-rear-delt-fly'],
  },
  {
    slug: 'cable-pullover', name: 'Cable / DB pullover', pattern: 'pullover', category: ISO, equipment: ['cable', 'dumbbell'],
    primary: ['back'], secondary: ['chest', 'rear_delts', 'triceps'], long: true, tags: ['pullover'],
    cues: ['Arms nearly straight, slight bend in the elbows', 'Reach overhead into a lat stretch', 'Sweep the hands down to the thighs', 'Keep the ribs down'],
    mistakes: ['Bending the elbows into a triceps extension'],
    subs: ['lat-pulldown', 'single-arm-cable-pulldown'],
  },
  // ---------------- Delts ----------------
  {
    slug: 'cable-lateral-raise', name: 'Cable lateral raise', pattern: 'isolation', category: ISO, equipment: ['cable'],
    primary: ['side_delts'], secondary: [], long: true, tags: ['lat_raise'],
    cues: ['Cable low, handle in the far hand', 'Start with the hand across the body', 'Raise out to the side to shoulder height', 'Lead with the elbow'],
    mistakes: ['Shrugging the trap to lift the weight'],
    subs: ['dumbbell-lateral-raise', 'machine-lateral-raise'],
  },
  {
    slug: 'dumbbell-lateral-raise', name: 'Dumbbell lateral raise', pattern: 'isolation', category: ISO, equipment: ['dumbbell'],
    primary: ['side_delts'], secondary: [], tags: ['lat_raise'],
    cues: ['Slight lean forward, soft elbows', 'Raise out to the side, not the front', 'Stop around shoulder height', 'Lower slowly'],
    mistakes: ['Swinging heavy weights with the hips'],
    subs: ['cable-lateral-raise', 'machine-lateral-raise'],
  },
  {
    slug: 'machine-lateral-raise', name: 'Machine lateral raise', pattern: 'isolation', category: ISO, equipment: ['machine'],
    primary: ['side_delts'], secondary: [], tags: ['lat_raise'],
    cues: ['Pivot lined up with the shoulder', 'Push with the outside of the forearm or elbow', 'Raise to shoulder height', 'Keep tension at the bottom'],
    mistakes: ['Sitting so low the traps take over'],
    subs: ['cable-lateral-raise', 'dumbbell-lateral-raise'],
  },
  {
    slug: 'cable-upright-row', name: 'Cable upright row', pattern: 'upright_row', category: PC, equipment: ['cable'],
    primary: ['traps', 'side_delts'], secondary: ['rear_delts', 'biceps'], tags: ['lat_raise', 'traps'],
    cues: ['Shoulder-width grip on a straight bar', 'Lead with the elbows', 'Stop when the elbows reach shoulder height', 'Stay pain-free: narrow the range if needed'],
    mistakes: ['Pulling too high with a narrow grip'],
    subs: ['cable-lateral-raise', 'shrug'],
  },
  {
    slug: 'reverse-pec-deck', name: 'Reverse pec deck', pattern: 'isolation', category: ISO, equipment: ['machine'],
    primary: ['rear_delts'], secondary: [], tags: ['rear_delt'],
    cues: ['Chest on the pad, handles at shoulder height', 'Sweep the arms back in a wide arc', 'Keep the shoulder blades fairly still', 'Pause at the back'],
    mistakes: ['Squeezing the shoulder blades instead of moving the arms'],
    subs: ['cable-rear-delt-fly', 'dumbbell-rear-delt-fly', 'face-pull'],
  },
  {
    slug: 'cable-rear-delt-fly', name: 'Cable rear-delt fly', pattern: 'isolation', category: ISO, equipment: ['cable'],
    primary: ['rear_delts'], secondary: [], tags: ['rear_delt'],
    cues: ['Cables crossed at shoulder height', 'Pull the hands apart and back', 'Arms stay nearly straight', 'Control the return across the body'],
    mistakes: ['Turning it into a row'],
    subs: ['reverse-pec-deck', 'dumbbell-rear-delt-fly'],
  },
  {
    slug: 'dumbbell-rear-delt-fly', name: 'Dumbbell rear-delt fly', pattern: 'isolation', category: ISO, equipment: ['dumbbell'],
    primary: ['rear_delts'], secondary: [], tags: ['rear_delt'],
    cues: ['Chest supported on an incline bench', 'Raise the dumbbells out wide', 'Pinkies slightly up', 'Light weight, strict reps'],
    mistakes: ['Shrugging up toward the ears'],
    subs: ['reverse-pec-deck', 'cable-rear-delt-fly'],
  },
  {
    slug: 'band-pull-apart', name: 'Band pull-apart', pattern: 'isolation', category: ISO, equipment: ['band'],
    primary: ['rear_delts'], secondary: [], tags: ['rear_delt'],
    cues: ['Arms straight in front at shoulder height', 'Pull the band apart to the chest', 'Keep the ribs down', 'High reps, constant tension'],
    mistakes: ['Bending the elbows'],
    subs: ['dumbbell-rear-delt-fly', 'face-pull'],
  },
  // ---------------- Arms ----------------
  {
    slug: 'incline-dumbbell-curl', name: 'Incline dumbbell curl', pattern: 'isolation', category: ISO, equipment: ['dumbbell'],
    primary: ['biceps'], secondary: [], long: true, tags: ['biceps_iso'],
    cues: ['Bench at about 45°, arms hanging behind the torso', 'Keep the elbows still', 'Curl up and squeeze', 'Lower to a full stretch'],
    mistakes: ['Elbows drifting forward'],
    subs: ['preacher-curl', 'barbell-curl', 'hammer-curl'],
  },
  {
    slug: 'barbell-curl', name: 'Barbell / EZ curl', pattern: 'isolation', category: ISO, equipment: ['barbell'],
    primary: ['biceps'], secondary: [], tags: ['biceps_iso'],
    cues: ['Shoulder-width grip', 'Elbows pinned at the sides', 'Curl without swinging', 'Lower all the way'],
    mistakes: ['Leaning back to swing the bar'],
    subs: ['incline-dumbbell-curl', 'preacher-curl'],
  },
  {
    slug: 'hammer-curl', name: 'Hammer curl', pattern: 'isolation', category: ISO, equipment: ['dumbbell', 'cable'],
    primary: ['biceps'], secondary: ['forearms'], tags: ['biceps_iso'],
    cues: ['Neutral grip, thumbs up', 'Elbows still', 'Curl toward the shoulder', 'Control the way down'],
    mistakes: ['Rushing the lowering'],
    subs: ['barbell-curl', 'incline-dumbbell-curl'],
  },
  {
    slug: 'preacher-curl', name: 'Preacher curl', pattern: 'isolation', category: ISO, equipment: ['machine', 'barbell', 'dumbbell'],
    primary: ['biceps'], secondary: [], long: true, tags: ['biceps_iso'],
    cues: ['Armpits snug against the pad', 'Lower until the arms are nearly straight', 'Curl without lifting the elbows', 'Slow through the stretch'],
    mistakes: ['Stopping short of the bottom'],
    subs: ['incline-dumbbell-curl', 'barbell-curl'],
  },
  {
    slug: 'overhead-cable-triceps-extension', name: 'Overhead cable triceps extension', pattern: 'isolation', category: ISO, equipment: ['cable'],
    primary: ['triceps'], secondary: [], long: true, tags: ['triceps_iso'],
    cues: ['Face away from the cable, rope behind the head', 'Elbows pointing forward and up', 'Extend fully', 'Let the hands sink deep behind the head'],
    mistakes: ['Elbows flaring wide'],
    subs: ['dumbbell-overhead-triceps-extension', 'skull-crusher', 'triceps-pushdown'],
  },
  {
    slug: 'dumbbell-overhead-triceps-extension', name: 'Dumbbell overhead triceps extension', pattern: 'isolation', category: ISO, equipment: ['dumbbell'],
    primary: ['triceps'], secondary: [], long: true, tags: ['triceps_iso'],
    cues: ['Hold one dumbbell with both hands overhead', 'Lower behind the head, elbows forward', 'Stretch, then extend', 'Seated with back support is easiest'],
    mistakes: ['Arching the back as the elbows drift'],
    subs: ['overhead-cable-triceps-extension', 'skull-crusher'],
  },
  {
    slug: 'triceps-pushdown', name: 'Triceps pushdown', pattern: 'isolation', category: ISO, equipment: ['cable'],
    primary: ['triceps'], secondary: [], tags: ['triceps_iso'],
    cues: ['Elbows tucked at the sides', 'Push down until the arms are straight', 'Pause and squeeze', 'Let the forearms come up to just past 90°'],
    mistakes: ['Elbows moving forward and back'],
    subs: ['overhead-cable-triceps-extension', 'skull-crusher', 'dip'],
  },
  {
    slug: 'skull-crusher', name: 'Skull crusher', pattern: 'isolation', category: ISO, equipment: ['barbell', 'dumbbell'],
    primary: ['triceps'], secondary: [], long: true, tags: ['triceps_iso'],
    cues: ['Lie flat, bar over the forehead', 'Lower behind the head, elbows fixed', 'Feel the stretch, then extend', 'An EZ bar is kinder to the wrists'],
    mistakes: ['Elbows flaring out'],
    subs: ['overhead-cable-triceps-extension', 'triceps-pushdown'],
  },
  // ---------------- Other ----------------
  {
    slug: 'shrug', name: 'Shrug', pattern: 'isolation', category: ISO, equipment: ['dumbbell', 'barbell', 'machine'],
    primary: ['traps'], secondary: [], tags: ['traps'],
    cues: ['Stand tall, arms straight', 'Lift the shoulders straight up toward the ears', 'Pause at the top', 'Lower fully'],
    mistakes: ['Rolling the shoulders in circles'],
    subs: ['cable-upright-row'],
  },
  {
    slug: 'cable-crunch', name: 'Cable crunch', pattern: 'core', category: ISO, equipment: ['cable'],
    primary: ['abs'], secondary: [], tags: ['abs'],
    cues: ['Kneel facing the cable, rope by the head', 'Curl the ribs toward the hips', 'Keep the hips still', 'Exhale hard at the bottom'],
    mistakes: ['Pulling with the arms or hinging at the hips'],
    subs: ['hanging-leg-raise'],
  },
  {
    slug: 'hanging-leg-raise', name: 'Hanging leg raise', pattern: 'core', category: ISO, equipment: ['bodyweight'],
    primary: ['abs'], secondary: [], tags: ['abs'],
    cues: ['Hang from a bar, shoulders active', 'Curl the pelvis up as the legs rise', 'Avoid swinging', 'Bend the knees to make it easier'],
    mistakes: ['Swinging the legs with momentum'],
    subs: ['cable-crunch'],
  },
];

/** Deterministic id used inside the engine/tests. In the database the id is md5('ex:'||slug)::uuid. */
export function seedToExerciseDef(seed: ExerciseSeed, index: number, id = seed.slug): ExerciseDef {
  return {
    id,
    slug: seed.slug,
    name: seed.name,
    pattern: seed.pattern,
    category: seed.category,
    equipment: seed.equipment,
    isMainLift: !!seed.main,
    mainLiftKey: seed.main ?? null,
    longLengthBias: !!seed.long,
    unilateral: !!seed.unilateral,
    axialLoad: !!seed.axial,
    impactLowerBody: !!seed.impact,
    defaultIncrementKg: null,
    muscles: [
      ...seed.primary.map((m) => ({ muscle: m, role: 'primary' as const })),
      ...seed.secondary.map((m) => ({ muscle: m, role: 'secondary' as const })),
    ],
    substitutions: seed.subs,
    slotTags: seed.tags,
    popularity: index,
  };
}

export const SEED_EXERCISES: ExerciseDef[] = EXERCISE_SEEDS.map((s, i) => seedToExerciseDef(s, i));
