import { Stack } from 'expo-router';

/**
 * Rewards tab nested stack. Root headerless; the pushed Coupons screen is
 * headerless too (NAV-003) — it renders the shared in-content `<ScreenHeader>`
 * (via `<ComingSoon onBack>`) and owns its top safe-area inset. See
 * `../order/_layout.tsx` for the full rationale.
 */
export default function RewardsStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="coupons" options={{ headerShown: false }} />
    </Stack>
  );
}
