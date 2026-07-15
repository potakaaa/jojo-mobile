import type { CouponDisplay } from '@jojopotato/types';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import {
  Colors,
  FontFamily,
  Palette,
  Radii,
  Shadows,
  Spacing,
  TypeScale,
  type ThemeMode,
} from '../theme';

export interface CouponCardProps {
  coupon: CouponDisplay;
  onPress?: () => void;
  mode?: ThemeMode;
  style?: ViewStyle;
}

/**
 * Coupon card showing the code, title, discount, and redeemed state. Renders
 * dimmed when already redeemed.
 */
export function CouponCard({ coupon, onPress, mode = 'light', style }: CouponCardProps) {
  const theme = Colors[mode];

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={[
        styles.container,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        Shadows.offsetSm,
        coupon.isRedeemed && styles.redeemed,
        style,
      ]}
    >
      <View
        style={[styles.codeChip, { backgroundColor: Palette.jyellow, borderColor: theme.border }]}
      >
        <Text style={styles.code}>{coupon.code}</Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {coupon.title}
        </Text>
        <Text style={[styles.discount, { color: theme.accent }]}>{coupon.discountLabel}</Text>
      </View>
      {coupon.isRedeemed ? (
        <Text style={[styles.redeemedLabel, { color: theme.textSecondary }]}>Redeemed</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 2,
  },
  redeemed: {
    opacity: 0.5,
  },
  codeChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.sm,
    borderWidth: 2,
  },
  code: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.bodySmall,
    color: Palette.ink,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  discount: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  redeemedLabel: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption,
  },
});
