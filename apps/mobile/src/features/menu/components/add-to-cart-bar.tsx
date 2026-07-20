import { Button } from '@jojopotato/ui';
import { formatCurrency } from '@jojopotato/utils';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_FOOTPRINT } from '@/components/floating-tab-bar';
import { resolveTabBarClearance } from '@/components/floating-tab-bar.helpers';
import { FontFamily, MinTouchTarget, Palette, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/* ------------------------------------------------------------------ *
 * Rendered height of this bar, derived from the real styles below —
 * same convention as `BAR_CONTENT_HEIGHT` in floating-tab-bar.tsx.
 *
 * Deliberately ALWAYS the TALL variant (i.e. hint visible). The bar's real
 * height varies with its optional validation hint, and `showHint` is local state
 * INSIDE this component — the parent screen cannot see it without prop-drilling
 * or duplicating this component's logic. Anything anchored above the bar (a
 * Toast) must clear the state where the bar is TALLEST, so a fixed short-variant
 * offset can never hide a notice behind it. Cost: a small, harmless extra gap
 * when the hint is hidden.
 *
 * The height is a FUNCTION of `insets.bottom`, not a static export — the same
 * reason `resolveTabBarClearance` is a function. On iOS/Android this bar's own
 * paddingBottom is the device inset (device-dependent), so a static constant
 * could only ever describe the web variant. A previous static
 * `ADD_TO_CART_BAR_HEIGHT` did exactly that and under-reported the real iOS/
 * Android height by ~71dp + insets, letting the Toast paint over the button.
 * ------------------------------------------------------------------ */

/** styles.bar's own borderTopWidth. RN box-sizing is border-box, so this counts. */
const BAR_BORDER_WIDTH = 2;
/** styles.bar's own paddingTop. */
const BAR_PADDING_TOP = Spacing.two; // 8
/**
 * The bar's base paddingBottom, and its FULL paddingBottom on web (where the
 * platform-native tab bar reserves its own space).
 */
const BAR_BASE_PADDING_BOTTOM = Spacing.four; // 24
/** One `bodySmall` line (~1.2 line-height) — the hint, when visible. */
const BAR_HINT_HEIGHT = 17;
/**
 * styles.bar sets `gap: Spacing.one`, which RN applies BETWEEN direct children
 * of a column flex container. The hint <Text> and the row <View> are direct
 * siblings, so when the hint is visible this inter-child gap is real and counts.
 */
const BAR_HINT_ROW_GAP = Spacing.one; // 4
/** The price stack: one caption line + gap + one h3 line. */
const BAR_TEXT_BLOCK_HEIGHT = 14 + Spacing.one + 22; // ~40
/** styles.row is bounded by its tallest child — the Button's 48dp touch target. */
const BAR_ROW_CONTENT_HEIGHT = Math.max(BAR_TEXT_BLOCK_HEIGHT, MinTouchTarget); // 48

/**
 * Everything between the bar's paddings: the always-counted hint + gap + row.
 * Exported so a test can pin `getAddToCartBarHeight` against the bar's REAL
 * rendered padding/border styles rather than re-deriving them independently.
 */
export const BAR_CONTENT_BLOCK_HEIGHT = BAR_HINT_HEIGHT + BAR_HINT_ROW_GAP + BAR_ROW_CONTENT_HEIGHT; // 69

/**
 * The bar's real paddingBottom. SINGLE SOURCE: both the rendered style below and
 * `getAddToCartBarHeight` read this, so the height can never drift from what the
 * bar actually paints. This bar only ever renders on Product Details, which is
 * always pushed inside a tab's Stack — never a tab root — so isNested is
 * hardcoded true: the floating tab bar's footprint is never reserved here, only
 * the device inset plus the bar's own base padding. If this bar is ever reused
 * on a tab-root screen, this must change to a real isNestedTabRoute() check.
 */
const getBarPaddingBottom = (insetsBottom: number): number =>
  Platform.OS === 'web'
    ? BAR_BASE_PADDING_BOTTOM
    : resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insetsBottom) + BAR_BASE_PADDING_BOTTOM;

/**
 * Total rendered height (dp) of this bar in its tallest (hint-visible) state.
 * Screens anchoring content above the bar (a Toast) size themselves off this.
 * web: 2 + 8 + 69 + 24 = 103. iOS/Android: 2 + 8 + 69 + (insets + 24) = 103 + insets
 * — no floating-tab-bar footprint term, since this bar only ever renders on a
 * nested (pushed) screen where that bar is already hidden.
 */
export const getAddToCartBarHeight = (insetsBottom: number): number =>
  BAR_BORDER_WIDTH + BAR_PADDING_TOP + BAR_CONTENT_BLOCK_HEIGHT + getBarPaddingBottom(insetsBottom);

export interface AddToCartBarProps {
  /** Live unit price in integer cents (base + selected option deltas). */
  unitPriceCents: number;
  /** True once all required option groups have a selection (AC8). */
  canAdd: boolean;
  /** False when the product is unavailable at the selected branch (AC11). */
  isAvailable: boolean;
  onAdd: () => void;
}

/**
 * Sticky bottom bar: live computed unit price + an Add-to-Cart button. The
 * button is dimmed until required options are chosen; tapping it while
 * incomplete surfaces an inline validation message rather than adding (AC9).
 * When the product is unavailable it shows an unavailable state instead (AC11).
 */
export function AddToCartBar({ unitPriceCents, canAdd, isAvailable, onAdd }: AddToCartBarProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();
  const [showHint, setShowHint] = useState(false);

  // The hint only renders while required options are still missing
  // (`showHint && !canAdd` below), so no reset effect is needed once complete.
  const handlePress = () => {
    if (!isAvailable) return;
    if (!canAdd) {
      setShowHint(true);
      return;
    }
    onAdd();
  };

  return (
    <View
      testID="add-to-cart-bar"
      style={[
        styles.bar,
        { backgroundColor: theme.backgroundElement, borderTopColor: theme.border },
        // Always set from the single source above (which returns the web value on
        // web) rather than a `Platform.OS !== 'web' &&` override of a StyleSheet
        // default — an overridden default is invisible to anything reading the
        // StyleSheet, which is precisely how the Toast overlap shipped.
        { paddingBottom: getBarPaddingBottom(insets.bottom) },
      ]}
    >
      {showHint && !canAdd ? (
        <Text style={[styles.hint, { color: Palette.jred }]}>
          Please choose the required options first.
        </Text>
      ) : null}
      <View style={styles.row}>
        <View>
          <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>Total</Text>
          <Text style={[styles.price, { color: theme.text }]}>
            {formatCurrency(unitPriceCents)}
          </Text>
        </View>
        {isAvailable ? (
          <Button
            label="Add to Cart"
            onPress={handlePress}
            style={StyleSheet.flatten([styles.addButton, !canAdd && styles.addButtonDim])}
            mode={mode}
          />
        ) : (
          <Button
            label="Unavailable"
            onPress={() => {}}
            variant="outline"
            disabled
            style={styles.addButton}
            mode={mode}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: BAR_BORDER_WIDTH,
    paddingHorizontal: Spacing.four,
    paddingTop: BAR_PADDING_TOP,
    // NOTE: no `paddingBottom` here on purpose — it is always supplied by
    // `getBarPaddingBottom` at the render site so there is exactly one source.
    gap: BAR_HINT_ROW_GAP,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  hint: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  priceLabel: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  price: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  addButton: {
    minWidth: 160,
  },
  addButtonDim: {
    opacity: 0.5,
  },
});
