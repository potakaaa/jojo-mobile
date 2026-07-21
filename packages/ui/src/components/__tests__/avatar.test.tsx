import { render } from '@testing-library/react-native';

import { Avatar } from '../avatar';

test('renders two-letter initials from a full name', async () => {
  const { getByText } = await render(<Avatar mode="light" name="Jojo Potato" />);
  expect(getByText('JP')).toBeTruthy();
});

test('renders first two letters for a single-word name', async () => {
  const { getByText } = await render(<Avatar mode="dark" name="Jojo" />);
  expect(getByText('JO')).toBeTruthy();
});

test('renders without throwing when no name is provided', async () => {
  await render(<Avatar mode="light" />);
});
