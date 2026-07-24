import type { ProductBranch } from '@jojopotato/types';

/**
 * Build the small caption naming which branch(es) carry a product, for the Home
 * grid and the Deals surfaces (home-all-branches AC2/AC3). Pure — no I/O, no
 * React — so it is unit-testable, mirroring the sibling
 * `filter-products-by-category` / `flattenMenuForHome` helpers.
 *
 * - no carrying branches (empty, or the field absent entirely — it is
 *   omit-when-absent on the branch-scoped menu) → `undefined`, meaning "render no
 *   caption row at all". Deliberately NOT an empty string: the card components
 *   treat a falsy `subtext` as "omit the row", and an empty row would still
 *   consume layout.
 * - exactly one → that branch's NAME (more useful than "Available at 1 branch").
 * - two or more → `Available at N branches`, using the REAL count.
 */
export function formatBranchSubtext(branches: ProductBranch[] | undefined): string | undefined {
  if (branches === undefined || branches.length === 0) return undefined;
  if (branches.length === 1) return branches[0]!.name;

  return `Available at ${branches.length} branches`;
}
