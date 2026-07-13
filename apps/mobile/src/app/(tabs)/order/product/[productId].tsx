import type { CartItemOption, ProductOption, ProductOptionType } from '@jojopotato/types';
import { computeUnitPrice, formatPricePHP, getRequiredOptionTypes } from '@jojopotato/utils';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Palette, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { productToMenuItem } from '@/features/cart/lib/product-to-menu-item';
import { AddToCartBar } from '@/features/menu/components/add-to-cart-bar';
import { OptionGroupSelector } from '@/features/menu/components/option-group-selector';
import { useProductDetails } from '@/features/menu/hooks/use-product-details';
import { groupOptions } from '@/features/menu/lib/group-options';
import { useTheme } from '@/hooks/use-theme';

type SelectionState = Partial<Record<ProductOptionType, string[]>>;

export default function ProductDetailsScreen() {
  const theme = useTheme();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { data: product, isLoading, isError } = useProductDetails(productId);
  const { cart, addItem, setBranch, clearCart } = useCart();
  const { selectedBranch } = useBranch();

  const [selection, setSelection] = useState<SelectionState>({});
  const [addedNotice, setAddedNotice] = useState(false);

  const groups = useMemo(() => (product ? groupOptions(product.options) : []), [product]);
  const requiredTypes = useMemo(
    () => (product ? getRequiredOptionTypes(product.options) : []),
    [product],
  );

  // Flatten current selection to the option objects it represents.
  const selectedOptions = useMemo<ProductOption[]>(() => {
    if (!product) return [];
    const selectedIds = new Set(Object.values(selection).flat());
    return product.options.filter((option) => selectedIds.has(option.id));
  }, [product, selection]);

  const unitPrice = useMemo(() => {
    if (!product) return 0;
    return computeUnitPrice(
      product.basePrice,
      selectedOptions.map((option) => option.priceDelta),
    );
  }, [product, selectedOptions]);

  const canAdd = useMemo(() => {
    if (!product) return false;
    return requiredTypes.every((type) => {
      const selected = selection[type]?.[0];
      return selected !== undefined && selected !== '';
    });
  }, [product, requiredTypes, selection]);

  const handleChange = (type: ProductOptionType, optionId: string) => {
    setAddedNotice(false);
    setSelection((prev) => {
      if (type === 'add_on') {
        const current = prev.add_on ?? [];
        const next = current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
        return { ...prev, add_on: next };
      }
      // Single-select groups (size / flavor).
      return { ...prev, [type]: [optionId] };
    });
  };

  const handleAdd = () => {
    if (!product) return;
    if (!selectedBranch) {
      Alert.alert('No branch selected', 'Please select a pickup branch before adding items.');
      return;
    }

    const opts: CartItemOption[] = selectedOptions.map((option) => ({
      id: option.id,
      optionType: option.optionType,
      name: option.name,
      priceDeltaCents: Math.round(option.priceDelta * 100),
    }));
    const menuItem = productToMenuItem(product, product.isAvailable);

    const isSwitchingBranch = cart.items.length > 0 && cart.pickupBranchId !== selectedBranch.id;
    if (isSwitchingBranch) {
      Alert.alert(
        'Switch branch?',
        `Your cart has items from a different branch. Clear it and start a new order at ${selectedBranch.name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear and switch',
            style: 'destructive',
            onPress: () => {
              clearCart();
              setBranch(selectedBranch.id);
              addItem(menuItem, opts);
              setAddedNotice(true);
            },
          },
        ],
      );
      return;
    }

    if (cart.pickupBranchId !== selectedBranch.id) {
      setBranch(selectedBranch.id);
    }
    addItem(menuItem, opts);
    setAddedNotice(true);
  };

  if (isLoading) {
    return (
      <View style={[styles.stateContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (isError || !product) {
    return (
      <View style={[styles.stateContainer, { backgroundColor: theme.background }]}>
        <Text style={[styles.stateText, { color: theme.textSecondary }]}>
          This product isn’t available.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.imageWrap, { backgroundColor: Palette.creamTint2 }]}>
          {product.imageUrl ? (
            <Image
              source={{ uri: product.imageUrl }}
              style={styles.image}
              contentFit="cover"
              accessibilityLabel={product.name}
            />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: theme.tint }]} />
          )}
        </View>

        <Text style={[styles.name, { color: theme.text }]}>{product.name}</Text>
        {product.description ? (
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {product.description}
          </Text>
        ) : null}
        <Text style={[styles.basePrice, { color: theme.text }]}>
          {formatPricePHP(product.basePrice)}
        </Text>

        {groups.map((group) => (
          <OptionGroupSelector
            key={group.type}
            group={group}
            required={requiredTypes.includes(group.type)}
            selectedIds={selection[group.type] ?? []}
            onChange={(optionId) => handleChange(group.type, optionId)}
          />
        ))}

        {addedNotice ? (
          <Text style={[styles.addedNotice, { color: theme.accent }]}>Added to cart ✓</Text>
        ) : null}
      </ScrollView>

      <AddToCartBar
        unitPrice={unitPrice}
        canAdd={canAdd}
        isAvailable={product.isAvailable}
        onAdd={handleAdd}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  stateText: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 1.4,
    borderRadius: Radii.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
  },
  name: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h1,
  },
  description: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.body,
  },
  basePrice: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  addedNotice: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
});
