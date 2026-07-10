import { render } from '@testing-library/react-native';

import { CartItem } from '../cart-item';
import { MOCK_CART_ITEM } from './mocks';

test('renders CartItem from a snapshot with selected options without throwing', () => {
  render(<CartItem item={MOCK_CART_ITEM} onIncrement={() => {}} onDecrement={() => {}} />);
});

test('renders CartItem with no selected options without throwing', () => {
  render(<CartItem item={{ ...MOCK_CART_ITEM, selectedOptions: [] }} />);
});
