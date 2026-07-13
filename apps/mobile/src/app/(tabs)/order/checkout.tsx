import type { MenuItem, PaymentMethod, PickupBranch, PlaceOrderResult } from '@jojopotato/types';
import {
  BranchCard,
  Button,
  CartItem,
  CartSummary,
  EmptyState,
  PaymentMethodSelector,
} from '@jojopotato/ui';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { env } from '@/config/env';
import { useCart } from '@/features/cart/hooks/use-cart';
import {
  MOCK_BRANCH_PREP_MINUTES,
  MOCK_CART_BRANCH,
  MOCK_OTHER_BRANCH,
} from '@/features/cart/mock-cart';
import { MOCK_PRODUCTS } from '@/features/home/mock-home';
import { orderDevControls, useOrder } from '@/features/order/hooks/use-order';
import { devFlags } from '@/features/order/mock-order';
import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
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

  const { cart, subtotalCents, discountTotalCents, totalCents } = useCart();
  const { placeOrder, isPlacingOrder } = useOrder();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pay_at_branch');

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

  const handlePlaceOrder = async () => {
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
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
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

          <View style={styles.section}>
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
              />
            ))}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.text }]}>Payment</Text>
            <PaymentMethodSelector
              value={paymentMethod}
              onChange={setPaymentMethod}
              onlinePaymentEnabled={env.onlinePaymentEnabled}
              mode={mode}
            />
          </View>

          <CartSummary
            subtotalCents={subtotalCents}
            discountCents={discountTotalCents}
            discountLabel={cart.appliedDiscount?.label}
            totalCents={totalCents}
            mode={mode}
          />

          {__DEV__ ? <DevEdgeCaseControls mode={mode} /> : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={`Place order • ${(totalCents / 100).toLocaleString('en-PH', {
              style: 'currency',
              currency: 'PHP',
            })}`}
            onPress={handlePlaceOrder}
            loading={isPlacingOrder}
            disabled={isEmpty}
            mode={mode}
          />
        </View>
      </SafeAreaView>
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
  metaLabel: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
  },
  pickupValue: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
});
