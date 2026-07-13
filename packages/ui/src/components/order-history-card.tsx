import { Ionicons } from '@expo/vector-icons';
import type { Order } from '@jojopotato/types';
import { formatCurrency } from '@jojopotato/utils';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Spacing, TypeScale, type ThemeMode } from '../theme';
import { Button } from './button';
import { Card } from './card';
import { OrderStatusBadge } from './order-status-badge';

export interface OrderHistoryCardProps {
  order: Order;
  /** Resolved branch display name; falls back to `order.branchId` when absent. */
  branchName?: string;
  /** Fired when the user taps Reorder (only rendered for completed/cancelled). */
  onReorder: (order: Order) => void;
  mode?: ThemeMode;
  style?: ViewStyle;
}

/** Reorder is only meaningful for finished orders (completed or cancelled) — D1. */
function canReorder(order: Order): boolean {
  return order.status === 'completed' || order.status === 'cancelled';
}

/** e.g. "Jul 11, 2026" — placedAt is ISO 8601. */
function formatOrderDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** e.g. "Cheddar Loaded Fries x2, Yuzu Lemonade x1". */
function itemSummary(order: Order): string {
  return order.cart.items.map((it) => `${it.productNameSnapshot} x${it.quantity}`).join(', ');
}

/**
 * One Order History row (HIST-001): order date + status, branch, an item
 * summary, the total, the stars earned, and a conditional Reorder CTA. Purely
 * presentational — the parent screen owns the reorder logic and wires
 * `onReorder`. Composed from `Card`/`OrderStatusBadge`/`Button` + themed text;
 * theme-token driven, no raw hex/px.
 */
export function OrderHistoryCard({
  order,
  branchName,
  onReorder,
  mode = 'light',
  style,
}: OrderHistoryCardProps) {
  const theme = Colors[mode];
  const showReorder = canReorder(order);

  return (
    <Card mode={mode} style={StyleSheet.flatten([styles.card, style])}>
      <View style={styles.headerRow}>
        <Text style={[styles.date, { color: theme.text }]}>{formatOrderDate(order.placedAt)}</Text>
        <OrderStatusBadge status={order.status} mode={mode} />
      </View>

      <View style={styles.metaRow}>
        <Ionicons name="storefront-outline" size={16} color={theme.textSecondary} />
        <Text style={[styles.branch, { color: theme.textSecondary }]} numberOfLines={1}>
          {branchName ?? order.branchId}
        </Text>
      </View>

      <Text style={[styles.items, { color: theme.text }]} numberOfLines={2}>
        {itemSummary(order)}
      </Text>

      <View style={styles.footerRow}>
        <Text style={[styles.total, { color: theme.text }]}>
          {formatCurrency(order.totalCents)}
        </Text>
        <View
          style={styles.starsRow}
          accessibilityLabel={`${order.starsEarned} stars earned`}
          accessibilityRole="text"
        >
          <Ionicons name="star" size={16} color={Palette.jgold} />
          <Text style={[styles.stars, { color: theme.textSecondary }]}>
            {order.starsEarned} stars
          </Text>
        </View>
      </View>

      {showReorder ? (
        <Button
          label="Reorder"
          size="sm"
          iconName="repeat"
          onPress={() => onReorder(order)}
          mode={mode}
          style={styles.reorder}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  date: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  branch: {
    flex: 1,
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
  },
  items: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  total: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  stars: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  reorder: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
});
