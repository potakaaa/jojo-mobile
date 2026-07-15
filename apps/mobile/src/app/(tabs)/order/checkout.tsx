import { Ionicons } from '@expo/vector-icons';
import type { MenuItem } from '@jojopotato/types';
import { useQueryClient } from '@tanstack/react-query';
import {
  BranchCard,
  Button,
  Card,
  CartItem,
  CartSummary,
  EmptyState,
  PAYMENT_METHOD_ICONS,
  PAYMENT_METHOD_LABELS,
} from '@jojopotato/ui';
import { formatCurrency } from '@jojopotato/utils';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance, useHideTabBarWhile } from '@/components/floating-tab-bar';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { getAppliedCouponCode, setAppliedCouponCode } from '@/features/cart/applied-coupon-code';
import { useCart } from '@/features/cart/hooks/use-cart';
import { requestNotificationPermission } from '@/features/notifications/lib/notification-permission';
import { useCheckout } from '@/features/orders/hooks/use-checkout';
import { useOrder } from '@/features/order/hooks/use-order';
import { FontFamily, MaxContentWidth, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** Fallback prep estimate (minutes) when the branch's own value is unavailable. */
const FALLBACK_PREP_MINUTES = 20;

/** Build the display-only estimated pickup label (D-E): now + branch prep minutes. */
function estimatedPickupLabel(prepMinutes: number): string {
  const ready = new Date(Date.now() + prepMinutes * 60_000);
  const label = ready.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return `Ready ~ ${label}`;
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
    priceCents: unitPriceCents,
    categoryId: '',
    isAvailable: true,
  };
}

/**
 * Checkout screen (CART-002). Confirms the selected branch, line items,
 * discount, total, and estimated pickup time; lets the user pick a payment
 * method (online payment gated behind `env.onlinePaymentEnabled`); and places
 * the order via the real `POST /orders` endpoint through `useCheckout()`.
 * Success clears the cart and navigates to the confirmation screen with the
 * server-assigned order id; every failure preserves the cart and surfaces a
 * recoverable error. The selected payment method still comes from the in-memory
 * `useOrder()` seam (payment-method selection state only).
 */
