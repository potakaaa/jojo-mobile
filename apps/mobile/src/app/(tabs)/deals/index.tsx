import { DealCard, EmptyState } from '@jojopotato/ui';
import { router } from 'expo-router';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { useDealProducts } from '@/features/deals/hooks/use-deal-products';
import { dealProductToCard } from '@/features/deals/lib/deal-product-to-card';
import { ScreenLoader, ScreenMessage } from '@/features/shared/components/screen-message';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Deals list (ADM-004 deals-as-products repoint). Renders deal-products
 * (`products.is_deal = true`) from `GET /branches/:id/menu?isDeal=true` via
 * `useDealProducts()`. Same UI shell (`DealCard`/`EmptyState`/`ScreenLoader`) as
 * the old `GET /deals` list. Reached via `router.push('/(tabs)/deals')`.
 */
export default function DealsListScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();
  const { data: deals = [], isLoading, isError, isRefetching, refetch } = useDealProducts();

  if (isLoading) return <ScreenLoader />;
  // Full error screen only when there's nothing loaded yet. A failed REFRESH keeps
  // `isError` true but retains prior deals in `data` — gate on `deals.length === 0`
  // so a failed pull-to-refresh never blanks the already-loaded list (AC3).
  if (isError && deals.length === 0) {
    return (
      <ScreenMessage
        title="Couldn't load deals"
        subtitle="Please try again."
        actionLabel="Retry"
        onAction={refetch}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          testID="deals-scroll"
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            Platform.OS !== 'web' && {
              paddingBottom: getFloatingTabBarClearance(insets.bottom),
            },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              testID="deals-refresh"
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={theme.text}
              colors={[theme.text]}
            />
          }
        >
          <Text style={[styles.heading, { color: theme.text }]}>Deals</Text>
          {deals.length === 0 ? (
            <EmptyState
              iconName="pricetag-outline"
              title="No deals right now"
              description="Check back soon for new offers at your branch."
              mode={mode}
            />
          ) : (
            deals.map((deal) => (
              <DealCard
                key={deal.id}
                deal={dealProductToCard(deal)}
                mode={mode}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/deals/deal/[dealId]',
                    params: { dealId: deal.id },
                  })
                }
              />
            ))
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
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  heading: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h1,
  },
});
