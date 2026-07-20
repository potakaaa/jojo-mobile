import { describe, expect, it } from 'vitest';

import { resolveStatusBarStyle } from './status-bar';

/**
 * `expo-status-bar`'s `style` prop names the status-bar CONTENT color, so the
 * mapping INVERTS the app's surface scheme. Direction locked by the feasibility
 * probe (verdict: VIABLE) — an identity mapping would be the inverted bug the
 * probe ruled out (invisible icons in both themes), so these expectations must
 * never be "corrected" to match the input.
 */
describe('resolveStatusBarStyle', () => {
  const cases: { appScheme: 'light' | 'dark'; expected: 'light' | 'dark'; why: string }[] = [
    { appScheme: 'dark', expected: 'light', why: 'light content is readable on a dark surface' },
    { appScheme: 'light', expected: 'dark', why: 'dark content is readable on a light surface' },
  ];

  it.each(cases)(
    'maps app scheme "$appScheme" → status-bar style "$expected" ($why)',
    ({ appScheme, expected }) => {
      expect(resolveStatusBarStyle(appScheme)).toBe(expected);
    },
  );

  it('never returns its input (the mapping inverts, it does not pass through)', () => {
    for (const appScheme of ['light', 'dark'] as const) {
      expect(resolveStatusBarStyle(appScheme)).not.toBe(appScheme);
    }
  });
});
