import { Stack } from 'expo-router';

/**
 * Notifications top-level stack. Reached via `router.push('/(tabs)/notifications')`
 * — NOT a tab (not registered in any `_layout.{ios,android,web}.tsx` Tabs list, and
 * hidden from the custom `FloatingTabBar` via its `ICONS` route allowlist, so it
 * renders no tab button and shows no tab as active).
 *
 * It lives here rather than inside the Account tab's stack so that opening it from
 * any tab is a SIBLING push on the Tabs navigator's own history — `router.back()`
 * and Android hardware back therefore return to the CALLING tab (Home stays Home),
 * instead of stranding the user on Account (NAV-002).
 *
 * The native header is OFF: `index` is at position 0 of this stack, so React
 * Navigation renders no back button for it, and a custom control injected into the
 * native `headerLeft` slot cannot be given the right gap or left inset — the native
 * header owns that slot's layout. The screen instead renders the shared
 * `<ScreenHeader>` from `@jojopotato/ui` in its own content, the same in-content
 * header the `(staff)` screens use. The screen therefore owns its top safe-area
 * inset too (see `./index.tsx`).
 */
export default function NotificationsStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
