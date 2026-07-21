import { fireEvent, render } from '@testing-library/react-native';

import { NotificationRow } from '../notification-row';

test('renders an unread NotificationRow', async () => {
  const { getByText } = await render(
    <NotificationRow
      mode="light"
      title="Order ready for pickup"
      body="Your order is ready."
      timeLabel="2 min ago"
      unread
      iconName="receipt-outline"
      onPress={() => {}}
    />,
  );
  expect(getByText('Order ready for pickup')).toBeTruthy();
  expect(getByText('2 min ago')).toBeTruthy();
});

test('renders a read NotificationRow without throwing', async () => {
  await render(
    <NotificationRow
      mode="light"
      title="New deal"
      body="20% off"
      timeLabel="1 h ago"
      unread={false}
      iconName="pricetag-outline"
      onPress={() => {}}
    />,
  );
});

test('fires onPress when the row is tapped', async () => {
  const onPress = jest.fn();
  const { getByRole } = await render(
    <NotificationRow
      mode="light"
      title="Reward unlocked"
      body="Enjoy!"
      timeLabel="Just now"
      unread
      iconName="star-outline"
      onPress={onPress}
    />,
  );
  fireEvent.press(getByRole('button'));
  expect(onPress).toHaveBeenCalledTimes(1);
});
