import type { Flavor } from '@jojopotato/types';
import { View, type ViewStyle } from 'react-native';

import { OptionRow, optionListStyles } from './option-row';
import { type ThemeMode } from '../theme';

export interface FlavorSelectorProps {
  flavors: Flavor[];
  selectedFlavorId?: string;
  onSelect?: (flavor: Flavor) => void;
  mode: ThemeMode;
  style?: ViewStyle;
}

/**
 * Vertical list of single-select flavor rows, each with a radio control.
 * Selection is controlled via the `selectedFlavorId` prop (no internal selection
 * state), matching the package's no-context/no-hook convention.
 */
export function FlavorSelector({
  flavors,
  selectedFlavorId,
  onSelect,
  mode,
  style,
}: FlavorSelectorProps) {
  return (
    <View accessibilityRole="radiogroup" style={[optionListStyles.list, style]}>
      {flavors.map((flavor) => (
        <OptionRow
          key={flavor.id}
          control="radio"
          label={flavor.name}
          priceDeltaCents={flavor.priceDeltaCents}
          selected={flavor.id === selectedFlavorId}
          onPress={() => onSelect?.(flavor)}
          mode={mode}
        />
      ))}
    </View>
  );
}
