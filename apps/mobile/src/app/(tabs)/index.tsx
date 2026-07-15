import { Badge, BranchCard, Button, Card, Palette, RewardProgressCard } from '@jojopotato/ui';
import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { Order, OrderStatus } from '@jojopotato/types';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { Colors, FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { useCart } from '@/features/cart/hooks/use-cart';
import { fetchOrderHistory } from '@/features/orders/lib/api-client';
import { isTerminalStatus } from '@/features/orders/hooks/use-order-query';
import { CategorySelector } from '@/features/home/components/category-selector';
import { HomeHeader } from '@/features/home/components/home-header';
import { ProductGrid } from '@/features/home/components/product-grid';
import { PromoBanner } from '@/features/home/components/promo-banner';
import { MOCK_BRANCH, MOCK_CATEGORIES, MOCK_PRODUCTS } from '@/features/home/mock-home';
import { useRewardsSummary } from '@/features/rewards/hooks/use-rewards-summary';
import { useTheme } from '@/hooks/use-theme';

const BANNER_COPY: Record<OrderStatus, string> = {
  pending: 'Waiting for the branch to confirm',
  accepted: 'Your order has been confirmed',
  preparing: 'Your potatoes are frying now',
  flavoring: 'Adding the signature flavor',
  ready: 'Ready for pickup — head over now!',
  completed: 'Order complete',
  cancelled: 'Order cancelled',
  rejected: 'Order rejected',
};

function ActiveOrderBanner({ order, onPress }: { order: Order; onPress: () => void }) {
  const etaTime =
    order.estimatedReadyAt != null
      ? new Date(order.estimatedReadyAt).toLocaleTimeString('en-PH', {
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Track your active order"
    >
      <View style={banner.outer}>
        <View style={banner.accentBar} />
        <View style={banner.body}>
          <Text style={banner.eyebrow}>Active order</Text>
          <Text style={banner.orderNum}>{order.orderNumber}</Text>
          <Text style={banner.status}>{BANNER_COPY[order.status]}</Text>
          {etaTime != null && (
            <View style={banner.etaRow}>
              <View style={banner.etaDot} />
              <Text style={banner.etaText}>Ready around {etaTime}</Text>
            </View>
          )}
        </View>
        <View style={banner.arrow}>
          <Text style={banner.arrowText}>›</Text>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Home browse screen. Composes the six `features/home` section components,
 * top to bottom, inside a single `ScrollView`, backed by local mock data.
 * The branch card and product grid are wired into the real order flow.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { setBranch } = useCart();
  // Real star count — the teaser must agree with the Rewards tab, not the mock.
  const { data: rewardsSummary } = useRewardsSummary();

  // Focus-refetch only (no polling) — global refetchOnWindowFocus:true handles re-sync on return.
  const { data: orders } = useQuery({
    queryKey: ['orders'],
    queryFn: fetchOrderHistory,
  });

  // Most-recent non-terminal order (list is newest-first from the API).
  const activeOrder = orders?.find((o) => !isTerminalStatus(o.status)) ?? null;

  const openBranch = () => {
    setBranch(MOCK_BRANCH.id);
    router.push({
      pathname: '/(tabs)/branches/[branchId]',
      params: { branchId: MOCK_BRANCH.id },
    });
  };

  const openProduct = (productId: string) => {
    router.push({
      pathname: '/(tabs)/order/product/[productId]',
      params: { productId, branchId: MOCK_BRANCH.id },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            // iOS/Android's floating pill tab bar reserves no space (custom
            // tabBar), so add its clearance here. The web tab bar reserves
            // space natively.
            Platform.OS !== 'web' && {
              paddingBottom: getFloatingTabBarClearance(insets.bottom),
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <HomeHeader />
          {activeOrder != null && (
            <ActiveOrderBanner
              order={activeOrder}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/order/tracking/[orderId]',
                  params: { orderId: activeOrder.id },
                })
              }
            />
          )}
          <BranchCard branch={MOCK_BRANCH} onPress={openBranch} />
          <PromoBanner />
          <RewardProgressCard
            rewards={{
              currentStars: rewardsSummary?.currentStars ?? 0,
              requiredStars: rewardsSummary?.requiredStars ?? 5,
            }}
            onPress={() => router.push('/(tabs)/rewards')}
          />
          <Card style={styles.dealsCard}>
            {/* The Card defaults to the light/cream surface, so its text must use
                the light-mode tokens (not the device-scheme `theme`, which is
                light-colored in dark mode and vanishes on the cream card). */}
            <Text style={[styles.dealsHeading, { color: Colors.light.text }]}>Deals & offers</Text>
            <Text style={[styles.dealsSubtitle, { color: Colors.light.textSecondary }]}>
              Save on your next order with active deals at your branch.
            </Text>
            <Button label="View deals" size="sm" onPress={() => router.push('/(tabs)/deals')} />
          </Card>
          <CategorySelector categories={MOCK_CATEGORIES} />
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Popular this week</Text>
            <Badge label="Popular" />
          </View>
          <ProductGrid products={MOCK_PRODUCTS} onProductPress={openProduct} />
        </ScrollView>
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
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.half,
  },
  sectionTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  dealsCard: {
    gap: Spacing.two,
  },
  dealsHeading: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  dealsSubtitle: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
});

const banner = StyleSheet.create({
  outer: {
    flexDirection: 'row',
    backgroundColor: Palette.creamTint1,
    borderWidth: 2,
    borderColor: Palette.ink,
    borderRadius: 16,
    shadowColor: Palette.ink,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
    overflow: 'hidden',
  },
  accentBar: {
    width: 6,
    backgroundColor: Palette.jyellow,
  },
  body: {
    flex: 1,
    padding: Spacing.four,
    gap: 4,
  },
  eyebrow: {
    fontFamily: FontFamily.body.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: Palette.neutral600,
    textTransform: 'uppercase',
  },
  orderNum: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
    color: Palette.ink,
  },
  status: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    color: Palette.neutral700,
    lineHeight: TypeScale.bodySmall * 1.4,
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  etaDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: Palette.green,
  },
  etaText: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
    color: Palette.green,
  },
  arrow: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  arrowText: {
    fontFamily: FontFamily.body.bold,
    fontSize: 26,
    color: Palette.neutral600,
    lineHeight: 30,
  },
});
