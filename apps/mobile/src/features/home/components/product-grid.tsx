import type { MenuItem } from '@jojopotato/types';
import { ProductCard } from '@jojopotato/ui';
import { FlatList, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { resolveImageUrl } from '@/lib/image-url';

export interface ProductGridProps {
  products: MenuItem[];
  /** Called with the tapped product's id, for navigation wiring. */
  onProductPress?: (productId: string) => void;
}

/**
 * 2-column grid of product cards. `scrollEnabled` is disabled because this grid
 * renders inside the Home screen's outer `ScrollView` — the outer scroll owns
 * vertical scrolling, avoiding nested-VirtualizedList warnings.
 */
export function ProductGrid({ products, onProductPress }: ProductGridProps) {
  return (
    <FlatList
      data={products}
      keyExtractor={(item) => item.id}
      numColumns={2}
      scrollEnabled={false}
      renderItem={({ item }) => {
        const imageUri = resolveImageUrl(item.imageUrl);
        return (
          <ProductCard
            product={item}
            imageSource={imageUri ? { uri: imageUri } : undefined}
            onPress={onProductPress ? () => onProductPress(item.id) : undefined}
          />
        );
      }}
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
