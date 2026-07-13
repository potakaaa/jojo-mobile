---
name: plan:payment-method-screen
description: "New payment-method selection screen for checkout — widens PaymentMethod to concrete methods, gates availability by flag, follow-up to CART-002"
date: 13-07-26
feature: ordering-cart
---

# Payment Method Selection Screen — Implementation Plan

**Feature:** ordering-cart
**Follow-up to:** CART-002 (checkout-flow, `process/features/ordering-cart/active/checkout-flow_13-07-26/`)
**Date**: 2026-07-13
**Status**: PLAN — awaiting VALIDATE
**Complexity**: SIMPLE
**Branch:** feat/checkout-flow
**Context:** `process/context/all-context.md`

---

## Overview

### Goal
Replace the inline 2-option payment selector on Checkout with a dedicated "Select payment method"
screen listing 5 concrete methods (pay at pickup, app wallet, GCash, Maya, card). Checkout shows a
tappable row with the current selection; tapping it navigates to the new screen; picking an
available method there returns to Checkout with the selection applied.

### Locked decisions (do not re-litigate — see prompt for full text)
- **D1** — `PaymentMethod` widens to `'pay_at_branch' | 'app_wallet' | 'gcash' | 'maya' | 'card'` in
  `packages/types/src/order.ts`. The order stores the concrete method directly. `payment_status`
  stays `'unpaid'` for every method (nothing is charged). This diverges from the DB enum
  (`pay_at_branch | online_payment`) — mock/app-side only, no DB/migration change. A backlog NOTE
  records the divergence for when the real order API is wired.
- **D2** — Availability: `pay_at_branch` always selectable. `gcash`/`maya`/`card` selectable only
  when `env.onlinePaymentEnabled` is true, else disabled ("Unavailable"). `app_wallet` always
  disabled (no wallet backing yet). All 5 methods are always shown; unavailable ones are visibly
  disabled, never hidden. This preserves issue #18 AC1 (flag OFF ⇒ only pay-at-pickup selectable).
- **D3** — Method list (temporary, will be finalized later): Pay at pickup, App wallet, GCash,
  Maya, Credit/debit card. Mock/non-functional beyond selection.
- **UX** — Checkout's "Payment" section becomes a tappable row showing the current method's label;
  tapping navigates to the new screen. Selecting an available method there applies it and returns
  to Checkout (`router.back()`). Default selection is `pay_at_branch`.

### Constraints (do not violate)
- Do not alter the `useCart()` public contract.
- Do not alter `placeOrder()`'s async signature or `PlaceOrderResult` union shape — only the
  `paymentMethod` parameter's type widens as a consequence of D1.
- No schema/auth/API/billing/migration surface changes — mock only, no DB migration.
- Issue #18's 6 ACs stay green, especially AC1 (flag gating) and AC2 (`buildOrderFromRequest` unit
  test).

---

## Design Decisions (chosen + rejected + why)

### DD-1: Extend the existing `PaymentMethodSelector` component (not a new component)
**Chosen:** widen `packages/ui/src/components/payment-method-selector.tsx`'s `OPTIONS` array from
2 entries to 5, and change the per-option disabled predicate to reflect D2 per-method rules. Export
a new `PAYMENT_METHOD_LABELS: Record<PaymentMethod, string>` map alongside the component so both
the new screen's header context and the Checkout row / Confirmation screen can reuse one source of
truth for display labels (avoids 3 independent copies of the label list).
**Rejected:** a brand-new list component in `packages/ui`, or inlining the list directly in the new
screen file.
**Why:** the component already implements the exact radio-row pattern needed (icon, label, caption,
disabled badge, radio dot, theme-token driven) — reuse over one-off screen markup, per repo
convention ("always use `@jojopotato/ui`"). Only the `OPTIONS` data and the disabled predicate
change; the render loop, styles, and props (`value`, `onChange`, `onlinePaymentEnabled`, `mode`,
`style`) stay the same, so this is a data/logic change to an existing file, not a rewrite.

### DD-2: Lift `paymentMethod` selection into the existing `useOrder()` seam
**Chosen:** add `paymentMethod: PaymentMethod` + `setPaymentMethod: (m: PaymentMethod) => void` to
`OrderSessionState` (`apps/mobile/src/features/order/hooks/use-order.ts`), defaulting to
`'pay_at_branch'` via `useState`. Checkout and the new screen both read/write through `useOrder()`.
Reset to `'pay_at_branch'` inside `placeOrder()`'s success branch (alongside `clearCart()`), so the
next order starts from the default again.
**Rejected:** router params (awkward to carry a picked value back through `router.back()` without a
separate return-value mechanism), or a new dedicated store/context (extra seam for one boolean-ish
piece of state that already has a natural home).
**Why:** `OrderSessionProvider` is already mounted above the tab stack in `_layout.tsx`, so state
set on the new screen and read by Checkout survives the push/pop navigation for free — no new
provider, no prop-drilling, minimal blast radius. This does not touch `placeOrder()`'s signature —
only adds two new fields to the existing state object.

