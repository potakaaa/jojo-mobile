import type { Category } from '@jojopotato/types';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface CategoryQuickNavProps {
  categories: Category[];
  /** Fired with the tapped category's id so the screen can scroll to its section. */
  onSelect: (categoryId: string) => void;
}

/**
 * Horizontal chip bar that jumps the Order-tab menu to a category section. One
 * chip per category; tapping one calls `onSelect(categoryId)` and the screen
 * scrolls its outer `ScrollView` to that category's recorded Y offset. Mirrors
 * `BranchSwitcher`'s safe horizontal-`ScrollView` chip pattern (no nested
 * VirtualizedList) and is fully theme-token driven.
 */
export function CategoryQuickNav({ categories, onSelect }: CategoryQuickNavProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>Jump to</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {categories.map((category) => (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityLabel={`Jump to ${category.name}`}
            testID={`quick-nav-chip-${category.id}`}
            onPress={() => onSelect(category.id)}
            style={[
              styles.chip,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.chipLabel, { color: theme.text }]} numberOfLines={1}>
              {category.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  label: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  row: {
    gap: Spacing.two,
    paddingVertical: Spacing.half,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.full,
    borderWidth: 2,
  },
  chipLabel: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
});
