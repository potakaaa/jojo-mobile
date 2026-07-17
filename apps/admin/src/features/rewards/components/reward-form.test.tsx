import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { AdminProduct } from '@/features/products/lib/admin-products-api';

import { RewardForm } from './reward-form';

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

test('free_item (default) shows the product picker, hides the value field, and emits the product', () => {
  const onSubmit = vi.fn();
  render(
    <RewardForm
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );

  // Default mechanic is free_item → product picker shown, value field hidden.
  expect(screen.getByLabelText('Eligible product')).toBeDefined();
  expect(screen.queryByLabelText('Discount amount (₱)')).toBeNull();

  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Free Fries' } });
  fireEvent.change(screen.getByLabelText('Required stars'), { target: { value: '5' } });
  fireEvent.change(screen.getByLabelText('Eligible product'), { target: { value: 'p1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create reward' }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  const arg = onSubmit.mock.calls[0]![0];
  expect(arg.name).toBe('Free Fries');
  expect(arg.requiredStars).toBe(5);
  expect(arg.rewardType).toBe('free_item');
  expect(arg.eligibleProductId).toBe('p1');
  expect(arg.rewardValueCents).toBeUndefined();
});

test('switching to a discount mechanic shows the value field and hides the product picker', () => {
  const onSubmit = vi.fn();
  render(
    <RewardForm
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'fixed_discount' } });
  // D4 conditional toggle: value field appears, product picker disappears.
  expect(screen.getByLabelText('Discount amount (₱)')).toBeDefined();
  expect(screen.queryByLabelText('Eligible product')).toBeNull();

  fireEvent.change(screen.getByLabelText('Name'), { target: { value: '₱50 Off' } });
  fireEvent.change(screen.getByLabelText('Required stars'), { target: { value: '8' } });
  fireEvent.change(screen.getByLabelText('Discount amount (₱)'), { target: { value: '50' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create reward' }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  const arg = onSubmit.mock.calls[0]![0];
  expect(arg.rewardType).toBe('fixed_discount');
  expect(arg.rewardValueCents).toBe(5000); // ₱50 → cents
  expect(arg.eligibleProductId).toBeUndefined();
});

test('percentage mechanic labels the value field as a percent', () => {
  render(
    <RewardForm
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'percentage_discount' } });
  expect(screen.getByLabelText('Discount percent (%)')).toBeDefined();
});

test('blocks submit of a free mechanic with no product selected', () => {
  const onSubmit = vi.fn();
  render(
    <RewardForm
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Free Fries' } });
  fireEvent.change(screen.getByLabelText('Required stars'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create reward' }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('Select an eligible product');
});
