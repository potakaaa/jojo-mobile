import type { Deal } from '@jojopotato/types';
import { Image } from 'expo-image';
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

export interface DealCardProps {
  deal: Deal;
  onPress?: () => void;
  mode: ThemeMode;
  style?: ViewStyle;
  validUntil?: string;
  /**
   * DEAL-004 flag-not-hide: when `false`, the deal is rendered but visually muted
   * (dimmed) with an "Unavailable at this branch" badge — the branch cannot fulfil
   * one of its components. `undefined`/`true` renders the normal card. Additive;
   * existing call sites that omit it are unaffected.
   */
  available?: boolean;
}

/**
 * Promotional deal card: optional hero image, title, description, and a
 * discount badge. Tapping is optional and visual-only by default. When
 * `validUntil` is provided, a caption "Valid until: …" row renders below the
 * description; omitting it leaves existing call sites unaffected. When
 * `available === false` the card is dimmed and shows an "Unavailable at this
 * branch" badge (DEAL-004 flag-not-hide) — the card still renders and can still
 * be tapped to view detail; only the add-to-cart CTA on the detail screen is
 * gated.
 */
export function DealCard({ deal, onPress, mode, style, validUntil, available }: DealCardProps) {
  const theme = Colors[mode];
  const isUnavailable = available === false;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={isUnavailable ? { disabled: true } : undefined}
      onPress={onPress}
      style={[
        styles.container,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        Shadows.offsetSm,
        isUnavailable && styles.unavailable,
        style,
      ]}
    >
      {deal.imageUrl ? (
        <Image source={{ uri: deal.imageUrl }} style={styles.image} contentFit="cover" />
      ) : (
        <View style={[styles.imagePlaceholder, { backgroundColor: theme.tint }]} />
      )}
      <View style={styles.body}>
        <View style={[styles.discount, { backgroundColor: Palette.jred }]}>
          <Text style={styles.discountLabel}>{deal.discountLabel}</Text>
        </View>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {deal.title}
        </Text>
        {deal.description ? (
          <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>
            {deal.description}
          </Text>
        ) : null}
        {validUntil ? (
          <Text style={[styles.validUntil, { color: theme.textSecondary }]}>
            Valid until: {validUntil}
          </Text>
        ) : null}
        {isUnavailable ? (
          <View style={[styles.unavailableBadge, { borderColor: theme.border }]}>
            <Text style={[styles.unavailableText, { color: theme.textSecondary }]}>
              Unavailable at this branch
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radii.md,
    borderWidth: 2,
    overflow: 'hidden',
  },
  unavailable: {
    opacity: 0.55,
  },
  unavailableBadge: {
    alignSelf: 'flex-start',
    marginTop: Spacing.half,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderWidth: 2,
    borderRadius: Radii.full,
  },
  unavailableText: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption,
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  body: {
    gap: Spacing.one,
    padding: Spacing.three,
  },
  discount: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.full,
  },
  discountLabel: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption,
    color: Palette.cream,
  },
  title: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  description: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
  validUntil: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.caption,
  },
});
