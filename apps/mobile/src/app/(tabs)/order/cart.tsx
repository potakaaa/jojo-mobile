import type { CartItemOption, MenuItem, PickupBranch, PickupTime } from '@jojopotato/types';
import {
  BranchCard,
  Button,
  CartItem,
  CartSummary,
  CouponCard,
  EmptyState,
  Input,
} from '@jojopotato/ui';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { useCart } from '@/features/cart/hooks/use-cart';
import { productToMenuItem } from '@/features/cart/lib/product-to-menu-item';
import {
  MOCK_BRANCH_PREP_MINUTES,
  MOCK_CART_BRANCH,
  MOCK_OTHER_BRANCH,
} from '@/features/cart/mock-cart';
import { resolveAndApplyDeal } from '@/features/deals/lib/apply-deal';
import { checkDealEligibility } from '@/features/deals/lib/eligibility';
import { MOCK_DEAL_USAGE, MOCK_DEALS } from '@/features/deals/mock-deals';
import { MOCK_PRODUCTS } from '@/features/home/mock-home';
import { FontFamily, MaxContentWidth, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** Known branches, keyed by id, for resolving `cart.pickupBranchId` to a card. */
const BRANCHES: Record<string, PickupBranch> = {
  [MOCK_CART_BRANCH.id]: MOCK_CART_BRANCH,
  [MOCK_OTHER_BRANCH.id]: MOCK_OTHER_BRANCH,
};

/** Build the display-only estimated pickup time (D5): now + branch prep minutes. */
function estimatedPickup(prepMinutes: number): PickupTime {
  const ready = new Date(Date.now() + prepMinutes * 60_000);
  const label = ready.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return {
    id: 'cart-eta',
    label: `Ready ~ ${label}`,
    isoTime: ready.toISOString(),
    isAvailable: true,
  };
}

/** Resolve a cart line to a `MenuItem` for `<CartItem>` (snapshot-consistent). */
function productForLine(
  menuItemId: string,
  nameSnapshot: string,
  unitPriceCents: number,
): MenuItem {
  const catalog = MOCK_PRODUCTS.find((p) => p.id === menuItemId);
  return {
    id: menuItemId,
    name: nameSnapshot,
    // Use the snapshot unit price so the row total matches the cart math exactly.
    priceCents: unitPriceCents,
    categoryId: catalog?.categoryId ?? '',
    imageUrl: catalog?.imageUrl ?? undefined,
    isAvailable: true,
  };
}

/**
 * Cart screen (CART-001). Renders the selected branch, line items with quantity
 * steppers + remove, an estimated pickup time, a coupon/reward slot, and the
 * subtotal/discount/total summary — all driven by the in-memory `useCart()`
 * seam. Backend, checkout, and real pricing are out of scope (CART-002).
 */
export default function CartScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();

  const {
    cart,
    subtotalCents,
    discountTotalCents,
    totalCents,
    itemCount,
    updateQuantity,
    removeItem,
    applyDiscount,
    clearDiscount,
    clearCart,
    setBranch,
    addItem,
  } = useCart();

  const [couponCode, setCouponCode] = useState('');

  const branch = BRANCHES[cart.pickupBranchId] ?? MOCK_CART_BRANCH;
  const pickupTime = useMemo(() => estimatedPickup(MOCK_BRANCH_PREP_MINUTES), []);
  const isEmpty = cart.items.length === 0;

  // Re-lookup the applied deal from the mock catalog so richer display data
  // (title, discountLabel) is sourced from the catalog, not just the stored
  // label (deals-screens plan Decision #3). Falls back to stored fields on miss.
  const appliedDeal = useMemo(
    () =>
      cart.appliedDiscount
        ? MOCK_DEALS.find((d) => d.id === cart.appliedDiscount?.refId)
        : undefined,
    [cart.appliedDiscount],
  );

  // Expiry/ineligibility-at-checkout: if the applied deal has become ineligible
  // (e.g. expired window, or subtotal dropped below its minimum after removing
  // items), auto-clear it with a one-time notice. Home for this recheck is
  // cart.tsx — checkout.tsx is a bare ComingSoon placeholder with no mount-time
  // state to hook into (deals-screens plan step 9/12).
  useEffect(() => {
    const applied = cart.appliedDiscount;
    if (!applied) return;
    const deal = MOCK_DEALS.find((d) => d.id === applied.refId);
    if (!deal) return;
    const result = checkDealEligibility(deal, cart, cart.pickupBranchId, MOCK_DEAL_USAGE);
    if (!result.eligible) {
      clearDiscount();
      Alert.alert('Deal removed', result.message);
    }
  }, [cart, clearDiscount]);

  const handleApplyCoupon = () => {
    const code = couponCode.trim();
    if (!code) return;

    const doApply = () => {
      // Known gap: usage is not persisted here — real consumption happens at
      // order placement (out of scope this round).
      const result = resolveAndApplyDeal(code, cart, cart.pickupBranchId, MOCK_DEAL_USAGE);
      if (!result.ok) {
        // Keep couponCode on failure so the user can see what they typed.
        Alert.alert('Cannot apply deal', result.message);
        return;
      }
      applyDiscount(result.discount);
      setCouponCode('');
    };

    // One-deal-per-cart: replace-with-confirmation (mirrors this file's
    // branch-switch confirmation UX; deals-screens plan step 11).
    if (cart.appliedDiscount) {
      Alert.alert(
        'Replace applied deal?',
        `This cart already has '${cart.appliedDiscount.label}' applied.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', onPress: doApply },
        ],
      );
      return;
    }
    doApply();
  };

  // AC6 (D4): adding a product from a different branch must prompt to clear and
  // switch, never silently mix branches. Dev-only affordance to exercise it.
  const handleAddFromOtherBranch = () => {
    const other = MOCK_OTHER_BRANCH;
    const sampleProduct =
      MOCK_PRODUCTS.find((p) => p.id === 'corndog-mozzarella') ?? MOCK_PRODUCTS[0];
    if (!sampleProduct) return;
    const sample = productToMenuItem(sampleProduct);
    const opts: CartItemOption[] = [];
    if (cart.pickupBranchId === other.id || cart.items.length === 0) {
      setBranch(other.id);
      addItem(sample, opts);
      return;
    }
    Alert.alert(
      'Switch branch?',
      `Your cart has items from ${branch.name}. Clear it and start a new order at ${other.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear and switch',
          style: 'destructive',
          onPress: () => {
            clearCart();
            setBranch(other.id);
            addItem(sample, opts);
          },
        },
      ],
    );
  };

  // Switch pickup to the other mock branch. If the cart has items, switching
  // clears it first (branches can't be mixed — same D4 rule as above).
  const handleChangeBranch = () => {
    const nextBranch =
      cart.pickupBranchId === MOCK_CART_BRANCH.id ? MOCK_OTHER_BRANCH : MOCK_CART_BRANCH;
    if (cart.items.length === 0) {
      setBranch(nextBranch.id);
      return;
    }
    Alert.alert(
      'Change branch?',
      `Switching to ${nextBranch.name} will clear your current cart from ${branch.name}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change & clear',
          style: 'destructive',
          onPress: () => {
            clearCart();
            setBranch(nextBranch.id);
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={[]}>
        {isEmpty ? (
          <EmptyState
            iconName="cart-outline"
            title="Your cart is empty"
            description="Add some fries and snacks to get started."
            actionLabel="Browse menu"
            onAction={() => router.push('/(tabs)/order')}
            mode={mode}
          />
        ) : (
          <>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              <BranchCard
                branch={branch}
                mode={mode}
                onChange={handleChangeBranch}
                footer={
                  <View style={styles.pickupRow}>
                    <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>
                      Estimated pickup
                    </Text>
                    <Text style={[styles.pickupValue, { color: theme.text }]}>
                      {pickupTime.label}
                    </Text>
                  </View>
                }
              />

              <View
                style={[
                  styles.itemsCard,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.sectionLabel, { color: theme.text }]}>Items</Text>
                {cart.items.map((line) => (
                  <CartItem
                    key={line.lineId}
                    item={line}
                    product={productForLine(
                      line.menuItemId,
                      line.productNameSnapshot,
                      line.unitPriceCents,
                    )}
                    onIncrement={() => updateQuantity(line.lineId, line.quantity + 1)}
                    onDecrement={() => updateQuantity(line.lineId, line.quantity - 1)}
                    onRemove={() => removeItem(line.lineId)}
                    mode={mode}
                    style={styles.cartItemFlat}
                  />
                ))}
              </View>

              <View style={styles.couponSlot}>
                <Text style={[styles.sectionLabel, { color: theme.text }]}>Coupon / reward</Text>
                {cart.appliedDiscount ? (
                  <>
                    <CouponCard
                      coupon={{
                        id: cart.appliedDiscount.refId,
                        code: appliedDeal?.code ?? cart.appliedDiscount.label,
                        title: appliedDeal?.title ?? 'Applied discount',
                        discountLabel:
                          appliedDeal?.discountLabel ?? `-${(discountTotalCents / 100).toFixed(2)}`,
                        isRedeemed: false,
                      }}
                      mode={mode}
                    />
                    <Button
                      label="Remove discount"
                      variant="outline"
                      onPress={clearDiscount}
                      mode={mode}
                    />
                  </>
                ) : (
                  <View style={styles.couponEntry}>
                    <View style={styles.couponInput}>
                      <Input
                        value={couponCode}
                        onChangeText={setCouponCode}
                        placeholder="Enter coupon code"
                        autoCapitalize="characters"
                        mode={mode}
                      />
                    </View>
                    <Button label="Apply" size="sm" onPress={handleApplyCoupon} mode={mode} />
                  </View>
                )}
              </View>

              <CartSummary
                subtotalCents={subtotalCents}
                discountCents={discountTotalCents}
                discountLabel={cart.appliedDiscount?.label}
                totalCents={totalCents}
                mode={mode}
              />

              {__DEV__ ? (
                <Button
                  label="Dev: add item from another branch"
                  variant="outline"
                  onPress={handleAddFromOtherBranch}
                  mode={mode}
                />
              ) : null}
            </ScrollView>

            <View
              style={[
                styles.footer,
                Platform.OS !== 'web' && {
                  paddingBottom: getFloatingTabBarClearance(insets.bottom),
                },
              ]}
            >
              <Button
                label={`Checkout • ${itemCount} item${itemCount === 1 ? '' : 's'}`}
                onPress={() => router.push('/(tabs)/order/checkout')}
                disabled={isEmpty}
                mode={mode}
              />
            </View>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  pickupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  metaLabel: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
  },
  pickupValue: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  itemsCard: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderWidth: 2,
    borderRadius: Radii.md,
  },
  cartItemFlat: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
  },
  couponSlot: {
    gap: Spacing.two,
  },
  sectionLabel: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  couponEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  couponInput: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
});