### DD-3: Checkout's "Payment" row uses `Card` + `Button` (not a new component)
**Chosen:** replace the inline `<PaymentMethodSelector .../>` render in Checkout's Payment section
with a `Card` (from `@jojopotato/ui`) containing the current method's label (via
`PAYMENT_METHOD_LABELS`) and a "Change" `Button` (`variant="outline"`). Tapping either the card or
the button navigates to `/(tabs)/order/payment-method`.
**Rejected:** a bespoke `Pressable` row with hand-rolled chevron styling; reusing `BranchCard`'s
built-in `onChange`/"Change" affordance directly (it is a card-specific prop, not a generic row).
**Why:** `Card` + `Button` are both existing, theme-token-driven `@jojopotato/ui` primitives — this
keeps the "tap to change" idiom sourced from the same design-system building blocks the rest of the
app uses, and mirrors the visual language of `BranchCard`'s `onChange`/"Change" pattern (used today
on the **Cart** screen's branch row, not on Checkout itself — VALIDATE confirmed Checkout's own
`BranchCard` usage currently renders the plain open/closed status pill, no `onChange` prop passed).
This plan is what introduces the "tap row to change" idiom onto the Checkout screen; composing it
from `Card`+`Button` (rather than repurposing `BranchCard`, which is branch-shaped) keeps the new
row honest about being payment-method content, not a branch card.

---

## Touchpoints

| File | Change |
|---|---|
| `packages/types/src/order.ts` | Widen `PaymentMethod` union (D1) |
| `packages/ui/src/components/payment-method-selector.tsx` | Widen `OPTIONS` to 5 methods; new per-method disabled predicate (D2); export `PAYMENT_METHOD_LABELS` |
| `packages/ui/src/components/__tests__/payment-method-selector.test.tsx` | **NEW** — unit tests for the widened selector (5 rows, disabled states) |
| `apps/mobile/src/features/order/hooks/use-order.ts` | Add `paymentMethod`/`setPaymentMethod` to `OrderSessionState`; reset to default on successful `placeOrder()` |
| `apps/mobile/src/app/(tabs)/order/checkout.tsx` | Replace inline selector with tappable row reading/writing `useOrder()`; drop local `useState<PaymentMethod>` |
| `apps/mobile/src/app/(tabs)/order/payment-method.tsx` | **NEW** — renders `PaymentMethodSelector` (5 methods), selecting an available method sets it via `useOrder()` and calls `router.back()` |
| `apps/mobile/src/app/(tabs)/order/_layout.tsx` | Register `Stack.Screen name="payment-method"` (`title: 'Payment Method'`, `headerShown: true` — inherited from `screenOptions`) |
| `apps/mobile/src/app/(tabs)/order/confirmation/[orderId].tsx` | Remove local `PAYMENT_LABEL` `Record<PaymentMethod, string>`; import `PAYMENT_METHOD_LABELS` from `@jojopotato/ui` instead |
| `apps/mobile/src/features/order/__tests__/mock-order.test.ts` | Add 1 case proving `buildOrderFromRequest` round-trips a concrete non-`pay_at_branch` method (e.g. `'gcash'`) unchanged (P4) |
| `process/features/ordering-cart/backlog/payment-method-enum-divergence_NOTE_13-07-26.md` | **NEW** — backlog NOTE recording the DB-enum divergence (D1 contract debt) |

## Public Contracts

- `PaymentMethod` (exported from `@jojopotato/types`) widens from a 2-value union to a 5-value
  union. This is a **breaking widen** for any exhaustive `switch`/`Record<PaymentMethod, ...>` —
  the only two such consumers in the repo are `packages/ui/payment-method-selector.tsx` (updated by
  this plan, DD-1) and `confirmation/[orderId].tsx`'s `PAYMENT_LABEL` (removed by this plan,
  replaced with the shared export). Confirmed via repo-wide grep — no other `Record<PaymentMethod`
  or `switch (‥: PaymentMethod)` exists. **Re-confirmed independently at VALIDATE** (fresh repo-wide
  grep of `PaymentMethod`, `'online_payment'`, `'pay_at_branch'`, and `Record<PaymentMethod`/switch
  patterns across `apps/` and `packages/`, including `component-showcase.tsx`, which imports
  `@jojopotato/ui` but does **not** import `PaymentMethodSelector` — not a consumer) — the two-file
  claim holds exactly; no third consumer exists.
