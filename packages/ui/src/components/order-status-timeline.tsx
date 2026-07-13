import type { OrderStatus } from '@jojopotato/types';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface OrderStatusTimelineProps {
  currentStatus: OrderStatus;
  mode?: ThemeMode;
  style?: ViewStyle;
}

const STATUS_SEQUENCE: OrderStatus[] = [
  'pending',
  'accepted',
  'preparing',
  'flavoring',
  'ready',
  'completed',
];

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Order received',
  accepted: 'Confirmed by branch',
  preparing: 'Frying now',
  flavoring: 'Shaking the flavor',
  ready: 'Ready for pickup',
  completed: 'Picked up',
  cancelled: 'Cancelled',
};

/**
 * Vertical step list of the fixed order-status progression. Steps up to and
 * including the current status are marked active; `cancelled` is rendered as a
 * distinct terminal alternate state rather than a point on the normal path.
 */
export function OrderStatusTimeline({
  currentStatus,
  mode = 'light',
  style,
}: OrderStatusTimelineProps) {
  const theme = Colors[mode];

  if (currentStatus === 'cancelled') {
    return (
      <View style={[styles.wrap, style]}>
        <View style={styles.step}>
          <View
            style={[styles.dot, { backgroundColor: Palette.jred, borderColor: theme.border }]}
          />
          <Text style={[styles.label, { color: theme.text }]}>Cancelled</Text>
        </View>
      </View>
    );
  }

  const currentIndex = STATUS_SEQUENCE.indexOf(currentStatus);

  return (
    <View style={[styles.wrap, style]}>
      {STATUS_SEQUENCE.map((status, index) => {
        const isActive = index <= currentIndex;
        return (
          <View key={status} style={styles.step}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: isActive ? Palette.green : theme.backgroundSelected,
                  borderColor: theme.border,
                },
              ]}
            />
            <Text style={[styles.label, { color: isActive ? theme.text : theme.textSecondary }]}>
              {STATUS_LABEL[status]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: Radii.full,
    borderWidth: 2,
  },
  label: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
});
