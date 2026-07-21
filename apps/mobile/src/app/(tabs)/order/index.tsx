import { Ionicons } from '@expo/vector-icons';
import { Badge, EmptyState, ScreenHeader, Skeleton } from '@jojopotato/ui';
import { router } from 'expo-router';
import { useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { BranchSwitcher } from '@/features/menu/components/branch-switcher';
import { CategoryQuickNav } from '@/features/menu/components/category-quick-nav';
import { CategorySection } from '@/features/menu/components/category-section';
import { useMenu } from '@/features/menu/hooks/use-menu';
import { useNavigateToProduct } from '@/features/menu/lib/navigate-to-product';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** Show the category quick-nav only once a branch has more than a few categories. */
const QUICK_NAV_THRESHOLD = 3;

/**
 * Order tab root — the real branch-scoped category menu (MENU-001). A
 * `BranchSwitcher` drives `useBranch()`, `useMenu()` fetches the branch's menu,
 * and each category renders a `CategorySection`. Tapping a product opens Product
 * Details. A branded `ScreenHeader` exposes real Cart (with a live item-count
 * badge) and Order-History nav icons; a category quick-nav jumps to a section on
 * long menus; loading shows a menu-shaped skeleton and error/empty use the shared
 * `EmptyState`.
 */
export default function OrderScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useMenu();
  const { isLoading: isBranchLoading } = useBranch();
  const { itemCount } = useCart();
  const navigateToProduct = useNavigateToProduct();

  const scrollRef = useRef<ScrollView>(null);
  const categoryOffsets = useRef<Record<string, number>>({});

  const openProduct = (productId: string) => navigateToProduct(productId);

  const scrollToTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });

  const scrollToCategory = (categoryId: string) => {
    const y = categoryOffsets.current[categoryId];
    if (y != null) {
      scrollRef.current?.scrollTo({ y, animated: true });
    }
  };

  const showLoading = isLoading || isBranchLoading;
  const categories = data?.categories ?? [];

  const headerRight = (
    <View style={styles.headerActions}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View cart"
        hitSlop={8}
        onPress={() => router.push('/(tabs)/cart')}
        style={styles.cartButton}
      >
        <Ionicons name="cart-outline" size={24} color={theme.text} />
        {itemCount > 0 ? (
          <Badge label={String(itemCount)} mode={mode} style={styles.cartBadge} />
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Order history"
        hitSlop={8}
        onPress={() => router.push('/(tabs)/history')}
      >
        <Ionicons name="time-outline" size={24} color={theme.text} />
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            Platform.OS !== 'web' && {
              paddingBottom: getFloatingTabBarClearance(insets.bottom),
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader title="Menu" mode={mode} right={headerRight} style={styles.header} />
          <BranchSwitcher />

          {showLoading ? (
            <View style={styles.skeletonWrap} testID="menu-skeleton">
              {[0, 1].map((section) => (
                <View key={section} style={styles.skeletonSection}>
                  <Skeleton width="45%" height={20} mode={mode} />
                  <View style={styles.skeletonGrid}>
                    {[0, 1].map((row) => (
                      <View key={row} style={styles.skeletonRow}>
                        <View style={styles.skeletonCell}>
                          <Skeleton height={150} radius={Radii.md} mode={mode} />
                        </View>
                        <View style={styles.skeletonCell}>
                          <Skeleton height={150} radius={Radii.md} mode={mode} />
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : isError ? (
            <EmptyState
              iconName="cloud-offline-outline"
              title="Couldn’t load the menu"
              description="Something went wrong fetching this branch’s menu. Please try again."
              actionLabel="Retry"
              onAction={() => refetch()}
              mode={mode}
            />
          ) : categories.length > 0 ? (
            <>
              {categories.length > QUICK_NAV_THRESHOLD ? (
                <CategoryQuickNav categories={categories} onSelect={scrollToCategory} />
              ) : null}
              {categories.map((category) => (
                <CategorySection
                  key={category.id}
                  category={category}
                  onProductPress={openProduct}
                  onLayoutY={(y) => {
                    categoryOffsets.current[category.id] = y;
                  }}
                />
              ))}
            </>
          ) : (
            <EmptyState
              iconName="restaurant-outline"
              title="No menu available for this branch yet"
              description="This branch hasn’t published its menu. Try switching to another branch."
              actionLabel="Switch branch"
              onAction={scrollToTop}
              mode={mode}
            />
          )}
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
  header: {
    // Cancel ScreenHeader's own horizontal inset so the title lines up with the
    // rest of the content, which already carries `paddingHorizontal: Spacing.four`.
    paddingHorizontal: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  cartButton: {
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: -Spacing.two,
    left: Spacing.three,
    paddingVertical: 0,
    paddingHorizontal: Spacing.one,
  },
  skeletonWrap: {
    gap: Spacing.three,
  },
  skeletonSection: {
    gap: Spacing.two,
  },
  skeletonGrid: {
    gap: Spacing.two,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  skeletonCell: {
    flex: 1,
  },
});
