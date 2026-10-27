// Onboarding in lb: best-set seeds and ft/in height are converted before they are stored (kg / cm).
import { expect, test } from '@playwright/test';
import { admin, createConfirmedUser, signIn, uniqueEmail } from './helpers';

test('lb user: 225 lb × 5 squat seeds a kg e1RM and 5 ft 9 in stores 175.3 cm', async ({ page }) => {
  const email = uniqueEmail('lb');
  const userId = await createConfirmedUser(email);
  await signIn(page, email);
  await expect(page).toHaveURL(/onboarding/);

  await page.getByRole('textbox').first().fill('Pounds');
  await page.getByRole('radio', { name: 'Male' }).click();
  await page.getByRole('radio', { name: 'lb' }).click();
  await page.getByPlaceholder('72').fill('180');
  await page.getByLabel('Height feet').fill('5');
  await page.getByLabel('Height inches').fill('9');
  // Inline error from the shared schema, then fixed.
  await page.getByPlaceholder('1995').fill('2020');
  await expect(page.getByText('Birth year must be between 1920 and 2015.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.getByPlaceholder('1995').fill('1990');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: /Lean muscle gain/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: /^Intermediate/ }).click();
  await page.getByText(/Recent best sets/).click();
  await page.getByLabel('squat load').fill('225');
  await page.getByLabel('squat reps').fill('5');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Continue' }).click(); // no sports
  await page.getByRole('button', { name: 'Continue' }).click(); // availability defaults
  await page.getByRole('button', { name: 'Continue' }).click(); // full gym, no injuries
  await page.getByRole('button', { name: /Lightly active/ }).click();
  await page.getByRole('button', { name: /Build my plan/ }).click();
  await expect(page.getByRole('heading', { name: /Your first/ })).toBeVisible({ timeout: 60_000 });

  const { data: settings } = await admin.from('user_settings').select('e1rm_seeds').eq('user_id', userId).single();
  // 225 lb = 102.06 kg; 102.06 × 36 / 32 = 114.8 kg.
  expect(settings!.e1rm_seeds).toEqual({ squat: 114.8 });
  const { data: profile } = await admin.from('profiles').select('height_cm, bodyweight_kg, units').eq('user_id', userId).single();
  expect(Number(profile!.height_cm)).toBe(175.3);
  expect(Number(profile!.bodyweight_kg)).toBeCloseTo(81.65, 2);
  expect(profile!.units).toBe('lb');
});
