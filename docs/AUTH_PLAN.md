# Auth transition plan: invite-only magic links → open sign-up (email + password, Google)

**Status:** implemented · 2026-10-25 (local; cloud rollout per §4.6 and the *Human setup checklist* in `docs/TODO.md`)
**Replaces:** decision 13 in `docs/DECISIONS.md` (invite-only, magic-link sign-in)

## 1. Goal

| | Today | After |
|---|---|---|
| Who can join | Only the owner and invited emails (`invites` table + `enforce_invite` trigger) | Anyone |
| Sign up | Implicit: the first magic link creates the account | Explicit: **Continue with Google** *or* **email + password**, with email confirmation |
| Sign in | Magic link only (1 email per login) | Email + password, or Google (no email per login) |
| Account exists when | First magic-link click | **Google:** immediately (Google verified the email). **Email:** once the confirmation link is clicked |
| Owner | Email in `app_config.owner_email` → `role = 'owner'` | Unchanged |

**Side effect:** we stop sending an email on every login. Emails are only sent for sign-up confirmation and password resets, which also fixes the rate-limit problem.

## 2. Flow architecture

### 2.1 Routes

| Route | Public | Purpose |
|---|---|---|
| `/login` | yes | Google button · email + password · "Forgot password?" · link to `/signup` |
| `/signup` | yes | Google button · email + password + confirm password · link to `/login` |
| `/signup/check-email` | yes | "Confirm your email" screen + **Resend email** button (cooldown) |
| `/forgot-password` | yes | Email field → sends a reset link |
| `/reset-password` | session required (recovery session) | New password + confirm → `updateUser` |
| `/callback` | yes | Single landing point for **OAuth codes** and **email token links**; honours a safe `next` param |
| `/onboarding`, `/today`, … | session required | Unchanged |

`proxy.ts` `PUBLIC` list becomes: `/login`, `/signup`, `/forgot-password`, `/callback`, `/api/health`, `/manifest.webmanifest`. `/reset-password` stays protected (it needs the recovery session). Signed-in users who hit `/login` or `/signup` are redirected to `/today`.

### 2.2 Sign up with email + password

```
/signup form ──► server action signUp()
                   │  zod: email, password ≥ 8, passwords match
                   ▼
           supabase.auth.signUp({ email, password,
             options: { emailRedirectTo: <origin>/callback?next=/onboarding } })
                   │
                   ├─ auth.users row created, email_confirmed_at = NULL
                   │   (no profile yet — see 2.6)
                   ▼
           Confirmation email (Resend SMTP) ──► link:
           <origin>/callback?token_hash=…&type=signup&next=/onboarding
                   │
                   ▼
           /callback: verifyOtp({ token_hash, type }) → session cookie
                   │   auth.users.email_confirmed_at set → trigger creates profile
                   ▼
           /onboarding  (existing 7-step wizard)
```

- The **email template uses `token_hash`, not the default PKCE link** (§4.3). That way the link works even if it's opened in a different browser or app than the sign-up page. That's the usual case on Android, where Gmail opens links in its own browser.
- **Existing email:** with confirmations on, Supabase returns success without sending a new account email, so the response doesn't reveal which emails are registered. The UI always shows the same "Check your email" screen.
- **Unconfirmed user tries to sign in:** `signInWithPassword` returns `email_not_confirmed`. Show "Confirm your email first" with a **Resend** button (`auth.resend({ type: 'signup' })`).

### 2.3 Sign up / sign in with Google (same flow for both)

```
"Continue with Google" ──► server action signInWithGoogle()
        supabase.auth.signInWithOAuth({ provider: 'google',
          options: { redirectTo: <origin>/callback?next=<next> } })
        → redirect(data.url)          (PKCE verifier cookie set on our domain)
                │
                ▼
   accounts.google.com consent ──► https://<ref>.supabase.co/auth/v1/callback
                │
                ▼
   <origin>/callback?code=… ──► exchangeCodeForSession(code) → session
                │   new user: auth.users inserted already confirmed → profile created
                ▼
   /onboarding (no profile.onboarded_at) or /today
```

- **Account linking:** Supabase automatically links a Google identity to an existing user with the same *confirmed* email. The owner's current account (created by magic link, no password) can therefore just use **Continue with Google** with the same Gmail address, or set a password via **Forgot password**.
- `display_name` is taken from Google's `full_name` when present (§4.1).

### 2.4 Sign in with email + password

