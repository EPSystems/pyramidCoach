'use server';

import { redirect } from 'next/navigation';
import type { AuthError } from '@supabase/supabase-js';
import {
  authCode,
  authErrorMessage,
  emailOnlySchema,
  fieldErrorsOf,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  type AuthState,
} from '@/lib/auth/schemas';
import { createClient } from '@/lib/supabase/server';
import { appOrigin, safeNext } from '@/lib/utils/redirect';
import { createLogger } from '@/lib/log';

export type { AuthState } from '@/lib/auth/schemas';

const field = (form: FormData, name: string) => String(form.get(name) ?? '');

const log = createLogger('actions/auth');

function failure(error: AuthError, email?: string): AuthState {
  const code = authCode(error.code, error.status);
  // Wrong password and the like are expected; an 'unknown' mapping usually means Supabase or config trouble.
  if (code === 'unknown') log.error('auth call failed', { mapped: code, err: error });
  else log.warn('auth call rejected', { mapped: code, err: error });
  const state: AuthState = { code, error: authErrorMessage(error.code ?? code), email };
  if (code === 'weak_password') state.fieldErrors = { password: state.error };
  return state;
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({ email: field(form, 'email'), password: field(form, 'password'), confirmPassword: field(form, 'confirmPassword') });
  if (!parsed.success) return { code: 'validation', fieldErrors: fieldErrorsOf(parsed.error), email: field(form, 'email').trim().toLowerCase() };
  const { email, password } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${await appOrigin()}/callback?next=/onboarding` } });
  // An existing email gets the same screen, so the response never reveals who is registered (§2.2).
  if (error && error.code !== 'user_already_exists' && error.code !== 'email_exists') return failure(error, email);
  redirect(`/signup/check-email?email=${encodeURIComponent(email)}`);
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse({ email: field(form, 'email'), password: field(form, 'password') });
  if (!parsed.success) return { code: 'validation', fieldErrors: fieldErrorsOf(parsed.error), email: field(form, 'email').trim().toLowerCase() };
  const { email, password } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return failure(error, email);
  const { data: profile, error: profileError } = log.db(
    'update profiles.last_active_at',
    await supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('user_id', data.user.id).select('onboarded_at').maybeSingle(),
    { userId: data.user.id },
  );
  // Same as the callback route: a failed last_active_at stamp shouldn't block sign-in. We can't tell whether the user
  // is onboarded then, so go to `next`; requireOnboarded on app pages still redirects to /onboarding if needed.
  redirect(profileError || profile?.onboarded_at ? safeNext(field(form, 'next')) : '/onboarding');
}

export async function signInWithGoogle(_prev: AuthState, form: FormData): Promise<AuthState> {
  const next = safeNext(field(form, 'next'));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${await appOrigin()}/callback?next=${encodeURIComponent(next)}` },
  });
  if (!error && !data.url) log.error('signInWithOAuth returned no url');
  if (error || !data.url) return error ? failure(error) : { code: 'unknown', error: authErrorMessage(undefined) };
  redirect(data.url);
}

export async function resendConfirmation(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = emailOnlySchema.safeParse({ email: field(form, 'email') });
  if (!parsed.success) return { code: 'validation', fieldErrors: fieldErrorsOf(parsed.error) };
  const { email } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${await appOrigin()}/callback?next=/onboarding` } });
  if (error && authCode(error.code, error.status) === 'rate_limited') return failure(error, email);
  // Hidden from the user on purpose (no account enumeration), so this log is the only trace of e.g. SMTP trouble.
  if (error) log.warn('resend confirmation failed (hidden from user)', { err: error });
  return { ok: true, email };
}

export async function requestPasswordReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = emailOnlySchema.safeParse({ email: field(form, 'email') });
  if (!parsed.success) return { code: 'validation', fieldErrors: fieldErrorsOf(parsed.error) };
  const { email } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await appOrigin()}/callback?next=/reset-password` });
  // Always the same answer unless rate-limited, so it never reveals whether the account exists (§3.2).
  if (error && authCode(error.code, error.status) === 'rate_limited') return failure(error, email);
  if (error) log.warn('password reset email failed (hidden from user)', { err: error });
  return { ok: true, email };
}

export async function updatePassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = resetPasswordSchema.safeParse({ password: field(form, 'password'), confirmPassword: field(form, 'confirmPassword') });
  if (!parsed.success) return { code: 'validation', fieldErrors: fieldErrorsOf(parsed.error) };
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (!user) {
    log.warn('updatePassword without a recovery session', { err: userError });
    return { code: 'unknown', error: 'Your reset link expired. Request a new one.' };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === 'same_password') return { code: 'validation', fieldErrors: { password: authErrorMessage('same_password') } };
    return failure(error);
  }
  redirect('/today');
}

export async function signOut() {
  const supabase = await createClient();
  log.db('signOut', await supabase.auth.signOut());
  redirect('/login');
}
