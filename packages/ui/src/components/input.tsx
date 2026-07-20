import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import {
  Pressable,
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
  mode: ThemeMode;
  style?: ViewStyle;
  /** Keyboard variant, e.g. `email-address`, `phone-pad`, `number-pad`. */
  keyboardType?: TextInputProps['keyboardType'];
  /** Mask input for passwords. */
  secureTextEntry?: boolean;
  /** Auto-capitalization behavior; default `sentences` (RN default). */
  autoCapitalize?: TextInputProps['autoCapitalize'];
  /** Cap the number of characters accepted (e.g. `2` for MM/DD, `4` for YYYY). */
  maxLength?: number;
  /** Raw key-press handler, e.g. to detect Backspace for auto-tab-back. */
  onKeyPress?: TextInputProps['onKeyPress'];
  /** Horizontal text alignment inside the field. */
  textAlign?: TextInputProps['textAlign'];
  /** Return-key variant for the on-screen keyboard. */
  returnKeyType?: TextInputProps['returnKeyType'];
  /**
   * Explicit accessibility label. Falls back to `label` when unset, so labelless
   * fields (e.g. the MM/DD/YYYY birthday inputs) can still be announced distinctly.
   */
  accessibilityLabel?: string;
}

/**
 * Themed single-line text input with an optional label and error message.
 * Wraps RN `TextInput`, pulling border/background/text colors from the theme.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    value,
    onChangeText,
    placeholder,
    editable = true,
    label,
    error,
    mode,
    style,
    keyboardType,
    secureTextEntry,
    autoCapitalize,
    maxLength,
    onKeyPress,
    textAlign,
    returnKeyType,
    accessibilityLabel,
  },
  ref,
) {
  const theme = Colors[mode];
  const [hidden, setHidden] = useState(true);

  return (
    <View style={[styles.wrap, style]}>
      {label ? <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text> : null}
      <View style={styles.field}>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          editable={editable}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry && hidden}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          onKeyPress={onKeyPress}
          textAlign={textAlign}
          returnKeyType={returnKeyType}
          accessibilityLabel={accessibilityLabel ?? label}
          style={[
            styles.input,
            secureTextEntry ? styles.inputWithToggle : null,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: error ? theme.accent : theme.border,
              color: theme.text,
            },
          ]}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={Spacing.two}
            onPress={() => setHidden((h) => !h)}
            style={styles.toggle}
          >
            <Ionicons name={hidden ? 'eye' : 'eye-off'} size={20} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={[styles.error, { color: theme.accent }]}>{error}</Text> : null}
    </View>
  );
});

Input.displayName = 'Input';

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.half,
  },
  label: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  field: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 2,
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.body,
  },
  inputWithToggle: {
    paddingRight: Spacing.six,
  },
  toggle: {
    position: 'absolute',
    right: Spacing.three,
  },
  error: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
});
