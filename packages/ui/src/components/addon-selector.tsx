import { View, type ViewStyle } from 'react-native';

import { OptionRow, optionListStyles } from './option-row';
import { type ThemeMode } from '../theme';

export interface AddOnOption {
  id: string;
  name: string;
  /**
   * Price impact of adding this option, in cents. Optional and additive —
   * callers that omit it (or pass `0`) render no price text at all.
   */
  priceDeltaCents?: number;
}

export interface AddOnSelectorProps {
  options: AddOnOption[];
  /** Ids of the currently-selected add-ons (multi-select). */
  selectedIds: string[];
  onToggle?: (id: string) => void;
  mode: ThemeMode;
  style?: ViewStyle;
}

/**
 * Vertical list of multi-select add-on rows, each with a checkbox control — the
 * multi-select counterpart to the radio-based `FlavorSelector`/`SizeSelector`.
 * The checkbox glyph (vs. a radio) is what tells a customer these stack.
 * Selection is fully controlled via `selectedIds` (no internal state), matching
 * the package's no-context/no-hook convention.
 */
export function AddOnSelector({ options, selectedIds, onToggle, mode, style }: AddOnSelectorProps) {
  return (
    <View style={[optionListStyles.list, style]}>
      {options.map((option) => (
        <OptionRow
          key={option.id}
          control="checkbox"
          label={option.name}
          priceDeltaCents={option.priceDeltaCents}
          selected={selectedIds.includes(option.id)}
          onPress={() => onToggle?.(option.id)}
          mode={mode}
        />
      ))}
    </View>
  );
}
