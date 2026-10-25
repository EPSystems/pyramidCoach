// Full e2e happy path (AUTH_PLAN §5.3 scenario 1): email sign-up → confirm via Mailpit → onboarding → log a session
// → check-in → weekly review → accept a proposal. Requires `supabase start` (Mailpit on :54324).
import { expect, test } from '@playwright/test';
import { admin, callbackLink, completeOnboarding, signUp, uniqueEmail, userIdByEmail } from './helpers';

test('sign up → confirm → onboarding (<3 min) → log → check-in → review → proposal', async ({ page, baseURL }) => {
  const email = uniqueEmail('happy');
  await signUp(page, email);
  // No profile until the email is confirmed (§2.6).
  const userId = (await userIdByEmail(email))!;
  const { data: before } = await admin.from('profiles').select('user_id').eq('user_id', userId);
  expect(before).toHaveLength(0);

  await page.goto(await callbackLink(email, baseURL!));
  await expect(page).toHaveURL(/onboarding/);

  const t0 = Date.now();
  await completeOnboarding(page);
  expect(Date.now() - t0).toBeLessThan(180_000);

  // Open the first planned session directly and log one set with a single tap.
  const { data: s } = await admin.from('planned_sessions').select('id').eq('user_id', userId).order('scheduled_on').limit(1).single();
  await page.goto(`/session/${s!.id}`);
  await page.getByLabel('Weight in kg').first().fill('40');
  await page.getByRole('button', { name: 'Log set 1' }).first().click();
  await expect(page.getByRole('button', { name: 'Undo set 1' }).first()).toBeVisible();

  // Check-in.
  await page.goto('/checkin');
  await page.getByRole('radio', { name: '2' }).first().click();
  await page.getByRole('button', { name: /Save check-in/ }).click();
  await expect(page.getByText('Check-in saved')).toBeVisible();

  // Weekly review: flip two answers to yes → deload proposal → accept.
  await page.goto('/review');
  const yes = page.getByRole('radio', { name: 'Yes' });
  await yes.nth(1).click();
  await yes.nth(3).click();
  await page.getByRole('button', { name: /Submit review|Re-submit/ }).click();
  await expect(page.getByText(/Deload next week/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Accept' }).first().click();
  await expect(page.getByText('Applied')).toBeVisible({ timeout: 30_000 });
});
