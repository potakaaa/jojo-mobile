import { Button, Card, GoogleButton, Input } from '@jojopotato/ui';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Real login screen backed by better-auth. Offers three entry points per the
 * task's requirements: email + password, "Continue with Google" (OAuth), and a
 * passwordless magic link. Phone OTP lives on its own screen. All form controls
 * come from the shared `@jojopotato/ui` kit.
 */
export default function LoginRoute() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [magicSent, setMagicSent] = useState(false);

  const run = async (input: Parameters<typeof signIn>[0]) => {
    setBusy(true);
    setError(undefined);
    const result = await signIn(input);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
    }
    return result;
  };

  const onEmailLogin = () => run({ method: 'email', email, password });
  const onGoogle = () => run({ method: 'google' });
  const onMagicLink = async () => {
    const result = await run({ method: 'magic-link', email });
    if (result.ok) {
      setMagicSent(true);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
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
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!busy}
              />
              <Input
                mode={mode}
                label="Password"
                placeholder="Your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                editable={!busy}
                error={error}
              />
              <Button mode={mode} label="Log in" onPress={onEmailLogin} disabled={busy} />
            </View>
          </Card>

          {magicSent ? (
            <Text style={[styles.notice, { color: theme.accent }]}>
              Check your email for a sign-in link.
            </Text>
          ) : null}

          <View style={styles.alt}>
            <GoogleButton mode={mode} onPress={onGoogle} disabled={busy} />
            <Button
              mode={mode}
              variant="outline"
              label="Email me a magic link"
              onPress={onMagicLink}
              disabled={busy || email.length === 0}
            />
            <Button
              mode={mode}
              variant="outline"
              label="Use phone number"
              onPress={() => router.push('/(auth)/phone-otp')}
              disabled={busy}
            />
          </View>

          <View style={styles.footer}>
            <Text
              accessibilityRole="link"
              onPress={() => router.push('/(auth)/signup')}
              style={[styles.link, { color: theme.accent }]}
            >
              Create an account
            </Text>
            <Link href="/(auth)/terms" style={[styles.link, { color: theme.accent }]}>
              Terms &amp; Conditions
            </Link>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', gap: Spacing.four, padding: Spacing.four },
  header: { alignItems: 'center', gap: Spacing.one },
  title: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h1 },
  subtitle: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.body, textAlign: 'center' },
  form: { gap: Spacing.three },
  alt: { gap: Spacing.two },
  notice: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall, textAlign: 'center' },
  footer: { gap: Spacing.two, alignItems: 'center' },
  link: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall },
});
