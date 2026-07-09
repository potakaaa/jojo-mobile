import type { MenuItem } from '@jojopotato/types';
import { ProductCard } from '@jojopotato/ui';
import { FlatList, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { getProductImage } from '../product-images';

export interface ProductGridProps {
  products: MenuItem[];
}

/**
 * 2-column grid of product cards. `scrollEnabled` is disabled because this grid
 * renders inside the Home screen's outer `ScrollView` — the outer scroll owns
 * vertical scrolling, avoiding nested-VirtualizedList warnings.
 */
export function ProductGrid({ products }: ProductGridProps) {
  return (
    <FlatList
      data={products}
      keyExtractor={(item) => item.id}
      numColumns={2}
      scrollEnabled={false}
      renderItem={({ item }) => (
        <ProductCard product={item} imageSource={getProductImage(item.categoryId)} />
      )}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.two,
  },
  row: {
    gap: Spacing.two,
  },
});
