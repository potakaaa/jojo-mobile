import { formatCurrency } from '@jojopotato/utils';
import { Button, EmptyState } from '@jojopotato/ui';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
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

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.tint} />
      </View>
    );
  }

  if (isError || !deal) {
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

  const components = deal.components ?? [];

  // Plain add-to-cart: a deal-product is priced at its own base price and enters
  // the cart like any product. It is present in the branch's deals menu, so it is
  // available (`true`); no options apply to a deal-product (`[]`).
  const handleAddToCart = () => {
    addItem(productToMenuItem(deal, true), []);
    router.push('/(tabs)/order/cart');
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

        <View style={[styles.priceChip, { backgroundColor: Palette.jred }]}>
          <Text style={styles.priceLabel}>{formatCurrency(deal.basePriceCents)}</Text>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>{deal.name}</Text>
        {deal.description ? (
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {deal.description}
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
