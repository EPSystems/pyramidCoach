'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createLogger } from '@/lib/log';

const log = createLogger('providers');

export type ThemePref = 'dark' | 'light' | 'system';
const ThemeCtx = createContext<{ theme: ThemePref; resolved: 'dark' | 'light'; setTheme: (t: ThemePref) => void }>({
  theme: 'dark',
  resolved: 'dark',
  setTheme: () => {},
});
export const useTheme = () => useContext(ThemeCtx);

function readPref(): ThemePref {
  try {
    return (localStorage.getItem('pc-theme') as ThemePref) || 'dark';
  } catch (e) {
    // Blocked storage (private mode, strict settings) is expected; fall back to dark.
    log.debug('theme read from localStorage failed', { err: e });
    return 'dark';
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
        // One place that sees every failed query and mutation, whatever the component does with the error.
        queryCache: new QueryCache({ onError: (err, query) => log.error('query failed', { queryKey: JSON.stringify(query.queryKey), err }) }),
        mutationCache: new MutationCache({ onError: (err, _vars, _ctx, mutation) => log.error('mutation failed', { mutationKey: mutation.options.mutationKey ? JSON.stringify(mutation.options.mutationKey) : undefined, err }) }),
      }),
  );
  const [theme, setThemeState] = useState<ThemePref>(() => (typeof window === 'undefined' ? 'dark' : readPref()));
  const [resolved, setResolved] = useState<'dark' | 'light'>(() => (typeof document !== 'undefined' && !document.documentElement.classList.contains('dark') ? 'light' : 'dark'));

  const apply = useCallback((t: ThemePref) => {
    const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    setResolved(dark ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => readPref() === 'system' && apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [apply]);

  const setTheme = (t: ThemePref) => {
    try {
      localStorage.setItem('pc-theme', t);
    } catch (e) {
      // Theme still applies for this visit; it just won't persist.
      log.debug('theme write to localStorage failed', { err: e });
    }
    setThemeState(t);
    apply(t);
  };

  return (
    <ThemeCtx.Provider value={{ theme, resolved, setTheme }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ThemeCtx.Provider>
  );
}
