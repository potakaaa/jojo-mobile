/**
 * Derives the `expo-status-bar` `style` prop from the app's RESOLVED color scheme.
 *
 * `expo-status-bar`'s `style` prop names the status-bar CONTENT color, not the
 * surface color — its own JSDoc says "if your app is dark mode, the style will be
 * `light`", and its `styleToBarStyle()` maps `'light'` → React Native's
 * `'light-content'`. So the mapping is an INVERSION of the surface scheme:
 *
 *   - app is dark  → `'light'` content (light icons/text, readable on a dark surface)
 *   - app is light → `'dark'`  content (dark icons/text, readable on a light surface)
 *
 * This is the same branch `<StatusBar style="auto" />` already computes internally.
 * The bug it fixes is the SCHEME SOURCE, not the direction: `"auto"` resolves the
 * scheme from React Native's raw OS `useColorScheme()`, ignoring the app's persisted
 * theme preference. Passing an explicit style derived from `@/hooks/use-color-scheme`
 * makes the status bar follow the app's resolved theme instead of the device's.
 *
 * Mapping direction is LOCKED by the feasibility probe (verdict: VIABLE) — see
 * `process/general-plans/active/mobile-dark-mode-audit_17-07-26/
 * mobile-dark-mode-audit_FEASIBILITY_17-07-26.md`. Do not invert it to an identity
 * mapping: that would render dark-on-dark / light-on-light content, i.e. invisible
 * status-bar icons in BOTH themes.
 *
 * Takes no OS-scheme parameter by design — the OS scheme never enters this
 * derivation; the caller passes the app's already-resolved scheme.
 */
export function resolveStatusBarStyle(appScheme: 'light' | 'dark'): 'light' | 'dark' {
  return appScheme === 'dark' ? 'light' : 'dark';
}
