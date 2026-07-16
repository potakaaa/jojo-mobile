import type { Deal, Product } from '@jojopotato/types';
import { formatCurrency } from '@jojopotato/utils';

/**
 * Adapt a deal-PRODUCT into the display-only shape `DealCard` renders (ADM-004
 * repoint). `DealCard` reads only `title`/`description`/`imageUrl`/`discountLabel`
 * — the deal's own price goes in the badge (`discountLabel`). The remaining
 * `Deal` fields are inert placeholders (never read by the card); this is a pure
 * view-model, no eligibility/discount semantics. `DealCard` lives in `packages/ui`
 * (out of this phase's blast radius), so the product is mapped here rather than
 * changing the shared component's prop contract. Shared by the Deals tab list and
 * the Home deals strip so both render deal-products through one adapter.
 */
export function dealProductToCard(product: Product): Deal {
  return {
    id: product.id,
    title: product.name,
    description: product.description,
    discountLabel: formatCurrency(product.basePriceCents),
    imageUrl: product.imageUrl,
    dealType: 'bundle',
    discountValue: 0,
    minimumOrderAmount: 0,
    startAt: '',
    endAt: '',
    isActive: true,
    eligibleProductIds: [],
    eligibleBranchIds: [],
  };
}
