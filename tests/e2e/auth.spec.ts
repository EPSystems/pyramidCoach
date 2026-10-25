// Auth flows (AUTH_PLAN §5.3 scenarios 2–10). Scenario 1 is the happy path in happy-path.spec.ts.
// Requires `supabase start` (Mailpit on :54324). Each test uses its own fresh email.
import { devices, expect, test } from '@playwright/test';
import { PASSWORD, admin, callbackLink, completeOnboarding, createConfirmedUser, signIn, signUp, uniqueEmail, userIdByEmail, waitForMessages } from './helpers';

const WRONG = 'Email or password is incorrect.';

test('2. unconfirmed sign-in → "Confirm your email first" → Resend sends a second email', async ({ page }) => {
  const email = uniqueEmail('unconfirmed');
  await signUp(page, email);
  await waitForMessages(email, 1);
  await signIn(page, email);
  await expect(page.getByText('Confirm your email first')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('button', { name: 'Resend email' }).click();
  await expect(page.getByText('Sent — check your inbox.')).toBeVisible();
  await waitForMessages(email, 2);
});

test('3. wrong password and unknown email get the same generic error', async ({ page }) => {
  const email = uniqueEmail('wrongpw');
  await createConfirmedUser(email);
  await signIn(page, email, 'NotMyPass9');
  await expect(page.getByText(WRONG)).toBeVisible();
  await signIn(page, uniqueEmail('nobody'), 'NotMyPass9');
  await expect(page.getByText(WRONG)).toBeVisible();
  await expect(page.getByText('Confirm your email first')).toHaveCount(0);
});

test('4. signing up with an existing email shows the same screen and creates no second account', async ({ page }) => {
  const email = uniqueEmail('existing');
  await createConfirmedUser(email);
  await signUp(page, email, 'Another1pass');
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  expect(data.users.filter((u) => u.email === email)).toHaveLength(1);
  // The original password still works.
  await signIn(page, email);
  await expect(page).toHaveURL(/onboarding/);
});

test('5. forgot password → email link → new password; old one stops working', async ({ page, context, baseURL }) => {
  const email = uniqueEmail('reset');
  const fresh = 'Fresh2password';
  await createConfirmedUser(email);
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Check your inbox')).toBeVisible();

  await page.goto(await callbackLink(email, baseURL!));
  await expect(page).toHaveURL(/\/reset-password/);
  await page.getByLabel('Password', { exact: true }).fill(fresh);
  await page.getByLabel('Confirm password').fill(fresh);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page).toHaveURL(/\/(today|onboarding)/);

  await context.clearCookies(); // sign out
  await signIn(page, email, PASSWORD);
  await expect(page.getByText(WRONG)).toBeVisible();
  await signIn(page, email, fresh);
  await expect(page).toHaveURL(/onboarding/);
});

test('5b. /reset-password without a recovery session goes to /login', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page).toHaveURL(/\/login$/);
});

test('6. confirmation link opened in a fresh browser (Gmail in-app browser) still signs in', async ({ page, browser, baseURL }) => {
  const email = uniqueEmail('freshctx');
  await signUp(page, email);
  const link = await callbackLink(email, baseURL!);
  const other = await browser.newContext({ ...devices['Pixel 7'], baseURL });
  try {
    const p2 = await other.newPage();
    await p2.goto(link);
    await expect(p2).toHaveURL(/onboarding/);
    const { data } = await admin
      .from('profiles')
      .select('role')
      .eq('user_id', (await userIdByEmail(email))!)
      .single();
    expect(data?.role).toBe('member');
  } finally {
    await other.close();
  }
});

test('6b. a used or bogus link lands on /login with an explanation', async ({ page }) => {
  await page.goto('/callback?token_hash=bogus&type=signup&next=/onboarding');
  await expect(page).toHaveURL(/\/login\?error=link/);
  await expect(page.getByText('That link expired or was already used.')).toBeVisible();
});

test('7. protected routes: signed-out → /login; signed-in /login and /signup → /today', async ({ page }) => {
  await page.goto('/today');
  await expect(page).toHaveURL(/\/login$/);
  for (const path of ['/signup', '/signup/check-email', '/forgot-password']) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }

  const email = uniqueEmail('protected');
  await createConfirmedUser(email);
  await signIn(page, email);
  await expect(page).toHaveURL(/onboarding/);
  for (const path of ['/login', '/signup']) {
    const res = await page.request.get(path, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(new URL(res.headers().location, 'http://x').pathname).toBe('/today');
  }
});

test('8. /callback ignores off-site next values', async ({ page, baseURL }) => {
  const email = uniqueEmail('redirect');
  const id = await createConfirmedUser(email);
  // next is honoured only for onboarded users; everyone else goes to /onboarding.
  await admin.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('user_id', id);
  for (const next of ['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)']) {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (error) throw error;
    const url = `/callback?token_hash=${data.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(next)}`;
    const res = await page.request.get(url, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toBe(`${baseURL}/today`);
  }
  // A safe relative next is kept.
  const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const res = await page.request.get(`/callback?token_hash=${data.properties!.hashed_token}&type=magiclink&next=${encodeURIComponent('/progress?tab=1')}`, {
    maxRedirects: 0,
  });
  expect(res.headers().location).toBe(`${baseURL}/progress?tab=1`);
});

test('9. Continue with Google starts the Supabase OAuth flow', async ({ page }) => {
  // Real Google consent can't run in tests: assert the authorize request, then stop it.
  await page.route('**/auth/v1/authorize**', (route) => route.abort());
  for (const path of ['/login', '/signup']) {
    await page.goto(path);
    const req = page.waitForRequest((r) => r.url().includes('/auth/v1/authorize?provider=google'));
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    const url = new URL((await req).url());
    expect(url.searchParams.get('redirect_to')).toMatch(/\/callback\?next=%2Ftoday$|\/callback\?next=\/today$/);
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
  }
});

test('10. admin: no Invite section; owner removes a member who then cannot sign in', async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000);
  const ownerEmail = uniqueEmail('owner');
  const ownerId = await createConfirmedUser(ownerEmail);
  await admin.from('profiles').update({ role: 'owner' }).eq('user_id', ownerId);
  const memberEmail = uniqueEmail('member');
  await createConfirmedUser(memberEmail);

  await signIn(page, ownerEmail);
  await completeOnboarding(page, 'Owner');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /^Users/ })).toBeVisible();
  await expect(page.getByText(/invite/i)).toHaveCount(0);

  const row = page.getByRole('listitem').filter({ hasText: memberEmail });
  await expect(row).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: 'Remove user' }).click();
  await expect(row).toHaveCount(0);
  expect(await userIdByEmail(memberEmail)).toBeUndefined();

  const other = await browser.newContext({ ...devices['Pixel 7'], baseURL });
  try {
    const p2 = await other.newPage();
    await signIn(p2, memberEmail);
    await expect(p2.getByText(WRONG)).toBeVisible();
  } finally {
    await other.close();
  }
});

test('11. /privacy and /terms are public and stay viewable once signed in', async ({ page }) => {
  const pages = [
    ['/privacy', 'Privacy policy'],
    ['/terms', 'Terms of use'],
  ] as const;
  for (const [path, heading] of pages) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
  await page.goto('/signup');
  await expect(page.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy');

  // Signed in, the pages must render rather than bounce to /today.
  const email = uniqueEmail('legal-in');
  await createConfirmedUser(email);
  await signIn(page, email);
  await expect(page).toHaveURL(/onboarding/);
  for (const [path, heading] of pages) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
});
