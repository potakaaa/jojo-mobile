import { render } from '@testing-library/react-native';
import { formatCurrency } from '@jojopotato/utils';

import { CartItem } from '../cart-item';
import { MOCK_CART_ITEM, MOCK_FLAVOR, MOCK_MENU_ITEM, MOCK_SIZE } from './mocks';

test('renders CartItem with flavor and size variant', async () => {
  const { getByText } = await render(
    <CartItem
      mode="light"
      item={MOCK_CART_ITEM}
      product={MOCK_MENU_ITEM}
      flavor={MOCK_FLAVOR}
      size={MOCK_SIZE}
      onIncrement={() => {}}
      onDecrement={() => {}}
    />,
  );

  const lineTotalCents =
    (MOCK_MENU_ITEM.priceCents + MOCK_SIZE.priceModifierCents!) * MOCK_CART_ITEM.quantity;

  expect(getByText(MOCK_MENU_ITEM.name)).toBeTruthy();
  expect(getByText(`${MOCK_FLAVOR.name} • ${MOCK_SIZE.label}`)).toBeTruthy();
  expect(getByText(formatCurrency(lineTotalCents))).toBeTruthy();
});

test('renders CartItem with no flavor/size variant', async () => {
  const { getByText, queryByText } = await render(
    <CartItem mode="light" item={MOCK_CART_ITEM} product={MOCK_MENU_ITEM} />,
  );

  const lineTotalCents = MOCK_MENU_ITEM.priceCents * MOCK_CART_ITEM.quantity;

  expect(getByText(MOCK_MENU_ITEM.name)).toBeTruthy();
  expect(getByText(formatCurrency(lineTotalCents))).toBeTruthy();
  expect(queryByText(MOCK_SIZE.label)).toBeNull();
});

test('renders CartItem with onRemove trash affordance without throwing', async () => {
  await render(
    <CartItem mode="light" item={MOCK_CART_ITEM} product={MOCK_MENU_ITEM} onRemove={() => {}} />,
  );
});
