import { DealCard, EmptyState } from '@jojopotato/ui';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { useCart } from '@/features/cart/hooks/use-cart';
import { filterActiveBranchDeals } from '@/features/deals/lib/eligibility';
import { MOCK_DEALS } from '@/features/deals/mock-deals';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Deals list (#22). Shows only active, in-window, branch-scoped deals for the
 * cart's current pickup branch. Expired / out-of-window / other-branch deals are
 * filtered out here (proven absent). Reached via `router.push('/(tabs)/deals')`.
 */
export default function DealsListScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();
  const { cart } = useCart();

  const deals = useMemo(
    () => filterActiveBranchDeals(MOCK_DEALS, cart.pickupBranchId),
    [cart.pickupBranchId],
  );

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
                deal={deal}
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
