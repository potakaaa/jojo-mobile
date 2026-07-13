import { Ionicons } from '@expo/vector-icons';
import type { PaymentMethod } from '@jojopotato/types';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface PaymentMethodSelectorProps {
  value: PaymentMethod;
  onChange: (v: PaymentMethod) => void;
  /** When false, the "Online payment" option renders disabled (not selectable). */
  onlinePaymentEnabled: boolean;
  mode?: ThemeMode;
  style?: ViewStyle;
}

interface OptionSpec {
  method: PaymentMethod;
  label: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const OPTIONS: OptionSpec[] = [
  {
    method: 'pay_at_branch',
    label: 'Pay at pickup',
    caption: 'Pay with cash or card when you collect your order.',
    icon: 'storefront-outline',
  },
  {
    method: 'online_payment',
    label: 'Online payment',
    caption: 'Coming soon — pay in advance from the app.',
    icon: 'card-outline',
  },
];

/**
 * Radio-style payment-method picker. "Pay at pickup" is always available; the
 * "Online payment" row renders disabled until the online-payment feature flag is
 * enabled, so users can see the option exists without being able to select it.
 */
export function PaymentMethodSelector({
  value,
  onChange,
  onlinePaymentEnabled,
  mode = 'light',
  style,
}: PaymentMethodSelectorProps) {
  const theme = Colors[mode];

  return (
    <View style={[styles.group, style]}>
      {OPTIONS.map((option) => {
        const isDisabled = option.method === 'online_payment' && !onlinePaymentEnabled;
        const isSelected = value === option.method && !isDisabled;

        return (
          <Pressable
            key={option.method}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected, disabled: isDisabled }}
            disabled={isDisabled}
            onPress={() => onChange(option.method)}
            style={[
              styles.option,
              {
                backgroundColor: isSelected ? theme.backgroundSelected : theme.backgroundElement,
                borderColor: isSelected ? theme.accent : theme.border,
              },
              isDisabled && styles.disabled,
            ]}
          >
            <View
              style={[styles.iconWrap, { backgroundColor: theme.tint, borderColor: theme.border }]}
            >
              <Ionicons name={option.icon} size={18} color={Palette.ink} />
            </View>
            <View style={styles.textColumn}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: theme.text }]}>{option.label}</Text>
                {isDisabled ? (
                  <View style={[styles.badge, { borderColor: theme.border }]}>
                    <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
                      Unavailable
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.caption, { color: theme.textSecondary }]} numberOfLines={2}>
                {option.caption}
              </Text>
            </View>
            <View style={[styles.radio, { borderColor: isSelected ? theme.accent : theme.border }]}>
              {isSelected ? (
                <View style={[styles.radioDot, { backgroundColor: theme.accent }]} />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 2,
  },
  disabled: {
    opacity: 0.5,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: {
    flex: 1,
    gap: Spacing.half,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  label: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  caption: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.caption,
  },
  badge: {
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.full,
    borderWidth: 1.5,
  },
  badgeText: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: Radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: Radii.full,
  },
});
