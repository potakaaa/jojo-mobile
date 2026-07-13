import type { Order, PickupBranch } from '@jojopotato/types';
import { EmptyState, OrderHistoryCard } from '@jojopotato/ui';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { useCart } from '@/features/cart/hooks/use-cart';
import { MOCK_CART_BRANCH, MOCK_OTHER_BRANCH } from '@/features/cart/mock-cart';
import {
  MOCK_CURRENT_USER_ID,
  MOCK_ORDER_HISTORY,
} from '@/features/order-history/mock-order-history';
import { applyReorderPlan, buildReorderPlan } from '@/features/order-history/reorder';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** Known branches, keyed by id, for resolving `order.branchId` to a display name. */
const BRANCHES: Record<string, PickupBranch> = {
  [MOCK_CART_BRANCH.id]: MOCK_CART_BRANCH,
  [MOCK_OTHER_BRANCH.id]: MOCK_OTHER_BRANCH,
};

/**
 * Order History (HIST-001). Lists the signed-in user's past orders (newest
 * first) against mock data, with a Reorder CTA per finished order. Reorder
 * (HIST-002) re-checks current availability/pricing: an all-available order
 * populates the cart and jumps straight to Cart; an order with any now-unavailable
 * item routes to the Reorder Review screen so nothing is ever silently dropped.
 */
export default function OrderHistoryScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();
  const { addItem, setBranch } = useCart();

  const orders = useMemo(
    () =>
      MOCK_ORDER_HISTORY.filter((o) => o.userId === MOCK_CURRENT_USER_ID).sort(
        (a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime(),
      ),
    [],
  );

  const handleReorder = (order: Order) => {
    const plan = buildReorderPlan(order);
    if (plan.unavailable.length === 0) {
      // Happy path (D3): everything still available — populate and go to Cart.
      applyReorderPlan(plan, order.branchId, { addItem, setBranch });
      router.push('/(tabs)/order/cart');
      return;
    }
    // Conflict path (D3/D8): surface the unavailable items for an explicit choice.
    router.push({ pathname: '/(tabs)/order/reorder/[orderId]', params: { orderId: order.id } });
  };

  const isEmpty = orders.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {isEmpty ? (
          <EmptyState
            iconName="receipt-outline"
            title="No orders yet"
            description="When you place an order, it'll show up here for easy reordering."
            actionLabel="Browse menu"
            onAction={() => router.push('/(tabs)/order')}
            mode={mode}
          />
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              Platform.OS !== 'web' && {
                paddingBottom: getFloatingTabBarClearance(insets.bottom),
              },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {orders.map((order) => (
              <OrderHistoryCard
                key={order.id}
                order={order}
                branchName={BRANCHES[order.branchId]?.name}
                onReorder={handleReorder}
                mode={mode}
              />
            ))}
          </ScrollView>
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
});
