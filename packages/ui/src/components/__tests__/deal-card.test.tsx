import { render } from '@testing-library/react-native';

import { DealCard } from '../deal-card';
import { MOCK_DEAL } from './mocks';

test('renders DealCard without throwing', () => {
  render(<DealCard mode="light" deal={MOCK_DEAL} />);
});
