import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { DealList } from './deal-list';
import type { AdminDealProduct } from '../lib/admin-deals-api';

afterEach(cleanup);

/**
 * DEAL-005 Phase 2 (AC10, UI half) — the `recurring` flag must actually RENDER.
 *
 * `dealStatus()` computing `recurring: true` correctly is proven in
 * `lib/entity-status.test.ts`, but a passing derivation test with no badge on screen
 * would leave AC10 true at the unit level and false in the running admin. This file
 * is the other half (Execute-Agent Instruction E4); `deals.$dealId.tsx` renders the
 * same badge from the same flag.
 */

function makeDeal(over: Partial<AdminDealProduct> = {}): AdminDealProduct {
  return {
    id: 'deal-1',
    categoryId: 'cat-1',
    name: 'Happy Hour Combo',
    slug: 'happy-hour-combo',
    description: null,
    imageUrl: null,
    basePriceCents: 19900,
    isActive: true,
    isRewardEligible: false,
    isDeal: true,
    components: [],
    availableBranchCount: 2,
    activeBranchCount: 3,
    startsAt: null,
    endsAt: null,
    recurDays: null,
    recurStartTime: null,
    recurEndTime: null,
    ...over,
  } as AdminDealProduct;
}

function renderList(deal: AdminDealProduct) {
  return render(
    <DealList
      deals={[deal]}
      isLoading={false}
      error={null}
      onManage={() => {}}
      onEdit={() => {}}
      onDeactivate={() => {}}
      onReactivate={() => {}}
    />,
  );
}

test('renders a Recurring badge for a deal with recurrence days', () => {
  renderList(
    makeDeal({ recurDays: [1, 2, 3, 4, 5], recurStartTime: '14:00', recurEndTime: '17:00' }),
  );
  expect(screen.getByText('Recurring')).toBeDefined();
});

test('renders NO Recurring badge for a non-recurring deal', () => {
  renderList(makeDeal());
  expect(screen.queryByText('Recurring')).toBeNull();
});

test('renders the Recurring badge ALONGSIDE the status badge, not instead of it', () => {
  // The whole point of the additive design: a recurring deal still reports its
  // absolute-window phase. Losing the status badge here would be a silent regression.
  renderList(makeDeal({ recurDays: [6] }));
  expect(screen.getByText('Active · 2/3 branches')).toBeDefined();
  expect(screen.getByText('Recurring')).toBeDefined();
});

test('an empty recurDays array does not render the badge', () => {
  renderList(makeDeal({ recurDays: [] }));
  expect(screen.queryByText('Recurring')).toBeNull();
});
