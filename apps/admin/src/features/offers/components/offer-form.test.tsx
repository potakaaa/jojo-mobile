import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { AdminProduct } from '@/features/products/lib/admin-products-api';

import type { AdminOffer } from '../lib/admin-offers-api';

import { OfferForm } from './offer-form';

afterEach(cleanup);

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

test('converts PHP inputs to cents and emits the offer payload', () => {
  const onSubmit = vi.fn();
  render(
    <OfferForm
      promotions={[]}
      products={[]}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: '10% Off' } });
  // Default mechanic is percentage_discount → value entered as a percent.
  fireEvent.change(screen.getByLabelText('Discount percent (%)'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Minimum order (₱)'), { target: { value: '50' } });
  fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-08-01T10:00' } });
  fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-08-31T10:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create offer' }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  const arg = onSubmit.mock.calls[0]![0];
  expect(arg.title).toBe('10% Off');
  expect(arg.offerType).toBe('percentage_discount');
  expect(arg.discountValueCents).toBe(1000);
  expect(arg.minimumOrderAmountCents).toBe(5000);
  expect(arg.benefitProductId).toBeUndefined();
});

test('hides the scalar value field for a complex mechanic', () => {
  render(
    <OfferForm
      promotions={[]}
      products={[]}
      submitting={false}
      error={null}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'bundle' } });
  expect(screen.queryByLabelText('Discount amount (₱)')).toBeNull();
  expect(screen.queryByLabelText('Discount percent (%)')).toBeNull();
});

test('shows the benefit-product picker only for free mechanics', () => {
  render(
    <OfferForm
      promotions={[]}
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );

  // Default is percentage_discount — no benefit picker, but the scalar field shows.
  expect(screen.queryByLabelText('Benefit product')).toBeNull();
  expect(screen.getByLabelText('Discount percent (%)')).toBeDefined();

  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'free_item' } });
  expect(screen.getByLabelText('Benefit product')).toBeDefined();
  // The scalar value field is hidden for a benefit mechanic.
  expect(screen.queryByLabelText('Discount percent (%)')).toBeNull();
  expect(screen.queryByLabelText('Discount amount (₱)')).toBeNull();
});

test('blocks submit for a free-mechanic offer with no benefit product', () => {
  const onSubmit = vi.fn();
  render(
    <OfferForm
      promotions={[]}
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Free Fries' } });
  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'free_item' } });
  fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-08-01T10:00' } });
  fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-08-31T10:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create offer' }));

  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText('Select a benefit product for this mechanic.')).toBeDefined();
});

test('emits benefitProductId (and no scalar value) for a valid free-mechanic offer', () => {
  const onSubmit = vi.fn();
  render(
    <OfferForm
      promotions={[]}
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Free Fries' } });
  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'free_item' } });
  fireEvent.change(screen.getByLabelText('Benefit product'), { target: { value: 'p1' } });
  fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-08-01T10:00' } });
  fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-08-31T10:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create offer' }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  const arg = onSubmit.mock.calls[0]![0];
  expect(arg.offerType).toBe('free_item');
  expect(arg.benefitProductId).toBe('p1');
  expect(arg.discountValueCents).toBeUndefined();
});

test('clears and hides the benefit picker when switching away from a free mechanic', () => {
  render(
    <OfferForm
      promotions={[]}
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'free_item' } });
  fireEvent.change(screen.getByLabelText('Benefit product'), { target: { value: 'p1' } });
  expect((screen.getByLabelText('Benefit product') as HTMLSelectElement).value).toBe('p1');

  // Switch to a non-free mechanic → picker hidden.
  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'percentage_discount' } });
  expect(screen.queryByLabelText('Benefit product')).toBeNull();

  // Switch back → the previous selection has been cleared.
  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'free_item' } });
  expect((screen.getByLabelText('Benefit product') as HTMLSelectElement).value).toBe('');
});

// F7c mutation-killer: parametrize the picker over BOTH benefit mechanics. A typo in
// needsBenefitProduct's SECOND comparison (free_upgrade) would let free_upgrade skip
// the picker entirely, so testing free_item alone cannot catch it.
for (const mechanic of ['free_item', 'free_upgrade'] as const) {
  test(`shows the benefit-product picker and emits benefitProductId for ${mechanic}`, () => {
    const onSubmit = vi.fn();
    render(
      <OfferForm
        promotions={[]}
        products={PRODUCTS}
        submitting={false}
        error={null}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Freebie' } });
    fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: mechanic } });
    expect(screen.getByLabelText('Benefit product')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Benefit product'), { target: { value: 'p2' } });
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-08-01T10:00' } });
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-08-31T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create offer' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0]![0];
    expect(arg.offerType).toBe(mechanic);
    expect(arg.benefitProductId).toBe('p2');
  });
}

// F5: only ACTIVE, non-deal products are valid benefits, so the picker must hide an
// inactive product and a deal product even when they are passed in the list.
test('excludes inactive and deal products from the benefit picker', () => {
  const products = [
    makeProduct('p1', 'Potato Fries'),
    makeProduct('p-inactive', 'Retired Item', { isActive: false }),
    makeProduct('p-deal', 'Combo Deal', { isDeal: true }),
  ];
  render(
    <OfferForm
      promotions={[]}
      products={products}
      submitting={false}
      error={null}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'free_item' } });
  const picker = screen.getByLabelText('Benefit product') as HTMLSelectElement;
  const optionValues = Array.from(picker.options).map((o) => o.value);
  expect(optionValues).toContain('p1');
  expect(optionValues).not.toContain('p-inactive');
  expect(optionValues).not.toContain('p-deal');
});

// F7d: edit-mode pre-population — an existing free_item offer shows its benefit
// pre-selected and carries it through on submit (no accidental clear).
test('pre-populates the benefit picker in edit mode and keeps the benefit on submit', () => {
  const onSubmit = vi.fn();
  render(
    <OfferForm
      initial={makeOffer({ offerType: 'free_item', benefitProductId: 'p1' })}
      promotions={[]}
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );

  expect((screen.getByLabelText('Benefit product') as HTMLSelectElement).value).toBe('p1');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit.mock.calls[0]![0].benefitProductId).toBe('p1');
});

// F2: switching an edited free offer to a discount mechanic sends benefitProductId
// EXPLICIT null so the server clears the column (merged-state stays valid).
test('sends benefitProductId: null when an edited free offer switches to a discount mechanic', () => {
  const onSubmit = vi.fn();
  render(
    <OfferForm
      initial={makeOffer({ offerType: 'free_item', benefitProductId: 'p1' })}
      promotions={[]}
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'percentage_discount' } });
  fireEvent.change(screen.getByLabelText('Discount percent (%)'), { target: { value: '15' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  const arg = onSubmit.mock.calls[0]![0];
  expect(arg.offerType).toBe('percentage_discount');
  expect(arg.benefitProductId).toBeNull();
});

// F2 create-mode counterpart: a brand-new discount offer omits benefitProductId
// entirely (no null — create never clears a column).
test('omits benefitProductId in create mode for a discount mechanic', () => {
  const onSubmit = vi.fn();
  render(
    <OfferForm
      promotions={[]}
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );

  // Visit a free mechanic then leave it — create mode must still omit, never null.
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Discount' } });
  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'free_item' } });
  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'fixed_discount' } });
  fireEvent.change(screen.getByLabelText('Discount amount (₱)'), { target: { value: '5' } });
  fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-08-01T10:00' } });
  fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-08-31T10:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create offer' }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect('benefitProductId' in onSubmit.mock.calls[0]![0]).toBe(false);
});
