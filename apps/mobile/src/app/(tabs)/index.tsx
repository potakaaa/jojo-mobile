import type { Order, OrderStatus } from '@jojopotato/types';
import {
  Badge,
  BranchCard,
  DealCard,
  EmptyState,
  RewardProgressCard,
  StarProgressBar,
} from '@jojopotato/ui';
import { formatDealScheduleSummary } from '@jojopotato/utils';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, Palette, Spacing, TypeScale } from '@/constants/theme';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useDealProducts } from '@/features/deals/hooks/use-deal-products';
import { dealProductToCard } from '@/features/deals/lib/deal-product-to-card';
import { CategorySelector } from '@/features/home/components/category-selector';
import { HomeHeader } from '@/features/home/components/home-header';
import { ProductGrid } from '@/features/home/components/product-grid';
import { PromoBanner } from '@/features/home/components/promo-banner';
import { useNavigateToBranch } from '@/features/branches/lib/navigate-to-branch';
import { filterProductsByCategory } from '@/features/home/lib/filter-products-by-category';
import { flattenMenuForHome } from '@/features/home/lib/menu-to-home-view';
import { useMenu } from '@/features/menu/hooks/use-menu';
import { useNavigateToProduct } from '@/features/menu/lib/navigate-to-product';
import { isTerminalStatus } from '@/features/orders/hooks/use-order-query';
import { useOrderHistory } from '@/features/orders/hooks/use-order-history';
import { useNavigateToOrderTracking } from '@/features/orders/lib/navigate-to-tracking';
import { useRewardsSummary } from '@/features/rewards/hooks/use-rewards-summary';
import { useColorScheme } from '@/hooks/use-color-scheme';
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

