import type { AdminAnalytics } from '@jojopotato/types';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AnalyticsDashboard } from './analytics-dashboard';

afterEach(cleanup);

function mockPayload(): AdminAnalytics {
  return {
    range: { from: '2099-06-10', to: '2099-06-20', timezone: 'Asia/Manila' },
    ordersPerBranch: [
      { branchId: 'a', branchName: 'Branch A', orderCount: 7 },
      { branchId: 'b', branchName: 'Branch B', orderCount: 2 },
    ],
    averageOrderValueCents: 983,
    orderCount: 9,
    dealsSplit: {
      withDeals: { count: 4, sumTotalCents: 5250 },
      withoutDeals: { count: 5, sumTotalCents: 3600 },
    },
    repeatPurchaseRate: { numerator: 1, denominator: 6, rate: 1 / 6 },
    starsEarned: 30,
    rewardsUnlocked: 1,
    rewardsRedeemed: 1,
    topSellingProducts: [
      { productId: 'p1', productName: 'Fries', quantitySold: 6, revenueCents: 3200 },
      { productId: 'p2', productName: 'Soda', quantitySold: 2, revenueCents: 2000 },
    ],
    newVsReturning: { newCount: 5, returningCount: 1 },
    branchScoped: false,
  };
}

const noop = () => {};
const range = { from: '2099-06-10', to: '2099-06-20' };

test('renders all eight metrics and both tables from a mocked payload', () => {
  render(
    <AnalyticsDashboard
      data={mockPayload()}
      isLoading={false}
      error={null}
      range={range}
      onRangeChange={noop}
      onBack={noop}
    />,
  );

  // 8 metric labels.
  expect(screen.getByText('Total orders')).toBeDefined();
  expect(screen.getByText('Average order value')).toBeDefined();
  expect(screen.getByText('Orders with deals')).toBeDefined();
  expect(screen.getByText('Repeat purchase rate')).toBeDefined();
  expect(screen.getByText('Stars earned')).toBeDefined();
  expect(screen.getByText('Rewards unlocked')).toBeDefined();
  expect(screen.getByText('Rewards redeemed')).toBeDefined();
  expect(screen.getByText('New vs returning customers')).toBeDefined();

  // Two tables (via their section headings).
  expect(screen.getByText('Orders per branch')).toBeDefined();
  expect(screen.getByText('Top-selling products')).toBeDefined();

  // Representative values render (money formatted, AOV = ₱9.83, rate = 16.7%).
  expect(screen.getByText('9')).toBeDefined();
  expect(screen.getByText('₱9.83')).toBeDefined();
  expect(screen.getByText('16.7%')).toBeDefined();
  expect(screen.getByText('Fries')).toBeDefined();
  expect(screen.getByText('Branch A')).toBeDefined();
});

test('shows the loading state', () => {
  render(
    <AnalyticsDashboard
      data={undefined}
      isLoading={true}
      error={null}
      range={range}
      onRangeChange={noop}
      onBack={noop}
    />,
  );
  expect(screen.getByText('Loading analytics…')).toBeDefined();
});

test('changing the range fires onRangeChange (wiring half of AC9)', () => {
  const onRangeChange = vi.fn();
  render(
    <AnalyticsDashboard
      data={mockPayload()}
      isLoading={false}
      error={null}
      range={range}
      onRangeChange={onRangeChange}
      onBack={noop}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));
  expect(onRangeChange).toHaveBeenCalledTimes(1);
  const arg = onRangeChange.mock.calls[0]![0] as { from: string; to: string };
  expect(arg.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(arg.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('AOV renders as an em dash when null', () => {
  const data = mockPayload();
  data.averageOrderValueCents = null;
  data.orderCount = 0;
  data.repeatPurchaseRate = { numerator: 0, denominator: 0, rate: null };
  render(
    <AnalyticsDashboard
      data={data}
      isLoading={false}
      error={null}
      range={range}
      onRangeChange={noop}
      onBack={noop}
    />,
  );
  // Both AOV and repeat-rate render '—' — assert at least one is present.
  expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
});
