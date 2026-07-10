import { Button, Card, GoogleButton, Input } from '@jojopotato/ui';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { FontFamily, Palette, Spacing, TypeScale } from '@/constants/theme';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { MASCOT_IMAGE } from '@/constants/images';

/**
 * Real login screen backed by better-auth. The passwordless magic link is the
 * default / primary sign-in path, with "Continue with Google" (OAuth) as the
 * alternative. Phone OTP exists on its own screen (`(auth)/phone-otp.tsx`) but
 * is not linked from here yet. All form controls come from the shared
 * `@jojopotato/ui` kit.
 */
// Breakpoint is about VERTICAL space, not width: SE-class devices are 667pt tall,
// so the screen gets cramped below ~700pt. The mascot is the one element that can
// shrink without losing meaning, so it (and the top padding) flex on short screens.
const MASCOT_SIZE = 148;
const MASCOT_SIZE_COMPACT = 112;
const COMPACT_HEIGHT = 700;

export default function LoginRoute() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { signIn } = useAuth();

  const { height } = useWindowDimensions();
  const compact = height < COMPACT_HEIGHT;
  const mascotSize = compact ? MASCOT_SIZE_COMPACT : MASCOT_SIZE;

  const [email, setEmail] = useState('');
  const [pending, setPending] = useState<'magic-link' | 'google' | null>(null);
  const [error, setError] = useState<string>();
  const [magicSent, setMagicSent] = useState(false);

  const busy = pending !== null;

  const run = async (action: 'magic-link' | 'google', input: Parameters<typeof signIn>[0]) => {
    setPending(action);
    setError(undefined);
    const result = await signIn(input);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
    }
    return result;
  };

  const onChangeEmail = (value: string) => {
    setEmail(value);
    setError(undefined);
    setMagicSent(false);
  };

  const onGoogle = () => run('google', { method: 'google' });

  const onMagicLink = async () => {
    setMagicSent(false);
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email address');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError('Enter a valid email address');
      return;
    }
    const result = await run('magic-link', { method: 'magic-link', email: trimmed });
    if (result.ok) {
      setMagicSent(true);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/*
          iOS needs `padding` to lift the form above the keyboard. Android's default
          windowSoftInputMode is `adjustResize`, which already resizes the window —
          adding a behavior on top of that double-compensates and causes jitter.
        */}
        <KeyboardAvoidingView
          style={styles.avoider}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scroll,
              { paddingTop: compact ? Spacing.five : Spacing.six },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.header}>
              <Image
                source={MASCOT_IMAGE}
                style={{ width: mascotSize, height: mascotSize }}
                contentFit="contain"
                accessibilityLabel="Jojo mascot"
                transition={200}
                accessible={false}
              />
              <Text style={[styles.title, { color: theme.text }]}>Log in</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Welcome back to Jojo Potato.
              </Text>
            </View>

            <Card mode={mode}>
              <View style={styles.form}>
                <Input
                  mode={mode}
                  label="Email"
                  placeholder="you@example.com"
                  value={email}
                  onChangeText={onChangeEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!busy}
                />
                <Button
                  mode={mode}
                  label="Email me a magic link"
                  onPress={onMagicLink}
                  disabled={busy}
                  loading={pending === 'magic-link'}
                />
              </View>
            </Card>

            <View style={styles.status}>
              {error ? (
                <Text accessibilityRole="alert" style={[styles.error, { color: theme.accent }]}>
                  {error}
                </Text>
              ) : magicSent ? (
                <Text style={[styles.notice, { color: Palette.green }]}>
                  Check your email for a sign-in link.
                </Text>
              ) : null}
            </View>

            <View style={styles.alt}>
              <GoogleButton
                mode={mode}
                onPress={onGoogle}
                disabled={busy}
                loading={pending === 'google'}
              />

              {/*
              Phone OTP is implemented (`(auth)/phone-otp.tsx`) and still routed, but is
              intentionally not linked here: SMS delivery is a server-side stub that logs
              the code instead of texting it. Restore this button once an SMS vendor is
              wired up.

              <Button
                mode={mode}
                variant="outline"
                label="Sign in with phone number"
                onPress={() => router.push('/(auth)/phone-otp')}
                disabled={busy}
              />
            */}
            </View>

            <View style={styles.footer}>
              <Link href="/(auth)/terms" style={[styles.link, { color: theme.accent }]}>
                Terms &amp; Conditions
              </Link>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  avoider: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  header: { alignItems: 'center', gap: Spacing.one },
  title: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h1 },
  subtitle: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.body, textAlign: 'center' },
  form: { gap: Spacing.three },
  alt: { gap: Spacing.two },
  status: { alignItems: 'center' },
  notice: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
    textAlign: 'center',
  },
  error: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
    textAlign: 'center',
  },
  footer: { gap: Spacing.two, alignItems: 'center' },
  link: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall },
});
