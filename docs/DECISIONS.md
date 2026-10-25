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
13. Invite-only is enforced twice: a `before insert` trigger on `auth.users` (hard guarantee) and an `is_invited()` check in the login action (friendly error). The owner email from `app_config` is always allowed and becomes `owner`.
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
