# Decisions

Every judgment call made while building Pyramid Coach from `PyramidCoach_PLAN.md`. Newest last.

## Platform & tooling
1. **Next.js 16 (App Router).** `create-next-app` installed v16, where middleware is called `proxy.ts`. The template enabled `cacheComponents` and `partialPrefetching`; both are **off** because every screen is per-user, RLS-backed and dynamic.
2. **Zod 4.** `z.uuid()` enforces RFC variant bits, but seeded exercise IDs are `md5('ex:'||slug)::uuid` (deterministic, idempotent seeds), which are not RFC-variant. Actions validate IDs with `z.guid()`.
3. **shadcn/ui "radix-nova" preset**, with buttons enlarged to a ≥44 px tap height (Section 8). Theme handled by a small in-house provider instead of `next-themes`; **dark is the default**, light/system are opt-in in Settings.
4. **Design language "chalk & steel":** graphite surfaces, hi-vis volt accent, Big Shoulders (display), Archivo (body), JetBrains Mono for rule-ID "stamps". Chart colours were validated with the dataviz palette validator for both themes (`--chart-1/2`).
5. **Local-first verification.** Built and verified against the local Supabase stack (Docker). Cloud Supabase/Vercel deployment needs the owner's accounts and was not done by the agent (see README → Deploy).

## Data model additions (beyond Section 5)
6. `exercises.slot_tags`, `exercises.popularity`, `exercises.mistakes`: needed to fill session-template slots deterministically (Appendix D) and for the library's "common mistakes".
7. `user_settings.split_style`, `strength_lifts`, `disliked_exercise_ids`, `e1rm_seeds`, `target_adjustments`, `trained_last_month`, `status_history`.
8. `nutrition_settings.kcal_offset` (cumulative accepted calorie changes, so recomputes after sport/bodyweight changes keep them), `initial_adjust_done`, `phase_history` (4:1 tracker).
9. `planned_exercises.slot_key`, `skipped`, `rule_ids`; `planned_sessions.started_at/finished_at`; `blocks.schedule/selections/explanations/warnings/median_target`; `proposals.preview`.
10. `profiles.email`, `bodyweight_kg`, `hide_bodyweight`, `last_active_at`. `app_config` (owner email) is readable only by security-definer functions.
11. **Idempotent set logging:** unique constraint `(planned_exercise_id, set_index)`; NULL planned ids never conflict.
12. Plan materialisation is one Postgres function, `replace_future_plan` (security invoker, so RLS still applies), giving the "one transaction" of Section 6.14. Accepting proposals applies their diff with sequential RLS-checked writes.

## Auth
13. ~~Invite-only is enforced twice: a `before insert` trigger on `auth.users` (hard guarantee) and an `is_invited()` check in the login action (friendly error). The owner email from `app_config` is always allowed and becomes `owner`.~~ **Superseded by 32–36 (2026-10-25, `docs/AUTH_PLAN.md`).**
14. The owner admin list comes from the `admin_list_users()` function: names and activity only, never training/health data.

