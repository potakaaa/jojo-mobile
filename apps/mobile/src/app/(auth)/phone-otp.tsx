import { Button, Card, Input } from '@jojopotato/ui';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Two-step phone OTP sign-in / sign-up. Step 1 collects a phone number and
 * requests a code; step 2 reveals a code field and verifies it. Verifying a new
 * number provisions the account + session server-side (better-auth
 * `signUpOnVerification`). SMS delivery is currently a server-side stub (the
 * code is logged, not texted) — the full flow is still exercised end-to-end.
 */
export default function PhoneOtpRoute() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { signIn } = useAuth();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const onSendCode = async () => {
    setBusy(true);
    setError(undefined);
    const result = await signIn({ method: 'phone-send', phoneNumber });
    setBusy(false);
    if (result.ok) {
      setCodeSent(true);
    } else {
      setError(result.error);
    }
  };

  const onVerify = async () => {
    setBusy(true);
    setError(undefined);
    const result = await signIn({ method: 'phone-verify', phoneNumber, code });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
    }
    // On success the session updates and the root gate swaps to the tabs shell.
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>
              {codeSent ? 'Enter your code' : 'Sign in with phone'}
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {codeSent
                ? `We sent a code to ${phoneNumber}.`
                : 'We’ll text you a one-time code.'}
            </Text>
          </View>

          <Card mode={mode}>
            <View style={styles.form}>
              <Input
                mode={mode}
                label="Phone number"
                placeholder="+1 555 000 0000"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                autoCapitalize="none"
                editable={!busy && !codeSent}
                error={!codeSent ? error : undefined}
              />
              {codeSent ? (
                <Input
                  mode={mode}
                  label="Code"
                  placeholder="123456"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  editable={!busy}
                  error={error}
                />
              ) : null}

              {codeSent ? (
                <Button
                  mode={mode}
                  label="Verify code"
                  onPress={onVerify}
                  disabled={busy || code.length === 0}
                />
              ) : (
                <Button
                  mode={mode}
                  label="Send code"
                  onPress={onSendCode}
                  disabled={busy || phoneNumber.length === 0}
                />
              )}
            </View>
          </Card>

          {codeSent ? (
            <Text
              accessibilityRole="link"
              onPress={() => {
                setCodeSent(false);
                setCode('');
                setError(undefined);
              }}
              style={[styles.link, { color: theme.accent }]}
            >
              Use a different number
            </Text>
          ) : null}
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
  title: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h1, textAlign: 'center' },
  subtitle: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.body, textAlign: 'center' },
  form: { gap: Spacing.three },
  link: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall, textAlign: 'center' },
});
