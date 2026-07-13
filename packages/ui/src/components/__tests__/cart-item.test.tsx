import { render } from '@testing-library/react-native';
import { formatPricePHP } from '@jojopotato/utils';

import { CartItem } from '../cart-item';
import { MOCK_CART_ITEM } from './mocks';

test('renders CartItem from a snapshot with selected options', async () => {
  const { getByText } = await render(
    <CartItem item={MOCK_CART_ITEM} onIncrement={() => {}} onDecrement={() => {}} />,
  );

  expect(getByText(MOCK_CART_ITEM.name)).toBeTruthy();
  expect(getByText('Large')).toBeTruthy();
  expect(
    getByText(formatPricePHP(MOCK_CART_ITEM.unitPrice * MOCK_CART_ITEM.quantity)),
  ).toBeTruthy();
});

test('renders CartItem with no selected options', async () => {
  const item = { ...MOCK_CART_ITEM, selectedOptions: [] };
  const { getByText, queryByText } = await render(<CartItem item={item} />);

  expect(getByText(item.name)).toBeTruthy();
  expect(getByText(formatPricePHP(item.unitPrice * item.quantity))).toBeTruthy();
  expect(queryByText('Large')).toBeNull();
});
