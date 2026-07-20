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

vi.mock('@/features/deals/hooks/use-admin-deals', () => ({
  useAdminDeal: () => ({ data: deal, isLoading: false, error: null }),
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
    input: { startsAt: null, endsAt: null },
  });
});
