import { CouponCard, EmptyState } from '@jojopotato/ui';
import type { CouponStatus } from '@jojopotato/types';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, MaxContentWidth, Palette, Spacing, TypeScale } from '@/constants/theme';
import { useCoupons } from '@/features/coupons/hooks/use-coupons';
import { useRedeemCoupon } from '@/features/coupons/hooks/use-redeem-coupon';
import { toCouponDisplay } from '@/features/coupons/lib/to-coupon-display';
import { ApiError, type ApiCouponWithLabel } from '@/lib/api-client';
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
 * by status, renders each via `@jojopotato/ui`'s `CouponCard` through the pure
 * `toCouponDisplay` adapter, and lets an available coupon be redeemed with a
 * confirm dialog. A re-redeem of an already-used/expired coupon (409) surfaces a
 * friendly inline message rather than crashing.
 */
export default function CouponsScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';

  const coupons = useCoupons();
  const redeem = useRedeemCoupon();
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const grouped = useMemo(() => groupByStatus(coupons.data ?? []), [coupons.data]);

  const confirmRedeem = (coupon: ApiCouponWithLabel) => {
    Alert.alert('Use this coupon?', `Redeem coupon ${coupon.code}? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Use coupon',
        onPress: () => {
          setRedeemError(null);
          redeem.mutate(coupon.id, {
            onError: (error) => {
              setRedeemError(
                error instanceof ApiError && error.status === 409
                  ? 'This coupon is no longer available — it may already be used or expired.'
                  : "Couldn't redeem this coupon. Please try again.",
              );
            },
          });
        },
      },
    ]);
  };

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
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {redeemError ? (
              <View style={[styles.errorBanner, { borderColor: theme.border }]}>
                <Text style={[styles.errorText, { color: theme.text }]}>{redeemError}</Text>
              </View>
            ) : null}

            {GROUPS.map(({ status, title }) => {
              const items = grouped[status];
              if (items.length === 0) return null;
              return (
                <View key={status} style={styles.group}>
                  <Text style={[styles.groupTitle, { color: theme.text }]}>{title}</Text>
                  {items.map((coupon) => (
                    <CouponCard
                      key={coupon.id}
                      coupon={toCouponDisplay(coupon)}
                      mode={mode}
                      onPress={status === 'available' ? () => confirmRedeem(coupon) : undefined}
                    />
                  ))}
                </View>
              );
            })}
          </ScrollView>
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
    gap: Spacing.four,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: { gap: Spacing.two },
  groupTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  errorBanner: {
    borderWidth: 2,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    backgroundColor: Palette.jyellow,
  },
  errorText: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
});
