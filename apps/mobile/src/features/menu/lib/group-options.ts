import type { ProductOption, ProductOptionType } from '@jojopotato/types';

export interface OptionGroup {
  type: ProductOptionType;
  options: ProductOption[];
}

// Display order of option groups on the Product Details screen.
const GROUP_ORDER: ProductOptionType[] = ['size', 'flavor', 'add_on'];

/**
 * Pure display helper: flat `ProductOption[]` -> groups by `optionType`, each
 * group's options sorted by `sortOrder`, groups in a fixed display order.
 * Display-only (not test-gated — see plan Test Plan).
 */
export function groupOptions(options: ProductOption[]): OptionGroup[] {
  const byType = new Map<ProductOptionType, ProductOption[]>();
  for (const option of options) {
    const list = byType.get(option.optionType) ?? [];
    list.push(option);
    byType.set(option.optionType, list);
  }

  return GROUP_ORDER.filter((type) => byType.has(type)).map((type) => ({
    type,
    options: [...(byType.get(type) ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}
