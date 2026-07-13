import type { OrderStatus } from '@jojopotato/types';
import { render } from '@testing-library/react-native';

import { OrderStatusBadge } from '../order-status-badge';

test('renders OrderStatusBadge without throwing', () => {
  render(<OrderStatusBadge status="preparing" />);
});

test.each<OrderStatus>([
  'pending',
  'accepted',
  'preparing',
  'flavoring',
  'ready',
  'completed',
  'cancelled',
])('renders OrderStatusBadge for the %s status', (status) => {
  render(<OrderStatusBadge status={status} />);
});
