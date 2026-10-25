'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

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
  } catch {
    return 'dark';
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } }));
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
    } catch {}
    setThemeState(t);
    apply(t);
  };

  return (
    <ThemeCtx.Provider value={{ theme, resolved, setTheme }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ThemeCtx.Provider>
  );
}
