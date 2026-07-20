import { Stack } from 'expo-router';

/**
 * Branch Details top-level stack. Reached via `useNavigateToBranch()`
 * (`@/features/branches/lib/navigate-to-branch`) — NOT a tab (not registered in any
 * `_layout.{ios,android,web}.tsx` Tabs list, and hidden from the custom
 * `FloatingTabBar` via its `ICONS` route allowlist, so it renders no tab button
 * and shows no tab as active).
 *
 * ⚠️ SINGULAR `branch/` — DELIBERATELY DISTINCT FROM THE `branches` TAB. Do NOT
 * merge this folder back into `(tabs)/branches/`. Two reasons, both hard:
 *
 *   1. `branches` is a TAB name (registered as a `Tabs.Screen` and present in
 *      `FloatingTabBar`'s `ICONS` allowlist). A moved screen cannot reuse that
 *      folder — the path is already owned by the tab.
 *   2. Branch Details is reachable from BOTH the Home tab's branch cards and the
 *      Branches tab's list. Under the ownership rule (NAV-005) — a tab's nested
 *      Stack owns only its root plus screens reachable exclusively from that root
 *      — a screen with two or more entry points MUST live above the tabs. Moving
 *      it back inside the Branches tab would strand that tab on Branch Details
 *      whenever it is opened from Home, reviving the exact residue bug NAV-005
 *      exists to kill (reported by the user three times: NAV-002, NAV-004, NAV-005).
 *
 * Being a sibling of the tabs is what makes `router.back()` and Android hardware
 * back return to the CALLING tab (Home stays Home) instead of leaving the
 * Branches tab mounted on a screen the user already left.
 *
 * The anchor (position 0 of this stack) is the STATIC `index` route, mirroring
 * `tracking/_layout.tsx`. That static-index anchor is precisely why the push no
 * longer doubles (NAV-006): a static-index anchor makes the push target resolve
 * to the `'tab'` navigator, so expo-router downgrades `PUSH`→`NAVIGATE` and no
 * duplicate anchor is created. (The previous shape anchored on the dynamic
 * `[branchId]` route, which skipped that downgrade and opened Branch Details
 * twice when two different branches were opened in sequence.)
 *
 * The native header is OFF: the static `index` is at position 0 of this stack, so
 * React Navigation renders no back button for it, and a custom control injected
 * into the native `headerLeft` slot cannot be given the right gap or left inset.
 * The screen instead renders the shared `<ScreenHeader>` from `@jojopotato/ui` in
 * its own content and owns its own top safe-area inset (see `./index.tsx`).
 */
export default function BranchStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
