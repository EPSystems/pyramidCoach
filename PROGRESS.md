# Pyramid Coach: MVP Progress

Status as of 27 October 2026 (commit `58b655d` on `main`, deployed on Vercel). This document describes what the MVP does today, how each feature works, and where its information comes from. Every section was written from the code, not from plans.

## Feature overview

| # | Feature | What it does | Main routes |
|---|---|---|---|
| 1 | Accounts and access | Email or Google sign-up, login, password reset, route protection, owner admin page, account deletion, row-level security | `/login`, `/signup`, `/admin` |
| 2 | Onboarding | 7-step wizard that captures profile, goal, experience, sports, schedule, equipment, injuries and lifestyle, then builds the first block and nutrition targets | `/onboarding` |
| 3 | Training plan and weekly schedule | Generates a full multi-week block (split, days, exercises, sets, reps, RIR, loads) around sports and injuries; Week page to view and move sessions | `/week` |
| 4 | Today and session logger | Daily hub plus the in-gym logger with real-time load correction between sets | `/today`, `/session/[id]` |
| 5 | Workout generator | One-off session aimed at the muscles furthest behind this week's targets | `/generate` |
| 6 | Exercise library | 74 built-in exercises plus custom ones, with cues, substitutions, history and dislikes | `/library` |
| 7 | Body map, check-ins and fatigue | Daily check-in, readiness, body map, injury-aware selection, deload logic | `/body`, `/checkin` |
| 8 | Nutrition | Calorie and macro targets from bodyweight, lifestyle, sports and phase, tuned by the weigh-in trend | `/nutrition` |
| 9 | Progress and analytics | Charts for e1RM, sets per muscle, bodyweight and adherence; JSON/CSV export | `/progress`, `/api/export` |
| 10 | Weekly review and proposals | Weekly questions, then engine-generated proposals the user accepts or rejects | `/review` |
| 11 | Settings and platform | Edit everything from onboarding and re-plan; app shell, units, timezones, PWA, legal pages, logging, CI | `/settings` |

## How the pieces fit together

1. **Knowledge base** (`lib/knowledge/`): the rules from *The Muscle and Strength Pyramid* books (Training and Nutrition) are encoded as numbered rules (`rules.ts`, e.g. `T-VOL-01`, `T-PRG-03`, `N-PRO-01`) and numbers (`constants.ts`: volume bands, rep ranges, RIR, rest times, progression steps, nutrition ratios). A few app-specific heuristics are marked `APP` or `GEN`. `explanations.ts` provides the "Why" texts shown in the UI. The exercise, muscle and sport catalogs also live here and are seeded into Supabase by `scripts/gen-seed.ts`.
2. **Engine** (`lib/engine/`): pure, tested functions that apply those rules: block and split choice, volume targets, exercise selection, scheduling around sports, prescriptions, set-to-set progression, e1RM, fatigue, plateau detection, nutrition targets and weigh-in reviews.
3. **Server layer** (`lib/server/`, `lib/actions/`): reads the user's data from Supabase, runs the engine, and writes the results (plan, targets, proposals). Every write is checked, and multi-step writes undo themselves if a later step fails.
4. **Data** (Supabase Postgres with row-level security): user input (profile, settings, sports, injuries, check-ins, logged sets, weigh-ins) and generated output (blocks, weekly targets, planned sessions, nutrition targets, proposals).
5. **The loop**: onboarding builds the first plan. Each day the user checks in and logs sessions, and the logger corrects loads live. Each week the review runs the engines on the logged data and proposes changes (deloads, volume, plateau fixes, nutrition). Accepted proposals and settings changes regenerate the plan from today onward.

## Gap-fix status (branch `gap-fixes`, 28 October 2026)

The "Limits and gaps" of every section below were worked through on the `gap-fixes` branch, merged to `main` (`ce43b80`, CI fix `2582ed9`; GitHub CI green including e2e, run 40652126391) and deployed to https://pyramid-coach.vercel.app on 28 October 2026. All 9 new migrations and the seed changes are applied to Supabase Cloud; the migration history matches the local file names. Design choices are recorded in `docs/DECISIONS.md` #37–99. Checks on the merged branch: lint and typecheck clean, 182/182 Vitest tests (unit + integration against the local stack). The Playwright e2e suite, including the new specs (`platform`, `onboarding-units`, `week-skip`, `logger`, `review-flow`, `offline`), passes 22/22 against a production build of the merged branch (`PW_REUSE_SERVER=1` lets a slow machine build and start the server by hand).