```
/login form ──► signIn(): signInWithPassword({ email, password })
   ok                    → /today (or /onboarding if not onboarded)
   invalid_credentials   → "Email or password is incorrect"   (one generic message)
   email_not_confirmed   → "Confirm your email first" + Resend
```

### 2.5 Forgot / reset password

```
/forgot-password ──► resetPasswordForEmail(email,
                       { redirectTo: <origin>/callback?next=/reset-password })
                     → always show "If an account exists, we sent a link"
email link: <origin>/callback?token_hash=…&type=recovery&next=/reset-password
/callback: verifyOtp → recovery session → /reset-password
/reset-password: updateUser({ password }) → /today
```

### 2.6 When a user "gets an account"

Today `handle_new_user` runs **after insert** on `auth.users`, so an unconfirmed email sign-up would get a profile straight away. The new trigger runs on **insert or update of `email_confirmed_at`**, and only when it is set:

- **Google:** the user is inserted already confirmed, so the profile is created at once.
- **Email:** inserted unconfirmed, so no profile. When they click the link, `email_confirmed_at` is set and the profile is created.

Unconfirmed sign-ups therefore never show up in the admin list and have no app data. Optional clean-up: delete unconfirmed users older than 7 days (§6, open question).

### 2.7 Redirect origin and the `next` param

- **`<origin>`:** use `APP_URL` if set, otherwise the request's own origin (from `headers()`), **never `localhost`**. This also fixes the bug where production sent links to localhost.
- **`next`:** accepted only if it is a relative path starting with `/` and not `//`. Anything else falls back to `/today`. This stops the callback being used to redirect users to another site.

## 3. Requirements

### 3.1 Functional
1. New users choose **Continue with Google** or **email + password** on `/signup`.
2. Email sign-ups must click a confirmation link before they can sign in. Their account (profile) exists only after confirmation.
3. Returning users sign in with email + password or Google on `/login`.
4. Forgot-password and reset-password flows.
5. Resend confirmation email, with a 60 s cooldown in the UI.
6. No invite checks anywhere. The owner keeps the `owner` role through `app_config.owner_email`.
7. Admin page: remove the **Invite** section. Keep the users list and **Remove user** (renamed from revoke).
8. Existing users (the owner) keep their data and can sign in with Google or a newly set password.

### 3.2 Non-functional / security
- Password: at least 8 characters, letters and digits (Supabase: *Minimum length 8*, *Password requirements: letters + digits*). The same rule in zod, so errors show before the request.
- Error messages don't reveal whether an email is registered (sign-in, sign-up, forgot password).
- **Bot protection on open sign-up:** Cloudflare Turnstile through Supabase Auth's CAPTCHA support, on sign-up and forgot-password. Recommended. See open question 2.
- Supabase rate limits are reviewed after custom SMTP is on (sign-ups, emails/hour, token verifications).
- Safe `next` handling (§2.7). The service-role key is still used only server-side.
- Works inside the **installed PWA on Android**. The Google consent screen opens in a browser tab and returns to the app.

### 3.3 External setup (done by you, in dashboards)
| Where | What |
|---|---|
| **Resend** | Domain verified; SMTP configured in Supabase (TODO step 3) — **required before email sign-up goes live** |
| **Google Cloud Console** | Project → OAuth consent screen (External; app name, support email, scopes `openid email profile`; **publish to Production** — Testing mode only allows listed test users) → OAuth client *Web application*: JS origin `https://pyramid-coach.vercel.app`; redirect URI `https://kupbxizdkpxnnfsuamrl.supabase.co/auth/v1/callback` (+ `http://127.0.0.1:54321/auth/v1/callback` for local) |
| **Supabase → Auth → Providers** | Google: enable, paste client ID + secret · Email: **Confirm email ON**, keep email sign-up on |
| **Supabase → Auth → URL config** | Redirect URLs: `https://pyramid-coach.vercel.app/callback**` (wildcard allows the `next` query) |
| **Supabase → Auth → Emails → Templates** | *Confirm signup* and *Reset password* link → `{{ .SiteURL }}/callback?token_hash={{ .TokenHash }}&type=signup&next=/onboarding` / `…&type=recovery&next=/reset-password` |
| **Supabase → Auth → Attack protection** | Password rules (above); CAPTCHA (Turnstile) if adopted |

## 4. Implementation steps

