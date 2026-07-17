import { Stack } from 'expo-router';

/**
 * Order tab nested stack. The tab-root (`index`) keeps `headerShown:false`
 * (it is framed by the tab bar).
 *
 * THIS TAB NOW OWNS ONLY ITS ROOT (NAV-005). Six screens used to be pushed
 * inside this stack — `product/[productId]`, `cart`, `checkout`,
 * `payment-method`, `confirmation/[orderId]`, and `history`. Every one of them
 * was reachable from OUTSIDE the Order tab (Home's product cards, Deals' Apply
 * button, Account's Order History link, the reorder hook), and that is precisely
 * what made them broken: while a screen lives in this stack, "being on that
 * screen" IS "being in the Order tab", so opening it from Home and pressing back
 * returned the user to Home while this tab stayed mounted on it — residue by
 * definition, not a back-handler bug.
 *
 * They now live in their own top-level route groups — `(tabs)/cart`,
 * `(tabs)/product`, `(tabs)/history` — as siblings of the tabs, owned by no tab,
 * exactly like `deals`, `notifications`, and `tracking`.
 *
 * THE RULE (do not re-add a pushed screen here without checking it): a tab's
 * nested Stack owns ONLY its root plus screens reachable EXCLUSIVELY from that
 * root. Anything reachable from two or more places belongs above the tabs.
 *
 * `index` keeps `headerShown:false` because it is framed by the tab bar. The
 * `screenOptions={{ headerShown: true }}` default is retained for any FUTURE
 * Order-tab-exclusive screen; such a screen should follow the NAV-003 convention
 * (opt into `headerShown:false` and render the shared in-content `<ScreenHeader>`
 * from `@jojopotato/ui`, owning its own top safe-area inset).
 */
export default function OrderStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