- `OrderSessionState` (from `useOrder()`) gains two new fields (`paymentMethod`,
  `setPaymentMethod`). Additive — does not change `placeOrder`'s signature or `PlaceOrderResult`.
  **Re-confirmed at VALIDATE**: `placeOrder`'s success branch calls `setLastOrder(order)` (the
  snapshotted `Order`, which already carries its own resolved `paymentMethod` field) BEFORE the new
  `setPaymentMethod('pay_at_branch')` reset call — so the reset cannot affect what Confirmation
  reads from `lastOrder.paymentMethod`. No ordering conflict.
- New export `PAYMENT_METHOD_LABELS: Record<PaymentMethod, string>` from `@jojopotato/ui`.
- New route `/(tabs)/order/payment-method` — pushed from Checkout, pops back with `router.back()`.

## Blast Radius

- **Packages touched:** `packages/types` (1 file), `packages/ui` (1 file + 1 new test file),
  `apps/mobile` (5 files: 1 new screen, 1 layout, 2 edited screens, 1 edited hook + its test file).
- **Risk class:** none of auth/billing/schema/migration/public-API/container — pure mock UI/type
  change. No DB/migration touched (D1 explicitly forbids it).
- **File count:** ~9 files (6 edited, 3 new: screen, UI test, backlog note).

---

## Implementation Checklist (EXECUTE order)

1. **`packages/types/src/order.ts`** — widen `PaymentMethod` to
   `'pay_at_branch' | 'app_wallet' | 'gcash' | 'maya' | 'card'`. No other fields change.
