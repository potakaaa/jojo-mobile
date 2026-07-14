---
name: plan:checkout-flow
description: "Checkout screen + order confirmation for CART-002, contract-shaped in-memory placeOrder() seam mirroring the real orders/order_items schema"
date: 13-07-26
feature: ordering-cart
---

# Checkout Flow (CART-002) — Implementation Plan

**Feature:** ordering-cart
**Issue:** [CART-002] [P0] Checkout flow + order confirmation (GitHub issue)
**Date**: 2026-07-13
**Status**: VALIDATE complete — Gate: PASS (2 plan fixes applied) — ready for EXECUTE
**Complexity**: COMPLEX (new state seam + domain-type contract extension + payment-flag config + 3 edge-case flows + 2 screen implementations)
**Context**: see `process/context/all-context.md` (repo router)
**Author**: vc-plan-agent (research/innovate already completed upstream this session); VALIDATE fixes applied by vc-validate-agent (13-07-26)

---

## Overview (Context and Goals)

### Goal
Deliver the Checkout screen and Order Confirmation screen exactly as CART-002 specifies: branch/items/discounts/total/pickup-time/payment-method confirmation, a payment selector gated by a feature flag, order placement that builds a correctly-shaped order + order_items object, success navigation with cart-clear, and 3 distinct failure paths that preserve the cart.

### LOCKED SCOPE DECISION (do not reopen during EXECUTE)
This plan builds a **contract-shaped mock**: the full UX flow and all edge cases run against an in-memory `placeOrder()` seam whose request/response TypeScript shapes exactly match the intended real `POST /api/orders` API (using the real Drizzle enum values and field names). There is **no** Express route, **no** Drizzle write, and **no** HTTP client added in this task. The real endpoint is an explicit deferred follow-up — see §Backlog Stub. AC2 ("creates a row") is satisfied by the seam producing a correctly-shaped order + order_items object with real snapshot fields, proven by a unit test on the seam logic — not a DB integration test.

