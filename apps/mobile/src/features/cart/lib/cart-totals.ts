import type { CartLine } from '@/features/cart/hooks/use-cart';

/** Total price for a single cart line (unit price already folds in options). */
export function lineTotalCents(line: CartLine): number {
  return line.unitPriceCents * line.quantity;
}

/** Sum of every line total in the cart. */
export function cartSubtotalCents(items: CartLine[]): number {
  return items.reduce((sum, line) => sum + lineTotalCents(line), 0);
}
