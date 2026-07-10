import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';

import {
  Colors,
  FontFamily,
  Palette,
  Radii,
  Shadows,
  Spacing,
  TypeScale,
  type ThemeMode,
} from '../theme';

export type ButtonVariant = 'primary' | 'accent' | 'ink' | 'outline';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  disabled?: boolean;
  mode?: ThemeMode;
  style?: ViewStyle;
  /** Optional Ionicons glyph rendered before the label. */
  iconName?: keyof typeof Ionicons.glyphMap;
  /** Show a spinner in place of the icon and disable interaction. */
  loading?: boolean;
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
  size = 'md',
  disabled = false,
  mode = 'light',
  style,
  iconName,
  loading = false,
}: ButtonProps) {
  const theme = Colors[mode];
  const isDisabled = disabled || loading;
  const accessibilityState: PressableProps['accessibilityState'] = {
    disabled: isDisabled,
    busy: loading,
  };

  const labelColor =
    variant === 'primary' ? Palette.ink : variant === 'outline' ? theme.text : Palette.cream;
  const borderColor = variant === 'outline' ? theme.border : Palette.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        { backgroundColor: VARIANT_BACKGROUND[variant], borderColor },
        variant !== 'outline' && Shadows.offsetSm,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={labelColor} />
      ) : iconName ? (
        <Ionicons name={iconName} size={20} color={labelColor} />
      ) : null}
      <Text style={[styles.label, size === 'sm' && styles.labelSm, { color: labelColor }]}>
        {label}
      </Text>
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
  buttonSm: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
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
  labelSm: {
    fontSize: TypeScale.body,
  },
});
