import type { MenuCategory } from '@jojopotato/types';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { FontFamily, Palette, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface CategorySelectorProps {
  categories: MenuCategory[];
  /** The currently-filtered category id, or `null` when no filter is active. */
  selectedId: string | null;
  /** Called with the newly-selected id, or `null` when the filter is cleared. */
  onSelect: (categoryId: string | null) => void;
}

/** Small emoji glyph per known category id, purely decorative. */
const CATEGORY_EMOJI: Record<string, string> = {
  classic: '🍟',
  cheesy: '🧀',
  spicy: '🌶️',
  'sweet-savory': '🍯',
};

/**
 * Horizontal scrollable row of category chips. Single-select toggle: tapping a
 * chip selects it, tapping the selected chip again clears the selection.
 * Controlled — the selection is owned by the parent screen and propagates
 * outward via `onSelect`, which is what filters the product grid.
 */
export function CategorySelector({ categories, selectedId, onSelect }: CategorySelectorProps) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {categories.map((category) => {
        const isSelected = category.id === selectedId;
        const emoji = CATEGORY_EMOJI[category.id];
        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(category.id === selectedId ? null : category.id)}
            style={[
              styles.chip,
              {
                backgroundColor: isSelected ? Palette.jyellow : theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            {emoji ? <Text style={styles.chipEmoji}>{emoji}</Text> : null}
            <Text style={[styles.chipLabel, { color: isSelected ? Palette.ink : theme.text }]}>
              {category.name}
            </Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.full,
    borderWidth: 2,
  },
  chipEmoji: {
    fontSize: TypeScale.bodySmall,
  },
  chipLabel: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
});
