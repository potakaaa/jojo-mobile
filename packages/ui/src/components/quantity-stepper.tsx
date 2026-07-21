import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import {
  Colors,
  FontFamily,
  MinTouchTarget,
  Radii,
  Spacing,
  TypeScale,
  type ThemeMode,
} from '../theme';

export interface QuantityStepperProps {
  /** Current quantity (controlled — no internal state). */
  value: number;
  /** Called with the next quantity, already clamped to `[min, max]`. */
  onChange: (next: number) => void;
  /** Lowest selectable quantity (default 1). */
  min?: number;
  /** Highest selectable quantity (default 99). */
  max?: number;
  mode: ThemeMode;
  style?: ViewStyle;
}

/**
 * A two-button −/+ quantity control with the brand's comic outline styling.
 * Controlled via `value` (no internal selection state), matching the package's
 * no-context/no-hook convention. Each button meets the 48dp touch-target floor
 * (`MinTouchTarget`) and dims when its bound is reached.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  mode,
  style,
}: QuantityStepperProps) {
  const theme = Colors[mode];
  const canDecrement = value > min;
  const canIncrement = value < max;

  return (
    <View style={[styles.row, style]}>
      <StepperButton
        glyph="−"
        label="Decrease quantity"
        enabled={canDecrement}
        theme={theme}
        onPress={() => onChange(Math.max(min, value - 1))}
      />
      <View style={styles.valueWrap}>
        <Text
          style={[styles.value, { color: theme.text }]}
          accessibilityRole="text"
          accessibilityLabel={`Quantity ${value}`}
        >
          {value}
        </Text>
      </View>
      <StepperButton
        glyph="+"
        label="Increase quantity"
        enabled={canIncrement}
        theme={theme}
        onPress={() => onChange(Math.min(max, value + 1))}
      />
    </View>
  );
}

interface StepperButtonProps {
  glyph: string;
  label: string;
  enabled: boolean;
  theme: (typeof Colors)[ThemeMode];
  onPress: () => void;
}

function StepperButton({ glyph, label, enabled, theme, onPress }: StepperButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          opacity: !enabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.glyph, { color: theme.text }]}>{glyph}</Text>
    </Pressable>
  );
}

const BUTTON_SIZE = MinTouchTarget;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: Radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
    lineHeight: TypeScale.h2 + 2,
  },
  valueWrap: {
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
});
