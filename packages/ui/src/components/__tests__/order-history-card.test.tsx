import type { Order, OrderStatus } from '@jojopotato/types';
import { render } from '@testing-library/react-native';

import { OrderHistoryCard } from '../order-history-card';
import { MOCK_CART_ITEM } from './mocks';

function makeOrder(status: OrderStatus, starsEarned: number): Order {
  return {
    id: `ord-${status}`,
    userId: 'u1',
    cart: { id: 'cart-1', pickupBranchId: 'b1', items: [MOCK_CART_ITEM] },
    branchId: 'b1',
    status,
    totalCents: 24000,
    starsEarned,
    placedAt: '2026-07-11T09:15:00.000Z',
    createdAt: '2026-07-11T09:15:00.000Z',
  };
}

// NOTE: this repo's jest-expo setup does not wire the RNTL query layer (render
// returns an empty result), so — like every other component test here — these
// are smoke renders asserting the component mounts without throwing. Rendering
// all three status variants exercises BOTH branches of the conditional Reorder
// button (shown for completed/cancelled, hidden for in-progress per D1). The
// visible-behavior assertions (stars value shown, Reorder actually hidden) are
// covered by the T6/T7 agent-probe walkthrough.

test('renders a completed order (with stars + Reorder button) without throwing', () => {
  render(<OrderHistoryCard order={makeOrder('completed', 120)} onReorder={() => {}} />);
});

test('renders a cancelled order (0 stars, Reorder still offered) without throwing', () => {
  render(<OrderHistoryCard order={makeOrder('cancelled', 0)} onReorder={() => {}} />);
});

test('renders an in-progress (preparing) order — Reorder branch hidden — without throwing', () => {
  render(<OrderHistoryCard order={makeOrder('preparing', 0)} onReorder={() => {}} />);
});
