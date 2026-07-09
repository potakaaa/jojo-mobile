import { Stack } from 'expo-router';

/**
 * Public / pre-auth stack: Splash → Onboarding → Login / Signup, plus Terms.
 * Tab-root-style screens keep `headerShown:false`; `terms` opts back into a
 * native header (with the default back button) since it is pushed on top.
 */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="splash" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="terms" options={{ headerShown: true, title: 'Terms & Conditions' }} />
    </Stack>
  );
}
