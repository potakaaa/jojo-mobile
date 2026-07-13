import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface AddOnOption {
  id: string;
  name: string;
}

export interface AddOnSelectorProps {
  options: AddOnOption[];
  /** Ids of the currently-selected add-ons (multi-select). */
  selectedIds: string[];
  onToggle?: (id: string) => void;
  mode?: ThemeMode;
  style?: ViewStyle;
}

/**
 * Multi-select toggle chip row for optional add-ons — the multi-select
 * counterpart to the single-select `FlavorSelector`/`SizeSelector`. Selection is
 * fully controlled via `selectedIds` (no internal state), matching the package's
 * no-context/no-hook convention.
 */
export function AddOnSelector({
  options,
  selectedIds,
  onToggle,
  mode = 'light',
  style,
}: AddOnSelectorProps) {
  const theme = Colors[mode];

  return (
    <View style={[styles.row, style]}>
      {options.map((option) => {
        const isSelected = selectedIds.includes(option.id);
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onToggle?.(option.id)}
            style={[
              styles.chip,
              {
                backgroundColor: isSelected ? Palette.jyellow : theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <Text
              style={[styles.label, { color: isSelected ? Palette.ink : theme.text }]}
              numberOfLines={1}
            >
              {option.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.full,
    borderWidth: 2,
  },
  label: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
});
