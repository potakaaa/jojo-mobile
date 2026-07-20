import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';

/**
 * DEAL-005 AC8 (manage-page half) — the schedule editor on the deal detail screen.
 *
 * NOTE the leading `-` in this filename: any test file placed directly inside
 * `apps/admin/src/routes/` is otherwise swept into TanStack Start's route generator
 * and becomes a bogus route (default `routeFileIgnorePrefix` is `-`). Vitest still
 * discovers it via the `*.test.tsx` glob. Same rationale as `-route.test.tsx`.
 *
 * The component is pulled off `Route.options.component` and rendered directly with
 * the router hooks stubbed — no router harness needed, matching the precedent above.
 */

const mutate = vi.fn();

vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return {
    ...actual,
    useParams: () => ({ dealId: 'd1' }),
    useNavigate: () => vi.fn(),
  };
});

const deal = {
  id: 'd1',
  categoryId: 'c1',
  name: 'Fries Combo',
  slug: 'fries-combo',
  description: null,
  imageUrl: null,
  basePriceCents: 8000,
  isActive: true,
  isRewardEligible: false,
  isDeal: true,
  components: [],
  availableBranchCount: 1,
  activeBranchCount: 1,
  // Stored window — the fields must PRE-FILL from this (grandfathering).
  startsAt: new Date(2026, 7, 15, 10, 0).toISOString(),
  endsAt: new Date(2026, 7, 28, 18, 0).toISOString(),
};

/** Per-test overlay on `deal`, so a case can vary the stored row (e.g. DEAL-005
 *  Phase 2 recurrence) without a second mock module. Reset in `afterEach`. */
let dealOverrides: Record<string, unknown> = {};

vi.mock('@/features/deals/hooks/use-admin-deals', () => ({
  useAdminDeal: () => ({ data: { ...deal, ...dealOverrides }, isLoading: false, error: null }),
  useUpdateDeal: () => ({ mutate, isPending: false, error: null, reset: vi.fn() }),
}));

vi.mock('@/features/products/hooks/use-admin-products', () => ({
  useAdminProducts: () => ({ data: [], isLoading: false, error: null }),
}));

// The junction/availability editors own their own queries; stubbed so this test
// stays about the schedule section.
vi.mock('@/features/deals/components/deal-component-editor', () => ({
  DealComponentEditor: () => null,
}));
vi.mock('@/features/deals/components/deal-availability-editor', () => ({
  DealAvailabilityEditor: () => null,
}));

afterEach(() => {
  mutate.mockClear();
  dealOverrides = {};
  cleanup();
});

async function renderPage() {
  const { Route } = await import('./deals.$dealId');
  const Component = Route.options.component as ComponentType;
  render(<Component />);
}

test('pre-fills the schedule fields from the deal’s stored window', async () => {
  await renderPage();

  // The trigger renders the formatted window, proving the stored value round-tripped
  // through `isoToLocal` into the field rather than rendering the empty placeholder.
  expect(screen.getByLabelText('Starts').textContent).toMatch(/Aug 15, 2026/);
  expect(screen.getByLabelText('Ends').textContent).toMatch(/Aug 28, 2026/);
});

test('Save schedule is disabled until the window is actually edited', async () => {
  await renderPage();
  expect(screen.getByRole('button', { name: 'Save schedule' }).hasAttribute('disabled')).toBe(true);
});

test('AC8: clearing both bounds PATCHes nulls, returning the deal to always-live', async () => {
  await renderPage();

  // `Clear` inside each popover empties that bound.
  for (const label of ['Starts', 'Ends']) {
    fireEvent.click(screen.getByLabelText(label));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  }

  const save = screen.getByRole('button', { name: 'Save schedule' });
  expect(save.hasAttribute('disabled')).toBe(false);
  fireEvent.click(save);

  expect(mutate).toHaveBeenCalledTimes(1);
  expect(mutate.mock.calls[0]![0]).toEqual({
    id: 'd1',
    // DEAL-005 Phase 2 widened this payload: the save always sends the recurrence
    // triple too, as explicit nulls for a non-recurring deal. Clearing every field
    // is what deletes the row server-side and restores always-live.
    input: {
      startsAt: null,
      endsAt: null,
      recurDays: null,
      recurStartTime: null,
      recurEndTime: null,
    },
  });
});

// ─── DEAL-005 Phase 2 — recurrence editor + Recurring badge ──────────────────
//
// Covered here (rather than left to the unit tests) because two plan requirements
// land in this file and nowhere else: Execute-Agent Instruction E4 names this screen
// as one of only two `dealStatus()` consumers that must RENDER the new badge, and
// AC9 requires the manage page to edit AND clear recurrence. Proving those at the
// derivation level alone would leave both true on paper and false in the running
// admin — exactly the gap E4 exists to close.

