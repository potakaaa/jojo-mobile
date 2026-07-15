import { CouponCard, EmptyState } from '@jojopotato/ui';
import type { CouponStatus } from '@jojopotato/types';
import { useMemo } from 'react';
import { ActivityIndicator, Platform, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, Palette, Spacing, TypeScale } from '@/constants/theme';
import { useCoupons } from '@/features/coupons/hooks/use-coupons';
import { toCouponDisplay } from '@/features/coupons/lib/to-coupon-display';
import { type ApiCouponWithLabel } from '@/lib/api-client';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** Section order + labels for the wallet's status groups. */
const GROUPS: { status: CouponStatus; title: string }[] = [
  { status: 'available', title: 'Available' },
  { status: 'used', title: 'Used' },
  { status: 'expired', title: 'Expired' },
];

/**
 * Coupon wallet (nested Rewards screen). Lists the member's real coupons grouped
 * by status and renders each via `@jojopotato/ui`'s `CouponCard` through the pure
 * `toCouponDisplay` adapter.
 *
 * Display-only by design: coupons are NOT independently consumable from this
 * screen. Consumption happens ONLY atomically at checkout via the `couponId`
 * discount-apply flow (`POST /orders`), which computes the real discount AND
 * marks the coupon used in one transaction. This screen previously had a
 * standalone "Use coupon" action (`POST /coupons/:id/redeem`) that flipped a
 * coupon to `used` with NO discount applied anywhere — burning the coupon's
 * value for nothing. That action was removed; the wallet now only views coupons.
 */
export default function CouponsScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();

  const coupons = useCoupons();

  const grouped = useMemo(() => groupByStatus(coupons.data ?? []), [coupons.data]);

  // Build SectionList sections in the fixed GROUPS order, omitting empty groups.
  const sections = useMemo(
    () =>
      GROUPS.map(({ status, title }) => ({ status, title, data: grouped[status] })).filter(
        (section) => section.data.length > 0,
      ),
    [grouped],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {coupons.isPending ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Palette.jorange} />
          </View>
        ) : coupons.isError ? (
          <EmptyState
            iconName="cloud-offline-outline"
            title="Couldn't load your coupons"
            description="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void coupons.refetch()}
            mode={mode}
          />
        ) : (coupons.data?.length ?? 0) === 0 ? (
          <EmptyState
            iconName="ticket-outline"
            title="No coupons yet"
            description="Redeem your stars in the Rewards tab to earn coupons."
            mode={mode}
          />
        ) : (
          <SectionList
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              Platform.OS !== 'web' && {
                paddingBottom: getFloatingTabBarClearance(insets.bottom),
              },
            ]}
            showsVerticalScrollIndicator={false}
            sections={sections}
            keyExtractor={(coupon) => coupon.id}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <Text style={[styles.groupTitle, { color: theme.text }]}>{section.title}</Text>
            )}
            renderItem={({ item: coupon }) => (
              // Display-only: no onPress — coupons are consumed at checkout, not here.
              <CouponCard coupon={toCouponDisplay(coupon)} mode={mode} />
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

/** Bucket coupons into the three status groups (order preserved within a group). */
function groupByStatus(coupons: ApiCouponWithLabel[]): Record<CouponStatus, ApiCouponWithLabel[]> {
  const groups: Record<CouponStatus, ApiCouponWithLabel[]> = {
    available: [],
    used: [],
    expired: [],
  };
  for (const coupon of coupons) {
    groups[coupon.status].push(coupon);
  }
  return groups;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
    marginTop: Spacing.two,
  },
});
