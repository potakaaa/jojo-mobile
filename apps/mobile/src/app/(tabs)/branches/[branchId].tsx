import type { MenuItem, Product } from '@jojopotato/types';
import { Card, ProductCard } from '@jojopotato/ui';
import { formatCurrency } from '@jojopotato/utils';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Spacing, FontFamily, TypeScale } from '@/constants/theme';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useMenu } from '@/features/menu/hooks/use-menu';
import { ScreenLoader, ScreenMessage } from '@/features/shared/components/screen-message';
import { useTheme } from '@/hooks/use-theme';

/** Map a menu product to the `MenuItem` shape `ProductCard` renders. */
function toMenuItem(product: Product, categoryId: string): MenuItem {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    priceCents: product.basePriceCents,
    imageUrl: product.imageUrl,
    categoryId,
    isAvailable: true,
  };
}

/**
 * Branch Details: branch header (name/address/prep time) plus the branch menu
 * grouped by category. Reads the branch from the shared `BranchProvider` list
 * and the menu from `useMenu()` (scoped to the currently-selected branch, set
 * when the user tapped this branch in the locator). Tapping a product opens the
 * customization screen scoped to this branch.
 */
export default function BranchDetailsScreen() {
  const theme = useTheme();
  const { branchId } = useLocalSearchParams<{ branchId: string }>();
  const { branches, isLoading: branchLoading, isError: branchError, refetch: refetchBranch } =
    useBranch();
  const branch = branches.find((b) => b.id === branchId) ?? null;
  const menu = useMenu();

  const openProduct = (productId: string) => {
    router.push({
      pathname: '/(tabs)/order/product/[productId]',
      params: { productId, branchId },
    });
  };

  if (branchLoading || menu.isLoading) return <ScreenLoader />;
  if (branchError || !branch) {
    return (
      <ScreenMessage
        title="Couldn't load this branch"
        subtitle="Branch not found."
        actionLabel="Retry"
        onAction={() => {
          refetchBranch();
          void menu.refetch();
        }}
      />
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Card>
        <Text style={[styles.branchName, { color: theme.text }]}>{branch.name}</Text>
        <Text style={[styles.branchMeta, { color: theme.textSecondary }]}>{branch.address}</Text>
        <Text style={[styles.branchMeta, { color: theme.textSecondary }]}>
          Ready in about {branch.estimatedPrepMinutes} min
        </Text>
      </Card>

      {menu.isError || !menu.data ? (
        <ScreenMessage
          title="Menu unavailable"
          subtitle="No menu for this branch yet."
          actionLabel="Retry"
          onAction={() => void menu.refetch()}
        />
      ) : (
        menu.data.categories.map((category) => (
          <View key={category.id} style={styles.category}>
            <Text style={[styles.categoryTitle, { color: theme.text }]}>{category.name}</Text>
            <View style={styles.grid}>
              {category.products.map((product) => (
                <View key={product.id} style={styles.gridItem}>
                  <ProductCard
                    product={toMenuItem(product, category.id)}
                    onPress={() => openProduct(product.id)}
                  />
                  <Text style={[styles.price, { color: theme.textSecondary }]}>
                    {formatCurrency(product.basePriceCents)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  branchName: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h3 },
  branchMeta: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    marginTop: Spacing.one,
  },
  category: { gap: Spacing.two },
  categoryTitle: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  gridItem: { flexGrow: 1, flexBasis: '46%', gap: Spacing.half },
  price: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall },
});
