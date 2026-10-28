'use client';

import { useEffect } from 'react';
import { useTheme, type ThemePref } from '@/components/providers';

/**
 * Applies the theme saved on the profile (DECISIONS 40). localStorage stays the pre-paint cache, so a device that
 * already knows the choice never flashes; a new device paints its cached/default theme once, then switches here.
 * Null means the user never picked one in Settings, so the device keeps its own choice.
 */
export function ThemeSync({ theme }: { theme: ThemePref | null }) {
  const { theme: local, setTheme } = useTheme();
  useEffect(() => {
    if (theme && theme !== local) setTheme(theme);
    // Only when the saved value changes; a local change in Settings is persisted by the same click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
  return null;
}
