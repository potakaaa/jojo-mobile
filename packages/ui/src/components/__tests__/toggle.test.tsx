import { fireEvent, render } from '@testing-library/react-native';

import { Toggle } from '../toggle';

// Explicit 15s timeout: the default 5000ms is occasionally exceeded under CI's
// parallel jest run (constrained CPU across 22 suites); locally this takes ~90ms.
test('renders Toggle on and off without throwing', async () => {
  await render(<Toggle value onValueChange={() => {}} label="Marketing notifications" />);
  await render(<Toggle value={false} onValueChange={() => {}} label="Marketing notifications" />);
}, 15000);

test('fires onValueChange when the switch is toggled', async () => {
  const onValueChange = jest.fn();
  const { getByRole } = await render(<Toggle value={false} onValueChange={onValueChange} />);
  fireEvent(getByRole('switch'), 'valueChange', true);
  expect(onValueChange).toHaveBeenCalledWith(true);
});
