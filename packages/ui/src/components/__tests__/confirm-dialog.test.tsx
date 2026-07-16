import { fireEvent, render } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { ConfirmDialog } from '../confirm-dialog';

async function setup(over: Partial<ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const utils = await render(
    <ConfirmDialog
      visible
      title="Clear your cart?"
      message="You'll lose the items you added."
      confirmLabel="Yes, clear it"
      cancelLabel="Keep my cart"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...over}
    />,
  );
  return { ...utils, onConfirm, onCancel };
}

test('renders the title and body copy', async () => {
  const { getByText } = await setup();
  expect(getByText('Clear your cart?')).toBeTruthy();
  expect(getByText("You'll lose the items you added.")).toBeTruthy();
});

test('confirm action calls onConfirm only (cancel never fires)', async () => {
  const { getByText, onConfirm, onCancel } = await setup();
  fireEvent.press(getByText('Yes, clear it'));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();
});

test('cancel action calls onCancel only, never confirm', async () => {
  const { getByText, onConfirm, onCancel } = await setup();
  fireEvent.press(getByText('Keep my cart'));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

test('renders nothing when not visible', async () => {
  const { queryByText } = await setup({ visible: false });
  expect(queryByText('Clear your cart?')).toBeNull();
});
