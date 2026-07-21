import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { PromotionForm } from './promotion-form';

afterEach(cleanup);

test('submits a valid promotion payload', () => {
  const onSubmit = vi.fn();
  render(<PromotionForm submitting={false} error={null} onSubmit={onSubmit} onCancel={() => {}} />);

  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Summer Sale' } });
  fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-08-01T10:00' } });
  fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-08-31T10:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create promotion' }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  const arg = onSubmit.mock.calls[0]![0];
  expect(arg.name).toBe('Summer Sale');
  expect(typeof arg.startAt).toBe('string');
  expect(typeof arg.endAt).toBe('string');
});

test('blocks submit and shows an error when the name is empty', () => {
  const onSubmit = vi.fn();
  const { container } = render(
    <PromotionForm submitting={false} error={null} onSubmit={onSubmit} onCancel={() => {}} />,
  );

  fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-08-01T10:00' } });
  fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-08-31T10:00' } });
  // Submit the form directly to bypass jsdom's native `required`-field gating and
  // exercise the component's own JS validation branch.
  fireEvent.submit(container.querySelector('form')!);

  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText('Name is required.')).toBeDefined();
});
