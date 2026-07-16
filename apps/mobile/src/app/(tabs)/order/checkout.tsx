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
import {
  Animated as RNAnimated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// Reanimated is retained ONLY for the confirm drawer's mount/unmount layout
// animations (entering/exiting). The countdown timer bar below deliberately uses
// plain RN `Animated` (not reanimated core) so it stays jest-testable despite the
// shared reanimated jest-mock's missing layout-animation exports.
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance, useHideTabBarWhile } from '@/components/floating-tab-bar';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { getAppliedCouponCode, setAppliedCouponCode } from '@/features/cart/applied-coupon-code';
import { useCart } from '@/features/cart/hooks/use-cart';
import { requestNotificationPermission } from '@/features/notifications/lib/notification-permission';
import { useCheckout } from '@/features/orders/hooks/use-checkout';
import { useOrder } from '@/features/order/hooks/use-order';
import { FontFamily, MaxContentWidth, Palette, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** Fallback prep estimate (minutes) when the branch's own value is unavailable. */
const FALLBACK_PREP_MINUTES = 20;

/**
 * Cancelable grace window (seconds) before the order auto-submits. Extended from
 * 5s → 10s in the kid-friendly pass (AC-A6) to give more time to back out; the
 * auto-submit-on-timeout behavior itself is unchanged.
 */
const COUNTDOWN_SECONDS = 10;

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
      // A code-applied deal is re-resolved server-side from `couponCode`; its
      // `refId` is a catalog id (e.g. "deal-welcome-20"), not a UUID, so sending
      // it as `dealId` would fail placement (UUID validation + the single-discount
      // guard rejects dealId+couponCode together). Only send `dealId` for a deal
      // applied by id with no code.
      dealId:
        !couponCode && cart.appliedDiscount?.source === 'deal'
          ? cart.appliedDiscount.refId
          : undefined,
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

  // Cancelable grace window before the order actually submits, so the user can
  // back out or change something. `countdown` null = idle; a number = seconds
  // remaining. Navigating away unmounts the screen, the effect cleanup clears the
  // timer, and the order never fires.
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

  // Timer bar for the confirm drawer: depletes 1 → 0 over the countdown window.
  // Plain RN `Animated` (not reanimated) so the drawer's timer stays testable.
  // Held in state (lazy init) rather than a ref so the interpolated width can be
  // derived during render without tripping the refs-during-render rule.
  const [timerProgress] = useState(() => new RNAnimated.Value(1));

  const openConfirm = () => {
    setCountdown(COUNTDOWN_SECONDS);
    timerProgress.setValue(1);
    RNAnimated.timing(timerProgress, {
      toValue: 0,
      duration: COUNTDOWN_SECONDS * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  };
  const dismissConfirm = () => {
    timerProgress.stopAnimation();
    setCountdown(null);
  };
  const confirmNow = () => {
    timerProgress.stopAnimation();
    setCountdown(null);
    void submitOrder();
  };

  const timerBarWidth = timerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // Color-coded urgency: calm green with lots of time, amber as it runs down,
  // red in the final stretch (AC-A6). Derived from the ticking `countdown`.
  const urgencyColor =
    countdown != null && countdown <= 3
      ? Palette.jred
      : countdown != null && countdown <= 6
        ? Palette.jgold
        : Palette.green;

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
              <RNAnimated.View
                style={[styles.timerFill, { backgroundColor: urgencyColor, width: timerBarWidth }]}
              />
            </View>

            <View style={styles.sheetButtons}>
              <Button
                label={`Modify (${countdown ?? 0}s)`}
                variant="outline"
                onPress={dismissConfirm}
                mode={mode}
                style={styles.sheetButtonModify}
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
    // Larger, easy-to-read progress bar for the kid-friendly countdown (AC-A6).
    height: 20,
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
  // The "Modify" back-out button is given more width so it reads as the bigger,
  // easier target to stop the auto-submit (AC-A6).
  sheetButtonModify: {
    flex: 1.4,
  },
});
