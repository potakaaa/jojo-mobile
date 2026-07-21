import { fireEvent, render } from '@testing-library/react-native';

import { SettingsRow } from '../settings-row';

test('renders label and value', async () => {
  const { getByText } = await render(
    <SettingsRow mode="light" icon="calendar-outline" label="Birthday" value="07/21/1998" />,
  );
  expect(getByText('Birthday')).toBeTruthy();
  expect(getByText('07/21/1998')).toBeTruthy();
});

test('fires onPress when the row is actionable', async () => {
  const onPress = jest.fn();
  const { getByText } = await render(
    <SettingsRow
      mode="dark"
      icon="notifications-outline"
      label="Notifications"
      onPress={onPress}
    />,
  );
  fireEvent.press(getByText('Notifications'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('renders a divider without throwing', async () => {
  await render(<SettingsRow.Divider mode="light" />);
});
