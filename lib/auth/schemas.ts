import { z } from 'zod';

// Pure pieces of the auth flow (AUTH_PLAN §4.3.2). Kept out of the 'use server' module so tests can import them.

export type AuthCode = 'email_not_confirmed' | 'invalid_credentials' | 'weak_password' | 'rate_limited' | 'validation' | 'unknown';
export type AuthField = 'email' | 'password' | 'confirmPassword';

export type AuthState = {
  ok?: boolean; // success without redirect (resend, reset request)
  error?: string; // friendly message to show
  code?: AuthCode;
  fieldErrors?: Partial<Record<AuthField, string>>;
  email?: string; // echoed back so the form can refill / resend
};

export const emailSchema = z
  .string({ error: 'Enter your email address.' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address.' }).max(200, { error: 'That email is too long.' }));

// Matches Supabase Auth: minimum length 8, letters + digits. 72 is bcrypt's limit.
export const passwordSchema = z
  .string({ error: 'Enter a password.' })
  .min(8, { error: 'Use at least 8 characters.' })
  .max(72, { error: 'Use at most 72 characters.' })
  .regex(/[A-Za-z]/, { error: 'Include at least one letter.' })
  .regex(/\d/, { error: 'Include at least one number.' });

const matches = (v: { password: string; confirmPassword: string }) => v.password === v.confirmPassword;
const mismatch = { path: ['confirmPassword'], error: "Passwords don't match." };

export const signUpSchema = z.object({ email: emailSchema, password: passwordSchema, confirmPassword: z.string() }).refine(matches, mismatch);

export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, { error: 'Enter your password.' }) });

export const emailOnlySchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({ password: passwordSchema, confirmPassword: z.string() }).refine(matches, mismatch);

/** First message per field, in the shape AuthState.fieldErrors expects. */
export function fieldErrorsOf(error: z.ZodError): Partial<Record<AuthField, string>> {
  const out: Partial<Record<AuthField, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as AuthField;
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** Supabase Auth error code → our AuthState code. */
export function authCode(raw: string | undefined, status?: number): AuthCode {
  if (raw === 'invalid_credentials' || raw === 'email_not_confirmed' || raw === 'weak_password') return raw;
  if (raw === 'over_email_send_rate_limit' || raw === 'over_request_rate_limit' || status === 429) return 'rate_limited';
  return 'unknown';
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email or password is incorrect.',
  email_not_confirmed: 'Confirm your email first',
  weak_password: 'Choose a stronger password: at least 8 characters with letters and numbers.',
  same_password: 'Choose a password different from your current one.',
  over_email_send_rate_limit: 'Too many emails sent. Try again in a few minutes.',
  over_request_rate_limit: 'Too many attempts. Try again in a few minutes.',
  rate_limited: 'Too many attempts. Try again in a few minutes.',
};

export const GENERIC_AUTH_ERROR = 'Something went wrong. Please try again.';

/** Friendly message for a Supabase Auth error code (or one of our AuthCodes). Unknown → generic. */
export function authErrorMessage(code: string | undefined): string {
  return (code && MESSAGES[code]) || GENERIC_AUTH_ERROR;
}
