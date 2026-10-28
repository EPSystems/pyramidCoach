// Week page: skip a session (no confirm dialog, Undo in the toast), then regenerate the plan: the skip survives.
// Requires `supabase start` with migration 20261027120001_plan_carryover_atomic applied.
import { expect, test } from '@playwright/test';
import { admin, completeOnboarding, createConfirmedUser, signIn, uniqueEmail, userIdByEmail } from './helpers';

const mondayUtc = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.getTime();
};

test('skip on Week → regenerate plan keeps the skip; unskip restores it', async ({ page }) => {
  const email = uniqueEmail('skip');
  await createConfirmedUser(email);
  await signIn(page, email);
  await completeOnboarding(page);
  const userId = (await userIdByEmail(email))!;

  const { data: s } = await admin
    .from('planned_sessions')
    .select('id, title, scheduled_on, plan_key')
    .eq('user_id', userId)
    .eq('status', 'planned')
    .order('scheduled_on')
    .limit(1)
    .single();
  expect(s?.plan_key).toBeTruthy();
  const today = new Date().toISOString().slice(0, 10);
  const offset = Math.round((mondayUtc(s!.scheduled_on) - mondayUtc(today)) / (7 * 86_400_000));

  page.on('dialog', () => {
    throw new Error('Skip must not open a browser dialog');
  });
  await page.goto(`/week?w=${offset}`);
  const card = page.locator('li').filter({ has: page.getByRole('link', { name: s!.title, exact: true }) }).first();
  await card.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByText(`${s!.title} skipped`)).toBeVisible();
  await expect(card.getByRole('button', { name: 'Unskip' })).toBeVisible();

  // Regenerate: the session is recreated (new row) but stays skipped, matched by its plan key.
  await page.goto('/settings');
  await page.getByRole('button', { name: /Regenerate plan/ }).click();
  await expect(page.getByText('Plan regenerated from today')).toBeVisible({ timeout: 60_000 });
  const { data: after } = await admin.from('planned_sessions').select('id, status').eq('user_id', userId).eq('plan_key', s!.plan_key!);
  expect(after?.map((r) => r.status)).toEqual(['skipped']);

  await page.goto(`/week?w=${offset}`);
  await card.getByRole('button', { name: 'Unskip' }).click();
  await expect(page.getByText('Back on the plan')).toBeVisible();
  const { data: restored } = await admin.from('planned_sessions').select('status').eq('id', after![0].id).single();
  expect(restored?.status).toBe('planned');
});
