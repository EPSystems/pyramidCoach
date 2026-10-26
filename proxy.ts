import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { createLogger } from '@/lib/log';

const log = createLogger('proxy');

// '/signup' also covers '/signup/check-email'. '/reset-password' stays protected: it needs the recovery session.
// '/privacy' and '/terms' are open to everyone, signed in or not (Google OAuth consent screen links).
const PUBLIC = ['/login', '/signup', '/forgot-password', '/callback', '/privacy', '/terms', '/api/health', '/manifest.webmanifest'];
const SIGNED_OUT_ONLY = ['/login', '/signup'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  // No session is the normal signed-out case; anything else (expired refresh token, Supabase down) is worth seeing.
  if (authError && authError.name !== 'AuthSessionMissingError') log.warn('session refresh failed', { path, err: authError });
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(`${p}/`));
  if (!user && !isPublic) {
    log.debug('redirect to /login', { path });
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  // '/' is answered here too, so opening the app skips rendering app/page.tsx just to redirect.
  if (user && (path === '/' || SIGNED_OUT_ONLY.includes(path))) {
    const url = request.nextUrl.clone();
    url.pathname = '/today';
    url.search = '';
    const redirect = NextResponse.redirect(url);
    // Keep any session cookies getUser() just refreshed.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

export const config = {
  // The manifest is public and fetched on every page load; skip the auth round-trip for it.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
};
