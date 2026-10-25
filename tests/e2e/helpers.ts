// Shared e2e helpers: local Supabase admin client, Mailpit, and the sign-in / onboarding steps.
// Everything here talks to the LOCAL stack only (playwright.config.ts pins the app to it too).
import { expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { LOCAL_SERVICE_KEY, MAILPIT, SUPABASE_URL } from './local-env';

export const PASSWORD = 'Lift4ever';

export const admin = createClient(SUPABASE_URL, LOCAL_SERVICE_KEY, { auth: { persistSession: false } });

let seq = 0;
export const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}-${seq++}@test.local`;

/** Confirmed user created straight through the admin API (the trigger gives them a profile). */
export async function createConfirmedUser(email: string, password = PASSWORD) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

export async function userIdByEmail(email: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === email)?.id;
}

type MailSummary = { ID: string; Subject: string };

export async function messagesTo(to: string): Promise<MailSummary[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  return ((await res.json()).messages ?? []) as MailSummary[];
}

/** Wait until `to` has at least `count` emails; returns them newest first. */
export async function waitForMessages(to: string, count = 1): Promise<MailSummary[]> {
  for (let i = 0; i < 30; i++) {
    const list = await messagesTo(to);
    if (list.length >= count) return list;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Expected ${count} email(s) to ${to}`);
}

/**
 * The /callback link from the newest email to `to`. Templates build it from site_url (localhost:3000);
 * the e2e server runs on its own port, so the link is re-pointed at baseURL (same path and token).
 */
export async function callbackLink(to: string, baseURL: string, count = 1): Promise<string> {
  const [newest] = await waitForMessages(to, count);
  const msg = await (await fetch(`${MAILPIT}/api/v1/message/${newest.ID}`)).json();
  const href = (msg.HTML as string).match(/href="([^"]*\/callback\?token_hash=[^"]+)"/)?.[1];
  if (!href) throw new Error('No /callback link in email');
  const u = new URL(href.replace(/&amp;/g, '&'));
  return `${baseURL}${u.pathname}${u.search}`;
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function signUp(page: Page, email: string, password = PASSWORD) {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/signup\/check-email/);
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
}

/** The 7-step onboarding wizard with fixed answers; ends on the generated plan. */
export async function completeOnboarding(page: Page, name = 'E2E') {
  await expect(page).toHaveURL(/onboarding/);
  await page.getByRole('textbox').first().fill(name);
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
}
