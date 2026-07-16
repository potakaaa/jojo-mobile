import { useEffect, useState } from 'react';
import type { ColorSchemeName } from 'react-native';
import { useColorScheme as useOSColorScheme } from 'react-native';

import { useThemePreference } from '@/features/theme/theme-preference';

/**
 * Resolved app color scheme (web). Mirrors the native hook — an explicit
 * `'light'`/`'dark'` preference wins, `'system'` follows the OS — but defers the
 * OS read until after hydration so static/SSR web output ('light') doesn't cause
 * a hydration mismatch. See CLAUDE.md §Theming.
 */
export function useColorScheme(): ColorSchemeName {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasHydrated(true);
  }, []);

  const preference = useThemePreference();
  const osScheme = useOSColorScheme();

  if (preference === 'light' || preference === 'dark') return preference;
  if (hasHydrated) return osScheme ?? 'light';
  return 'light';
}
