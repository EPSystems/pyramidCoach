'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { NUTRITION } from '@/lib/knowledge/constants';
import { requireUser } from '@/lib/server/context';
import { recomputeNutrition } from '@/lib/server/plan';
import { createLogger } from '@/lib/log';

const log = createLogger('actions/nutrition');

const PhaseInput = z.object({
  phase: z.enum(['gain', 'maintain', 'loss']),
  ratePct: z.number().min(0).max(3).optional(),
});

export async function updatePhase(raw: z.input<typeof PhaseInput>): Promise<{ ok: boolean; error?: string; warnings?: string[] }> {
  const p = PhaseInput.safeParse(raw);
  if (!p.success) {
    log.warn('updatePhase: invalid input', { issues: p.error.issues.map((i) => i.path.join('.')) });
    return { ok: false, error: 'Invalid phase' };
  }
  if (p.data.phase === 'loss' && (p.data.ratePct ?? 0) > NUTRITION.safety.maxLossPctPerWeek) {
    return { ok: false, error: 'Losing more than 1% of bodyweight per week is blocked (N-RAT-01).' };
  }
  const { supabase, user } = await requireUser();
  log.debug('updatePhase', { userId: user.id, phase: p.data.phase, ratePct: p.data.ratePct });
  // A failed read must stop here: as "no settings" it would reset the phase start and history.
  const { data: ns, error: readErr } = log.db('select nutrition_settings.phase', await supabase.from('nutrition_settings').select('phase').eq('user_id', user.id).maybeSingle(), { userId: user.id });
  if (readErr) return { ok: false, error: readErr.message };
  try {
    const res = await recomputeNutrition(supabase, user.id, 'phase change N-PHS-01', {
      phase: p.data.phase,
      ratePct: p.data.ratePct,
      resetPhase: ns?.phase !== p.data.phase,
    });
    revalidatePath('/', 'layout');
    return { ok: true, warnings: res.warnings.map((w) => w.message) };
  } catch (e) {
    log.error('updatePhase: recomputeNutrition failed', { userId: user.id, err: e });
    revalidatePath('/', 'layout');
    return { ok: false, error: 'Could not update your nutrition targets. Please try again.' };
  }
}
