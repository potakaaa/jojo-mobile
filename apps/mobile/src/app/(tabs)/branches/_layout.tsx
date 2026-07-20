import { Stack } from 'expo-router';

/**
 * Branches tab nested stack. Root (Branch Locator) headerless, framed by the tab bar.
 *
 * THIS TAB NOW OWNS ONLY ITS ROOT (NAV-005). The Branch Details screen
 * (`[branchId]`) used to be pushed inside this stack, but it is reachable from
 * BOTH this tab's list AND Home's branch cards — so opening it from Home and
 * pressing back returned the user to Home while this tab stayed mounted on
 * Branch Details (residue). It now lives at the top-level `(tabs)/branch/`
 * group — SINGULAR, because `branches` is this tab's own name and the path
 * cannot be reused. See `../branch/_layout.tsx`.
 *
 * THE RULE (do not re-add a pushed screen here without checking it): a tab's
 * nested Stack owns ONLY its root plus screens reachable EXCLUSIVELY from that
 * root. Anything reachable from two or more places belongs above the tabs.
 * See `../order/_layout.tsx` for the full rationale.
 */
export default function BranchesStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
