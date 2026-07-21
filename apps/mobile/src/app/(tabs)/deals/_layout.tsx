import { Stack } from 'expo-router';

/**
 * Deals nested stack. Reached via `router.push('/(tabs)/deals')` — NOT a tab
 * (not registered in any `_layout.{ios,android,web}.tsx` Tabs list, and hidden
 * from the custom `FloatingTabBar` via its route allowlist). The list root
 * (`index`) keeps `headerShown:false`; the pushed details screen is headerless
 * too (NAV-003) — it renders the shared in-content `<ScreenHeader>` and owns its
 * top safe-area inset. See `../order/_layout.tsx` for the full rationale.
 */
export default function DealsStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="deal/[dealId]" options={{ headerShown: false }} />
    </Stack>
  );
}
