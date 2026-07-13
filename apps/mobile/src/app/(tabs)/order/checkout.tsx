import { Ionicons } from '@expo/vector-icons';
import type { MenuItem, PickupBranch, PlaceOrderResult } from '@jojopotato/types';
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
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInUp,
  SlideOutDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { useCart } from '@/features/cart/hooks/use-cart';
import {
  MOCK_BRANCH_PREP_MINUTES,
  MOCK_CART_BRANCH,
  MOCK_OTHER_BRANCH,
} from '@/features/cart/mock-cart';
import { MOCK_PRODUCTS } from '@/features/home/mock-home';
import { orderDevControls, useOrder } from '@/features/order/hooks/use-order';
import { devFlags } from '@/features/order/mock-order';
import { FontFamily, MaxContentWidth, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** Known branches, keyed by id, for resolving `cart.pickupBranchId` to a card. */
const BRANCHES: Record<string, PickupBranch> = {
  [MOCK_CART_BRANCH.id]: MOCK_CART_BRANCH,
  [MOCK_OTHER_BRANCH.id]: MOCK_OTHER_BRANCH,
};

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
  const catalog = MOCK_PRODUCTS.find((p) => p.id === menuItemId);
  return {
    id: menuItemId,
    name: nameSnapshot,
    priceCents: unitPriceCents,
    categoryId: catalog?.categoryId ?? '',
    imageUrl: catalog?.imageUrl,
    isAvailable: true,
  };
}

/**
 * Checkout screen (CART-002). Confirms the selected branch, line items,
 * discount, total, and estimated pickup time; lets the user pick a payment
 * method (online payment gated behind `env.onlinePaymentEnabled`); and places
 * the order via the in-memory `useOrder()` seam. Success clears the cart and
 * navigates to the confirmation screen; every failure preserves the cart and
 * surfaces a recoverable error.
 */
export default function CheckoutScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();

  const { cart, subtotalCents, discountTotalCents, totalCents } = useCart();
  const { placeOrder, isPlacingOrder, paymentMethod } = useOrder();

  const branch = BRANCHES[cart.pickupBranchId] ?? MOCK_CART_BRANCH;
  const pickupLabel = useMemo(() => estimatedPickupLabel(MOCK_BRANCH_PREP_MINUTES), []);
  const isEmpty = cart.items.length === 0;

  const handleFailure = (result: Exclude<PlaceOrderResult, { ok: true }>) => {
    if (result.reason === 'branch_unavailable') {
      Alert.alert(
        'Branch unavailable',
        `${branch.name} isn't accepting orders right now. Your cart is saved — try again shortly or pick another branch.`,
      );
      return;
    }
    if (result.reason === 'item_unavailable') {
      const names = result.unavailableLineIds
        .map((id) => cart.items.find((line) => line.menuItemId === id)?.productNameSnapshot ?? id)
        .join(', ');
      Alert.alert(
        'Item unavailable',
        `Some items just went out of stock: ${names}. Your cart is saved — remove them and try again.`,
      );
      return;
    }
    // network
    Alert.alert(
      "Couldn't place your order",
      'We had trouble reaching the server. Your cart is saved — please try again.',
    );
  };

  const submitOrder = async () => {
    const result = await placeOrder(paymentMethod);
    if (result.ok) {
      router.replace({
        pathname: '/(tabs)/order/confirmation/[orderId]',
        params: { orderId: result.order.orderNumber },
      });
      return;
    }
    handleFailure(result);
  };

  // 5-second cancelable grace window before the order actually submits, so the
  // user can back out or change something. `countdown` null = idle; a number =
  // seconds remaining. Navigating away unmounts the screen, the effect cleanup
  // clears the timer, and the order never fires.
  const [countdown, setCountdown] = useState<number | null>(null);

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
          </Card>

          {__DEV__ ? <DevEdgeCaseControls mode={mode} /> : null}
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
            label={`Place order • ${(totalCents / 100).toLocaleString('en-PH', {
              style: 'currency',
              currency: 'PHP',
            })}`}
            onPress={openConfirm}
            loading={isPlacingOrder}
            disabled={isEmpty}
            mode={mode}
          />
        </View>
      </SafeAreaView>

      <Modal
        visible={countdown !== null}
        transparent
        animationType="none"
        onRequestClose={dismissConfirm}
      >
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={styles.sheetBackdrop}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={dismissConfirm} />
          <Animated.View
            entering={SlideInUp.duration(300)}
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
              <Text style={[styles.sheetValue, { color: theme.text }]}>{branch.name}</Text>
            </View>
            <View style={styles.sheetRow}>
              <Text style={[styles.sheetLabel, { color: theme.textSecondary }]}>Estimated ready</Text>
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
      </Modal>
    </View>
  );
}

/**
 * `__DEV__`-only affordances to exercise the 3 failure paths live on-device,
 * mirroring CART-001's dev-link convention. They flip the same in-memory
 * controls the seam reads; use the reset button to clear all toggles.
 */
function DevEdgeCaseControls({ mode }: { mode: 'light' | 'dark' }) {
  const { cart } = useCart();

  return (
    <View style={styles.section}>
      <Button
        label="Dev: force branch unavailable"
        variant="outline"
        mode={mode}
        onPress={() => {
          orderDevControls.branchAvailable = false;
          Alert.alert('Dev', 'Next order attempt will fail with branch_unavailable.');
        }}
      />
      <Button
        label="Dev: force first item unavailable"
        variant="outline"
        mode={mode}
        onPress={() => {
          const first = cart.items[0]?.menuItemId;
          orderDevControls.unavailableProductIds = first ? [first] : [];
          Alert.alert('Dev', `Next order attempt will flag: ${first ?? '(cart empty)'}.`);
        }}
      />
      <Button
        label="Dev: force network failure"
        variant="outline"
        mode={mode}
        onPress={() => {
          devFlags.simulateNetworkFailure = true;
          Alert.alert('Dev', 'Next order attempt will fail with a network error.');
        }}
      />
      <Button
        label="Dev: reset failure toggles"
        variant="outline"
        mode={mode}
        onPress={() => {
          orderDevControls.branchAvailable = true;
          orderDevControls.unavailableProductIds = [];
          devFlags.simulateNetworkFailure = false;
          Alert.alert('Dev', 'All failure toggles reset — orders will succeed.');
        }}
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
  section: {
    gap: Spacing.two,
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
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
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
