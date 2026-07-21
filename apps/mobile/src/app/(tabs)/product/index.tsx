import type { CartItemOption, MenuItem, ProductOption, ProductOptionType } from '@jojopotato/types';
import { formatCurrency, getRequiredOptionTypes } from '@jojopotato/utils';
import { Ionicons } from '@expo/vector-icons';
import { Badge, ConfirmDialog, QuantityStepper, ScreenHeader, Toast } from '@jojopotato/ui';
import { Image } from 'expo-image';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHideTabBarWhile } from '@/components/floating-tab-bar';
import { FontFamily, Palette, Radii, Shadows, Spacing, TypeScale } from '@/constants/theme';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { productToMenuItem } from '@/features/cart/lib/product-to-menu-item';
import { CartHeaderButton } from '@/features/cart/components/cart-header-button';
import { AddToCartBar, getAddToCartBarHeight } from '@/features/menu/components/add-to-cart-bar';
import { DealContents } from '@/features/menu/components/deal-contents';
import { useToast } from '@/features/shared/hooks/use-toast';
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
  // Needed for the Toast's clearance: the add-to-cart bar's own paddingBottom is
  // the floating-tab-bar clearance on iOS/Android, which is insets-dependent.
  const insets = useSafeAreaInsets();
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
  const { toast, showToast, hideToast } = useToast();

  const [selection, setSelection] = useState<SelectionState>({});
  const [quantity, setQuantity] = useState(1);
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

  const handleAdd = async () => {
    if (!product) return;
    if (!selectedBranch) {
      showToast('Please select a pickup branch before adding items.', 'error');
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
    // Await the real outcome — a success toast the server didn't actually
    // confirm is worse than no toast at all (it hides a lost add).
    const ok = await addItem(menuItem, opts, quantity);
    showToast(
      ok ? 'Added to cart' : 'Could not add item — please try again',
      ok ? 'success' : 'error',
    );
  };

  const confirmBranchSwitch = async () => {
    const pending = pendingSwitch;
    setPendingSwitch(null);
    if (!pending || !selectedBranch) return;
    clearCart();
    setBranch(selectedBranch.id);
    const ok = await addItem(pending.menuItem, pending.opts, quantity);
    showToast(
      ok ? 'Added to cart' : 'Could not add item — please try again',
      ok ? 'success' : 'error',
    );
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

  const isDeal = product.isDeal === true;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title="Product Details"
          onBack={() => router.back()}
          right={<CartHeaderButton />}
          mode={mode}
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/*
            Hero: the product image in the brand's signature comic frame (2px ink
            outline + hard offset shadow), with a status pill overlaid on top. The
            back + cart controls live in the top app bar above, not on the image.
            FadeIn keeps the entrance gentle; it is a no-op under the jest-expo
            reanimated mock, so tests are unaffected.
          */}
          <Animated.View entering={FadeIn.duration(220)} style={styles.heroWrap}>
            <View
              style={[
                styles.imageWrap,
                { backgroundColor: Palette.creamTint2, borderColor: theme.border },
                Shadows.offsetMd,
              ]}
            >
              {product.imageUrl ? (
                <Image
                  source={{ uri: product.imageUrl }}
                  style={styles.image}
                  contentFit="cover"
                  transition={200}
                  accessibilityLabel={product.name}
                />
              ) : (
                <View style={[styles.imagePlaceholder, { backgroundColor: theme.tint }]}>
                  <Ionicons name="fast-food" size={64} color={Palette.ink} />
                </View>
              )}
            </View>

            <View style={styles.heroBadge}>
              <Badge
                label={isDeal ? 'Deal' : 'Available'}
                variant={isDeal ? 'warning' : 'success'}
                mode={mode}
              />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(260).delay(60)} style={styles.body}>
            <View style={styles.titleBlock}>
              <Text style={[styles.name, { color: theme.text }]}>{product.name}</Text>
              {product.description ? (
                <Text style={[styles.description, { color: theme.textSecondary }]}>
                  {product.description}
                </Text>
              ) : null}
            </View>

            {/* Price tag — a jyellow "comic" chip instead of a plain inline number. */}
            <View
              style={[
                styles.priceTag,
                { borderColor: theme.border, backgroundColor: Palette.jyellow },
                Shadows.offsetSm,
              ]}
            >
              <Text style={[styles.basePrice, { color: Palette.ink }]}>
                {formatCurrency(product.basePriceCents)}
              </Text>
              <Text style={styles.priceCaption}>base price</Text>
            </View>

            {/* Quantity — its own carded section; the sticky bar Total tracks qty × unit price. */}
            <View
              style={[
                styles.sectionCard,
                { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                Shadows.offsetSm,
              ]}
            >
              <View style={styles.quantityRow}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Quantity</Text>
                <QuantityStepper
                  value={quantity}
                  onChange={setQuantity}
                  min={1}
                  max={99}
                  mode={mode}
                />
              </View>
            </View>

            {groups.map((group) => (
              <View
                key={group.type}
                style={[
                  styles.sectionCard,
                  { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                  Shadows.offsetSm,
                ]}
              >
                <OptionGroupSelector
                  group={group}
                  required={requiredTypes.includes(group.type)}
                  selectedIds={selection[group.type] ?? []}
                  onChange={(optionId) => handleChange(group.type, optionId)}
                />
              </View>
            ))}

            {isDeal && product.components ? <DealContents components={product.components} /> : null}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      <AddToCartBar
        unitPriceCents={unitPriceCents}
        quantity={quantity}
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

      <Toast
        visible={toast.visible}
        message={toast.message}
        severity={toast.severity}
        mode={mode}
        bottomOffset={getAddToCartBarHeight(insets.bottom) + Spacing.two}
        onDismiss={hideToast}
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
  heroWrap: {
    position: 'relative',
  },
  body: {
    gap: Spacing.three,
  },
  titleBlock: {
    gap: Spacing.one,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 1.35,
    borderRadius: Radii.xl,
    borderWidth: 2,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    position: 'absolute',
    top: Spacing.three,
    right: Spacing.three,
  },
  name: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
  },
  description: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.body,
    lineHeight: TypeScale.body * 1.4,
  },
  priceTag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two + 2,
    borderWidth: 2,
    borderRadius: Radii.full,
  },
  basePrice: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  priceCaption: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.caption,
    color: Palette.ink,
    opacity: 0.7,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCard: {
    borderWidth: 2,
    borderRadius: Radii.md,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
});
