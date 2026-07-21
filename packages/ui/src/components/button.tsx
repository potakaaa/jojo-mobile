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
  MinTouchTarget,
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
  mode: ThemeMode;
  style?: ViewStyle;
  /** Optional Ionicons glyph rendered before the label. */
  iconName?: keyof typeof Ionicons.glyphMap;
  /** Show a spinner in place of the icon and disable interaction. */
  loading?: boolean;
  /** Forwarded to the underlying Pressable, for precise test targeting. */
  testID?: string;
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
  mode,
  style,
  iconName,
  loading = false,
  testID,
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
      testID={testID}
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
        <Ionicons name={iconName} size={22} color={labelColor} />
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
    // 48dp kid-friendly touch-target floor (AC-A1). RN box-sizing is
    // border-box, so `minHeight` is inclusive of the 2px border — both `md`
    // and `sm` inherit this floor since `buttonSm` overrides padding only.
    minHeight: MinTouchTarget,
    paddingVertical: 12,
    // 16dp (was 24dp): the wider inset left too little room for ordinary labels
    // on width-constrained buttons (side-by-side `flex: 1` pairs, inline
    // actions), wrapping them onto a second line. The 48dp touch-target floor
    // above is unchanged — only the horizontal breathing room shrank.
    paddingHorizontal: Spacing.three,
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
    // `body` (16) rather than `h3` (18): the display-bold face is wide, and at
    // 18 ordinary labels wrapped to two lines on constrained buttons.
    fontSize: TypeScale.body,
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  labelSm: {
    fontSize: TypeScale.bodySmall,
  },
});
