import { Stack } from 'expo-router';

/**
 * Account tab nested stack. Root headerless; pushed screens are headerless too
 * (NAV-003) — they render the shared in-content `<ScreenHeader>` and own their
 * top safe-area inset. See `../order/_layout.tsx` for the full rationale.
 */
export default function AccountStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
      <Stack.Screen name="help" options={{ headerShown: false }} />
    </Stack>
  );
}
