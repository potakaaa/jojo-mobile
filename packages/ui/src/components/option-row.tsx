import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { formatPriceDelta } from '../price-delta';
import {
  Colors,
  FontFamily,
  MinTouchTarget,
  Palette,
  Radii,
  Spacing,
  TypeScale,
  type ThemeMode,
} from '../theme';

/**
 * Which selection control a row draws — and, just as importantly, which a11y
 * role it announces. `radio` = pick exactly one of the group; `checkbox` = any
 * number may be on at once.
 */
export type OptionControlKind = 'radio' | 'checkbox';

export interface OptionRowProps {
  /** The row's primary text, left-aligned and flexed to fill. */
  label: string;
  /** Price impact in cents. Zero/absent renders NO price text (see `formatPriceDelta`). */
  priceDeltaCents?: number | null;
  /** Whether this row is currently chosen. Controlled — the row holds no state. */
  selected: boolean;
  /** `radio` (pick one) or `checkbox` (these stack). Drives glyph AND a11y role. */
  control: OptionControlKind;
  onPress?: () => void;
  mode: ThemeMode;
  style?: ViewStyle;
}

/** Control box edge (dp). Kept local: `Radii`/`Spacing` carry no size scale. */
const CONTROL_SIZE = 24;
/** Filled radio dot edge (dp) — ~40% of the box, the conventional proportion. */
const DOT_SIZE = 10;

/**
 * A selectable full-width list row: a radio or checkbox control on the left, a
 * label in the middle, and an optional right-aligned price delta.
 *
 * REACH FOR THIS instead of hand-rolling a selectable row anywhere in the app —
 * option pickers, filter lists, settings choices, address/branch pickers. It is
 * the shared implementation behind `SizeSelector`, `FlavorSelector`, and
 * `AddOnSelector`, and it already handles the touch-target floor, the
 * light/dark token reads, and the correct a11y role for single- vs multi-select.
 * Wrap a `radio` group in a `View accessibilityRole="radiogroup"`.
 *
 * Why a glyph at all: the three selectors used to render
 * identical pill chips, so nothing distinguished "pick one" (size, flavor) from
 * "these stack" (add-ons), and all three announced `accessibilityRole="button"`
 * with `accessibilityState={{ selected }}` — semantically wrong for both cases.
 * A radio/checkbox glyph fixes the affordance and the a11y semantics at once,
 * and the glyph carries selection state independently of hue (colour is never
 * the only indicator).
 *
 * Presentation only: selection stays fully controlled by the parent's props, per
 * the package's no-context/no-hook convention.
 */
export function OptionRow({
  label,
  priceDeltaCents,
  selected,
  control,
  onPress,
  mode,
  style,
}: OptionRowProps) {
  const theme = Colors[mode];
  // `isSelected` is deliberately left at its default (false). It exists to keep
  // positive-delta text readable on the old jyellow selected CHIP; a selected
  // LIST row sits on `backgroundSelected` (dark panel-border in dark mode),
  // where `Palette.ink` would be unreadable. `textSecondary` reads correctly in
  // both modes and both selection states.
  const delta = formatPriceDelta(priceDeltaCents, mode);

  return (
    <Pressable
      accessibilityRole={control}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.row, selected ? { backgroundColor: theme.backgroundSelected } : null, style]}
    >
      <View
        style={[
          styles.control,
          control === 'radio' ? styles.controlRadio : styles.controlCheckbox,
          {
            borderColor: theme.border,
            backgroundColor: selected ? Palette.jyellow : theme.backgroundElement,
          },
        ]}
      >
        {selected ? (
          control === 'radio' ? (
            <View style={styles.dot} />
          ) : (
            <View style={styles.check} />
          )
        ) : null}
      </View>

      <Text
        style={[styles.label, { color: theme.text }, selected ? styles.labelSelected : null]}
        numberOfLines={2}
      >
        {label}
      </Text>

      {delta ? (
        <Text style={[styles.delta, { color: delta.color }]} numberOfLines={1}>
          {delta.text}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    // Kid-friendly touch-target floor (AC-A1). Full-width rows clear it easily;
    // the container spaces adjacent rows by 8dp so targets never crowd.
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radii.sm,
  },
  control: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlRadio: {
    borderRadius: CONTROL_SIZE / 2,
  },
  controlCheckbox: {
    borderRadius: Spacing.one,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: Palette.ink,
  },
  check: {
    // Classic two-border checkmark rotated 45°, so no icon dependency is needed.
    width: Spacing.half + Spacing.one,
    height: Spacing.three - Spacing.one,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: Palette.ink,
    transform: [{ rotate: '45deg' }],
    marginTop: -Spacing.half,
  },
  label: {
    flex: 1,
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
  },
  labelSelected: {
    fontFamily: FontFamily.body.bold,
  },
  delta: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
});

/**
 * Container styles for a vertical `OptionRow` list — 8dp between adjacent touch
 * targets. Spread onto the wrapping `View` so a hand-built list matches the
 * three shipped selectors: `<View style={optionListStyles.list}>`.
 */
export const optionListStyles = StyleSheet.create({
  list: {
    // 8dp between adjacent touch targets.
    gap: Spacing.two,
  },
});
