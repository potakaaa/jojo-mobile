import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { AdminProduct } from '@/features/products/lib/admin-products-api';

import type { AdminOffer } from '../lib/admin-offers-api';

import { OfferForm } from './offer-form';

/**
 * The clock is pinned because `Starts`/`Ends` are now bounded by "now". Left on the real
 * clock these fixtures would pass or fail depending on the day of the month they ran —
 * day 1 is in the past for all but one day in thirty. The 10th is chosen so both fixture
 * days below sit comfortably in the future without any month navigation.
 */
const FIXED_NOW = new Date(2026, 7, 10, 9, 0);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function makeProduct(id: string, name: string, over: Partial<AdminProduct> = {}): AdminProduct {
  return {
    id,
    categoryId: 'c1',
    name,
    slug: id,
    description: null,
    imageUrl: null,
    basePriceCents: 1000,
    isActive: true,
    isRewardEligible: false,
    isDeal: false,
    ...over,
  };
}

const PRODUCTS = [makeProduct('p1', 'Potato Fries'), makeProduct('p2', 'Cheese Dip')];

/**
 * Drives a `DateTimeField` popover the way a user does: open it, click a day, set the
 * time, close it. Replaces the old `fireEvent.change(getByLabelText('Starts'), …)`
 * one-liner, which only worked because the field was a native `datetime-local` input.
 *
 * `data-day` is the cell's `toLocaleDateString()`. The day is taken from the month the
 * calendar already shows, so the helper never has to drive month navigation — these
 * tests only need *a valid window*; no assertion below reads the dates back.
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

  // Picking a day auto-advances the popover to the clock stage. Time is set through
  // the dial's numeric readout — the exact-entry path — rather than by aiming at the
  // face, so this helper stays about the form and not about dial geometry.
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

/** Fills a valid Starts-before-Ends offer window, both sides after the pinned now. */
function setOfferWindow() {
  pickDateTime('Starts', 15, '10:00');
  pickDateTime('Ends', 28, '10:00');
}

function makeOffer(over: Partial<AdminOffer> = {}): AdminOffer {
  return {
    id: 'o1',
    title: 'Free Fries',
    description: null,
    imageUrl: null,
    offerType: 'free_item',
    discountValueCents: null,
    minimumOrderAmountCents: 0,
    startAt: '2026-08-01T10:00:00.000Z',
    endAt: '2026-08-31T10:00:00.000Z',
    usageLimitPerUser: null,
    totalUsageLimit: null,
    isActive: true,
    promotionId: null,
    benefitProductId: 'p1',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...over,
  };
}

test('converts PHP inputs to cents and emits the offer payload', () => {
  const onSubmit = vi.fn();
  render(
    <OfferForm
      promotions={[]}
      products={[]}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: '10% Off' } });
  // Default mechanic is percentage_discount → value entered as a percent.
  fireEvent.change(screen.getByLabelText('Discount percent (%)'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Minimum order (₱)'), { target: { value: '50' } });
  setOfferWindow();
  fireEvent.click(screen.getByRole('button', { name: 'Create offer' }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  const arg = onSubmit.mock.calls[0]![0];
  expect(arg.title).toBe('10% Off');
  expect(arg.offerType).toBe('percentage_discount');
  expect(arg.discountValueCents).toBe(1000);
  expect(arg.minimumOrderAmountCents).toBe(5000);
  expect(arg.benefitProductId).toBeUndefined();
});

test('hides the scalar value field for a complex mechanic', () => {
  render(
    <OfferForm
      promotions={[]}
      products={[]}
      submitting={false}
      error={null}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'bundle' } });
  expect(screen.queryByLabelText('Discount amount (₱)')).toBeNull();
  expect(screen.queryByLabelText('Discount percent (%)')).toBeNull();
});

test('shows the benefit-product picker only for free mechanics', () => {
  render(
    <OfferForm
      promotions={[]}
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );

  // Default is percentage_discount — no benefit picker, but the scalar field shows.
  expect(screen.queryByLabelText('Benefit product')).toBeNull();
  expect(screen.getByLabelText('Discount percent (%)')).toBeDefined();

  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'free_item' } });
  expect(screen.getByLabelText('Benefit product')).toBeDefined();
  // The scalar value field is hidden for a benefit mechanic.
  expect(screen.queryByLabelText('Discount percent (%)')).toBeNull();
  expect(screen.queryByLabelText('Discount amount (₱)')).toBeNull();
});

test('blocks submit for a free-mechanic offer with no benefit product', () => {
  const onSubmit = vi.fn();
  render(
    <OfferForm
      promotions={[]}
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Free Fries' } });
  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'free_item' } });
  setOfferWindow();
  fireEvent.click(screen.getByRole('button', { name: 'Create offer' }));

  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText('Select a benefit product for this mechanic.')).toBeDefined();
});

