import { render } from '@testing-library/react-native';

import { DealCard } from '../deal-card';
import { MOCK_DEAL } from './mocks';

test('renders DealCard without throwing', async () => {
  await render(<DealCard mode="light" deal={MOCK_DEAL} />);
});

test('renders the available (default) state without the unavailable badge', async () => {
  const { queryByText } = await render(<DealCard mode="light" deal={MOCK_DEAL} available={true} />);
  expect(queryByText('Unavailable at this branch')).toBeNull();
});

test('renders the "Unavailable at this branch" badge when available is false', async () => {
  const { getByText } = await render(<DealCard mode="light" deal={MOCK_DEAL} available={false} />);
  expect(getByText('Unavailable at this branch')).toBeTruthy();
});
