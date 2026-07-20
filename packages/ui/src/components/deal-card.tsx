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
}

/**
 * Promotional deal card: optional hero image, title, description, and a
 * discount badge. Tapping is optional and visual-only by default. When
 * `validUntil` is provided, a caption "Valid until: …" row renders below the
 * description; omitting it leaves existing call sites unaffected.
 */
export function DealCard({ deal, onPress, mode, style, validUntil }: DealCardProps) {
  const theme = Colors[mode];

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={[
        styles.container,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        Shadows.offsetSm,
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
