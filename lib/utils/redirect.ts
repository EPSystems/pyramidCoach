import { headers } from 'next/headers';

const FALLBACK_NEXT = '/today';
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

type HeadersLike = { get(name: string): string | null };

function first(value: string | null) {
  return value?.split(',')[0]?.trim() || null;
}

function originOf(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/** Origin of the incoming request: x-forwarded-* (Vercel), then host, then the origin header. */
export function requestOrigin(h: HeadersLike) {
  const host = first(h.get('x-forwarded-host')) ?? first(h.get('host'));
  if (host) {
    const proto = first(h.get('x-forwarded-proto')) ?? (LOCAL.test(host) ? 'http' : 'https');
    const o = originOf(`${proto}://${host}`);
    if (o) return o;
  }
  return originOf(h.get('origin'));
}

/**
 * Base URL for links we hand to Supabase (AUTH_PLAN §2.7): APP_URL, else the request's own origin.
 * A localhost APP_URL never wins over a real request origin, so production can't send links to localhost.
 */
export function resolveOrigin(appUrl: string | null | undefined, h: HeadersLike) {
  const configured = originOf(appUrl?.trim());
  const req = requestOrigin(h);
  if (configured && !(req && LOCAL.test(new URL(configured).host) && !LOCAL.test(new URL(req).host))) return configured;
  return req ?? configured ?? 'http://localhost:3000';
}

export async function appOrigin() {
  return resolveOrigin(process.env.APP_URL, await headers());
}

/** Only same-site relative paths; anything else (//evil.com, /\evil.com, https://…, javascript:) → /today. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return FALLBACK_NEXT;
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return FALLBACK_NEXT;
  try {
    const base = 'http://n.invalid';
    const u = new URL(raw, base);
    return u.origin === base ? `${u.pathname}${u.search}${u.hash}` : FALLBACK_NEXT;
  } catch {
    return FALLBACK_NEXT;
  }
}

/**
 * Where the proxy sends a signed-out visitor: /login, carrying the page they asked for as `?next=` so sign-in
 * (password or Google) lands them back there. The path goes through safeNext, and the default page adds nothing.
 * /reset-password is skipped: reaching it signed out means the recovery session expired, so there's nothing to return to.
 */
export function loginRedirect(pathname: string, search = ''): string {
  const next = safeNext(`${pathname}${search}`);
  if (next === FALLBACK_NEXT || pathname === '/' || pathname === '/reset-password') return '/login';
  return `/login?next=${encodeURIComponent(next)}`;
}
