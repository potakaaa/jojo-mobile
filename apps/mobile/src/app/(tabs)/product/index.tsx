import type {
  CartItemOption,
  MenuItem,
  ProductDetail,
  ProductOption,
  ProductOptionType,
} from '@jojopotato/types';
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
import { useConfirmBranchSwitch } from '@/features/branch/hooks/use-confirm-branch-switch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { productToMenuItem } from '@/features/cart/lib/product-to-menu-item';
import { CartHeaderButton } from '@/features/cart/components/cart-header-button';
import { AddToCartBar, getAddToCartBarHeight } from '@/features/menu/components/add-to-cart-bar';
import { DealContents } from '@/features/menu/components/deal-contents';
import { useToast, type ToastState, type UseToastResult } from '@/features/shared/hooks/use-toast';
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
  /*
    B4 — cart line edit. When `lineId` is present the screen is EDITING an existing
    cart line rather than adding a new one: `optionIds` (a comma-separated list) and
    `quantity` prefill the selectors, and Save calls the edit path instead of add.
    All three are optional, so the plain add flow is completely unchanged.
  */
  const { productId, lineId, optionIds, quantity } = useLocalSearchParams<{
    productId: string;
    lineId?: string;
    optionIds?: string;
    quantity?: string;
  }>();
  const { data: product, isLoading, isError } = useProductDetails(productId);

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

  /*
    A2 — state reset on product change. `key={productId}` forces React to fully
    unmount + remount `ProductDetailsBody` whenever the route's `productId`
    param changes, which resets ALL of its `useState` (quantity, selection,
    pendingSwitch) in one mechanism.

    This is required because `product/_layout.tsx`'s static `index` anchor
    deliberately makes expo-router downgrade PUSH -> NAVIGATE (NAV-006), so
    navigating product A -> product B reuses this same mounted screen instance
    and would otherwise carry A's quantity/selection over to B.

    A `useEffect`-driven per-field reset is NOT an option here: this branch's
    `react-hooks/set-state-in-effect` ESLint rule forbids it, and a manual reset
    list silently rots as new state is added. The remount has neither problem.
  */
  return (
    <ProductDetailsBody
      key={productId}
      product={product}
      toast={toast}
      showToast={showToast}
      hideToast={hideToast}
      editLineId={lineId}
      prefillOptionIds={optionIds}
      prefillQuantity={quantity}
    />
  );
}

interface ProductDetailsBodyProps {
  product: ProductDetail;
  /*
    Toast state is owned by the OUTER screen (its `useToast()` timer must survive
    a product switch), so the three fields are threaded in explicitly rather than
    re-derived here. Never spread these into `<Toast>` — `check-theme-mode.mjs`
    hard-fails on spread attributes at a themed component's call site.
  */
  toast: ToastState;
  showToast: UseToastResult['showToast'];
  hideToast: () => void;
  /** B4: present ⇒ editing this cart line instead of adding a new one. */
  editLineId?: string;
  /** B4: comma-separated option ids to preselect (the edited line's current set). */
  prefillOptionIds?: string;
  /** B4: the edited line's current quantity, as a route-param string. */
  prefillQuantity?: string;
}

/**
 * The stateful half of Product Details. Remounted (via `key={productId}`) on
 * every product change — see the note at the call site above.
 *
 * Theme, insets, cart, and branch are re-derived from their own hooks here
 * rather than threaded as props: none of them are product-scoped, all are cheap
 * context reads, and keeping them local holds the prop surface to the four
 * values that genuinely must outlive the remount.
 */
