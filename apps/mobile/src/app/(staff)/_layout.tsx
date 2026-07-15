import { Stack } from 'expo-router';

/**
 * Staff shell stack (STAFF-001). No auth check here — the root `_layout.tsx`
 * `Stack.Protected` gate is the single source of truth for who reaches this
 * group. Screens render their own compact brand header (matching the shell),
 * so the native header stays off across the group.
 */
export default function StaffLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="active-orders" options={{ headerShown: false }} />
      <Stack.Screen name="order-detail/[orderId]" options={{ headerShown: false }} />
      <Stack.Screen name="completed-orders" options={{ headerShown: false }} />
      <Stack.Screen name="product-availability" options={{ headerShown: false }} />
      <Stack.Screen name="branch-pickup-settings" options={{ headerShown: false }} />
    </Stack>
  );
}
