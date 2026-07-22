import type { Coupon } from '@jojopotato/types';
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
  /**
   * `code` is OPTIONAL here even though the domain `Coupon` always carries one.
   *
   * A card can describe a server-applied discount that has no customer-facing
   * code at all (the cart's applied-discount row). The call site is the only
   * place that knows definitively whether a real code exists, so it passes
   * `undefined` rather than substituting a descriptive label — see the
   * `codeChip` note below.
   *
   * Kept as a card-local widening instead of loosening the shared
   * `Coupon.code`: nothing outside this component reads `.code`, so the shared
   * domain type stays honest for every other consumer.
   */
  coupon: Omit<Coupon, 'code'> & { code?: string };
  onPress?: () => void;
  mode: ThemeMode;
  style?: ViewStyle;
}

/**
 * Coupon card showing the code, title, discount, and redeemed state. Renders
 * dimmed when already redeemed.
 */
export function CouponCard({ coupon, onPress, mode, style }: CouponCardProps) {
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
      {/*
        A3 — the solid jyellow pill reads as a tappable button, so it renders ONLY
        for a genuine short code. When the caller has no real code it passes
        `undefined` and the pill is omitted entirely: no false affordance, and the
        freed width is what stops a long discount amount wrapping mid-number.
      */}
      {coupon.code ? (
        <View
          style={[styles.codeChip, { backgroundColor: Palette.jyellow, borderColor: theme.border }]}
        >
          <Text style={styles.code} numberOfLines={1}>
            {coupon.code}
          </Text>
        </View>
      ) : null}
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {coupon.title}
        </Text>
        {/*
          `numberOfLines={1}` is a hard guard: an amount split across two lines
          ("-₱1,289." / "00") is unreadable and was the reported defect.
        */}
        <Text style={[styles.discount, { color: theme.accent }]} numberOfLines={1}>
          {coupon.discountLabel}
        </Text>
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
    // A genuine code is short, so the pill keeps its intrinsic width and lets
    // `body` (flex: 1) absorb the remainder — the title/amount never get
    // squeezed into a wrap by an oversized pill.
    flexShrink: 0,
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
