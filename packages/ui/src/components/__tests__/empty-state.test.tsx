import { render } from '@testing-library/react-native';

import { EmptyState } from '../empty-state';

test('renders EmptyState without a CTA without throwing', () => {
  render(<EmptyState mode="light" iconName="cart-outline" title="Your cart is empty" />);
});

test('renders EmptyState with a CTA button without throwing', () => {
  render(
    <EmptyState
      mode="light"
      iconName="cart-outline"
      title="Your cart is empty"
      description="Add some fries to get started."
      actionLabel="Browse menu"
      onAction={() => {}}
    />,
  );
});
