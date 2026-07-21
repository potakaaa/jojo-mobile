import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { RewardList } from './reward-list';
import type { AdminReward } from '../lib/admin-rewards-api';

afterEach(cleanup);

function makeReward(over: Partial<AdminReward> = {}): AdminReward {
  return {
    id: 'r1',
    name: 'Free Fries',
    requiredStars: 5,
    rewardType: 'free_item',
    rewardValue: null,
    eligibleProductId: 'p1',
    isActive: true,
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
    ...over,
  };
}

test('renders reward rows with the mechanic label and status', () => {
  render(
    <RewardList
      rewards={[makeReward()]}
      isLoading={false}
      error={null}
      onEdit={() => {}}
      onToggleActive={() => {}}
    />,
  );
  expect(screen.getByText('Free Fries')).toBeDefined();
  expect(screen.getByText('Free item')).toBeDefined();
  expect(screen.getByText('Active')).toBeDefined();
});

test('renders the polymorphic value column for a percentage reward', () => {
  render(
    <RewardList
      rewards={[
        makeReward({
          rewardType: 'percentage_discount',
          rewardValue: 1500,
          eligibleProductId: null,
        }),
      ]}
      isLoading={false}
      error={null}
      onEdit={() => {}}
      onToggleActive={() => {}}
    />,
  );
  // rewardValue 1500 rendered as a percentage (÷100).
  expect(screen.getByText('15%')).toBeDefined();
});

test('shows Deactivate for an active reward and fires the callbacks', () => {
  const onEdit = vi.fn();
  const onToggleActive = vi.fn();
  const reward = makeReward();
  render(
    <RewardList
      rewards={[reward]}
      isLoading={false}
      error={null}
      onEdit={onEdit}
      onToggleActive={onToggleActive}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
  expect(onEdit).toHaveBeenCalledWith(reward);
  expect(onToggleActive).toHaveBeenCalledWith(reward);
});

test('shows Activate for an inactive reward', () => {
  render(
    <RewardList
      rewards={[makeReward({ isActive: false })]}
      isLoading={false}
      error={null}
      onEdit={() => {}}
      onToggleActive={() => {}}
    />,
  );
  expect(screen.getByText('Inactive')).toBeDefined();
  expect(screen.getByRole('button', { name: 'Activate' })).toBeDefined();
});

test('renders the empty state', () => {
  render(
    <RewardList
      rewards={[]}
      isLoading={false}
      error={null}
      onEdit={() => {}}
      onToggleActive={() => {}}
    />,
  );
  expect(screen.getByText('No rewards yet. Create the first one.')).toBeDefined();
});
