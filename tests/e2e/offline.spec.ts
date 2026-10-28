// Offline support (DECISIONS 37–41): the service worker serves cached gym pages without signal, sets logged offline
// are queued on the phone as "pending sync", and they reach the database once the connection is back.
// Runs against the production build (the service worker is only registered in production).
import { expect, test } from '@playwright/test';
import { admin, completeOnboarding, createConfirmedUser, signIn, uniqueEmail } from './helpers';

test('offline: cached session page opens, sets queue as pending and sync when back online', async ({ page, context }) => {
  const email = uniqueEmail('offline');
  const userId = await createConfirmedUser(email);
  await signIn(page, email);
  await completeOnboarding(page);

  const { data: s } = await admin.from('planned_sessions').select('id').eq('user_id', userId).order('scheduled_on').limit(1).single();
  const sessionUrl = `/session/${s!.id}`;

  // Visit with signal so the worker installs and caches the page.
  await page.goto(sessionUrl);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The first load happens before the worker controls the page; reload once so the navigation goes through it.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect
    .poll(() => page.evaluate(async (p) => !!(await caches.match(p)), sessionUrl), { timeout: 15_000 })
    .toBe(true);

  await context.setOffline(true);

  // A full reload offline is answered from the cache.
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: /Offline/ })).toBeVisible();

  await page.getByLabel('Weight in kg').first().fill('40');
  await page.getByRole('button', { name: 'Log set 1' }).first().click();
  await expect(page.getByText('Pending sync').first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /1 set saved on this phone/ })).toBeVisible();

  // Survives closing and reopening the page while still offline.
  await page.reload();
  await expect(page.getByText('Pending sync').first()).toBeVisible();

  // Nothing reached the server yet.
  const { data: before } = await admin.from('logged_sets').select('id').eq('user_id', userId);
  expect(before).toHaveLength(0);

  // A page never visited falls back to the offline page.
  await page.goto('/progress').catch(() => undefined);
  await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
  await page.goto(sessionUrl);

  await context.setOffline(false);
  await expect(page.getByText(/offline set synced/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Pending sync')).toHaveCount(0);
  const { data: after } = await admin.from('logged_sets').select('set_index, load_kg').eq('user_id', userId);
  expect(after).toEqual([{ set_index: 0, load_kg: 40 }]);
});

test('service worker never caches auth routes or the export API', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  const cached = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      const c = await caches.open(name);
      for (const r of await c.keys()) out.push(new URL(r.url).pathname);
    }
    return out;
  });
  expect(cached.filter((p) => /^\/(login|signup|callback|api\/)/.test(p))).toEqual([]);
});