Fixed: every code gap in §1–§11 except the items below. Deliberately not changed, with reasons in DECISIONS: the 4:1 build-to-cut ratio stays a warning (#53); a resolved injury creates no proposal (the plan already rebuilds on resolve); new global exercises are still created through the seed file (#87).

Needs a human:
- Email sign-up: Resend domain + DNS, then SMTP, templates, password policy and rate limits in the Supabase dashboard; Google OAuth consent screen and client.
- pg_cron on Supabase Cloud, if the migration can't enable it (the unconfirmed-account purge schedule).
- Turnstile CAPTCHA keys, Sentry (or other) error monitoring, user cap on sign-ups: accounts or policy decisions.
- Real Android device: install, performance against the 1.5 s target, offline logging in airplane mode, Google sign-in inside the installed PWA, account deletion in production.
- Play Store / Trusted Web Activity / assetlinks, backup retention, confirming CI is green on GitHub (CI now also runs e2e).
- Product calls: food logging (new feature); whether "Replace" in the generator should mark a planned session skipped and the 13-day booking limit; the owner prefill's `sex: male` value.

## Most important open gaps (as of commit `58b655d`, before the gap fixes)

Collected from the "Limits and gaps" of each section:

- **Email sign-up in production** depends on setting up real SMTP (Resend), which is still open in `docs/TODO.md`. Google sign-in works without it.
- **Onboarding**: best-set seed loads entered in lb are stored as kg without conversion.
- **Plan**: `skipSession` exists, but no screen calls it. Regeneration discards future moves and skips.
- **Fatigue**: nothing measures RIR drift. `injury_adjust` proposals are never created.
- **Nutrition**: logging a weigh-in doesn't recompute targets on its own, and `refreshNutritionNow` isn't called from any page.
- **Testing**: the full flow (onboard, log a week, review) hasn't been verified end to end yet.

---

## 1. Accounts and access
Open sign-up with Google or email + password (confirmed by email), Supabase-session route protection, a single owner identified by email who gets an admin page, self-service account deletion, and row-level security so each user only ever sees their own data.

**What the user can do**:
- Sign up with email + password (confirmation email required) or "Continue with Google" (same button for sign-up and sign-in).
- See a "Confirm your email" page after sign-up, and resend the confirmation (60 s cooldown); the same resend box appears on login if they try to sign in unconfirmed.
- Sign in with password or Google; request a password reset link and set a new password.
- Sign out and permanently delete their account (Settings, type DELETE).
- Owner only: see the user list (name, email, joined, last active, onboarded), remove a user, edit cues/mistakes of global exercises, view the sport catalog and rule sources.

**Where it lives**: routes `/login`, `/signup`, `/signup/check-email`, `/forgot-password`, `/reset-password`, `/callback`, `/settings` (sign out, delete), `/admin`. Files: `proxy.ts`, `lib/actions/auth.ts`, `lib/auth/schemas.ts`, `lib/utils/redirect.ts`, `app/(auth)/*`, `components/app/auth/*`, `lib/server/context.ts`, `lib/actions/admin.ts`, `app/(app)/admin/page.tsx` + `client.tsx`, `lib/actions/settings.ts` (`deleteAccount`), `app/(app)/layout.tsx`, `supabase/migrations/*.sql`, `docs/AUTH_PLAN.md`.

**How it works**:
1. **Validation** (`lib/auth/schemas.ts`, zod): email trimmed and lowercased, max 200 chars; new passwords 8 to 72 chars with at least one letter and one digit; confirm must match. Supabase error codes are mapped by `authCode` to friendly messages (`authErrorMessage`).
2. **Sign-up** (`signUp`): calls `supabase.auth.signUp` with `emailRedirectTo = <origin>/callback?next=/onboarding`, then redirects to `/signup/check-email?email=…`. An already-registered email gets the same screen (no account enumeration). `resendConfirmation` only surfaces rate-limit errors; other failures are logged and hidden.
3. **Sign-in** (`signIn`): `signInWithPassword`, then stamps `profiles.last_active_at` and reads `onboarded_at`; goes to `/onboarding` if not onboarded, else to `safeNext(next)` (default `/today`). If the stamp fails it goes to `next` and relies on `requireOnboarded`.
4. **Google** (`signInWithGoogle`): `signInWithOAuth` with `redirectTo = <origin>/callback?next=…`. Per DECISIONS 35, Supabase auto-links Google to an existing account with the same confirmed email.
5. **Forgot/reset**: `requestPasswordReset` always answers "If an account exists…" (except rate limits). The link lands on `/callback` with `type=recovery`, which redirects to `/reset-password`; `updatePassword` requires a live session (else "Your reset link expired"), rejects `same_password`, then goes to `/today`.
6. **`/callback`** (`app/(auth)/callback/route.ts`): exchanges `code` (OAuth) via `exchangeCodeForSession`, or `token_hash` + `type` (email links) via `verifyOtp`. Failure redirects to `/login?error=link` ("That link expired or was already used"). Email links use `token_hash` rather than PKCE so they work in Gmail's in-app browser (DECISIONS 34).
7. **Origin and `next`**: `appOrigin` uses `APP_URL`, else the request origin, and never lets a localhost `APP_URL` win over a real host. `safeNext` accepts only same-site relative paths.
8. **Route protection** (`proxy.ts`): runs `getUser()` on every request (refreshing cookies). Public paths: `/login`, `/signup` (and subpaths), `/forgot-password`, `/callback`, `/privacy`, `/terms`, `/api/health`, `/manifest.webmanifest`. Signed-out users on anything else go to `/login` (query string dropped). Signed-in users on `/`, `/login` or `/signup` go to `/today`. `/reset-password` is deliberately protected (needs the recovery session).
9. **Server gates** (`lib/server/context.ts`): `requireUser` (request-cached) uses `getClaims()`, which verifies the JWT locally, redirecting to `/login` if there is no `sub`. `getUserContext` loads profile, settings, sports, injuries and sets `isOwner = profile.role === 'owner'`. `requireOnboarded` (called by `app/(app)/layout.tsx`) redirects to `/onboarding` unless `profiles.onboarded_at` and a `user_settings` row exist.
10. **Profile creation**: trigger `on_auth_user_confirmed` runs `handle_new_user` when `email_confirmed_at` becomes set, inserting a `profiles` row with role `owner` if the email matches `app_config.owner_email`, else `member`; `display_name` is Google's `full_name` or the email's local part.
11. **Admin**: `/admin` returns 404 unless `isOwner`; the nav shows the link only to the owner. `requireOwner` in `lib/actions/admin.ts` re-checks the role. `removeUser` calls RPC `admin_remove_user` (checks `is_owner()`, refuses the owner email, deletes from `auth.users`, cascading all data). `updateGlobalExercise` edits `cues` (max 6 x 160 chars) and `mistakes` (max 4) on exercises with `owner_user_id` null.
12. **Account deletion**: `deleteAccount` requires the literal "DELETE", calls RPC `delete_my_account` (deletes the caller from `auth.users`; FKs `on delete cascade`), signs out, redirects to `/login`.

**Where the information comes from**:
- Email, password, confirm text: user input. Google identity and name: Google OAuth via Supabase Auth.
- Sessions/users: Supabase Auth (`auth.users`, cookies).
- Role, onboarded, last active, display name: `profiles` table. Owner email: `app_config` (key `owner_email`, seeded in `supabase/seed.sql`; no RLS policies, readable only by security-definer functions).
- Admin user list: RPC `admin_list_users` (names and activity only). Admin rule list: `rule_sources` table; sports/exercises: global rows of `sports`/`exercises`.
- RLS: every user table has an "own rows" policy (`user_id = auth.uid()`); `profiles` blocks role changes via `my_role()`; reference tables are read-only to signed-in users; global exercises/sports/rule sources are writable only when `is_owner()`. No Pyramid knowledge-base rules are involved in this feature.

**Limits and gaps**:
- Single hard-coded owner (by email); no way to add admins or change roles in the app.
- No CAPTCHA/Turnstile (AUTH_PLAN open question 2; only commented-out config in `supabase/config.toml`). No cleanup of unconfirmed accounts (open question 3) and no `/signup` noindex or user cap (open question 1).
- docs/TODO.md: real email via Resend SMTP is still open and blocks email sign-up in production (Supabase's built-in mailer only reaches team members; Google works without it); Google OAuth, Supabase templates, password policy and rate-limit dashboard steps are unchecked; account deletion is wired but "verify it in production".
- The proxy drops the original path when bouncing to `/login`, so users return to `/today`, not the page they asked for.
- `lib/supabase/admin.ts` (service-role client) exists but I found no imports of it.
- Admin user list shows no error if the RPC fails (it renders an empty list).

---

## 2. Onboarding
A 7-step wizard that collects a new user's profile and training context, saves it, builds the first training block and nutrition targets, and shows a "Your first week" summary.

**What the user can do**:
- About you: name (defaults to the email prefix), sex (required), units (kg/lb), bodyweight (required), height (cm), birth year, optional body fat %.
- Goal: lean muscle gain, recomp, strength, fat loss or support my sport.
- Experience: novice/intermediate/advanced, or "Not sure" plus years trained (under 1 year gives novice, anything more gives intermediate); "trained regularly in the last month?"; optional best set (load x reps) for squat, bench, deadlift, OHP.
- Sports: pick catalog sports or add a custom one (name, 0 to 3 scores for legs, arms/shoulders, jumping/landing, "lungs", plus muscles worked); per sport set weekdays (required), intensity (light/moderate/hard/match), minutes, optional time of day; choose a lifting/balanced/sport priority when relevant.
- Availability: lifting days (default Mon to Sat), session length (30 to 120 min), optional cap of 2 to 6 lifting days.
- Equipment preset (full gym, dumbbells, bodyweight) or custom set; injuries by tapping the body map and picking niggle, pain or injury, with an optional note.
- Lifestyle: sedentary to very active.
- "Continue" stays disabled until the step is valid; "Build my plan" needs all steps valid.

**Where it lives**: `/onboarding`, `/onboarding/done`. Files: `app/onboarding/page.tsx`, `app/onboarding/wizard.tsx`, `app/onboarding/done/page.tsx`, `lib/schemas/onboarding.ts`, `lib/actions/onboarding.ts`; helpers in `lib/server/plan.ts`, `lib/engine/e1rm.ts`, `lib/utils/units.ts`; the gate in `lib/server/context.ts`.

**How it works**:
1. `OnboardingPage` redirects onboarded users to `/today`, loads the `sports` catalog, and for the `owner` role only passes a hard-coded prefill ("Appendix F": 72 kg, lean gain, football and boxing, a hamstring rehab injury, lift seeds). Other app pages redirect to `/onboarding` while `onboarded_at` or settings are missing.
2. `finish()` converts bodyweight with `fromDisplay` (lb x 0.45359237), takes the browser timezone (fallback `Europe/Sofia`), expands the equipment preset, and drops seeds with a 0 load or reps.
3. `completeOnboarding` validates with zod `OnboardingInput` (e.g. bodyweight 35 to 250 kg, height 120 to 230, birth year 1920 to 2015, sport minutes 10 to 300, seed reps 1 to 12); failures come back as a toast.
4. Guard: if `profiles.onboarded_at` is already set it refuses ("Your setup is already complete..."), so a stale tab cannot overwrite later edits.
5. Writes, in order: update `profiles`; upsert `user_settings` (priority forced to `sport` for sport support and `lifting` with no sports; days de-duplicated; `status_source: 'self'`; seeds stored as e1RM = load x 36 / (37 - reps) via `e1rm()`); insert custom sports into `sports` with `owner_user_id`; insert new `user_sports`, then delete the old rows by id; same insert-then-delete for `injuries` (avoid slugs resolved to `exercises` ids); upsert today's `checkins` with the starting bodyweight.
6. Cleanup: a failed custom-sport or `user_sports` insert deletes the new custom sports (cascading to their `user_sports`); a failed delete of old sports or injuries removes the new rows, so the user never has both sets.
7. `regeneratePlan(..., { reason: 'onboarding' })` builds the first block (no training last month counts as 4 weeks off, which drives the intro week, T-FAT-06, DECISIONS #23); `recomputeNutrition(..., 'onboarding', { resetPhase: true })` sets targets. If either throws, the user stays on the wizard and can resubmit.
8. `onboarded_at` is set last (error if no row matched), then redirect to `/onboarding/done`.
9. `DonePage` shows the split and first week's sessions (intro tagged), block explanations and warnings with "Why" links, a body map of week-0 sets per muscle (with sport trims), and the latest nutrition targets (kcal range, protein, fat and carb minimums, sport kcal/day).

**Where the information comes from**:
- User input: all wizard fields; timezone from the browser.
- Supabase: reads `profiles`, `sports`, `user_sports`, `injuries`, `exercises`; writes `profiles`, `user_settings`, `sports`, `user_sports`, `injuries`, `checkins`; the done page reads `blocks`, `weekly_targets`, `planned_sessions`, `nutrition_targets`.
- Static knowledge: "Why" links cite N-PHS-03 (recomp), T-STA-01/02 (status by rate of progress), T-PRI-01 and S-02 (sport priority), T-SEL-08 (injury exercise removal), N-MNT-02/03/04 and N-SPT-03 (activity, maintenance, sport calories); I read only the ids as cited, not the rule texts.
- Computed: kg bodyweight, e1RM seeds, status from years, and the plan and targets (covered in other sections).

**Limits and gaps**:
- Seed loads are labelled in the chosen unit but never converted, so lb seeds are stored as kg.
- Removing a custom sport chip leaves it in the custom list, so it is still inserted into `sports`.
- User-added injuries always start `active` with no avoided exercises; only the owner prefill has slugs.
- Height is cm-only; birth year and sport minutes are only range-checked on the server.
- "Not sure" can never yield advanced.
- The owner prefill is hard-coded; sex is never prefilled.
- Writes are not one transaction; insert-then-delete and setting `onboarded_at` last are what make retries safe.
- docs/TODO.md has only test items (Google sign-up then onboarding); nothing open for the wizard itself.

---

## 3. Training plan generation and the weekly schedule
The engine turns your settings, sports, injuries and training history into a full training block (split, days, exercises, sets, reps, RIR and loads), and the Week page shows that plan day by day and lets you move sessions around it.

**What the user can do**:
- Get a complete multi-week block generated automatically at onboarding and rebuilt whenever relevant settings change.
- Press "Regenerate plan" in Settings to rebuild the plan from today.
- See the week (Mon to Sun) with lifting sessions, fixed sport sessions, logged sport and rest days; page back and forward with `/week?w=N`.
- Drag a planned session to another day (desktop) or use the "Move" dialog (mobile); the app refuses a second lifting session on one day and asks for confirmation when legs land next to a leg-heavy sport.
- See "Sets per muscle" (planned fractional sets vs. the target band), weekly hard-session load, sport trims, and block progress (kind, week X of Y, intro week).
- From the Today page (not Week): swap today's session for the week's lightest one, and move a missed session.

**Where it lives**: route `/week` (also `/settings` for the button, `/today` for swap). Files: `lib/server/plan.ts`, `lib/engine/block.ts`, `split.ts`, `schedule.ts`, `volume.ts`, `distribute.ts`, `selection.ts`, `prescription.ts`, `sports.ts`, `counting.ts`, `strength.ts`, `lib/actions/training.ts`, `lib/actions/settings.ts`, `lib/server/proposals.ts`, `app/(app)/week/page.tsx`, `app/(app)/week/week-board.tsx`, `supabase/migrations/20261025133213_init.sql` (RPC), `lib/knowledge/constants.ts`, `lib/knowledge/rules.ts`.

**How it works**:
1. `regeneratePlan` reads profile, settings, active sports, unresolved injuries, the exercise library, the active block and the last 16 weeks of logged sets. It derives `recentAvgWeeklySets` (median sets per muscle, averaged over the last 4 weeks) and `weeksOff` (weeks since last logged set, or 0/4 from the onboarding "trained last month" answer). It merges any `addAdjustments` into `user_settings.target_adjustments`. Block kind: strength goal gives a strength kind (default `strength_volume`), sport support gives `sport_support`, otherwise `hypertrophy`; a goal change discards the old kind.
2. `generateBlock` (block.ts): block length from `blockWeeks` (hypertrophy and sport support 6 weeks, strength volume 8, load 6, peak 2 to 4). New users start this Monday if today is Mon to Wed, else next Monday; regenerations start this Monday.
3. Volume (`computeTargets`, volume.ts): base sets from the previous block's median, else novice 10 / intermediate 12 / advanced 14 (T-VOL-01/02/07). Sport priority caps base at 6 (T-PRI-01); "balanced" with 2+ hard sport sessions subtracts 2 (S-01); fat loss caps at 14; strength kinds use 10 to 20, 10 (load) or 4 (peak) (T-STR-02 to 04). Per muscle: front delts get half; advanced specialisation sets 1 to 2 muscles to x1.5 and others x0.6 (T-VOL-08); sport trims subtract 0.5/1/1.5 sets per sport session by load score, max 4 per muscle (S-02, `sportTrims`); stored adjustments are added; legs capped at 8 under sport priority (S-05). Clamp to 4 to 20 (30 for specialised, T-VOL-03). Load phase drops supporting sets 1 per week (`weeklyTargetFor`, T-STR-03).
4. Lift days and split (T-SCH-01): tries k from a minimum (2, or 3 for non-novices with 3+ days) up to min(5, available days, user cap), 6 only for non-strength with 45-minute sessions. For each k, `chooseSplit` picks FB2/UL2, FB3/FPF3 (FPF3 when leg target average is 16+, T-SPL-02), UL4/PYR4, UL5/LPP5 or PYR6/FPP6 depending on the "alternative" style (T-SPL-01). It takes the first k where the week fits time (average session at most the limit, none over 115%), every muscle meets its target, and frequency is enough (1 session at 10 or fewer sets, 2 at 20 or fewer, else 3; T-FRQ-02). If none fits, it uses the max k and lowers every non-specialised target by 1 until it fits, else warns `TIME_TOO_SHORT`.
5. Exercise selection (`selectForSlot`/`rankCandidates`): each template slot lists acceptable slot tags. Candidates must match equipment (any-of), not be disliked, not be on an injury's avoid list, and not be axial/impact for a painful muscle (T-SEL-04/08). Ranking: previous block's choice (T-SEL-06), pain-safe category, tag order, non-axial under sport priority, preferred category, not used elsewhere this week, long-length bias (T-SEL-03), then popularity. Strength main lifts use `selectMainLift` (T-SEL-07).
6. Distribution (`distribute`): adds or removes sets so each muscle lands within target minus 0.5 to plus 1, counted fractionally (primary 1, secondary 0.5; T-VOL-05), at most 11 sets per muscle per session (T-FRQ-01), 2 to 5 sets per exercise, max 8 exercises; it adds isolations when needed. `orderSession` puts singles, free-weight compounds, machines, then isolation (T-SEL-05).
7. Day placement (`placeSessions`): tries every combination of available days and every rotation of the split, scoring penalties: legs the day before a leg-heavy hard sport or after a match +10, same day +1 (T-SCH-04); lifting on a hard/match sport day +4, moderate +2, morning sport +3 (T-SCH-03); back-to-back days +1, or +3 for the same region (T-SCH-06); for strength, heavy same-region work the day before a different main lift +3 (T-SCH-05); no full rest day +8 (T-SCH-02); uneven spacing 0.5 x variance. Lowest score wins.
8. Prescription (`prescribe`, `rangeLevel`): reps and RIR per category (T-INT-03), sub-range by rep variation (T-INT-04), sport priority adds 1 RIR and drops the heavy range on leg compounds (T-INT-05); rest 180/150/90 s (T-RST-01/02). Strength singles and back-offs follow `singleRpe`/`backoffReps` (RPE 5 to 8, 6 to 9, 7 to 10). Load suggestions come from history or e1RM seeds (T-PRG-01).
9. Intro week (T-FAT-06): week 1 at 75% of sets and +1 RIR after 2+ weeks off, a 20%+ volume jump, or coming from a heavy phase.
10. `replace_future_plan` (one Postgres transaction, security invoker): marks the active block `superseded`, deletes future `planned`/`moved`/`skipped` non-generated sessions from today, then inserts the new `blocks`, `weekly_targets`, `planned_sessions` and `planned_exercises`. Today's session is not recreated if one is already in progress or done.

Deloads are never on the calendar (T-FAT-02): they arrive as weekly-review proposals (standard deload cuts sets ~40%, T-FAT-01/03; targeted, T-FAT-04), applied as edits, not a regeneration.

**When the plan is regenerated**: onboarding; training settings saved (`goal_change` or `settings_change`); sport added/edited/toggled; injury saved or deleted; "Regenerate plan" (`regenerateNow`); accepted proposals of kind volume change, plateau add-volume, block transition (resets adjustments), plan regenerate and status change.

**Week page actions**: `moveSession` rejects past dates and days with another non-generated session (T-FAT-07), and returns `moveWarnings` (legs near a leg-heavy sport) for confirmation. `swapForLightest` (T-FAT-08, Today page) swaps dates with this week's planned session that has the fewest total sets.

**Where the information comes from**:
- User input: goal, priority, status, days, minutes, max days, split style, rep variation, equipment, increments, specialisation, lifts, test date, dislikes, e1RM seeds (`user_settings`); sports (`user_sports` + `sports`); injuries (`injuries`); timezone (`profiles`).
- Supabase: `logged_sets` (history), `blocks` (previous selections, median), `planned_sessions`/`planned_exercises`, `weekly_targets`, `sport_logs` (Week page).
- Static knowledge: `lib/knowledge/constants.ts` (VOLUME, FREQUENCY, INTENSITY, SUB_RANGES, REST_SECONDS, SESSION_TIME, INTRO_WEEK, STRENGTH, BLOCK_WEEKS, SPORT_TRIM), `rules.ts` (Training Pyramid: volume, frequency, intensity, selection, fatigue, strength phases; plus GEN/APP scheduling rules), exercise library (`exercises` table, seeded from `lib/knowledge/exercises.ts`), templates and splits in `split.ts`.
- Computed: targets, split, schedule, sets, prescriptions, intro week, warnings and explanations.

**Limits and gaps**:
- `skipSession` exists in `lib/actions/training.ts` but no UI calls it; the Week page offers only moving.
- Lifting time of day is not collected; a "morning" sport is assumed to be before lifting (DECISIONS 21).
- Strength goal is limited to default splits and 5 days (DECISIONS 22).
- Session-scope exercise swaps are lost on regeneration; only block-scope swaps update `blocks.selections`.
- Proposal diffs are applied with sequential writes, not a transaction (DECISIONS 12).
- Regeneration discards future moves and skips from today.
- docs/TODO.md has nothing specific to this feature beyond an end-to-end flow test.

---

## 4. Today screen and live session logger
The daily hub that shows what to train today, and the in-gym logger that records each set and corrects the next set's load in real time using the Pyramid's autoregulated double progression.

**What the user can do**:
- See today's planned session (title, kind, estimated minutes, exercises with sets x reps @ RIR), the block and week ("Hypertrophy block · week 2 of 5" plus a pyramid meter), and a readiness pill.
- Fill in the morning check-in (sleep, energy, stress, soreness body map, bodyweight); sleep is prefilled from the latest earlier check-in.
- Open pending proposals via a badge linking to /review.
- Start, continue or review a session; move today's or a missed session; swap today for the week's lightest session ("Feeling drained?"); log a sport session (sport, minutes, session RPE 1 to 10); jump to /generate.
- In the logger: enter load (+/- one increment) and reps, tap an RIR chip (0, 1, 2, 3, 4+), tick a set to log it (tick again to undo), nudge all unlogged loads one step up or down before set 1, view a warm-up ramp, use a rest timer, add a set, skip/un-skip or swap an exercise (this session or rest of block), write a note, and finish with a summary, e1RM PRs and soreness tags.

**Where it lives**:
- Routes: `/today`, `/session/[id]`.
- Files: `app/(app)/today/page.tsx`, `app/(app)/today/actions-ui.tsx`, `app/(app)/session/[id]/page.tsx`, `app/(app)/session/[id]/logger.tsx`, `lib/actions/training.ts`, `lib/engine/progression.ts`, `lib/engine/e1rm.ts`, plus helpers in `lib/engine/block.ts` (`exposuresFor`, `incrementFor`), `lib/engine/strength.ts`, `lib/engine/prescription.ts` (`warmupRamp`), `lib/server/queries.ts` (`readiness`), `components/app/checkin-card.tsx`.

**How it works**:
1. Today loads the active block, today's check-in, this and next week's sessions, pending proposals and the next planned session in parallel. Skipped sessions are hidden. Earlier sessions this week still `planned` show as "missed" with a move dialog (T-FAT-07). `readiness()` scores 1 point each for sleep >= 7 h, energy >= 3, stress <= 3, no "pain" tag: 4 = Ready, 2 to 3 = "Steady: autoregulate", else "Take it easy" (an APP heuristic, DECISIONS #29). A leg-type template on a day with a sport whose lower-body load is >= 2 shows a warning (T-SCH-03/04).
2. `swapForLightest` (T-FAT-08) compares total planned sets of `planned` sessions from today to Sunday and swaps scheduled dates with the lowest one, undoing the first write if the second fails. `moveSession` refuses a day that already has a non-generated session and returns schedule warnings the user can override.
3. Start calls `startSession` (status `planned`/`moved` to `in_progress`, sets `started_at`) then opens the logger.
4. The session page builds each exercise's opening suggestion with `suggestNextSession` from the user's history (latest 600 logged sets for those exercises). Per DECISIONS #30 this is computed on open, not frozen at plan time. Order: if the last exposure's first set had a load: hitting rep max at RIR >= rirMax adds one increment, reps target repMin+1 (T-PRG-04); heavy barbell lower compounds at >= 100 kg with two consecutive top-of-range sessions may jump 5 kg (APP); otherwise same load, reps +1 capped at repMax (T-PRG-02). With no history but an e1RM (best of last 3 exposures, or the user's `e1rm_seeds` for main lifts) the load is the one for mid-range reps + rirMax (T-PRG-01); without either, a text hint. Strength top singles use `singleLoad` at RPE 10 - rirMin (T-STR-02); notes starting "Back-off" use `backoffLoad` (T-STR-03). The first compound gets a warm-up ramp (50% x 8, 70% x 4, 85% x 2) if the working load is >= 40 kg (T-WUP-01).
5. Rows prefill from the suggestion; default RIR per set is max(rirMin, rirMax - setIndex). Logging is optimistic: the tick starts the rest timer and calls `logSet`, which upserts `logged_sets` keyed on (planned_exercise_id, set_index), flips a still-`planned` session to `in_progress`, and returns `suggestNextSet`.
6. `suggestNextSet` (in-session correction): for set 1, reps in range keeps load and targets the same reps (T-PRG-02). Below range: load x (1 - 0.04 x reps missed), rounded down to the increment, target repMin. Above range: load x (1 + 0.04 x reps over), rounded up, target repMin+1 (T-PRG-03; 0.04 is `PROGRESSION.loadAdjustPerRep`). The set-1 correction is written to all remaining unlogged rows and a toast explains it. For later sets, only the next row gets the same load and max(repMin - 1, reps achieved).
7. Finish opens a summary: logged vs planned sets, per-muscle counted sets (sets with >= 4 reps and RIR <= 4 or blank; primary muscle 1, secondary 0.5; T-VOL-05/06), and e1RM PRs where today's best beats the prior best by > 0.05 kg. Tagged sore muscles go through `addSoreness` (merged into today's check-in), then `finishSession` sets `done` and `finished_at`.
8. e1RM (`e1rm.ts`): Brzycki on effective reps, load x 36 / (37 - (reps + RIR)); no estimate above 12 effective reps. `loadAtRpe` and `e1rmToLoad` invert it.

**Where the information comes from**:
- User input: loads, reps, RIR, notes, soreness, check-in values, sport logs, move dates.
- Supabase reads: `planned_sessions`, `planned_exercises`, `logged_sets`, `checkins`, `proposals`, `blocks`, `user_settings` (equipment, increments, e1rm_seeds, disliked exercises), exercise catalogue via `loadExercises`.
- Supabase writes: `planned_sessions` (status, started_at, finished_at, scheduled_on), `planned_exercises` (sets, skipped, note, exercise_id, suggested_load_kg cleared on swap), `logged_sets`, `checkins`, `sport_logs`, `profiles` (last_active_at, bodyweight), `blocks.selections` on block-wide swaps (T-SEL-06).
- Knowledge base: `lib/knowledge/rules.ts` T-PRG-01 to 06, T-STR-02/03, T-WUP-01, T-RIR-01, T-FAT-07/08 (Training book, progression, strength phases, warm-up, RIR and fatigue topics); `lib/knowledge/constants.ts` PROGRESSION; `lib/knowledge/explanations.ts` for "Why" text.
- Computed: suggestions, readiness, PRs, set counts, warm-up ramp, substitutions (`substitutionsFor`, top 8).

**Limits and gaps**:
- Warm-up sets are shown but never logged (`is_warmup` is always false).
- Rest timer is client-only and not saved.
- `planned_exercises.note` holds both system labels and user notes: editing the note of a back-off exercise could remove the "Back-off" prefix that drives its load, and the note dialog for a top single starts empty and overwrites the single's label. This is inferred from the code, not documented.
- The finish screen only tags "sore", never "pain"; an `addSoreness` failure is logged and ignored. The "Sets added this week" heading shows only this session's sets.
- `swapExercise` does not check server-side that the target is a valid substitute.
- Sets per exercise are capped at 10 by "Add set".
- History is limited to the latest 600 rows, so PR and e1RM baselines can miss older sets.
- `EXPECTED_SESSIONS_PER_LOAD_JUMP` (T-PRG-06) is defined but not used by this feature.
- docs/TODO.md: the full flow (log a session, check-in, weekly review) is not yet verified end to end, and Today/logger performance (< 1.5 s target; /today once took 2.9 s in dev) is still unprofiled.

---

## 5. On-demand workout generator
Builds a one-off session for today (extra session, travel, short on time) from time, equipment, focus and readiness, aimed at the muscles furthest behind this week's set targets.

**What the user can do**:
- Choose minutes (20, 30, 45, 60, 75), equipment (Full gym, Dumbbells, Bodyweight, or Custom with chips for barbell, dumbbell, machine, cable, bodyweight, band, sled), focus (Auto, Upper, Lower, Full, or Pick muscles on a body map) and readiness (Normal or Tired).
- Preview the workout: title, estimated minutes, each exercise with sets x reps / RIR prescription, a suggested load (in their units) and a "Why" link to its rule ids, plus coaching notes.
- "Save for later" (session saved for today, redirect to /today) or "Start now" (saved as in progress, redirect to /session/<id>).
- Arrive pre-filled: the body explorer links to /generate?muscle=<id>, which opens in Pick mode with that muscle selected.

**Where it lives**: route /generate (nav item "Generate", also linked from /today and /body). Files: app/(app)/generate/page.tsx, app/(app)/generate/form.tsx, lib/actions/generate.ts, lib/engine/generator.ts; helpers in lib/engine/selection.ts, distribute.ts (orderSession, estimateMinutes), prescription.ts, progression.ts, counting.ts.

**How it works**:
1. `build()` (lib/actions/generate.ts) validates input with zod, then loads the exercise library, 112 days of logged sets, the last 3 check-ins, the active block and that block's weekly targets for the current week index (weeks since block start, from this Monday).
2. It computes: sets logged per muscle this week (`loggedMuscleSets` from Monday, fractional per T-VOL-05: 1 for primary, 0.5 for secondary; only sets with at least 4 reps and RIR of 4 or less count, T-VOL-06); sets per muscle over the last 3 calendar days (day before yesterday to today, labelled "48 h"); muscles marked "pain" in any of the last 3 check-ins; muscles stressed by a non-light sport scheduled yesterday, today or tomorrow.
3. `generateSession()` (lib/engine/generator.ts): resolves equipment from the preset; excludes muscles that are injured (`painfulMuscles`) or recently painful; narrows the muscle pool by focus (front delts only if explicitly picked, which the body map never allows); then sorts muscles: deprioritised last (6 or more sets in the 3-day window, or sport-stressed), then largest deficit (target minus logged), then fixed muscle order.
4. For each muscle, up to 5 exercises (30 min or less) or 8 (`SESSION_TIME.maxExercisesPerSession`): in Auto mode, muscles already at target are skipped once 2 muscles are covered; a muscle already getting 3 primary sets is skipped. The exercise is the top `rankCandidates` result for the muscle's slot tags (e.g. chest: incline, flat, machine press, chest isolation) that trains it as primary, respecting equipment, injuries, disliked exercises and sport priority.
5. Sets = clamp(ceil(max(deficit, 2) / 2), 2, 4), minus 1 if Tired (floor 2). If `estimateMinutes` (warm-up 8 min plus work and rest per set) would exceed the time budget, it retries with 2 sets, else drops the muscle.
6. `orderSession` puts free-weight compounds first, machines next, isolation last (T-SEL-05). Each exercise gets a rep/RIR range from `rangeLevel` + `prescribe` (T-INT-03); Tired adds 1 RIR. A suggested load comes from `suggestNextSession` using the exercise's past exposures and best recent e1RM.
7. `saveWorkout` re-runs `build()` (the preview is not stored), then inserts a `planned_sessions` row (kind and template_key 'generated', scheduled today, linked to the active block and week index, order_in_week 9) and its `planned_exercises`. If the exercise insert fails, it deletes the session row.

**Relation to the regular plan**: the session sits in the active block's week but adds nothing to the planned week and does not modify other sessions. Weekly volume counts logged sets, so once performed it counts like any session (the action's own comment says so). `replace_future_plan` deletes future sessions with `kind <> 'generated'`, so generated sessions survive regeneration (keeping the old, now superseded, block_id). A started generated session does not "lock" today in regeneration (lib/server/plan.ts), and the move-session double-booking guard ignores generated sessions.

**Where the information comes from**:
- Minutes, equipment, focus, readiness: user input.
- Exercise library: `loadExercises` (exercise tables); history: `logged_sets`; pain: `checkins.soreness`; targets: `weekly_targets` of the active `blocks` row (default 10 sets per muscle when missing); injuries, sports, increments, disliked exercises, goal/priority: user context (profile/settings).
- Rules: lib/knowledge/rules.ts, Training book (MSP-T): T-VOL-05 fractional counting, T-SEL-05 exercise order, T-INT-03 rep/RIR ranges by exercise type; per-exercise ids come from prescription and progression.
- Deficits, fatigue flags, sets, time estimate, loads: computed.

**Limits and gaps**:
- Always schedules for today; no check against a planned lift already on today, and several generated sessions per day are possible.
- The progression hint (`sug.hint`) is computed but not shown in the preview and saved as `note: null`.
- The UI says Auto skips muscles "sore or trained hard in the last 48 h"; the code only excludes "pain" ratings (not ordinary soreness) and merely moves recently trained muscles to the back. The window is 3 calendar days, not 48 h.
- Custom equipment with no chips selected yields an empty workout ("Nothing fits these settings").
- Week index is not capped at block length; past the block, targets fall back to 10.
- No generator items in docs/TODO.md or docs/DECISIONS.md.

---

## 6. Exercise library
A searchable catalog of 74 built-in exercises plus each user's own custom exercises, with a detail page per exercise showing muscles, coaching cues, substitutions and the user's logged history.

**What the user can do**:
- Search exercises by name and filter by muscle (primary or secondary), movement pattern, category and equipment.
- Open an exercise to see primary and secondary muscles (with their 1.0 / 0.5 set credit), a body map, the long-length badge, the default rep/RIR range, cues, common mistakes, up to 8 substitutions, best e1RM and the last 10 training days.
- Mark an exercise "I don't like this one" (and undo it), so future plans skip it.
- Create a custom exercise (visible only to them) and delete it if it isn't used in a plan or history.
- Owner only: edit the cues and mistakes of global exercises from the admin page.

**Where it lives**: `/library`, `/library/[slug]`, `/admin` (owner only, "Edit exercise text" section). Files: `app/(app)/library/page.tsx`, `app/(app)/library/browser.tsx`, `app/(app)/library/[slug]/page.tsx`, `app/(app)/library/[slug]/actions-ui.tsx`, `lib/actions/library.ts`, `lib/actions/admin.ts`, `app/(app)/admin/client.tsx`, `lib/knowledge/exercises.ts`, `lib/knowledge/muscles.ts`, `scripts/gen-seed.ts`, `lib/server/context.ts` (`loadExercises`, `mapExercise`), `lib/engine/selection.ts`.

**How it works**:
1. **Catalog.** `EXERCISE_SEEDS` holds 74 exercises, grouped by squat, hinge, leg isolation, horizontal/vertical push and pull, delts, arms and other. Each has slug, name, pattern (13 patterns in `PATTERN_SEEDS`), category (6: lower free compound, lower machine compound, upper free press, upper machine press, pulling compound, isolation), equipment (any-of list from barbell, dumbbell, machine, cable, bodyweight, band, sled), primary/secondary muscles (16 muscles in `MUSCLE_SEEDS`, 11 of them "tracked" for volume), optional flags `long` (33 exercises), `axial` (10), `impact` (1), `unilateral` (6), `main` lift key (6: squat, bench, deadlift, OHP variants), plus slot tags, cues, mistakes and listed substitution slugs.
2. **Seeding.** `pnpm seed:gen` runs `scripts/gen-seed.ts`, which writes `supabase/seed.sql` as idempotent upserts. Exercise ids are deterministic, `md5('ex:'||slug)::uuid`; `popularity` is the array index (lower = earlier in candidate ties); muscle rows are deleted and reinserted per exercise. `default_increment_kg` is never written, so it stays null for seeds.
3. **Loading.** `loadExercises` selects `exercises` joined with `exercise_muscles`, ordered by popularity; RLS returns global rows plus the user's own. `mapExercise` sets `custom` when `owner_user_id` is present.
4. **Browser.** Filtering is client-side in `LibraryBrowser`: name substring (case-insensitive) AND each selected filter.
5. **Detail page.** Cues/mistakes come from the database row, falling back to the seed file if empty. Rep/RIR range comes from `INTENSITY[category]` (T-INT-03). Substitutions come from `substitutionsFor`: the listed slugs first, then exercises sharing a slot tag, kept only if feasible (equipment, injuries) and sharing a primary muscle. History is the user's last 60 non-warmup `logged_sets`, grouped by day; best e1RM uses `e1rm(load, reps, rir)`. "Why" chips cite T-VOL-05, T-SEL-03, T-INT-03 and T-TMP-01.
6. **Custom exercises.** `createCustomExercise` validates with Zod (name 2 to 60 chars, at least one equipment and primary muscle, cues up to 600 chars). It builds a slug of name + 6 chars of user id + base-36 timestamp, derives slot tags (from `PATTERN_TAGS` by pattern, or for isolation from `ISO_TAG` per primary muscle), keeps up to 5 cue lines, sets popularity 1000 and inserts muscles (secondaries that duplicate a primary are dropped). If the muscle insert fails it deletes the orphan exercise. `deleteCustomExercise` deletes only rows owned by the user; a foreign-key failure becomes "This exercise is used in your plan or history."
7. **Dislikes.** `toggleDislike` reads `user_settings.disliked_exercise_ids`, aborts if the read fails (so other dislikes aren't wiped), then adds or removes the id. `isFeasible` in `selection.ts` rejects disliked ids (T-SEL-04), and the list is passed in by plan generation (`lib/actions/generate.ts`, `lib/server/plan.ts` via `lib/engine/block.ts`) and the session swap list (`app/(app)/session/[id]/page.tsx`). In ranking, custom exercises sort after seeded ones at equal priority.
8. **Admin editing.** `updateGlobalExercise` checks `profiles.role = 'owner'`, validates up to 6 cues and 4 mistakes (160 chars each) and updates only rows with `owner_user_id` null. RLS policy "owner writes globals" enforces the same.

**Where the information comes from**:
- Exercise and muscle definitions: static knowledge base (`lib/knowledge/exercises.ts`, `muscles.ts`; Training book Appendix E plus extras per DECISIONS #16), seeded into Supabase `exercises`, `exercise_muscles`, `muscles`, `movement_patterns`.
- Cues and mistakes: written in the app's own words (file comment); admin edits stored in `exercises`.
- Rule explanations: `lib/knowledge/rules.ts` (T-SEL-03/04, T-VOL-05, T-INT-03, T-TMP-01; Training book, exercise selection, volume, intensity, tempo).
- Custom exercises and dislikes: user input, stored in `exercises`/`exercise_muscles` and `user_settings.disliked_exercise_ids`.
- History and best e1RM: computed from `logged_sets`.

**Limits and gaps**:
- No editing of custom exercises; only create or delete. Custom exercises cannot set long-length, axial, impact, unilateral, main-lift, mistakes or substitutions.
- Custom isolation exercises for front delts, back, forearms, erectors or adductors, and custom carries, get no slot tags, so the generator never picks them automatically.
- Admin can edit only cues and mistakes of global exercises, not muscles, flags or new globals (those require editing the seed file and re-running `seed:gen`).
- Per-exercise load increments exist in the schema but are null for all seeds; increments fall back to equipment defaults (`incrementFor`).
- The detail page passes `disliked: []` to `substitutionsFor`, so disliked exercises can still appear as library substitutions (not in the session swap list).
- A dislike only affects plans built afterwards; the current plan is unchanged (UI text: "skipped when your next plan is built").
- Search matches names only; no search on cues or muscles text.

---

## 7. Body map, daily check-ins, recovery and fatigue
An interactive front/back body map plus a 10-second daily check-in feed the app's recovery logic: a readiness pill, the weekly five-question review that proposes deloads, injury-aware exercise selection and a "feeling drained" session swap.

**What the user can do**:
- View this week's body map in four modes: Volume (logged sets vs target), Planned, Last trained, Soreness. Tap a muscle (or use the accessible list) for a detail sheet: logged/planned sets, days since trained, target band and why, exercises this week, 7-day soreness, an injury note, and a "Generate a workout for X" button.
- Log a daily check-in: sleep hours (0 to 14 in 0.5 h steps, prefilled from the last logged night or 7.5), energy 1 to 5, stress 1 to 5, soreness per muscle (tap once = sore, twice = pain, three times = clear), optional morning weight (hidden if the profile hides bodyweight). The page also shows the last 7 days.
- Tag soreness from the session logger's finish screen.
- Record injuries (onboarding step "Equipment & injuries" and Settings): area, severity (niggle/pain/injury), status (active/rehab/resolved), note, exercises to avoid.
- On Today, press "Feeling drained? Swap for the lightest session".

**Where it lives**: `/body`, `/checkin`, `/today`, `/settings`, `/onboarding`. Files: `app/(app)/body/page.tsx`, `app/(app)/body/explorer.tsx`, `components/app/body-map.tsx`, `components/app/colors.ts`, `app/(app)/checkin/page.tsx`, `components/app/checkin-card.tsx`, `lib/actions/training.ts` (saveCheckin, addSoreness, swapForLightest), `lib/actions/settings.ts` (saveInjury, deleteInjury), `lib/engine/fatigue.ts`, `lib/engine/status.ts`, `lib/engine/selection.ts`, `lib/server/queries.ts` (readiness), `lib/server/review.ts`, `app/(app)/today/actions-ui.tsx`.

**How it works**:
1. Body page: loads the active block, this week's sessions, logged sets (60 days) and check-ins (last 7 days). Logged volume uses `loggedMuscleSets` (fractional: primary = 1.0, secondary = 0.5 per set); planned volume sums `fractionalSets` over non-skipped sessions, excluding main-lift singles. `volumeBand` colours a muscle: none, low (below 50% of target), building (50 to 90%), on (target plus or minus 1), above, over (above 20 sets, or 30 for a specialised muscle). Recency bands: 0 to 1, 2 to 3, 4 to 7, 8+ days since last primary working set. Soreness mode shows the latest tag. Any injury on the muscle (any status, including resolved) draws a dashed red outline. The "why this target" line cites T-VOL-01/02, S-02 (sport trim), T-VOL-08 (specialisation) and plateau adjustments.
2. `saveCheckin` validates with zod and upserts one row per user per day, keeping the stored bodyweight if none was entered (it aborts if that read fails). `addSoreness` merges new tags into today's soreness without wiping other fields.
3. Readiness pill (`readiness`): one point each for sleep at least 7 h, energy at least 3, stress at most 3, no pain tag. 4 = "Ready", 2 to 3 = "Steady: autoregulate", 0 to 1 = "Take it easy". DECISIONS #29 labels this an APP heuristic; it only displays and changes nothing.
4. Weekly review (`autofillReview`, T-FAT-01) pre-answers five questions from the week vs a 28-day baseline (constants `REVIEW`): dreading the gym (avg energy at most 2, or 2+ skipped/missed sessions); sleep worse (0.5 h below baseline when 7+ baseline nights exist, else avg below 7 h); performance down (2+ exercises with fewer first-set reps at the same load vs previous exposure, or a main lift's e1RM over 3% below its 3-week best); stress worse (avg at least 1 point above baseline); aches worse (any pain tag, or sore tags more than 2 above the weekly baseline). User overrides win. `weeklyReview` then proposes: a standard deload at 2+ yes (`DELOAD.yesThreshold`): cut about 40% of sets next week, loads/effort/sessions kept (T-FAT-01..03); a targeted deload when aches are flagged, for muscles with any pain tag or sore on 2+ days (`localSoreMuscles`): `exercisesLoadingArea` removes axial, lower-body impact, free lower compounds and free presses where the muscle is primary (all axial work for erectors) and halves sets of the rest (T-FAT-04, mentions T-FAT-05; DECISIONS #26); plus block transition (T-STR-01) and status change (T-STA-03). Proposals expire after 7 days.
5. Status inference (`inferTrainingStatus`): needs 8+ weeks of logs and 6+ repeated anchor-lift exposures; improvement share at least 60% = novice, at least 15% = intermediate, else advanced; proposed only if it matches the previous review's inference.
6. Injuries (T-SEL-08): `painfulMuscles` = non-resolved injuries with severity pain or injury. `isFeasible` excludes any exercise in a non-resolved injury's avoid list, and axial or impact exercises where a painful muscle is primary. `rankCandidates` prefers isolation, then machines, then free weights near a painful area. The block warns `INJURY_RED_FLAG` (see a physio). Saving or deleting an injury regenerates the plan. The workout generator also skips muscles tagged pain in the last 3 check-ins; its "tired" readiness option drops one set per exercise and adds 1 RIR.
7. `swapForLightest` (T-FAT-08): among this week's remaining planned sessions, swaps dates with the one with the fewest total sets, failing if today is already lightest; undoes the first write if the second fails.

**Where the information comes from**: sleep, energy, stress, soreness, weight: user input, Supabase `checkins` (PK user_id + day, soreness as jsonb). Injuries: user input, `injuries` table. Targets: `weekly_targets`, `blocks.inputs_snapshot` (sport trims), `user_settings` (specialisation, target_adjustments). Sets: `logged_sets`; sessions: `planned_sessions`. Rule texts: `lib/knowledge/rules.ts` (T-FAT-01..08, T-SEL-08, T-STA-01..03: Muscle and Strength Pyramid Training book, fatigue management, exercise selection and training status; T-STA-02/03 are APP rules). Thresholds: `lib/knowledge/constants.ts` (REVIEW, DELOAD, TARGETED_DELOAD, STATUS_INFERENCE). Bands, readiness and recency: computed APP heuristics.

**Limits and gaps**:
- No RIR-drift signal exists in fatigue.ts or status.ts; performance is judged only by reps at equal load and e1RM.
- "Swap for lightest" is a manual button, not triggered by check-in data; the readiness pill is informational only.
- The `injury_adjust` proposal kind is defined and applied (plan regenerate) but nothing in the engine creates one.
- "Niggle" severity only affects selection via its avoid list; `rehab_note` and rehab status are not used by the engine; the body map dashes resolved injuries too.
- T-FAT-05 (higher-rep week) is only advice text, not automated.
- Muscles outside the tracked list show on the map as "not targeted in this version".
- docs/TODO.md still lists an unchecked end-to-end test: "log a session, check-in, weekly review".

---

## 8. Nutrition
Sets a daily calorie and macro target from bodyweight, lifestyle, sports and goal phase, then tunes it over time from the user's weekly weigh-in trend.

**What the user can do**:
- See today's calorie target with a ±100 kcal "on target" band, protein (a minimum), fat and carbs (each with its minimum), flexible calories and the sport calories included.
- Switch phase (Gain / Maintain / Lose) and pick a target rate: loss 0.5, 0.75 or 1 %/week; gain 0.5 to 2 %/month, limited to the range for their training status.
- Log a morning weigh-in and see the latest weight, last week's rate, a chart (daily, running average, weekly average, target corridor) and chips for the last 6 weekly averages, with "low data" weeks flagged.
- See a "4:1 build vs cut" bar showing time spent building or maintaining against time spent cutting.
- Accept or decline pending calorie or activity-factor proposals produced by the weekly review.
- With "hide bodyweight" on (set in Settings), see only a trend direction (up/down/flat) instead of numbers.

**Where it lives**: route `/nutrition`. Files: `app/(app)/nutrition/page.tsx`, `app/(app)/nutrition/client.tsx` (WeighInForm, PhaseEditor), `lib/engine/nutrition.ts`, `lib/engine/nutrition-review.ts`, `lib/engine/trend.ts`, `lib/server/plan.ts` (recomputeNutrition, latestBodyweight), `lib/server/bodyweight.ts`, `lib/actions/nutrition.ts` (updatePhase), `lib/actions/training.ts` (logWeighIn, refreshNutritionNow), `lib/server/review.ts`, `lib/server/proposals.ts`, `lib/knowledge/constants.ts` (NUTRITION), `lib/knowledge/rules.ts`.

**How it works**:
1. **Phase** (phaseForGoal, N-PHS-01): goal lean_gain becomes gain, fat_loss becomes loss, and recomp, strength and sport_support become maintain. There is no separate "recomp" phase; recomp is maintenance (N-PHS-03 is shown only as a guide card).
2. **Maintenance** (nutritionTargets): BMR = 22 kcal × kg (N-MNT-01). Multiply by the activity factor (N-MNT-02). Defaults by lifestyle are sedentary 1.45, lightly active 1.65, active 1.85, very active 2.05. Sports are added separately (N-MNT-04): for each active sport, weekdays × minutes/10 × factor × kg, divided by 7 (N-SPT-03). The factor per 10 min is light 0.44, moderate 0.99, hard 1.54 kcal/kg, and "match" uses the moderate/vigorous midpoint (N-SPT-01/02). Training days do not change targets: every day gets the same number, and lifting itself adds nothing beyond the lifestyle factor.
3. **Rate and delta** (defaultRatePct): the loss default is 0.75 %/week, or 0.5 if body fat is at or below 15% (male or unspecified) or 23% (female). Gain defaults are 1.5 / 1.0 / 0.5 %/month for novice / intermediate / advanced (N-RAT-02). Loss above 1 %/week is blocked and capped (N-RAT-01). Delta = kg × rate% × 1100 kcal (N-RAT-03); for gain the monthly rate is divided by 4. A deficit over 750 kcal triggers a warning (N-RAT-04).
4. **Safety floor**: kcal is never below BMR × 1.1; if it would be, it is raised and the user gets a warning.
5. **Macros** (N-MAC-01, protein then fat then carbs). Protein is 1.6 g/kg (N-PRO-01), or 2.0 g/kg (N-PRO-02) when losing and body fat is unknown or at or below 19% (male or unspecified) / 27% (female). Note these protein thresholds differ from the rate thresholds in step 3. Fat minimum goes linearly from 40 g at 60 kg to 60 g at 90 kg; the target is the larger of that minimum and 25% of maintenance excluding sport (N-FAT-01). Carb minimum is 1 g/kg in a deficit, otherwise 2 g/kg (N-CHO-01). Carbs fill the rest. If carbs fall under their minimum, fat is reduced toward its minimum first; if that is still not enough, kcal is raised to cover all minimums and a warning is shown.
6. **recomputeNutrition** loads the profile, settings, nutrition_settings and active sports. It uses the mean of the latest 7 weigh-ins, falling back to the profile weight and then to 75 kg. It runs nutritionTargets and then re-applies the stored kcal_offset through applyKcalChange (N-ADJ-04). That function keeps protein fixed, takes cuts from fat and carbs in proportion to how far each sits above its minimum, and gives increases 25% to fat and the rest to carbs. On a phase change it resets the offset, phase start date and initial-adjust flag, and appends to phase_history. It inserts a nutrition_targets row first and then upserts nutrition_settings; if the upsert fails, it deletes the new row again. It runs on onboarding, goal change, lifestyle change, sport change, updatePhase, accepted proposals and refreshNutritionNow.
7. **Weigh-in trend** (trend.ts): weekly averages are grouped by Monday. A week is "low data" with fewer than 3 weigh-ins or no weekend weigh-in (N-WGT-02). The chart also uses a 14-day running average (N-WGT-03). The corridor starts from the first weekly average in the current phase. Its bounds are target ±0.25 %/week for loss, the status range divided by 4 for gain, and ±0.25 %/week for maintain.
8. **Weekly review** (nutritionReview, called from runWeeklyEngines in lib/server/review.ts with the last 70 days of weigh-ins). It uses completed weeks only and makes no proposal if the last week is low data or calories changed less than 14 days ago (N-ADJ-03).
   - **First-week check** (N-ADJ-01, gain or loss only): compares phase week 1 with the week before, or week 2 with week 1 for new users (DECISIONS #27). If weight moved the wrong way, it proposes changing the multiplier by ±0.2.
   - **Ongoing trend**: skips the phase's first week (N-WGT-04). The window is 2 weeks for loss (3 if under 60 kg) and 3 weeks for gain or maintain (N-ADJ-02).
     - Loss outside target ±0.25%: propose ±150 kcal (175 if kcal is 3000 or more). Undershoots also suggest the steps/cardio alternative (N-ADJ-05).
     - Gain: monthly rate (weekly × 4) outside the status range.
     - Maintain: drift over 0.25 %/week brings ±125 kcal (N-ADJ-06).
   - Proposals expire after 7 days. Accepting one calls recomputeNutrition with a kcal offset delta or a new multiplier.

**Where the information comes from**:
- **User input**: weigh-ins (logWeighIn, 30 to 300 kg, also copied to profiles.bodyweight_kg), phase and rate, lifestyle, sex, body fat %, goal, training status, sports (weekdays, minutes, intensity).
- **Supabase tables**:
  - `checkins.bodyweight_kg` holds the weigh-ins.
  - `nutrition_settings` holds phase, activity_multiplier, target_rate_pct (negative for loss), phase_started_on, last_adjusted_on, initial_adjust_done, kcal_offset and phase_history.
  - `nutrition_targets` has one row per recompute; the page shows the newest.
  - Other inputs come from `profiles`, `user_settings`, `user_sports` and `sports`, and proposals live in `proposals`.
- **Static knowledge**: `lib/knowledge/constants.ts` (NUTRITION numbers) and `lib/knowledge/rules.ts`. N-MNT, N-RAT, N-SPT-01, N-PRO, N-FAT, N-CHO, N-MAC, N-WGT, N-ADJ-01..05 and N-PHS-02/03 cite the Nutrition Pyramid book (MSP-N) with page numbers. N-PHS-01, N-MNT-04, N-SPT-02/03 and N-ADJ-06 are app-defined. The lean body-fat thresholds are marked as app choices.
- **Computed**: all targets, weekly and running averages, rate, corridor, trend direction, the 4:1 day counts (from phase_history), and flexible kcal (recomputed on the page from the stored minimums).

**Limits and gaps**:
- logWeighIn does not recompute targets. New bodyweight only flows in at the next recompute trigger.
- refreshNutritionNow exists but no page calls it.
- sessionKcalFromRpe (per-session sport calories from RPE) is exported but never used. Sport calories are always the weekly average.
- Lifestyle changes call recomputeNutrition with a multiplier. Per its logic this sets last_adjusted_on to today and initial_adjust_done to true, so the 14-day wait applies and the first-week check is skipped afterwards. Whether that is intended is not documented.
- updatePhase blocks a loss rate over 1%, but the Zod schema allows up to 3 for gain. The UI only offers 0.5 to 2.
- The 4:1 ratio is shown only as a warning; nothing enforces it.
- There is no food logging or per-meal tracking. Protein distribution and creatine appear only as static guide cards.
- docs/TODO.md has no nutrition items beyond the privacy policy note on storing weight and body-fat data. docs/DECISIONS.md #8 and #27 cover the extra nutrition_settings columns and the initial-adjust comparison.

---

## 9. Progress tracking and analytics
A read-only "Trends" page that charts estimated strength, weekly sets per muscle, bodyweight and session adherence from the user's own logs, plus a JSON/CSV data export.

**What the user can do**:
- See an e1RM trend line for each main lift (squat, bench press, deadlift, overhead press) with a dashed baseline, plus a table of Baseline, Latest, Best and Change.
- Search any logged exercise and see its first-set e1RM trend and its last 12 sessions (sets as "load × reps" and RIR per set).
- See weekly fractional sets for every tracked muscle over 8 weeks, against the active block's target band.
- See bodyweight (raw weigh-ins, running average, weekly averages, target-rate corridor), or only a trend word when numbers are hidden.
- See sessions done vs planned per week.
- Download all their data as JSON or their logged sets as CSV (buttons under "Your data" in Settings).

**Where it lives**: `/progress`, `/api/export?format=json|csv`. Files: `app/(app)/progress/page.tsx`, `app/(app)/progress/exercise-history.tsx`, `components/app/charts.tsx` (recharts: `TrendLine`, `VolumeMini`, `BodyweightChart`, `AdherenceBars`), `lib/engine/e1rm.ts`, `lib/engine/trend.ts`, `lib/engine/counting.ts`, `lib/engine/plateau.ts`, `lib/server/bodyweight.ts`, `lib/server/queries.ts`, `lib/server/review.ts`, `app/api/export/route.ts`, `app/(app)/settings/forms.tsx`.

**How it works**:
1. `ProgressPage` loads the last 180 days of `logged_sets` and drops warm-ups. It also loads planned sessions from 7 weeks before this Monday up to next Monday, and calls `bodyweightSeries` (last 120 days).
2. **e1RM** (`e1rm`): effective reps r = reps + RIR (a missing RIR counts as 0). e1RM = load × 36 / (37 − r), a Brzycki variant. There is no estimate when r > 12 or when load or reps are ≤ 0.
3. **Main lifts**: for each lift, it takes the best e1RM per day across every exercise whose `mainLiftKey` matches (so variations are pooled), rounded to 0.1 and converted to the display unit. The baseline is the user's `e1rm_seeds` value for that lift, or else the first point. Change = latest − baseline, shown green when it isn't negative.
4. **Any exercise**: per day, it uses the e1RM of the first set (lowest `set_index`).
5. **Weekly sets** (`loggedMuscleSets`): over 8 Monday-based weeks, a set counts only if it is not a warm-up, has ≥ 4 reps, and has RIR ≤ 4 or no RIR (T-VOL-06). Each counted set adds 1 to primary muscles and 0.5 to secondary muscles (T-VOL-05). Every panel shares one y-scale (max of 20 and the highest value). The shaded band is target ±1, using the active block's `weekly_targets` row for the current week index.
6. **Bodyweight** (`bodyweightSeries`, `trend.ts`):
   - `weeklyAverages` groups weigh-ins by Monday. A week is flagged lowData if it has fewer than 3 weigh-ins or no weekend day (N-WGT-02), and lowData weeks are not plotted.
   - `runningAverage` uses a 14-day trailing window (N-WGT-03).
   - The corridor starts at the first weekly average on or after the phase start. Its width is: loss = target rate ± tolerance; gain = the monthly rate for the user's training status ÷ 4; otherwise ± the maintain drift.
   - `trendDirection` compares the last two reliable weeks: above +0.15 %/week is "up", below −0.15 is "down", anything else is "flat", and fewer than 2 reliable weeks gives "unknown".
7. **Adherence**: per week, the number of `planned_sessions` with status `done` vs the total scheduled.
8. **Plateaus** do not run on this page. `detectPlateaus` runs in the weekly review (`runWeeklyEngines`):
   - Anchor exercises are the first exercise of each session this week and next week. The metric is best-set e1RM for main lifts and first-set e1RM for everything else.
   - `isPlateaued` (PLATEAU_WINDOW, marked as an app choice derived from T-PRG-06):
     - Novice: the last 3 exposures are all ≤ the best value before them.
     - Intermediate: within the last 4 weeks (8 for advanced) there are ≥ 2 exposures and their best is ≤ the best from before that window.
   - Flowchart:
     1. Fix the basics if sleep averages under 7 h, the user is in a calorie deficit, or a strength-goal main lift is trained less than twice a week (T-PRG-06).
     2. Otherwise, deload if the review has ≥ 2 recovery flags (T-FAT-01, T-FAT-03).
     3. Otherwise, add 2 sets per week for primary tracked muscles that stay at or under the 20-set cap (T-VOL-07).
   - Each proposal expires after 7 days.
9. **Export** (`GET /api/export`):
   - Returns 401 without a user.
   - `format=csv`: logged sets (date, exercise name, 1-based set number, load_kg, reps, rir, warmup), every value quoted.
   - Default JSON: `exported_at`, the user's id and email, all rows with `user_id` = the caller from 15 tables (profiles, user_settings, user_sports, injuries, blocks, weekly_targets, planned_sessions, planned_exercises, logged_sets, sport_logs, checkins, weekly_reviews, nutrition_settings, nutrition_targets, proposals), plus the user's own custom `exercises`.
   - If any table fails to load, the whole request returns 500 with `failed_tables`, so a partial export never looks complete.

**Where the information comes from**:
- **User input**: logged sets (load, reps, RIR, warm-up flag), weigh-ins, the `e1rm_seeds` from onboarding/settings, and `hide_bodyweight`.
- **Supabase tables**: `logged_sets`, `exercises`, `planned_sessions`, `blocks`, `weekly_targets`, `checkins.bodyweight_kg`, `nutrition_settings`, `user_settings`, `profiles`.
- **Knowledge base**:
  - `lib/knowledge/constants.ts`: VOLUME, PLATEAU_WINDOW and NUTRITION.weighIns.
  - `lib/knowledge/rules.ts`, Training book (MSP-T): T-VOL-05 and T-VOL-06 (set counting), T-VOL-07 (adding volume), T-PRG-06 (progression pace), T-STR-01.
  - `lib/knowledge/rules.ts`, Nutrition book (MSP-N): N-WGT-01 to N-WGT-04 (weigh-in method and averaging).
  - The e1RM formula is commented as "Section 6.16, Brzycki [GEN]", meaning general knowledge, not a book rule.
- **Computed**: every series, average, corridor, direction and adherence count is derived at request time and nothing is stored. Plateau results are stored only as proposals.

**Limits and gaps**:
- There is no charting history beyond 180 days of sets or 120 days of weigh-ins, and adherence covers only 8 weeks.
- The e1RM "How?" link cites T-STR-01, which describes strength phase cycling, not e1RM estimation. `lib/engine/strength.ts` (phase RPEs, peak length, next block kind) is not used by this page.
- e1RM ignores sets above 12 effective reps, so high-rep exercises can show an empty trend. In the exercise history chart, `unit` is set to an empty string.
- The page surfaces no plateaus or stall flags; they appear only as weekly review proposals.
- The CSV export covers logged sets only. The JSON export has no other format options.
- `lib/server/queries.ts` contains only shared helpers (`sessionsBetween`, `activeBlock`, `blockWeekIndex`, `weekRange`, `latestNutrition`, `readiness`). The progress page queries Supabase directly.
- docs/TODO.md and docs/DECISIONS.md have no progress-specific items. DECISIONS only records that `e1rm_seeds` exists and that the chart colours were validated.

---

## 10. Weekly review and coach proposals
Once a week the user confirms five recovery questions; the app then runs its training, plateau and nutrition engines and turns their findings into proposals that the user accepts or rejects one by one.

**What the user can do**:
- Answer five yes/no recovery questions (dreading the gym, sleep worse, performance down, stress worse, aches worse). These are pre-filled from their logs, and each one shows the evidence behind it.
- See a live count ("2 of 5 yes · a deload will be proposed") and a week summary: sessions done/planned, working sets, and how many muscles landed within 1 set of their target.
- Submit or re-submit the review, then accept or reject each pending proposal. Each proposal comes with a rationale, rule ids, a "Why?" popover and, for set-level changes, a before/after preview.
- Look back at the last 6 decided proposals under "Recent decisions". A pending-count badge appears in the sidebar and bottom nav.

**Where it lives**: `/review` (pending proposals are also listed on `/today`, and calorie proposals on `/nutrition`). Files: `app/(app)/review/page.tsx`, `app/(app)/review/review-form.tsx`, `lib/actions/review.ts`, `lib/server/review.ts`, `lib/server/proposals.ts`, `lib/engine/fatigue.ts`, `lib/engine/plateau.ts`, `lib/engine/nutrition-review.ts`, `lib/engine/proposals.ts`, `lib/engine/status.ts`, `components/app/proposal-card.tsx`, `lib/knowledge/explanations.ts`, `app/(app)/layout.tsx`.

**How it works**:
1. **Which week**: `reviewWeekFor` reviews the current Mon-Sun week on a Sunday and the previous week on any other day.
2. **Autofill** (`autofillReview`, thresholds in `REVIEW`): *dreading* = average energy ≤ 2 or ≥ 2 sessions skipped or missed. *Sleep* = average below the 4-week baseline minus 0.5 h; if there are fewer than 7 baseline nights, below 7 h. *Performance* = ≥ 2 exercises with fewer first-set reps at the same load, or a main lift's e1RM more than 3% below its best from the previous 3 weeks. *Stress* = at least 1 point above baseline. *Aches* = any "pain" tag, or sore tags more than 2 above the weekly baseline.
3. **`submitReview`**: validates the answers with zod, then calls `runWeeklyEngines` *before* writing anything. It upserts `weekly_reviews` (answers, the autofill snapshot, `completed_at`) and calls `insertProposals`. Finally it appends the current `inferTrainingStatus` result to `user_settings.status_history`, keeping the last 6.
4. **`buildWeeklyState`** reads `user_settings`, `checkins` (35 days before the week through its end), `logged_sets` (42 days), the active `blocks` row, `nutrition_settings.phase` and the stored plan (`planned_sessions` + `planned_exercises`). If any of these reads fails, `runWeeklyEngines` refuses to continue rather than build proposals from default values.
5. **`runWeeklyEngines`** produces the proposals:
   - `weeklyReview`: **standard_deload** if 2 or more answers are yes (T-FAT-01/02/03). It cuts sets by 40% next week; loads, RIR and sessions stay the same. **targeted_deload** if aches is yes and `localSoreMuscles` finds a muscle tagged pain once or sore on 2+ days (T-FAT-04/05). It removes axial, impact and free-weight compound exercises where that muscle is primary, and halves sets on the rest. **block_transition** in the block's last week (T-STR-01, T-SEL-06, plus T-FAT-06 after a heavy phase). **status_change** when the inferred status differs from the stored one and matches the last `status_history` entry (T-STA-01/03).
   - `detectPlateaus` (T-PRG-06) runs on "anchor" exercises (each session's first exercise this week and next) and on main lifts. A lift counts as stalled when there is no e1RM gain in 3 exposures (novice), 4 weeks (intermediate) or 8 weeks (advanced). It then picks one step: *fix_basics* if sleep is under 7 h, the user is in a calorie deficit, or a strength-goal main lift is trained less than twice a week. Otherwise *deload* if 2+ answers are yes. Otherwise *add_volume*: +2 sets for primary tracked muscles that stay at or under `VOLUME.normalCap` (T-VOL-07).
   - `nutritionReview` (Nutrition Pyramid, N-ADJ-01…06) runs only if both `nutrition_settings` and `nutrition_targets` exist. It skips weeks with low weigh-in data (N-WGT-02) and changes made less than 14 days ago (N-ADJ-03). **multiplier_adjust** (±0.2) comes from the first-week check. **calorie_adjust** steps by 150 kcal (175 kcal if intake is 3,000 kcal or more) when the loss or gain rate is off target, or by 125 kcal when weight drifts more than 0.25%/week at maintenance.
6. **`insertProposals`** skips any proposal that matches a pending one of the same kind (for plateaus: same kind and same exercise). For deloads, intro weeks and swaps it computes a before/after `preview` with `applyProposal`. Expiry is 7 days for every kind.
7. **Accept** (`acceptProposalById`) rebuilds the diff with `applyProposal` from the current plan and applies it:
   - Deloads: update `planned_exercises.sets` and `planned_sessions.kind`/`status`.
   - Volume and add-volume plateau proposals: add the extra sets to `user_settings.target_adjustments`, then `regeneratePlan`.
   - Block transition: resets those adjustments and regenerates the plan.
   - Status change: sets `training_status` (`status_source='inferred'`) and regenerates the plan.
   - Calorie and multiplier changes: `recomputeNutrition`, which writes a new `nutrition_targets` row and updates `nutrition_settings.last_adjusted_on`.
   - *fix_basics*: changes nothing.
   Each write is checked, and the proposal is marked `accepted` only after the last one succeeds. **Reject** sets `rejected`.
8. **Expiry and badge**: on every page, the app layout runs `expireProposals` (pending proposals with `expires_on < today` become `expired`) and counts what is still pending.

**Where the information comes from**:
- Answers: user input, pre-filled from computed autofill (the `checkins` and `logged_sets` tables). Stored in `weekly_reviews`.
- Thresholds: `lib/knowledge/constants.ts` (`REVIEW`, `DELOAD`, `TARGETED_DELOAD`, `PLATEAU_WINDOW`, `STATUS_INFERENCE`, `NUTRITION.adjust`).
- Rule ids and "Why?" text: `lib/knowledge/rules.ts` and `explanations.ts` (`whyText`, which falls back to the rule summary). These encode the Training Pyramid's fatigue and deload rules (T-FAT, pp. 104-108), progression pace (T-PRG-06) and periodization (T-STR-01), and the Nutrition Pyramid's adjustment rules (N-ADJ, pp. 184-190). T-STA-03 and N-ADJ-06 are labelled as app heuristics.
- Proposals: the `proposals` table (kind, title, rationale, rule_ids, payload, preview, expires_on, status).
- Weekly targets: `weekly_targets`. Weight trend: weigh-ins from `checkins` over 70 days.

**Limits and gaps**:
- Kinds that exist but are never generated: the schema and `applyProposal` support `volume_change`, `exercise_swap`, `intro_week`, `plan_regenerate` and `injury_adjust`, but no code creates them. Intro weeks only come from plan regeneration.
- Status inference uses two different lift sets: `weeklyReview` uses main lifts plus session anchors, while `submitReview` records only main lifts in `status_history`. Every re-submission also appends to the history, so two submissions in the same week can satisfy "two reviews in a row".
- Plateau targets always come from `week_index` 0 of the block, whatever the current week.
- Duplicate check: a new proposal of the same kind is dropped while an older one is pending, even if its content differs.
- T-FAT-05 (higher reps instead) is only mentioned in text; no proposal implements it.
- Accepting a *fix_basics* plateau proposal does nothing.
- `nutritionNotes` (for example "trend on target") are computed but never shown.
- Accepts are not transactional (DECISIONS.md #12), so a mid-way failure leaves earlier writes in place.
- docs/TODO.md: the end-to-end flow "log a session → check-in → weekly review" is still unchecked.

---

## 11. Settings and the app platform
The Settings page lets a user change everything onboarding captured (and re-plan from it), while the surrounding platform provides the app shell, units, timezones, theming, PWA install, legal pages, logging, and the test/CI setup.

**What the user can do**:
- Training: change goal, priority (hidden for sport_support), training status, days they could lift, session length (30/45/60/75/90/120 min), max lifting days, split style, rep-range variation, equipment, smallest weight jumps per equipment type, specialisation muscles (advanced only, up to 2), and for the strength goal the main lifts and an optional test/meet date. Then "Save & regenerate", or "Regenerate plan" without changing anything.
- Profile & display: name, sex (Male/Female, required to save), height (cm), optional body fat %, units (kg/lb), timezone, lifestyle, theme (Dark/Light/System), and "Hide bodyweight numbers" (trend direction only).
- Sports: add, edit, pause/resume or delete a sport (weekdays, intensity light/moderate/hard/match, minutes, time of day).
- Injuries & niggles: add/edit/delete an injury (area, label, severity niggle/pain/injury, status active/rehab/resolved, rehab note, exercises to avoid). Non-niggle entries show a "see a physio" warning.
- Your data: export everything (JSON) or logged sets (CSV) via `/api/export`, sign out, and delete the account by typing DELETE.
- Install the app to the home screen (PWA) and read `/privacy` and `/terms`.

**Where it lives**: routes `/settings`, `/privacy`, `/terms`, `/api/health`, `/api/export`, `/manifest.webmanifest`; `/` redirects to `/today`. Files: `app/(app)/settings/page.tsx`, `app/(app)/settings/forms.tsx`, `lib/actions/settings.ts`, `lib/server/plan.ts` (regeneratePlan, recomputeNutrition), `lib/utils/units.ts`, `lib/utils/dates.ts`, `app/manifest.ts`, `public/icons/`, `app/layout.tsx`, `components/providers.tsx`, `app/(app)/layout.tsx`, `components/app/nav.tsx`, `app/(app)/loading.tsx`, `app/(app)/error.tsx`, `app/(legal)/privacy/page.tsx`, `app/(legal)/terms/page.tsx`, `lib/log.ts`, `instrumentation.ts`, `.github/workflows/ci.yml`, `vitest.config.mts`, `playwright.config.ts`, `tests/`.

**How it works**:
1. The settings page loads the user context (requireOnboarded), the sports catalog and exercises, and hands current values to `SettingsForms`. Each section tracks a dirty flag and only enables Save when something changed.
2. Every server action validates input with Zod, then writes through the user's own Supabase session (RLS applies). After a successful recompute it calls `revalidatePath('/', 'layout')`.
3. What triggers what:
   - `updateTraining`: reads the old goal/status first (fails if unreadable, so a wrong guess can't reset the nutrition phase), saves `user_settings`, then always runs `regeneratePlan` (reason `goal_change` or `settings_change`). Only if the goal changed does it also run `recomputeNutrition` with `phaseForGoal(goal)` and `resetPhase: true` (rule N-PHS-01). Changing status marks `status_source = 'self'`; specialisation is cleared unless status is advanced; sport_support forces priority `sport`.
   - `updateProfile`: saves `profiles`. Only if lifestyle changed does it update `user_settings.lifestyle` and run `recomputeNutrition` with the activity multiplier reset to `NUTRITION.multiplierDefault[lifestyle]` (N-MNT-02). Timezone is checked with `Intl.DateTimeFormat`.
   - `saveSport` / `toggleSport` / `deleteSport`: `regeneratePlan` (reason `sport_change`) plus `recomputeNutrition` (N-SPT-03).
   - `saveInjury` / `deleteInjury`: `regeneratePlan` (reason `injury_change`) only. Resolving sets `resolved_on` to today in the user's timezone; new injuries get `started_on`.
   - `regenerateNow`: `regeneratePlan` with reason `manual`.
   - `deleteAccount`: requires the literal "DELETE", calls the `delete_my_account()` RPC (security definer, deletes the `auth.users` row for `auth.uid()`; cascades are assumed to remove the data), signs out, redirects to `/login`.
   - If the recompute throws after the save, `afterSettingsSaved` returns "Your change was saved, but your plan could not be updated. Use Regenerate plan". Settings are deliberately not rolled back.
4. Units: weights are stored in kg. `toDisplay` converts for display (kg rounded to 0.01, lb to 0.1 using 0.45359237 kg/lb), `fromDisplay` converts input back, `fmtLoad` formats with the unit suffix.
5. Timezones: `todayIn(tz)` (date-fns-tz) gives "today" as an ISO date and drives all day/week logic; an invalid zone logs a warning and falls back to Europe/Sofia, which is also the default when a profile has no timezone.
6. App shell: `app/(app)/layout.tsx` requires onboarding, expires stale proposals and counts pending ones in parallel, then renders a desktop Sidebar and a mobile BottomNav (Today, Week, Body, Progress, plus a "More" sheet with Review, Nutrition, Generate, Library, Check-in, Settings, and Admin for the owner only). The pending-proposal count shows as a badge on Review. A skeleton `loading.tsx` and an `error.tsx` ("Missed rep", Try again uses `retry()` to re-fetch) cover the group.
7. Theming: an in-house provider (not next-themes) stores `pc-theme` in localStorage, defaults to dark, and an inline script in the root layout applies the class before paint.
8. PWA: `app/manifest.ts` declares name "Pyramid Coach", standalone, portrait, start URL `/today`, colour `#1a1b17`, icons 192, 512 and maskable 512 (plus `apple-touch-icon.png` in `public/icons`).
9. Observability: `createLogger(scope)` gives debug/info/warn/error and `log.db()` which logs any Supabase error. Errors are reduced to name/message/code/status/digest so row values never leak. Debug prints outside production, or anywhere when `NEXT_PUBLIC_DEBUG=1` (silent under vitest unless set). `instrumentation.ts` logs every server request error with path and route info. React Query caches also log failures.
10. Stack and hosting: Next.js 16.4.3, React 19.3, Tailwind v4 + shadcn/Radix, Supabase (Postgres, Auth, RLS), TanStack Query, Recharts, Zod 4, pnpm. Deployed on Vercel with Supabase Cloud (TODO.md lists https://pyramid-coach.vercel.app as live).
11. Testing/CI: Vitest runs engine (golden, block, modules), auth (redirect, schemas) and RLS integration tests, with a 90% line-coverage gate on `lib/engine`. Playwright e2e (auth, happy path) builds and serves on port 3100 against the local Supabase stack, Pixel 7 profile. CI on every push/PR: install, lint, typecheck, start local Supabase and reset, then `pnpm test:coverage`.

**Where the information comes from**:
- User input: every settings field.
- Supabase tables: `profiles`, `user_settings`, `user_sports`, `sports` (catalog), `injuries`, `proposals`, plus whatever `regeneratePlan`/`recomputeNutrition` read and write (`blocks`, `logged_sets`, `nutrition_settings`).
- Knowledge base: `lib/knowledge/constants.ts` (`NUTRITION.multiplierDefault`); rule ids shown in "Why?" hints: T-SCH-01, T-PRI-01, T-STA-01, T-INT-04, T-VOL-08, T-STR-04 (Training Pyramid), N-MNT-02, N-MNT-04, N-PHS-01, N-SPT-03 (Nutrition Pyramid), S-01..S-03 (sports), T-SEL-08 (injuries).
- Computed: today's date (from timezone), display weights (from stored kg), timezone list (`Intl.supportedValuesOf`).

**Limits and gaps**:
- Changing sex, height or body fat % does not trigger a nutrition recompute, even though `recomputeNutrition` uses sex and body fat; new targets only appear on the next recompute.
- "Smallest weight jumps" is labelled and entered in kg regardless of the units setting.
- `next-themes` is listed in package.json but unused (DECISIONS.md #3 chose an in-house provider).
- Theme lives only in localStorage, so it doesn't follow the user across devices.
- No service worker: offline support is an open TODO, as are error monitoring (Sentry/Vercel alerts), a Trusted Web Activity package, and confirming CI runs green.
- TODO.md still lists the privacy policy page as unchecked although `/privacy` and `/terms` exist.
- CI does not run the Playwright e2e suite; it only runs lint, typecheck and Vitest.
- Unclear from the code read: whether all user tables cascade on `auth.users` deletion (not verified here).

---

