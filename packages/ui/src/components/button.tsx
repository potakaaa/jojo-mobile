import { Ionicons } from '@expo/vector-icons';
import { Pressable, type PressableProps, StyleSheet, Text, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Shadows, TypeScale, type ThemeMode } from '../theme';

export type ButtonVariant = 'primary' | 'accent' | 'ink' | 'outline';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  mode?: ThemeMode;
  style?: ViewStyle;
  /** Optional Ionicons glyph rendered before the label. */
  iconName?: keyof typeof Ionicons.glyphMap;
}

const VARIANT_BACKGROUND: Record<ButtonVariant, string> = {
  primary: Palette.jyellow,
  accent: Palette.jred,
  ink: Palette.ink,
  outline: 'transparent',
};

/**
 * General-purpose button primitive: the canonical shared button for the app,
 * with an `outline` variant and `mode`-aware label/border colors, keeping the
 * flat "comic" offset-shadow brand style.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  mode = 'light',
  style,
  iconName,
}: ButtonProps) {
  const theme = Colors[mode];
  const accessibilityState: PressableProps['accessibilityState'] = { disabled };

  const labelColor =
    variant === 'primary' ? Palette.ink : variant === 'outline' ? theme.text : Palette.cream;
  const borderColor = variant === 'outline' ? theme.border : Palette.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: VARIANT_BACKGROUND[variant], borderColor },
        variant !== 'outline' && Shadows.offsetSm,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {iconName ? <Ionicons name={iconName} size={20} color={labelColor} /> : null}
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: Radii.full,
    borderWidth: 2,
  },
  pressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
});
