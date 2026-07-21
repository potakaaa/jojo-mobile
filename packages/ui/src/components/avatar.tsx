import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Shadows, type ThemeMode } from '../theme';

export interface AvatarProps {
  /** Display name the initials are derived from. Falls back to a person icon. */
  name?: string | null;
  /** Diameter in dp. Initials/icon scale from this. Defaults to 64. */
  size?: number;
  mode: ThemeMode;
  style?: ViewStyle;
}

/**
 * Circular brand avatar: a jyellow disc with a 2px ink border and the signature
 * hard offset shadow, showing up to two uppercase initials derived from `name`.
 * When no usable name is present it shows a neutral person glyph instead.
 *
 * The disc is always brand-yellow with ink content in both themes (the yellow
 * tint token is identical light/dark), so the initials read as ink regardless
 * of `mode`; `mode` still drives the border token for theme-correct framing.
 */
export function Avatar({ name, size = 64, mode, style }: AvatarProps) {
  const theme = Colors[mode];
  const initials = getInitials(name);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={initials ? `Avatar for ${name}` : 'Avatar'}
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.tint,
          borderColor: theme.border,
        },
        Shadows.offsetSm,
        style,
      ]}
    >
      {initials ? (
        <Text style={[styles.initials, { fontSize: size * 0.4, color: Palette.ink }]}>
          {initials}
        </Text>
      ) : (
        <Ionicons name="person" size={size * 0.5} color={Palette.ink} />
      )}
    </View>
  );
}

/** Up to two uppercase initials from the first and last name tokens. */
function getInitials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '';
  const last = parts[parts.length - 1];
  if (parts.length === 1 || !last) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: Radii.full,
  },
  initials: {
    fontFamily: FontFamily.display.bold,
    includeFontPadding: false,
  },
});
