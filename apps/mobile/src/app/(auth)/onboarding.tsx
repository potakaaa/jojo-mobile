import { Button } from '@jojopotato/ui';
import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MASCOT_IMAGE } from '@/constants/images';
import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * First-run onboarding. "Get Started" marks onboarding complete and moves to
 * Login. A Terms link is reachable from here per the public-stack spec.
 */
// Breakpoint is about VERTICAL space, not width: SE-class devices are 667pt tall,
// so the screen gets cramped below ~700pt. The mascot is the one element that can
// shrink without losing meaning, so it flexes on short screens.
const MASCOT_SIZE = 148;
const MASCOT_SIZE_COMPACT = 112;
const COMPACT_HEIGHT = 700;

export default function OnboardingRoute() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { completeOnboarding } = useAuth();

  const { height } = useWindowDimensions();
  const compact = height < COMPACT_HEIGHT;
  const mascotSize = compact ? MASCOT_SIZE_COMPACT : MASCOT_SIZE;

  const onGetStarted = () => {
    completeOnboarding();
    router.push('/(auth)/login');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Image
            source={MASCOT_IMAGE}
            style={{ width: mascotSize, height: mascotSize }}
            contentFit="contain"
            transition={200}
            accessible={false}
          />
          <Text style={[styles.title, { color: theme.text }]}>Welcome to Jojo Potato</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Order ahead, pick up fast, earn rewards.
          </Text>
        </View>
        <View style={styles.footer}>
          <Button
            mode={mode}
            label="Get Started"
            onPress={onGetStarted}
            variant="primary"
            style={styles.cta}
          />
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
  cta: { width: '100%' },
  link: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall },
});
