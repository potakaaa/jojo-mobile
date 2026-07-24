import { router, useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

/**
 * Brand splash. After a short beat it routes into the public stack based on
 * whether onboarding has already been completed: first-time (cold, never
 * onboarded) users go to Onboarding; returning users who just logged out
 * (`hasOnboarded` persists across logout) skip straight to Login — matching the
 * plan decision that logout returns to Login, not the full Onboarding flow.
 */
export default function SplashRoute() {
  const theme = useTheme();
  const { hasOnboarded } = useAuth();

  // DEEP-LINK SAFETY: Splash is the `(auth)` stack's first route, so it still
  // mounts underneath when a deep link (e.g. `/magic-link`) opens the app. An
  // unconditional `router.replace` firing 600ms later would then replace the
  // magic-link screen with Login and silently kill the sign-in — the reported
  // "app opens straight to Login, never the card" bug.
  //
  // Focus (not a pathname string) is the correct signal: it is true exactly
  // when Splash is the screen the user is actually looking at. Gating the
  // effect on it means the timer is never armed while another screen owns the
  // stack, and — because `isFocused` is a dependency — it re-arms if Splash
  // ever becomes the active screen again. So this can never strand the user on
  // Splash with no pending navigation.
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) return;
    const timer = setTimeout(() => {
      router.replace(hasOnboarded ? '/(auth)/login' : '/(auth)/onboarding');
    }, 600);
    return () => clearTimeout(timer);
  }, [hasOnboarded, isFocused]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.wordmark, { color: theme.text }]}>Jojo Potato</Text>
      <ActivityIndicator color={theme.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  wordmark: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h1,
  },
});
