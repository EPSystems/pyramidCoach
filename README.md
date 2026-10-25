# Pyramid Coach

A mobile-first web app (installable PWA) that **generates, runs and adapts** an evidence-based training program and nutrition targets for anyone who signs up. Built from `PyramidCoach_PLAN.md`; rules are paraphrased in our own words with page references (no book text).

- **Stack:** Next.js 16 (App Router, TypeScript strict) · Tailwind v4 + shadcn/ui (Radix) · Supabase (Postgres, Auth with email + password and Google, RLS) · Recharts · Zod · Vitest · Playwright.
- **Core:** `lib/engine` is a pure, deterministic rules engine (no clock, no randomness, no I/O; enforced by ESLint). Every output carries rule IDs that the UI shows in "Why?" popovers.

## Local setup

Requirements: Node 20+, pnpm, Docker (for local Supabase).

```bash
pnpm install
pnpm exec supabase start          # Postgres, Auth, Mailpit (http://127.0.0.1:54324)
cp .env.example .env.local        # fill with the keys printed by `supabase start`
pnpm db:reset                     # applies migrations + supabase/seed.sql
pnpm dev                          # http://localhost:3000
```

### Signing in

- Create an account at `/signup` (email + password) or use **Continue with Google**; sign in at `/login`.
- Email sign-ups must confirm first. Locally, the confirmation and password-reset emails land in **Mailpit** (http://127.0.0.1:54324); the link signs you in and opens onboarding.
- The account whose email matches `OWNER_EMAIL` (seeded into `app_config`) becomes the owner and gets **More → Admin** (users list, **Remove user**).
- Google locally: create an OAuth client (redirect URI `http://127.0.0.1:54321/auth/v1/callback`), export the two `SUPABASE_AUTH_EXTERNAL_GOOGLE_*` variables below in the shell that runs `supabase start`, and restart the stack. Without them the button renders but Google sign-in fails locally.

### Environment variables

| Variable                                                                          | Purpose                                                                                                                               |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`                       | Supabase client                                                                                                                       |
| `SUPABASE_SERVICE_ROLE_KEY`                                                       | server only (seeds and tests; the app no longer uses it)                                                                              |
| `OWNER_EMAIL`                                                                     | owner account (also seeded into `app_config`)                                                                                         |
| `APP_URL`                                                                         | base URL for auth redirects (falls back to the request origin)                                                                        |
| `NEXT_PUBLIC_CONTACT_EMAIL`                                                       | optional contact address shown on `/privacy` and `/terms` (without it they show a generic fallback, no mailto)                        |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` | local only: Google OAuth client for `supabase start` (read by `supabase/config.toml`; production sets them in the Supabase dashboard) |

## Seeding

Reference data (16 muscles, 13 patterns, 74 exercises, 7 sports, 98 rule sources) lives in TypeScript under `lib/knowledge/` and is rendered to idempotent SQL:

```bash
pnpm seed:gen     # rewrites supabase/seed.sql
pnpm db:reset     # or run the file against any database; upserts are safe to repeat
```

To add an exercise or sport, edit `lib/knowledge/exercises.ts` / `sports.ts` (write cues in your own words), run `pnpm seed:gen`, then re-apply the seed. Users can also add private custom exercises in the Library, and the owner can edit cues in Admin.

## Tests

```bash
pnpm lint && pnpm typecheck
pnpm test             # engine golden tests G1–G15, property tests, RLS integration (needs supabase start)
pnpm test:coverage    # lib/engine ≥ 90% line coverage gate
pnpm test:e2e         # Playwright: sign-up → onboarding → review happy path + auth flows (AUTH_PLAN §5.3).
                      # Builds and serves the app on :3100 against the LOCAL stack (never .env.local); needs supabase start + Mailpit
```

## Rule IDs → sources

- `lib/knowledge/rules.ts`: one entry per rule ID (`T-VOL-02`, `N-PRO-01`, …) with source tag (`MSP-T` Training Pyramid, `MSP-N` Nutrition Pyramid, `GEN` general guidance, `APP` product heuristic), page, and an own-words summary ≤ 280 chars. Seeded into `rule_sources`.
- `lib/knowledge/constants.ts`: every number, annotated with its rule ID.
- The UI shows the rule ID, a one-line reason and "Training Pyramid, p. X" / "General guidance" on every recommendation.

## Deploy (Vercel + Supabase Cloud)

1. Create a Supabase project (EU region), then `pnpm exec supabase link --project-ref <ref>` and `pnpm exec supabase db push`; run `supabase/seed.sql` in the SQL editor.
2. In Supabase Auth settings, set Site URL = your Vercel URL and add `<url>/callback**` to the redirect URLs. Then do the auth dashboard steps in `docs/TODO.md` → _Human setup checklist_ (Google provider, Confirm email, password rules, email templates, SMTP).
3. Create the Vercel project from this repo and set the env vars above (`APP_URL` = production URL).

## Project map

```
app/(auth)        login, signup (+ check-email), forgot/reset password, /callback (OAuth code + email token_hash)
app/onboarding    7-step wizard + "Your first week"
app/(app)/…       today, session/[id] (logger), week, body, progress, review, nutrition, library, generate, settings, checkin, admin
lib/engine        pure rules engine (block, schedule, distribute, progression, fatigue, plateau, nutrition, …)
lib/knowledge     constants, rule registry, explanations, exercise/sport/muscle seeds
lib/server        data loading, plan regeneration, proposals, weekly review (server-only)
lib/actions       server actions (Zod-validated, RLS-checked)
supabase          migrations, generated seed, auth email templates
tests             engine (Vitest), integration (RLS), e2e (Playwright)
docs/DECISIONS.md every judgment call
```

> General training and nutrition guidance only — not a substitute for a doctor or physiotherapist.
