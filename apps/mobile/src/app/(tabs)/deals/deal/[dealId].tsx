import { Button, EmptyState } from '@jojopotato/ui';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, Palette, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useCart } from '@/features/cart/hooks/use-cart';
import { applyDealById, isComplexDealType } from '@/features/deals/lib/apply-deal';
import { useDeal } from '@/features/deals/hooks/use-deal';
import { useDealUsage } from '@/features/deals/hooks/use-deal-usage';
import { checkDealEligibility } from '@/features/deals/lib/eligibility';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** Format an ISO date as a short human date. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Deal details (#23). Fetches the real deal from `GET /deals/:id` via `useDeal`,
 * runs the real 6-step eligibility engine against the live cart with REAL
 * per-user usage from `useDealUsage()` (derived from order history's `deal_id`,
 * mirroring the server's usage-limit count) plus the signed-in user id, and shows
 * a derived terms block. The Apply CTA performs a real server-authoritative apply
 * via `applyDealById`, storing the discount in the cart on success.
 */
export default function DealDetailsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { dealId } = useLocalSearchParams<{ dealId: string }>();
  const { cart, applyDiscount } = useCart();
  const { user } = useAuth();
  const usage = useDealUsage();

  const { data: deal, isLoading, isError } = useDeal(dealId);

  const eligibility = useMemo(
    // Real per-user usage gating: `usage` is derived from order history's
    // `deal_id` and filtered to the signed-in user; `user.id` drives the
    // per-user usage-limit check (`orders.deal_id`, mirrors the server count).
    () =>
      deal ? checkDealEligibility(deal, cart, cart.pickupBranchId, usage, user?.id) : null,
    [deal, cart, usage, user?.id],
  );

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.tint} />
      </View>
    );
  }

  if (isError || !deal || !eligibility) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <EmptyState
          iconName="pricetag-outline"
          title="Deal not found"
          description="This deal is no longer available."
          mode={mode}
        />
      </View>
    );
  }

  const isEligible = eligibility.eligible;
  // Complex deal types (BOGO/free-item/free-upgrade/bundle) have no real
  // server-side discount — gate the CTA so the user gets clear feedback here
  // instead of an apply-then-checkout-400 dead-end (PVL C1).
  const isComplex = isComplexDealType(deal.dealType);

  // Real apply (Phase 3): fetch + eligibility + complex-type guard live in
  // `applyDealById`; on success store the discount in the cart and navigate there.
  const handleApply = async () => {
    const result = await applyDealById(deal.id, cart, cart.pickupBranchId, usage);
    if (!result.ok) {
      Alert.alert('Cannot apply deal', result.message);
      return;
    }
    applyDiscount(result.discount);
    router.push('/(tabs)/order/cart');
  };

  const handleAddToWallet = () => {
    Alert.alert('Coming soon', 'Deal wallet is not available yet.');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
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
        <View style={[styles.imageWrap, { backgroundColor: theme.tint }]}>
          {deal.imageUrl ? (
            <Image source={{ uri: deal.imageUrl }} style={styles.image} contentFit="cover" />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: theme.tint }]} />
          )}
        </View>

        <View style={[styles.discountChip, { backgroundColor: Palette.jred }]}>
          <Text style={styles.discountLabel}>{deal.discountLabel}</Text>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>{deal.title}</Text>
        {deal.description ? (
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {deal.description}
          </Text>
        ) : null}

        <View
          style={[
            styles.termsCard,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.termsHeading, { color: theme.text }]}>Terms</Text>
          <Text style={[styles.term, { color: theme.textSecondary }]}>
            {deal.minimumOrderAmount > 0
              ? `Minimum order: ₱${(deal.minimumOrderAmount / 100).toFixed(2)}`
              : 'No minimum order'}
          </Text>
          <Text style={[styles.term, { color: theme.textSecondary }]}>
            {`Valid ${shortDate(deal.startAt)} – ${shortDate(deal.endAt)}`}
          </Text>
          <Text style={[styles.term, { color: theme.textSecondary }]}>
            {deal.eligibleBranchIds.length === 0
              ? 'Available at all branches'
              : 'Selected branches only'}
          </Text>
          {deal.usageLimitPerUser !== undefined ? (
            <Text style={[styles.term, { color: theme.textSecondary }]}>
              {`Limit: ${deal.usageLimitPerUser} per member`}
            </Text>
          ) : null}
        </View>

        {isComplex ? (
          <Text style={[styles.ineligibleMessage, { color: Palette.jred }]}>
            This deal can&apos;t be applied at checkout yet.
          </Text>
        ) : !isEligible ? (
          <Text style={[styles.ineligibleMessage, { color: Palette.jred }]}>
            {eligibility.message}
          </Text>
        ) : null}

        <Button
          label="Apply deal"
          onPress={handleApply}
          disabled={!isEligible || isComplex}
          mode={mode}
        />
        <Text style={[styles.deferredNote, { color: theme.textSecondary }]}>
          {isComplex
            ? 'This deal type isn’t available to apply at checkout yet.'
            : isEligible
              ? 'Applying adds this deal to your cart for checkout.'
              : 'Once this deal is eligible, you can apply it to your cart.'}
        </Text>
        <Button label="Add to Wallet" variant="outline" onPress={handleAddToWallet} mode={mode} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radii.md,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
  },
  discountChip: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.full,
  },
  discountLabel: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption,
    color: Palette.cream,
  },
  title: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h1,
  },
  description: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.body,
  },
  termsCard: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderWidth: 2,
    borderRadius: Radii.md,
  },
  termsHeading: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  term: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
  ineligibleMessage: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  deferredNote: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.caption,
    textAlign: 'center',
  },
});
