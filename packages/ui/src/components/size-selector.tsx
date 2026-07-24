import type { Size } from '@jojopotato/types';
import { View, type ViewStyle } from 'react-native';

import { OptionRow, optionListStyles } from './option-row';
import { type ThemeMode } from '../theme';

export interface SizeSelectorProps {
  sizes: Size[];
  selectedSizeId?: string;
  onSelect?: (size: Size) => void;
  mode: ThemeMode;
  style?: ViewStyle;
}

/**
 * Vertical list of single-select size rows, each with a radio control. Selection
 * is controlled via the `selectedSizeId` prop (no internal selection state),
 * matching the package's no-context/no-hook convention.
 */
export function SizeSelector({ sizes, selectedSizeId, onSelect, mode, style }: SizeSelectorProps) {
  return (
    <View accessibilityRole="radiogroup" style={[optionListStyles.list, style]}>
      {sizes.map((size) => (
        <OptionRow
          key={size.id}
          control="radio"
          label={size.label}
          priceDeltaCents={size.priceModifierCents}
          selected={size.id === selectedSizeId}
          onPress={() => onSelect?.(size)}
          mode={mode}
        />
      ))}
    </View>
  );
}
