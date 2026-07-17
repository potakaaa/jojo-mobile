import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Text } from 'react-native';

import { setThemePreference } from '@/features/theme/theme-preference';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { renderWithProviders } from '@/test-utils/render';

/**
 * AC8 (partial) — the app's theme resolver against the OS-reported scheme.
 *
 * PROVEN HERE: the resolution rules that are OUR code —
 *   - preference `'system'` follows whatever the OS reports (incl. dark);
 *   - an explicit `'light'`/`'dark'` preference overrides the OS;
 *   - a null/unknown OS scheme falls back to light.
 * The OS scheme is driven by overriding react-native's `useColorScheme` (the
 * exact source `use-color-scheme.ts` consumes), so these assert the real
 * resolver against a real range of OS inputs.
 *
 * KNOWN GAP — the live listener half of AC8 ("System picks up an OS theme change
 * on resume") is NOT provable under jest-expo. Empirically verified 17-07-26:
 *   1. jest-expo stubs `Appearance` to a no-op — `setColorScheme()` does nothing,
 *      `getColorScheme()` stays `null`, and `addChangeListener` callbacks never
 *      fire (probed directly: zero events emitted).
 *   2. jest-expo's `useColorScheme` mock reads `Appearance.getColorScheme()` but
 *      never calls `addChangeListener` at all (probed by mocking RN's internal
 *      `Libraries/Utilities/Appearance`: the getter was read, the subscribe hook
 *      never was). It is non-reactive by construction.
 *   3. Substituting a reactive `useSyncExternalStore`-backed `useColorScheme`
 *      does supply the initial value, but change notifications produce no
 *      re-render under this preset.
 * Mocking `Appearance.addChangeListener` cannot help: the consumer that would
 * subscribe to it is itself replaced by a non-subscribing stub. Proving the live
 * flip needs a real device/emulator — it is tracked as an Agent-Probe residual,
 * NOT claimed as automated coverage here.
 */

/** Mutable stand-in for the OS-reported scheme, read fresh on each render. */
const mockOs = { scheme: 'light' as string | null };

jest.mock('react-native', () => {
  // Mutate the real module rather than spreading it: spreading the RN index
  // touches its deprecation getters (ProgressBarAndroid/SafeAreaView) and breaks
  // the suite outright.
  const actual = jest.requireActual<Record<string, unknown>>('react-native');
  Object.defineProperty(actual, 'useColorScheme', {
    configurable: true,
    get: () => () => mockOs.scheme,
  });
  return actual;
});

/** Probe component: renders whatever the app's resolver currently returns. */
function SchemeProbe() {
  const scheme = useColorScheme();
  return <Text testID="scheme">{String(scheme)}</Text>;
}

beforeEach(() => {
  setThemePreference('system');
  mockOs.scheme = 'light';
});

afterEach(() => {
  setThemePreference('system');
});

describe('useColorScheme — resolves OS scheme vs user preference (AC8, partial)', () => {
  test('preference "system" follows a dark OS scheme', async () => {
    mockOs.scheme = 'dark';

    const { getByTestId } = await renderWithProviders(<SchemeProbe />);

    expect(getByTestId('scheme').props.children).toBe('dark');
  });

  test('preference "system" follows a light OS scheme', async () => {
    mockOs.scheme = 'light';

    const { getByTestId } = await renderWithProviders(<SchemeProbe />);

    expect(getByTestId('scheme').props.children).toBe('light');
  });

  test('an explicit "light" preference overrides a dark OS scheme', async () => {
    mockOs.scheme = 'dark';
    setThemePreference('light');

    const { getByTestId } = await renderWithProviders(<SchemeProbe />);

    expect(getByTestId('scheme').props.children).toBe('light');
  });

  test('an explicit "dark" preference overrides a light OS scheme', async () => {
    mockOs.scheme = 'light';
    setThemePreference('dark');

    const { getByTestId } = await renderWithProviders(<SchemeProbe />);

    expect(getByTestId('scheme').props.children).toBe('dark');
  });

  test('an unknown OS scheme falls back to light under the system preference', async () => {
    mockOs.scheme = null;

    const { getByTestId } = await renderWithProviders(<SchemeProbe />);

    expect(getByTestId('scheme').props.children).toBe('light');
  });
});
