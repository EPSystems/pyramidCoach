# Road to production

From local demo (Docker + Mailpit) to an app invited users can install on Android.
Steps 1–5 make it user-ready; step 6 is the optional Play Store listing.

## 1. Git + GitHub
- [ ] Initialise git in `pyramid-coach/` and make the first commit (`.env.local` is gitignored — verify before committing)
- [ ] Create a **private** GitHub repo under `EDermendjiev` (the account linked to Vercel) and push
- [ ] Add `emildermendjiev9@gmail.com` to the GitHub account so commits are attributed
- [ ] Confirm `.github/workflows/ci.yml` runs green on the first push

## 2. Hosted database — Supabase Cloud
- [ ] Create a Supabase project (EU region)
- [ ] `pnpm exec supabase link --project-ref <ref>`
- [ ] `pnpm exec supabase db push` (applies migrations)
- [ ] Run `supabase/seed.sql` in the SQL editor (exercises, sports, rule sources)
- [ ] Note the project URL, anon key and service-role key for step 4

## 3. Real email (blocker — login is magic-link only)
Supabase's built-in mailer only sends to project team members and is heavily rate-limited, so invited users can't log in without this.
- [ ] Buy a domain
- [ ] Create a Resend account and verify the domain (SPF/DKIM DNS records)
- [ ] Supabase → Auth → SMTP: enter Resend's SMTP settings and a sender like `no-reply@<domain>`
- [ ] Customise the magic-link email template (Supabase → Auth → Email templates)

## 4. Deploy — Vercel
- [ ] Import the GitHub repo into Vercel
- [ ] Set env vars with **cloud** values: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_EMAIL`, `APP_URL` (= production URL)
- [ ] Attach the domain (e.g. `app.<domain>`)
- [ ] Supabase Auth settings: Site URL = production URL; add `<url>/callback` to redirect URLs
- [ ] Check `/api/health` returns `ok` in production

## 5. Verify on a real Android phone
- [ ] Log in as owner via a real email in Chrome on Android
- [ ] Install via ⋮ → *Install app*; confirm it opens full-screen with the right icon
- [ ] Run the full flow: onboarding → log a session → check-in → weekly review
- [ ] Check performance against the plan's target (Today/logger interactive < 1.5 s on mid-range Android over 4G); profile `/today` data loading if it's slow — it once took 2.9 s of application time in dev
- [ ] Invite the first users from **More → Admin**

## Hardening before calling it polished
- [ ] **Offline support**: add a service worker so the app opens and set logging queues without signal (gyms have bad reception)
- [ ] Error monitoring (Sentry or Vercel logs/alerts)
- [ ] Backups: review Supabase plan backup retention once real data exists
- [ ] Privacy policy page (stores weight/body-fat data from EU users)
- [ ] Account deletion flow for users
- [ ] Run the e2e suite against a production build (`pnpm build && pnpm start`)

## 6. Optional — Google Play Store
- [ ] Generate a Trusted Web Activity package with PWABuilder (pwabuilder.com) or Bubblewrap
- [ ] Serve `/.well-known/assetlinks.json` so Android verifies the app ↔ domain link (hides the browser bar)
- [ ] Register a Google Play developer account ($25 one-time)
- [ ] Closed test with **≥ 12 testers for 14 days** (required for new personal accounts before public release)
- [ ] Store listing: screenshots, description, privacy policy URL, data-safety form
