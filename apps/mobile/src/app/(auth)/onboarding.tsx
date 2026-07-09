import { Link, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/hooks/use-auth-session';
import { useTheme } from '@/hooks/use-theme';

/**
 * First-run onboarding. "Get Started" marks onboarding complete and moves to
 * Login. A Terms link is reachable from here per the public-stack spec.
 */
export default function OnboardingRoute() {
  const theme = useTheme();
  const { completeOnboarding } = useAuthSession();

  const onGetStarted = () => {
    completeOnboarding();
    router.push('/(auth)/login');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.text }]}>Welcome to Jojo Potato</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Order ahead, pick up fast, earn rewards.
          </Text>
        </View>
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={onGetStarted}
            style={[styles.cta, { backgroundColor: theme.tint, borderColor: theme.border }]}
          >
            <Text style={[styles.ctaLabel, { color: theme.text }]}>Get Started</Text>
          </Pressable>
          <Link href="/(auth)/terms" style={[styles.link, { color: theme.accent }]}>
            Terms &amp; Conditions
          </Link>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  title: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h1, textAlign: 'center' },
  subtitle: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.body, textAlign: 'center' },
  footer: { gap: Spacing.three, paddingBottom: Spacing.four, alignItems: 'center' },
  cta: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radii.lg,
    borderWidth: 2,
  },
  ctaLabel: { fontFamily: FontFamily.body.bold, fontSize: TypeScale.body },
  link: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall },
});
