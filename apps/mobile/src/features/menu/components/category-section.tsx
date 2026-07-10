import type { Category } from '@jojopotato/types';
import { ProductCard } from '@jojopotato/ui';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface CategorySectionProps {
  category: Category;
  onProductPress: (productId: string) => void;
}

/**
 * One menu category: header + a 2-column grid of the branch-available products
 * (already server-filtered, so all are available). Renders an explicit empty
 * state when the category has no products at the selected branch (AC4).
 */
export function CategorySection({ category, onProductPress }: CategorySectionProps) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: theme.text }]}>{category.name}</Text>
      {category.products.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>
          Nothing in this category at this branch yet.
        </Text>
      ) : (
        <FlatList
          data={category.products}
          keyExtractor={(item) => item.id}
          numColumns={2}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <ProductCard product={item} onPress={() => onProductPress(item.id)} />
          )}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  title: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  empty: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
  },
  grid: {
    gap: Spacing.two,
  },
  row: {
    gap: Spacing.two,
  },
});
