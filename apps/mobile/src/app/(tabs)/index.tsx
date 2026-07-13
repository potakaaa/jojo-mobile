import { Badge, BranchCard, Button, Card, RewardProgressCard } from '@jojopotato/ui';
import { router } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { CategorySelector } from '@/features/home/components/category-selector';
import { HomeHeader } from '@/features/home/components/home-header';
import { ProductGrid } from '@/features/home/components/product-grid';
import { PromoBanner } from '@/features/home/components/promo-banner';
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
          <BranchCard branch={MOCK_BRANCH} />
          <PromoBanner />
          <RewardProgressCard rewards={MOCK_REWARDS} />
          <Card style={styles.dealsCard}>
            <Text style={[styles.dealsHeading, { color: theme.text }]}>Deals & offers</Text>
            <Text style={[styles.dealsSubtitle, { color: theme.textSecondary }]}>
              Save on your next order with active deals at your branch.
            </Text>
            <Button label="View deals" size="sm" onPress={() => router.push('/(tabs)/deals')} />
          </Card>
          <CategorySelector categories={MOCK_CATEGORIES} />
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Popular this week</Text>
            <Badge label="Popular" />
          </View>
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
