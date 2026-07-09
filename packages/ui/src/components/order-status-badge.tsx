import type { OrderStatus } from '@jojopotato/types';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface OrderStatusBadgeProps {
  status: OrderStatus;
  mode?: ThemeMode;
  style?: ViewStyle;
}

const STATUS_META: Record<OrderStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: Palette.neutral500 },
  confirmed: { label: 'Confirmed', color: Palette.jgold },
  preparing: { label: 'Preparing', color: Palette.jorange },
  ready_for_pickup: { label: 'Ready for pickup', color: Palette.green },
  completed: { label: 'Completed', color: Palette.greenDark },
  cancelled: { label: 'Cancelled', color: Palette.jred },
};

/**
 * Pill badge conveying a single order's status via a color-coded label.
 */
export function OrderStatusBadge({ status, mode = 'light', style }: OrderStatusBadgeProps) {
  const theme = Colors[mode];
  const meta = STATUS_META[status];

  return (
    <View
      style={[styles.badge, { backgroundColor: meta.color, borderColor: theme.border }, style]}
    >
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
