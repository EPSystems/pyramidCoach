/* Pyramid Coach service worker (DECISIONS 37–38). Hand-written, no build step.
 *
 * - Precache: offline fallback page, icons, manifest.
 * - /_next/static/** and /icons/**: cache-first (content-hashed, immutable).
 * - Navigations: network-first. Successful responses for /today, /week and /session/<id> are cached so they open
 *   offline; any other navigation that fails offline gets /offline.html.
 * - Never cached: non-GET, cross-origin (Supabase auth/data), /api/** (incl. /api/export), auth routes, RSC fetches.
 * - Caches are versioned by the `v` query on the script URL (the build id); old ones are deleted on activate.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const PREFIX = 'pc-';
const STATIC_CACHE = `${PREFIX}static-${VERSION}`;
const PAGES_CACHE = `${PREFIX}pages-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png'];

// Pages that are useful in the gym and safe to keep: they only render the signed-in user's own plan.
const CACHEABLE_PAGES = [/^\/today\/?$/, /^\/week\/?$/, /^\/session\/[^/]+\/?$/];
// Never cache (or serve from cache) anything auth-related or user exports.
const NEVER_CACHE = [/^\/api\//, /^\/(login|signup|callback|forgot-password|reset-password|auth|onboarding)(\/|$)/];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== STATIC_CACHE && k !== PAGES_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) => url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
const isCacheablePage = (url) => CACHEABLE_PAGES.some((r) => r.test(url.pathname));
const isNeverCache = (url) => NEVER_CACHE.some((r) => r.test(url.pathname));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase and other origins go straight to the network.
  if (isNeverCache(url) && req.mode !== 'navigate') return;
  if (req.headers.get('RSC') || url.searchParams.has('_rsc')) return; // Client-router payloads: network only.

  if (req.mode === 'navigate') {
    event.respondWith(navigate(req, url));
    return;
  }
  if (isStatic(url)) event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') cache.put(req, res.clone());
  return res;
}

async function navigate(req, url) {
  try {
    const res = await fetch(req);
    if (res.redirected && new URL(res.url).pathname === '/login') {
      // Signed out (or the session expired): drop every cached page so nobody sees the previous user's plan.
      await caches.delete(PAGES_CACHE);
    } else if (res.ok && res.type === 'basic' && !res.redirected && isCacheablePage(url) && !isNeverCache(url)) {
      const cache = await caches.open(PAGES_CACHE);
      await cache.put(url.pathname, res.clone());
    }
    return res;
  } catch {
    if (!isNeverCache(url)) {
      const cached = await (await caches.open(PAGES_CACHE)).match(url.pathname);
      if (cached) return cached;
    }
    return (await caches.match(OFFLINE_URL)) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

// Messages from the page (components/app/service-worker.tsx).
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'warm') event.waitUntil(warm(msg.pages || [], msg.assets || []));
  if (msg.type === 'purge-pages') event.waitUntil(caches.delete(PAGES_CACHE));
});

/** Cache pages and the static assets the first load fetched before this worker was in control. */
async function warm(pages, assets) {
  const statics = await caches.open(STATIC_CACHE);
  await Promise.all(
    assets
      .map((a) => new URL(a, self.location.origin))
      .filter((u) => u.origin === self.location.origin && isStatic(u))
      .map(async (u) => {
        if (await statics.match(u.pathname + u.search)) return;
        try {
          const res = await fetch(u.pathname + u.search);
          if (res.ok) await statics.put(u.pathname + u.search, res);
        } catch {
          /* offline or gone; it will be cached on next use */
        }
      }),
  );
  const cache = await caches.open(PAGES_CACHE);
  await Promise.all(
    pages
      .map((p) => new URL(p, self.location.origin))
      .filter((u) => u.origin === self.location.origin && isCacheablePage(u) && !isNeverCache(u))
      .map(async (u) => {
        try {
          const res = await fetch(u.pathname, { credentials: 'same-origin', redirect: 'follow' });
          if (res.ok && !res.redirected) await cache.put(u.pathname, res);
        } catch {
          /* offline; keep the old copy */
        }
      }),
  );
}
