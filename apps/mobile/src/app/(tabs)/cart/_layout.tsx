import { Stack } from 'expo-router';

/**
 * Order-flow top-level stack: cart → checkout → payment-method → confirmation.
 * Reached via `router.push('/(tabs)/cart')` — NOT a tab (not registered in any
 * `_layout.{ios,android,web}.tsx` Tabs list, and hidden from the custom
 * `FloatingTabBar` via its `ICONS` route allowlist, so it renders no tab button
 * and shows no tab as active).
 *
 * It lives here rather than inside the Order tab's stack so that opening it from
 * any tab is a SIBLING push on the Tabs navigator's own history — `router.back()`
 * and Android hardware back therefore return to the CALLING tab (Deals stays
 * Deals), and the Order tab is never left mounted on Cart (NAV-005).
 *
 * That last part is the whole reason for this move: while Cart lived inside the
 * Order tab's stack, "being on Cart" WAS "being in the Order tab", so returning
 * to Home while Cart stayed mounted left the Order tab stuck showing Cart —
 * residue by definition, not a back-handler bug. A route that belongs to no tab
 * cannot leave residue in one.
 *
 * WHY FOUR SCREENS LIVE IN ONE GROUP (the ownership rule, NAV-005): a tab's
 * nested Stack owns only its root plus screens reachable exclusively from that
 * root; anything reachable from two or more places lives above the tabs. Cart's
 * root is reachable from three places (Deals, the Order tab, reorder), so it
 * belongs here. `checkout` / `payment-method` / `confirmation` are reachable
 * ONLY from that root's own chain, so they correctly stay in this stack — which
 * also keeps the flow's back chain a real stack pop (checkout → back → cart),
 * not a history hop. Only the flow's ENTRY sits above the tabs.
 *
 * The native header is OFF: `index` is at position 0 of this stack, so React
 * Navigation renders no back button for it, and a custom control injected into
 * the native `headerLeft` slot cannot be given the right gap or left inset — the
 * native header owns that slot's layout. The screens instead render the shared
 * `<ScreenHeader>` from `@jojopotato/ui` in their own content, the same
 * in-content header the `(staff)`, `notifications`, and `tracking` screens use.
 * Each screen therefore owns its own top safe-area inset too.
 */
export default function CartStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
