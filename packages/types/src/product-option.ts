export type ProductOptionType = 'size' | 'flavor' | 'add_on';

/**
 * A single customization choice selected for a cart line or order item
 * (e.g. a size, a flavor, or an add-on). `priceDeltaCents` is the integer-cents
 * adjustment this option applies to the line's unit price.
 */
export interface SelectedOption {
  optionId: string;
  optionType: ProductOptionType;
  name: string;
  priceDeltaCents: number;
}
