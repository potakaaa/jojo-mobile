import { Pressable, type PressableProps, StyleSheet, Text, type ViewStyle } from 'react-native';

import { FontFamily, Palette, Radii, Shadows, TypeScale } from './theme';

export type JojoButtonVariant = 'primary' | 'accent' | 'ink';

export interface JojoButtonProps {
  label: string;
  onPress: () => void;
  variant?: JojoButtonVariant;
  disabled?: boolean;
  style?: ViewStyle;
}

const VARIANT_BACKGROUND: Record<JojoButtonVariant, string> = {
  primary: Palette.jyellow,
  accent: Palette.jred,
  ink: Palette.ink,
};

const VARIANT_LABEL_COLOR: Record<JojoButtonVariant, string> = {
  primary: Palette.ink,
  accent: Palette.cream,
  ink: Palette.cream,
};

/**
 * Reusable brand button primitive: full-pill shape, 2px ink outline, and the
 * signature flat "comic" offset shadow — proving the design tokens compose into
 * a real component.
 */
export function JojoButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
}: JojoButtonProps) {
  const accessibilityState: PressableProps['accessibilityState'] = { disabled };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: VARIANT_BACKGROUND[variant] },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, { color: VARIANT_LABEL_COLOR[variant] }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: Radii.full,
    borderWidth: 2,
    borderColor: Palette.ink,
    ...Shadows.offsetMd,
  },
  pressed: {
    // Nudge into the shadow to mimic the site's "press down" on the offset.
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
