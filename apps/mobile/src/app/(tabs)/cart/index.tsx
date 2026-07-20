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
  Toast,
} from '@jojopotato/ui';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_FOOTPRINT, useHideTabBarWhile } from '@/components/floating-tab-bar';
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
import { useToast } from '@/features/shared/hooks/use-toast';
import {
  FontFamily,
  MaxContentWidth,
  MinTouchTarget,
  Radii,
  Spacing,
  TypeScale,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Rendered height of the sticky checkout footer, derived from `styles.footer`'s
 * own padding plus the Button's real `minHeight` (`MinTouchTarget`, button.tsx) —
 * same "derived from the real styles below" convention as `BAR_CONTENT_HEIGHT`
 * in floating-tab-bar.tsx. Anything anchored above the footer (a Toast) sizes
 * itself off this rather than a guessed number.
 *
 * A FUNCTION of `insets.bottom`, not a static export — same reason as
 * `resolveTabBarClearance`. On iOS/Android the footer's paddingBottom is the
 * floating-tab-bar clearance plus its base padding, which is device-dependent; a
 * static constant could only describe the web variant. A previous static
 * `CART_FOOTER_HEIGHT` did exactly that and under-reported the real iOS/Android
 * height by ~93dp + insets, letting the Toast paint over the Checkout button.
 */

/** styles.footer's own paddingTop. */
const FOOTER_PADDING_TOP = Spacing.three; // 16
/** styles.footer's base paddingBottom — its FULL paddingBottom on web. */
const FOOTER_BASE_PADDING_BOTTOM = Spacing.two; // 8

/**
 * The footer's real paddingBottom. SINGLE SOURCE: both the rendered style and
 * `getCartFooterHeight` read this, so the height cannot drift from what paints.
 * cart.tsx is always a pushed (nested) screen in Order's Stack — isNested
 * hardcoded true, same invariant as the other `resolveTabBarClearance(true, …)`
 * call sites in this file — so the floating tab bar's footprint is never
 * reserved here, only the device inset plus the footer's own base padding.
 */
const getCartFooterPaddingBottom = (insetsBottom: number): number =>
  Platform.OS === 'web'
    ? FOOTER_BASE_PADDING_BOTTOM
    : resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insetsBottom) + FOOTER_BASE_PADDING_BOTTOM;

/**
 * Total rendered height (dp) of the sticky checkout footer.
 * web: 16 + 48 + 8 = 72. iOS/Android: 16 + 48 + (93 + insets + 8) = 165 + insets.
 */
export const getCartFooterHeight = (insetsBottom: number): number =>
  FOOTER_PADDING_TOP + MinTouchTarget + getCartFooterPaddingBottom(insetsBottom);

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
 *
 * This is the ROOT of the top-level `(tabs)/cart` stack (NAV-005 moved it out of
 * the Order tab so back returns to the calling tab; see `./_layout.tsx`).
 */
export default function CartScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();
  const { toast, showToast, hideToast } = useToast();

  /*
    Hide the floating tab bar on this screen. Cart is a leaf screen you enter and
    leave, but it is now the ROOT of its own top-level stack — so
    `isNestedTabRoute()` is false and the bar would otherwise paint here.
    `useHideTabBarWhile` is the existing cross-tree seam for exactly this (it is
    OR-composed with the nested check in floating-tab-bar.tsx). Gated on FOCUS,
    not just mount: this screen stays mounted in the Tabs navigator after the user
    navigates away, and an always-true flag would leave the bar hidden on the
    destination. Losing focus restores it; unmount also restores.
  */
  useHideTabBarWhile(useIsFocused());

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
      // 'warning', not 'error': the user did nothing wrong, but their cart just
      // changed with a real cost (a higher total). Tap-required, so it cannot be
      // missed the way an auto-dismissing success can.
      showToast(`Deal removed — ${result.message}`, 'warning');
    }
  }, [cart, appliedDeal, usage, user?.id, clearDiscount, showToast]);

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
      // Same rationale as the deal-removed notice above: an automatic change
      // that silently costs the user a reward if they miss it.
      showToast('Cart updated — re-apply your reward code to redeem it.', 'warning');
    }
  }, [itemsSignature, cart.appliedDiscount, clearDiscount, showToast]);

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
        showToast(result.message, 'error');
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
    <Card style={styles.conflictCard} mode={mode}>
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
        The floating tab bar is hidden here — via useHideTabBarWhile(useIsFocused())
        above, NOT because this screen is nested (NAV-005 made it top-level). The
        clearance calls below therefore still drop its ~85dp footprint (see
        resolveTabBarClearance).

        TOP edge only (NAV-003). This stack runs `headerShown:false` (see
        ./_layout.tsx), so the top inset is ours to supply — without it the
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
                  // `true` selects the no-footprint branch: the floating bar is HIDDEN
                  // on this screen (via useHideTabBarWhile above), so reserving its
                  // ~85dp footprint would be dead space. Only the device safe-area inset
                  // is kept. NOTE: the helper's param is named `isNested` and this screen
                  // is top-level, not nested (NAV-005) — what the branch actually selects
                  // is "bar not rendered here", which is true either way. The name is not
                  // renamed on purpose: the helper is shared with other call sites and a
                  // unit test (NAV-001 owns it).
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
              testID="cart-footer"
              style={[
                styles.footer,
                // Always set from the single source above (which returns the web
                // value on web) rather than overriding a StyleSheet default — an
                // overridden default is invisible to anything reading the
                // StyleSheet, which is how the Toast overlap shipped.
                { paddingBottom: getCartFooterPaddingBottom(insets.bottom) },
              ]}
            >
              <Button
                label={`Checkout • ${itemCount} item${itemCount === 1 ? '' : 's'}`}
                onPress={() => router.push('/(tabs)/cart/checkout')}
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

        <Toast
          visible={toast.visible}
          message={toast.message}
          severity={toast.severity}
          mode={mode}
          bottomOffset={getCartFooterHeight(insets.bottom) + Spacing.two}
          onDismiss={hideToast}
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
    paddingTop: FOOTER_PADDING_TOP,
    // NOTE: no `paddingBottom` here on purpose — it is always supplied by
    // `getCartFooterPaddingBottom` at the render site so there is one source.
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