function ProductDetailsBody({
  product,
  toast,
  showToast,
  hideToast,
  editLineId,
  prefillOptionIds,
  prefillQuantity,
}: ProductDetailsBodyProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  // Needed for the Toast's clearance: the add-to-cart bar's own paddingBottom is
  // the floating-tab-bar clearance on iOS/Android, which is insets-dependent.
  const insets = useSafeAreaInsets();
  const { cart, addItem, editCartLine, setBranch } = useCart();
  const { selectedBranch } = useBranch();
  /*
    The clear-then-switch mechanics live in the shared hook (home-all-branches D4)
    — this screen only decides WHEN to ask (cart holds other-branch items) and
    WHAT to do afterwards (add the pending line). The hook points BOTH branch
    stores at the target; the edit-save path (below) never touches it, since an
    edited line is by construction already in the current branch.
  */
  const branchSwitch = useConfirmBranchSwitch();

  const isEditing = editLineId !== undefined && editLineId !== '';

  /*
    B4 — seed the selectors from the edited line. Computed as the `useState`
    INITIALIZER, not in a `useEffect`: this branch's `react-hooks/set-state-in-effect`
    rule forbids the effect form, and the screen already remounts on `productId`
    change (`key={productId}`), so a one-shot initializer is the right lifetime.
    Unknown/stale option ids are dropped rather than trusted — the line's stored
    options may reference an option that has since been deactivated.
  */
  const [selection, setSelection] = useState<SelectionState>(() => {
    if (!prefillOptionIds) return {};
    const ids = new Set(prefillOptionIds.split(',').filter(Boolean));
    const seeded: SelectionState = {};
    for (const option of Object.values(product.options).flat()) {
      if (!ids.has(option.optionId)) continue;
      if (option.optionType === 'add_on') {
        seeded.add_on = [...(seeded.add_on ?? []), option.optionId];
      } else {
        seeded[option.optionType] = [option.optionId];
      }
    }
    return seeded;
  });
  const [quantity, setQuantity] = useState(() => {
    const parsed = Number.parseInt(prefillQuantity ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  });
  /**
   * The add-to-cart payload held back while the branch-switch confirm is up.
   * Owned by THIS component, not the shared hook — the hook only owns branch-switch
   * state, never "what to do after the switch".
   */
  const [pendingAdd, setPendingAdd] = useState<{
    menuItem: MenuItem;
    opts: CartItemOption[];
  } | null>(null);

  // The backend already returns options grouped by type (a `Record`), so build
  // the display groups inline in fixed order — no client-side `groupOptions()`
  // (plan Gap E). Server pre-sorts options within each group by `sort_order`.
  const groups = useMemo(
    () =>
      GROUP_ORDER.filter((type) => (product.options[type]?.length ?? 0) > 0).map((type) => ({
        type,
        options: product.options[type],
      })),
    [product],
  );

  const requiredTypes = useMemo(
    () => getRequiredOptionTypes(Object.values(product.options).flat()),
    [product],
  );

  // Flatten current selection to the option objects it represents.
  const selectedOptions = useMemo<ProductOption[]>(() => {
    const selectedIds = new Set(Object.values(selection).flat());
    return Object.values(product.options)
      .flat()
      .filter((option) => selectedIds.has(option.optionId));
  }, [product, selection]);

  // Unit price is a trivial cents sum: base + selected option deltas (all cents).
  // A2 note: `selection` resets to `{}` on remount, so `selectedOptions` is empty
  // and this collapses back to the bare base price for the newly-opened product.
  const unitPriceCents = useMemo(
    () =>
      product.basePriceCents +
      selectedOptions.reduce((sum, option) => sum + option.priceDeltaCents, 0),
    [product, selectedOptions],
  );

  // AC7: derives purely from `selection` + `requiredTypes`, both of which the
  // remount resets/recomputes — so eligibility can never be left evaluating the
  // previous product's stale selection.
  const canAdd = useMemo(
    () =>
      requiredTypes.every((type) => {
        const selected = selection[type]?.[0];
        return selected !== undefined && selected !== '';
      }),
    [requiredTypes, selection],
  );

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

  /** The current selection in the shape both the add and edit paths send. */
  const buildOpts = (): CartItemOption[] =>
    selectedOptions.map((option) => ({
      id: option.optionId,
      optionType: option.optionType,
      name: option.name,
      priceDeltaCents: option.priceDeltaCents,
    }));

  /*
    B4 — the edit-save path. DELIBERATELY a separate handler from `handleAdd`, not
    a branch inside it.

    `handleAdd` contains branch-switch-confirm logic: when the cart holds items for
    a DIFFERENT branch it opens the `pendingAdd` dialog, and confirming that dialog
    runs `branchSwitch.confirm()`, which CLEARS THE CART before adding. An edited
    line is BY CONSTRUCTION already in the cart's current branch, so that path is
    unreachable-by-intent here — but reusing `handleAdd` would still expose it to a
    stale/mismatched `selectedBranch`, and the failure mode is severe: the user
    believes they are editing one line and the ENTIRE cart is wiped instead.

    So this handler never reads `isSwitchingBranch`, never calls `setPendingAdd`,
    and never touches `branchSwitch` or `setBranch`. It only ever replaces one
    line's options. That absence is asserted by a regression test.
  */
  const handleSaveEdit = async () => {
    if (!isEditing) return;
    // `quantity` is passed deliberately: the QuantityStepper below is live and
    // prefilled from the edited line, so omitting it here would silently discard
    // a change the UI actively invited. The route merges quantity and options in
    // one request.
    const ok = await editCartLine(editLineId, buildOpts(), quantity);
    if (!ok) {
      showToast('Could not update the item — please try again', 'error');
      return;
    }
    showToast('Item updated', 'success');
    router.back();
  };

  const handleAdd = async () => {
    if (!selectedBranch) {
      showToast('Please select a pickup branch before adding items.', 'error');
      return;
    }

    const opts: CartItemOption[] = buildOpts();
    const menuItem = productToMenuItem(product, product.isAvailable);

    const isSwitchingBranch = cart.items.length > 0 && cart.pickupBranchId !== selectedBranch.id;
    if (isSwitchingBranch) {
      // Friendly confirm instead of a raw system alert (AC-A4). The clear-and-
      // switch itself now lives in the shared hook (home-all-branches D4); this
      // screen only stages the payload and asks the hook to confirm.
      setPendingAdd({ menuItem, opts });
      branchSwitch.requestSwitch(selectedBranch.id);
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
      // Success only: the confirmation was a dead end before this — nothing in
      // it led anywhere. The failure toast gets no action; there is nothing to
      // view.
      ok ? { label: 'View cart', onPress: () => router.push('/(tabs)/cart') } : undefined,
    );
  };

  const confirmBranchSwitch = async () => {
    const pending = pendingAdd;
    setPendingAdd(null);
    if (!pending || !selectedBranch) return;
    // The switch must fully resolve BEFORE the line is added, so the item lands
    // in a cart that already belongs to the target branch. The hook owns the
    // clear-then-switch; this screen only adds afterwards.
    const switched = await branchSwitch.confirm();
    if (!switched) {
      showToast('That branch is no longer available — please pick another.', 'error');
      return;
    }
    const ok = await addItem(pending.menuItem, pending.opts, quantity);
    showToast(
      ok ? 'Added to cart' : 'Could not add item — please try again',
      ok ? 'success' : 'error',
      // Success only: the confirmation was a dead end before this — nothing in
      // it led anywhere. The failure toast gets no action; there is nothing to
      // view.
      ok ? { label: 'View cart', onPress: () => router.push('/(tabs)/cart') } : undefined,
    );
  };

  const cancelBranchSwitch = () => {
    setPendingAdd(null);
    branchSwitch.cancel();
  };

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
        onAdd={isEditing ? handleSaveEdit : handleAdd}
      />

      <ConfirmDialog
        visible={pendingAdd !== null}
        title="Switch branch?"
        message={`Your cart has items from a different branch. Clear it and start a new order at ${selectedBranch?.name ?? 'this branch'}?`}
        confirmLabel="Clear and switch"
        cancelLabel="Cancel"
        variant="destructive"
        mode={mode}
        onConfirm={confirmBranchSwitch}
        onCancel={cancelBranchSwitch}
      />

      <Toast
        visible={toast.visible}
        message={toast.message}
        severity={toast.severity}
        mode={mode}
        bottomOffset={getAddToCartBarHeight(insets.bottom) + Spacing.two}
        onDismiss={hideToast}
        actionLabel={toast.actionLabel}
        onAction={toast.onAction}
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
