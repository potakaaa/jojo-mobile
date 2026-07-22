import type { OrderStatus } from '@jojopotato/types';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface OrderStatusBadgeProps {
  status: OrderStatus;
  mode: ThemeMode;
  style?: ViewStyle;
}

const STATUS_META: Record<OrderStatus, { label: string; color: string }> = {
  pending: { label: 'Order received', color: Palette.neutral500 },
  accepted: { label: 'Confirmed by branch', color: Palette.jgold },
  preparing: { label: 'Frying now', color: Palette.jorange },
  flavoring: { label: 'Shaking the flavor', color: Palette.jorange },
  ready: { label: 'Ready for pickup', color: Palette.green },
  completed: { label: 'Picked up', color: Palette.greenDark },
  cancelled: { label: 'Cancelled', color: Palette.jred },
  rejected: { label: 'Rejected', color: Palette.jred },
};

/**
 * The brand color a given order status is drawn in (same source of truth the
 * badge uses). Exposed so screens can accent surrounding UI — a card stripe, an
 * icon tint — with the status color without re-declaring the map.
 */
export function getOrderStatusColor(status: OrderStatus): string {
  return STATUS_META[status].color;
}

/** The human-readable label for an order status (matches the badge text). */
export function getOrderStatusLabel(status: OrderStatus): string {
  return STATUS_META[status].label;
}

/**
 * Pill badge conveying a single order's status via a color-coded label.
 */
export function OrderStatusBadge({ status, mode, style }: OrderStatusBadgeProps) {
  const theme = Colors[mode];
  const meta = STATUS_META[status];

  return (
    <View style={[styles.badge, { backgroundColor: meta.color, borderColor: theme.border }, style]}>
      <Text style={styles.label}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.full,
    borderWidth: 1.5,
  },
  label: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption,
    color: Palette.cream,
  },
});