### 4.1 Database — new migration `remove_invite_only`
```sql
drop trigger if exists enforce_invite on auth.users;
drop function if exists public.enforce_invite();
drop function if exists public.is_invited(text);

-- Profile only once the email is confirmed (Google users arrive confirmed).
drop trigger if exists on_auth_user_created on auth.users;
create or replace function public.handle_new_user() … -- same body, plus:
  --   display_name = coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1))
  --   no invites update
create trigger on_auth_user_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row when (new.email_confirmed_at is not null)
  execute function public.handle_new_user();          -- body keeps `on conflict do nothing`
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- admin_revoke_user → admin_remove_user: drop the invites update, keep owner guard + delete.
drop function public.admin_revoke_user(text);
create function public.admin_remove_user(p_email text) …;
revoke execute on function public.admin_remove_user(text) from public, anon;

drop table public.invites;
```
Then `pnpm db:types` to regenerate `lib/db/database.types.ts`.

### 4.2 Supabase config (local parity) — `supabase/config.toml`
- `[auth.email] enable_confirmations = true`
- `minimum_password_length = 8`, `password_requirements = "letters_digits"`
- `[auth.external.google] enabled = true`, `client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"`, `secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"`, `skip_nonce_check = false`
- `additional_redirect_urls` add `http://localhost:3000/callback**`
- `[auth.email.template.confirmation]` / `[auth.email.template.recovery]` → `supabase/templates/*.html` using the `token_hash` links (same as production)

### 4.3 Server code
1. **`lib/utils/redirect.ts`** (new): `appOrigin()` (APP_URL → request origin) and `safeNext(raw)`.
2. **`lib/actions/auth.ts`** — replace `sendMagicLink` with:
   `signUp`, `signIn`, `signInWithGoogle(next?)`, `resendConfirmation`, `requestPasswordReset`, `updatePassword`. Keep `signOut`. Zod schemas exported for unit tests. Map Supabase error codes (`invalid_credentials`, `email_not_confirmed`, `weak_password`, `over_email_send_rate_limit`) to friendly messages.
3. **`app/(auth)/callback/route.ts`** — keep both branches (`code` / `token_hash`), add `safeNext`, and use `appOrigin()`. If there's no profile yet, send the user to `/onboarding`. For `type=recovery`, go to `/reset-password`.
4. **`proxy.ts`** — new `PUBLIC` list; signed-in users on `/signup` → `/today`.
5. **`lib/actions/admin.ts`** — delete `createInvite`; `revokeAccess` → `removeUser` calling `admin_remove_user`.
6. **`lib/supabase/admin.ts`** — update the comment (the service role is no longer used for invites). Check that nothing else needs it.

### 4.4 UI
1. **Shared** `components/app/auth/google-button.tsx` and `password-input.tsx` (show/hide toggle, `autoComplete` `current-password` / `new-password`).
2. **`/login`**: Google button → "or" divider → email + password → "Forgot password?" → "New here? Create an account". Replace the "Invite only · v1" stamp. Show `?error=link` as "That link expired or was already used".
3. **`/signup`**: Google → divider → email, password, confirm password → terms/health disclaimer line → "Already have an account? Sign in".
4. **`/signup/check-email`**, **`/forgot-password`**, **`/reset-password`** pages in the same visual style.
5. **Admin** (`app/(app)/admin/client.tsx`, `page.tsx`): remove the Invite section and the `invites` query; rename the revoke button to **Remove user**.

### 4.5 Docs and tests (§5)
- `docs/DECISIONS.md`: mark decision 13 superseded and add the new auth decisions (open sign-up, profile on confirmation, `token_hash` links, auto-linking).
- `README.md`: env vars (`SUPABASE_AUTH_EXTERNAL_GOOGLE_*` for local), "Sign in at `/login`" section, and Mailpit now receives *confirmation* emails.
- `docs/TODO.md`: replace "Invite the first users" with "Share the sign-up link".

### 4.6 Rollout order (production)
Production must keep working at every step:

1. **Dashboard setup first** (all safe to do early): Resend SMTP + raised email limit, Google provider, Confirm email on, password rules, redirect URL wildcard, email templates. The current `/callback` already handles `token_hash` links, so the new templates work with today's code.
2. **Deploy the code** (Vercel, from `main`). The new code never calls `is_invited` or reads `invites`, so it runs fine against the old schema. The invite trigger still blocks unknown emails until step 3, so open sign-up only takes effect then.
3. **Apply the `remove_invite_only` migration** to the cloud project. Sign-up is now open.
4. Smoke test (§5.4) in production; owner links Google or sets a password.

