'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/server/context';

type R = { ok: boolean; error?: string };

async function requireOwner() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from('profiles').select('role').eq('user_id', user.id).single();
  if (data?.role !== 'owner') throw new Error('Owner only');
  return { supabase, user };
}

/** Owner removes a user; the cascade deletes their data. The owner can't be removed (enforced in SQL too). */
export async function removeUser(email: string): Promise<R> {
  try {
    const { supabase } = await requireOwner();
    const { error } = await supabase.rpc('admin_remove_user', { p_email: email });
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
