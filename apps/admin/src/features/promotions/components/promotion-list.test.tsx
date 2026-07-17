import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { PromotionList } from './promotion-list';
import type { AdminPromotion } from '../lib/admin-promotions-api';

afterEach(cleanup);

const promotion: AdminPromotion = {
  id: 'p1',
  name: 'Summer Sale',
  description: 'Hot deals',
  startAt: '2026-08-01T00:00:00.000Z',
  endAt: '2026-08-31T00:00:00.000Z',
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
};

test('renders promotion rows', () => {
  render(<PromotionList promotions={[promotion]} isLoading={false} error={null} />);
  expect(screen.getByText('Summer Sale')).toBeDefined();
  expect(screen.getByText('Hot deals')).toBeDefined();
});

test('renders the empty state when there are no promotions', () => {
  render(<PromotionList promotions={[]} isLoading={false} error={null} />);
  expect(screen.getByText('No promotions yet. Create the first one.')).toBeDefined();
});

test('renders the loading state', () => {
  render(<PromotionList promotions={undefined} isLoading error={null} />);
  expect(screen.getByText('Loading promotions…')).toBeDefined();
});
