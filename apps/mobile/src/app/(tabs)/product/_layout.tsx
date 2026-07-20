import { Stack } from 'expo-router';

/**
 * Product Details top-level stack. Reached via
 * `router.push('/(tabs)/product/[productId]')` — NOT a tab (not registered in any
 * `_layout.{ios,android,web}.tsx` Tabs list, and hidden from the custom
 * `FloatingTabBar` via its `ICONS` route allowlist, so it renders no tab button
 * and shows no tab as active).
 *
 * It lives here rather than inside the Order tab's stack so that opening it from
 * any tab is a SIBLING push on the Tabs navigator's own history — `router.back()`
 * and Android hardware back therefore return to the CALLING tab (Home stays
 * Home), and the Order tab is never left mounted on Product Details (NAV-005).
 *
 * Product Details is reachable from BOTH the Home tab's product cards and the
 * Order tab's menu, which is exactly what the ownership rule says must live
 * above the tabs: a tab's nested Stack owns only its root plus screens reachable
 * exclusively from that root.
 *
 * The native header is OFF: `[productId]` is at position 0 of this stack, so
 * React Navigation renders no back button for it, and a custom control injected
 * into the native `headerLeft` slot cannot be given the right gap or left inset.
 * The screen instead renders the shared `<ScreenHeader>` from `@jojopotato/ui`
 * in its own content and owns its own top safe-area inset (see `./[productId].tsx`).
 */
export default function ProductStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
