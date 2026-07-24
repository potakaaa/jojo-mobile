import { Card } from '@jojopotato/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { env } from '@/config/env';
import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { authClient } from '@/features/auth/lib/auth-client';
import { apiRequest } from '@/features/shared/lib/api-request';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

type Phase = 'verifying' | 'error';

/**
 * Staff-invite accept landing screen (ADM-011). The server's `/staff-invite/native`
 * redirect bounces the raw invite token here (`jojopotato:///invite-accept?token=...`).
 * Three chained steps, all kept under a single "signing you in…" loading phase:
 *   1. POST /staff-invite/start (unauthenticated) → a minted magic-link token
 *   2. authClient.magicLink.verify → lands a real session in SecureStore (role still
 *      'customer' at this instant)
 *   3. POST /staff-invite/consume (session-carrying) → applies the invite's stored
 *      role/branch, then `router.replace('/(staff)')`
 *
 * The screen stays in `'verifying'` across BOTH the verify AND the consume step (never
 * a success state after verify alone). It cannot stop the root `Stack.Protected` gate
 * from re-evaluating the instant the session updates — that gate lives in a different
 * component — but keeping this screen honest plus the explicit `router.replace` after
 * consume corrects any transient wrong-shell flash. (The consume promise completes even
 * if this screen unmounts mid-flight; JS promise chains are not cancelled by unmount.)
 */
export default function InviteAcceptRoute() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [phase, setPhase] = useState<Phase>('verifying');
  const [error, setError] = useState<string>();
  // Guard against a double-run (React strict mode / param re-render) consuming the
  // same single-use token twice.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    void (async () => {
      if (!token) {
        setError('This invite link is missing its token. Ask for a new invite.');
        setPhase('error');
        return;
      }

      // Step 1 — start (unauthenticated plain fetch): validate the invite + mint a
      // magic-link token for the invited email.
      let magicLinkToken: string;
      try {
        const res = await fetch(`${env.apiUrl}/staff-invite/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
          },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          setError('This invite is invalid, expired, or has already been used.');
          setPhase('error');
          return;
        }
        const body = (await res.json()) as { magicLinkToken?: string };
        if (!body.magicLinkToken) {
          setError('Something went wrong accepting your invite. Please try again.');
          setPhase('error');
          return;
        }
        magicLinkToken = body.magicLinkToken;
      } catch {
        setError('Could not reach the server. Check your connection and try again.');
        setPhase('error');
        return;
      }

      // Step 2 — verify through authClient so the expo client stores the session
      // cookie in SecureStore itself (same @better-auth/expo #6936 workaround as
      // magic-link.tsx).
      const { error: verifyError } = await authClient.magicLink.verify({
        query: { token: magicLinkToken },
      });
      if (verifyError) {
        setError(verifyError.message ?? 'This invite link is invalid or has expired.');
        setPhase('error');
        return;
      }

      // Step 3 — consume (session now carried by apiRequest): apply the invite's
      // stored role/branch. Stay in the loading phase across this step.
      try {
        await apiRequest('/staff-invite/consume', { method: 'POST', body: { token } });
      } catch {
        setError('We signed you in, but could not finish setting up your staff access.');
        setPhase('error');
        return;
      }

      // Explicit replace so we don't briefly flash the customer shell before the
      // session refetch routes to (staff).
      router.replace('/(staff)');
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
                    Accepting your staff invite.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.title, { color: theme.text }]}>Invite failed</Text>
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
  link: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
    textAlign: 'center',
  },
});
