import type { MenuItem, PickupTime } from '@jojopotato/types';
import {
  Badge,
  BranchCard,
  Button,
  Card,
  CartItem,
  CartSummary,
  CouponCard,
  EmptyState,
} from '@jojopotato/ui';
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useReorderConflicts } from '@/features/cart/hooks/use-reorder-conflicts';
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
    clearDiscount,
  } = useCart();

  const { branches, isLoading: branchesLoading, isError: branchesError, refetch } = useBranch();
  const branch = branches.find((b) => b.id === cart.pickupBranchId) ?? null;

  const { conflicts, clearConflicts } = useReorderConflicts();

  const isEmpty = cart.items.length === 0;
  const hasConflicts = conflicts.length > 0;
  const pickupTime = useMemo(
    () => estimatedPickup(branch?.estimatedPrepMinutes ?? 20),
    [branch?.estimatedPrepMinutes],
  );

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
            clearConflicts();
            clearCart();
            setBranch(nextBranch.id);
          },
        },
      ],
    );
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
      <SafeAreaView style={styles.safeArea} edges={[]}>
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
              contentContainerStyle={styles.content}
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

              {cart.appliedDiscount ? (
                <View style={styles.couponSlot}>
                  <Text style={[styles.sectionLabel, { color: theme.text }]}>Applied deal</Text>
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
                </View>
              ) : null}

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
                  paddingBottom: getFloatingTabBarClearance(insets.bottom),
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
  footer: {
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
