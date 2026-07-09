import { Stack } from 'expo-router';

/** Rewards tab nested stack. Root headerless; pushed screens get a native header. */
export default function RewardsStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="coupons" options={{ title: 'Coupons' }} />
    </Stack>
  );
}
