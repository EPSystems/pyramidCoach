// Full e2e happy path (Phase 9 AC): invite → onboarding → log a session → check-in → weekly review → accept a proposal.
// Requires `supabase start` (Mailpit on :54324) and a fresh database (`pnpm db:reset`).
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const MAILPIT = 'http://127.0.0.1:54324';
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321', process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const email = `e2e-${Date.now()}@test.local`;

async function magicLink(to: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(to)}`)).json();
    if (list.messages?.length) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json();
      return msg.HTML.match(/href="([^"]+verify[^"]+)"/)[1].replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('No email');
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: /sign-in link/i }).click();
  await expect(page.getByText('Check your inbox')).toBeVisible();
  await page.goto(await magicLink(email));
}

test('non-invited email is refused', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(`nobody-${Date.now()}@test.local`);
  await page.getByRole('button', { name: /sign-in link/i }).click();
  await expect(page.getByText(/invite-only/i)).toBeVisible();
});

test('invite → onboarding (<3 min) → log → check-in → review → proposal', async ({ page }) => {
  await admin.from('invites').upsert({ email });
  await login(page);
  await expect(page).toHaveURL(/onboarding/);

  const t0 = Date.now();
  await page.getByRole('textbox').first().fill('E2E');
  await page.getByPlaceholder('72').fill('80');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /Lean muscle gain/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /^Intermediate/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Football (soccer)' }).click();
  await page.getByRole('button', { name: 'Sat' }).first().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Sun' }).click(); // Mon–Sat available
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /Lightly active/ }).click();
  await page.getByRole('button', { name: /Build my plan/ }).click();
  await expect(page.getByRole('heading', { name: /Your first/ })).toBeVisible({ timeout: 60_000 });
  expect(Date.now() - t0).toBeLessThan(180_000);

  // Open the first planned session directly and log one set with a single tap.
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const userId = users.users.find((u) => u.email === email)!.id;
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
