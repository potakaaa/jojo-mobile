import { render } from '@testing-library/react-native';

import { StarProgressBar } from '../star-progress-bar';
import { MOCK_PROGRESS } from './mocks';

test('renders StarProgressBar without throwing', () => {
  render(<StarProgressBar progress={MOCK_PROGRESS} />);
});