2. **`packages/ui/src/components/payment-method-selector.tsx`**:
   - Replace `OPTIONS` with 5 entries: `pay_at_branch` ("Pay at pickup", existing copy/icon),
     `app_wallet` ("App wallet", caption "Coming soon", icon `wallet-outline`), `gcash` ("GCash",
     caption "Pay via GCash", icon `phone-portrait-outline`), `maya` ("Maya", caption "Pay via
     Maya", icon `card-outline`), `card` ("Credit/debit card", caption "Pay by card", icon
     `card-outline` or a distinct glyph if available — verify via `Ionicons.glyphMap` before
     picking, don't guess a nonexistent icon name).
   - Replace the single `isDisabled` line with a per-method rule: `pay_at_branch` → `false`;
     `app_wallet` → `true`; `gcash`/`maya`/`card` → `!onlinePaymentEnabled`.
   - Export `export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { ... }` built
     from the same 5 labels used in `OPTIONS` (single source, no duplicate string literals).
   - Component's public prop shape (`value`, `onChange`, `onlinePaymentEnabled`, `mode`, `style`)
     is unchanged.
3. **`packages/ui/src/components/__tests__/payment-method-selector.test.tsx`** (new) — read one
   existing selector test (e.g. `size-selector.test.tsx`) for the jest-expo render/import pattern
   used in this package; note that **no existing test in this package currently exercises
   `fireEvent` or `accessibilityState` assertions** (all current selector tests are bare
   render-without-throwing smoke tests) — this file establishes that pattern for the first time in
   `packages/ui`, using `@testing-library/react-native`'s `fireEvent` and `getAllByRole('radio', …)`
   / per-row `accessibilityState` queries (the library is already a devDependency via the existing
   `render` import — no new dependency needed). Write cases for: all 5 rows render with correct
   labels; with `onlinePaymentEnabled=false` only `pay_at_branch` is non-disabled
   (accessibilityState); with `onlinePaymentEnabled=true`, `gcash`/`maya`/`card` become non-disabled
   but `app_wallet` stays disabled; tapping a disabled row does not call `onChange`; tapping an
   enabled row calls `onChange` with that method.
4. **`apps/mobile/src/features/order/hooks/use-order.ts`**:
   - Add `const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pay_at_branch')`.
   - Add both to `OrderSessionState` interface and to the `useMemo` return value (and its dep
     array).
   - Inside `placeOrder`'s success branch (after `clearCart()`), add
     `setPaymentMethod('pay_at_branch')` to reset for the next order.
5. **`apps/mobile/src/app/(tabs)/order/payment-method.tsx`** (new):
   - `SafeAreaView` + `ScrollView` shell matching `checkout.tsx`'s container/safeArea/scroll/content
     style constants (`MaxContentWidth`, `Spacing`, theme background) for visual consistency.
   - Render `<PaymentMethodSelector value={paymentMethod} onChange={handleSelect}
     onlinePaymentEnabled={env.onlinePaymentEnabled} mode={mode} />` where `paymentMethod` comes
     from `useOrder()`.
   - `handleSelect(method)`: call `setPaymentMethod(method)` from `useOrder()`, then
     `router.back()`. Since the component already prevents `onPress` from firing for disabled
     options (existing `disabled` prop on `Pressable`), no extra guard is needed here — confirm
     this holds by reading the component's `Pressable disabled={isDisabled}` line before relying on
     it.
   - No footer/place-order button on this screen — it is selection-only.
6. **`apps/mobile/src/app/(tabs)/order/_layout.tsx`** — add
   `<Stack.Screen name="payment-method" options={{ title: 'Payment Method' }} />` (same pattern as
   the other pushed screens; `headerShown: true` is inherited from `screenOptions`).
6b. **Typed-routes codegen refresh (do this before running `pnpm typecheck`)** — Expo Router's
    typed-routes codegen (`apps/mobile/.expo/types/router.d.ts`, already present in this repo from
    prior route scaffolding) does **not** regenerate from `tsc --noEmit` alone. After step 6 adds
    the new route file/registration, run `npx expo start` once from `apps/mobile` (wait for the
    bundler to report ready, then stop it, e.g. `Ctrl+C`) so the codegen picks up the new
    `/(tabs)/order/payment-method` route — otherwise `router.push('/(tabs)/order/payment-method')`
    in checklist step 7 will fail `pnpm typecheck` against the stale typed-route union. This
    matches the existing repo convention documented in `process/context/all-context.md` ("Navigation
    shell pattern"). Run this once, after step 6 and before running any gate that depends on
    `pnpm typecheck` (including step 7's own verification).
7. **`apps/mobile/src/app/(tabs)/order/checkout.tsx`**:
   - Remove `const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pay_at_branch')`
     and the `PaymentMethodSelector` import/usage.
   - Read `paymentMethod` from `useOrder()` instead (destructure alongside existing
     `placeOrder`/`isPlacingOrder`).
   - Replace the Payment section's selector with a `Card` (import from `@jojopotato/ui`) showing
     "Payment method" label + `PAYMENT_METHOD_LABELS[paymentMethod]` value, plus a `Button
     variant="outline"` labeled "Change" that calls
     `router.push('/(tabs)/order/payment-method')`. See DD-3 — this composes `Card`+`Button`
     directly rather than reusing `BranchCard`'s `onChange` prop (that prop is card-specific and is
     used today on the Cart screen's branch row, not on Checkout).
   - `handlePlaceOrder` continues to call `placeOrder(paymentMethod)` — no signature change, just a
     different source for the variable.
8. **`apps/mobile/src/app/(tabs)/order/confirmation/[orderId].tsx`**:
   - Delete the local `PAYMENT_LABEL: Record<PaymentMethod, string>` object.
   - Import `PAYMENT_METHOD_LABELS` from `@jojopotato/ui` and use it in the existing `Row` call
     (`PAYMENT_METHOD_LABELS[order.paymentMethod]`).
9. **`apps/mobile/src/features/order/__tests__/mock-order.test.ts`** — add one `it()` case calling
   `buildOrderFromRequest` with `makeRequest({ paymentMethod: 'gcash' })` and asserting
   `order.paymentMethod === 'gcash'` (proves the widened type flows through unchanged — P4 in
   Verification Evidence). The existing AC2 case (`makeRequest()` default `'pay_at_branch'`) is
   generic over `PaymentMethod` and needs no change — confirmed at VALIDATE by reading the current
   test file.
10. **`process/features/ordering-cart/backlog/payment-method-enum-divergence_NOTE_13-07-26.md`**
    (new) — record: the DB `payment_method` enum (`packages/api/src/db/schema/orders.ts`) is still
    `pay_at_branch | online_payment`; when the real `placeOrder()`/order API is wired (per the
    existing `checkout-real-order-api_NOTE_13-07-26.md` backlog item), the API/DB must either widen
    `payment_method` to match the concrete app-side methods, or add a boundary mapping (concrete
    method → `pay_at_branch | online_payment`) at the request boundary. No DB/migration change is
    made by this plan.

## Acceptance Criteria

1. `PaymentMethod` includes `pay_at_branch`, `app_wallet`, `gcash`, `maya`, `card`; `pnpm typecheck` is green across every consumer.
2. With `EXPO_PUBLIC_ONLINE_PAYMENT_ENABLED` unset/false, only `pay_at_branch` is selectable on the payment-method screen — all other rows show "Unavailable" and cannot be tapped (issue #18 AC1 preserved).
3. With the flag true, `gcash`/`maya`/`card` become selectable; `app_wallet` stays disabled regardless of the flag.
4. Tapping an available method on the new screen sets it via `useOrder()` and returns to Checkout (`router.back()`) with that method shown.
5. Checkout's Payment section is a tappable row (current method + "Change" button) that navigates to `/(tabs)/order/payment-method`; it no longer renders the inline 2-option selector.
6. Default selection is `pay_at_branch` when nothing has been picked, and resets to `pay_at_branch` after a successful `placeOrder()`.
7. `buildOrderFromRequest` round-trips any concrete `PaymentMethod` unchanged (existing AC2 case plus new non-`pay_at_branch` case both green).
8. `payment_status` remains `'unpaid'` for every method — no charging logic is added.
9. The backlog NOTE recording the DB-enum divergence exists at `process/features/ordering-cart/backlog/payment-method-enum-divergence_NOTE_13-07-26.md`.

## Phase Completion Rules

- **CODE DONE**: all Implementation Checklist steps 1–10 (incl. 6b, typed-routes codegen refresh)
  applied, in order — 6b must run before verifying `pnpm typecheck`; `pnpm typecheck` / `pnpm lint`
  / `pnpm format:check` / `node packages/ui/scripts/check-raw-tokens.mjs` green.
- **VERIFIED**: CODE DONE, plus `pnpm --filter @jojopotato/mobile test` and `pnpm --filter @jojopotato/ui test` green, plus all 4 Agent-Probe scenarios (P1–P4) confirmed per the Verification Evidence table.
- This plan cannot be marked VERIFIED on Known-Gap alone — every Verification Evidence row must resolve via its named strategy (Fully-Automated or Agent-Probe), not be silently skipped.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm typecheck` | Fully-Automated | No consumer of the widened `PaymentMethod` breaks (confirms Public Contracts exhaustiveness sweep was complete); run only after checklist step 6b (typed-routes codegen refresh) |
| `pnpm lint` | Fully-Automated | Repo lint conventions hold across new/changed files |
| `pnpm format:check` | Fully-Automated | Prettier formatting holds |
| `node packages/ui/scripts/check-raw-tokens.mjs` | Fully-Automated | New/changed `packages/ui` component code has no raw hex literals (theme-token discipline, DD-1) |
| `pnpm --filter @jojopotato/mobile test` | Fully-Automated | `mock-order.test.ts` — widened type round-trips through `buildOrderFromRequest` unchanged (P4); existing AC2 case (`pay_at_branch`) still green |
| `pnpm --filter @jojopotato/ui test` | Fully-Automated | New `payment-method-selector.test.tsx` — 5 rows render, per-method disabled logic matches D2, disabled taps don't fire `onChange` |
| P1 — Flag OFF ⇒ only Pay at pickup selectable | Agent-Probe | Set `EXPO_PUBLIC_ONLINE_PAYMENT_ENABLED` unset/false, open the payment-method screen, confirm only `pay_at_branch` is non-disabled and `app_wallet`/`gcash`/`maya`/`card` all show "Unavailable" — issue #18 AC1 still holds under the widened method set |
| P2 — Selecting a method returns to Checkout with it applied and used by `placeOrder` | Agent-Probe | From Checkout, tap the payment row, pick an available method (e.g. GCash with flag ON), confirm `router.back()` lands on Checkout showing "GCash", then place the order and confirm the resulting order's `paymentMethod` is `'gcash'` on the Confirmation screen |
| P3 — Default is `pay_at_branch` when nothing is picked | Agent-Probe | Fresh app load (or after a completed order resets state per checklist step 4), open Checkout without visiting the payment-method screen, confirm the row shows "Pay at pickup" and `placeOrder` receives `'pay_at_branch'` |
| P4 — Widened type doesn't break `buildOrderFromRequest` (AC2) | Fully-Automated | `mock-order.test.ts` new case (checklist step 9) + existing AC2 case both green |

## Test Infra Improvement Notes

- `packages/ui` has no existing precedent for interaction-testing (`fireEvent`, `accessibilityState`
  queries) — checklist step 3 establishes this pattern for the first time in the package. Not a
  blocker (the library is already available), but worth carrying forward as a reusable pattern for
  future `packages/ui` components with disabled/interactive states.

## Backlog Stub

- `process/features/ordering-cart/backlog/payment-method-enum-divergence_NOTE_13-07-26.md` (created
  by checklist step 10) — DB `payment_method` enum divergence from the widened app-side
  `PaymentMethod`; must be resolved when the real order API/DB write path is wired (see also the
  pre-existing `checkout-real-order-api_NOTE_13-07-26.md`).

---

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/features/ordering-cart/active/payment-method-screen_13-07-26/payment-method-screen_PLAN_13-07-26.md`
2. **Last completed phase or step:** PLAN — this plan file just written; no EXECUTE has started.
3. **Validate-contract status:** pending — not yet run.
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md`,
   `process/development-protocols/orchestration.md`,
   `process/development-protocols/plan-lifecycle.md`; sibling plan
   `process/features/ordering-cart/active/checkout-flow_13-07-26/checkout-flow_PLAN_13-07-26.md`
   (source of the CART-002 seam/contract pattern this plan extends); backlog note
   `process/features/ordering-cart/backlog/checkout-real-order-api_NOTE_13-07-26.md`.
5. **Next step for a fresh agent:** run VALIDATE on this plan file (`ENTER VALIDATE MODE`); once
   gated PASS/CONDITIONAL-accepted, run `ENTER EXECUTE MODE` against this exact plan path. EXECUTE
   should follow the Implementation Checklist in order (types → UI component → hook → new screen →
   layout registration → typed-routes codegen refresh (6b) → checkout/confirmation consumers →
   tests → backlog note), running the per-section test gates from Verification Evidence as each
   section completes, per `orchestration.md` §PVL/EVL and the per-section test-gate loop in
   `vc-generate-phase-program`/EXECUTE conventions.

## Validate Contract

Status: PASS
Date: 13-07-26
date: 2026-07-13
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 7-signal score 2/7 (S1 multi-package scope: types+ui+mobile; S7 5+ blast-radius files) — MEDIUM by raw score, but the Implementation Checklist is a strict linear dependency chain (type widen -> component -> hook -> new screen -> layout registration -> typed-routes codegen -> checkout/confirmation consumers -> tests -> backlog note); no independent workstreams exist to parallelize, and forcing parallel subagents on a strictly-ordered 9-file SIMPLE plan would add coordination overhead without benefit. Single vc-execute-agent runs the checklist in order.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Widened `PaymentMethod` union compiles across every consumer (incl. new route href) | Fully-Automated | `pnpm typecheck` (run only after checklist step 6b typed-routes codegen refresh) | A |
| general | Repo lint conventions hold on new/changed files | Fully-Automated | `pnpm lint` | A |
| general | Prettier formatting holds | Fully-Automated | `pnpm format:check` | A |
| DD-1 | New/changed `packages/ui` component code has no raw hex literals | Fully-Automated | `node packages/ui/scripts/check-raw-tokens.mjs` | A |
| AC7 / P4 | `buildOrderFromRequest` round-trips a concrete non-`pay_at_branch` method (`'gcash'`) unchanged; existing `pay_at_branch` AC2 case stays green | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (mock-order.test.ts) | A |
| AC2 / AC3 | 5 rows render with correct labels; per-method disabled state matches D2 (`pay_at_branch` always enabled, `app_wallet` always disabled, `gcash`/`maya`/`card` gated by `onlinePaymentEnabled`); disabled taps do not fire `onChange`; enabled taps do | Fully-Automated | `pnpm --filter @jojopotato/ui test` (payment-method-selector.test.tsx) | A |
| AC2 | Flag OFF -> only `pay_at_branch` selectable, all others show "Unavailable" (issue #18 AC1 preserved under widened method set) | Agent-Probe | P1 — open payment-method screen with `EXPO_PUBLIC_ONLINE_PAYMENT_ENABLED` unset/false | A |
| AC4 / AC5 | Selecting an available method returns to Checkout (`router.back()`) with it applied and used by `placeOrder` | Agent-Probe | P2 — tap payment row, pick GCash with flag ON, confirm Checkout shows "GCash", place order, confirm Confirmation shows `'gcash'` | A |
| AC6 | Default is `pay_at_branch` when nothing picked, and resets to it after a successful order | Agent-Probe | P3 — fresh/reset session, open Checkout without visiting payment-method screen, confirm row + `placeOrder` receive `'pay_at_branch'` | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: all rows above use Fully-Automated or Agent-Probe — no Known-Gap residuals in this plan's blast radius.

Legacy line form (retained so existing validate-contract consumers still parse):
- Types/UI/consumer breaking-widen sweep: Fully-automated: `pnpm typecheck` (after checklist step 6b) | hybrid: n/a | agent-probe: n/a | known-gap: n/a
- Component/hook/screen/backlog checklist correctness: Fully-automated: `pnpm lint` + `pnpm format:check` + `node packages/ui/scripts/check-raw-tokens.mjs` | hybrid: n/a | agent-probe: n/a | known-gap: n/a
- Mock order round-trip (AC7/P4): Fully-automated: `pnpm --filter @jojopotato/mobile test` | hybrid: n/a | agent-probe: n/a | known-gap: n/a
- Selector rendering + D2 disabled logic (AC2/AC3): Fully-automated: `pnpm --filter @jojopotato/ui test` | hybrid: n/a | agent-probe: n/a | known-gap: n/a
- Flag-gating / navigation / default-reset behavior (AC2, AC4-AC6): Fully-automated: n/a | hybrid: n/a | agent-probe: P1, P2, P3 (see table above) | known-gap: n/a

Failing stub (mock-order.test.ts new case, AC7/P4):
```
test("should round-trip a concrete non-pay_at_branch PaymentMethod (gcash) unchanged through buildOrderFromRequest", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: buildOrderFromRequest with paymentMethod: 'gcash' returns order.paymentMethod === 'gcash'")
})
```

Failing stub (payment-method-selector.test.tsx, AC2/AC3):
```
test("should render all 5 rows with correct labels", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: pay_at_branch/app_wallet/gcash/maya/card rows render with D3 labels")
})
test("should mark only pay_at_branch non-disabled when onlinePaymentEnabled=false", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: accessibilityState.disabled per D2 with flag off")
})
test("should mark gcash/maya/card non-disabled and app_wallet still disabled when onlinePaymentEnabled=true", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: accessibilityState.disabled per D2 with flag on")
})
test("should not call onChange when a disabled row is tapped", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: fireEvent.press on disabled row is a no-op")
})
test("should call onChange with the method when an enabled row is tapped", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: fireEvent.press on enabled row calls onChange(method)")
})
```

(typecheck/lint/format/check-raw-tokens rows are pre-existing repo-wide gate commands, not new test scenarios — no TDD stub applies.)

Dimension findings:
- Infra fit: PASS — pure mock UI/type change confined to existing package boundaries (`packages/types`, `packages/ui`, `apps/mobile`); no container/infra/deploy/runtime surface touched; matches existing Expo Router nested-stack and `@jojopotato/ui` reuse conventions.
- Test coverage: PASS — every developed behavior (type widen, D2 disabled logic, navigation round-trip, default/reset behavior, mock round-trip) resolves via a named Fully-Automated or Agent-Probe strategy; no Known-Gap rows; the one process gap found (`packages/ui` has no prior fireEvent/accessibilityState test precedent) was fixed in-plan as an execute-agent instruction in checklist step 3, not left as a silent skip.
- Breaking changes: PASS after in-plan fix — independently re-grepped the whole repo (`apps/`, `packages/`) for `PaymentMethod`, `'online_payment'`, `'pay_at_branch'`, and `Record<PaymentMethod`/switch patterns; confirmed the plan's claim of exactly 2 exhaustive consumers (payment-method-selector.tsx, confirmation/[orderId].tsx) is correct — `component-showcase.tsx` imports `@jojopotato/ui` but not `PaymentMethodSelector`, so it is not a third consumer. Found and fixed one real gap: the plan was missing the Expo Router typed-routes codegen refresh (`.expo/types/router.d.ts` does not regenerate from `tsc --noEmit` alone) needed before `pnpm typecheck` will resolve the new `/(tabs)/order/payment-method` href — added as checklist step 6b. Confirmed `mock-order.ts`/`buildOrderFromRequest` is type-generic over `PaymentMethod` (never branches on the literal enum values) and `payment_status` is hardcoded `'unpaid'` regardless of method, so removing `'online_payment'` app-side cannot break the mock; the DB-facing divergence is mock-only (no DB write path exists yet) and is captured by the backlog NOTE (checklist step 10).
- Security surface: PASS — no auth, billing, secrets, or trust-boundary logic touched; `payment_status` stays `'unpaid'` for every method (no charging logic added, matches AC8).
- Section: Design Decisions (DD-1/DD-2/DD-3) — CONCERN found and fixed in-plan — DD-3's original rationale claimed the "Change" button pattern was "already used one section above it on the same screen" (i.e. on Checkout). Verified against the current `checkout.tsx` and `branch-card.tsx` source: Checkout's own `BranchCard` usage does not pass an `onChange` prop (it renders the open/closed status pill instead); the `onChange`/"Change" button idiom currently exists only on the Cart screen's `BranchCard` usage. DD-3's rationale text has been corrected in-plan to state this accurately; the chosen implementation (compose `Card`+`Button` directly rather than reuse `BranchCard`'s prop) is unaffected and remains mechanically sound.
- Section: Touchpoints + State seam (use-order.ts / checkout.tsx / payment-method.tsx / _layout.tsx) — PASS — confirmed `placeOrder`'s async signature and `PlaceOrderResult` union are unchanged (only `OrderSessionState` gains two additive fields); confirmed the success-branch reset (`setPaymentMethod('pay_at_branch')`, added after `clearCart()`) cannot affect what Confirmation reads because `setLastOrder(order)` already snapshots the resolved `paymentMethod` before the reset runs; confirmed all named edit-target lines exist and are uniquely matchable in every touched file.

Open gaps: none — both gaps found during VALIDATE (typed-routes codegen step; DD-3 rationale inaccuracy) were fixed directly in the plan file before this contract was written.

What this coverage does NOT prove:
- `pnpm typecheck` proves the widened union compiles; it does NOT prove the typed-routes codegen step (6b) was actually run before it — if EXECUTE skips 6b, typecheck will legitimately fail on the new route href and must be treated as a real failure, not flaked past.
- `pnpm --filter @jojopotato/ui test` (new file) proves the 5-row render/disabled/onChange logic in isolation; it does NOT prove the component looks correct visually (icon glyph choices, spacing) — that is covered qualitatively by P1/P2 Agent-Probe screen-level checks, not pixel-verified.
- P1/P2/P3 Agent-Probes prove the flag-gating, navigation round-trip, and default/reset behavior on one manual pass; they do NOT constitute a regression suite — no automated E2E/navigation harness exists in this repo yet (tracked as a pre-existing project-wide gap, not specific to this plan).
- The backlog NOTE (checklist step 10) documents the DB-enum divergence; it does NOT resolve it — the real order API/DB boundary mapping remains future work per `checkout-real-order-api_NOTE_13-07-26.md`.

Gate: PASS (no FAILs, plan updated)

---

## Autonomous Goal Block

SESSION GOAL: Ship the payment-method selection screen — widen `PaymentMethod` to 5 concrete methods, gate availability by `env.onlinePaymentEnabled` per D2, lift selection into `useOrder()`, and replace Checkout's inline 2-option selector with a tappable row that navigates to the new screen (follow-up to CART-002).
Charter + umbrella plan: N/A — single plan (no phase program; no umbrella plan with `## Stable Program Goal` exists for this work).
Autonomy: Standard RIPER-5 autonomy rules — CONDITIONAL findings apply-and-proceed, BLOCKED findings go to backlog + continue, irreversible/outward-facing actions without explicit contract instruction hard-stop. This VALIDATE pass ran autonomously and resolved both findings it surfaced (missing typed-routes codegen step; inaccurate DD-3 rationale) via direct plan-text fixes, reaching Gate: PASS with no CONDITIONAL acceptance needed.
Hard stop conditions / safety constraints:
- Do not alter `useCart()`'s public contract.
- Do not alter `placeOrder()`'s async signature or the `PlaceOrderResult` union shape — only the `paymentMethod` parameter's type widens.
- No schema/auth/API/billing/migration surface changes — mock only, no DB migration (D1 explicitly forbids it).
- Do not skip checklist step 6b (typed-routes codegen refresh via `expo start` then stop) before relying on `pnpm typecheck` — the new `/(tabs)/order/payment-method` route will not typecheck without it.
- Preserve issue #18 AC1: with the online-payment flag OFF/unset, only `pay_at_branch` may be selectable.
Next phase: EXECUTE — `process/features/ordering-cart/active/payment-method-screen_13-07-26/payment-method-screen_PLAN_13-07-26.md`
Validate contract: inline in plan (see `## Validate Contract` above)
Execute start: `pnpm typecheck && pnpm lint && pnpm format:check` (baseline, before any edits — already confirmed green at VALIDATE) → Implementation Checklist steps 1-10 in order (6b typed-routes refresh runs between 6 and 7) → `pnpm typecheck && pnpm lint && pnpm format:check && node packages/ui/scripts/check-raw-tokens.mjs && pnpm --filter @jojopotato/mobile test && pnpm --filter @jojopotato/ui test` (full gate re-run) | Agent-Probe walkthroughs P1-P3 per Verification Evidence | high-risk pack: no (risk class: low, no high-risk surface touched)
