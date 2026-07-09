import { render } from '@testing-library/react-native';

import { OrderStatusBadge } from '../order-status-badge';

test('renders OrderStatusBadge without throwing', () => {
  render(<OrderStatusBadge status="preparing" />);
});
