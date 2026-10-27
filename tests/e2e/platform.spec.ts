// Accounts & platform gaps: return-to-page after sign-in, noindex on auth pages, theme saved to the profile.
import { expect, test } from '@playwright/test';
import { admin, createConfirmedUser, signIn, uniqueEmail } from './helpers';

/** A confirmed user who counts as onboarded (profile stamp + settings row), without running the wizard. */
async function onboardedUser(tag: string) {
  const email = uniqueEmail(tag);
  const id = await createConfirmedUser(email);
  await admin.from('profiles').update({ onboarded_at: new Date().toISOString(), sex: 'male' }).eq('user_id', id);
  await admin.from('user_settings').insert({ user_id: id, goal: 'lean_gain', training_status: 'novice', available_days: [1, 3, 5] });
  return { email, id };
}

test('signed-out visit keeps the page as ?next= and sign-in returns there', async ({ page }) => {
  const { email } = await onboardedUser('next');
  await page.goto('/library?q=row');
  await expect(page).toHaveURL(/\/login\?next=%2Flibrary%3Fq%3Drow$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Lift4ever');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/library\?q=row$/);
  // Signed in, /login?next=… goes straight to that page; off-site values fall back to /today.
  const res = await page.request.get('/login?next=%2F%2Fevil.com', { maxRedirects: 0 });
  expect(new URL(res.headers().location, 'http://x').pathname).toBe('/today');
});

test('auth pages are noindex', async ({ page }) => {
  for (const path of ['/login', '/signup', '/forgot-password']) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  }
});

test('theme is saved to the profile and applied on another device', async ({ page, browser, baseURL }) => {
  const { email, id } = await onboardedUser('theme');
  await signIn(page, email);
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Light' }).or(page.getByRole('button', { name: 'Light', exact: true })).first().click();
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  await expect.poll(async () => (await admin.from('profiles').select('theme').eq('user_id', id).single()).data?.theme).toBe('light');

  const other = await browser.newContext({ baseURL });
  try {
    const p2 = await other.newPage();
    await signIn(p2, email);
    await p2.goto('/settings');
    await expect(p2.locator('html')).not.toHaveClass(/\bdark\b/);
  } finally {
    await other.close();
  }
});
