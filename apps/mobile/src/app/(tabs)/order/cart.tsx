import type { MenuItem, PickupBranch, PickupTime } from '@jojopotato/types';
import {
  Badge,
  BranchCard,
  Button,
  Card,
  CartItem,
  CartSummary,
  ConfirmDialog,
  CouponCard,
  EmptyState,
  Input,
  ScreenHeader,
} from '@jojopotato/ui';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_FOOTPRINT } from '@/components/floating-tab-bar';
import { resolveTabBarClearance } from '@/components/floating-tab-bar.helpers';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { setAppliedCouponCode } from '@/features/cart/applied-coupon-code';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useReorderConflicts } from '@/features/cart/hooks/use-reorder-conflicts';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useDeal } from '@/features/deals/hooks/use-deal';
import { useDealUsage } from '@/features/deals/hooks/use-deal-usage';
import { resolveAndApplyDeal } from '@/features/deals/lib/apply-deal';
import { checkDealEligibility } from '@/features/deals/lib/eligibility';
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
 * (real deal data via `useDeal` + client-side eligibility engine), and the
 * subtotal/total summary — all driven by the in-memory `useCart()` seam wired to
 * the real branch backend.
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
    clearDiscount,
    applyDiscount,
  } = useCart();

  const { branches, isLoading: branchesLoading, isError: branchesError, refetch } = useBranch();
  const branch = branches.find((b) => b.id === cart.pickupBranchId) ?? null;

  const [couponCode, setCouponCode] = useState('');
  const [applying, setApplying] = useState(false);
  // Destructive-confirm state (AC-A4): a pending coupon code awaiting a
  // replace-confirm, and a pending next branch awaiting a change-confirm.
  const [pendingReplaceCode, setPendingReplaceCode] = useState<string | null>(null);
  const [pendingBranchSwitch, setPendingBranchSwitch] = useState<PickupBranch | null>(null);

  const { user } = useAuth();
  const usage = useDealUsage();

  const { conflicts, clearConflicts } = useReorderConflicts();

  const isEmpty = cart.items.length === 0;
  const hasConflicts = conflicts.length > 0;
  const pickupTime = useMemo(
    () => estimatedPickup(branch?.estimatedPrepMinutes ?? 20),
    [branch?.estimatedPrepMinutes],
  );

  // Signature of the cart's line items — drives the reward-clear guard below.
  const itemsSignature = useMemo(
    () => cart.items.map((it) => `${it.lineId}x${it.quantity}`).join('|'),
    [cart.items],
  );
  const rewardBaselineSigRef = useRef<string | null>(null);

  // Re-fetch the applied deal from the real deals API so richer display data
  // (title, discountLabel) is sourced from the backend, not just the stored
  // label (deals-screens plan Decision #3). `useDeal` no-ops on a falsy id and
  // returns `undefined` on miss; downstream reads fall back to stored fields.
  const { data: appliedDeal } = useDeal(cart.appliedDiscount?.refId ?? '');

  // Expiry/ineligibility-at-checkout: if the applied deal has become ineligible
  // (e.g. expired window, or subtotal dropped below its minimum after removing
  // items), auto-clear it with a one-time notice. Home for this recheck is
  // cart.tsx — checkout.tsx is a bare ComingSoon placeholder with no mount-time
  // state to hook into (deals-screens plan step 9/12). Uses the real deal +
  // real per-user usage (order history's `deal_id`) + signed-in user id.
  useEffect(() => {
    if (!cart.appliedDiscount || !appliedDeal) return;
    const result = checkDealEligibility(appliedDeal, cart, cart.pickupBranchId, usage, user?.id);
    if (!result.eligible) {
      clearDiscount();
      setAppliedCouponCode(null);
      Alert.alert('Deal removed', result.message);
    }
  }, [cart, appliedDeal, usage, user?.id, clearDiscount]);

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

  // Server round-trip (STAR-004): deal + reward codes are validated + priced by
  // POST /coupons/apply (zero DB mutation — the coupon is only consumed at
  // checkout). On success we stash the raw code so checkout can thread it to
  // POST /orders, where it is re-validated and actually consumed. If the eligible
  // item is later removed from the cart, the server recompute at placement
  // rejects the order with a clear message (never a silent full-price charge).
  const runApply = async (code: string) => {
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
      rewardBaselineSigRef.current = result.discount.source === 'reward' ? itemsSignature : null;
      setCouponCode('');
    } finally {
      setApplying(false);
    }
  };

  const handleApplyCoupon = () => {
    const code = couponCode.trim();
    if (!code || applying) return;

    // One-discount-per-cart: replace-with-confirmation (friendly ConfirmDialog,
    // AC-A4; underlying apply action unchanged).
    if (cart.appliedDiscount) {
      setPendingReplaceCode(code);
      return;
    }
    void runApply(code);
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
    // Friendly confirm instead of a raw system alert (AC-A4). The clear-and-switch
    // action is unchanged — it just runs on confirm.
    setPendingBranchSwitch(nextBranch);
  };

  const confirmBranchSwitch = () => {
    const next = pendingBranchSwitch;
    setPendingBranchSwitch(null);
    if (!next) return;
    clearConflicts();
    clearCart();
    setBranch(next.id);
  };

  const canChangeBranch = branches.length > 1;

  // DECISION 5 / E1 (VALIDATE P1): the reorder conflict notice renders whenever
  // there are conflicts, REGARDLESS of empty/loading/error — so an all-unavailable
  // reorder (0 available → empty cart) still surfaces the explanation instead of a
  // bare "Your cart is empty" (AC13: never silently dropped). Conflicts are held
  // out-of-band (they never enter cart.items), so totals/checkout stay clean.
  const conflictNotice = hasConflicts ? (
    <Card style={styles.conflictCard}>
      <Text style={[styles.conflictTitle, { color: theme.text }]}>Some items are unavailable</Text>
      <Text style={[styles.conflictBody, { color: theme.textSecondary }]}>
        These items from your past order can&apos;t be added at this branch today, so they were left
        out. Everything else is in your cart.
      </Text>
      {conflicts.map((conflict, index) => (
        <View key={`${conflict.productName}-${index}`} style={styles.conflictRow}>
          <Text style={[styles.conflictName, { color: theme.text }]} numberOfLines={1}>
            {conflict.productName}
          </Text>
          <Badge
            label={conflict.reason === 'product_unavailable' ? 'Unavailable' : 'Option unavailable'}
            variant="danger"
            mode={mode}
          />
        </View>
      ))}
      <Button
        label="Remove unavailable & continue"
        variant="outline"
        onPress={clearConflicts}
        mode={mode}
      />
    </Card>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/*
        NESTED screen: the floating tab bar is hidden here, so the clearance
        calls below drop its ~85dp footprint (see resolveTabBarClearance).

        TOP edge only (NAV-003). This stack now runs `headerShown:false` (see
        ../_layout.tsx), so the top inset is ours to supply — without it the
        ScreenHeader title would sit under the status bar.

        'bottom' is deliberately GONE, resolving the double-count NAV-001's
        EXECUTE report flagged: the device bottom inset now arrives exactly ONCE,
        via the two resolveTabBarClearance(true, …) calls below (scroll content +
        footer). Keeping 'bottom' here would count it a second time.
      */}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Cart" onBack={() => router.back()} mode={mode} />
        {conflictNotice}
        {isEmpty ? (
          // When the cart is empty AND there are conflicts (all-unavailable reorder),
          // the notice above already explains the situation — suppress the bare empty
          // state to avoid a confusing "Your cart is empty" with no context.
          hasConflicts ? null : (
            <EmptyState
              iconName="cart-outline"
              title="Your cart is empty"
              description="Add some fries and snacks to get started."
              actionLabel="Browse menu"
              onAction={() => router.push('/(tabs)/order')}
              mode={mode}
            />
          )
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
                  // isNested hardcoded true: cart.tsx is always pushed inside the
                  // Order tab's Stack — never that tab's root — so isNestedTabRoute()
                  // would also evaluate true here; hardcoded per INNOVATE's
                  // static-per-screen-fact decision (see PLAN "Locked Inputs"). If this
                  // file ever moves to a tab root, this literal must change.
                  paddingBottom:
                    resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom) +
                    Spacing.six +
                    Spacing.two,
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
                  // isNested hardcoded true — same structural invariant as the scroll
                  // content above (cart.tsx is always a pushed screen in Order's Stack).
                  paddingBottom:
                    resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom) + Spacing.two,
                },
              ]}
            >
              <Button
                label={`Checkout • ${itemCount} item${itemCount === 1 ? '' : 's'}`}
                onPress={() => router.push('/(tabs)/order/checkout')}
                disabled={isEmpty || hasConflicts}
                mode={mode}
              />
            </View>
          </>
        )}

        <ConfirmDialog
          visible={pendingReplaceCode !== null}
          title="Replace applied discount?"
          message={`This cart already has '${cart.appliedDiscount?.label ?? ''}' applied.`}
          confirmLabel="Replace"
          cancelLabel="Cancel"
          variant="destructive"
          mode={mode}
          onConfirm={() => {
            const code = pendingReplaceCode;
            setPendingReplaceCode(null);
            if (code) void runApply(code);
          }}
          onCancel={() => setPendingReplaceCode(null)}
        />

        <ConfirmDialog
          visible={pendingBranchSwitch !== null}
          title="Change branch?"
          message={`Switching to ${pendingBranchSwitch?.name ?? ''} will clear your current cart from ${branch?.name ?? 'this branch'}.`}
          confirmLabel="Change & clear"
          cancelLabel="Cancel"
          variant="destructive"
          mode={mode}
          onConfirm={confirmBranchSwitch}
          onCancel={() => setPendingBranchSwitch(null)}
        />
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
  couponEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  couponInput: {
    flex: 1,
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
  conflictCard: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    gap: Spacing.two,
  },
  conflictTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  conflictBody: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
  },
  conflictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  conflictName: {
    flex: 1,
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.body,
  },
});