const RECURRING = { recurDays: [1, 3], recurStartTime: '14:00', recurEndTime: '17:00' };

const toggle = () => screen.getByRole('checkbox', { name: /Repeats weekly/ }) as HTMLInputElement;
const saveBtn = () => screen.getByRole('button', { name: 'Save schedule' });
const dayBtn = (label: string) => screen.getByRole('button', { name: label });
const savedInput = () => mutate.mock.calls[0]![0].input;

test('AC10: renders the Recurring badge ALONGSIDE the status badge', async () => {
  dealOverrides = RECURRING;
  await renderPage();
  expect(screen.getByText('Recurring')).toBeDefined();
  // Additive, never a replacement — the window-phase badge must survive. The stored
  // window is entirely in the future, so the phase reads "Scheduled".
  expect(screen.getByText('Scheduled')).toBeDefined();
});

test('AC10: renders NO Recurring badge for a non-recurring deal', async () => {
  await renderPage();
  expect(screen.queryByText('Recurring')).toBeNull();
});

test('AC9: pre-fills the toggle, days and times from an existing recurring row', async () => {
  dealOverrides = { recurDays: [1, 3], recurStartTime: '09:30', recurEndTime: '11:45' };
  await renderPage();

  expect(toggle().checked).toBe(true);
  expect(dayBtn('Mon').getAttribute('aria-pressed')).toBe('true');
  expect(dayBtn('Wed').getAttribute('aria-pressed')).toBe('true');
  expect(dayBtn('Tue').getAttribute('aria-pressed')).toBe('false');
  expect(screen.getByText('Starts at 09:30')).toBeDefined();
  expect(screen.getByText('Ends at 11:45')).toBeDefined();
});

test('AC9: hides the recurrence controls until the toggle is on', async () => {
  await renderPage();
  expect(toggle().checked).toBe(false);
  expect(screen.queryByRole('group', { name: 'Repeat on days' })).toBeNull();

  fireEvent.click(toggle());
  expect(screen.getByRole('group', { name: 'Repeat on days' })).toBeDefined();
});

test('AC9: Save stays disabled until the recurrence actually changes', async () => {
  dealOverrides = RECURRING;
  await renderPage();
  expect(saveBtn().hasAttribute('disabled')).toBe(true);

  fireEvent.click(dayBtn('Fri'));
  expect(saveBtn().hasAttribute('disabled')).toBe(false);
});

test('AC9: editing the days PATCHes the complete triple', async () => {
  dealOverrides = RECURRING;
  await renderPage();
  fireEvent.click(dayBtn('Fri'));
  fireEvent.click(saveBtn());

  expect(mutate).toHaveBeenCalledTimes(1);
  expect(savedInput().recurDays).toEqual([1, 3, 5]);
  expect(savedInput().recurStartTime).toBe('14:00');
  expect(savedInput().recurEndTime).toBe('17:00');
});

test('AC9: turning the toggle OFF clears all three fields together', async () => {
  // The three columns move as a unit — a partial clear is a 400 server-side.
  dealOverrides = RECURRING;
  await renderPage();
  fireEvent.click(toggle());
  fireEvent.click(saveBtn());

  expect(savedInput().recurDays).toBeNull();
  expect(savedInput().recurStartTime).toBeNull();
  expect(savedInput().recurEndTime).toBeNull();
});

test('AC9: adding recurrence to a non-recurring deal sends a full triple', async () => {
  await renderPage();
  fireEvent.click(toggle());
  fireEvent.click(dayBtn('Sun'));
  fireEvent.click(saveBtn());

  // Sunday is day 0 — must not be dropped as falsy anywhere in the chain.
  expect(savedInput().recurDays).toEqual([0]);
  expect(savedInput().recurStartTime).toBe('14:00');
  expect(savedInput().recurEndTime).toBe('17:00');
});

test('AC9: blocks Save while recurrence is enabled with no day picked', async () => {
  await renderPage();
  fireEvent.click(toggle());
  expect(saveBtn().hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('Pick at least one day');
});

test('AC9: editing recurrence leaves the stored absolute bounds intact', async () => {
  dealOverrides = RECURRING;
  await renderPage();
  fireEvent.click(dayBtn('Fri'));
  fireEvent.click(saveBtn());

  // Round-tripped from the stored window, not silently dropped to null.
  expect(savedInput().startsAt).toBe(deal.startsAt);
  expect(savedInput().endsAt).toBe(deal.endsAt);
});
