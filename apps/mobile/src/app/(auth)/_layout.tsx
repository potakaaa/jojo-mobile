import { Stack } from 'expo-router';

/**
 * Public / pre-auth stack: Splash → Onboarding → Login, plus Magic Link, Phone
 * OTP and Terms. Tab-root-style screens keep `headerShown:false`; `phone-otp`
 * and `terms` opt back into a native header (with the default back button)
 * since they are pushed on top. `phone-otp` is retained here (kept for future
 * use) but is currently unlinked — no screen navigates to it yet.
 */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="splash" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="login" />
      <Stack.Screen name="magic-link" />
      <Stack.Screen name="invite-accept" />
      <Stack.Screen name="phone-otp" options={{ headerShown: true, title: 'Phone sign-in' }} />
      <Stack.Screen name="terms" options={{ headerShown: true, title: 'Terms & Privacy' }} />
    </Stack>
  );
}