## Engine
15. **Exercise `equipment` = any-of.** An exercise is feasible if the user has any listed item (e.g. Bulgarian split squat: dumbbell, bodyweight or barbell).
16. **Extra exercises** beyond Appendix E (dumbbell RDL, single-leg RDL, dumbbell fly, DB rear-delt fly, DB overhead triceps, single-leg DB calf raise, inverted row, band pull-apart), so the dumbbell and bodyweight presets work. 74 exercises total.
17. Face pull keeps the Appendix E roles (back primary) but is **not** used for the "rear-delt iso" slot.
18. **Time check (6.3 / T-SCH-01):** a split fits if the *average* session ≤ session length and no single session exceeds it by more than 15%. Upper/Lower splits are naturally upper-heavy; the plan's own G4 expectation (4 days at 60 min) only holds under the summed/average formulation.
19. **Distribution:** sets are spread to another session (adding an isolation where the muscle isn't trained yet) before an exercise goes past 4 sets; ties go to the shorter session. Front delts are never trimmed for being over target (pressing covers them).
20. **Within-week variety:** an exercise already used elsewhere in the week is mildly deprioritised (after tag and category preference).
21. **Scheduling penalties added:** lifting on the same day as a `moderate` sport +2. A `morning` sport counts as "before lifting" (+3), since lifting time isn't collected. A leg session on the same day as a leg-heavy hard sport costs +1. With these, G4 resolves to Mon Upper / Wed Lower / Thu Upper / Sat Lower (legs on the match day, flagged on Today), which is what the plan's G4 constraints allow.
22. **Strength goal** always uses the default (FB/UL) splits, because only they carry main-lift slots; k ≤ 5 days. Load-phase supporting volume starts at 10 and drops 1 set/week (floor 5). Back-offs are at RPE 7.
23. **Intro week (T-FAT-06)** at onboarding is triggered by a "Trained regularly in the last month?" answer, since a fresh start has no history.
24. **Block start:** a new user's first block starts this Monday if today is Mon–Wed, otherwise next Monday (sessions before today are not created). Regenerations start at this Monday and replace sessions from **today** (not tomorrow) unless today's session is already started or done.
25. Hypertrophy and sport-support blocks are 6 weeks.
26. **Targeted deload:** for a muscle, remove exercises where it is primary and the exercise is axial/impact/free-weight compound; halve the sets of the other exercises where it is primary. For `erectors` (lower back), remove every axial exercise.
27. **Nutrition initial adjustment (N-ADJ-01):** compares phase week 1 with the week before; with no prior data (new users), compares week 2 with week 1. Maintenance drift step is 125 kcal.
28. **Body map geometry:** the unnamed lumbar strip maps to `erectors` and the inner-thigh strip to `adductors`, so lower-back soreness can be tagged (G8). The shin strip stays decorative.
29. Readiness pill on Today is an APP heuristic: sleep ≥ 7 h, energy ≥ 3, stress ≤ 3, no pain.
30. In-session suggestions (6.10) are computed when the logger opens from the latest history, rather than frozen at plan generation; logging them is the approval.
31. "Why?" explanations reuse the rule registry's own-words summaries, with bespoke lines for the most common rules (`lib/knowledge/explanations.ts`). No book text anywhere.

## Auth (open sign-up, 2026-10-25 — replaces 13; see `docs/AUTH_PLAN.md`)
32. **Open sign-up.** Anyone can create an account with **Continue with Google** or **email + password** (≥ 8 chars, letters and digits; same rule in Supabase and zod). The `invites` table, `enforce_invite` trigger and `is_invited()` are dropped (`20261025151754_remove_invite_only`). Sign-in no longer sends an email, which also removes the per-login email rate-limit problem. The owner is still whoever matches `app_config.owner_email`; admin keeps the users list and **Remove user** (`admin_remove_user`).
33. **A profile exists only after confirmation.** `handle_new_user` runs on `insert or update of email_confirmed_at` when it is set, instead of on every insert. Google users arrive confirmed and get a profile at once; email sign-ups get one when they click the link. Unconfirmed sign-ups have no app data and don't appear in Admin. `display_name` comes from Google's `full_name` when present.
34. **Email links use `token_hash`, not PKCE.** The confirmation and recovery templates link to `/callback?token_hash=…&type=…`, which `verifyOtp` accepts in any browser. That matters on Android, where Gmail opens links in its own in-app browser that doesn't have the PKCE verifier cookie. Local `config.toml` uses the same templates (`supabase/templates/`).
35. **Google is auto-linked by email.** Supabase links a Google identity to an existing user with the same *confirmed* email, so the owner's old magic-link account keeps its data when signing in with Google (or after setting a password via *Forgot password*).
36. **No account enumeration.** Sign-up with a registered email shows the same "Confirm your email" screen; wrong password and unknown email get one message; forgot-password always answers "If an account exists…". Redirects only follow a same-site relative `next` (`safeNext`), and links are built from `APP_URL` or the request origin, never `localhost` in production.

## Generator and library (gap fixes, 2026-10-28)
37. **Generated workouts pick a day and guard against doubles.** The generator takes a date (today by default, up to 13 days ahead); only a workout for today can be started at once. If the day already has a planned, started or done session, the preview lists it and saving needs a choice: *Replace it* (a planned plan session is marked `skipped`, a planned generated one is deleted; started/done ones are never touched) or *Keep both*. The server re-checks on save, so a second tap or another tab cannot add a duplicate silently. Replacement runs after the new session is saved, so a failure leaves both rather than neither.
38. **Generator recovery rules match the copy.** "Last 48 h" is a real 48 h window on `logged_sets.created_at` (sets back-filled for older days don't count; rows without a timestamp count for today and yesterday). Muscles marked *sore* in today's or yesterday's check-in are skipped unless that would leave nothing to train (then they stay, with a note); *pain* in any of the last 3 check-ins still always excludes. Muscles trained hard in 48 h or stressed by a sport are still only moved last, and the Auto copy says so. Recent soreness/training only apply when the workout is for today.
39. **Generator week index is clamped** to the active block (`blocks.weeks - 1`), so past the block's end the last week's targets apply instead of the flat 10-set default. Weekly deficits are measured for the chosen day's week.
40. **Progression hint is saved as the planned exercise note** (`planned_exercises.note`, where system text lives today) and shown in the preview.
41. **Custom equipment needs at least one item** in the form; the engine itself falls back to bodyweight + band with a note if called with none.
42. **Slot tags for custom exercises** come from `deriveSlotTags` (engine): pattern tags, plus one isolation tag per primary muscle for isolation, carry and core. New tags `front_raise`, `forearms`, `erectors`, `adductors`, `carry`; the generator uses `front_raise` for front delts and back isolation maps to `pullover`. Untracked muscles (forearms, erectors, adductors, traps, abs) are still never generator targets by design; their tags make them findable as substitutions and for future slots.
43. **Per-exercise load steps.** A catalog step is a *floor* over the user's equipment step: `max(exercise step, equipment step)`, because the equipment step is the smallest jump the user can make. Only plate-loaded or big lower-body exercises get one (leg press / hack squat 10 kg, RDL / hip thrust 5 kg). Main lifts deliberately keep the equipment step: top singles and RPE-based loads need 2.5 kg resolution. A custom exercise's own step wins outright (the user knows that machine).
44. **Custom exercises are editable** (name, pattern, category, equipment, muscles, long-length / spine-loading / impact / unilateral, main-lift variation, cues, mistakes, up to 8 substitutions, load step). The slug (URL) never changes. Muscle rows are replaced delete-then-insert; if the insert fails the old rows are restored.
45. **Owner edits of global exercises** now cover muscles, flags and load step as well as cues/mistakes. Creating new globals in-app is not offered: globals need curated slot tags and an entry in `lib/knowledge/exercises.ts`, and `seed.sql` (re-run on `db reset`) overwrites in-app edits, so lasting changes still belong in the catalog file.
46. **Disliking offers an immediate swap.** If the exercise is in future planned sessions, the detail page offers up to 6 substitutes (same rules as the session swap list, dislikes excluded) and reuses the logger's block-wide `swapExercise`. Library substitutions now also exclude disliked exercises.
47. **Library search** matches every word against the name, cues (database or seed fallback) and muscle names (short and full).
