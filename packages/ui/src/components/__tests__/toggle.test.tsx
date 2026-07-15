import { fireEvent, render } from '@testing-library/react-native';

import { Toggle } from '../toggle';

test('renders Toggle on and off without throwing', async () => {
  await render(<Toggle value onValueChange={() => {}} label="Marketing notifications" />);
  await render(<Toggle value={false} onValueChange={() => {}} label="Marketing notifications" />);
});

test('fires onValueChange when the switch is toggled', async () => {
  const onValueChange = jest.fn();
  const { getByRole } = await render(<Toggle value={false} onValueChange={onValueChange} />);
  fireEvent(getByRole('switch'), 'valueChange', true);
  expect(onValueChange).toHaveBeenCalledWith(true);
});
