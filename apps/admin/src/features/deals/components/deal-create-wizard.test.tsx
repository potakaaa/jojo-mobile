import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { DealCreateWizard } from './deal-create-wizard';

/**
 * DEAL-005 AC8 — the create wizard's Step 1 schedule fields. Both bounds are
 * OPTIONAL here (unlike offers, which require them), because "always live" is a
 * first-class state expressed by sending no window at all.
 *
 * The clock is pinned for the same reason `offer-form.test.tsx` pins it: `Starts`
 * is bounded by "now", so fixture days chosen relative to a real clock would pass
 * or fail depending on the day of the month the suite ran.
 */
const FIXED_NOW = new Date(2026, 7, 10, 9, 0);

vi.mock('@/features/products/hooks/use-admin-products', () => ({
  useAdminProducts: () => ({
    data: [
      {
        id: 'p1',
        categoryId: 'c1',
        name: 'Potato Fries',
        slug: 'potato-fries',
        description: null,
        imageUrl: null,
        basePriceCents: 5000,
        isActive: true,
        isRewardEligible: false,
        isDeal: false,
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/features/branches/hooks/use-admin-branches', () => ({
  useAdminBranches: () => ({ data: [], isLoading: false, error: null }),
}));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

/**
 * Drives a `DateTimeField` popover the way a user does — open, pick a day, set the
 * time, close. Mirrors `offer-form.test.tsx`'s helper; the field is a popover, not a
 * native `datetime-local` input, so it cannot be driven by a single `fireEvent.change`.
 */
function pickDateTime(label: string, dayOfMonth: number, time: string) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);

  fireEvent.click(screen.getByLabelText(label));

  const cell = document.querySelector<HTMLButtonElement>(
    `button[data-day="${target.toLocaleDateString()}"]`,
  );
  if (!cell) throw new Error(`No calendar cell for ${target.toLocaleDateString()}`);
  fireEvent.click(cell);

  const [rawHours, rawMinutes] = time.split(':');
  const hours24 = Number(rawHours);
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  fireEvent.click(screen.getByRole('button', { name: hours24 < 12 ? 'AM' : 'PM' }));
  for (const [field, next] of [
    ['Hour', String(hours12)],
    ['Minute', rawMinutes],
  ] as const) {
    const input = document.querySelector<HTMLInputElement>(`[aria-label="${field}"]`);
    if (!input) throw new Error(`No ${field} input in the open popover`);
    fireEvent.change(input, { target: { value: next } });
  }

  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
}

/** Fills Step 1's required fields, advances to Step 2, adds an item and a price. */
function completeThroughStep2() {
  fireEvent.click(screen.getByRole('button', { name: 'Next: items →' }));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  fireEvent.change(screen.getByLabelText('Deal price (₱)'), { target: { value: '80' } });
}

function renderWizard(onSubmit = vi.fn()) {
  render(
    <DealCreateWizard submitting={false} error={null} onSubmit={onSubmit} onCancel={() => {}} />,
  );
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fries Combo' } });
  return onSubmit;
}

test('renders both optional schedule fields on Step 1', () => {
  renderWizard();
  expect(screen.getByLabelText('Starts')).toBeTruthy();
  expect(screen.getByLabelText('Ends')).toBeTruthy();
});

test('omits startsAt/endsAt entirely when the schedule is left blank (always live)', () => {
  const onSubmit = renderWizard();
  completeThroughStep2();
  fireEvent.click(screen.getByRole('button', { name: 'Create deal' }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  const arg = onSubmit.mock.calls[0]![0];
  expect(arg.name).toBe('Fries Combo');
  // Absent, not null — the server writes no `deal_schedules` row at all.
  expect(arg).not.toHaveProperty('startsAt');
  expect(arg).not.toHaveProperty('endsAt');
});

test('AC8: submits both dates as ISO instants when the schedule is filled', () => {
  const onSubmit = renderWizard();
  pickDateTime('Starts', 15, '10:00');
  pickDateTime('Ends', 28, '18:00');
  completeThroughStep2();
  fireEvent.click(screen.getByRole('button', { name: 'Create deal' }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  const arg = onSubmit.mock.calls[0]![0];
  expect(arg.startsAt).toBe(new Date(2026, 7, 15, 10, 0).toISOString());
  expect(arg.endsAt).toBe(new Date(2026, 7, 28, 18, 0).toISOString());
});

test('submits an open-ended window when only Starts is filled', () => {
  const onSubmit = renderWizard();
  pickDateTime('Starts', 15, '10:00');
  completeThroughStep2();
  fireEvent.click(screen.getByRole('button', { name: 'Create deal' }));

  const arg = onSubmit.mock.calls[0]![0];
  expect(arg.startsAt).toBe(new Date(2026, 7, 15, 10, 0).toISOString());
  expect(arg).not.toHaveProperty('endsAt');
});

test('blocks advancing past Step 1 while End is not after Start', () => {
  renderWizard();
  pickDateTime('Starts', 28, '10:00');
  pickDateTime('Ends', 28, '10:00'); // identical instant — not after

  expect(screen.getByRole('alert').textContent).toMatch(/End must be after start/);
  expect(screen.getByRole('button', { name: 'Next: items →' }).hasAttribute('disabled')).toBe(true);
});
