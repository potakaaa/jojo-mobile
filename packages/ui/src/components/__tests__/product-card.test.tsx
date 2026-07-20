import { render } from '@testing-library/react-native';

import { ProductCard } from '../product-card';
import { MOCK_PRODUCT } from './mocks';

test('renders ProductCard without throwing', () => {
  render(<ProductCard mode="light" product={MOCK_PRODUCT} />);
});
