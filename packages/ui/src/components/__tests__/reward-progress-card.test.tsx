import { render } from '@testing-library/react-native';

import { RewardProgressCard } from '../reward-progress-card';
import { MOCK_REWARDS } from './mocks';

test('renders RewardProgressCard without throwing', async () => {
  await render(<RewardProgressCard rewards={MOCK_REWARDS} />);
});

test('renders the star count in "N of M stars" form', async () => {
  const { getByText } = await render(
    <RewardProgressCard rewards={{ currentStars: 3, requiredStars: 5 }} />,
  );
  expect(getByText('3 of 5 stars')).toBeTruthy();
});
