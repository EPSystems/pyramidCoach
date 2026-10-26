import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { appOrigin, safeNext } from '@/lib/utils/redirect';
import { createLogger } from '@/lib/log';

const log = createLogger('auth/callback');

const OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

// Single landing point for OAuth codes (Google) and email token_hash links (confirm, recovery). AUTH_PLAN §4.3.3.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const rawType = url.searchParams.get('type');
  const type = OTP_TYPES.includes(rawType as EmailOtpType) ? (rawType as EmailOtpType) : null;
  const supabase = await createClient();
  let ok = false;
  // Expired or reused links land here, so warn rather than error.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) log.warn('exchangeCodeForSession failed', { err: error });
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) log.warn('verifyOtp failed', { type, err: error });
    ok = !error;
  }
  // Neither param: usually the provider bounced back with ?error=access_denied (user cancelled Google consent).
  else log.warn('callback without code or token_hash', { rawType, providerError: url.searchParams.get('error') });
  const base = await appOrigin();
  if (!ok) return NextResponse.redirect(`${base}/login?error=link`);
  if (type === 'recovery') return NextResponse.redirect(`${base}/reset-password`);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) log.warn('no user after successful exchange', { type });
  const { data: profile, error } = user
    ? log.db('update profiles.last_active_at', await supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('user_id', user.id).select('onboarded_at').maybeSingle(), { userId: user.id })
    : { data: null, error: null };
  // The update only stamps last_active_at (admin list), so a failed write is not worth blocking sign-in. Its select is
  // our onboarding check, though, so on error we can't tell and go to `next`: the app layout's requireOnboarded still
  // sends a not-yet-onboarded user to /onboarding.
  const dest = error || profile?.onboarded_at ? safeNext(url.searchParams.get('next')) : '/onboarding';
  return NextResponse.redirect(`${base}${dest}`);
}
