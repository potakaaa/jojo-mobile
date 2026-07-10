import { Stack } from 'expo-router';

/**
 * Public / pre-auth stack: Splash → Onboarding → Login / Signup, plus Phone OTP
 * and Terms. Tab-root-style screens keep `headerShown:false`; `phone-otp` and
 * `terms` opt back into a native header (with the default back button) since
 * they are pushed on top.
 */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="splash" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="magic-link" />
      <Stack.Screen name="phone-otp" options={{ headerShown: true, title: 'Phone sign-in' }} />
      <Stack.Screen name="terms" options={{ headerShown: true, title: 'Terms & Conditions' }} />
    </Stack>
  );
}
