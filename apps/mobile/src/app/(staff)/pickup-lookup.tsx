/**
 * Enter Pickup Code screen (staff) — STAFF-005 (PUP-002).
 *
 * Staff type the pickup code a customer speaks aloud (the order's `order_number`)
 * and look it up branch-scoped via `GET /api/staff/orders/lookup?code=`.
 *   - found actionable order → navigate to the existing Order Detail screen;
 *   - already-terminal order (completed/cancelled/rejected) → inline message, no nav;
 *   - not found (null) → inline "no matching order" message.
 *
 * Branch isolation and the byte-identical not-found response are enforced
 * server-side; this screen only renders the outcome.
 */

import { Ionicons } from '@expo/vector-icons';
import { Button, Input, type ThemeMode } from '@jojopotato/ui';
import type { StaffOrderDetail } from '@jojopotato/types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { fetchStaffOrderByCode } from '@/features/staff/lib/staff-api';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

const TERMINAL_STATUSES: readonly StaffOrderDetail['status'][] = [
  'completed',
  'cancelled',
  'rejected',
];

function terminalMessage(status: StaffOrderDetail['status']): string {
  if (status === 'completed') return 'This order was already picked up.';
  if (status === 'cancelled') return 'This order was cancelled.';
  return 'This order was rejected.';
}

export default function PickupLookupScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode: ThemeMode = scheme === 'dark' ? 'dark' : 'light';
  const router = useRouter();

  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit() {
    const trimmed = code.trim();
    if (!trimmed || isLoading) return;

    Keyboard.dismiss();
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const order = await fetchStaffOrderByCode(trimmed);
      if (!order) {
        setErrorMessage('No matching order found for your branch.');
        return;
      }
      if (TERMINAL_STATUSES.includes(order.status)) {
        setErrorMessage(terminalMessage(order.status));
        return;
      }
      router.push(`/(staff)/order-detail/${order.id}`);
    } catch {
      setErrorMessage('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Enter Pickup Code</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Type the pickup code the customer gives you to find their order.
          </Text>

          <Input
            value={code}
            onChangeText={(text) => {
              setCode(text);
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="e.g. JP-250715-0001"
            label="Pickup code"
            mode={mode}
            autoCapitalize="characters"
            returnKeyType="search"
            error={errorMessage ?? undefined}
          />

          <Button
            label="Find order"
            mode={mode}
            onPress={() => void onSubmit()}
            loading={isLoading}
            disabled={code.trim().length === 0}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
  },
  headerTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  hint: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.body,
  },
});
