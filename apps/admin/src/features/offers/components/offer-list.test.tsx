import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { OfferList } from './offer-list';
import type { AdminOffer } from '../lib/admin-offers-api';

afterEach(cleanup);

const offer: AdminOffer = {
  id: 'o1',
  title: '10% Off',
  description: null,
  imageUrl: null,
  offerType: 'percentage_discount',
  discountValueCents: 1000,
  minimumOrderAmountCents: 5000,
  startAt: '2026-08-01T00:00:00.000Z',
  endAt: '2026-08-31T00:00:00.000Z',
  usageLimitPerUser: null,
  totalUsageLimit: null,
  isActive: true,
  promotionId: null,
  benefitProductId: null,
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
};

test('renders offer rows with the polymorphic value column', () => {
  render(
    <OfferList
      offers={[offer]}
      isLoading={false}
      error={null}
      onManage={() => {}}
      onEdit={() => {}}
    />,
  );
  expect(screen.getByText('10% Off')).toBeDefined();
  expect(screen.getByText('Percentage discount')).toBeDefined();
  // discountValueCents 1000 rendered as a percentage (÷100).
  expect(screen.getByText('10%')).toBeDefined();
});

test('fires Manage and Edit callbacks', () => {
  const onManage = vi.fn();
  const onEdit = vi.fn();
  render(
    <OfferList
      offers={[offer]}
      isLoading={false}
      error={null}
      onManage={onManage}
      onEdit={onEdit}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Manage' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(onManage).toHaveBeenCalledWith(offer);
  expect(onEdit).toHaveBeenCalledWith(offer);
});

test('renders the empty state', () => {
  render(
    <OfferList offers={[]} isLoading={false} error={null} onManage={() => {}} onEdit={() => {}} />,
  );
  expect(screen.getByText('No offers yet. Create the first one.')).toBeDefined();
});
