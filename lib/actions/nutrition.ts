'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { NUTRITION } from '@/lib/knowledge/constants';
import { cutRatioWarning, rateError, type PhaseSpan } from '@/lib/engine/nutrition';
import type { Status } from '@/lib/engine/types';
import { requireUser } from '@/lib/server/context';
import { recomputeNutrition } from '@/lib/server/plan';
import { todayIn } from '@/lib/utils/dates';
import { createLogger } from '@/lib/log';

const log = createLogger('actions/nutrition');

// The widest rate any phase allows (N-RAT-01/02); the per-phase, per-status range is checked by rateError below.
const MAX_RATE = Math.max(NUTRITION.lossRatePctPerWeek.max, ...Object.values(NUTRITION.gainRatePctPerMonth).map(([, hi]) => hi));

const PhaseInput = z.object({
  phase: z.enum(['gain', 'maintain', 'loss']),
  ratePct: z.number().min(0).max(MAX_RATE).optional(),
});

export async function updatePhase(raw: z.input<typeof PhaseInput>): Promise<{ ok: boolean; error?: string; warnings?: string[] }> {
  const p = PhaseInput.safeParse(raw);
  if (!p.success) {
    log.warn('updatePhase: invalid input', { issues: p.error.issues.map((i) => i.path.join('.')) });
    return { ok: false, error: 'Invalid phase' };
  }
  const { supabase, user } = await requireUser();
  log.debug('updatePhase', { userId: user.id, phase: p.data.phase, ratePct: p.data.ratePct });
  // A failed read must stop here: as "no settings" it would reset the phase start and history.
  const [nsRes, settingsRes, profileRes] = await Promise.all([
    supabase.from('nutrition_settings').select('phase, phase_history').eq('user_id', user.id).maybeSingle(),
    supabase.from('user_settings').select('training_status').eq('user_id', user.id).single(),
    supabase.from('profiles').select('timezone').eq('user_id', user.id).single(),
  ]);
  const { data: ns, error: nsErr } = log.db('select nutrition_settings.phase', nsRes, { userId: user.id });
  const { data: settings, error: settingsErr } = log.db('select user_settings.training_status', settingsRes, { userId: user.id });
  const { data: profile, error: profileErr } = log.db('select profiles.timezone', profileRes, { userId: user.id });
  const readErr = nsErr ?? settingsErr ?? profileErr;
  if (readErr || !settings || !profile) return { ok: false, error: readErr?.message ?? 'Settings missing' };
  // Same limits as the rate picker (allowedRatePcts): N-RAT-01 for loss, the status range for gain (N-RAT-02).
  const badRate = rateError(p.data.phase, settings.training_status as Status, p.data.ratePct);
  if (badRate) return { ok: false, error: badRate };
  // N-PHS-02 (4:1) is guidance, not a block: starting a cut early is allowed, with a warning (DECISIONS 42).
  const ratioWarning =
    p.data.phase === 'loss' && ns?.phase !== 'loss' ? cutRatioWarning((ns?.phase_history as PhaseSpan[] | undefined) ?? [], todayIn(profile.timezone)) : null;
  try {
    const res = await recomputeNutrition(supabase, user.id, 'phase change N-PHS-01', {
      phase: p.data.phase,
      ratePct: p.data.ratePct,
      resetPhase: ns?.phase !== p.data.phase,
    });
    revalidatePath('/', 'layout');
    return { ok: true, warnings: [...res.warnings.map((w) => w.message), ...(ratioWarning ? [ratioWarning] : [])] };
  } catch (e) {
    log.error('updatePhase: recomputeNutrition failed', { userId: user.id, err: e });
    revalidatePath('/', 'layout');
    return { ok: false, error: 'Could not update your nutrition targets. Please try again.' };
  }
}
