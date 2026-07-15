import type { MenuItem, PickupTime } from '@jojopotato/types';
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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { setAppliedCouponCode } from '@/features/cart/applied-coupon-code';
import { useCart } from '@/features/cart/hooks/use-cart';
import { resolveAndApplyDeal } from '@/features/deals/lib/apply-deal';
import { checkDealEligibility } from '@/features/deals/lib/eligibility';
import { MOCK_DEAL_USAGE, MOCK_DEALS } from '@/features/deals/mock-deals';
import { ScreenLoader, ScreenMessage } from '@/features/shared/components/screen-message';
import { FontFamily, MaxContentWidth, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

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
  return {
    id: menuItemId,
    name: nameSnapshot,
    // Use the snapshot unit price so the row total matches the cart math exactly.
    priceCents: unitPriceCents,
    categoryId: '',
    // No per-line image snapshot on the canonical Cart shape — CartItem renders a
    // placeholder for a falsy imageUrl (accepted cosmetic gap, see plan Step 5.5).
    imageUrl: undefined,
    isAvailable: true,
  };
}

/**
 * Cart screen. Renders the selected branch (real branch data), line items with
 * quantity steppers + remove, an estimated pickup time, coupon/deal apply-remove
 * (mock deal catalog + client-side eligibility engine), and the subtotal/total
 * summary — all driven by the in-memory `useCart()` seam wired to the real
 * branch backend.
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
    clearCart,
    setBranch,
    applyDiscount,
    clearDiscount,
  } = useCart();

  const { branches, isLoading: branchesLoading, isError: branchesError, refetch } = useBranch();
  const branch = branches.find((b) => b.id === cart.pickupBranchId) ?? null;

  const [couponCode, setCouponCode] = useState('');
  const [applying, setApplying] = useState(false);

  const isEmpty = cart.items.length === 0;
  const pickupTime = useMemo(
    () => estimatedPickup(branch?.estimatedPrepMinutes ?? 20),
    [branch?.estimatedPrepMinutes],
  );

  const itemsSignature = useMemo(
    () => cart.items.map((it) => `${it.lineId}x${it.quantity}`).join('|'),
    [cart.items],
  );
  const rewardBaselineSigRef = useRef<string | null>(null);

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
      setAppliedCouponCode(null);
      Alert.alert('Deal removed', result.message);
    }
  }, [cart, clearDiscount]);

  // Reward coupons: eligibility (eligible_product_id) is server-side only, so we
  // can't re-validate locally. Any cart-item change after a reward is applied
  // clears it — the user re-applies (which re-validates server-side). Deals keep
  // their own precise eligibility re-check (the effect above). Does NOT fire on
  // the initial apply: the baseline sig is captured at apply time.
  useEffect(() => {
    if (cart.appliedDiscount?.source !== 'reward') return;
    if (rewardBaselineSigRef.current === null) {
      // Reward applied but no baseline yet (e.g. after a remount) — capture, don't clear.
      rewardBaselineSigRef.current = itemsSignature;
      return;
    }
    if (rewardBaselineSigRef.current !== itemsSignature) {
      rewardBaselineSigRef.current = null;
      clearDiscount();
      setAppliedCouponCode(null);
      Alert.alert('Cart updated', 'Re-apply your reward code to redeem it.');
    }
  }, [itemsSignature, cart.appliedDiscount, clearDiscount]);

  const handleRemoveDiscount = () => {
    clearDiscount();
    setAppliedCouponCode(null);
    rewardBaselineSigRef.current = null;
  };

  const handleApplyCoupon = () => {
    const code = couponCode.trim();
    if (!code || applying) return;

    // Server round-trip (STAR-004): deal + reward codes are validated + priced by
    // POST /coupons/apply (zero DB mutation — the coupon is only consumed at
    // checkout). On success we stash the raw code so checkout can thread it to
    // POST /orders, where it is re-validated and actually consumed. If the eligible
    // item is later removed from the cart, the server recompute at placement
    // rejects the order with a clear message (never a silent full-price charge).
    const doApply = async () => {
      setApplying(true);
      try {
        const result = await resolveAndApplyDeal(code, cart, cart.pickupBranchId);
        if (!result.ok) {
          // Keep couponCode on failure so the user can see what they typed.
          Alert.alert('Cannot apply code', result.message);
          return;
        }
        applyDiscount(result.discount);
        setAppliedCouponCode(code);
        rewardBaselineSigRef.current =
          result.discount.source === 'reward' ? itemsSignature : null;
        setCouponCode('');
      } finally {
        setApplying(false);
      }
    };

    // One-discount-per-cart: replace-with-confirmation (mirrors this file's
    // branch-switch confirmation UX; deals-screens plan step 11).
    if (cart.appliedDiscount) {
      Alert.alert(
        'Replace applied discount?',
        `This cart already has '${cart.appliedDiscount.label}' applied.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', onPress: () => void doApply() },
        ],
      );
      return;
    }
    void doApply();
  };

  // Switch pickup to the next real branch (cyclic). If the cart has items,
  // switching clears it first (branches can't be mixed — single-branch per order).
  const handleChangeBranch = () => {
    if (branches.length <= 1) return;
    const currentIndex = branches.findIndex((b) => b.id === cart.pickupBranchId);
    const nextBranch = branches[(currentIndex + 1) % branches.length];
    if (!nextBranch || nextBranch.id === cart.pickupBranchId) return;
    if (cart.items.length === 0) {
      setBranch(nextBranch.id);
      return;
    }
    Alert.alert(
      'Change branch?',
      `Switching to ${nextBranch.name} will clear your current cart from ${branch?.name ?? 'this branch'}.`,
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

  const canChangeBranch = branches.length > 1;

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
        ) : branchesLoading ? (
          <ScreenLoader />
        ) : branchesError || !branch ? (
          <ScreenMessage
            title="Couldn't load your pickup branch"
            subtitle="Please try again."
            actionLabel="Retry"
            onAction={refetch}
          />
        ) : (
          <>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.content,
                Platform.OS !== 'web' && {
                  paddingBottom:
                    getFloatingTabBarClearance(insets.bottom) + Spacing.six + Spacing.two,
                },
              ]}
              showsVerticalScrollIndicator={false}
            >
              <BranchCard
                branch={branch}
                mode={mode}
                onChange={canChangeBranch ? handleChangeBranch : undefined}
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
                    flavor={line.selectedOptions.find((o) => o.optionType === 'flavor')?.name}
                    size={line.selectedOptions.find((o) => o.optionType === 'size')?.name}
                    onIncrement={() => updateQuantity(line.lineId, line.quantity + 1)}
                    onDecrement={() => updateQuantity(line.lineId, line.quantity - 1)}
                    onRemove={() => removeItem(line.lineId)}
                    mode={mode}
                    style={styles.cartItemFlat}
                  />
                ))}
              </View>

              <View
                style={[
                  styles.couponSlot,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}
              >
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
                      style={styles.couponFlat}
                    />
                    <Button
                      label="Remove discount"
                      variant="accent"
                      onPress={handleRemoveDiscount}
                      mode={mode}
                      style={styles.removeDiscountButton}
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
                    <Button
                      label="Apply"
                      size="sm"
                      onPress={handleApplyCoupon}
                      loading={applying}
                      disabled={applying}
                      mode={mode}
                    />
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
            </ScrollView>

            <View
              style={[
                styles.footer,
                Platform.OS !== 'web' && {
                  paddingBottom: getFloatingTabBarClearance(insets.bottom) + Spacing.two,
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
  couponFlat: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  removeDiscountButton: {
    shadowOpacity: 0,
    elevation: 0,
  },
  couponSlot: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderWidth: 2,
    borderRadius: Radii.md,
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
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
});
