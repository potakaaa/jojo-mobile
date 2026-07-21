import { Stack } from 'expo-router';

/**
 * Order Tracking top-level stack. Reached via `useNavigateToOrderTracking()`
 * (`@/features/orders/lib/navigate-to-tracking`) — NOT a tab (not registered in
 * any `_layout.{ios,android,web}.tsx` Tabs list, and hidden from the custom
 * `FloatingTabBar` via its `ICONS` route allowlist, so it renders no tab button
 * and shows no tab as active).
 *
 * It lives here rather than inside the Order tab's stack so that opening it from
 * any tab is a SIBLING push on the Tabs navigator's own history — `router.back()`
 * and Android hardware back therefore return to the CALLING tab (Home stays Home),
 * and the Order tab is never left mounted on Tracking (NAV-004).
 *
 * That last part is the whole reason for this move: while Tracking lived inside
 * the Order tab's stack, "being on Tracking" WAS "being in the Order tab", so
 * returning to Home while Tracking stayed mounted left the Order tab stuck showing
 * Tracking — residue by definition, not a back-handler bug. A route that belongs
 * to no tab cannot leave residue in one.
 *
 * The anchor (position 0 of this stack) is the STATIC `index` route, mirroring
 * `notifications/_layout.tsx`. That static-index anchor is precisely why the push
 * no longer doubles (NAV-005): a static-index anchor makes the push target resolve
 * to the `'tab'` navigator, so expo-router downgrades `PUSH`→`NAVIGATE` and no
 * duplicate anchor is created. (The previous NAV-004 shape anchored on the dynamic
 * `index` route's parametrized variant, which skipped that downgrade and opened
 * Tracking twice.)
 *
 * The native header is OFF: the static `index` is at position 0 of this stack, so
 * React Navigation renders no back button for it, and a custom control injected into
 * the native `headerLeft` slot cannot be given the right gap or left inset — the
 * native header owns that slot's layout. The screen instead renders the shared
 * `<ScreenHeader>` from `@jojopotato/ui` in its own content, the same in-content
 * header the `(staff)` and `notifications` screens use. The screen therefore owns
 * its own top safe-area inset too (see `./index.tsx`).
 */
export default function TrackingStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
