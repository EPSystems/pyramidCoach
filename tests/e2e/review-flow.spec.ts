// Weekly review e2e: log a session → check-in (with pain) → weekly review → plan proposals visible.
// Seeds last week's pain check-ins through the admin client so the review has something to act on.
// Requires `supabase start` (Mailpit on :54324).
import { expect, test } from '@playwright/test';
import { admin, callbackLink, completeOnboarding, signUp, uniqueEmail, userIdByEmail } from './helpers';

const iso = (d: Date) => d.toISOString().slice(0, 10);

test('log → check-in → weekly review → proposals (targeted deload, higher-rep week, injury)', async ({ page, baseURL }) => {
  const email = uniqueEmail('review');
  await signUp(page, email);
  const userId = (await userIdByEmail(email))!;
  await page.goto(await callbackLink(email, baseURL!));
  await completeOnboarding(page);

  // Log one set of the first planned session.
  const { data: s } = await admin.from('planned_sessions').select('id').eq('user_id', userId).order('scheduled_on').limit(1).single();
  await page.goto(`/session/${s!.id}`);
  await page.getByLabel('Weight in kg').first().fill('40');
  await page.getByRole('button', { name: 'Log set 1' }).first().click();
  await expect(page.getByRole('button', { name: 'Undo set 1' }).first()).toBeVisible();

  // Today's check-in through the UI.
  await page.goto('/checkin');
  await page.getByRole('radio', { name: '2' }).first().click();
  await page.getByRole('button', { name: /Save check-in/ }).click();
  await expect(page.getByText('Check-in saved')).toBeVisible();

  // Pain in the quads on five days spread over the last two weeks: whichever week is reviewed, it has pain tags,
  // and the 14-day lookback sees at least two of them.
  const now = new Date();
  const days = [1, 4, 8, 10, 12].map((n) => iso(new Date(now.getTime() - n * 86400000)));
  for (const day of days) {
    const { error } = await admin.from('checkins').upsert({ user_id: userId, day, sleep_hours: 7, energy: 3, stress: 3, soreness: { quads: 'pain' } });
    expect(error).toBeNull();
  }

  await page.goto('/review');
  // Aches flagged → submit.
  await page.getByRole('radio', { name: 'Yes' }).nth(4).click();
  await page.getByRole('button', { name: /Submit review|Re-submit/ }).click();
  await expect(page.getByText(/Ease off quads/)).toBeVisible({ timeout: 30_000 });
  // A plan with quad-dominant compounds gets the T-FAT-05 alternative and the recurring-pain injury proposal.
  await expect(page.getByText(/higher-rep week for quads/)).toBeVisible();
  await expect(page.getByText(/Protect your quads/)).toBeVisible();

  // Re-submitting the same answers adds no duplicates.
  await page.getByRole('button', { name: /Re-submit/ }).click();
  await expect(page.getByText(/Review saved, no changes needed/)).toBeVisible({ timeout: 30_000 });
  const { data: pending } = await admin.from('proposals').select('kind').eq('user_id', userId).eq('status', 'pending').eq('kind', 'injury_adjust');
  expect(pending).toHaveLength(1);
});
