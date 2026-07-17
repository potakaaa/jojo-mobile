import { fireEvent, render } from '@testing-library/react-native';

import { ScreenHeader } from '../screen-header';

test('renders the title', async () => {
  const { getByText } = await render(<ScreenHeader title="Notifications" onBack={() => {}} />);
  expect(getByText('Notifications')).toBeTruthy();
});

test('calls onBack when the back control is pressed', async () => {
  const onBack = jest.fn();
  const { getByLabelText } = await render(<ScreenHeader title="Notifications" onBack={onBack} />);
  fireEvent.press(getByLabelText('Go back'));
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('exposes the back control as an accessible button labelled "Go back"', async () => {
  const { getByLabelText } = await render(<ScreenHeader title="Active Orders" onBack={() => {}} />);
  expect(getByLabelText('Go back').props.accessibilityRole).toBe('button');
});

test('renders no back control when onBack is omitted', async () => {
  const { queryByLabelText, getByText } = await render(<ScreenHeader title="Staff" />);
  expect(queryByLabelText('Go back')).toBeNull();
  expect(getByText('Staff')).toBeTruthy();
});

test('renders in dark mode without throwing', async () => {
  await render(<ScreenHeader title="Notifications" onBack={() => {}} mode="dark" />);
});
