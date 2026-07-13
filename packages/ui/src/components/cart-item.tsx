import { Ionicons } from '@expo/vector-icons';
import type { CartItem as CartItemData, Flavor, MenuItem, Size } from '@jojopotato/types';
import { formatCurrency } from '@jojopotato/utils';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface CartItemProps {
  item: CartItemData;
  product: MenuItem;
  flavor?: Flavor | string;
  size?: Size | string;
  onIncrement?: () => void;
  onDecrement?: () => void;
  /** When supplied, renders a trash affordance that removes the whole line. */
  onRemove?: () => void;
  mode?: ThemeMode;
  style?: ViewStyle;
}

function labelOf(value: Flavor | Size | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  return 'name' in value ? value.name : value.label;
}

function sizeModifierCents(size: Size | string | undefined): number {
  if (size === undefined || typeof size === 'string') return 0;
  return size.priceModifierCents ?? 0;
}

/**
 * Denormalized cart-line row. Computes the line total from the product unit
 * price, quantity, and any size price modifier, and renders quantity stepper
 * affordances (visual-only unless `onIncrement`/`onDecrement` are supplied).
 */
export function CartItem({
  item,
  product,
  flavor,
  size,
  onIncrement,
  onDecrement,
  onRemove,
  mode = 'light',
  style,
}: CartItemProps) {
  const theme = Colors[mode];
  const lineTotalCents = (product.priceCents + sizeModifierCents(size)) * item.quantity;
  const flavorLabel = labelOf(flavor);
  const sizeLabel = labelOf(size);
  const variantParts = [flavorLabel, sizeLabel].filter(Boolean).join(' • ');

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        style,
      ]}
    >
      {product.imageUrl ? (
        <Image source={{ uri: product.imageUrl }} style={styles.image} contentFit="cover" />
      ) : (
        <View style={[styles.imagePlaceholder, { backgroundColor: theme.tint }]} />
      )}
      <View style={styles.body}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {product.name}
        </Text>
        {variantParts ? (
          <Text style={[styles.variant, { color: theme.textSecondary }]} numberOfLines={1}>
            {variantParts}
          </Text>
        ) : null}
        <Text style={[styles.total, { color: theme.text }]}>{formatCurrency(lineTotalCents)}</Text>
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
        {onRemove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove item"
            onPress={onRemove}
            style={[styles.removeButton, { borderColor: theme.border }]}
          >
            <Ionicons name="trash-outline" size={16} color={theme.accent} />
          </Pressable>
        ) : null}
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
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: TypeScale.body,
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: Radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.one,
  },
  quantity: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
    minWidth: 20,
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
