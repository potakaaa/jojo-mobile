import { render } from '@testing-library/react-native';

import { CartItem } from '../cart-item';
import { MOCK_CART_ITEM, MOCK_FLAVOR, MOCK_PRODUCT, MOCK_SIZE } from './mocks';

test('renders CartItem with typed Flavor/Size objects without throwing', () => {
  render(
    <CartItem
      item={MOCK_CART_ITEM}
      product={MOCK_PRODUCT}
      flavor={MOCK_FLAVOR}
      size={MOCK_SIZE}
    />,
  );
});

test('renders CartItem with plain-string flavor/size without throwing', () => {
  render(<CartItem item={MOCK_CART_ITEM} product={MOCK_PRODUCT} flavor="Cheese" size="Large" />);
});
