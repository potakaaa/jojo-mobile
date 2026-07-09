import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/hooks/use-auth-session';
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
  const { hasOnboarded } = useAuthSession();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace(hasOnboarded ? '/(auth)/login' : '/(auth)/onboarding');
    }, 600);
    return () => clearTimeout(timer);
  }, [hasOnboarded]);

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
