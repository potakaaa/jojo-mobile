import type { ProductBranch } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import { formatBranchSubtext } from '../format-branch-subtext';

/**
 * home-all-branches AC2/AC3 — the card caption naming which branch(es) carry a
 * product.
 *
 * Non-vacuous by construction: a passthrough / always-undefined / always-count
 * implementation each fails at least two of these cases. The 1-branch case pins
 * the NAME (not a count), the 2-branch case pins the COUNT wording, and the
 * empty/absent cases pin "render no row at all" rather than an empty string.
 */
function branch(id: string, name: string): ProductBranch {
  return { id, name };
}

describe('formatBranchSubtext', () => {
  it('returns undefined when no branch carries the product', () => {
    expect(formatBranchSubtext([])).toBeUndefined();
  });

  it('returns undefined when the branches field is absent entirely', () => {
    // `branches` is omit-when-absent on the branch-scoped menu, so callers can
    // legitimately pass undefined.
    expect(formatBranchSubtext(undefined)).toBeUndefined();
  });

  it('returns the branch NAME (not a count) when exactly one branch carries it', () => {
    expect(formatBranchSubtext([branch('b1', 'Jojo Potato - Cogon')])).toBe('Jojo Potato - Cogon');
  });

  it('returns "Available at 2 branches" for two carrying branches', () => {
    expect(formatBranchSubtext([branch('b1', 'Cogon'), branch('b2', 'Centrio')])).toBe(
      'Available at 2 branches',
    );
  });

  it('uses the REAL count for more than two carrying branches', () => {
    const branches = [
      branch('b1', 'Cogon'),
      branch('b2', 'Centrio'),
      branch('b3', 'SM Downtown'),
      branch('b4', 'Limketkai'),
    ];

    expect(formatBranchSubtext(branches)).toBe('Available at 4 branches');
  });

  it('never leaks a branch name into the multi-branch wording', () => {
    const result = formatBranchSubtext([branch('b1', 'Cogon'), branch('b2', 'Centrio')]);

    expect(result).not.toContain('Cogon');
    expect(result).not.toContain('Centrio');
  });
});
