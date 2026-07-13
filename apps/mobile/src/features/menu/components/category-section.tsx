import type { Category, Product } from '@jojopotato/types';
import { ProductCard } from '@jojopotato/ui';
import { StyleSheet, Text, View } from 'react-native';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface CategorySectionProps {
  category: Category;
  onProductPress: (productId: string) => void;
}

/** Chunk a flat list into fixed-size rows (2-column grid rows here). */
function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

/**
 * One menu category: header + a 2-column grid of the branch-available products
 * (already server-filtered, so all are available). Renders an explicit empty
 * state when the category has no products at the selected branch (AC4). Uses a
 * plain `View`-based grid (not `FlatList`) — this screen already scrolls inside
 * an outer `ScrollView`, and nesting a `FlatList`/`VirtualizedList` there
 * triggers RN's nested-list warning regardless of `scrollEnabled`.
 */
export function CategorySection({ category, onProductPress }: CategorySectionProps) {
  const theme = useTheme();
  const rows = chunk(category.products, 2);

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: theme.text }]}>{category.name}</Text>
      {category.products.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>
          Nothing in this category at this branch yet.
        </Text>
      ) : (
        <View style={styles.grid}>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {row.map((product: Product) => (
                <View key={product.id} style={styles.cell}>
                  <ProductCard product={product} onPress={() => onProductPress(product.id)} />
                </View>
              ))}
              {row.length < 2 ? <View style={styles.cell} /> : null}
            </View>
          ))}
        </View>
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
    flexDirection: 'row',
    gap: Spacing.two,
  },
  cell: {
    flex: 1,
  },
});
