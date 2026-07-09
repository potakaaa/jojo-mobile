import { Card } from '@jojopotato/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { authClient } from '@/features/auth/lib/auth-client';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

type Phase = 'verifying' | 'error';

/**
 * Magic-link landing screen. The server's `/magic-link/native` redirect bounces
 * the raw token into the app here (`jojopotato:///magic-link?token=...`) WITHOUT
 * verifying it server-side. We complete verification THROUGH `authClient` so the
 * expo client captures the `Set-Cookie` response and stores the session in
 * SecureStore itself — the fix for @better-auth/expo issue #6936, where a link
 * clicked in an external email app opens the app but never lands the session.
 *
 * On success the session updates and the root `RootNavigator` gate flips to the
 * `(tabs)` shell on its own — this screen just kicks off verification and shows
 * progress. On failure it offers a route back to login.
 */
export default function MagicLinkRoute() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [phase, setPhase] = useState<Phase>('verifying');
  const [error, setError] = useState<string>();
  // Guard against a double-run (React strict mode / param re-render) verifying
  // the same single-use token twice.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    // All state updates happen inside this async task, never synchronously in
    // the effect body (avoids cascading renders / the set-state-in-effect lint).
    void (async () => {
      if (!token) {
        setError('This sign-in link is missing its token. Request a new link.');
        setPhase('error');
        return;
      }
      // Route the verify through `authClient` (NOT a bare fetch) so the expo
      // client's response handler stores the session cookie.
      const { error: verifyError } = await authClient.magicLink.verify({
        query: { token },
      });
      if (verifyError) {
        setError(verifyError.message ?? 'This sign-in link is invalid or has expired.');
        setPhase('error');
      }
      // On success: do nothing here — the session updates and the root gate
      // swaps this stack out for the `(tabs)` shell.
    })();
  }, [token]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Card mode={mode}>
            <View style={styles.card}>
              {phase === 'verifying' ? (
                <>
                  <ActivityIndicator color={theme.accent} />
                  <Text style={[styles.title, { color: theme.text }]}>Signing you in…</Text>
                  <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                    Finishing your magic-link sign-in.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.title, { color: theme.text }]}>Sign-in failed</Text>
                  <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{error}</Text>
                  <Text
                    accessibilityRole="link"
                    onPress={() => router.replace('/(auth)/login')}
                    style={[styles.link, { color: theme.accent }]}
                  >
                    Back to log in
                  </Text>
                </>
              )}
            </View>
          </Card>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: Spacing.four },
  card: { alignItems: 'center', gap: Spacing.two },
  title: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h2, textAlign: 'center' },
  subtitle: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.body, textAlign: 'center' },
  link: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall, textAlign: 'center' },
});
