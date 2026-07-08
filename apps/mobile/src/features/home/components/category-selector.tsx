import type { MenuCategory } from '@jojopotato/types';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { FontFamily, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface CategorySelectorProps {
  categories: MenuCategory[];
}

/**
 * Horizontal scrollable row of category chips. Tapping a chip toggles its local
 * selected highlight. Self-contained — the selection is not propagated to the
 * product grid (no filtering required at this stage).
 */
export function CategorySelector({ categories }: CategorySelectorProps) {
  const theme = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {categories.map((category) => {
        const isSelected = category.id === selectedId;
        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => setSelectedId((current) => (current === category.id ? null : category.id))}
            style={[
              styles.chip,
              {
                backgroundColor: isSelected ? theme.tint : theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <Text style={[styles.chipLabel, { color: theme.text }]}>{category.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
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
