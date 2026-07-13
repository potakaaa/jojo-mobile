import type { MenuItem, PickupTime } from '@jojopotato/types';
import { BranchCard, Button, CartItem, CartSummary, EmptyState } from '@jojopotato/ui';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
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
 * quantity steppers + remove, an estimated pickup time, and the subtotal/total
 * summary — all driven by the in-memory `useCart()` seam wired to the real
 * branch/menu/order backend. Coupons are deferred (no backend support yet).
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
  } = useCart();

  const { branches, isLoading: branchesLoading, isError: branchesError, refetch } = useBranch();
  const branch = branches.find((b) => b.id === cart.pickupBranchId) ?? null;

  const isEmpty = cart.items.length === 0;
  const pickupTime = useMemo(
    () => estimatedPickup(branch?.estimatedPrepMinutes ?? 20),
    [branch?.estimatedPrepMinutes],
  );

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
                <Text style={[styles.couponNote, { color: theme.textSecondary }]}>
                  Coupons coming soon
                </Text>
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
  couponNote: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
});
