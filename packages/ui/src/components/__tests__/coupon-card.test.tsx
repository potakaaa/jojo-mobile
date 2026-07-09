import { render } from '@testing-library/react-native';

import { CouponCard } from '../coupon-card';
import { MOCK_COUPON } from './mocks';

test('renders CouponCard without throwing', () => {
  render(<CouponCard coupon={MOCK_COUPON} />);
});
