'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/server/context';
import { createAdminClient } from '@/lib/supabase/admin';

type R = { ok: boolean; error?: string };

async function requireOwner() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from('profiles').select('role').eq('user_id', user.id).single();
  if (data?.role !== 'owner') throw new Error('Owner only');
  return { supabase, user };
}

/** Owner creates an invite; Supabase emails a magic link (service role used only here, Section 4.2). */
export async function createInvite(emailRaw: string): Promise<R> {
  const parsed = z.email().safeParse(emailRaw.trim().toLowerCase());
  if (!parsed.success) return { ok: false, error: 'Invalid email' };
  const email = parsed.data;
  try {
    const { supabase, user } = await requireOwner();
    // Rate limit: at most 20 invites per day (Section 11).
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await supabase.from('invites').select('email', { count: 'exact', head: true }).gte('created_at', since);
    if ((count ?? 0) >= 20) return { ok: false, error: 'Invite limit reached for today' };
    const { error } = await supabase.from('invites').upsert({ email, invited_by: user.id, revoked_at: null });
    if (error) return { ok: false, error: error.message };
    const admin = createAdminClient();
    const { error: mailErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${process.env.APP_URL ?? 'http://localhost:3000'}/callback` });
    if (mailErr && !/already been registered/i.test(mailErr.message)) return { ok: false, error: `Invite saved, but the email failed: ${mailErr.message}` };
    revalidatePath('/admin');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function revokeAccess(email: string): Promise<R> {
  try {
    const { supabase } = await requireOwner();
    const { error } = await supabase.rpc('admin_revoke_user', { p_email: email });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/admin');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}

const GlobalExercise = z.object({ id: z.guid(), cues: z.array(z.string().max(160)).max(6), mistakes: z.array(z.string().max(160)).max(4) });

export async function updateGlobalExercise(raw: z.input<typeof GlobalExercise>): Promise<R> {
  const p = GlobalExercise.safeParse(raw);
  if (!p.success) return { ok: false, error: 'Invalid' };
  try {
    const { supabase } = await requireOwner();
    const { error } = await supabase.from('exercises').update({ cues: p.data.cues, mistakes: p.data.mistakes }).eq('id', p.data.id).is('owner_user_id', null);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/library');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}
