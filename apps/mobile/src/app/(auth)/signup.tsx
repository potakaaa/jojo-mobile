import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/hooks/use-auth-session';
import { useTheme } from '@/hooks/use-theme';

/**
 * Mock signup shell (OTP / email-password UI is future work). Completing signup
 * calls the mocked `signIn()`, flipping the auth-state seam to `authenticated`;
 * the root `Stack.Protected` gate then swaps in the `(tabs)` shell.
 */
export default function SignupRoute() {
  const theme = useTheme();
  const { signIn } = useAuthSession();

  const onCreateAccount = () => {
    signIn({ id: 'mock-user', name: 'Jojo Fan', email: 'fan@jojopotato.ph' });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.text }]}>Create account</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            OTP / email sign-up is coming — this is a mocked shell.
          </Text>
        </View>
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={onCreateAccount}
            style={[styles.cta, { backgroundColor: theme.tint, borderColor: theme.border }]}
          >
            <Text style={[styles.ctaLabel, { color: theme.text }]}>Sign up</Text>
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
  title: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h1 },
  subtitle: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.body, textAlign: 'center' },
  footer: { gap: Spacing.two, paddingBottom: Spacing.four, alignItems: 'center' },
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
