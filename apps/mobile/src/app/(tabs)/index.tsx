import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { BranchSelector } from '@/features/home/components/branch-selector';
import { CategorySelector } from '@/features/home/components/category-selector';
import { HomeHeader } from '@/features/home/components/home-header';
import { ProductGrid } from '@/features/home/components/product-grid';
import { PromoBanner } from '@/features/home/components/promo-banner';
import { RewardsTeaserCard } from '@/features/home/components/rewards-teaser-card';
import {
  MOCK_BRANCH,
  MOCK_CATEGORIES,
  MOCK_PRODUCTS,
  MOCK_REWARDS,
} from '@/features/home/mock-home';
import { useTheme } from '@/hooks/use-theme';

/**
 * Home browse screen. Composes the six `features/home` section components,
 * top to bottom, inside a single `ScrollView`, backed by local mock data.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

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
          <BranchSelector branch={MOCK_BRANCH} />
          <PromoBanner />
          <RewardsTeaserCard rewards={MOCK_REWARDS} />
          <CategorySelector categories={MOCK_CATEGORIES} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Popular this week</Text>
          <ProductGrid products={MOCK_PRODUCTS} />
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
  sectionTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
    marginTop: Spacing.half,
  },
});