export default function CheckoutScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();

  const { cart, subtotalCents, discountTotalCents, totalCents, clearCart } = useCart();
  const { branches } = useBranch();
  const { placeOrder, submitting, error } = useCheckout();
  const { paymentMethod } = useOrder();
  const queryClient = useQueryClient();

  const branch = branches.find((b) => b.id === cart.pickupBranchId) ?? null;
  const isBranchUnavailable = !branch && !!cart.pickupBranchId;
  const prepMinutes = branch?.estimatedPrepMinutes ?? FALLBACK_PREP_MINUTES;
  const pickupLabel = useMemo(() => estimatedPickupLabel(prepMinutes), [prepMinutes]);
  const isEmpty = cart.items.length === 0;

  const submitOrder = async () => {
    // Only send couponCode when a discount is actually applied (STAR-004) — the
    // raw code is stashed out-of-band at apply time. The server re-validates and
    // consumes it; a recompute-drop is rejected there, never silently ignored.
    const couponCode = cart.appliedDiscount ? (getAppliedCouponCode() ?? undefined) : undefined;
    const order = await placeOrder({
      branchId: cart.pickupBranchId,
      paymentMethod,
      items: cart.items.map((line) => ({
        productId: line.menuItemId,
        quantity: line.quantity,
        selectedOptions: line.selectedOptions.map((opt) => ({ optionId: opt.id })),
      })),
      ...(couponCode ? { couponCode } : {}),
      // Only a deal-sourced discount carries a real dealId the server can revalidate.
      dealId: cart.appliedDiscount?.source === 'deal' ? cart.appliedDiscount.refId : undefined,
    });
    if (order) {
      // Clear the out-of-band applied code once the order is placed (STAR-004).
      setAppliedCouponCode(null);
      // First-order notification permission seam (fire-and-forget; the seam's
      // own once-guard ensures it only prompts on the first successful order).
      // Never awaited — it must not delay the confirmation redirect.
      requestNotificationPermission().catch((err) => {
        console.error('Failed to request notification permission:', err);
      });
      clearCart();
      // Refresh coupon + rewards caches so a consumed reward coupon no longer
      // shows as "Available" — refetchOnWindowFocus doesn't fire on RN in-app
      // tab nav. Invalidate by key PREFIX so all sub-keys refresh; don't await.
      void queryClient.invalidateQueries({ queryKey: ['coupons'] });
      void queryClient.invalidateQueries({ queryKey: ['rewards'] });
      router.replace({
        pathname: '/(tabs)/order/confirmation/[orderId]',
        params: { orderId: order.id },
      });
    }
    // On failure, `error` is set by useCheckout() and surfaced below; the cart
    // is intentionally preserved so the user can retry.
  };

  // 5-second cancelable grace window before the order actually submits, so the
  // user can back out or change something. `countdown` null = idle; a number =
  // seconds remaining. Navigating away unmounts the screen, the effect cleanup
  // clears the timer, and the order never fires.
  const [countdown, setCountdown] = useState<number | null>(null);

  // Hide the floating tab bar while the confirm drawer is open so it doesn't cover the drawer.
  useHideTabBarWhile(countdown !== null);

  // Keep the latest submit in a ref so the ticking effect can depend only on
  // `countdown` (submitOrder is re-created every render).
  const submitRef = useRef(submitOrder);
  useEffect(() => {
    submitRef.current = submitOrder;
  });

  useEffect(() => {
    if (countdown === null) return;
    const id = setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null);
        void submitRef.current();
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // Timer bar for the confirm drawer: depletes 1 → 0 over the 5s window.
  const timerProgress = useSharedValue(1);

  const openConfirm = () => {
    setCountdown(5);
    timerProgress.value = 1;
    timerProgress.value = withTiming(0, { duration: 5000, easing: Easing.linear });
  };
  const dismissConfirm = () => {
    cancelAnimation(timerProgress);
    setCountdown(null);
  };
  const confirmNow = () => {
    cancelAnimation(timerProgress);
    setCountdown(null);
    void submitOrder();
  };

  const timerBarStyle = useAnimatedStyle(() => ({ width: `${timerProgress.value * 100}%` }));

  if (isEmpty) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <EmptyState
            iconName="cart-outline"
            title="Nothing to check out"
            description="Your cart is empty. Add some items first."
            actionLabel="Browse menu"
            onAction={() => router.replace('/(tabs)/order')}
            mode={mode}
          />
        </SafeAreaView>
      </View>
    );
  }

  if (isBranchUnavailable) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <EmptyState
            iconName="location-outline"
            title="Branch unavailable"
            description="The branch you selected is no longer accepting pickup orders. Please select another branch."
            actionLabel="Change branch"
            onAction={() => router.replace('/(tabs)/order')}
            mode={mode}
          />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            Platform.OS !== 'web' && {
              paddingBottom: getFloatingTabBarClearance(insets.bottom) + Spacing.six + Spacing.two,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {branch ? (
            <BranchCard
              branch={branch}
              mode={mode}
              footer={
                <View style={styles.pickupRow}>
                  <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>
                    Estimated pickup
                  </Text>
                  <Text style={[styles.pickupValue, { color: theme.text }]}>{pickupLabel}</Text>
                </View>
              }
            />
          ) : null}

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
                mode={mode}
                style={styles.cartItemFlat}
              />
            ))}
          </View>

          <CartSummary
            subtotalCents={subtotalCents}
            discountCents={discountTotalCents}
            discountLabel={cart.appliedDiscount?.label}
            totalCents={totalCents}
            mode={mode}
          />

          <Card mode={mode} style={styles.paymentCard}>
            <Text style={[styles.sectionLabel, { color: theme.text }]}>Payment</Text>
            <View style={styles.paymentRow}>
              <View style={styles.paymentMethodValue}>
                <Ionicons name={PAYMENT_METHOD_ICONS[paymentMethod]} size={18} color={theme.text} />
                <Text style={[styles.paymentValue, { color: theme.text }]}>
                  {PAYMENT_METHOD_LABELS[paymentMethod]}
                </Text>
              </View>
              <Button
                label="Change"
                variant="outline"
                size="sm"
                mode={mode}
                onPress={() => router.push('/(tabs)/order/payment-method')}
              />
            </View>
            <Text style={[styles.paymentNote, { color: theme.textSecondary }]}>
              Pay when you pick up — settle your order in cash or card at the branch counter.
            </Text>
          </Card>

          {error ? <Text style={[styles.errorText, { color: theme.accent }]}>{error}</Text> : null}
        </ScrollView>

        {countdown === null ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={[
              styles.footer,
              Platform.OS !== 'web' && {
                paddingBottom: getFloatingTabBarClearance(insets.bottom),
              },
            ]}
          >
            <Button
              label={`Place order • ${formatCurrency(totalCents)}`}
              onPress={openConfirm}
              loading={submitting}
              disabled={isEmpty}
              mode={mode}
            />
          </Animated.View>
        ) : null}
      </SafeAreaView>

      {countdown !== null ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={styles.sheetBackdrop}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissConfirm}
            accessibilityRole="button"
            accessibilityLabel="Dismiss order confirmation"
          />
          <Animated.View
            entering={SlideInDown.duration(300)}
            exiting={SlideOutDown.duration(200)}
            style={[
              styles.sheet,
              {
                backgroundColor: theme.background,
                borderColor: theme.border,
                paddingBottom: insets.bottom + Spacing.four,
              },
            ]}
          >
            <Text style={[styles.sheetTitle, { color: theme.text }]}>Confirm your order</Text>

            <View style={styles.sheetRow}>
              <Text style={[styles.sheetLabel, { color: theme.textSecondary }]}>Pickup branch</Text>
              <Text style={[styles.sheetValue, { color: theme.text }]}>
                {branch?.name ?? 'Selected branch'}
              </Text>
            </View>
            <View style={styles.sheetRow}>
              <Text style={[styles.sheetLabel, { color: theme.textSecondary }]}>
                Estimated ready
              </Text>
              <Text style={[styles.sheetValue, { color: theme.text }]}>{pickupLabel}</Text>
            </View>

            <View
              style={[
                styles.timerTrack,
                { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
              ]}
            >
              <Animated.View
                style={[styles.timerFill, { backgroundColor: theme.accent }, timerBarStyle]}
              />
            </View>

            <View style={styles.sheetButtons}>
              <Button
                label={`Modify (${countdown ?? 0}s)`}
                variant="outline"
                onPress={dismissConfirm}
                mode={mode}
                style={styles.sheetButton}
              />
              <Button
                label="Confirm order"
                onPress={confirmNow}
                mode={mode}
                style={styles.sheetButton}
              />
            </View>
          </Animated.View>
        </Animated.View>
      ) : null}
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
  sectionLabel: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  pickupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  paymentCard: {
    gap: Spacing.two,
    shadowOpacity: 0,
    elevation: 0,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  paymentMethodValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  paymentValue: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.body,
  },
  paymentNote: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
  },
  errorText: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  metaLabel: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
  },
  pickupValue: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
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
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 10,
  },
  sheet: {
    borderTopLeftRadius: Radii.lg,
    borderTopRightRadius: Radii.lg,
    borderWidth: 2,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  sheetTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  sheetLabel: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
  },
  sheetValue: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.body,
  },
  timerTrack: {
    height: 12,
    borderRadius: Radii.full,
    borderWidth: 2,
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    borderRadius: Radii.full,
  },
  sheetButtons: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  sheetButton: {
    flex: 1,
  },
});
