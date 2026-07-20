import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DateTimeField } from './date-time-field';

afterEach(cleanup);

/** `data-day` is `toLocaleDateString()` — the same call the calendar cell makes. */
function dayCell(target: Date): HTMLButtonElement {
  const selector = `button[data-day="${target.toLocaleDateString()}"]`;
  const el = document.querySelector<HTMLButtonElement>(selector);
  if (!el) throw new Error(`No calendar cell rendered for ${target.toLocaleDateString()}`);
  return el;
}

function labelled(name: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[aria-label="${name}"]`);
  if (!el) throw new Error(`No element rendered with aria-label "${name}"`);
  return el;
}

/** A number on the clock face — the mouse path, keyed by its literal face value. */
function dialNumber(value: number): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>(`[data-dial-value="${value}"]`);
  if (!el) throw new Error(`No dial number rendered for ${value}`);
  return el;
}

/** Types a 24-hour `HH:mm` through the dial's numeric readout + AM/PM toggle. */
function typeTime(time: string) {
  const [rawHours, rawMinutes] = time.split(':');
  const hours24 = Number(rawHours);
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  fireEvent.click(screen.getByRole('button', { name: hours24 < 12 ? 'AM' : 'PM' }));
  fireEvent.change(labelled('Hour'), { target: { value: String(hours12) } });
  fireEvent.change(labelled('Minute'), { target: { value: rawMinutes } });
}

/** Opens the popover and switches to the clock stage. */
function openTimeView(label: string) {
  fireEvent.click(screen.getByLabelText(label));
  fireEvent.click(screen.getByRole('button', { name: 'time' }));
}

/** Controlled harness — mirrors how the real forms hold the value in state. */
function Harness({
  initial = '',
  defaultTime,
  min,
  max,
}: {
  initial?: string;
  defaultTime?: string;
  min?: string;
  max?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateTimeField
        label="Starts"
        value={value}
        onChange={setValue}
        defaultTime={defaultTime}
        min={min}
        max={max}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

function currentValue(): string {
  return screen.getByTestId('value').textContent ?? '';
}

test('shows a placeholder when empty and the formatted value when set', () => {
  const { rerender } = render(<DateTimeField label="Starts" value="" onChange={() => {}} />);
  expect(screen.getByLabelText('Starts').textContent).toContain('Select date and time');

  rerender(<DateTimeField label="Starts" value="2026-08-15T14:30" onChange={() => {}} />);
  expect(screen.getByLabelText('Starts').textContent).toContain('Aug 15, 2026, 2:30 PM');
});

test('emits the naive-local YYYY-MM-DDTHH:mm contract string', () => {
  const onChange = vi.fn();
  render(<DateTimeField label="Starts" value="2026-08-15T10:00" onChange={onChange} />);

  fireEvent.click(screen.getByLabelText('Starts'));
  fireEvent.click(dayCell(new Date(2026, 7, 3)));

  // Exactly the shape `type="datetime-local"` produced — no ISO suffix, no Z, no
  // timezone shift (Aug 3 stays Aug 3 regardless of the machine's offset).
  expect(onChange).toHaveBeenCalledWith('2026-08-03T10:00');
});

test('keeps the chosen time when the date changes', () => {
  render(<Harness initial="2026-08-15T10:00" />);

  openTimeView('Starts');
  typeTime('18:45');
  expect(currentValue()).toBe('2026-08-15T18:45');

  // Changing the day must not reset the time back to the default.
  fireEvent.click(screen.getByRole('button', { name: 'date' }));
  fireEvent.click(dayCell(new Date(2026, 7, 20)));
  expect(currentValue()).toBe('2026-08-20T18:45');
});

test('applies defaultTime when a date is picked before any time is set', () => {
  render(<Harness defaultTime="23:59" />);

  fireEvent.click(screen.getByLabelText('Starts'));
  const today = new Date();
  fireEvent.click(dayCell(new Date(today.getFullYear(), today.getMonth(), 1)));

  const expectedMonth = String(today.getMonth() + 1).padStart(2, '0');
  expect(currentValue()).toBe(`${today.getFullYear()}-${expectedMonth}-01T23:59`);
});

test('a time preset sets the time without needing the date first', () => {
  render(<Harness />);

  openTimeView('Starts');
  fireEvent.click(screen.getByRole('button', { name: 'End of day' }));

  // Defaults the day to today rather than leaving a half-set dead end.
  const today = new Date();
  const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}T23:59`;
  expect(currentValue()).toBe(expected);
});

