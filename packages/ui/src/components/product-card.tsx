import { Ionicons } from '@expo/vector-icons';
import type { MenuItem } from '@jojopotato/types';
import { formatCurrency } from '@jojopotato/utils';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

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

export interface ProductCardProps {
  product: MenuItem;
  imageSource?: ImageSourcePropType;
  onPress?: () => void;
  mode: ThemeMode;
}

/**
 * Single product card: brand photography supplied by the caller via
 * `imageSource` (or a placeholder block when none is passed), name,
 * description, price, and a view/open affordance (a chevron glyph). Tapping the
 * card fires the caller's `onPress` (typically navigation to Product Details) —
 * the chevron is a visual "open" cue, not a separate add-to-cart control.
 */
export function ProductCard({ product, imageSource, onPress, mode }: ProductCardProps) {
  const theme = Colors[mode];
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={!product.isAvailable}
      onPress={() => {
        setPressed((p) => !p);
        onPress?.();
      }}
      style={[
        styles.container,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: theme.border,
          opacity: product.isAvailable ? 1 : 0.7,
        },
      ]}
    >
      <View style={[styles.imageWrap, { backgroundColor: Palette.creamTint2 }]}>
        {imageSource ? (
          <Image
            source={imageSource}
            style={styles.image}
            contentFit="contain"
            accessibilityLabel={product.name}
          />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: theme.tint }]} />
        )}
        {!product.isAvailable ? (
          <View style={styles.soldOutBadge}>
            <Text style={styles.soldOutLabel}>Sold out</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {product.name}
        </Text>
        {product.description ? (
          <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>
            {product.description}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <Text style={[styles.price, { color: theme.text }]}>
            {formatCurrency(product.priceCents)}
          </Text>
          <View
            testID="product-card-affordance"
            style={[styles.addButton, { opacity: product.isAvailable ? 1 : 0.4 }, Shadows.offsetSm]}
          >
            <Ionicons name="chevron-forward" size={18} color={Palette.ink} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: Radii.md,
    borderWidth: 2,
    overflow: 'hidden',
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '78%',
    height: '78%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
  },
  soldOutBadge: {
    position: 'absolute',
    top: Spacing.two,
    left: Spacing.two,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.full,
    backgroundColor: Palette.ink,
  },
  soldOutLabel: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption,
    color: Palette.cream,
  },
  body: {
    gap: Spacing.half,
    padding: Spacing.two,
  },
  name: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.bodySmall,
  },
  description: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.caption,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.half,
  },
  price: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.bodySmall,
  },
  addButton: {
    width: 28,
    height: 28,
    borderRadius: Radii.full,
    borderWidth: 2,
    borderColor: Palette.ink,
    backgroundColor: Palette.jyellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