Rollback: revert the Vercel deployment. The migration only drops invite objects, so re-applying `init`'s invite section restores invite-only behaviour if ever needed.

## 5. Testing

### 5.1 Unit (Vitest, `tests/engine` style → new `tests/auth/*.test.ts`)
- Zod schemas: email normalisation; password ≥ 8 with letters and digits; mismatched confirmation rejected.
- `safeNext`: accepts `/today` and `/session/abc?x=1`. Rejects `//evil.com`, `https://evil.com`, `/\evil.com`, `javascript:`, empty → `/today`.
- `appOrigin`: prefers `APP_URL`, otherwise request origin, never localhost when a request origin exists.
- Error-code → message mapping covers every code we handle; unknown codes → generic message.

### 5.2 Integration (Vitest against local Supabase, extend `tests/integration/rls.test.ts`)
- Remove: the `is_invited` test and any invite seeding.
- `admin.createUser({ email, password, email_confirm: false })` → **no** `profiles` row; then `updateUserById(id, { email_confirm: true })` → profile with `role = 'member'`.
- Confirmed user with `user_metadata.full_name` → `display_name` uses it.
- User with `app_config.owner_email` → `role = 'owner'`.
- `anon` and `authenticated` cannot call `handle_new_user`; `is_invited` and `invites` no longer exist; `admin_remove_user` rejects non-owners and refuses to remove the owner.
- Existing RLS "own rows" tests unchanged and green.

### 5.3 End-to-end (Playwright, Mailpit, mobile project)
Rewrite `tests/e2e/happy-path.spec.ts` and add `tests/e2e/auth.spec.ts`:
1. **Sign up (email):** `/signup` → fill → "Check your email" → read the confirmation link from Mailpit → `/onboarding` → finish onboarding → log set → check-in → review → accept proposal (the current happy path, minus invites).
2. **Unconfirmed sign-in:** sign up, *don't* confirm, sign in → "Confirm your email first" → **Resend** → a second email arrives in Mailpit.
3. **Wrong password:** generic error; no indication whether the email exists.
4. **Existing email sign-up:** same "Check your email" screen; no second account.
5. **Forgot password:** request → Mailpit link → `/reset-password` → new password → sign out → sign in with the new password works and the old one fails.
6. **Confirmation link in a fresh browser context** (simulates the Gmail app browser): it still confirms and signs in.
7. **Protected routes:** signed-out `/today` → `/login`; signed-in `/login` and `/signup` → `/today`.
8. **Open redirect:** `/callback?…&next=//evil.com` lands on `/today`.
9. **Google (automated part):** clicking **Continue with Google** navigates to `…supabase.co/auth/v1/authorize?provider=google` (assert the request URL, then stop). Real Google consent can't run in CI.
10. **Admin:** owner sees users list without an Invite section; can remove a member; that member can no longer sign in.

### 5.4 Manual checklist (production + Android)
- [ ] Google sign-up with a new Gmail → onboarding → profile shows Google name
- [ ] Google sign-in for the **owner** (existing magic-link account) links to the same account; data intact, role still owner
- [ ] Email sign-up → confirmation email from **Resend sender** (not Supabase default) → confirm on the phone's Gmail app → lands signed in
- [ ] Forgot password end-to-end on the phone
- [ ] Inside the **installed PWA**: Continue with Google opens Google, returns to the app signed in
- [ ] Turnstile (if enabled) shows on sign-up and blocks a scripted request without a token
- [ ] Supabase security advisor: no new warnings after the migration

### 5.5 Done when
All unit, integration and e2e suites pass locally and in CI; the manual checklist passes in production; `DECISIONS.md`, `README.md` and `TODO.md` are updated.

## 6. Open questions
1. **Fully public sign-up?** The plan opens sign-up to anyone. If you want it to be "anyone with the link" without being indexed, add `noindex` to `/signup`. If you need a cap, an owner-set `max_users` in `app_config` checked by a trigger is a small addition.
2. **CAPTCHA:** recommended (Turnstile, free) since sign-up is open. It needs a Cloudflare account plus a site key and secret. Yes or no?
3. **Unconfirmed accounts:** delete after 7 days (scheduled job with `pg_cron`), or leave them?
4. **Display name:** Google provides one. For email sign-ups we keep the onboarding name field. No name field on `/signup`.
