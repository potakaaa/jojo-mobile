import type { CartItem as CartItemData } from '@jojopotato/types';
import { formatPricePHP } from '@jojopotato/utils';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface CartItemProps {
  /** A cart-line snapshot (self-contained: name, image, unit price, options, quantity). */
  item: CartItemData;
  onIncrement?: () => void;
  onDecrement?: () => void;
  mode?: ThemeMode;
  style?: ViewStyle;
}

/**
 * Cart-line row. Renders purely from the add-time `CartItem` snapshot — product
 * name, image, selected-option summary, and line total (unit price x quantity) —
 * plus quantity stepper affordances (visual-only unless `onIncrement`/
 * `onDecrement` are supplied).
 */
export function CartItem({ item, onIncrement, onDecrement, mode = 'light', style }: CartItemProps) {
  const theme = Colors[mode];
  const lineTotal = item.unitPrice * item.quantity;
  const variantParts = item.selectedOptions.map((option) => option.name).join(' • ');

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        style,
      ]}
    >
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.image} contentFit="cover" />
      ) : (
        <View style={[styles.imagePlaceholder, { backgroundColor: theme.tint }]} />
      )}
      <View style={styles.body}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        {variantParts ? (
          <Text style={[styles.variant, { color: theme.textSecondary }]} numberOfLines={1}>
            {variantParts}
          </Text>
        ) : null}
        <Text style={[styles.total, { color: theme.text }]}>{formatPricePHP(lineTotal)}</Text>
      </View>
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Decrease quantity"
          accessibilityState={{ disabled: !onDecrement }}
          disabled={!onDecrement}
          onPress={onDecrement}
          style={[styles.stepButton, { borderColor: theme.border, opacity: onDecrement ? 1 : 0.4 }]}
        >
          <Text style={[styles.stepLabel, { color: theme.text }]}>−</Text>
        </Pressable>
        <Text style={[styles.quantity, { color: theme.text }]}>{item.quantity}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Increase quantity"
          accessibilityState={{ disabled: !onIncrement }}
          disabled={!onIncrement}
          onPress={onIncrement}
          style={[styles.stepButton, { borderColor: theme.border, opacity: onIncrement ? 1 : 0.4 }]}
        >
          <Text style={[styles.stepLabel, { color: theme.text }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radii.md,
    borderWidth: 2,
  },
  image: {
    width: 48,
    height: 48,
    borderRadius: Radii.sm,
  },
  imagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: Radii.sm,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  name: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  variant: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.caption,
  },
  total: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.bodySmall,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepButton: {
    width: 28,
    height: 28,
    borderRadius: Radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.jyellow,
  },
  stepLabel: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.body,
  },
  quantity: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
    minWidth: 20,
    textAlign: 'center',
  },
});
