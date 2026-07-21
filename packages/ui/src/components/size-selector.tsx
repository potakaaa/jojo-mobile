import type { Size } from '@jojopotato/types';
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

export interface SizeSelectorProps {
  sizes: Size[];
  selectedSizeId?: string;
  onSelect?: (size: Size) => void;
  mode: ThemeMode;
  style?: ViewStyle;
}

/**
 * Row of tappable size pill chips. Selection is controlled via the
 * `selectedSizeId` prop (no internal selection state), matching the package's
 * no-context/no-hook convention.
 */
export function SizeSelector({ sizes, selectedSizeId, onSelect, mode, style }: SizeSelectorProps) {
  const theme = Colors[mode];

  return (
    <View style={[styles.row, style]}>
      {sizes.map((size) => {
        const isSelected = size.id === selectedSizeId;
        return (
          <Pressable
            key={size.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect?.(size)}
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
              {size.label}
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
