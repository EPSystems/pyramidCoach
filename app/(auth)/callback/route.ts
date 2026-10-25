import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { appOrigin, safeNext } from '@/lib/utils/redirect';

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
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  const base = await appOrigin();
  if (!ok) return NextResponse.redirect(`${base}/login?error=link`);
  if (type === 'recovery') return NextResponse.redirect(`${base}/reset-password`);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('user_id', user.id).select('onboarded_at').maybeSingle()
    : { data: null };
  return NextResponse.redirect(`${base}${profile?.onboarded_at ? safeNext(url.searchParams.get('next')) : '/onboarding'}`);
}
