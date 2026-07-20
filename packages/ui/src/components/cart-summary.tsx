import { formatCurrency } from '@jojopotato/utils';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface CartSummaryProps {
  subtotalCents: number;
  totalCents: number;
  /** Discount amount in cents; the discount row is hidden when 0 or omitted. */
  discountCents?: number;
  /** Optional label for the applied discount (e.g. the coupon title). */
  discountLabel?: string;
  /** Reward-redemption affordance rendered above the total (D2). */
  rewardSlot?: ReactNode;
  mode: ThemeMode;
  style?: ViewStyle;
}

/**
 * Totals panel: subtotal / discount / total label-value rows plus an optional
 * reward-redemption slot. Purely presentational — all amounts are computed by
 * the caller (`useCart()` derives them reactively). Values are formatted with
 * the shared currency helper; discounts are shown as a negative amount.
 */
export function CartSummary({
  subtotalCents,
  totalCents,
  discountCents = 0,
  discountLabel,
  rewardSlot,
  mode,
  style,
}: CartSummaryProps) {
  const theme = Colors[mode];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        style,
      ]}
    >
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Subtotal</Text>
        <Text style={[styles.value, { color: theme.text }]}>{formatCurrency(subtotalCents)}</Text>
      </View>

      {discountCents > 0 ? (
        <View style={styles.row}>
          <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={1}>
            {discountLabel ?? 'Discount'}
          </Text>
          <Text style={[styles.value, { color: theme.accent }]}>
            {`-${formatCurrency(discountCents)}`}
          </Text>
        </View>
      ) : null}

      {rewardSlot ? <View style={styles.rewardSlot}>{rewardSlot}</View> : null}

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <View style={styles.row}>
        <Text style={[styles.totalLabel, { color: theme.text }]}>Total</Text>
        <Text style={[styles.totalValue, { color: theme.text }]}>{formatCurrency(totalCents)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  label: {
    flex: 1,
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
  },
  value: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  rewardSlot: {
    gap: Spacing.two,
  },
  divider: {
    height: 2,
    borderRadius: Radii.full,
  },
  totalLabel: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  totalValue: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
});
