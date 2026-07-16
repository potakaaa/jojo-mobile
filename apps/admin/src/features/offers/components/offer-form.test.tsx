import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { OfferForm } from './offer-form';

afterEach(cleanup);

test('converts PHP inputs to cents and emits the offer payload', () => {
  const onSubmit = vi.fn();
  render(
    <OfferForm
      promotions={[]}
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
});

test('hides the scalar value field for a complex mechanic', () => {
  render(
    <OfferForm
      promotions={[]}
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
