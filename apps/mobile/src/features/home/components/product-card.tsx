import type { MenuItem } from '@jojopotato/types';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ProductCardProps {
  product: MenuItem;
}

/**
 * Single product card: image (or a placeholder block when `imageUrl` is
 * absent), name, description, and a category tag. Tapping toggles a local
 * pressed highlight — it does not navigate.
 */
export function ProductCard({ product }: ProductCardProps) {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => setPressed((p) => !p)}
      style={[
        styles.container,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}
    >
      {product.imageUrl ? (
        <Image
          source={{ uri: product.imageUrl }}
          style={styles.image}
          contentFit="cover"
          accessibilityLabel={product.name}
        />
      ) : (
        <View style={[styles.imagePlaceholder, { backgroundColor: theme.tint }]} />
      )}
      <View style={styles.body}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {product.name}
        </Text>
        {product.description ? (
          <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>
            {product.description}
          </Text>
        ) : null}
        <View style={[styles.tag, { borderColor: theme.border }]}>
          <Text style={[styles.tagLabel, { color: theme.textSecondary }]}>{product.categoryId}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: Radii.md,
    borderWidth: 2,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    aspectRatio: 1,
  },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: 1,
  },
  body: {
    gap: Spacing.half,
    padding: Spacing.two,
  },
  name: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.bodySmall,
  },
  description: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.caption,
  },
  tag: {
    alignSelf: 'flex-start',
    marginTop: Spacing.half,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.full,
    borderWidth: 1,
  },
  tagLabel: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.caption,
  },
});
