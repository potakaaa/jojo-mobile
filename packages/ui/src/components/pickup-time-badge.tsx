import type { PickupTime } from '@jojopotato/types';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface PickupTimeBadgeProps {
  pickupTime: PickupTime;
  mode?: ThemeMode;
  style?: ViewStyle;
}

/**
 * Small themed badge showing a pickup time-slot label. Renders dimmed with a
 * struck-through label when the slot is unavailable.
 */
export function PickupTimeBadge({ pickupTime, mode = 'light', style }: PickupTimeBadgeProps) {
  const theme = Colors[mode];
  const available = pickupTime.isAvailable;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
        !available && styles.unavailable,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: available ? theme.text : theme.textSecondary },
          !available && styles.struck,
        ]}
      >
        {pickupTime.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.full,
    borderWidth: 2,
  },
  unavailable: {
    opacity: 0.5,
  },
  label: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
});
