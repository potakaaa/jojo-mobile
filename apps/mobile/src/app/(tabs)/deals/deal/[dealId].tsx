import { Button, EmptyState } from '@jojopotato/ui';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, Palette, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useCart } from '@/features/cart/hooks/use-cart';
import { applyDealById } from '@/features/deals/lib/apply-deal';
import { checkDealEligibility } from '@/features/deals/lib/eligibility';
import { MOCK_DEAL_USAGE, MOCK_DEALS } from '@/features/deals/mock-deals';
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
 * Deal details (#23). Resolves the deal by id, runs real eligibility against the
 * mock cart, shows a derived terms block, and renders Apply (works via the
 * shared apply path) + a stubbed Add to Wallet CTA.
 */
export default function DealDetailsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { dealId } = useLocalSearchParams<{ dealId: string }>();
  const { cart, applyDiscount } = useCart();

  const deal = useMemo(() => MOCK_DEALS.find((d) => d.id === dealId), [dealId]);

  const eligibility = useMemo(
    () => (deal ? checkDealEligibility(deal, cart, cart.pickupBranchId, MOCK_DEAL_USAGE) : null),
    [deal, cart],
  );

  if (!deal || !eligibility) {
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

  const handleApply = () => {
    // Known gap: usage is not persisted here — real consumption happens at order
    // placement (out of scope this round).
    const result = applyDealById(deal.id, cart, cart.pickupBranchId, MOCK_DEAL_USAGE);
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

        {!isEligible ? (
          <Text style={[styles.ineligibleMessage, { color: Palette.jred }]}>
            {eligibility.message}
          </Text>
        ) : null}

        <Button label="Apply deal" onPress={handleApply} disabled={!isEligible} mode={mode} />
        <Button label="Add to Wallet" variant="outline" onPress={handleAddToWallet} mode={mode} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
});
