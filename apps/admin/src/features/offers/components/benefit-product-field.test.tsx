import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { AdminProduct } from '@/features/products/lib/admin-products-api';

import type { AdminOffer } from '../lib/admin-offers-api';

// Mock the update mutation hook so the field can be tested in isolation (no
// QueryClientProvider). `vi.hoisted` makes `mutate` available inside the hoisted mock.
const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('../hooks/use-admin-offers', () => ({
  useUpdateOffer: () => ({ mutate, isPending: false, error: null }),
}));

import { BenefitProductField } from './benefit-product-field';

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

function makeProduct(id: string, name: string, over: Partial<AdminProduct> = {}): AdminProduct {
  return {
    id,
    categoryId: 'c1',
    name,
    slug: id,
    description: null,
    imageUrl: null,
    basePriceCents: 1000,
    isActive: true,
    isRewardEligible: false,
    isDeal: false,
    ...over,
  };
}

const PRODUCTS = [makeProduct('p1', 'Potato Fries'), makeProduct('p2', 'Cheese Dip')];

function makeOffer(over: Partial<AdminOffer> = {}): AdminOffer {
  return {
    id: 'o1',
    title: 'Free Fries',
    description: null,
    imageUrl: null,
    offerType: 'free_item',
    discountValueCents: null,
    minimumOrderAmountCents: 0,
    startAt: '2026-08-01T10:00:00.000Z',
    endAt: '2026-08-31T10:00:00.000Z',
    usageLimitPerUser: null,
    totalUsageLimit: null,
    isActive: true,
    promotionId: null,
    benefitProductId: 'p1',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...over,
  };
}

test('renders the benefit editor and shows the configured product name', () => {
  render(<BenefitProductField offer={makeOffer({ benefitProductId: 'p1' })} products={PRODUCTS} />);
  expect(screen.getByText('Benefit product')).toBeDefined();
  // The configured product name is rendered in the "Currently:" span (the picker also
  // lists it as an <option>, so disambiguate on the span selector).
  expect(screen.getByText('Potato Fries', { selector: 'span' })).toBeDefined();
  // Pre-selected to the configured product.
  expect((screen.getByLabelText('Product') as HTMLSelectElement).value).toBe('p1');
});

test("shows 'Not configured' when the offer has no benefit product", () => {
  render(<BenefitProductField offer={makeOffer({ benefitProductId: null })} products={PRODUCTS} />);
  expect(screen.getByText('Not configured')).toBeDefined();
});

test("shows 'Unknown product' when the benefit id is not in the products list", () => {
  render(
    <BenefitProductField offer={makeOffer({ benefitProductId: 'gone' })} products={PRODUCTS} />,
  );
  expect(screen.getByText('Unknown product')).toBeDefined();
});

test('disables save when no product is drafted (null benefit, empty draft)', () => {
  render(<BenefitProductField offer={makeOffer({ benefitProductId: null })} products={PRODUCTS} />);
  expect(
    (screen.getByRole('button', { name: 'Save benefit product' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

test('saves the drafted product via the update mutation', () => {
  render(<BenefitProductField offer={makeOffer({ benefitProductId: 'p1' })} products={PRODUCTS} />);
  // Change the draft to a different product, then save.
  fireEvent.change(screen.getByLabelText('Product'), { target: { value: 'p2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save benefit product' }));
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(mutate).toHaveBeenCalledWith({ id: 'o1', input: { benefitProductId: 'p2' } });
});

// F5: the picker must exclude inactive and deal products (invalid benefits server-side).
test('excludes inactive and deal products from the picker', () => {
  const products = [
    makeProduct('p1', 'Potato Fries'),
    makeProduct('p-inactive', 'Retired Item', { isActive: false }),
    makeProduct('p-deal', 'Combo Deal', { isDeal: true }),
  ];
  render(<BenefitProductField offer={makeOffer({ benefitProductId: 'p1' })} products={products} />);
  const optionValues = Array.from(
    (screen.getByLabelText('Product') as HTMLSelectElement).options,
  ).map((o) => o.value);
  expect(optionValues).toContain('p1');
  expect(optionValues).not.toContain('p-inactive');
  expect(optionValues).not.toContain('p-deal');
});
