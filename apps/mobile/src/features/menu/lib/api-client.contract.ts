/**
 * Compile-time regression guard for the menu API contract.
 *
 * WHY THIS FILE EXISTS: EVL cycle 1 found that the mobile menu client types had
 * drifted from the server's real response shape
 * (`packages/api/src/routes/lib/serializers.ts`). `apiRequest<T>` casts the
 * response with a bare `as T`, so `tsc` could not see the mismatch — products
 * were read as `priceCents` (server sends `basePriceCents`) and options as `id`
 * (server sends `optionId`). Every size/flavor `optionId` resolved to
 * `undefined`, collapsing selection state and 400-ing `POST /orders`.
 *
 * `apps/mobile` has no unit-test runner (documented project-wide known-gap:
 * `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`),
 * so this guard runs under the existing `tsc --noEmit` (`pnpm --filter
 * @jojopotato/mobile typecheck`) gate instead. The `WIRE_*` fixtures below are
 * shaped EXACTLY as the server serializers emit. If the client `MenuProduct` /
 * `MenuProductOption` types ever drift from the wire field names again, the
 * `satisfies` assertions here fail to compile and typecheck goes red — the exact
 * signal that was missing in EVL cycle 1.
 *
 * This module is intentionally type-only (no runtime exports, never imported by
 * app code). It exists solely to be typechecked.
 */
import type { SelectedOption } from '@jojopotato/types';

import type { CreateOrderInput } from '@/features/orders/lib/api-client';

import { toSelectedOption, type MenuProduct, type MenuProductOption } from './api-client';

/**
 * A realistic single menu option exactly as `serializeMenuOption` emits it:
 * identity is `optionId` (not `id`), carries `optionType`, `name`,
 * `priceDeltaCents`. Fails to compile if `MenuProductOption` renames `optionId`.
 */
const WIRE_SIZE_SMALL = {
  optionId: 'opt-size-small',
  optionType: 'size',
  name: 'Small',
  priceDeltaCents: 0,
} satisfies MenuProductOption;

const WIRE_SIZE_LARGE = {
  optionId: 'opt-size-large',
  optionType: 'size',
  name: 'Large',
  priceDeltaCents: 3000,
} satisfies MenuProductOption;

/**
 * A realistic product WITH size options exactly as `serializeMenuProduct`
 * emits it: base price is `basePriceCents`, options grouped size/flavor/add_on.
 * Fails to compile if `MenuProduct` renames `basePriceCents` or reintroduces a
 * server-absent field (e.g. `isRewardEligible`) as required.
 */
const WIRE_PRODUCT = {
  id: 'prod-loaded-fries',
  name: 'Loaded Fries',
  basePriceCents: 12000,
  options: {
    size: [WIRE_SIZE_SMALL, WIRE_SIZE_LARGE],
    flavor: [],
    add_on: [],
  },
} satisfies MenuProduct;

// --- Selection → order-body seam ------------------------------------------
// Emulate the product screen's flow: user taps "Large", we look it up by the
// same `optionId` the selector surfaced, map it to a cart SelectedOption, then
// to the `POST /orders` body entry. Every step must yield a real (non-optional)
// `optionId` string.

const selectedOptionId: string = WIRE_SIZE_LARGE.optionId; // 'opt-size-large'
const selected: MenuProductOption | undefined = WIRE_PRODUCT.options.size.find(
  (o) => o.optionId === selectedOptionId,
);

// `selected` must be found and its optionId is the LARGE id, proving distinct
// options are distinguishable (the collapsed-to-first bug is a type-invisible
// runtime concern; this documents the intended invariant at the seam).
const cartOption: SelectedOption = toSelectedOption(selected as MenuProductOption, 'size');

// The order-body option is `{ optionId: string }` — a required, non-undefined
// string. Assigning `cartOption.optionId` here is what regressed: before the
// fix it was `undefined` (typed `string` but runtime-absent). The type is now
// sourced from the wire's `optionId`, so this holds structurally.
const orderBodyOption: CreateOrderInput['items'][number]['selectedOptions'][number] = {
  optionId: cartOption.optionId,
};

// Reference every binding in value position so `noUnusedLocals` /
// `no-unused-vars` keep this guard honest without emitting runtime exports.
void [WIRE_PRODUCT, selected, cartOption, orderBodyOption, selectedOptionId];
