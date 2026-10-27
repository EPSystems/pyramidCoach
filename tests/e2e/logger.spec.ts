// Session logger (PROGRESS §4): warm-up sets are logged as warm-ups, and a user note never overwrites the engine label.
// Requires `supabase start` and the 20261027130001_logger_gaps migration.
import { expect, test } from '@playwright/test';
import { admin, completeOnboarding, createConfirmedUser, signIn, uniqueEmail } from './helpers';

test('warm-up logging and label/note separation', async ({ page }) => {
  const email = uniqueEmail('logger');
  const userId = await createConfirmedUser(email);
  await signIn(page, email);
  await completeOnboarding(page);

  const { data: s } = await admin.from('planned_sessions').select('id').eq('user_id', userId).order('scheduled_on').limit(1).single();
  const sessionId = s!.id;
  const { data: pes } = await admin.from('planned_exercises').select('id, position').eq('session_id', sessionId).order('position');
  const firstId = pes![0].id;
  // A known working load (no history yet) so the first compound gets a warm-up ramp (>= 40 kg, T-WUP-01),
  // and a system label on the first exercise.
  await admin.from('planned_exercises').update({ suggested_load_kg: 60 }).eq('session_id', sessionId);
  await admin.from('planned_exercises').update({ label: 'Back-off sets @ RPE 7', note: null }).eq('id', firstId);

  await page.goto(`/session/${sessionId}`);
  await expect(page.getByText('Back-off sets @ RPE 7')).toBeVisible();

  // Warm-up set 1: logged with is_warmup = true, and it doesn't take working set 1's slot.
  await page.getByText('Warm-up ramp').first().click();
  await page.getByRole('button', { name: 'Log warm-up set 1' }).click();
  await expect(page.getByRole('button', { name: 'Undo warm-up set 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Log set 1' }).first().click();
  await expect(page.getByRole('button', { name: 'Undo set 1' }).first()).toBeVisible();
  await expect
    .poll(async () => (await admin.from('logged_sets').select('is_warmup, set_index').eq('session_id', sessionId).order('is_warmup')).data)
    .toEqual([
      { is_warmup: false, set_index: 0 },
      { is_warmup: true, set_index: 0 },
    ]);

  // Writing a note keeps the label.
  await page.getByRole('button', { name: 'Exercise menu' }).first().click();
  await page.getByRole('menuitem', { name: 'Note' }).click();
  await page.getByPlaceholder(/Seat height/).fill('Pin 4');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Note saved')).toBeVisible();
  const { data: pe } = await admin.from('planned_exercises').select('label, note').eq('id', firstId).single();
  expect(pe).toEqual({ label: 'Back-off sets @ RPE 7', note: 'Pin 4' });

  // Reload: the warm-up stays ticked and the label is still shown next to the note.
  await page.reload();
  await expect(page.getByText('Back-off sets @ RPE 7')).toBeVisible();
  await expect(page.getByText('Pin 4')).toBeVisible();
  await page.getByText('Warm-up ramp').first().click();
  await expect(page.getByRole('button', { name: 'Undo warm-up set 1' })).toBeVisible();
});
