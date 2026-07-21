import { Stack } from 'expo-router';

/**
 * Terms and Conditions top-level stack. Reached via `router.push('/(tabs)/terms')`
 * (from Help) — NOT a tab (not registered in any `_layout.{ios,android,web}.tsx`
 * Tabs list, and hidden from the custom `FloatingTabBar` via its `ICONS` route
 * allowlist, so it renders no tab button and shows no tab as active).
 *
 * It lives here rather than inside the Account tab's stack so that opening it from
 * any tab is a SIBLING push on the Tabs navigator's own history — `router.back()`
 * and Android hardware back therefore return to the CALLING tab (Account stays
 * Account), instead of nesting Terms inside one tab. It mirrors the same pattern
 * as `(tabs)/notifications` and `(tabs)/history`, and (post-AMENDMENT-1 split)
 * renders Terms-and-Conditions-only content — see the sibling `(tabs)/privacy`
 * stack for Privacy Policy (both draw from the shared `features/legal` content).
 *
 * The native header is OFF: `index` is at position 0 of this stack, so React
 * Navigation renders no back button for it. The screen instead renders the shared
 * `<ScreenHeader>` from `@jojopotato/ui` in its own content and owns its own top
 * safe-area inset (see `./index.tsx`).
 */
export default function TermsStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
