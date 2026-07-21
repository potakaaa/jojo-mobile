import { render } from '@testing-library/react-native';

import { PickupTimeBadge } from '../pickup-time-badge';
import { MOCK_PICKUP_TIME } from './mocks';

test('renders PickupTimeBadge without throwing', () => {
  render(<PickupTimeBadge mode="light" pickupTime={MOCK_PICKUP_TIME} />);
});
