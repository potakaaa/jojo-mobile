import { describe, expect, jest, test } from '@jest/globals';
import type { Category } from '@jojopotato/types';
import { fireEvent } from '@testing-library/react-native';

import { CategoryQuickNav } from '@/features/menu/components/category-quick-nav';
import { renderWithProviders } from '@/test-utils/render';

/**
 * AC4 — the category quick-nav renders one chip per category and wires each
 * chip's press to `onSelect(categoryId)`. Real scroll-offset landing is
 * Agent-Probe (jsdom/jest-expo cannot measure scroll); this proves the wiring.
 */

function makeCategory(id: string, name: string): Category {
  return { id, name, products: [] };
}

const categories: Category[] = [
  makeCategory('c1', 'Fries'),
  makeCategory('c2', 'Burgers'),
  makeCategory('c3', 'Drinks'),
  makeCategory('c4', 'Desserts'),
];

describe('CategoryQuickNav (AC4)', () => {
  test('renders one chip per category', async () => {
    const { getByTestId } = await renderWithProviders(
      <CategoryQuickNav categories={categories} onSelect={jest.fn()} />,
    );

    for (const category of categories) {
      expect(getByTestId(`quick-nav-chip-${category.id}`)).toBeTruthy();
    }
  });

  test('pressing a chip calls onSelect with that category id', async () => {
    const onSelect = jest.fn();
    const { getByTestId } = await renderWithProviders(
      <CategoryQuickNav categories={categories} onSelect={onSelect} />,
    );

    fireEvent.press(getByTestId('quick-nav-chip-c3'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('c3');
  });
});
