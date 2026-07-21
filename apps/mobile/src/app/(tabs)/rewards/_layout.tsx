import { Stack } from 'expo-router';

/**
 * Rewards tab nested stack. Only the unified rewards index — the coupons-wallet
 * screen was removed (redemption is now a silent tap on the index that applies
 * the reward coupon and opens the cart).
 */
export default function RewardsStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
