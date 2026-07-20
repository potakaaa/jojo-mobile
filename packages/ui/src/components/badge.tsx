import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  mode: ThemeMode;
  style?: ViewStyle;
}

const VARIANT_BACKGROUND: Record<BadgeVariant, string> = {
  default: Palette.jyellow,
  success: Palette.green,
  warning: Palette.jorange,
  danger: Palette.jred,
};

const VARIANT_LABEL_COLOR: Record<BadgeVariant, string> = {
  default: Palette.ink,
  success: Palette.cream,
  warning: Palette.ink,
  danger: Palette.cream,
};

/**
 * Small pill label. Full-radius, themed ink border, variant-driven background
 * and label color.
 */
export function Badge({ label, variant = 'default', mode, style }: BadgeProps) {
  const theme = Colors[mode];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: VARIANT_BACKGROUND[variant], borderColor: theme.border },
        style,
      ]}
    >
      <Text style={[styles.label, { color: VARIANT_LABEL_COLOR[variant] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.full,
    borderWidth: 1.5,
  },
  label: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption,
  },
});
