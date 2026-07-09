import { Stack } from 'expo-router';

/** Account tab nested stack. Root headerless; pushed screens get a native header. */
export default function AccountStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="help" options={{ title: 'Help' }} />
    </Stack>
  );
}
