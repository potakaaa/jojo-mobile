import type { ColorSchemeName } from 'react-native';
import { useColorScheme as useOSColorScheme } from 'react-native';

import { useThemePreference } from '@/features/theme/theme-preference';

/**
 * Resolved app color scheme. Honors the persisted theme preference: an explicit
 * `'light'`/`'dark'` override wins; `'system'` (the default, incl. first launch)
 * follows the device's OS scheme. Every screen derives its `mode`/theme from this
 * hook, so this one resolver keeps the whole app consistent. See CLAUDE.md §Theming.
 */
export function useColorScheme(): ColorSchemeName {
  const preference = useThemePreference();
  const osScheme = useOSColorScheme();
  if (preference === 'light' || preference === 'dark') return preference;
  return osScheme ?? 'light';
}
