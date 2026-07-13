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
import { BranchSwitcher } from '@/features/menu/components/branch-switcher';
import { CategorySection } from '@/features/menu/components/category-section';
import { useMenu } from '@/features/menu/hooks/use-menu';
import { useTheme } from '@/hooks/use-theme';

/**
 * Order tab root — the real branch-scoped category menu (MENU-001). A
 * `BranchSwitcher` drives `useBranch()`, `useMenu()` fetches the branch's menu,
 * and each category renders a `CategorySection`. Tapping a product opens Product
 * Details. Temporary dev links to Cart/Order History remain (those screens are
 * still placeholders).
 */
export default function OrderScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useMenu();

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
          <Text style={[styles.heading, { color: theme.text }]}>Menu</Text>
          <BranchSwitcher />

          {isLoading ? (
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

          <View style={styles.devLinks}>
            <DevLink
              label="Dev: View Cart"
              onPress={() => router.push('/(tabs)/order/cart')}
              color={theme.accent}
            />
            <DevLink
              label="Dev: Order History"
              onPress={() => router.push('/(tabs)/order/history')}
              color={theme.accent}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function DevLink({ label, onPress, color }: { label: string; onPress: () => void; color: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Text style={[styles.link, { color }]}>{label}</Text>
    </Pressable>
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
  devLinks: {
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: Spacing.four,
  },
  link: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
});
