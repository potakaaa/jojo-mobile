import type { Flavor } from '@jojopotato/types';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import {
  Colors,
  FontFamily,
  MinTouchTarget,
  Palette,
  Radii,
  Spacing,
  TypeScale,
  type ThemeMode,
} from '../theme';

export interface FlavorSelectorProps {
  flavors: Flavor[];
  selectedFlavorId?: string;
  onSelect?: (flavor: Flavor) => void;
  mode: ThemeMode;
  style?: ViewStyle;
}

/**
 * Row of tappable flavor pill chips. Selection is controlled via the
 * `selectedFlavorId` prop (no internal selection state), matching the package's
 * no-context/no-hook convention.
 */
export function FlavorSelector({
  flavors,
  selectedFlavorId,
  onSelect,
  mode,
  style,
}: FlavorSelectorProps) {
  const theme = Colors[mode];

  return (
    <View style={[styles.row, style]}>
      {flavors.map((flavor) => {
        const isSelected = flavor.id === selectedFlavorId;
        return (
          <Pressable
            key={flavor.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect?.(flavor)}
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
              {flavor.name}
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
    // Kid-friendly touch-target floor (AC-A1): chips are interactive rows, so
    // they meet the same 48dp minimum as buttons. Centered content keeps the
    // pill visually compact while the tappable area grows.
    minHeight: MinTouchTarget,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.full,
    borderWidth: 2,
  },
  label: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
});