/** Live active-order banner (from feat/live-001-order-tracking) — taps through to tracking. */
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
          <View style={banner.headerRow}>
            <Text style={banner.eyebrow}>Active order</Text>
            {etaTime != null && (
              <View style={banner.etaRow}>
                <View style={banner.etaDot} />
                <Text style={banner.etaText}>Ready {etaTime}</Text>
              </View>
            )}
          </View>
          <Text style={banner.orderNum}>{order.orderNumber}</Text>
          <Text style={banner.status} numberOfLines={1}>
            {BANNER_COPY[order.status]}
          </Text>
        </View>
        <View style={banner.arrow}>
          <Text style={banner.arrowText}>›</Text>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Home browse screen. Composes the `features/home` section components inside a
 * single `ScrollView`, backed by REAL data: `useBranch` (selected pickup branch),
 * `useMenu` (branch menu → flattened via `flattenMenuForHome`), `useDealProducts`
 * (live deals strip), and `useRewardsSummary` (star balance). Each data section renders
 * its own friendly loading / empty / error-with-retry state so a slow or failed
 * query never blanks the whole screen.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();

  /**
   * Active Home category filter, tagged with the branch it was chosen in.
   * `null` = no filter, grid shows every product. Read it back through
   * `selectedCategoryId` below rather than using this directly.
   */
  const [categorySelection, setCategorySelection] = useState<{
    branchId: string;
    categoryId: string;
  } | null>(null);

  const {
    selectedBranch,
    isLoading: branchLoading,
    isError: branchError,
    refetch: refetchBranch,
  } = useBranch();
  const { setBranch } = useCart();
  const menuQuery = useMenu();
  const dealsQuery = useDealProducts();
  const rewardsQuery = useRewardsSummary();

  // Shared order-history hook (page 1 only — Home never paginates). Focus-refetch
  // via the global refetchOnWindowFocus:true; one gesture refetch below (D5).
  const orderHistory = useOrderHistory();
  // Most-recent non-terminal order (page 1 is newest-first from the API).
  const activeOrder =
    orderHistory.data?.pages[0]?.orders.find((o) => !isTerminalStatus(o.status)) ?? null;
  const navigateToOrderTracking = useNavigateToOrderTracking();
  const navigateToProduct = useNavigateToProduct();
  const navigateToBranch = useNavigateToBranch();

  const branchId = selectedBranch?.id;

  // Keep the cart's pickup branch in sync with the selected branch.
  // `useDealProducts` sources its branch id from `useCart().cart.pickupBranchId`
  // (not `useBranch`) and is disabled until a branch is set, so without this the
  // Home deals strip would stay empty until the user manually opened a branch.
  // `setBranch` is a no-op when the id is unchanged, so this does not clobber the
  // cart on re-render.
  useEffect(() => {
    if (branchId) setBranch(branchId);
  }, [branchId, setBranch]);

  // A branch switch ALWAYS clears the category filter, landing the customer on
  // the new branch's full, unfiltered menu — never a filter carried over from
  // the branch they just left (which could strand them in an empty state for a
  // category the new branch doesn't carry). Deliberately unconditional: there is
  // no "persist if the category still exists here" path.
  //
  // ponytail: the reset is derived, not an effect. Tagging the selection with
  // its branch means a mismatch already reads as "no filter", so switching
  // branches clears it for free — no reset effect, no cascading extra render.
  const selectedCategoryId =
    categorySelection?.branchId === branchId ? (categorySelection?.categoryId ?? null) : null;

  const selectCategory = (categoryId: string | null) => {
    setCategorySelection(categoryId && branchId ? { branchId, categoryId } : null);
  };

  const menuView = useMemo(
    () => (menuQuery.data ? flattenMenuForHome(menuQuery.data) : { categories: [], products: [] }),
    [menuQuery.data],
  );

  const filteredProducts = useMemo(
    () => filterProductsByCategory(menuView.products, selectedCategoryId),
    [menuView.products, selectedCategoryId],
  );

  const openBranch = () => {
    if (!branchId) return;
    navigateToBranch(branchId);
  };

  const openProduct = (productId: string) => {
    if (!branchId) return;
    navigateToProduct(productId, branchId);
  };

  const openDeal = (dealId: string) => {
    router.push({
      pathname: '/(tabs)/deals/deal/[dealId]',
      params: { dealId },
    });
  };

  const deals = dealsQuery.data ?? [];
  const menuLoading = branchLoading || (Boolean(branchId) && menuQuery.isPending);

  // One pull-to-refresh gesture refetches every mounted Home query (D5 — the
  // whole-screen gesture, not per-widget). try/finally always clears `refreshing`
  // even on a partial rejection; each section already renders its own error state.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        menuQuery.refetch(),
        dealsQuery.refetch(),
        refetchBranch(),
        rewardsQuery.refetch(),
        orderHistory.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          testID="home-scroll"
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
          refreshControl={
            <RefreshControl
              testID="home-refresh"
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.text}
              colors={[theme.text]}
            />
          }
        >
          <HomeHeader />

          {/*
            The CROSS-TAB entry point: Home pushing into the Order tab's stack
            while Order is not focused. This is the case the back-stack trap
            (issue #96) actually reproduced from — a bare router.push landed
            Tracking on top of whatever stale screen Order's stack still held.
          */}
          {activeOrder != null && (
            <ActiveOrderBanner
              order={activeOrder}
              onPress={() => navigateToOrderTracking(activeOrder.id)}
            />
          )}

          {/* Selected pickup branch */}
          {branchLoading ? (
            <SectionLoader />
          ) : branchError ? (
            <EmptyState
              iconName="cloud-offline-outline"
              title="Couldn't load branches"
              description="Check your connection and try again."
              actionLabel="Retry"
              onAction={refetchBranch}
              mode={mode}
            />
          ) : selectedBranch ? (
            <BranchCard branch={selectedBranch} onPress={openBranch} mode={mode} />
          ) : (
            <EmptyState
              iconName="storefront-outline"
              title="No branches available"
              description="There are no branches accepting pickup right now."
              mode={mode}
            />
          )}

          <PromoBanner onPress={branchId ? openBranch : undefined} />

          {/* Rewards balance */}
          {rewardsQuery.isPending ? (
            <SectionLoader />
          ) : rewardsQuery.isError ? (
            <EmptyState
              iconName="cloud-offline-outline"
              title="Couldn't load rewards"
              description="Your star balance is unavailable right now."
              actionLabel="Retry"
              onAction={rewardsQuery.refetch}
              mode={mode}
            />
          ) : rewardsQuery.data ? (
            <View style={styles.rewardsSection}>
              <RewardProgressCard
                rewards={{
                  currentStars: rewardsQuery.data.currentStars,
                  requiredStars: rewardsQuery.data.requiredStars,
                }}
                onPress={() => router.push('/(tabs)/rewards')}
                mode={mode}
              />
              <StarProgressBar
                progress={{
                  currentStars: rewardsQuery.data.currentStars,
                  requiredStars: rewardsQuery.data.requiredStars,
                }}
                mode={mode}
              />
            </View>
          ) : null}

          {/* Deals strip */}
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Deals & offers</Text>
            <Pressable onPress={() => router.push('/(tabs)/deals')} hitSlop={8}>
              <Text style={[styles.seeAll, { color: theme.tint }]}>See all</Text>
            </Pressable>
          </View>
          {dealsQuery.isPending ? (
            <SectionLoader />
          ) : dealsQuery.isError ? (
            <EmptyState
              iconName="cloud-offline-outline"
              title="Couldn't load deals"
              description="Check your connection and try again."
              actionLabel="Retry"
              onAction={dealsQuery.refetch}
              mode={mode}
            />
          ) : deals.length === 0 ? (
            <EmptyState
              iconName="pricetag-outline"
              title="No deals right now"
              description="Check back soon — new deals are coming."
              mode={mode}
            />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dealsStrip}
            >
              {deals.map((product) => (
                <DealCard
                  key={product.id}
                  deal={dealProductToCard(product)}
                  available={product.available}
                  mode={mode}
                  style={styles.dealCard}
                  scheduleSummary={formatDealScheduleSummary(product.schedule)}
                  onPress={() => openDeal(product.id)}
                />
              ))}
            </ScrollView>
          )}

          {/* Menu (categories + products) */}
          {menuLoading ? (
            <SectionLoader />
          ) : !selectedBranch ? (
            <EmptyState
              iconName="restaurant-outline"
              title="Select a branch to see the menu"
              mode={mode}
            />
          ) : menuQuery.isError ? (
            <EmptyState
              iconName="cloud-offline-outline"
              title="Couldn't load the menu"
              description="Check your connection and try again."
              actionLabel="Retry"
              onAction={() => void menuQuery.refetch()}
              mode={mode}
            />
          ) : menuView.products.length === 0 ? (
            <EmptyState
              iconName="restaurant-outline"
              title="Menu coming soon"
              description="This branch has no items available right now."
              mode={mode}
            />
          ) : (
            <>
              <CategorySelector
                categories={menuView.categories}
                selectedId={selectedCategoryId}
                onSelect={selectCategory}
              />
              <View style={styles.sectionTitleRow}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Popular this week</Text>
                <Badge label="Popular" mode={mode} />
              </View>
              {/*
                The branch HAS products, but the selected category has none of
                them — swap only the grid area for an empty state, keeping the
                chip row above it so the user can pick a different category.
              */}
              {filteredProducts.length === 0 ? (
                <EmptyState
                  iconName="restaurant-outline"
                  title="Nothing here yet"
                  description="No items in this category at this branch."
                  mode={mode}
                />
              ) : (
                <ProductGrid products={filteredProducts} onProductPress={openProduct} />
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** Small centered spinner for a pending data section (ActivityIndicator precedent, B1). */
function SectionLoader() {
  return (
    <View style={styles.sectionLoader}>
      <ActivityIndicator color={Palette.jorange} />
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
    // More breathing room between sections so the dominant top of the screen
    // (active order + branch card) reads clearly and secondary content feels
    // calmer, not competing (AC-A3 — visual hierarchy via spacing).
    gap: Spacing.four,
  },
  rewardsSection: {
    gap: Spacing.two,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Clear separation so the Deals / Menu sections read as distinctly secondary
    // below the dominant branch + active-order area (AC-A3).
    marginTop: Spacing.three,
  },
  sectionTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  seeAll: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  dealsStrip: {
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  dealCard: {
    width: 260,
  },
  sectionLoader: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    gap: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
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
    fontSize: TypeScale.h3,
    color: Palette.ink,
  },
  status: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    color: Palette.neutral700,
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  etaDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: Palette.green,
  },
  etaText: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.caption,
    color: Palette.green,
  },
  arrow: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  arrowText: {
    fontFamily: FontFamily.body.bold,
    fontSize: 22,
    color: Palette.neutral600,
    lineHeight: 26,
  },
});