test('emits benefitProductId (and no scalar value) for a valid free-mechanic offer', () => {
  const onSubmit = vi.fn();
  render(
    <OfferForm
      promotions={[]}
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Free Fries' } });
  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'free_item' } });
  fireEvent.change(screen.getByLabelText('Benefit product'), { target: { value: 'p1' } });
  setOfferWindow();
  fireEvent.click(screen.getByRole('button', { name: 'Create offer' }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  const arg = onSubmit.mock.calls[0]![0];
  expect(arg.offerType).toBe('free_item');
  expect(arg.benefitProductId).toBe('p1');
  expect(arg.discountValueCents).toBeUndefined();
});

test('clears and hides the benefit picker when switching away from a free mechanic', () => {
  render(
    <OfferForm
      promotions={[]}
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'free_item' } });
  fireEvent.change(screen.getByLabelText('Benefit product'), { target: { value: 'p1' } });
  expect((screen.getByLabelText('Benefit product') as HTMLSelectElement).value).toBe('p1');

  // Switch to a non-free mechanic → picker hidden.
  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'percentage_discount' } });
  expect(screen.queryByLabelText('Benefit product')).toBeNull();

  // Switch back → the previous selection has been cleared.
  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'free_item' } });
  expect((screen.getByLabelText('Benefit product') as HTMLSelectElement).value).toBe('');
});

// F7c mutation-killer: parametrize the picker over BOTH benefit mechanics. A typo in
// needsBenefitProduct's SECOND comparison (free_upgrade) would let free_upgrade skip
// the picker entirely, so testing free_item alone cannot catch it.
for (const mechanic of ['free_item', 'free_upgrade'] as const) {
  test(`shows the benefit-product picker and emits benefitProductId for ${mechanic}`, () => {
    const onSubmit = vi.fn();
    render(
      <OfferForm
        promotions={[]}
        products={PRODUCTS}
        submitting={false}
        error={null}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Freebie' } });
    fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: mechanic } });
    expect(screen.getByLabelText('Benefit product')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Benefit product'), { target: { value: 'p2' } });
    setOfferWindow();
    fireEvent.click(screen.getByRole('button', { name: 'Create offer' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0]![0];
    expect(arg.offerType).toBe(mechanic);
    expect(arg.benefitProductId).toBe('p2');
  });
}

// F5: only ACTIVE, non-deal products are valid benefits, so the picker must hide an
// inactive product and a deal product even when they are passed in the list.
test('excludes inactive and deal products from the benefit picker', () => {
  const products = [
    makeProduct('p1', 'Potato Fries'),
    makeProduct('p-inactive', 'Retired Item', { isActive: false }),
    makeProduct('p-deal', 'Combo Deal', { isDeal: true }),
  ];
  render(
    <OfferForm
      promotions={[]}
      products={products}
      submitting={false}
      error={null}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'free_item' } });
  const picker = screen.getByLabelText('Benefit product') as HTMLSelectElement;
  const optionValues = Array.from(picker.options).map((o) => o.value);
  expect(optionValues).toContain('p1');
  expect(optionValues).not.toContain('p-inactive');
  expect(optionValues).not.toContain('p-deal');
});

// F7d: edit-mode pre-population — an existing free_item offer shows its benefit
// pre-selected and carries it through on submit (no accidental clear).
test('pre-populates the benefit picker in edit mode and keeps the benefit on submit', () => {
  const onSubmit = vi.fn();
  render(
    <OfferForm
      initial={makeOffer({ offerType: 'free_item', benefitProductId: 'p1' })}
      promotions={[]}
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );

  expect((screen.getByLabelText('Benefit product') as HTMLSelectElement).value).toBe('p1');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit.mock.calls[0]![0].benefitProductId).toBe('p1');
});

