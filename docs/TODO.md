# Road to production

From local demo (Docker + Mailpit) to an app anyone can sign up for and install on Android.
Steps 1–5 make it user-ready; step 6 is the optional Play Store listing.

**Status (2026-10-25):** live at https://pyramid-coach.vercel.app — owner logged in and onboarded. Now: real email (step 3), then the Android check (step 5).

## 1. Git + GitHub ✅
- [x] Commit the app (`.env.local` stays gitignored)
- [x] Push to https://github.com/EPSystems/pyramidCoach (`main`)
- [ ] Confirm `.github/workflows/ci.yml` runs green (repo → Actions tab)

## 2. Hosted database — Supabase Cloud ✅
Project `pyramidCoach` (ref `kupbxizdkpxnnfsuamrl`, eu-west-2).
- [x] Apply migrations (`20261025133213_init`, `20261025133605_harden_functions`) — local file names match the cloud history, so `supabase db push` works without `migration repair`
- [x] Run `supabase/seed.sql` (16 muscles, 13 patterns, 74 exercises, 7 sports, 98 rule sources, owner email)
- [x] Security advisor reviewed; remaining findings are intentional (`app_config` has no policies; `is_invited` is callable before sign-in)

## 3. Real email — Resend (in progress; blocker for email sign-up)
Supabase's built-in mailer only sends to project team members and is heavily rate-limited, so email sign-ups can't confirm their account without this. (Google sign-in doesn't need email.)
- [ ] Domain added in Resend and verified (SPF/DKIM DNS records show *Verified*)
- [ ] Supabase → Authentication → Emails → SMTP settings: host `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key, sender e.g. `no-reply@<domain>` / "Pyramid Coach"
- [ ] Supabase → Authentication → Rate limits: raise the email limit (custom SMTP lifts the built-in cap)
- [ ] *Confirm signup* and *Reset password* templates use `token_hash` links (see *Human setup checklist* below)
- [ ] Test: sign up with an address that is **not** a Supabase team member, confirm it and sign in

## 4. Deploy — Vercel ✅
- [x] Import `EPSystems/pyramidCoach` into Vercel
- [x] Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_EMAIL`, `APP_URL=https://pyramid-coach.vercel.app`
- [x] Supabase Auth: Site URL = production URL; `https://pyramid-coach.vercel.app/callback` in redirect URLs
- [x] Owner magic-link login + onboarding work in production
- [ ] Optional: custom domain (e.g. `app.<domain>`) — then update `APP_URL`, Site URL and redirect URLs, and redeploy
- [x] Code: when `APP_URL` is missing, fall back to the request's origin instead of `localhost` (`lib/utils/redirect.ts`) — a missing var produced localhost links in production once

## 5. Verify on a real Android phone
- [ ] Open the URL in Chrome on Android and sign in (email links now work in any browser, including the Gmail app's)
- [ ] Install via ⋮ → *Install app*; confirm it opens full-screen with the right icon
- [ ] Run the full flow: log a session → check-in → weekly review
- [ ] Check performance against the plan's target (Today/logger interactive < 1.5 s on mid-range Android over 4G); profile `/today` data loading if it's slow — it once took 2.9 s of application time in dev
- [ ] Share the sign-up link (`https://pyramid-coach.vercel.app/signup`) with the first users (email sign-up needs step 3; Google works without it)

## Hardening before calling it polished
- [x] **Offline support**: add a service worker so the app opens and set logging queues without signal (gyms have bad reception) — `public/sw.js`, `lib/offline/`, DECISIONS 37–41
  - [ ] Verify on a real Android phone (installed PWA): open Today/session with signal, switch to airplane mode, reopen the app, log sets ("Pending sync"), turn signal back on and confirm they sync
- [ ] Error monitoring (Sentry or Vercel logs/alerts)
- [ ] Backups: review Supabase plan backup retention once real data exists
- [x] Privacy policy page (stores weight/body-fat data from EU users): `/privacy` and `/terms`
- [x] Account deletion: `delete_my_account()` exists and is wired to Settings — verify it in production
- [x] Run the e2e suite against a production build (`pnpm test:e2e` now builds and serves on :3100 against the local stack)

## 6. Optional — Google Play Store
- [ ] Generate a Trusted Web Activity package with PWABuilder (pwabuilder.com) or Bubblewrap
- [ ] Serve `/.well-known/assetlinks.json` so Android verifies the app ↔ domain link (hides the browser bar)
- [ ] Register a Google Play developer account ($25 one-time)
- [ ] Closed test with **≥ 12 testers for 14 days** (required for new personal accounts before public release)
- [ ] Store listing: screenshots, description, privacy policy URL, data-safety form

## Human setup checklist — open sign-up (`docs/AUTH_PLAN.md`)
Dashboard steps the code can't do (§3.3). Do them before deploying, then apply the `20261025151754_remove_invite_only` migration to the cloud project (§4.6).
- [ ] **Resend:** domain verified and SMTP set in Supabase (step 3) — required before email sign-up goes live
- [ ] **Google Cloud Console:** OAuth consent screen (External; app name, support email, scopes `openid email profile`; **publish to Production**) → OAuth client *Web application*: JS origin `https://pyramid-coach.vercel.app`; redirect URIs `https://kupbxizdkpxnnfsuamrl.supabase.co/auth/v1/callback` and `http://127.0.0.1:54321/auth/v1/callback` (local)
- [ ] **Supabase → Auth → Providers:** Google enabled with the client ID + secret · Email: **Confirm email ON**, email sign-up on
- [ ] **Supabase → Auth → URL configuration:** redirect URL `https://pyramid-coach.vercel.app/callback**`
- [ ] **Supabase → Auth → Emails → Templates:** *Confirm signup* link `{{ .SiteURL }}/callback?token_hash={{ .TokenHash }}&type=signup&next=/onboarding`; *Reset password* link `{{ .SiteURL }}/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` (copy from `supabase/templates/`)
- [ ] **Supabase → Auth → Attack protection:** minimum password length 8, letters + digits; CAPTCHA (Turnstile) if adopted
- [ ] **Supabase → Auth → Rate limits:** review sign-ups, emails/hour and token verifications once SMTP is on
- [ ] Deploy the code, then `supabase db push` the migration (sign-up opens at that point)

Manual checks after rollout (§5.4, production + Android):
- [ ] Google sign-up with a new Gmail → onboarding → profile shows the Google name
- [ ] Google sign-in for the **owner** links to the existing account; data intact, role still owner
- [ ] Email sign-up → confirmation email from the **Resend sender** → confirm in the phone's Gmail app → lands signed in
- [ ] Forgot password end-to-end on the phone
- [ ] Inside the **installed PWA**: Continue with Google opens Google and returns to the app signed in
- [ ] Turnstile (if enabled) shows on sign-up and blocks a scripted request without a token
- [ ] Supabase security advisor: no new warnings after the migration
