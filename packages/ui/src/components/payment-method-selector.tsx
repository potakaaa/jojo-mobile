import { Ionicons } from '@expo/vector-icons';
import type { PaymentMethod } from '@jojopotato/types';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface PaymentMethodSelectorProps {
  value: PaymentMethod;
  onChange: (v: PaymentMethod) => void;
  /** When false, the GCash/Maya/card options render disabled (not selectable). */
  onlinePaymentEnabled: boolean;
  mode: ThemeMode;
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
    method: 'app_wallet',
    label: 'App wallet',
    caption: 'Coming soon',
    icon: 'wallet-outline',
  },
  {
    method: 'gcash',
    label: 'GCash',
    caption: 'Pay via GCash',
    icon: 'phone-portrait-outline',
  },
  {
    method: 'maya',
    label: 'Maya',
    caption: 'Pay via Maya',
    icon: 'card-outline',
  },
  {
    method: 'card',
    label: 'Credit/debit card',
    caption: 'Pay by card',
    icon: 'card-outline',
  },
];

/**
 * Shared source of truth for payment-method display labels, reused by the
 * Checkout "Change" row and the Order Confirmation summary so the label list
 * lives in exactly one place.
 */
export const PAYMENT_METHOD_LABELS = Object.fromEntries(
  OPTIONS.map((option) => [option.method, option.label]),
) as Record<PaymentMethod, string>;

/**
 * Shared source of truth for payment-method icons, reused by the Checkout
 * "Change" row so the selected method shows its glyph alongside the label.
 */
export const PAYMENT_METHOD_ICONS = Object.fromEntries(
  OPTIONS.map((option) => [option.method, option.icon]),
) as Record<PaymentMethod, keyof typeof Ionicons.glyphMap>;

/**
 * Per-method availability (D2): `pay_at_branch` is always selectable;
 * `app_wallet` is always disabled (no wallet backing yet); `gcash`/`maya`/`card`
 * are selectable only when the online-payment feature flag is enabled. Disabled
 * rows stay visible so users can see the option exists without selecting it.
 */
function isMethodDisabled(method: PaymentMethod, onlinePaymentEnabled: boolean): boolean {
  if (method === 'pay_at_branch') return false;
  if (method === 'app_wallet') return true;
  return !onlinePaymentEnabled;
}

/**
 * Radio-style payment-method picker. Availability follows D2 (see
 * `isMethodDisabled`): "Pay at pickup" is always available, "App wallet" is
 * always disabled, and GCash/Maya/card are gated behind the online-payment flag.
 */
export function PaymentMethodSelector({
  value,
  onChange,
  onlinePaymentEnabled,
  mode,
  style,
}: PaymentMethodSelectorProps) {
  const theme = Colors[mode];

  return (
    <View style={[styles.group, style]}>
      {OPTIONS.map((option) => {
        const isDisabled = isMethodDisabled(option.method, onlinePaymentEnabled);
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
                <Text style={[styles.label, { color: theme.text }]} numberOfLines={2}>
                  {option.label}
                </Text>
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
    // Yield space and wrap (with numberOfLines={2}) instead of overflowing the
    // row when the label is long (e.g. "Credit/debit card") next to the badge.
    flexShrink: 1,
  },
  caption: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.caption,
  },
  badge: {
    // Keep intrinsic width so a shrinking label never compresses the badge.
    flexShrink: 0,
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
