import type { CartItemOption, MenuItem } from '@jojopotato/types';
import { Button, Card, FlavorSelector, SizeSelector } from '@jojopotato/ui';
import { formatCurrency } from '@jojopotato/utils';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Palette, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useBranchMenu } from '@/features/menu/hooks/use-branch-menu';
import { ScreenLoader, ScreenMessage } from '@/features/shared/components/screen-message';
import { useTheme } from '@/hooks/use-theme';

/**
 * Product Details: size + flavor selection, a quantity stepper, and Add to
 * cart. The line's unit price folds in the selected options' price deltas.
 */
export default function ProductDetailsScreen() {
  const theme = useTheme();
  const { productId, branchId } = useLocalSearchParams<{ productId: string; branchId?: string }>();
  const { setBranch, addItem } = useCart();
  const menu = useBranchMenu(branchId ?? '');

  const [sizeId, setSizeId] = useState<string>();
  const [flavorId, setFlavorId] = useState<string>();
  const [quantity, setQuantity] = useState(1);

  const product = useMemo(
    () => menu.data?.categories.flatMap((c) => c.products).find((p) => p.id === productId),
    [menu.data, productId],
  );

  const category = useMemo(
    () => menu.data?.categories.find((c) => c.products.some((p) => p.id === productId)),
    [menu.data, productId],
  );

  const sizeOptions = product?.options.size ?? [];
  const flavorOptions = product?.options.flavor ?? [];

  const selectedSize = sizeOptions.find((o) => o.optionId === sizeId);
  const selectedFlavor = flavorOptions.find((o) => o.optionId === flavorId);

  const unitPriceCents = product
    ? product.basePriceCents +
      (selectedSize?.priceDeltaCents ?? 0) +
      (selectedFlavor?.priceDeltaCents ?? 0)
    : 0;

  // A product can't be customized without knowing which branch it belongs to.
  if (!branchId) {
    return (
      <ScreenMessage
        title="Pick a branch first"
        subtitle="Choose a pickup branch to start your order."
        actionLabel="Browse branches"
        onAction={() => router.replace('/(tabs)/branches')}
      />
    );
  }

  if (menu.loading) return <ScreenLoader />;
  if (menu.error || !product) {
    return (
      <ScreenMessage
        title="Couldn't load this product"
        subtitle={menu.error ?? 'Product not found on this branch menu.'}
        actionLabel="Retry"
        onAction={menu.refetch}
      />
    );
  }

  const needsSize = sizeOptions.length > 0 && !selectedSize;
  const needsFlavor = flavorOptions.length > 0 && !selectedFlavor;
  const canAdd = !needsSize && !needsFlavor;

  const onAddToCart = () => {
    const opts: CartItemOption[] = [];
    if (selectedSize)
      opts.push({
        id: selectedSize.optionId,
        optionType: 'size',
        name: selectedSize.name,
        priceDeltaCents: selectedSize.priceDeltaCents,
      });
    if (selectedFlavor)
      opts.push({
        id: selectedFlavor.optionId,
        optionType: 'flavor',
        name: selectedFlavor.name,
        priceDeltaCents: selectedFlavor.priceDeltaCents,
      });

    const menuItem: MenuItem = {
      id: product.id,
      name: product.name,
      description: product.description,
      priceCents: product.basePriceCents,
      imageUrl: product.imageUrl,
      categoryId: category?.id ?? '',
      isAvailable: true,
    };

    // Ensure the cart is scoped to this branch before adding (clears any cart
    // from a different branch — pickup is single-branch per order).
    setBranch(branchId);
    addItem(menuItem, opts, quantity);
    router.push('/(tabs)/order/cart');
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Card>
        <Text style={[styles.name, { color: theme.text }]}>{product.name}</Text>
        {product.description ? (
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {product.description}
          </Text>
        ) : null}
        <Text style={[styles.basePrice, { color: theme.text }]}>
          {formatCurrency(product.basePriceCents)}
        </Text>
      </Card>

      {sizeOptions.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Size</Text>
          <SizeSelector
            sizes={sizeOptions.map((o) => ({
              id: o.optionId,
              label: o.name,
              priceModifierCents: o.priceDeltaCents,
            }))}
            selectedSizeId={sizeId}
            onSelect={(s) => setSizeId(s.id)}
          />
        </View>
      ) : null}

      {flavorOptions.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Flavor</Text>
          <FlavorSelector
            flavors={flavorOptions.map((o) => ({ id: o.optionId, name: o.name }))}
            selectedFlavorId={flavorId}
            onSelect={(f) => setFlavorId(f.id)}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Quantity</Text>
        <View style={styles.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrease quantity"
            onPress={() => setQuantity((q) => Math.max(1, q - 1))}
            style={[styles.stepBtn, { borderColor: theme.border }]}
          >
            <Text style={[styles.stepLabel, { color: theme.text }]}>-</Text>
          </Pressable>
          <Text style={[styles.qty, { color: theme.text }]}>{quantity}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Increase quantity"
            onPress={() => setQuantity((q) => q + 1)}
            style={[styles.stepBtn, { borderColor: theme.border }]}
          >
            <Text style={[styles.stepLabel, { color: theme.text }]}>+</Text>
          </Pressable>
        </View>
      </View>

      {!canAdd ? (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          {needsSize ? 'Select a size' : 'Select a flavor'} to continue.
        </Text>
      ) : null}

      <Button
        label={`Add to cart • ${formatCurrency(unitPriceCents * quantity)}`}
        onPress={onAddToCart}
        disabled={!canAdd}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  name: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h2 },
  description: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
    marginTop: Spacing.one,
  },
  basePrice: { fontFamily: FontFamily.body.bold, fontSize: TypeScale.h3, marginTop: Spacing.two },
  section: { gap: Spacing.two },
  sectionTitle: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h3 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  stepBtn: {
    width: 44,
    height: 44,
    borderWidth: 2,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.creamTint2,
  },
  stepLabel: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h3 },
  qty: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.h3,
    minWidth: 32,
    textAlign: 'center',
  },
  hint: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.bodySmall },
});
