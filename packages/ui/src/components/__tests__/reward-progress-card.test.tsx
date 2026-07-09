import { render } from '@testing-library/react-native';

import { RewardProgressCard } from '../reward-progress-card';
import { MOCK_REWARDS } from './mocks';

test('renders RewardProgressCard without throwing', () => {
  render(<RewardProgressCard rewards={MOCK_REWARDS} />);
});