### Current reality (research-verified this session)
- DB schema for `orders`/`order_items` exists and is migrated (`packages/api/src/db/schema/orders.ts`, `order_items.ts`). Enum values: `order_status` = pending/accepted/preparing/flavoring/ready/completed/cancelled; `payment_method` = `pay_at_branch` | `online_payment` (NOT `pay_at_pickup` — the contract must use this exact enum value); `payment_status` = unpaid/paid/failed/refunded.
- No order API route exists in `packages/api/src/index.ts` (auth-only). No mobile HTTP client exists for any feature domain — home/cart/menu/branches are all in-memory mock, confirming the contract-shaped-mock scope is consistent with the rest of the app.
- CART-001 (merged, PR #62) established the in-memory Context seam pattern this plan must mirror: `apps/mobile/src/features/cart/hooks/use-cart.ts` (`CartSessionProvider`/`useCart()`, throw-if-outside-provider, `useMemo`-derived totals) and `apps/mobile/src/features/cart/mock-cart.ts` (mock branch/product seed data).
- Routes are pre-scaffolded and registered in `apps/mobile/src/app/(tabs)/order/_layout.tsx` — no route-file creation or `_layout.tsx` Stack changes needed:
  - `apps/mobile/src/app/(tabs)/order/checkout.tsx` — currently `<ComingSoon isNestedScreen>` with a "Dev: Place Order" link that pushes to `confirmation/[orderId]` with a hardcoded `orderId: 'A1001'`.
  - `apps/mobile/src/app/(tabs)/order/confirmation/[orderId].tsx` — currently `<ComingSoon isNestedScreen>` reading `orderId` from `useLocalSearchParams`, with a "Dev: Track Order" link onward to `tracking/[orderId]` (tracking screen is out of scope for CART-002 — that dev link may remain as-is, it is pre-existing and not part of this plan's blast radius).
- `packages/types/src/order.ts` is a thin placeholder (`Order { id, cart, status, totalCents, createdAt }`, `OrderStatus` with non-matching enum values `confirmed`/`ready_for_pickup`) that does NOT match the DB schema — this plan replaces it with the real contract shape.
- `CartSessionProvider` is mounted in `apps/mobile/src/app/_layout.tsx` inside `AuthProvider`, wrapping `RootNavigator`. The order/placeOrder seam provider mounts alongside it, inside `AuthProvider`, so it can read auth/user context in the future without re-parenting (mirrors CART-001's A3 rationale). **VALIDATE confirmed** the real `_layout.tsx` today is exactly `AuthProvider > CartSessionProvider > RootNavigator` — the planned `OrderSessionProvider` insertion point (A2) is compile- and structure-compatible with the real file.
- No RN test runner is configured for `apps/mobile` (only `vitest` in `packages/api`, `jest-expo` in `packages/ui`). Pure-TS seam logic must therefore live somewhere it can be unit-tested with the existing tooling — see §Design Sub-Decisions D-C and §Verification Evidence. **VALIDATE finding:** this plan did not originally specify how/where that unit test would actually run — see Implementation Checklist step 4 (new) and §Validate Contract.

### Scope boundary
- **In scope:** checkout screen UI (confirm branch/items/discounts/total/pickup-time, payment-method selector gated by flag), order-placement seam (`placeOrder()`), order-number generation, availability-check simulation for the 3 edge cases, order confirmation screen, cart-clear on success, `EXPO_PUBLIC_ONLINE_PAYMENT_ENABLED` flag wiring, `packages/types/src/order.ts` contract extension, **and (VALIDATE addition) fixing the 2 real `OrderStatus` consumers in `packages/ui` that the type replacement breaks, plus adding a minimal `vitest` runner to `apps/mobile` for the seam's pure-function unit tests.**
- **Out of scope (explicit, backlog-stubbed):** real `POST /api/orders` Express route, real Drizzle insert, mobile HTTP client, live payment-gateway integration, order tracking screen (`tracking/[orderId].tsx` — pre-existing stub, untouched), push notifications on order status change, real coupon/discount pricing engine (CART-001's `AppliedDiscount` stub carries through unchanged).

---

## Design Sub-Decisions (LOCKED — chosen + rejected alternative + rationale)

### D-A: Where `placeOrder()` lives
**Chosen:** a NEW dedicated seam — `apps/mobile/src/features/order/hooks/use-order.ts` (`OrderSessionProvider` + `useOrder()`), NOT an extension of `useCart()`.
**Rejected alternative:** add `placeOrder()` directly onto `CartSessionState`.
**Rationale:** `useCart()` is a pure cart-state container (CART-001's A1 doc-comment: "swapping to a real cart backend changes only this file's internals"). Order placement is a distinct concern with its own request/response contract, its own loading/error state, and its own future backend swap point (`POST /api/orders`) — bloating `useCart()` would mix two backend integration surfaces into one file and violate CART-001's stated seam boundary. `useOrder()` reads the current cart via `useCart()` internally (composition, not inheritance) to build the snapshot and calls `clearCart()` on success — this keeps `useCart()`'s public contract completely unchanged (zero risk to the merged CART-001 surface).

### D-B: `PlaceOrderRequest` / `PlaceOrderResult` contract shape
**Chosen:** typed request/result mirroring the real schema field-for-field, with a discriminated-union result so callers get compile-time-exhaustive error handling. Lives in `packages/types/src/order.ts` (shared, so a future backend swap reuses the same types on both sides).

```ts
// packages/types/src/order.ts

export type OrderStatus =
  | 'pending' | 'accepted' | 'preparing' | 'flavoring' | 'ready' | 'completed' | 'cancelled';
export type PaymentMethod = 'pay_at_branch' | 'online_payment';
export type PaymentStatus = 'unpaid' | 'paid' | 'failed' | 'refunded';

export interface OrderItemOption {
  optionType: 'size' | 'flavor' | 'add_on';
  id: string;
  name: string;
  priceDeltaCents: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  productNameSnapshot: string;   // mirrors order_items.product_name_snapshot
  quantity: number;
  unitPriceCents: number;        // mirrors order_items.unit_price
  totalPriceCents: number;       // mirrors order_items.total_price
  selectedOptions: OrderItemOption[];
}

export interface Order {
  id: string;
  orderNumber: string;           // mirrors orders.order_number (unique, display)
  branchId: string;
  items: OrderItem[];
  status: OrderStatus;
  subtotalCents: number;
  discountTotalCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  estimatedReadyAt: string;      // ISO — mirrors orders.estimated_ready_at
  placedAt: string;              // ISO — mirrors orders.placed_at
}

export interface PlaceOrderRequest {
  branchId: string;
  items: Array<{
    menuItemId: string;
    productNameSnapshot: string;
    quantity: number;
    unitPriceCents: number;
    selectedOptions: OrderItemOption[];
  }>;
  discountTotalCents: number;
  paymentMethod: PaymentMethod;
}

export type PlaceOrderResult =
  | { ok: true; order: Order }
  | { ok: false; reason: 'branch_unavailable' }
  | { ok: false; reason: 'item_unavailable'; unavailableLineIds: string[] }
  | { ok: false; reason: 'network' };
```
**Rejected alternative:** a single `Order | null` return with a separate thrown-error path.
**Rationale:** AC4/AC5/AC6 each need a distinct, UI-addressable failure mode (which item is unavailable, whether to show a retry button). A discriminated union makes every call site exhaustively handle all 4 outcomes at compile time — throwing/catching loses this and risks an unhandled edge case slipping through, which is exactly the CART-002 failure-mode requirement.

**Breaking-change note (CORRECTED IN VALIDATE — the original claim below was wrong):**
~~this REPLACES the existing `Order`/`OrderStatus` placeholder in `packages/types/src/order.ts`... Grep confirmed no current consumer other than the file's own export... so this replacement is compile-safe.~~

**VALIDATE re-grepped and found this claim FALSE.** `confirmation/[orderId].tsx` is indeed safe (only reads the `orderId` route param as a string, never imports the `Order` type). BUT two real consumers of `OrderStatus` exist and WILL fail `pnpm typecheck` the moment this replacement lands:
- `packages/ui/src/components/order-status-badge.tsx` — `STATUS_META: Record<OrderStatus, {...}>` keyed to `pending/confirmed/preparing/ready_for_pickup/completed/cancelled` (6 keys)
- `packages/ui/src/components/order-status-timeline.tsx` — `STATUS_SEQUENCE: OrderStatus[]` and `STATUS_LABEL: Record<OrderStatus, string>`, same old 6 keys

The new `OrderStatus` union has 7 values (`pending/accepted/preparing/flavoring/ready/completed/cancelled`) — `confirmed` and `ready_for_pickup` no longer exist, and `accepted`/`flavoring`/`ready` are new required keys. Both components are consumed by `apps/mobile/src/app/component-showcase.tsx` and covered by existing jest tests (`packages/ui/src/components/__tests__/order-status-badge.test.tsx`, `order-status-timeline.test.tsx`, both using `status="preparing"`/`"cancelled"` — those specific literal values survive in the new enum, so the *tests* won't throw at runtime, but the *type* will not compile until the `Record`/array literals are updated). **Fix added to Implementation Checklist step 2 and Touchpoints below.**

### D-C: Triggering edge cases in the mock (testable without a device)
**Chosen:** extend the mock branch/product data with an `isAvailable: boolean` field already present on `MenuItem` (confirmed in `packages/types/src/menu.ts` — reuse, don't reinvent) and add an equivalent `isOpen`/`isAvailable`-style flag check inside `placeOrder()`'s pure validation function. The validation function (`validatePlaceOrderRequest(req, branchSnapshot, productAvailabilitySnapshot)`) is a **pure function**, exported separately from the React hook, so it is directly unit-testable with plain Node/vitest-style assertions with no React/RN runtime needed. `__DEV__`-only affordances (mirroring CART-001's "Dev: add item from another branch" pattern) let a human demonstrate AC4 (mark `MOCK_CART_BRANCH` unavailable) and AC5 (mark a specific cart line's product unavailable) live in the running app; network failure (AC6) gets a `__DEV__` "Dev: simulate network failure" toggle that forces `placeOrder()` to return `{ ok: false, reason: 'network' }`.

**VALIDATE addition:** to keep AC2 unit-testable without an RN rendering environment, the order-object-building step (currently implied to live inline inside the `useOrder()` hook's `placeOrder` callback) must ALSO be extracted as a pure function — `buildOrderFromRequest(req, orderNumber, estimatedReadyAt)` — in `mock-order.ts`, alongside `validatePlaceOrderRequest` and `generateOrderNumber`. `useOrder()` becomes a thin wrapper: call `validatePlaceOrderRequest` → if ok, call `buildOrderFromRequest` → set `lastOrder` + call `clearCart()`. This is what makes the Verification Evidence table's AC2 row genuinely "Fully-Automated" (see D-C's original claim already anticipated this: pure functions "exported separately from the React hook" — this VALIDATE addition just extends that same principle to the object-building step, which the original plan text left inline).

**Rejected alternative:** hardcode edge cases only as one-off scripted branches with no injectable state (undemonstrable in the running app, only provable by test).
**Rationale:** the pure-function split gives BOTH a real unit test (AC2/AC4/AC5/AC6 logic) AND a live-demonstrable `__DEV__` UI affordance (matching the project's own established CART-001 convention), without requiring a full RN test runner.

### D-D: Order-number generation format
**Chosen:** `JP-` + 6 uppercase alphanumeric characters (e.g. `JP-4F8B2C`), generated by a pure function `generateOrderNumber(): string` in the same seam module. Uses `Math.random` (mock-only; no crypto requirement since this is not the real backend).
**Rejected alternative:** sequential integer counter.
**Rationale:** sequential counters don't reset cleanly across app reloads (React state resets), and the real backend will almost certainly assign a random/opaque order number, not a client-visible sequence — matching that shape now avoids a display-format change later. Pure function with a fixed regex-testable shape (`/^JP-[A-Z0-9]{6}$/`) makes D-D directly unit-testable.

### D-E: Estimated pickup time
**Chosen:** reuse the exact same computation cart.tsx already uses — `now + MOCK_BRANCH_PREP_MINUTES` — imported directly from `@/features/cart/mock-cart` (no duplication). The checkout screen computes it once on mount (via `useMemo`) and passes the same ISO timestamp into the `placeOrder()` request so the confirmation screen's `estimatedReadyAt` matches exactly what checkout displayed.
**Rejected alternative:** re-derive pickup time independently on the confirmation screen.
**Rationale:** re-deriving after `placeOrder()` succeeds would produce a *slightly later* timestamp than what checkout displayed (clock drift between screens), silently breaking the "what you saw is what you get" expectation baked into AC1/AC3.

---

## Architecture Decisions

### A1. New seam: `OrderSessionProvider` / `useOrder()`, mirroring `use-cart.ts`
`apps/mobile/src/features/order/hooks/use-order.ts` — Context + `useState`/`useMemo`/`useCallback`, throw-if-used-outside-provider guard (matches `useCart()`/`useAuth()` convention exactly). Internally calls `useCart()` to read cart contents and `clearCart()` on success. Exposes:
```ts
export interface OrderSessionState {
  placeOrder: (paymentMethod: PaymentMethod) => Promise<PlaceOrderResult>;
  isPlacingOrder: boolean;
  lastOrder: Order | null;
}
```
`placeOrder` is `async` (returns a `Promise`) even though the mock resolves synchronously/with a tiny simulated delay — this keeps the call-site shape identical to what the real `fetch()`-backed version will need, per the LOCKED SCOPE decision (drop-in swap). Per D-C's VALIDATE addition, `placeOrder`'s internals call `validatePlaceOrderRequest()` then `buildOrderFromRequest()` (both pure, from `mock-order.ts`) — `clearCart()` is called ONLY in the success branch (`{ok:true}`), never in any of the 3 failure branches, guaranteeing the cart is preserved on every failure path (AC4/AC5/AC6).

### A2. Mount point
`OrderSessionProvider` mounts in `apps/mobile/src/app/_layout.tsx`, inside `AuthProvider` and inside `CartSessionProvider` (so it can call `useCart()`) — **VALIDATE confirmed this matches the real current file exactly** (today: `AuthProvider > CartSessionProvider > RootNavigator`; target: insert `OrderSessionProvider` between `CartSessionProvider` and `RootNavigator`):
```tsx
<AuthProvider>
  <CartSessionProvider>
    <OrderSessionProvider>
      <RootNavigator />
    </OrderSessionProvider>
  </CartSessionProvider>
</AuthProvider>
```

### A3. Payment flag
`apps/mobile/src/config/env.ts` gains `onlinePaymentEnabled: process.env.EXPO_PUBLIC_ONLINE_PAYMENT_ENABLED === 'true'` (default false → pay-at-pickup only, matching the typed-wrapper convention already used for `appEnv`/`apiUrl` — **VALIDATE confirmed** the real `env.ts` today is exactly `{ appEnv, apiUrl } as const` using the same `process.env.EXPO_PUBLIC_* ?? default` pattern, so this addition is a drop-in match). `apps/mobile/.env.example` gains the corresponding `EXPO_PUBLIC_ONLINE_PAYMENT_ENABLED=false` line (not read directly by the agent this session due to the privacy-block hook on `.env.example` files — EXECUTE must append this line following the existing file's format, matching the `EXPO_PUBLIC_*` naming pattern already documented in `all-context.md` §Environment and Configuration).

### A4. Payment-method selector: new shared component
`packages/ui/src/components/payment-method-selector.tsx` — a small segmented/radio control taking `{ value: PaymentMethod; onChange; onlinePaymentEnabled: boolean; mode }`. When `onlinePaymentEnabled` is false, "Online payment" renders disabled/hidden per CART-002 ("only shown/enabled if flag is on") — chosen behavior: **render but disabled** (not hidden) so users understand the option exists but isn't available yet, consistent with typical checkout UX; "Pay at pickup" is always selected/enabled and pre-selected by default. Built strictly against `packages/ui/src/theme.ts` tokens (no raw hex/px — `check-raw-tokens.mjs` must stay green — **VALIDATE confirmed** the script only scans `packages/ui/src/components/*.tsx` for raw hex literals; it is exactly this new component's file location, so the gate applies automatically with no wiring changes needed). Exported from `packages/ui/src/index.ts`.

### A5. Screen implementation: replace both placeholder bodies
- `apps/mobile/src/app/(tabs)/order/checkout.tsx`: replace `<ComingSoon>` body with the real screen. Remove the "Dev: Place Order" hardcoded-`orderId` link (superseded by real navigation using the real generated order number).
- `apps/mobile/src/app/(tabs)/order/confirmation/[orderId].tsx`: replace `<ComingSoon>` body with the real confirmation screen. Keep the existing "Dev: Track Order" link as-is (pre-existing, out of scope — tracking screen itself is untouched).
No `_layout.tsx` / Stack changes — both routes and their titles are already registered.

### A6. Floating tab bar / safe-area handling
Both checkout and confirmation are pushed screens under the Order stack with `headerShown: true` (native header), unlike the tab-root cart screen. Per research: nested pushed screens get the native header and are NOT directly framed by the floating tab bar the way tab-root screens are. Match the `isNestedScreen` `<ComingSoon>` convention already used by both placeholders (they pass `isNestedScreen`) — confirm the equivalent safe-area/edges behavior is preserved in the real screens (do not blindly copy cart.tsx's `edges={[]}` + footer-clearance pattern, which is tab-root-specific; verify against how other nested screens in the repo handle safe areas, e.g. `product/[productId].tsx`, before finalizing screen styles in EXECUTE).

---

## Public Contracts

### `packages/types/src/order.ts` — REPLACED (see D-B for full shape)
Exports: `OrderStatus`, `PaymentMethod`, `PaymentStatus`, `OrderItemOption`, `OrderItem`, `Order`, `PlaceOrderRequest`, `PlaceOrderResult`. Re-exported via `packages/types/src/index.ts` (`export * from './order'` already present — no index change needed).

### `apps/mobile/src/features/order/hooks/use-order.ts` — new state seam
```ts
export interface OrderSessionState {
  placeOrder: (paymentMethod: PaymentMethod) => Promise<PlaceOrderResult>;
  isPlacingOrder: boolean;
  lastOrder: Order | null;
}
export function OrderSessionProvider({ children }): JSX.Element
export function useOrder(): OrderSessionState   // throws outside provider
```
Doc-comment must state (matching `use-cart.ts`'s convention): in-memory only, contract-shaped to mirror the eventual `POST /api/orders`; swapping to the real backend changes only this file's internals, not `PlaceOrderRequest`/`PlaceOrderResult`/`Order` (those are already backend-shaped) nor any screen consumer.

### `apps/mobile/src/features/order/mock-order.ts` — new mock data + pure functions
```ts
export function generateOrderNumber(): string;
export function validatePlaceOrderRequest(
  req: PlaceOrderRequest,
  branchAvailable: boolean,
  unavailableProductIds: string[],
): { ok: true } | { ok: false; reason: 'branch_unavailable' } | { ok: false; reason: 'item_unavailable'; unavailableLineIds: string[] };
export function buildOrderFromRequest(
  req: PlaceOrderRequest,
  orderNumber: string,
  estimatedReadyAt: string,
): Order; // VALIDATE addition (D-C) — pure, unit-testable without RN rendering
export let __devSimulateNetworkFailure: boolean; // dev-only mutable flag, __DEV__ gated
```

### `packages/ui/src/components/payment-method-selector.tsx` — new component
```ts
export interface PaymentMethodSelectorProps {
  value: PaymentMethod;
  onChange: (v: PaymentMethod) => void;
  onlinePaymentEnabled: boolean;
  mode?: 'light' | 'dark';
}
export function PaymentMethodSelector(props: PaymentMethodSelectorProps): JSX.Element;
```

---

## Touchpoints

| Path | Action | Notes |
|---|---|---|
| `packages/types/src/order.ts` | **replace** | Full contract shape per D-B — breaking change; real downstream consumers identified and fixed (see next 2 rows) |
| `packages/ui/src/components/order-status-badge.tsx` | **edit (VALIDATE addition)** | Update `STATUS_META: Record<OrderStatus,...>` to the new 7-value enum — real breaking-change consumer found in VALIDATE |
| `packages/ui/src/components/order-status-timeline.tsx` | **edit (VALIDATE addition)** | Update `STATUS_SEQUENCE`/`STATUS_LABEL` to the new 7-value enum — real breaking-change consumer found in VALIDATE |
| `apps/mobile/src/features/order/hooks/use-order.ts` | **new** | `OrderSessionProvider`/`useOrder()` (A1) |
| `apps/mobile/src/features/order/mock-order.ts` | **new** | `generateOrderNumber`, `validatePlaceOrderRequest`, `buildOrderFromRequest` (VALIDATE addition), dev-flag state (D-C/D-D) |
| `apps/mobile/src/features/order/__tests__/mock-order.test.ts` | **new (VALIDATE addition)** | Unit tests for the 3 pure functions above — see Test Gates |
| `apps/mobile/package.json` | **edit (VALIDATE addition)** | Add `vitest` devDependency + `"test": "vitest run"` script — no test runner currently exists for `apps/mobile` |
| `apps/mobile/vitest.config.ts` | **new (VALIDATE addition)** | Mirrors `packages/api/vitest.config.ts` (`environment: 'node'`, `include: ['src/**/__tests__/**/*.test.ts']`) — scoped to pure-TS files only, no RN rendering |
| `apps/mobile/src/app/_layout.tsx` | **edit** | Mount `OrderSessionProvider` inside `CartSessionProvider` (A2) |
| `apps/mobile/src/config/env.ts` | **edit** | Add `onlinePaymentEnabled` (A3) |
| `apps/mobile/.env.example` | **edit** | Add `EXPO_PUBLIC_ONLINE_PAYMENT_ENABLED=false` (A3) — EXECUTE must read/edit this file directly; not read during PLAN due to privacy-block hook |
| `packages/ui/src/components/payment-method-selector.tsx` | **new** | Segmented control (A4) |
| `packages/ui/src/index.ts` | **edit** | Export `PaymentMethodSelector` |
| `apps/mobile/src/app/(tabs)/order/checkout.tsx` | **edit** | Replace `<ComingSoon>` body with real Checkout screen (A5) |
| `apps/mobile/src/app/(tabs)/order/confirmation/[orderId].tsx` | **edit** | Replace `<ComingSoon>` body with real Order Confirmation screen (A5) |
| `packages/types/src/index.ts` | **none** | Already re-exports `./order` — no change needed |
| `process/features/ordering-cart/backlog/checkout-real-order-api_NOTE_13-07-26.md` | **new** | Backlog stub for the real `POST /api/orders` endpoint follow-up (§Backlog Stub) |

---

## Blast Radius

- **Direct:** `packages/types/src/order.ts` (replace); 2 existing `packages/ui` status components (`order-status-badge.tsx`, `order-status-timeline.tsx` — edit, breaking-change fix, VALIDATE addition); new `apps/mobile/src/features/order/` folder (incl. new `__tests__/mock-order.test.ts`); `apps/mobile/package.json` + new `apps/mobile/vitest.config.ts` (test infra, VALIDATE addition); `apps/mobile/src/app/_layout.tsx` (provider mount); `apps/mobile/src/config/env.ts` + `.env.example` (flag); new `packages/ui` component + index export; 2 screen files (checkout, confirmation).
- **Indirect (compile-time) — CORRECTED IN VALIDATE:** `confirmation/[orderId].tsx` only reads the string route param, not the `Order` type — confirmed safe by direct file read. The original plan's claim of "no other consumer" was **false** — `order-status-badge.tsx` and `order-status-timeline.tsx` both consume `OrderStatus` in exhaustive `Record`/array literals keyed to the old enum values and would fail `pnpm typecheck` without the fix now in Touchpoints/Implementation Checklist. Both are further consumed by `apps/mobile/src/app/component-showcase.tsx` (import-only, no enum-keyed logic there — safe) and covered by existing jest tests (`order-status-badge.test.tsx`, `order-status-timeline.test.tsx`, both use `status="preparing"`/`"cancelled"` — literal values valid in both old and new enums, so the tests remain green post-fix with no test-file edits required). No other package imports `packages/types/src/order.ts` members beyond these two.
- **Risk class:** low. No auth/schema/migration/real-API/billing surface touched (this is explicitly a contract-shaped mock — real backend work is out of scope and stubbed to backlog). No changes to `packages/api`. No new runtime dependency (the VALIDATE-added `vitest` is a devDependency only, matching the existing `packages/api` pattern).
- **Explicitly NOT touched:** `packages/api` (backend/Express/Drizzle), `apps/mobile/src/app/(tabs)/order/_layout.tsx` (routes already registered), `apps/mobile/src/app/(tabs)/order/tracking/[orderId].tsx` (out of scope), CART-001's `useCart()` public contract (read-only consumer via composition, D-A), `apps/mobile/src/app/component-showcase.tsx` (import-only reference to the 2 status components, no logic change needed there).

---

## Implementation Checklist (EXECUTE order)

1. **Types:** replace `packages/types/src/order.ts` per Public Contracts (D-B). Typecheck `packages/types`.
2. **Fix real breaking-change consumers (VALIDATE addition):** update `packages/ui/src/components/order-status-badge.tsx`'s `STATUS_META` and `order-status-timeline.tsx`'s `STATUS_SEQUENCE`/`STATUS_LABEL` to the new 7-value `OrderStatus` enum (`pending accepted preparing flavoring ready completed cancelled`). Decide label/color for the 2 new statuses (`accepted`, `flavoring`); the old `confirmed`/`ready_for_pickup` keys semantically map to `accepted`/`ready` respectively — reuse their existing colors/labels for the renamed keys where sensible, pick new colors for `flavoring` from `packages/ui/src/theme.ts`'s existing palette (no new raw hex). Typecheck `packages/ui` clean. No test-file changes required (existing tests use surviving literal values `"preparing"`/`"cancelled"`) — re-run `pnpm --filter @jojopotato/ui test` to confirm still green.
3. **Env flag:** add `onlinePaymentEnabled` to `apps/mobile/src/config/env.ts` (A3); append `EXPO_PUBLIC_ONLINE_PAYMENT_ENABLED=false` to `apps/mobile/.env.example`.
4. **Test infra (VALIDATE addition):** add `vitest` to `apps/mobile` — devDependency + `"test": "vitest run"` script in `apps/mobile/package.json`; new `apps/mobile/vitest.config.ts` mirroring `packages/api/vitest.config.ts` exactly (`environment: 'node'`, `include: ['src/**/__tests__/**/*.test.ts']`). This runner is scoped to pure-TS files only — it does not attempt RN component rendering, so no `jest-expo`-style transform config is needed.
5. **Mock/seam logic:** create `apps/mobile/src/features/order/mock-order.ts` — `generateOrderNumber()`, `validatePlaceOrderRequest()`, `buildOrderFromRequest()` (VALIDATE addition, D-C — all 3 pure, unit-testable per D-C), dev-only `__devSimulateNetworkFailure` flag and any mock branch/product-unavailability toggles needed to drive AC4/AC5 (reuse `MOCK_CART_BRANCH`/`MOCK_OTHER_BRANCH` from `@/features/cart/mock-cart` where possible instead of duplicating branch data). Write `apps/mobile/src/features/order/__tests__/mock-order.test.ts` covering: `generateOrderNumber()` regex shape, `validatePlaceOrderRequest()`'s 3 branches (ok / branch_unavailable / item_unavailable), `buildOrderFromRequest()`'s field mapping from `PlaceOrderRequest` → `Order`/`OrderItem[]` (price-at-time-of-order snapshot fields match input, not any live/mutated state).
6. **State seam:** create `apps/mobile/src/features/order/hooks/use-order.ts` (A1) — `OrderSessionProvider`/`useOrder()`, calling `useCart()` internally to snapshot items, delegating validation/build to the pure functions in step 5, and `clearCart()` on success only, never on failure (AC4/AC5/AC6).
7. **Mount:** wire `OrderSessionProvider` into `apps/mobile/src/app/_layout.tsx` inside `CartSessionProvider` (A2).
8. **UI — payment selector:** build `packages/ui/src/components/payment-method-selector.tsx` (A4) against `theme.ts` tokens only; export from `packages/ui/src/index.ts`.
9. **Checkout screen:** replace `checkout.tsx` body — branch/items/discounts/total confirmation (reuse `<BranchCard>`, `<CartItem>` read-only rows or a summary list, `<CartSummary>` from CART-001), estimated pickup time (D-E, reused from `mock-cart.ts`), `<PaymentMethodSelector>` gated by `env.onlinePaymentEnabled`, a "Place Order" `<Button>` calling `useOrder().placeOrder(selectedMethod)`, loading state (`isPlacingOrder`), and error handling per result branch (branch_unavailable / item_unavailable / network) with the exact user-facing messaging CART-002 specifies ("clear recoverable error, cart is NOT cleared"). Add `__DEV__`-only affordances to trigger each of the 3 edge cases live (mirrors CART-001's dev-link convention).
10. **Confirmation screen:** replace `confirmation/[orderId].tsx` body — read the placed order (via `useOrder().lastOrder`, falling back to the `orderId` route param for direct-link resilience), show order number, branch, items, total, estimated pickup time, and payment method.
11. **Success wiring:** on `placeOrder()` success, navigate to `confirmation/[orderId]` using the real generated `order.orderNumber` (or `order.id`) as the `orderId` param — verify the cart is empty (`useCart().cart.items.length === 0`) after navigation.
12. **Backlog stub:** write `process/features/ordering-cart/backlog/checkout-real-order-api_NOTE_13-07-26.md` documenting the deferred real `POST /api/orders` endpoint (Express route + Drizzle insert + mobile HTTP client swap-in point).
13. **Verification:** run §Verification Evidence gates for every AC.

---

## Verification Evidence

(Acceptance Criteria → Verification Evidence mapping)

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Unit test: `validatePlaceOrderRequest()` returns `{ok:true}` for a normal request; `{ok:false, reason:'branch_unavailable'}` when branch flag is off; `{ok:false, reason:'item_unavailable', unavailableLineIds}` when a line's product is unavailable — `pnpm --filter @jojopotato/mobile test` | Fully-Automated | AC4 (proven by branch_unavailable path), AC5 (proven by item_unavailable path) |
| Unit test: `generateOrderNumber()` matches `/^JP-[A-Z0-9]{6}$/` — `pnpm --filter @jojopotato/mobile test` | Fully-Automated | AC3 (order-number generation, supports display) |
| Unit test: `buildOrderFromRequest()` builds an `Order`/`OrderItem[]` object whose `productNameSnapshot`/`unitPriceCents` match the cart items passed in (price-at-time-of-order, not live) — `pnpm --filter @jojopotato/mobile test` (VALIDATE corrected: was previously described as testing `useOrder().placeOrder()` directly, which is a React hook and cannot run under a plain `vitest` node-environment runner without RN rendering support; the object-building logic is now a pure function per D-C, making this genuinely Fully-Automated) | AC2 |
| Regression: `pnpm --filter @jojopotato/ui test` stays green after the `OrderStatus` enum-key fix (step 2) | Fully-Automated | Non-regression for `OrderStatusBadge`/`OrderStatusTimeline` (breaking-change fix verification) |
| Agent-probe: with `EXPO_PUBLIC_ONLINE_PAYMENT_ENABLED` unset (default false), walk through checkout — confirm only "Pay at pickup" is selectable, place an order end-to-end, land on confirmation with a real order number, cart is empty afterward | Agent-Probe | AC1, AC3 |
| Agent-probe: trigger the `__DEV__` branch-unavailable affordance, attempt checkout, confirm a clear blocking message is shown and cart item count is unchanged after the attempt | Agent-Probe | AC4 |
| Agent-probe: trigger the `__DEV__` item-unavailable affordance, attempt checkout, confirm the specific line is flagged and cart is preserved | Agent-Probe | AC5 |
| Agent-probe: trigger the `__DEV__` network-failure affordance, attempt checkout, confirm a retry-capable error is shown and cart is preserved (not cleared) | Agent-Probe | AC6 |
| `pnpm typecheck` clean across `packages/types`, `packages/ui`, `apps/mobile` (now including the `order-status-badge.tsx`/`order-status-timeline.tsx` fix) | Fully-Automated | Compile-safety for all ACs (prerequisite, not a behavior proof) |
| `pnpm lint` clean + `node packages/ui/scripts/check-raw-tokens.mjs` clean | Fully-Automated | UI token-compliance prerequisite for the new `PaymentMethodSelector` |
| `pnpm format:check` clean | Fully-Automated | Formatting gate — flagged explicitly per constraint (broke CI on CART-001) |

**Known-gap note (vacuous-green ban compliance):** every AC above has at least one Fully-Automated OR Agent-Probe gate — none rely solely on Known-Gap. AC6 (network failure) is proven via Agent-Probe only (no Fully-Automated unit test for the network branch specifically) — this is an accepted proving strategy per protocol (Agent-Probe is a valid tier, not a gap), not a blocker; a future improvement would be to make the `__devSimulateNetworkFailure` check itself a pure, unit-testable branch, but this is not required for CART-002 to pass. The only accepted known-gap is the absence of a project-wide RN E2E harness (pre-existing, documented in `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`); AC1/AC3/AC4/AC5/AC6 screen-level behavior is proven via Agent-Probe walkthroughs instead, keeping every gate CONDITIONAL-capable, never silently PASS-on-Known-Gap-alone.

---

## Phase Completion Rules
- A step is complete only when its typecheck/lint/format gates pass and (for UI steps) `check-raw-tokens.mjs` is green.
- Step 2 (breaking-change fix) is complete only when `pnpm --filter @jojopotato/ui typecheck` AND `pnpm --filter @jojopotato/ui test` both pass.
- Step 4 (test infra) is complete only when `pnpm --filter @jojopotato/mobile test` runs (even with zero test files yet — confirms the runner itself is wired correctly) before step 5 adds the actual test file.
- The checkout/confirmation screen steps are complete only when all Acceptance Criteria (AC1–AC6) are demonstrably met against mock data via the Agent-Probe walkthroughs in §Verification Evidence.
- Step 12 (backlog stub) must be written before the plan is considered fully executed — it is not optional cleanup.

---

## Test Infra Improvement Notes
**VALIDATE addition (13-07-26):** this plan introduces the first `apps/mobile` test runner (`vitest`, node-environment, pure-TS only — see Implementation Checklist step 4). This does not close the broader "no mobile-side RN test runner" gap tracked in `process/context/tests/all-tests.md` §Known Gaps (that gap is about RN *component* rendering coverage — `jest-expo`/Detox/Maestro — which this plan does not add); it only covers plain-TypeScript pure-function logic. Future plans introducing more `apps/mobile` business logic should reuse this same `vitest` config rather than re-deciding the runner question.

---

## Backlog Stub

Write `process/features/ordering-cart/backlog/checkout-real-order-api_NOTE_13-07-26.md` during EXECUTE step 12, documenting:
- The deferred real `POST /api/orders` Express route (auth-gated, writes `orders` + `order_items` via Drizzle in a transaction).
- The mobile HTTP client swap-in point: `useOrder()`'s internals are the ONLY file that changes — `PlaceOrderRequest`/`PlaceOrderResult`/`Order` types are already backend-shaped and require no change.
- Payment-gateway integration for `online_payment` (currently flag-gated off by default, UI-only stub when enabled).

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/ordering-cart/completed/checkout-flow_13-07-26/checkout-flow_PLAN_13-07-26.md` (COMPLETED — archived 13-07-26)
2. **Last completed phase or step:** VALIDATE complete — Gate: PASS (2 plan fixes applied, see Validate Contract below).
3. **Validate-contract status:** written (13-07-26) — see `## Validate Contract` below.
4. **Supporting context files loaded:** `process/context/all-context.md`; CART-001 plan (`cart-screen_PLAN_09-07-26.md`, pattern reference); `use-cart.ts`, `mock-cart.ts`, `cart.tsx` (seam pattern + reuse); `checkout.tsx`, `confirmation/[orderId].tsx`, `order/_layout.tsx`, `_layout.tsx` (route/mount targets, all read directly during VALIDATE); `packages/types/src/{cart,order,menu}.ts`; `packages/api/src/db/schema/{orders,order_items}.ts` (contract source of truth, read directly during VALIDATE); `packages/ui/src/index.ts`; `packages/ui/src/components/{order-status-badge,order-status-timeline}.tsx` (VALIDATE-discovered breaking-change consumers); `apps/mobile/src/config/env.ts`; `apps/mobile/package.json`, `packages/api/vitest.config.ts` (test-infra pattern source).
5. **Next step:** none — EXECUTE complete and the plan is archived in `completed/`. Retained for audit/resume history only; do not re-run VALIDATE or EXECUTE.

---

## Validate Contract

Status: PASS
Date: 13-07-26
date: 2026-07-13
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Score 1/7 (S7: 5+ files in blast radius — 12 direct touchpoints after VALIDATE additions). Single-plan, single-feature, no phase program, no multi-package coordination beyond the already-scoped `packages/types` → `packages/ui`/`apps/mobile` chain. A single vc-validate-agent pass covering all 4 Layer 1 dimensions + Layer 2 section review sequentially was sufficient; no independent directions requiring parallel fan-out.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC2 | `buildOrderFromRequest()` maps `PlaceOrderRequest` → `Order`/`OrderItem[]` with price-at-time-of-order snapshot fields | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (`mock-order.test.ts`) | B |
| AC3 | `generateOrderNumber()` matches `/^JP-[A-Z0-9]{6}$/` | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (`mock-order.test.ts`) | B |
| AC4 | `validatePlaceOrderRequest()` returns `branch_unavailable` when branch flag is off | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (`mock-order.test.ts`) | B |
| AC5 | `validatePlaceOrderRequest()` returns `item_unavailable` with correct line ids | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (`mock-order.test.ts`) | B |
| breaking-change | `OrderStatus` enum-key consumers (`order-status-badge.tsx`, `order-status-timeline.tsx`) stay compile-safe and test-green after the type replacement | Hybrid | `pnpm --filter @jojopotato/ui typecheck` + `pnpm --filter @jojopotato/ui test` (precondition: step 2 enum-key fix applied first) | B |
| AC1 | Payment selector shows only "Pay at pickup" selectable when flag is off; full checkout end-to-end | Agent-Probe | Manual walkthrough per Verification Evidence table | A |
| AC3 (display) | Confirmation screen shows the real generated order number, branch, items, total, pickup time, payment method | Agent-Probe | Manual walkthrough per Verification Evidence table | A |
| AC4 (screen) | Branch-unavailable dev affordance blocks checkout with clear message, cart preserved | Agent-Probe | Manual walkthrough per Verification Evidence table | A |
| AC5 (screen) | Item-unavailable dev affordance flags the specific line, cart preserved | Agent-Probe | Manual walkthrough per Verification Evidence table | A |
| AC6 | Network-failure dev affordance shows retry-capable error, cart preserved (not cleared) | Agent-Probe | Manual walkthrough per Verification Evidence table | A |
| compile-safety | `packages/types`, `packages/ui`, `apps/mobile` all typecheck clean | Fully-Automated | `pnpm typecheck` | A |
| lint/format/tokens | Lint, format, and raw-hex-token gates clean | Fully-Automated | `pnpm lint` && `pnpm format:check` && `node packages/ui/scripts/check-raw-tokens.mjs` | A |
| e2e-navigation | Full RN E2E/regression harness across screens | Known-Gap | — (pre-existing project-wide gap) | C — deferred, see `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md` |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist — VALIDATE-added steps 2, 4, 5)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form (retained so existing validate-contract consumers still parse):
- Seam pure-function logic (`generateOrderNumber`, `validatePlaceOrderRequest`, `buildOrderFromRequest`): Fully-automated: `pnpm --filter @jojopotato/mobile test`
- Breaking-change fix regression (`order-status-badge.tsx`/`order-status-timeline.tsx`): Hybrid: `pnpm --filter @jojopotato/ui typecheck` + `pnpm --filter @jojopotato/ui test` — precondition: Implementation Checklist step 2 applied first
- Screen-level UX and all 3 failure-path flows (AC1, AC3 display, AC4, AC5, AC6): Agent-probe: manual walkthrough per Verification Evidence table, `__DEV__`-gated affordances
- Compile/lint/format/token gates: Fully-automated: `pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `node packages/ui/scripts/check-raw-tokens.mjs`
- Project-wide RN E2E/navigation regression harness: known-gap: documented as NEW PLAN REQUIRED — see `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md` (pre-existing, not introduced by this plan)

Dimension findings:
- Infra fit: PASS — routes pre-scaffolded, no `_layout.tsx` Stack changes needed; provider-nesting order (A2) verified against the real `apps/mobile/src/app/_layout.tsx` (today: `AuthProvider > CartSessionProvider > RootNavigator` — target insertion point is compile- and structure-compatible); `env.ts` flag pattern verified against the real file's existing `EXPO_PUBLIC_*` convention.
- Test coverage: CONCERN found, resolved via plan update — `apps/mobile` has zero test runner configured (confirmed by reading `apps/mobile/package.json`: no jest/vitest present) and the plan's original Verification Evidence table listed 3 "Unit test" Fully-Automated rows with no runner or command specified, and one row (AC2) tested a React hook (`useOrder().placeOrder()`) that cannot run under a plain non-RN runner. Fixed: added `vitest` (node environment, mirrors `packages/api/vitest.config.ts`) to `apps/mobile` (Implementation Checklist step 4) and extracted the order-building logic into a pure `buildOrderFromRequest()` function (D-C addition) so AC2 is genuinely unit-testable. Now PASS.
- Breaking changes: FAIL found, resolved via plan update — the plan's original claim "no current consumer other than the file's own export" for the `Order`/`OrderStatus` replacement was verified FALSE by direct grep + file read: `packages/ui/src/components/order-status-badge.tsx` and `order-status-timeline.tsx` both hardcode `Record<OrderStatus,...>`/array literals keyed to the OLD enum values (`confirmed`, `ready_for_pickup`), which do not exist in the new 7-value enum, and would fail `pnpm typecheck` immediately. Fixed: added both files to Touchpoints, added Implementation Checklist step 2 with exact fix instructions, added a Hybrid regression test gate. Now PASS.
- Security surface: PASS — no auth/identity, billing/credits, schema/migration, public API, deploy/container, or secret/trust-boundary surface touched. Confirmed low-risk per plan's own Blast Radius classification; `payment_method` enum values (`pay_at_branch`/`online_payment`) verified against the real Drizzle schema (`packages/api/src/db/schema/orders.ts`) and match exactly — no `pay_at_pickup` mismatch.
- Section — Design Sub-Decisions (D-A through D-E): PASS — mechanically feasible; D-B's breaking-change claim corrected (see Breaking changes above); D-C extended with the pure `buildOrderFromRequest()` function (see Test coverage above); D-D/D-E verified consistent with existing `mock-cart.ts` (`MOCK_BRANCH_PREP_MINUTES`) with no duplication.
- Section — Architecture Decisions (A1-A6): PASS — A2's provider-nesting code sample verified byte-for-byte compatible with the real `_layout.tsx`; A3's env-flag pattern verified against the real `env.ts`; A4's raw-token guardrail scope verified against the real `check-raw-tokens.mjs` script (scans exactly the target directory); A6's safe-area caution (verify against `product/[productId].tsx` before finalizing styles) is carried forward as an execute-agent instruction, not a blocker.
- Section — Implementation Checklist / Verification Evidence: PASS after VALIDATE additions (steps 2, 4, 5 updated; AC2 test-command corrected; every AC has at least one Fully-Automated or Agent-Probe gate, no AC relies solely on Known-Gap).

Open gaps: none blocking. One informational item carried forward (not a gap, not blocking): AC6 (network failure) is proven via Agent-Probe only, not a dedicated Fully-Automated unit test — acceptable per protocol (Agent-Probe is a valid proving strategy), noted in the Verification Evidence "Known-gap note" as a possible future improvement, not required for this plan's PASS.

What this coverage does NOT prove:
- `pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `check-raw-tokens.mjs`: prove compile-safety, static-analysis cleanliness, formatting consistency, and absence of raw hex literals — they do NOT prove runtime UI correctness, navigation behavior, or that the screens render without crashing on-device.
- `pnpm --filter @jojopotato/mobile test` (mock-order.test.ts): proves the 3 pure functions' logic in isolation — it does NOT prove `useOrder()`'s React state wiring (`isPlacingOrder`, `lastOrder`) behaves correctly, nor that `clearCart()` is actually invoked at the right time inside the hook (that composition is proven only by the Agent-Probe walkthroughs).
- `pnpm --filter @jojopotato/ui test` (existing order-status tests): proves the 2 fixed components render without throwing for the specific status values exercised (`"preparing"`, `"cancelled"`) — it does NOT prove every one of the 7 enum values renders correctly (no test exercises `"accepted"` or `"flavoring"` specifically), and does NOT prove `component-showcase.tsx`'s usage renders correctly (dev-only screen, not covered by any automated test).
- Agent-Probe walkthroughs (AC1, AC3 display, AC4, AC5, AC6): prove the described scenario was observed once by the executing agent on one platform/simulator run — they do NOT prove behavior across all platforms (iOS/Android/web), across repeated runs, under real network conditions, or under concurrent/interleaved user actions. They are a single-pass human/agent judgment call, not a regression-proof automated suite.
- No gate in this plan proves the real `POST /api/orders` backend integration, real Drizzle persistence, real payment-gateway behavior, or cross-session/cross-device order state — all explicitly out of scope per the LOCKED SCOPE decision and deferred to the backlog stub.
- No gate proves the pre-existing project-wide RN E2E/navigation-regression gap is closed — that Known-Gap is inherited from `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md` and is not this plan's responsibility to close.

Gate: PASS (no unresolved FAILs — the 1 real FAIL found (breaking change) and the 1 real CONCERN found (test coverage) were both fixed directly in the plan text during this VALIDATE pass; plan updated)
Accepted by: session (autonomous VALIDATE pass — no interactive user in this subagent context; both findings were concrete, evidence-based, and resolved by direct plan-text fixes rather than deferred as accepted gaps, so no CONDITIONAL acceptance was needed)

---

## Autonomous Goal Block

SESSION GOAL: Ship CART-002 checkout flow — Checkout screen + Order Confirmation screen against a contract-shaped in-memory `placeOrder()` seam mirroring the real `orders`/`order_items` Drizzle schema.
Charter + umbrella plan: N/A — single plan (no phase program; no umbrella plan with `## Stable Program Goal` exists for this work).
Autonomy: Standard RIPER-5 autonomy rules — CONDITIONAL findings apply-and-proceed, BLOCKED findings go to backlog + continue, irreversible/outward-facing actions without explicit contract instruction hard-stop. This VALIDATE pass ran autonomously (no interactive user) and resolved both findings via direct plan-text fixes rather than deferring — see Validate Contract "Accepted by" line.
Hard stop conditions / safety constraints:
- Do not add the real `POST /api/orders` Express route, Drizzle write, or mobile HTTP client in this task — explicitly out of scope (LOCKED SCOPE DECISION); write the backlog stub instead (Implementation Checklist step 12).
- Do not touch `packages/api`, `apps/mobile/src/app/(tabs)/order/_layout.tsx`, or `apps/mobile/src/app/(tabs)/order/tracking/[orderId].tsx` — explicitly out of scope.
- Do not skip Implementation Checklist steps 2 or 4 (VALIDATE-added breaking-change fix and test-infra setup) — both are required for `pnpm typecheck` to stay green.
- Do not clear the cart on any `placeOrder()` failure branch (`branch_unavailable` / `item_unavailable` / `network`) — only on `{ok:true}`.
Next phase: EXECUTE — `process/features/ordering-cart/active/checkout-flow_13-07-26/checkout-flow_PLAN_13-07-26.md`
Validate contract: inline in plan (see `## Validate Contract` above)
Execute start: `pnpm typecheck` (baseline, before any edits) → Implementation Checklist steps 1-13 in order → `pnpm typecheck && pnpm lint && pnpm format:check && node packages/ui/scripts/check-raw-tokens.mjs && pnpm --filter @jojopotato/mobile test && pnpm --filter @jojopotato/ui test` (full gate re-run) | Agent-Probe walkthroughs per Verification Evidence | high-risk pack: no (risk class: low, no high-risk surface touched)
