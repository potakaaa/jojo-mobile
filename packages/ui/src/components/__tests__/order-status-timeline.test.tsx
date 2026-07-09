import { render } from '@testing-library/react-native';

import { OrderStatusTimeline } from '../order-status-timeline';

test('renders OrderStatusTimeline without throwing', () => {
  render(<OrderStatusTimeline currentStatus="preparing" />);
});

test('renders OrderStatusTimeline cancelled state without throwing', () => {
  render(<OrderStatusTimeline currentStatus="cancelled" />);
});
