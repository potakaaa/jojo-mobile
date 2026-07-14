import type {
  CartItemOption,
  MenuResponse,
  Order,
  OrderStatus,
  Product,
  ProductOption,
} from '@jojopotato/types';

/** DECISION 4: reorder is offered only for finished orders. */
export function reorderEligibility(status: OrderStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

/** One rebuildable line: current-menu Product + cart-shaped options + original quantity. */
export interface ReorderAvailableLine {
  /** From the CURRENT menu — `basePriceCents` is today's price (AC11). */
  product: Product;
  /** Matched to CURRENT options by `optionId`; `priceDeltaCents` is today's delta. */
  optionsForCart: CartItemOption[];
  /** Carried from the past OrderItem. */
  quantity: number;
}

/** One line that cannot be faithfully rebuilt today. */
export interface ReorderUnavailableLine {
  /** From the historical OrderItem (for display). */
  productName: string;
  /** Product gone from the menu, or a chosen option gone. */
  reason: 'product_unavailable' | 'option_unavailable';
}

export interface ReorderReconciliation {
  available: ReorderAvailableLine[];
  unavailable: ReorderUnavailableLine[];
}

/** Flatten the menu tree into a lookup of the CURRENT product by id. */
function productsById(menu: MenuResponse): Map<string, Product> {
  const map = new Map<string, Product>();
  for (const category of menu.categories) {
    for (const product of category.products) {
      map.set(product.id, product);
    }
  }
  return map;
}

/** Find the current option matching a historical `optionId` across all option groups. */
function findCurrentOption(product: Product, optionId: string): ProductOption | undefined {
  for (const group of Object.values(product.options)) {
    const match = group.find((opt) => opt.optionId === optionId);
    if (match) return match;
  }
  return undefined;
}

/**
 * DECISION 6: re-check each order line against the CURRENT branch menu.
 * - product not present in menu tree → unavailable ('product_unavailable')
 * - any selectedOption.optionId no longer in the product's current options → unavailable
 *   ('option_unavailable') (AC15: a partially-reconstructable multi-option line is flagged,
 *   never silently simplified)
 * - otherwise available, with options + price sourced from the CURRENT menu.
 */
export function reconcileReorder(order: Order, menu: MenuResponse): ReorderReconciliation {
  const currentProducts = productsById(menu);
  const available: ReorderAvailableLine[] = [];
  const unavailable: ReorderUnavailableLine[] = [];

  for (const line of order.items) {
    const product = currentProducts.get(line.productId);
    if (!product) {
      unavailable.push({ productName: line.productName, reason: 'product_unavailable' });
      continue;
    }

    const optionsForCart: CartItemOption[] = [];
    let optionMissing = false;
    for (const selected of line.selectedOptions) {
      const current = findCurrentOption(product, selected.optionId);
      if (!current) {
        optionMissing = true;
        break;
      }
      optionsForCart.push({
        optionType: current.optionType,
        id: current.optionId,
        name: current.name,
        priceDeltaCents: current.priceDeltaCents,
      });
    }

    if (optionMissing) {
      unavailable.push({ productName: line.productName, reason: 'option_unavailable' });
      continue;
    }

    available.push({ product, optionsForCart, quantity: line.quantity });
  }

  return { available, unavailable };
}
