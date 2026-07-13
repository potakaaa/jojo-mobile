import { Stack } from 'expo-router';

/**
 * Staff shell stack (STAFF-001). No auth check here — the root `_layout.tsx`
 * `Stack.Protected` gate is the single source of truth for who reaches this
 * group. Future STAFF-002/003/004 screens mount as siblings and may override
 * `headerShown` per screen.
 */
export default function StaffLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* MOCK PREVIEW — remove/replace when STAFF-002 lands */}
      <Stack.Screen name="active-orders" options={{ headerShown: true, title: 'Active Orders' }} />
    </Stack>
  );
}
