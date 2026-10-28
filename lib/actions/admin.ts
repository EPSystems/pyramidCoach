'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/server/context';
import { replaceExerciseMuscles } from '@/lib/server/exercises';
import { ExerciseTraits } from '@/lib/schemas/exercise';
import { createLogger } from '@/lib/log';

const log = createLogger('actions/admin');

type R = { ok: boolean; error?: string };

/** Re-checks the caller's role. Owner-only actions pass ['owner']; admin pages pass ['owner', 'admin']. SQL checks again. */
async function requireRole(allowed: readonly string[]) {
  const { supabase, user } = await requireUser();
  const { data } = log.db('select profiles.role', await supabase.from('profiles').select('role').eq('user_id', user.id).single(), { userId: user.id });
  if (!data || !allowed.includes(data.role)) {
    log.warn('caller lacks the role for an admin action', { userId: user.id, role: data?.role, allowed });
    throw new Error(allowed.length === 1 ? 'Owner only' : 'Admins only');
  }
  return { supabase, user };
}
const requireOwner = () => requireRole(['owner']);
const requireAdmin = () => requireRole(['owner', 'admin']);

/** Owner removes a user; the cascade deletes their data. The owner can't be removed (enforced in SQL too). */
export async function removeUser(email: string): Promise<R> {
  try {
    const { supabase } = await requireOwner();
    log.debug('removeUser');
    const { error } = log.db('rpc admin_remove_user', await supabase.rpc('admin_remove_user', { p_email: email }));
    if (error) return { ok: false, error: error.message };
    revalidatePath('/admin');
    return { ok: true };
  } catch (e) {
    log.error('removeUser threw', { err: e });
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}

const RoleChange = z.object({ userId: z.guid(), role: z.enum(['admin', 'member']) });

/** Owner promotes a member to admin or demotes an admin. The owner role itself can't be changed (enforced in SQL). */
export async function setUserRole(raw: z.input<typeof RoleChange>): Promise<R> {
  const p = RoleChange.safeParse(raw);
  if (!p.success) {
    log.warn('setUserRole: invalid input', { issues: p.error.issues.map((i) => i.path.join('.')) });
    return { ok: false, error: 'Invalid' };
  }
  try {
    const { supabase, user } = await requireOwner();
    log.info('setUserRole', { by: user.id, target: p.data.userId, role: p.data.role });
    const { error } = log.db('rpc admin_set_role', await supabase.rpc('admin_set_role', { p_user_id: p.data.userId, p_role: p.data.role }), { target: p.data.userId });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/admin');
    return { ok: true };
  } catch (e) {
    log.error('setUserRole threw', { err: e });
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Text plus, optionally, muscles and flags. Note: `pnpm seed:gen` output (supabase/seed.sql) overwrites these on a re-seed.
const GlobalExercise = z.object({ id: z.guid(), cues: z.array(z.string().max(160)).max(6), mistakes: z.array(z.string().max(160)).max(4), traits: ExerciseTraits.optional() });

export async function updateGlobalExercise(raw: z.input<typeof GlobalExercise>): Promise<R> {
  const p = GlobalExercise.safeParse(raw);
  if (!p.success) {
    log.warn('updateGlobalExercise: invalid input', { issues: p.error.issues.map((i) => i.path.join('.')) });
    return { ok: false, error: 'Invalid' };
  }
  try {
    const { supabase } = await requireAdmin();
    log.debug('updateGlobalExercise', { exerciseId: p.data.id, traits: !!p.data.traits });
    const t = p.data.traits;
    const { error } = log.db(
      'update exercises (global)',
      await supabase
        .from('exercises')
        .update({
          cues: p.data.cues,
          mistakes: p.data.mistakes,
          ...(t && { long_length_bias: t.long, axial_load: t.axial, impact_lower_body: t.impact, unilateral: t.unilateral, default_increment_kg: t.increment }),
        })
        .eq('id', p.data.id)
        .is('owner_user_id', null),
      { exerciseId: p.data.id },
    );
    if (error) return { ok: false, error: error.message };
    if (t) {
      const mErr = await replaceExerciseMuscles(supabase, p.data.id, t.primary, t.secondary);
      if (mErr) return { ok: false, error: `Text and flags saved, but muscles failed: ${mErr}` };
    }
    revalidatePath('/library', 'layout');
    return { ok: true };
  } catch (e) {
    log.error('updateGlobalExercise threw', { err: e });
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}
