import { render } from '@testing-library/react-native';

import { SizeSelector } from '../size-selector';
import { MOCK_SIZE } from './mocks';

test('renders SizeSelector without throwing', () => {
  render(<SizeSelector sizes={[MOCK_SIZE]} selectedSizeId={MOCK_SIZE.id} />);
});
