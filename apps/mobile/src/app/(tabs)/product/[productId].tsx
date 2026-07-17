import type { CartItemOption, MenuItem, ProductOption, ProductOptionType } from '@jojopotato/types';
import { formatCurrency, getRequiredOptionTypes } from '@jojopotato/utils';
import { ConfirmDialog, ScreenHeader } from '@jojopotato/ui';
import { Image } from 'expo-image';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHideTabBarWhile } from '@/components/floating-tab-bar';
import { FontFamily, Palette, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { productToMenuItem } from '@/features/cart/lib/product-to-menu-item';
import { AddToCartBar } from '@/features/menu/components/add-to-cart-bar';
import { OptionGroupSelector } from '@/features/menu/components/option-group-selector';
import { useProductDetails } from '@/features/menu/hooks/use-product-details';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

type SelectionState = Partial<Record<ProductOptionType, string[]>>;

/** Fixed display order for option groups (matches the former `groupOptions` order). */
const GROUP_ORDER: ProductOptionType[] = ['size', 'flavor', 'add_on'];

export default function ProductDetailsScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { data: product, isLoading, isError } = useProductDetails(productId);
  const { cart, addItem, setBranch, clearCart } = useCart();
  const { selectedBranch } = useBranch();

  /*
    Hide the floating tab bar on this screen — it is the ROOT of its own
    top-level stack now (NAV-005), so `isNestedTabRoute()` is false and the bar
    would otherwise paint here. Gated on FOCUS, not just mount: the screen stays
    mounted in the Tabs navigator after the user navigates away, and an
    always-true flag would leave the bar hidden on the destination. See
    ../cart/index.tsx for the full note.

    Placed ABOVE the loading / error early returns below: hooks must run in the
    same order on every render, so it cannot sit after a conditional return.
  */
  useHideTabBarWhile(useIsFocused());

  const [selection, setSelection] = useState<SelectionState>({});
  const [addedNotice, setAddedNotice] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<{
    menuItem: MenuItem;
    opts: CartItemOption[];
  } | null>(null);

  // The backend already returns options grouped by type (a `Record`), so build
  // the display groups inline in fixed order — no client-side `groupOptions()`
  // (plan Gap E). Server pre-sorts options within each group by `sort_order`.
  const groups = useMemo(
    () =>
      product
        ? GROUP_ORDER.filter((type) => (product.options[type]?.length ?? 0) > 0).map((type) => ({
            type,
            options: product.options[type],
          }))
        : [],
    [product],
  );

  const requiredTypes = useMemo(
    () => (product ? getRequiredOptionTypes(Object.values(product.options).flat()) : []),
    [product],
  );

  // Flatten current selection to the option objects it represents.
  const selectedOptions = useMemo<ProductOption[]>(() => {
    if (!product) return [];
    const selectedIds = new Set(Object.values(selection).flat());
    return Object.values(product.options)
      .flat()
      .filter((option) => selectedIds.has(option.optionId));
  }, [product, selection]);

  // Unit price is a trivial cents sum: base + selected option deltas (all cents).
  const unitPriceCents = useMemo(() => {
    if (!product) return 0;
    return (
      product.basePriceCents +
      selectedOptions.reduce((sum, option) => sum + option.priceDeltaCents, 0)
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
      id: option.optionId,
      optionType: option.optionType,
      name: option.name,
      priceDeltaCents: option.priceDeltaCents,
    }));
    const menuItem = productToMenuItem(product, product.isAvailable);

    const isSwitchingBranch = cart.items.length > 0 && cart.pickupBranchId !== selectedBranch.id;
    if (isSwitchingBranch) {
      // Friendly confirm instead of a raw system alert (AC-A4). The underlying
      // clear-and-switch action is unchanged — it just runs on confirm.
      setPendingSwitch({ menuItem, opts });
      return;
    }

    if (cart.pickupBranchId !== selectedBranch.id) {
      setBranch(selectedBranch.id);
    }
    addItem(menuItem, opts);
    setAddedNotice(true);
  };

  const confirmBranchSwitch = () => {
    const pending = pendingSwitch;
    setPendingSwitch(null);
    if (!pending || !selectedBranch) return;
    clearCart();
    setBranch(selectedBranch.id);
    addItem(pending.menuItem, pending.opts);
    setAddedNotice(true);
  };

  /*
    Loading / error early returns get the SAME header + top inset as the loaded
    branch below. The native header used to cover these branches for free (React
    Navigation renders it from the Stack regardless of which return path this
    component takes); with `headerShown:false` (see ./_layout.tsx) they would
    otherwise lose BOTH their status-bar clearance and their only way back.
  */
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <ScreenHeader title="Product Details" onBack={() => router.back()} mode={mode} />
          <View style={styles.stateContainer}>
            <ActivityIndicator color={theme.accent} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (isError || !product) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <ScreenHeader title="Product Details" onBack={() => router.back()} mode={mode} />
          <View style={styles.stateContainer}>
            <Text style={[styles.stateText, { color: theme.textSecondary }]}>
              This product isn’t available.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/*
        TOP edge only. This screen's stack runs `headerShown:false`, so the top
        inset is ours to supply — without it the ScreenHeader title would sit
        under the status bar. Deliberately NO 'bottom' edge: `AddToCartBar` is a
        SIBLING outside this SafeAreaView and computes the device bottom inset
        itself (`insets.bottom + Spacing.four`), so it stays the single source —
        adding 'bottom' here would count it twice.
      */}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Product Details" onBack={() => router.back()} mode={mode} />
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
            {formatCurrency(product.basePriceCents)}
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
      </SafeAreaView>

      <AddToCartBar
        unitPriceCents={unitPriceCents}
        canAdd={canAdd}
        isAvailable={product.isAvailable}
        onAdd={handleAdd}
      />

      <ConfirmDialog
        visible={pendingSwitch !== null}
        title="Switch branch?"
        message={`Your cart has items from a different branch. Clear it and start a new order at ${selectedBranch?.name ?? 'this branch'}?`}
        confirmLabel="Clear and switch"
        cancelLabel="Cancel"
        variant="destructive"
        mode={mode}
        onConfirm={confirmBranchSwitch}
        onCancel={() => setPendingSwitch(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
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
