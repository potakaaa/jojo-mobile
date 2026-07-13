import type { ProductOption, ProductOptionType } from '@jojopotato/types';

/**
 * Required-option-group convention (locked INNOVATE decision #1, no schema
 * backing): `flavor` and `size` groups are required whenever present on a
 * product; `add_on` is always optional. Evaluated over ACTIVE options only.
 */
const REQUIRED_OPTION_TYPES: ProductOptionType[] = ['flavor', 'size'];

/** The option-group types that must be chosen for this product (AC8). */
export function getRequiredOptionTypes(options: ProductOption[]): ProductOptionType[] {
  const present = new Set(options.filter((o) => o.isActive).map((o) => o.optionType));
  return REQUIRED_OPTION_TYPES.filter((type) => present.has(type));
}

/**
 * True once every required group has a non-empty selection (AC8/AC9 gate).
 * `selectedByType` maps an option type to the chosen option id (or undefined).
 */
export function isRequiredSelectionComplete(
  options: ProductOption[],
  selectedByType: Partial<Record<ProductOptionType, string | undefined>>,
): boolean {
  return getRequiredOptionTypes(options).every((type) => {
    const selected = selectedByType[type];
    return selected !== undefined && selected !== '';
  });
}
