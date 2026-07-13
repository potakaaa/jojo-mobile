import type { OrderStatus } from '@jojopotato/types';
import { render } from '@testing-library/react-native';

import { OrderStatusTimeline } from '../order-status-timeline';

test('renders OrderStatusTimeline without throwing', () => {
  render(<OrderStatusTimeline currentStatus="preparing" />);
});

test('renders OrderStatusTimeline cancelled state without throwing', () => {
  render(<OrderStatusTimeline currentStatus="cancelled" />);
});

test.each<OrderStatus>([
  'pending',
  'accepted',
  'preparing',
  'flavoring',
  'ready',
  'completed',
])('renders OrderStatusTimeline at the %s step', (status) => {
  render(<OrderStatusTimeline currentStatus={status} />);
});
