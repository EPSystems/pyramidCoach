'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const Email = z.object({ email: z.email().max(200) });

export type LoginState = { ok?: boolean; error?: string; email?: string };

export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = Email.safeParse({ email: String(form.get('email') ?? '').trim().toLowerCase() });
  if (!parsed.success) return { error: 'Enter a valid email address.' };
  const supabase = await createClient();
  const { data: invited } = await supabase.rpc('is_invited', { p_email: parsed.data.email });
  if (!invited) return { error: 'Pyramid Coach is invite-only. Ask the owner for an invite.', email: parsed.data.email };
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${process.env.APP_URL ?? 'http://localhost:3000'}/callback`, shouldCreateUser: true },
  });
  if (error) return { error: error.message.includes('invite') ? 'This email is not invited.' : error.message, email: parsed.data.email };
  return { ok: true, email: parsed.data.email };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