// F2: switching an edited free offer to a discount mechanic sends benefitProductId
// EXPLICIT null so the server clears the column (merged-state stays valid).
test('sends benefitProductId: null when an edited free offer switches to a discount mechanic', () => {
  const onSubmit = vi.fn();
  render(
    <OfferForm
      initial={makeOffer({ offerType: 'free_item', benefitProductId: 'p1' })}
      promotions={[]}
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'percentage_discount' } });
  fireEvent.change(screen.getByLabelText('Discount percent (%)'), { target: { value: '15' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  const arg = onSubmit.mock.calls[0]![0];
  expect(arg.offerType).toBe('percentage_discount');
  expect(arg.benefitProductId).toBeNull();
});

// ── Date bounds ──────────────────────────────────────────────────────────────────

/**
 * Opens a field's calendar and returns the cell for a day in the pinned month. Any
 * currently-open popover is dismissed first — clicking a trigger that is already open
 * toggles it shut, which would leave the grid unmounted.
 */
function openDay(label: string, dayOfMonth: number): HTMLButtonElement {
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.click(screen.getByLabelText(label));
  const target = new Date(FIXED_NOW.getFullYear(), FIXED_NOW.getMonth(), dayOfMonth);
  const cell = document.querySelector<HTMLButtonElement>(
    `button[data-day="${target.toLocaleDateString()}"]`,
  );
  if (!cell) throw new Error(`No calendar cell for ${target.toLocaleDateString()}`);
  return cell;
}

function renderForm(over: Partial<React.ComponentProps<typeof OfferForm>> = {}) {
  return render(
    <OfferForm
      promotions={[]}
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={() => {}}
      onCancel={() => {}}
      {...over}
    />,
  );
}

test('Starts cannot be set before now', () => {
  renderForm();
  // The 5th is before the pinned now (the 10th).
  expect(openDay('Starts', 5).hasAttribute('disabled')).toBe(true);
  expect(openDay('Starts', 15).hasAttribute('disabled')).toBe(false);
});

test('the Ends bound tracks the chosen Starts', () => {
  renderForm();

  // Before a start exists, now is the floor: the 5th is out, the 12th is in.
  expect(openDay('Ends', 5).hasAttribute('disabled')).toBe(true);
  expect(openDay('Ends', 12).hasAttribute('disabled')).toBe(false);

  pickDateTime('Starts', 15, '10:00');

  // The bound has moved with it — the 12th is now before the start.
  expect(openDay('Ends', 12).hasAttribute('disabled')).toBe(true);
  expect(openDay('Ends', 16).hasAttribute('disabled')).toBe(false);

  // And it keeps tracking as the start moves again.
  pickDateTime('Starts', 20, '10:00');
  expect(openDay('Ends', 16).hasAttribute('disabled')).toBe(true);
  expect(openDay('Ends', 25).hasAttribute('disabled')).toBe(false);
});

test('flags an inverted window without discarding either value', () => {
  const onSubmit = vi.fn();
  renderForm({ onSubmit });

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Window' } });
  pickDateTime('Starts', 15, '10:00');
  pickDateTime('Ends', 16, '10:00');
  expect(screen.queryByText(/End must be after start/)).toBeNull();

  // Move the start past the end. The end is deliberately NOT cleared or clamped —
  // it is flagged, so whichever field is actually wrong is the one that gets fixed.
  pickDateTime('Starts', 25, '10:00');
  expect(screen.getByText(/End must be after start/)).toBeDefined();
  expect(screen.getByLabelText('Ends').textContent).toContain('16, 2026');

  fireEvent.click(screen.getByRole('button', { name: 'Create offer' }));
  expect(onSubmit).not.toHaveBeenCalled();
});

// Grandfathering, end to end: a live offer that started before now must survive an
// unrelated edit without forcing a re-pick of its start date.
test('an offer whose start is already past stays editable and submittable', () => {
  const onSubmit = vi.fn();
  renderForm({
    initial: makeOffer({
      offerType: 'percentage_discount',
      discountValueCents: 1000,
      benefitProductId: null,
      // Started a month before the pinned now, still running.
      startAt: new Date(2026, 6, 1, 10, 0).toISOString(),
      endAt: new Date(2026, 8, 30, 10, 0).toISOString(),
    }),
    onSubmit,
  });

  // The past start is shown as-is, not blanked or pushed forward to now.
  expect(screen.getByLabelText('Starts').textContent).toContain('Jul 1, 2026');

  // An unrelated edit submits without touching the dates at all.
  fireEvent.change(screen.getByLabelText('Discount percent (%)'), { target: { value: '25' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  const arg = onSubmit.mock.calls[0]![0];
  expect(arg.discountValueCents).toBe(2500);
  expect(arg.startAt).toBe(new Date(2026, 6, 1, 10, 0).toISOString());
});

test('the grandfathered start day is the only past day still pickable', () => {
  renderForm({
    initial: makeOffer({
      startAt: new Date(2026, 7, 3, 9, 0).toISOString(),
      endAt: new Date(2026, 8, 30, 10, 0).toISOString(),
    }),
  });

  expect(openDay('Starts', 3).hasAttribute('disabled')).toBe(false);
  expect(openDay('Starts', 4).hasAttribute('disabled')).toBe(true);
});

// F2 create-mode counterpart: a brand-new discount offer omits benefitProductId
// entirely (no null — create never clears a column).
test('omits benefitProductId in create mode for a discount mechanic', () => {
  const onSubmit = vi.fn();
  render(
    <OfferForm
      promotions={[]}
      products={PRODUCTS}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );

  // Visit a free mechanic then leave it — create mode must still omit, never null.
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Discount' } });
  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'free_item' } });
  fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'fixed_discount' } });
  fireEvent.change(screen.getByLabelText('Discount amount (₱)'), { target: { value: '5' } });
  setOfferWindow();
  fireEvent.click(screen.getByRole('button', { name: 'Create offer' }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect('benefitProductId' in onSubmit.mock.calls[0]![0]).toBe(false);
});
