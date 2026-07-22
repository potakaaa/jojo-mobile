import { formatCurrency } from '@jojopotato/utils';

import { Colors, Palette, type ThemeMode } from './theme';

export interface PriceDeltaDisplay {
  /** Ready-to-render text, e.g. `"+₱12.00"` (positive) or `"-₱12.00"` (negative). */
  text: string;
  /** Theme token colour to render `text` in. */
  color: string;
}

/**
 * Format an option's price impact for display next to its name/label.
 *
 * Rules (SPEC A1 / AC1-AC3):
 * - Zero or absent delta -> `null`. Callers render NO price text at all for
 *   these — no "+₱0.00", no "Included", nothing.
 * - Positive delta -> leading `"+"` prefix (e.g. `"+₱12.00"`), rendered in a
 *   neutral colour so it reads as a plain upcharge.
 * - Negative delta -> NO `"+"` prefix. `formatCurrency` already renders its own
 *   leading `"-"` for negative input, so the text differs in sign AND the colour
 *   switches to the accent token — two independent signals that this is not an
 *   upcharge (AC3).
 *
 * `isSelected` only affects the positive-case colour: a selected chip sits on a
 * `Palette.jyellow` background where `textSecondary` would be low-contrast.
 * Negative deltas always use the accent token regardless of selection, so the
 * positive/negative distinction never collapses.
 */
export function formatPriceDelta(
  deltaCents: number | null | undefined,
  mode: ThemeMode,
  isSelected = false,
): PriceDeltaDisplay | null {
  if (deltaCents == null || deltaCents === 0) return null;

  const theme = Colors[mode];

  if (deltaCents < 0) {
    return { text: formatCurrency(deltaCents), color: theme.accent };
  }

  return {
    text: `+${formatCurrency(deltaCents)}`,
    color: isSelected ? Palette.ink : theme.textSecondary,
  };
}
