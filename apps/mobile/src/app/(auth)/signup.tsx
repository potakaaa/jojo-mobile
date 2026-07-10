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
 * Real signup screen backed by better-auth: email + password account creation,
 * plus "Continue with Google". Phone OTP signup lives on its own screen. Client-side
 * validation (name/email/password/confirm-password) runs before hitting the server. On
 * success the better-auth session flips the root gate into the `(tabs)` shell.
 * All form controls come from the shared `@jojopotato/ui` kit.
 */
interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}
export default function SignupRoute() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { signIn } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const run = async (input: Parameters<typeof signIn>[0]) => {
    setBusy(true);
    setError(undefined);
    const result = await signIn(input);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
    }
  };

  const onCreateAccount = () => {
    setFieldErrors({});
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    const errors: FieldErrors = {};
    if (!trimmedName) {
      errors.name = 'Enter your name';
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      errors.email = 'Enter a valid email address';
    }
    if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    if (confirmPassword !== password) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    run({ method: 'email-signup', email: trimmedEmail, password, name: trimmedName });
  };
  const onGoogle = () => run({ method: 'google' });

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Create account</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Join Jojo Potato to order ahead and earn rewards.
            </Text>
          </View>

          <Card mode={mode}>
            <View style={styles.form}>
              <Input
                mode={mode}
                label="Name"
                placeholder="Your name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                editable={!busy}
                error={fieldErrors.name}
              />
              <Input
                mode={mode}
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!busy}
                error={fieldErrors.email}
              />
              <Input
                mode={mode}
                label="Password"
                placeholder="Create a password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                editable={!busy}
                error={fieldErrors.password ?? error}
              />
              <Input
                mode={mode}
                label="Confirm password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                editable={!busy}
                error={fieldErrors.confirmPassword}
              />
              <Button mode={mode} label="Sign up" onPress={onCreateAccount} disabled={busy} />
            </View>
          </Card>

          <View style={styles.alt}>
            <GoogleButton mode={mode} onPress={onGoogle} disabled={busy} />
            <Button
              mode={mode}
              variant="outline"
              label="Sign up with phone number"
              onPress={() => router.push('/(auth)/phone-otp')}
              disabled={busy}
            />
          </View>

          <View style={styles.footer}>
            <Text
              accessibilityRole="link"
              onPress={() => router.push('/(auth)/login')}
              style={[styles.link, { color: theme.accent }]}
            >
              I already have an account
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
  footer: { gap: Spacing.two, alignItems: 'center' },
  link: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall },
});
