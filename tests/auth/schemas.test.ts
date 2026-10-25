import { describe, expect, it } from 'vitest';
import {
  authCode,
  authErrorMessage,
  emailSchema,
  fieldErrorsOf,
  GENERIC_AUTH_ERROR,
  passwordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '@/lib/auth/schemas';

describe('emailSchema', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse('  Emil@Example.COM ')).toBe('emil@example.com');
  });
  it('rejects invalid emails', () => {
    for (const bad of ['', 'nope', 'a@', '@b.com', 'a b@c.com']) expect(emailSchema.safeParse(bad).success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts ≥ 8 chars with a letter and a digit', () => {
    for (const ok of ['abcdefg1', 'Pass1234', '1234567a', 'long passphrase 9']) expect(passwordSchema.safeParse(ok).success).toBe(true);
  });
  it('rejects short, letters-only and digits-only passwords', () => {
    for (const bad of ['abc123', 'abcdefgh', '12345678', '']) expect(passwordSchema.safeParse(bad).success).toBe(false);
  });
});

describe('signUpSchema / resetPasswordSchema', () => {
  it('rejects a mismatched confirmation on confirmPassword', () => {
    const r = signUpSchema.safeParse({ email: 'a@b.com', password: 'abcdefg1', confirmPassword: 'abcdefg2' });
    expect(r.success).toBe(false);
    expect(fieldErrorsOf(r.error!)).toEqual({ confirmPassword: "Passwords don't match." });
    expect(resetPasswordSchema.safeParse({ password: 'abcdefg1', confirmPassword: 'x' }).success).toBe(false);
  });
  it('accepts matching input and normalises the email', () => {
    const r = signUpSchema.parse({ email: ' A@B.com', password: 'abcdefg1', confirmPassword: 'abcdefg1' });
    expect(r.email).toBe('a@b.com');
    expect(resetPasswordSchema.safeParse({ password: 'abcdefg1', confirmPassword: 'abcdefg1' }).success).toBe(true);
  });
  it('reports the first error per field', () => {
    const r = signUpSchema.safeParse({ email: 'x', password: 'a', confirmPassword: 'a' });
    const fe = fieldErrorsOf(r.error!);
    expect(Object.keys(fe).sort()).toEqual(['email', 'password']);
    expect(fe.password).toBe('Use at least 8 characters.');
  });
});

describe('signInSchema', () => {
  it('needs a password but does not apply the strength rule', () => {
    expect(signInSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
    expect(signInSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});

describe('auth error mapping', () => {
  it('maps every handled Supabase code to a specific message', () => {
    for (const code of [
      'invalid_credentials',
      'email_not_confirmed',
      'weak_password',
      'over_email_send_rate_limit',
      'over_request_rate_limit',
      'same_password',
    ]) {
      expect(authErrorMessage(code)).not.toBe(GENERIC_AUTH_ERROR);
    }
    expect(authErrorMessage('invalid_credentials')).toBe('Email or password is incorrect.');
    expect(authErrorMessage('email_not_confirmed')).toBe('Confirm your email first');
  });
  it('falls back to a generic message', () => {
    expect(authErrorMessage('something_new')).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage(undefined)).toBe(GENERIC_AUTH_ERROR);
  });
  it('maps Supabase codes to AuthState codes', () => {
    expect(authCode('invalid_credentials')).toBe('invalid_credentials');
    expect(authCode('email_not_confirmed')).toBe('email_not_confirmed');
    expect(authCode('weak_password')).toBe('weak_password');
    expect(authCode('over_email_send_rate_limit')).toBe('rate_limited');
    expect(authCode(undefined, 429)).toBe('rate_limited');
    expect(authCode('user_banned')).toBe('unknown');
  });
});
