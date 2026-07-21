import { fireEvent, render } from '@testing-library/react-native';

import { PaymentMethodSelector } from '../payment-method-selector';

type RenderResult = Awaited<ReturnType<typeof render>>;

const LABELS = ['Pay at pickup', 'App wallet', 'GCash', 'Maya', 'Credit/debit card'];

// Rows render in this fixed OPTIONS order, so radio index maps to method.
const METHOD_ORDER = ['pay_at_branch', 'app_wallet', 'gcash', 'maya', 'card'] as const;

/** Map each method to its row's accessibilityState.disabled flag. */
function disabledByMethod(getAllByRole: RenderResult['getAllByRole']) {
  const radios = getAllByRole('radio');
  const map: Record<string, boolean> = {};
  METHOD_ORDER.forEach((method, i) => {
    map[method] = Boolean(radios[i]?.props.accessibilityState?.disabled);
  });
  return map;
}

test('renders all 5 rows with correct labels', async () => {
  const { getByText } = await render(
    <PaymentMethodSelector
      mode="light"
      value="pay_at_branch"
      onChange={() => {}}
      onlinePaymentEnabled={false}
    />,
  );
  for (const label of LABELS) {
    expect(getByText(label)).toBeTruthy();
  }
});

test('marks only pay_at_branch non-disabled when onlinePaymentEnabled=false', async () => {
  const { getAllByRole } = await render(
    <PaymentMethodSelector
      mode="light"
      value="pay_at_branch"
      onChange={() => {}}
      onlinePaymentEnabled={false}
    />,
  );
  const disabled = disabledByMethod(getAllByRole);
  expect(disabled.pay_at_branch).toBe(false);
  expect(disabled.app_wallet).toBe(true);
  expect(disabled.gcash).toBe(true);
  expect(disabled.maya).toBe(true);
  expect(disabled.card).toBe(true);
});

test('marks gcash/maya/card non-disabled and app_wallet still disabled when onlinePaymentEnabled=true', async () => {
  const { getAllByRole } = await render(
    <PaymentMethodSelector
      mode="light"
      value="pay_at_branch"
      onChange={() => {}}
      onlinePaymentEnabled={true}
    />,
  );
  const disabled = disabledByMethod(getAllByRole);
  expect(disabled.pay_at_branch).toBe(false);
  expect(disabled.gcash).toBe(false);
  expect(disabled.maya).toBe(false);
  expect(disabled.card).toBe(false);
  expect(disabled.app_wallet).toBe(true);
});

test('does not call onChange when a disabled row is tapped', async () => {
  const onChange = jest.fn();
  const { getByText } = await render(
    <PaymentMethodSelector
      mode="light"
      value="pay_at_branch"
      onChange={onChange}
      onlinePaymentEnabled={false}
    />,
  );
  // GCash is disabled when the flag is off; tapping it must be a no-op.
  fireEvent.press(getByText('GCash'));
  expect(onChange).not.toHaveBeenCalled();
});

test('calls onChange with the method when an enabled row is tapped', async () => {
  const onChange = jest.fn();
  const { getByText } = await render(
    <PaymentMethodSelector
      mode="light"
      value="pay_at_branch"
      onChange={onChange}
      onlinePaymentEnabled={true}
    />,
  );
  fireEvent.press(getByText('GCash'));
  expect(onChange).toHaveBeenCalledWith('gcash');
});

test("long 'Credit/debit card' label carries numberOfLines=2 so it wraps instead of overlapping the badge", async () => {
  // onlinePaymentEnabled=false → card is disabled → "Unavailable" badge is
  // rendered next to the longest real label. The label Text must wrap to a
  // second line (numberOfLines={2}) rather than overflow into the badge.
  const { getByText, getAllByText } = await render(
    <PaymentMethodSelector
      mode="light"
      value="pay_at_branch"
      onChange={() => {}}
      onlinePaymentEnabled={false}
    />,
  );
  // The card row is disabled here, so its "Unavailable" badge renders alongside
  // the (unique) longest label.
  expect(getAllByText('Unavailable').length).toBeGreaterThan(0);
  expect(getByText('Credit/debit card').props.numberOfLines).toBe(2);
});
