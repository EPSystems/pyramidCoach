import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const supabase = await createClient();
  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  const base = process.env.APP_URL ?? url.origin;
  if (!ok) return NextResponse.redirect(`${base}/login?error=link`);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('user_id', user.id);
  const { data: profile } = user ? await supabase.from('profiles').select('onboarded_at').eq('user_id', user.id).maybeSingle() : { data: null };
  return NextResponse.redirect(`${base}${profile?.onboarded_at ? '/today' : '/onboarding'}`);
}
