import { fireEvent, render } from '@testing-library/react-native';

import { QuantityStepper } from '../quantity-stepper';

test('renders QuantityStepper without throwing', async () => {
  await render(<QuantityStepper mode="light" value={1} onChange={() => {}} />);
});

test('increment calls onChange with value + 1', async () => {
  const onChange = jest.fn();
  const { getByLabelText } = await render(
    <QuantityStepper mode="light" value={2} onChange={onChange} />,
  );
  fireEvent.press(getByLabelText('Increase quantity'));
  expect(onChange).toHaveBeenCalledWith(3);
});

test('decrement calls onChange with value − 1', async () => {
  const onChange = jest.fn();
  const { getByLabelText } = await render(
    <QuantityStepper mode="light" value={2} onChange={onChange} />,
  );
  fireEvent.press(getByLabelText('Decrease quantity'));
  expect(onChange).toHaveBeenCalledWith(1);
});

test('does not decrement below min (disabled at the floor)', async () => {
  const onChange = jest.fn();
  const { getByLabelText } = await render(
    <QuantityStepper mode="light" value={1} min={1} onChange={onChange} />,
  );
  const decrement = getByLabelText('Decrease quantity');
  expect(decrement.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(decrement);
  expect(onChange).not.toHaveBeenCalled();
});

test('does not increment above max (disabled at the ceiling)', async () => {
  const onChange = jest.fn();
  const { getByLabelText } = await render(
    <QuantityStepper mode="light" value={5} max={5} onChange={onChange} />,
  );
  const increment = getByLabelText('Increase quantity');
  expect(increment.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(increment);
  expect(onChange).not.toHaveBeenCalled();
});
