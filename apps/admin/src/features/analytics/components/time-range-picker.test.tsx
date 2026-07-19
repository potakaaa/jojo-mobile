import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { computePresetRange, formatManilaDate, TimeRangePicker } from './time-range-picker';

afterEach(cleanup);

// A fixed instant: 2099-07-17T02:00:00Z = 2099-07-17 10:00 Manila.
const NOW = new Date('2099-07-17T02:00:00Z');

test('formatManilaDate returns the Manila calendar date', () => {
  // 2099-07-17T20:00Z = 2099-07-18 04:00 Manila (next day).
  expect(formatManilaDate(new Date('2099-07-17T20:00:00Z'))).toBe('2099-07-18');
  expect(formatManilaDate(NOW)).toBe('2099-07-17');
});

test('computePresetRange 7d is the inclusive last-7-day Manila window', () => {
  expect(computePresetRange('7d', NOW)).toEqual({ from: '2099-07-11', to: '2099-07-17' });
});

test('computePresetRange 30d is the inclusive last-30-day Manila window', () => {
  expect(computePresetRange('30d', NOW)).toEqual({ from: '2099-06-18', to: '2099-07-17' });
});

test('clicking a preset fires onChange with the computed range', () => {
  const onChange = vi.fn();
  render(<TimeRangePicker range={{ from: '2099-06-01', to: '2099-06-30' }} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
  expect(onChange).toHaveBeenCalledTimes(1);
  const arg = onChange.mock.calls[0]![0] as { from: string; to: string };
  expect(arg.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(arg.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('editing the from input fires onChange with the new value', () => {
  const onChange = vi.fn();
  render(<TimeRangePicker range={{ from: '2099-06-01', to: '2099-06-30' }} onChange={onChange} />);
  const fromInput = screen.getByDisplayValue('2099-06-01');
  fireEvent.change(fromInput, { target: { value: '2099-06-05' } });
  expect(onChange).toHaveBeenCalledWith({ from: '2099-06-05', to: '2099-06-30' });
});
