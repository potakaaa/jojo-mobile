import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { GenerateCouponsPanel } from './generate-coupons-panel';

afterEach(cleanup);

function renderPanel(onGenerate = vi.fn()) {
  const utils = render(
    <GenerateCouponsPanel
      offerId="o1"
      submitting={false}
      error={null}
      lastIssuedCount={null}
      onGenerate={onGenerate}
    />,
  );
  return { onGenerate, ...utils };
}

test('bulk-generates N coupons', () => {
  const { onGenerate } = renderPanel();
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
  expect(onGenerate).toHaveBeenCalledWith({ offerId: 'o1', quantity: 5 });
});

test('targeted mode pins quantity to 1 and reveals the customer field', () => {
  const { onGenerate } = renderPanel();
  fireEvent.click(screen.getByLabelText('Issue to a specific customer (targeted)'));

  const quantity = screen.getByLabelText('Quantity') as HTMLInputElement;
  expect(quantity.value).toBe('1');
  expect(quantity.disabled).toBe(true);

  fireEvent.change(screen.getByLabelText('Customer ID'), {
    target: { value: '11111111-1111-1111-1111-111111111111' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

  expect(onGenerate).toHaveBeenCalledWith({
    offerId: 'o1',
    quantity: 1,
    userId: '11111111-1111-1111-1111-111111111111',
  });
});

test('targeted issue without a customer id is blocked', () => {
  const { onGenerate, container } = renderPanel();
  fireEvent.click(screen.getByLabelText('Issue to a specific customer (targeted)'));
  // Submit the form directly to bypass jsdom's native `required`-field gating and
  // exercise the component's own JS validation branch.
  fireEvent.submit(container.querySelector('form')!);

  expect(onGenerate).not.toHaveBeenCalled();
  expect(screen.getByText('A targeted issue needs a customer ID.')).toBeDefined();
});
