import { Badge, Button, Card, EmptyState } from '@jojopotato/ui';
import { formatCurrency } from '@jojopotato/utils';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCart } from '@/features/cart/hooks/use-cart';
import { MOCK_ORDER_HISTORY } from '@/features/order-history/mock-order-history';
import {
  applyReorderPlan,
  buildReorderPlan,
  type ReorderLine,
} from '@/features/order-history/reorder';
import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** Comma-joined option names, e.g. "Large, Bacon Bits" (empty string if none). */
function optionSummary(line: ReorderLine): string {
  return line.originalItem.selectedOptions.map((o) => o.name).join(', ');
}

/**
 * Reorder Review (HIST-002, D3 conflict path). Only reached when a past order
 * has at least one now-unavailable line. Lists every line explicitly: available
 * ones at their CURRENT price (included in the running total) and unavailable
 * ones flagged "Needs re-selection" (excluded from the total, never silently
 * dropped — D8). The user must make an explicit choice: continue with just the
 * available items, or go back without touching the cart.
 */
export default function ReorderReviewScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { addItem, setBranch } = useCart();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const order = useMemo(() => MOCK_ORDER_HISTORY.find((o) => o.id === orderId), [orderId]);
  const plan = useMemo(() => (order ? buildReorderPlan(order) : null), [order]);

  const availableTotalCents = useMemo(
    () =>
      plan
        ? plan.available.reduce(
            (sum, l) => sum + (l.currentUnitPriceCents ?? 0) * l.originalItem.quantity,
            0,
          )
        : 0,
    [plan],
  );

  if (!order || !plan) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <EmptyState
            iconName="alert-circle-outline"
            title="Order not found"
            description="We couldn't find that order to reorder."
            actionLabel="Back to history"
            onAction={() => router.back()}
            mode={mode}
          />
        </SafeAreaView>
      </View>
    );
  }

  const handleContinue = () => {
    // Adds ONLY the available lines; unavailable lines are intentionally excluded
    // (already surfaced above). Then jumps to the existing Cart screen.
    applyReorderPlan(plan, order.branchId, { addItem, setBranch });
    router.push('/(tabs)/order/cart');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.intro, { color: theme.textSecondary }]}>
            Some items from this order aren&apos;t available right now. Review what carries over
            before continuing — unavailable items won&apos;t be added.
          </Text>

          {plan.unavailable.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.text }]}>Needs re-selection</Text>
              {plan.unavailable.map((line) => (
                <Card key={line.originalItem.lineId} mode={mode} style={styles.lineCard}>
                  <View style={styles.lineHeader}>
                    <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>
                      {line.originalItem.productNameSnapshot}
                    </Text>
                    <Badge label="Needs re-selection" variant="danger" mode={mode} />
                  </View>
                  {optionSummary(line) ? (
                    <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
                      {optionSummary(line)}
                    </Text>
                  ) : null}
                  <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
                    Qty {line.originalItem.quantity} · currently unavailable
                  </Text>
                </Card>
              ))}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.text }]}>Available to reorder</Text>
            {plan.available.length === 0 ? (
              <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
                None of these items are available right now.
              </Text>
            ) : (
              plan.available.map((line) => (
                <Card key={line.originalItem.lineId} mode={mode} style={styles.lineCard}>
                  <View style={styles.lineHeader}>
                    <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>
                      {line.originalItem.productNameSnapshot}
                    </Text>
                    <Text style={[styles.price, { color: theme.text }]}>
                      {formatCurrency(
                        (line.currentUnitPriceCents ?? 0) * line.originalItem.quantity,
                      )}
                    </Text>
                  </View>
                  {optionSummary(line) ? (
                    <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
                      {optionSummary(line)}
                    </Text>
                  ) : null}
                  <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
                    Qty {line.originalItem.quantity} · current price
                  </Text>
                </Card>
              ))
            )}
          </View>

          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.text }]}>Available items total</Text>
            <Text style={[styles.totalValue, { color: theme.text }]}>
              {formatCurrency(availableTotalCents)}
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label="Continue to Cart"
            onPress={handleContinue}
            disabled={plan.available.length === 0}
            mode={mode}
          />
          <Button
            label="Back to History"
            variant="outline"
            onPress={() => router.back()}
            mode={mode}
          />
        </View>
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  intro: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  lineCard: {
    gap: Spacing.one,
  },
  lineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  itemName: {
    flex: 1,
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.body,
  },
  itemMeta: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
  price: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  totalLabel: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.body,
  },
  totalValue: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
});
