import { Ionicons } from '@expo/vector-icons';
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

export interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Optional right-aligned value (e.g. a stored field). */
  value?: string;
  /** When set, the row is a Pressable and (by default) shows a trailing chevron. */
  onPress?: () => void;
  /** Force-hide/show the chevron. Defaults to true for pressable rows, false otherwise. */
  showChevron?: boolean;
  /** Tints the icon + label with the danger accent (e.g. Log out). */
  destructive?: boolean;
  mode: ThemeMode;
  style?: ViewStyle;
}

/**
 * A single settings/menu line: a leading themed icon disc, a label, an optional
 * right-aligned value, and (for actionable rows) a trailing chevron. Actionable
 * rows are Pressable and lift the pressed state via a tinted surface. Static
 * rows (no `onPress`) render as a plain informational line — used for the
 * read-only profile fields.
 *
 * Designed to be stacked inside a single `Card` with `SettingsRow.Divider`
 * between items.
 */
export function SettingsRow({
  icon,
  label,
  value,
  onPress,
  showChevron,
  destructive = false,
  mode,
  style,
}: SettingsRowProps) {
  const theme = Colors[mode];
  const contentColor = destructive ? theme.accent : theme.text;
  const iconColor = destructive ? theme.accent : theme.textSecondary;
  const chevron = showChevron ?? Boolean(onPress);

  const inner = (
    <>
      <View
        style={[styles.iconDisc, { backgroundColor: theme.background, borderColor: theme.border }]}
      >
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>

      <Text style={[styles.label, { color: contentColor }]} numberOfLines={1}>
        {label}
      </Text>

      {value ? (
        <Text style={[styles.value, { color: theme.textSecondary }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}

      {chevron ? <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, style]}>{inner}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: theme.backgroundSelected },
        style,
      ]}
    >
      {inner}
    </Pressable>
  );
}

/** Hairline divider between stacked rows. */
function Divider({ mode }: { mode: ThemeMode }) {
  const theme = Colors[mode];
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

SettingsRow.Divider = Divider;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: MinTouchTarget,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    borderRadius: Radii.sm,
  },
  iconDisc: {
    width: 36,
    height: 36,
    borderRadius: Radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.body,
  },
  value: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    maxWidth: '45%',
    textAlign: 'right',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.half,
    opacity: 0.4,
  },
});