test('Clear empties the value and closes the popover', () => {
  render(<Harness initial="2026-08-15T10:00" />);

  fireEvent.click(screen.getByLabelText('Starts'));
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

  expect(currentValue()).toBe('');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByLabelText('Starts').textContent).toContain('Select date and time');
});

test('opens on trigger click, closes on Escape, and returns focus to the trigger', async () => {
  render(<DateTimeField label="Starts" value="2026-08-15T10:00" onChange={() => {}} />);
  const trigger = screen.getByLabelText('Starts');

  fireEvent.click(trigger);
  expect(screen.getByRole('dialog')).toBeDefined();

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  // Radix restores focus asynchronously after the layer unmounts.
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

test('picking a day advances to the clock stage', () => {
  render(<Harness />);

  fireEvent.click(screen.getByLabelText('Starts'));
  expect(screen.getByRole('button', { name: 'date' }).getAttribute('aria-pressed')).toBe('true');

  const today = new Date();
  fireEvent.click(dayCell(new Date(today.getFullYear(), today.getMonth(), 1)));

  // The calendar is unmounted, not merely scrolled past — this is the whole reason
  // the popover stays a sensible height.
  expect(screen.getByRole('button', { name: 'time' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('slider')).toBeDefined();
});

test('clicking an hour sets it and advances the dial to minutes', () => {
  render(<Harness initial="2026-08-15T10:00" />);
  openTimeView('Starts');

  expect(screen.getByRole('slider').getAttribute('aria-label')).toBe('Hour dial');
  fireEvent.click(dialNumber(3));

  expect(currentValue()).toBe('2026-08-15T03:00');
  // Stage advance is what makes the two-stage flow work without a "next" button.
  expect(screen.getByRole('slider').getAttribute('aria-label')).toBe('Minute dial');

  fireEvent.click(dialNumber(35));
  expect(currentValue()).toBe('2026-08-15T03:35');
});

test('the AM/PM toggle moves the hour across the 24-hour half', () => {
  render(<Harness initial="2026-08-15T10:30" />);
  openTimeView('Starts');

  fireEvent.click(screen.getByRole('button', { name: 'PM' }));
  expect(currentValue()).toBe('2026-08-15T22:30');

  fireEvent.click(screen.getByRole('button', { name: 'AM' }));
  expect(currentValue()).toBe('2026-08-15T10:30');
});

test('23:59 is reachable by typing, by keyboard, and by drag', () => {
  // The Ends default and the most common promo boundary. A 5-minute-labelled dial
  // cannot click it, so all three non-click paths are asserted rather than assumed.
  render(<Harness initial="2026-08-15T10:00" />);
  openTimeView('Starts');

  // 1. Numeric readout.
  typeTime('23:59');
  expect(currentValue()).toBe('2026-08-15T23:59');

  // 2. Keyboard: End on the minute stage jumps to :59.
  typeTime('23:00');
  fireEvent.focus(labelled('Minute'));
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });
  expect(currentValue()).toBe('2026-08-15T23:59');

  // 3. Drag: 1-minute granularity, so the angle for :59 resolves exactly.
  typeTime('23:00');
  const dial = screen.getByRole('slider');
  dial.getBoundingClientRect = () => ({ left: 0, top: 0, width: 240, height: 240 }) as DOMRect;

  // 354° from 12 o'clock === minute 59.
  const radians = ((354 - 90) * Math.PI) / 180;
  fireEvent.pointerDown(dial, {
    clientX: 120 + 92 * Math.cos(radians),
    clientY: 120 + 92 * Math.sin(radians),
  });
  expect(currentValue()).toBe('2026-08-15T23:59');
});

test('arrow keys step the active dial stage', () => {
  render(<Harness initial="2026-08-15T10:00" />);
  openTimeView('Starts');
  const dial = screen.getByRole('slider');

  // Hour stage: steps across all 24 hours, so it can cross noon unaided.
  fireEvent.keyDown(dial, { key: 'ArrowUp' });
  expect(currentValue()).toBe('2026-08-15T11:00');

  fireEvent.focus(labelled('Minute'));
  fireEvent.keyDown(dial, { key: 'ArrowDown' });
  expect(currentValue()).toBe('2026-08-15T11:59');

  fireEvent.keyDown(dial, { key: 'PageUp' });
  expect(currentValue()).toBe('2026-08-15T11:04');
});

test('the dial exposes its value to assistive tech', () => {
  render(<Harness initial="2026-08-15T13:07" />);
  openTimeView('Starts');
  const dial = screen.getByRole('slider');

  expect(dial.getAttribute('aria-valuenow')).toBe('13');
  expect(dial.getAttribute('aria-valuetext')).toBe('1:07 PM');

  fireEvent.focus(labelled('Minute'));
  expect(dial.getAttribute('aria-valuenow')).toBe('7');
  expect(dial.getAttribute('aria-valuemax')).toBe('59');
});

// ── Bounds ───────────────────────────────────────────────────────────────────────
// `min`/`max` are props, never read from the clock inside the component, so none of
// these tests need to freeze time — which is precisely the point of that split.

const MIN = '2026-08-15T11:00';

test('disables days before min and leaves later days selectable', () => {
  render(<Harness min={MIN} />);
  fireEvent.click(screen.getByLabelText('Starts'));

  const past = dayCell(new Date(2026, 7, 14));
  expect(past.hasAttribute('disabled')).toBe(true);
  // The state has to be programmatically readable, not just visually greyed.
  expect(past.getAttribute('aria-disabled')).toBe('true');

  const future = dayCell(new Date(2026, 7, 16));
  expect(future.hasAttribute('disabled')).toBe(false);
  expect(future.getAttribute('aria-disabled')).toBeNull();

  // The boundary day itself is inclusive.
  expect(dayCell(new Date(2026, 7, 15)).hasAttribute('disabled')).toBe(false);
});

test('a disabled past day cannot be picked', () => {
  render(<Harness min={MIN} />);
  fireEvent.click(screen.getByLabelText('Starts'));

  fireEvent.click(dayCell(new Date(2026, 7, 10)));
  expect(currentValue()).toBe('');
});

// The whole reason this feature needs care: an offer that started last week is edited
// with min = now, so its OWN value is out of bounds. Blocking it would force an
// unrelated re-pick on every edit of a live record.
test('grandfathers an already-saved past value: its day stays selectable', () => {
  render(<Harness initial="2026-08-03T09:00" min={MIN} />);
  fireEvent.click(screen.getByLabelText('Starts'));

  const incumbent = dayCell(new Date(2026, 7, 3));
  expect(incumbent.hasAttribute('disabled')).toBe(false);
  expect(incumbent.getAttribute('aria-disabled')).toBeNull();

  // Only the incumbent is exempt — its neighbours are still out of bounds.
  expect(dayCell(new Date(2026, 7, 2)).hasAttribute('disabled')).toBe(true);
  expect(dayCell(new Date(2026, 7, 4)).hasAttribute('disabled')).toBe(true);
});

test('re-picking the grandfathered day keeps the value intact', () => {
  render(<Harness initial="2026-08-03T09:00" min={MIN} />);
  fireEvent.click(screen.getByLabelText('Starts'));

  // Re-selecting the incumbent day must not be silently pulled forward to the bound.
  fireEvent.click(dayCell(new Date(2026, 7, 3)));
  expect(currentValue()).toBe('2026-08-03T09:00');
});

test('a grandfathered past day has no time restriction', () => {
  // On a day that is already wholly in the past, every time is equally past — clamping
  // hours there would be noise, so the dial stays fully open.
  render(<Harness initial="2026-08-03T09:00" min={MIN} />);
  openTimeView('Starts');

  expect(dialNumber(1).hasAttribute('disabled')).toBe(false);
  fireEvent.click(dialNumber(1));
  expect(currentValue()).toBe('2026-08-03T01:00');
});

test('blocks times before min on the boundary day only', () => {
  render(<Harness initial="2026-08-15T11:45" min="2026-08-15T11:30" />);
  openTimeView('Starts');

  // Hour stage: 9 AM is wholly before the bound; 11 AM still contains :30–:59.
  expect(dialNumber(9).hasAttribute('disabled')).toBe(true);
  expect(dialNumber(9).getAttribute('aria-disabled')).toBe('true');
  expect(dialNumber(11).hasAttribute('disabled')).toBe(false);

  fireEvent.click(dialNumber(9));
  expect(currentValue()).toBe('2026-08-15T11:45');

  // Minute stage: within the boundary hour, the minutes below the bound are out.
  fireEvent.focus(labelled('Minute'));
  expect(dialNumber(0).hasAttribute('disabled')).toBe(true);
  expect(dialNumber(30).hasAttribute('disabled')).toBe(false);

  fireEvent.click(dialNumber(0));
  expect(currentValue()).toBe('2026-08-15T11:45');

  fireEvent.click(dialNumber(30));
  expect(currentValue()).toBe('2026-08-15T11:30');
});

test('keyboard and drag stop at the bound instead of crossing it', () => {
  render(<Harness initial="2026-08-15T11:30" min="2026-08-15T11:30" />);
  openTimeView('Starts');
  const dial = screen.getByRole('slider');

  // Minute stage: stepping below :30 in the boundary hour is a no-op, not a wrap.
  fireEvent.focus(labelled('Minute'));
  fireEvent.keyDown(dial, { key: 'ArrowDown' });
  expect(currentValue()).toBe('2026-08-15T11:30');

  fireEvent.keyDown(dial, { key: 'ArrowUp' });
  expect(currentValue()).toBe('2026-08-15T11:31');

  // Home lands on the bound rather than on :00, which is unreachable here.
  fireEvent.keyDown(dial, { key: 'Home' });
  expect(currentValue()).toBe('2026-08-15T11:30');

  // Drag toward :05 (30° from 12 o'clock) is rejected — the geometry resolves, the
  // commit does not. Same 240×240 stub as the drag test above; jsdom reports zeros.
  dial.getBoundingClientRect = () => ({ left: 0, top: 0, width: 240, height: 240 }) as DOMRect;
  const radians = ((30 - 90) * Math.PI) / 180;
  fireEvent.pointerDown(dial, {
    clientX: 120 + 92 * Math.cos(radians),
    clientY: 120 + 92 * Math.sin(radians),
  });
  expect(currentValue()).toBe('2026-08-15T11:30');
});

test('a preset chip whose time is out of bounds is blocked and explains why', () => {
  render(<Harness initial="2026-08-15T14:00" min={MIN} />);
  openTimeView('Starts');

  const startOfDay = screen.getByRole('button', { name: 'Start of day' });
  // 00:00 on the min day would emit a past value, so the chip is blocked rather than
  // left to produce one.
  expect(startOfDay.getAttribute('aria-disabled')).toBe('true');

  fireEvent.click(startOfDay);
  expect(currentValue()).toBe('2026-08-15T14:00');
  expect(screen.getByText(/outside the allowed range/)).toBeDefined();

  // The other boundary chip is unaffected.
  const endOfDay = screen.getByRole('button', { name: 'End of day' });
  expect(endOfDay.getAttribute('aria-disabled')).toBeNull();
  fireEvent.click(endOfDay);
  expect(currentValue()).toBe('2026-08-15T23:59');
});

test('carrying a time onto the boundary day pulls it up to the bound', () => {
  // The value holds 00:00 from an earlier pick; moving onto the min day must not emit
  // 00:00 on that day.
  render(<Harness initial="2026-08-20T00:00" min={MIN} />);
  fireEvent.click(screen.getByLabelText('Starts'));

  fireEvent.click(dayCell(new Date(2026, 7, 15)));
  expect(currentValue()).toBe('2026-08-15T11:00');
});

test('a time-first pick lands on the earliest allowed day, not today', () => {
  render(<Harness min="2099-08-15T11:00" defaultTime="23:59" />);
  openTimeView('Starts');
  fireEvent.click(screen.getByRole('button', { name: 'End of day' }));

  expect(currentValue()).toBe('2099-08-15T23:59');
});

test('max disables later days symmetrically', () => {
  // A value anchors the calendar's month; with only a `max` there is nothing to open on
  // but the real current month, which would make this assertion clock-dependent.
  render(<Harness initial="2026-08-10T09:00" max="2026-08-15T11:00" />);
  fireEvent.click(screen.getByLabelText('Starts'));

  expect(dayCell(new Date(2026, 7, 16)).hasAttribute('disabled')).toBe(true);
  expect(dayCell(new Date(2026, 7, 14)).hasAttribute('disabled')).toBe(false);
});

test('surfaces the active bound before it is hit', () => {
  render(<Harness min={MIN} />);
  fireEvent.click(screen.getByLabelText('Starts'));

  expect(screen.getByText(/Earliest Aug 15, 2026, 11:00 AM/)).toBeDefined();
});

test('marks the trigger aria-required only when required', () => {
  const { rerender } = render(
    <DateTimeField label="Starts" value="" onChange={() => {}} required />,
  );
  expect(screen.getByLabelText('Starts').getAttribute('aria-required')).toBe('true');

  rerender(<DateTimeField label="Starts" value="" onChange={() => {}} />);
  expect(screen.getByLabelText('Starts').getAttribute('aria-required')).toBeNull();
});
