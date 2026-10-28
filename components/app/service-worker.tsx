'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { createLogger } from '@/lib/log';

const log = createLogger('service-worker');

// Build id baked in by next.config.ts; a new deploy registers /sw.js?v=<new id>, which installs fresh caches.
const SW_URL = `/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'}`;
const ENABLED = process.env.NODE_ENV === 'production';
const CACHEABLE = /^\/(today|week|session\/[^/]+)\/?$/;
const SIGNED_OUT = /^\/(login|signup)(\/|$)/;

function post(msg: unknown) {
  navigator.serviceWorker.controller?.postMessage(msg);
}

/** Pages and assets worth having offline: the current page, Today, Week and any session linked from this page. */
function warm() {
  if (!navigator.onLine || !navigator.serviceWorker.controller) return;
  const pages = new Set<string>([location.pathname, '/today', '/week']);
  document.querySelectorAll<HTMLAnchorElement>('a[href^="/session/"]').forEach((a) => pages.add(new URL(a.href).pathname));
  const assets = performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .filter((n) => n.startsWith(`${location.origin}/_next/static/`));
  post({ type: 'warm', pages: [...pages].filter((p) => CACHEABLE.test(p)), assets });
}

/** Registers the service worker (production only) and keeps the offline copies of gym pages fresh. */
export function ServiceWorker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!ENABLED || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register(SW_URL, { scope: '/', updateViaCache: 'none' })
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        // The first visit loads before the worker controls the page; once it does, cache what that load fetched.
        if (navigator.serviceWorker.controller) warm();
        else navigator.serviceWorker.addEventListener('controllerchange', warm, { once: true });
      })
      .catch((e: unknown) => log.warn('service worker registration failed', { err: e }));
    // Refresh the offline copies when the user leaves the app (locks the phone, switches apps) or regains signal.
    const onHide = () => document.visibilityState === 'hidden' && warm();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('online', warm);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('online', warm);
    };
  }, []);

  useEffect(() => {
    if (!ENABLED || !('serviceWorker' in navigator)) return;
    // Signed out: forget cached pages so the next person on this phone can't open the previous user's plan.
    if (SIGNED_OUT.test(pathname)) post({ type: 'purge-pages' });
    // Client-side navigations don't go through the worker's navigation handler, so cache those pages explicitly.
    else if (CACHEABLE.test(pathname) && navigator.onLine) post({ type: 'warm', pages: [pathname], assets: [] });
  }, [pathname]);

  return null;
}
