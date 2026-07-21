import { formatCurrency, formatDealScheduleSummary } from '@jojopotato/utils';
import { Button, EmptyState, ScreenHeader } from '@jojopotato/ui';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_FOOTPRINT } from '@/components/floating-tab-bar';
import { resolveTabBarClearance } from '@/components/floating-tab-bar.helpers';
import { FontFamily, Palette, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useCart } from '@/features/cart/hooks/use-cart';
import { productToMenuItem } from '@/features/cart/lib/product-to-menu-item';
import { useDealProduct } from '@/features/deals/hooks/use-deal-products';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Deal details (ADM-004 deals-as-products repoint). A "deal" is a `products` row
 * with `is_deal = true`, derived from `useDealProduct(dealId)` (the cached
 * `?isDeal=true` menu list). Renders the deal's price and a "What's inside" card
 * from its `components[]`. The CTA is a plain "Add to cart" — a deal-product is
 * priced at its own `basePriceCents` and added to the cart exactly like any other
 * product (`productToMenuItem()` + `useCart().addItem()`), with NO discount math
 * or eligibility check (the old OLD-model apply/eligibility flow is retired).
 */
export default function DealDetailsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { dealId } = useLocalSearchParams<{ dealId: string }>();
  const { addItem } = useCart();

  const { data: deal, isLoading, isError } = useDealProduct(dealId);

  /*
    Loading / error early returns get the SAME header + top inset as the loaded
    branch below. The native header used to cover them for free; with
    `headerShown:false` (see ../_layout.tsx) they would otherwise have no
    status-bar clearance and no way back. No 'bottom' edge, matching the loaded
    branch — neither has a bottom CTA sitting on the device edge.
  */
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <ScreenHeader title="Deal Details" onBack={() => router.back()} mode={mode} />
          <View style={[styles.container, styles.centered]}>
            <ActivityIndicator color={theme.tint} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (isError || !deal) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <ScreenHeader title="Deal Details" onBack={() => router.back()} mode={mode} />
          <EmptyState
            iconName="pricetag-outline"
            title="Deal not found"
            description="This deal is no longer available."
            mode={mode}
          />
        </SafeAreaView>
      </View>
    );
  }

  const components = deal.components ?? [];
  // DEAL-005 Phase 3: the deal's availability annotation, if it's a scheduled deal.
  const scheduleSummary = formatDealScheduleSummary(deal.schedule);

  // Plain add-to-cart: a deal-product is priced at its own base price and enters
  // the cart like any product. It is present in the branch's deals menu, so it is
  // available (`true`); no options apply to a deal-product (`[]`).
  const handleAddToCart = () => {
    addItem(productToMenuItem(deal, true), []);
    router.push('/(tabs)/cart');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/*
        TOP edge only (NAV-003): this stack now runs `headerShown:false`, so the
        top inset is ours to supply or the ScreenHeader would sit under the status
        bar. NO 'bottom' edge — the device bottom inset already arrives exactly
        ONCE via the resolveTabBarClearance(true, …) call on the scroll content
        below, which is unchanged by this rollout.
      */}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Deal Details" onBack={() => router.back()} mode={mode} />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            Platform.OS !== 'web' && {
              // isNested hardcoded true: deal/[dealId].tsx is always PUSHED inside the
              // `deals` stack — never that stack's root — so isNestedTabRoute() would also
              // evaluate true here; hardcoded per INNOVATE's static-per-screen-fact decision
              // (see PLAN "Locked Inputs"). If this file moves, this literal must change.
              //
              // Applied unconditionally per PLAN Step 4.2: this screen is nested BY FILE-TREE
              // SHAPE regardless of how SPEC Open Question 1 (should the bar be VISIBLE on
              // Deal Details?) is finally answered on-device — reserving the bar's ~85dp
              // footprint here is the same dead-space bug as the 6 Step-2 sites either way.
              // This call remains the SOLE bottom-inset source: NAV-003 added a
              // SafeAreaView above, but deliberately with a 'top'-only edge.
              //
              // `+ Spacing.four` restores styles.content's own `padding`: paddingBottom
              // overrides that shorthand's bottom side, so without it the content would
              // end exactly at the home-indicator boundary with no gap. The clearance
              // term supplies the device inset; this term is the design's breathing room.
              paddingBottom:
                resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom) + Spacing.four,
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

          <View style={[styles.priceChip, { backgroundColor: Palette.jred }]}>
            <Text style={styles.priceLabel}>{formatCurrency(deal.basePriceCents)}</Text>
          </View>

          <Text style={[styles.title, { color: theme.text }]}>{deal.name}</Text>
          {deal.description ? (
            <Text style={[styles.description, { color: theme.textSecondary }]}>
              {deal.description}
            </Text>
          ) : null}

          {scheduleSummary ? (
            <Text style={[styles.scheduleSummary, { color: theme.textSecondary }]}>
              {scheduleSummary}
            </Text>
          ) : null}

          {components.length > 0 ? (
            <View
              style={[
                styles.insideCard,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.insideHeading, { color: theme.text }]}>What&apos;s inside</Text>
              {components.map((component) => (
                <Text
                  key={component.componentProductId}
                  style={[styles.insideItem, { color: theme.textSecondary }]}
                >
                  {`${component.quantity}× ${component.componentName}`}
                </Text>
              ))}
            </View>
          ) : null}

          <Button label="Add to cart" onPress={handleAddToCart} mode={mode} />
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
  priceChip: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.full,
  },
  priceLabel: {
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
  scheduleSummary: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
  insideCard: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderWidth: 2,
    borderRadius: Radii.md,
  },
  insideHeading: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  insideItem: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
});
