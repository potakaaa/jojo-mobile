import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { BranchSwitcher } from '@/features/menu/components/branch-switcher';
import { CategorySection } from '@/features/menu/components/category-section';
import { useMenu } from '@/features/menu/hooks/use-menu';
import { useTheme } from '@/hooks/use-theme';

/**
 * Order tab root — the real branch-scoped category menu (MENU-001). A
 * `BranchSwitcher` drives `useBranch()`, `useMenu()` fetches the branch's menu,
 * and each category renders a `CategorySection`. Tapping a product opens Product
 * Details. The header exposes real Cart and Order-History nav icons.
 */
export default function OrderScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useMenu();
  const { isLoading: isBranchLoading } = useBranch();

  const openProduct = (productId: string) =>
    router.push({
      pathname: '/(tabs)/order/product/[productId]',
      params: { productId },
    });

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
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
          <View style={styles.header}>
            <Text style={[styles.heading, { color: theme.text }]}>Menu</Text>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View cart"
                hitSlop={8}
                onPress={() => router.push('/(tabs)/order/cart')}
              >
                <Ionicons name="cart-outline" size={24} color={theme.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Order history"
                hitSlop={8}
                onPress={() => router.push('/(tabs)/order/history')}
              >
                <Ionicons name="receipt-outline" size={24} color={theme.text} />
              </Pressable>
            </View>
          </View>
          <BranchSwitcher />

          {isLoading || isBranchLoading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : isError ? (
            <View style={styles.stateBox}>
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                Couldn’t load the menu.
              </Text>
              <Pressable accessibilityRole="button" onPress={() => refetch()}>
                <Text style={[styles.link, { color: theme.accent }]}>Retry</Text>
              </Pressable>
            </View>
          ) : data && data.categories.length > 0 ? (
            data.categories.map((category) => (
              <CategorySection key={category.id} category={category} onProductPress={openProduct} />
            ))
          ) : (
            <View style={styles.stateBox}>
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                No menu available for this branch yet.
              </Text>
            </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  heading: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h1,
  },
  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.six,
  },
  stateText: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
  },
  link: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
});
