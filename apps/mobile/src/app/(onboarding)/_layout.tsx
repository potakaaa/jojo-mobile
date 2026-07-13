import { Stack } from 'expo-router';

/**
 * Post-auth account onboarding stack. Mounted (via `Stack.Protected` in the root
 * `_layout.tsx`) only for an authenticated user who has not yet completed their
 * profile (`onboardedAt == null`). A single `index` screen drives the 3-step
 * flow (2 skippable previews → 1 required info form) with internal step state.
 */
export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
