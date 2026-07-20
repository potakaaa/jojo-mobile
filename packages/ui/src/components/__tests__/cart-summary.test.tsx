import { render } from '@testing-library/react-native';

import { CartSummary } from '../cart-summary';

test('renders CartSummary without a discount without throwing', () => {
  render(<CartSummary mode="light" subtotalCents={24000} totalCents={24000} />);
});

test('renders CartSummary with a discount row without throwing', () => {
  render(
    <CartSummary
      mode="light"
      subtotalCents={24000}
      discountCents={2400}
      discountLabel="WELCOME10"
      totalCents={21600}
    />,
  );
});
