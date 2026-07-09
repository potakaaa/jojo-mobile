import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';

import { Colors, FontFamily, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface InputProps {
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
  label?: string;
  error?: string;
  mode?: ThemeMode;
  style?: ViewStyle;
  /** Keyboard variant, e.g. `email-address`, `phone-pad`, `number-pad`. */
  keyboardType?: TextInputProps['keyboardType'];
  /** Mask input for passwords. */
  secureTextEntry?: boolean;
  /** Auto-capitalization behavior; default `sentences` (RN default). */
  autoCapitalize?: TextInputProps['autoCapitalize'];
}

/**
 * Themed single-line text input with an optional label and error message.
 * Wraps RN `TextInput`, pulling border/background/text colors from the theme.
 */
export function Input({
  value,
  onChangeText,
  placeholder,
  editable = true,
  label,
  error,
  mode = 'light',
  style,
  keyboardType,
  secureTextEntry,
  autoCapitalize,
}: InputProps) {
  const theme = Colors[mode];

  return (
    <View style={[styles.wrap, style]}>
      {label ? <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        editable={editable}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        accessibilityLabel={label}
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: error ? theme.accent : theme.border,
            color: theme.text,
          },
        ]}
      />
      {error ? <Text style={[styles.error, { color: theme.accent }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.half,
  },
  label: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  input: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 2,
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.body,
  },
  error: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
});
