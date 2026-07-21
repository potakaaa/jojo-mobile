import { useState } from 'react';
import { afterEach, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { DayOfWeekPicker } from './day-of-week-picker';

afterEach(cleanup);

/** A controlled host, so "no internal state" is proven rather than assumed. */
function Host({ initial = [] as number[] }) {
  const [value, setValue] = useState<number[]>(initial);
  return (
    <>
      <DayOfWeekPicker value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

const day = (label: string) => screen.getByRole('button', { name: label });
const pressed = (label: string) => day(label).getAttribute('aria-pressed');
const currentValue = () => screen.getByTestId('value').textContent;

test('renders all seven days, none selected by default', () => {
  render(<Host />);
  for (const label of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
    expect(pressed(label)).toBe('false');
  }
});

test('clicking a day adds it to the value', () => {
  render(<Host />);
  fireEvent.click(day('Wed'));
  expect(currentValue()).toBe('[3]');
  expect(pressed('Wed')).toBe('true');
});

test('clicking a selected day removes it', () => {
  render(<Host initial={[3]} />);
  fireEvent.click(day('Wed'));
  expect(currentValue()).toBe('[]');
  expect(pressed('Wed')).toBe('false');
});

test('emits ascending order regardless of click sequence', () => {
  // A stable payload matters: the value is compared against the stored row on PATCH,
  // so click order must not produce a spuriously different array.
  render(<Host />);
  fireEvent.click(day('Fri'));
  fireEvent.click(day('Mon'));
  fireEvent.click(day('Wed'));
  expect(currentValue()).toBe('[1,3,5]');
});

test('uses the JS getDay() convention — Sunday is 0, Saturday is 6', () => {
  // Load-bearing: the server indexes `recur_days` with the same convention, so an
  // off-by-one here would silently shift every deal by a day.
  render(<Host />);
  fireEvent.click(day('Sun'));
  expect(currentValue()).toBe('[0]');
  cleanup();

  render(<Host />);
  fireEvent.click(day('Sat'));
  expect(currentValue()).toBe('[6]');
});

test('reflects the controlled value — it holds no internal selection state', () => {
  const { rerender } = render(<DayOfWeekPicker value={[1]} onChange={() => {}} />);
  expect(pressed('Mon')).toBe('true');

  // A click whose onChange is ignored must NOT visually select the day.
  fireEvent.click(day('Tue'));
  expect(pressed('Tue')).toBe('false');

  rerender(<DayOfWeekPicker value={[2]} onChange={() => {}} />);
  expect(pressed('Mon')).toBe('false');
  expect(pressed('Tue')).toBe('true');
});

test('disabled blocks selection', () => {
  render(<DayOfWeekPicker value={[]} onChange={() => {}} disabled />);
  expect((day('Mon') as HTMLButtonElement).disabled).toBe(true);
});
