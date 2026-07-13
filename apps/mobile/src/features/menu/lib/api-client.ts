import type { ProductOptionType, SelectedOption } from '@jojopotato/types';

import { apiRequest } from '@/features/shared/lib/api-request';

/**
 * One selectable product option (a size, flavor, or add-on). Field names mirror
 * the server's `ApiMenuOption` (`packages/api/src/routes/lib/serializers.ts`)
 * EXACTLY — the option identity is `optionId`, not `id`. `apiRequest` casts the
 * response with a bare `as T`, so any drift from the wire shape here is a silent
 * runtime bug (see `api-client.contract.ts` for the compile-time guard).
 */
export interface MenuProductOption {
  optionId: string;
  optionType: ProductOptionType;
  name: string;
  priceDeltaCents: number;
}

/**
 * A product on a branch menu, with its options grouped by type. Field names
 * mirror the server's `ApiMenuProduct` — the base price is `basePriceCents`.
 * The server does not send a reward-eligibility flag, so this type has none.
 */
export interface MenuProduct {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  basePriceCents: number;
  options: {
    size: MenuProductOption[];
    flavor: MenuProductOption[];
    add_on: MenuProductOption[];
  };
}

export interface MenuCategory {
  id: string;
  name: string;
  products: MenuProduct[];
}

export interface BranchMenu {
  categories: MenuCategory[];
}

/**
 * Build the cart `SelectedOption` for a chosen menu option. Extracted here (out
 * of the product screen) so it is unit-/contract-testable without React Native.
 * `optionId` is sourced from the wire's `optionId` field — the exact seam that
 * regressed in EVL cycle 1.
 */
export function toSelectedOption(
  option: MenuProductOption,
  optionType: SelectedOption['optionType'],
): SelectedOption {
  return {
    optionId: option.optionId,
    optionType,
    name: option.name,
    priceDeltaCents: option.priceDeltaCents,
  };
}

/** `GET /branches/:branchId/menu` — categories → products → grouped options. */
export function fetchBranchMenu(branchId: string): Promise<BranchMenu> {
  return apiRequest<BranchMenu>(`/branches/${encodeURIComponent(branchId)}/menu`);
}
