import { StyleSheet, Switch, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Optional label rendered beside the switch. */
  label?: string;
  disabled?: boolean;
  mode?: ThemeMode;
  style?: ViewStyle;
}

/**
 * Theme-token-driven on/off switch (wraps RN `Switch`). Renders an optional
 * `label` in a row beside the control. No app theme-hook dependency — mode is a
 * prop, matching the package's `size-selector`/`flavor-selector` convention.
 */
export function Toggle({
  value,
  onValueChange,
  label,
  disabled = false,
  mode = 'light',
  style,
}: ToggleProps) {
  const theme = Colors[mode];

  const control = (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      trackColor={{ false: theme.border, true: Palette.jyellow }}
      thumbColor={Palette.cream}
      ios_backgroundColor={theme.border}
    />
  );

  if (!label) {
    return <View style={style}>{control}</View>;
  }

  return (
    <View style={[styles.row, style]}>
      <Text style={[styles.label, { color: theme.text }]} numberOfLines={2}>
        {label}
      </Text>
      {control}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  label: {
    flex: 1,
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.body,
  },
});
