import type { Category } from '@jojopotato/types';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { FontFamily, Palette, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface CategorySelectorProps {
  categories: Category[];
}

/** Small emoji glyph per known category id, purely decorative. */
const CATEGORY_EMOJI: Record<string, string> = {
  classic: '🍟',
  cheesy: '🧀',
  spicy: '🌶️',
  'sweet-savory': '🍯',
};

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
        const emoji = CATEGORY_EMOJI[category.id];
        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() =>
              setSelectedId((current) => (current === category.id ? null : category.id))
            }
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
