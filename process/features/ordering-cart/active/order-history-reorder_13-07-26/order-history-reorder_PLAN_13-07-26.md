# Order History + Reorder (HIST-001 / HIST-002) — Implementation Plan

**Feature:** ordering-cart
**Issues:** [HIST-001] [P1] Order history list (#20), [HIST-002] [P1] Reorder flow with availability and price re-check (#21)
**Milestone:** Phase 1: Customer App Core
**Date**: 2026-07-13
**Status**: Planning complete — VALIDATED (13-07-26, Gate: PASS). See §Validate Contract. EXECUTE-ready pending explicit "ENTER EXECUTE MODE".
**Complexity**: COMPLEX (2 screens + 1 conflict-resolution flow + domain-type extensions + new mock re-pricing/availability simulation + 1-2 new UI components), same complexity class as CART-001.
**Context**: see `process/context/all-context.md` (repo router)
**Author:** vc-plan-agent, 2026-07-13 (research supplied by orchestrator — see prompt); validated by vc-validate-agent (13-07-26)
**Explicit scope for this pass (user-directed):** SCREENS ONLY, MOCK DATA ONLY. `packages/api` and any DB/backend work are OUT OF SCOPE. A later ticket wires real backend reads once order-history/availability APIs exist.

---

## Overview (Context and Goals)

### Goal
Deliver two screens against mock data:
1. **Order History (HIST-001)** — replace the `order/history.tsx` placeholder with a real list of the signed-in user's past orders: date, branch, items, total, status, stars earned, Reorder button; sorted newest-first; cancelled orders show `cancelled` + 0 stars; empty state for zero orders.
2. **Reorder flow (HIST-002)** — tapping Reorder on a past order reconstructs a cart (multi-option items: size/flavor/add-ons, not just base product) against CURRENT mock pricing/availability, flags now-unavailable items before checkout, and never silently drops an item without telling the user.

### Current reality (from prior research — see prompt "Research already gathered")
- `apps/mobile/src/app/(tabs)/order/history.tsx` already exists, is already registered in `order/_layout.tsx` (`Stack.Screen name="history"`), and is already linked from both the Account tab and `order/index.tsx`. **HIST-001 replaces the placeholder body only — zero nav/routing changes for the list screen.**
- No reorder route exists yet — HIST-002 needs a **new** route for the unavailable-item conflict UI (see A2 below for the chosen shape).
- `packages/types/src/order.ts` (`Order`) and `packages/types/src/cart.ts` (`Cart`/`CartItem`) are the CART-001-era shapes (see those files, unchanged since 09-07-26). `Order` is missing everything HIST-001/002 need: `branch`, a stable sort key, `starsEarned`, and a `userId` for the mock-scoping simulation.
- Cart mutation seam is `apps/mobile/src/features/cart/hooks/use-cart.ts` (`CartSessionProvider`/`useCart()`) — `addItem(menuItem, opts, qty)` already does exactly what reorder needs per line (re-derives `unitPriceCents` from the **current** `MenuItem`, never reuses a stale snapshot — confirmed by direct source read, 13-07-26: `unitPriceFor(menuItem, opts)` sums `menuItem.priceCents` + option deltas at call time). Reorder drives the cart through this hook, not a parallel population path (A3).
- Mock-data convention: `apps/mobile/src/features/{feature}/mock-{feature}.ts` (see `features/cart/mock-cart.ts`, `features/home/mock-home.ts`). This plan adds `apps/mobile/src/features/order-history/mock-order-history.ts`.
- `@jojopotato/ui` reuse candidates: `Card`, `Badge`, `Button`, `OrderStatusBadge` (exact `OrderStatus` union → label/color pill), `EmptyState`. No existing component displays "stars earned" as a flat per-order number — `StarProgressBar` is shaped for `RewardsTierProgress` (current/next-tier progress), not a per-order star count, so it is **not** a fit (see §UI Reuse Map Gap 1). **Confirmed (13-07-26, VALIDATE):** all five are real exports from `packages/ui/src/index.ts`.

### PRD source (verbatim, §6.11)
"Order history should show: Order date, Branch, Items ordered, Total, Order status, Stars earned, Reorder button. Acceptance Criteria: User can view past orders. User can reorder a completed order. Reorder checks current product availability and pricing. Unavailable items are flagged before checkout."

### Scope boundary
- **In scope:** Order History screen (list, sort, empty state), `Order`/mock-order-history type + data extensions, Reorder trigger + cart-reconstruction logic, current-availability/current-pricing re-check against mock catalog, a conflict-resolution screen/step for unavailable items, 1 new `@jojopotato/ui` component (order-history row/card), reuse of existing `useCart()` for population.
- **Out of scope (explicit, this pass):** `packages/api`, any DB schema/seed, real multi-user backend, real payment/checkout logic beyond arriving at the (already-placeholder) Cart/Checkout screens, push/live order-status updates, real stars/rewards accounting engine (a flat/derived mock value is used — D5).

---

## Decisions Required (issue/PRD gaps — proposed defaults, accepted for this pass)

The issues and PRD §6.11 leave several implementation-shape questions open. Per the user's explicit "move fast, screens-only" scope, each gets a reasonable default below, accepted-for-this-pass and revisable later — none of these block EXECUTE.

| ID | Question | Accepted default (13-07-26) |
|---|---|---|
| **D1** | Can a non-completed order (pending/confirmed/preparing/ready_for_pickup) be reordered, or only `completed`/`cancelled`? HIST-002 AC only says "reorder a completed order." | **Reorder is available on `completed` and `cancelled` orders only.** In-progress orders (pending/confirmed/preparing/ready_for_pickup) do not show a Reorder button — reordering an order that's still being fulfilled is not a meaningful action. This directly satisfies the literal AC ("reorder a completed order") while also covering the natural "reorder something I cancelled" case, which the issue doesn't forbid. |
| **D2** | What happens to per-line `notes` (e.g. "no ice", "extra spicy") on reorder? | **Notes are carried over verbatim** into the reconstructed cart line — they are not price/availability-bearing so no re-check applies to them. |
| **D3** | Does Reorder auto-navigate to the Cart screen after populating, or show an intermediate screen first? | **Conditional:** if ALL items in the past order are currently available, populate the cart via `useCart()` and navigate straight to `/(tabs)/order/cart` (existing screen) — no extra screen for the happy path. If ANY item is now unavailable, navigate to a **new** `Reorder Review` screen (`order/reorder/[orderId].tsx`) that lists every line with its resolution state (available @ current price / unavailable — needs re-selection) and only proceeds to Cart once the user has acknowledged/resolved every conflict (see A2). |
| **D4** | How is "current availability" simulated with mock data? | **Deterministic rule, not random:** current availability/pricing is read live from `MOCK_PRODUCTS` (`features/home/mock-home.ts`) by `menuItemId`. A menu item is "unavailable" for reorder if `MOCK_PRODUCTS.find(p => p.id === menuItemId)` is either **not found** (discontinued) or found with `isAvailable === false`. Current price is `MenuItem.priceCents` (+ live option deltas) at re-check time — this is what proves "not the historical snapshot" per HIST-002 AC1. The mock order-history dataset is deliberately authored so **at least one order's line references a product with `isAvailable:false`** (`nuggets-classic`, already `isAvailable:false` in `MOCK_PRODUCTS`) and **at least one order has a historical `unitPriceCents` that differs from the product's current `priceCents`** (to prove re-pricing, not just availability). **Confirmed (13-07-26, VALIDATE):** `MOCK_PRODUCTS` in `mock-home.ts` has exactly one entry with `id: 'nuggets-classic'`, `isAvailable: false` — matches the plan's claim exactly. |
| **D5** | Where does "stars earned" come from for a mock order? | **Flat mock value stored per order in the mock dataset** (`starsEarned: number`), not a derived formula — a real stars/rewards formula is future backend work. Cancelled orders are always seeded with `starsEarned: 0` (matches AC), enforced by a lint-style invariant check on the mock dataset (see Test Infra Improvement Notes / T-Agent-Probe below) rather than computed at render time, so the UI simply renders the stored value verbatim (no conditional star-hiding logic needed in the component). |
| **D6** | How does the mock multi-user scoping requirement ("no cross-user leakage") get expressed with only one real signed-in mock user? | **CORRECTED (13-07-26, VALIDATE — see Dimension findings § below):** `MOCK_CURRENT_USER_ID` is **unconditionally the hardcoded literal `'mock-user'`** (matching `MOCK_REWARDS.userId` in `mock-home.ts`) — it does **NOT** branch on `useAuth().user?.id`. The screen filters `MOCK_ORDER_HISTORY` by `order.userId === MOCK_CURRENT_USER_ID` (the constant), never by the live auth session id. Rationale: `apps/mobile/src/features/auth/lib/dev-auto-login.ts` mints a **real** better-auth session for a fixed dev **email** (`dev@jojopotato.local` or `DEV_LOGIN_EMAIL`), but better-auth auto-creates that user on first use and assigns it a real DB-generated id — which will never equal the literal string `'mock-user'` and is not guaranteed stable across a dev-DB reset. The plan's original wording ("reads `useAuth().user?.id` ... or a fallback mock id") would silently produce **zero matching orders** in the common case (a real, non-`'mock-user'` session id), masquerading as the empty-state (AC5) and breaking AC1 without any visible error. There is no existing precedent for filtering mock data by the live auth id either — the Home tab renders `MOCK_REWARDS` unconditionally, with no `useAuth()`-based filter at all (confirmed by grep, 13-07-26). Using a hardcoded constant is consistent with that precedent and with this pass's "mock data only" scope. `MOCK_ORDER_HISTORY` still includes ≥1 order for a different mock `userId` to prove the filtering logic actually excludes it. |
| **D7** | Multi-option reconstruction — does reorder need a live "re-select options" UI, or can it auto-carry forward the historical option selections when the underlying option ids are still valid? | **Auto-carry-forward when valid.** Each historical `CartItemOption` (size/flavor/add-on) is re-added as-is (id, name, `optionType`) via `useCart().addItem(currentMenuItem, historicalOptions, qty)` — `addItem` recomputes `unitPriceCents` from the **current** `MenuItem.priceCents` + the carried-forward option `priceDeltaCents`. Option-level unavailability/price-drift (e.g. a specific flavor no longer offered) is **out of scope for this pass** — only whole-item availability is re-checked (D4). This is a scoped, documented simplification, not silent drop: it is called out in Known Gaps. |
| **D8** | Does an unavailable item ever get silently excluded, or always surfaced? | **Never silently excluded.** The Reorder Review screen (A2) always lists every original line, tagged `available` or `needs re-selection`. The user can either (a) proceed with only the available items added to cart (the unavailable ones are explicitly NOT added, and the screen states this before the user proceeds) or (b) go back and edit the order in Order History without reordering. This satisfies HIST-002's "never silently drops... without informing the user" AC. |

---

## Architecture Decisions

### A1. Screen 1 — Order History: replace the existing placeholder in place
Edit `apps/mobile/src/app/(tabs)/order/history.tsx`. No `_layout.tsx` / route changes — `Stack.Screen name="history"` is already registered with `title: 'Order History'`.

### A2. Screen 2 — Reorder Review: new route, conditional entry (D3)
New file `apps/mobile/src/app/(tabs)/order/reorder/[orderId].tsx`, a new nested Stack screen registered in `order/_layout.tsx`. Rationale for a **dedicated** screen over reusing the Cart screen with a "pre-population mode" prop: the Cart screen (CART-001) has no concept of "conflict rows needing resolution" and mixing that state into `useCart()`/the Cart UI would expand CART-001's already-locked contract for a HIST-002-only concern. A small, purpose-built review screen keeps the two features' blast radii disjoint and matches the "never silently drop" requirement with an explicit, dedicated UI moment. The happy path (all items available) skips this screen entirely (D3) and goes straight to the existing Cart screen — so this new screen only exists for the flagged case, keeping it low-traffic and low-risk. **Confirmed (13-07-26, VALIDATE):** `order/_layout.tsx`'s existing dynamic-route entries (`product/[productId]`, `tracking/[orderId]`) are registered the same way (`<Stack.Screen name="..." options={{ title: ... }} />`) — `reorder/[orderId]` follows the identical, already-established convention.

### A3. Reorder execution: drive the existing `useCart()` seam, do not invent a new cart-population path
`buildReorderLines(order, currentCatalog)` (a plain function, not a hook) walks `order.cart.items`, looks up each `menuItemId` in `MOCK_PRODUCTS` (D4), and returns a `{ available: ReorderLine[]; unavailable: ReorderLine[] }` split. For every `available` line, the caller (screen) invokes `useCart().addItem(currentMenuItem, historicalOptions, quantity)` — this is the **existing** CART-001 hook, unmodified. No new cart-state seam is created. `useCart().setBranch(order.branchId)` is called first if the cart is currently empty or already scoped to that branch (single-branch rule, inherited from CART-001 A7) — if the cart has items from a *different* branch already, the existing CART-001 mixed-branch confirm flow fires unmodified (no new logic needed here; reorder is just another `addItem` caller).

### A4. Data model: extend `Order`, do not touch `Cart`/`CartItem` (already sufficient)
`Order.cart` (existing `Cart` type) already stores `CartItem[]` with `selectedOptions`, `unitPriceCents` (historical snapshot), and `productNameSnapshot` — this is exactly the multi-option historical record HIST-002 needs to reconstruct from (D7). Only `Order` itself needs new fields: `branchId`, `placedAt` (explicit sort key, replacing/aliasing `createdAt` — see Public Contracts), `starsEarned`, `userId`. This mirrors CART-001's "extend the type, don't rebuild the shape" approach (A5 in the cart-screen plan).

### A5. Mock data: one dataset, one derived-availability function — no network/async
`apps/mobile/src/features/order-history/mock-order-history.ts` exports `MOCK_ORDER_HISTORY: Order[]` (typed against the extended `Order`) and `MOCK_CURRENT_USER_ID` — **CORRECTED (13-07-26, VALIDATE):** unconditionally the hardcoded literal `'mock-user'` constant (matching `MOCK_REWARDS.userId` in `mock-home.ts`, confirmed identical value). The screen does **not** attempt to read a live/dev-session auth id for this filter — see D6 for the full rationale (the previous "try `useAuth().user?.id`, fall back to mock" design would silently break AC1 because the real dev-session id is never literally `'mock-user'`). Availability/pricing re-check reads directly from `MOCK_PRODUCTS` (`features/home/mock-home.ts`) — no separate "current catalog" mock is introduced; `MOCK_PRODUCTS` already has the `isAvailable` field HIST-002 needs (D4) and is the established single source of truth for menu data.

### A6. Component split
- **`OrderHistoryCard`** (new, `packages/ui`) — one row per order: date, branch name, item summary line, total, `OrderStatusBadge`, stars-earned row, Reorder `Button` (conditionally rendered per D1). Composed from `Card` + `Badge`/`OrderStatusBadge` + `Button`, Ionicons star glyph for stars-earned (same pattern `EmptyState` already uses for its icon — direct Ionicons use inside a themed component is the established building-block convention, not "inline screen markup").
- **Reorder Review row** — reuses the existing `CartItem` component in a read-only/annotated mode is NOT proposed (its prop surface is stepper-oriented, wrong shape for "available vs needs re-selection" state). Instead the Reorder Review screen composes `Card` + `Badge` (for the "needs re-selection" flag) + plain themed text rows per line — no new shared component needed for this (low reuse likelihood outside this one screen); if a pattern for "flagged list row" recurs elsewhere later, promote it then (YAGNI).

---

## UI Reuse Map

**Direct-fit existing `@jojopotato/ui` components (use as-is):**
- `Card` — themed surface, both screens
- `Badge` — status/flag labels
- `Button` — Reorder CTA, "Continue to Cart", "Go Back" actions
- `OrderStatusBadge` — exact `OrderStatus` union → color pill, used as-is on each history row
- `EmptyState` — zero-orders state on Order History (icon + title + optional CTA to Order tab)

**UI Gaps — 1 new component:**
1. **`OrderHistoryCard`** (new, `packages/ui/src/components/order-history-card.tsx`) — no existing component renders an order-history row (date + branch + items summary + total + status + stars + Reorder). Built via the UI/UX Workflow (below), composed from `Card`/`Badge`/`OrderStatusBadge`/`Button` + themed text, following the same "compose from primitives, no raw hex/px" rule as `CartSummary`/`EmptyState` in CART-001.

**Not reused / explicitly rejected:**
- `StarProgressBar` — shaped for `RewardsTierProgress` (current/next-tier), not a flat per-order star count (see D5). Not a fit; do not force it.
- `CartItem` — stepper-oriented prop surface, wrong shape for the Reorder Review's read-only/flagged rows (see A6).

All UI work traces theme tokens to `packages/ui/src/theme.ts` (no new hexes/px — enforced by `packages/ui/scripts/check-raw-tokens.mjs`), same constraint as CART-001.

### UI/UX Workflow (MANDATORY — applies to `OrderHistoryCard` and both screen compositions)
Mirrors the CART-001 precedent exactly:
1. **Plan/design with `ui-ux-pro-max`** for: the Order History screen layout + list states (empty / 1 order / many orders / mixed statuses), the `OrderHistoryCard` composition (including the stars-earned row and the conditional Reorder button), and the Reorder Review screen (conflict list, resolution actions, proceed/back CTAs) — all expressed against existing `theme.ts` tokens only, no new hexes/px.
2. **Audit with `impeccable`** — visual hierarchy, accessibility (touch targets, screen-reader labels for status/stars/Reorder), empty/error states, theme-token compliance, light+dark parity.
Order is fixed: `ui-ux-pro-max` → `impeccable` → implement. Log both invocations per UI step in the EXECUTE phase report.

---

## Public Contracts

### `packages/types/src/order.ts` — extended (additive; `createdAt` retained for back-compat, `placedAt` is the new explicit sort key)
```ts
export type OrderStatus =
  'pending' | 'confirmed' | 'preparing' | 'ready_for_pickup' | 'completed' | 'cancelled';

export interface Order {
  id: string;
  userId: string;          // NEW — mock multi-user scoping (D6)
  cart: Cart;               // existing — historical snapshot (name/price/options at order time)
  branchId: string;         // NEW — HIST-001 "Branch" column; also drives A3 single-branch reorder check
  status: OrderStatus;      // existing
  totalCents: number;       // existing
  starsEarned: number;      // NEW — flat mock value (D5); 0 for cancelled orders (enforced by dataset invariant)
  placedAt: string;         // NEW — ISO 8601; explicit sort key (issue's `placed_at`), newest-first
  createdAt: string;        // existing — retained for back-compat; NOT used as the sort key going forward
}
```
⚠ This is a required-field-additive change (mirrors CART-001's `CartItem` extension pattern) — any existing `Order`-typed fixture/consumer must add the 4 new fields or fail to typecheck. **Grep re-confirmed at VALIDATE (13-07-26):** searched every `import ... from '@jojopotato/types'` across `apps/mobile/src` (11 import sites) and every `\bOrder\b` occurrence across `packages/` — zero files import the `Order` type; the only other matches are the string `"Order ahead..."` in `theme.ts`'s tagline and `"Order now"` in a button test label (both unrelated string literals, not the type). This extension is genuinely greenfield — no fixture-update step is needed (contrast with CART-001, which had 2 existing consumers to fix).

### `apps/mobile/src/features/order-history/mock-order-history.ts` — new
```ts
export const MOCK_CURRENT_USER_ID: string;          // hardcoded literal 'mock-user' (D6/A5 — NOT derived from useAuth())
export const MOCK_ORDER_HISTORY: Order[];             // includes ≥1 order for a DIFFERENT userId (D6 proof),
                                                         // ≥1 cancelled order (starsEarned: 0),
                                                         // ≥1 order referencing 'nuggets-classic' (isAvailable:false, D4),
                                                         // ≥1 order with a historical unitPriceCents that differs
                                                         //   from that product's current MOCK_PRODUCTS priceCents (D4)
```

### `apps/mobile/src/features/order-history/reorder.ts` — new, plain functions (no new hook/state seam)
```ts
export interface ReorderLine {
  originalItem: CartItem;        // the historical snapshot line
  currentMenuItem?: MenuItem;    // undefined if discontinued (D4)
  isAvailable: boolean;          // false if not found OR found with isAvailable:false
  currentUnitPriceCents?: number; // recomputed from currentMenuItem + carried-forward option deltas (D7)
}

export interface ReorderResult {
  available: ReorderLine[];
  unavailable: ReorderLine[];
}

/** Pure function — no side effects, no cart mutation. Re-checks against MOCK_PRODUCTS (D4). */
export function buildReorderPlan(order: Order): ReorderResult;

/** Applies `available` lines to the live cart via the existing useCart() addItem seam (A3).
 *  Caller (screen) supplies the `addItem`/`setBranch` functions from useCart() — this function
 *  does not import the hook directly, keeping it a plain, testable function. */
export function applyReorderPlan(
  result: ReorderResult,
  branchId: string,
  cartActions: Pick<CartSessionState, 'addItem' | 'setBranch'>,
): void;
```

---

## Touchpoints

| Path | Action | Notes |
|---|---|---|
| `apps/mobile/src/app/(tabs)/order/history.tsx` | **edit** | Replace `<ComingSoon>` body with the real Order History list (A1) |
| `apps/mobile/src/app/(tabs)/order/reorder/[orderId].tsx` | **new** | Reorder Review screen — dynamic route, conflict resolution UI (A2). **New route (VALIDATE note, 13-07-26):** per `all-context.md`'s documented Expo Router convention, run `expo start` once (then stop it) after creating this file, before `tsc --noEmit` will resolve the new typed href (`.expo/types/router.d.ts` codegen doesn't run on typecheck alone) |
| `apps/mobile/src/app/(tabs)/order/_layout.tsx` | **edit** | Register `Stack.Screen name="reorder/[orderId]"` with a title (e.g. `'Review Reorder'`) — same registration shape as the existing `product/[productId]` and `tracking/[orderId]` entries (confirmed by direct read, 13-07-26) |
| `packages/types/src/order.ts` | **edit** | Extend `Order` per Public Contracts (A4) |
| `apps/mobile/src/features/order-history/mock-order-history.ts` | **new** | Mock dataset per A5 / Public Contracts, satisfying D4/D5/D6 invariants (D6: hardcoded `MOCK_CURRENT_USER_ID = 'mock-user'`) |
| `apps/mobile/src/features/order-history/reorder.ts` | **new** | `buildReorderPlan` / `applyReorderPlan` pure functions (A3/A6 — no new hook) |
| `apps/mobile/src/features/order-history/reorder.test.ts` | **new (VALIDATE-added, 13-07-26)** | Unit tests for `buildReorderPlan` proving AC6/AC7/AC9 mechanically — see T4 in Validate Contract; requires the vitest runner added below |
| `apps/mobile/vitest.config.ts` | **new (VALIDATE-added, 13-07-26)** | Minimal Vitest config scoped to plain-TS unit tests (no RN rendering, no jest-expo) — `apps/mobile` currently has zero test runner configured (confirmed via `package.json` + `process/context/tests/all-tests.md` §Known Gaps); `reorder.ts`'s functions are pure (no RN/React imports), so a lightweight Vitest setup (same category as `packages/api`'s existing Vitest usage) is sufficient — no jest-expo/RN-renderer needed |
| `apps/mobile/package.json` | **edit (VALIDATE-added, 13-07-26)** | Add `vitest` devDependency + `"test": "vitest run"` script, scoped to this one new test file |
| `packages/ui/src/components/order-history-card.tsx` | **new** | `OrderHistoryCard` component (A6, Gap 1) |
| `packages/ui/src/index.ts` | **edit** | Export `OrderHistoryCard` |
| `packages/ui/src/components/__tests__/order-history-card.test.tsx` | **new** | Render test for the new component |

**Explicitly NOT touched:** `packages/api` (backend/DB), `apps/mobile/src/features/cart/hooks/use-cart.ts` (consumed as-is, not modified), `apps/mobile/src/app/(tabs)/order/cart.tsx` (happy-path reorder navigates to it unmodified), `apps/mobile/src/features/auth/**` (not read at all for the order-history filter, per D6 correction — no changes), any `(tabs)/account/**` route (already links to `history` — no change needed).

---

## Blast Radius

- **Direct:** `apps/mobile` — 1 edited screen, 1 new screen, 1 new nested-stack registration, 3 new `features/order-history/*` files (incl. `reorder.test.ts`), 1 new `vitest.config.ts`, 1 edited `package.json`; `packages/types/src/order.ts` (additive extension); `packages/ui` — 1 new component + index export + 1 new test.
- **Indirect (compile-time):** none identified — `Order` currently has zero consumers outside its own definition (re-confirmed by grep at VALIDATE, 13-07-26), so this extension does not ripple into any existing fixture, unlike CART-001's `CartItem` extension.
- **Risk class:** low. No auth/billing/schema/migration/API surface touched (`packages/api` untouched, per explicit user scope; the order-history user filter reads a hardcoded mock constant, not the live auth session — D6). The only cross-package ripple is `packages/types` → `packages/ui`/`apps/mobile` recompile (1 new type only, additive, zero existing consumers to break).
- **File count:** 12 touchpoints (new+edited, incl. the 3 VALIDATE-added test-infra files) — within the same order of magnitude as CART-001 (12), consistent with the COMPLEX classification.

---

## Implementation Checklist (EXECUTE order)

> Every UI sub-step runs the **UI/UX Workflow**: `ui-ux-pro-max` (design) → `impeccable` (audit) → implement.

1. **Types:** extend `packages/types/src/order.ts` per Public Contracts (A4). Typecheck `packages/types`.
2. **Mock dataset:** create `apps/mobile/src/features/order-history/mock-order-history.ts` per A5/Public Contracts, with `MOCK_CURRENT_USER_ID` hardcoded to `'mock-user'` (D6). Explicitly verify at authoring time (manual check, not a runtime assertion) that the dataset satisfies every D4/D5/D6 invariant listed in the Public Contracts comment (multi-user, cancelled+0-stars, unavailable-product line, price-drift line, ≥1 multi-option line for AC9).
3. **Test runner (VALIDATE-added, 13-07-26):** add a minimal `vitest` devDependency + `apps/mobile/vitest.config.ts` (plain TS, no RN rendering) + `"test": "vitest run"` script to `apps/mobile/package.json`. This is a small, scoped addition — not a general RN component-test framework — needed only so step 4 below is mechanically provable rather than resting solely on the agent-probe walkthrough.
4. **Reorder logic:** create `apps/mobile/src/features/order-history/reorder.ts` — `buildReorderPlan` (pure, reads `MOCK_PRODUCTS`) and `applyReorderPlan` (calls supplied `addItem`/`setBranch`). No new hook/state seam (A3). Create `reorder.test.ts` alongside it, asserting AC6 (current price, not snapshot), AC7 (unavailable line flagged), and AC9 (multi-option lines reconstructed with all options intact) against `MOCK_ORDER_HISTORY`.
5. **UI Gap 1 — `OrderHistoryCard`:** [UI/UX Workflow] new component in `packages/ui`; export from `packages/ui/src/index.ts`; add `__tests__/order-history-card.test.tsx`.
6. **Screen 1 — Order History:** [UI/UX Workflow] replace `history.tsx` body — filter `MOCK_ORDER_HISTORY` by `userId === MOCK_CURRENT_USER_ID` (D6 — hardcoded constant, not `useAuth()`), sort by `placedAt` desc, render `EmptyState` for zero orders, else a list of `OrderHistoryCard` (Reorder button conditional per D1 — only `completed`/`cancelled`).
7. **Reorder trigger wiring:** Reorder button `onPress` calls `buildReorderPlan(order)`. If `unavailable.length === 0`: call `applyReorderPlan` directly with `useCart()` actions, then `router.push('/(tabs)/order/cart')` (D3 happy path). If `unavailable.length > 0`: `router.push(`/(tabs)/order/reorder/${order.id}`)` passing the order id only (Reorder Review re-derives the plan from `MOCK_ORDER_HISTORY` by id — no need to pass the plan through navigation params).
8. **Register route:** add `Stack.Screen name="reorder/[orderId]"` to `order/_layout.tsx` with `title: 'Review Reorder'`. **Then run `expo start` once (and stop it)** so Expo Router's typed-routes codegen picks up the new dynamic route before relying on `pnpm typecheck` (VALIDATE note, Touchpoints).
9. **Screen 2 — Reorder Review:** [UI/UX Workflow] new `reorder/[orderId].tsx` — re-derive `buildReorderPlan(order)` from the route param, render available lines (current price shown) and unavailable lines (flagged, "needs re-selection", excluded from the count/total), a "Continue to Cart" `Button` that calls `applyReorderPlan` for the `available` lines only and navigates to `/(tabs)/order/cart`, and a "Back to History" `Button` that navigates back without mutating the cart (D8 — never silent, always an explicit choice).
10. **Verification:** run §Verification Evidence gates; manually walk every Acceptance Criterion below against the mock dataset.

---

## Phase Completion Rules
- A step is complete only when its typecheck/lint pass and (for UI steps) the `impeccable` audit findings are resolved and `check-raw-tokens.mjs` is green.
- Both screens are complete only when all Acceptance Criteria below are demonstrably met against `MOCK_ORDER_HISTORY`.

---

## Acceptance Criteria (from #20/#21 — must all pass)

**HIST-001:**
1. Order History shows only the signed-in user's orders — proven by the `userId` filter against a dataset that includes another user's order (D6), not just a code comment. **(VALIDATE note: filter uses the hardcoded `MOCK_CURRENT_USER_ID` constant, not the live auth session id — see D6 correction.)**
2. Orders sorted newest-first by `placedAt`.
3. A cancelled order shows `cancelled` status + "0 stars earned", never a positive count (dataset invariant, D5).
4. A completed order shows its correct (mock) stars-earned value.
5. Empty state renders for zero orders (simulate by filtering `MOCK_ORDER_HISTORY` to an empty array in a dedicated test/probe pass, or via the current-user filter naturally producing zero if configured that way for the walkthrough).

**HIST-002:**
6. Reordering an all-available order populates the cart with CURRENT prices, not the historical snapshot — proven by the price-drift dataset line (D4): the added cart line's `unitPriceCents` must equal the CURRENT `MOCK_PRODUCTS` price, not the order's historical `unitPriceCents`.
7. Reordering an order containing the now-unavailable `nuggets-classic` line flags it before checkout (routes to Reorder Review, D3/D4).
8. Unavailable items are never silently dropped — Reorder Review always lists them explicitly with a "needs re-selection" flag (D8); user must explicitly proceed.
9. Reorder correctly reconstructs multi-option items (size + flavor + add-ons) — proven against a dataset line with 2+ `selectedOptions` (must be included when authoring the mock dataset in step 2), not just a single-option/base-product line.

---

## Test Infra Improvement Notes
- **(VALIDATE, 13-07-26):** `apps/mobile` has no test runner today (confirmed: no `test` script, no jest/vitest devDependency in `apps/mobile/package.json`; corroborated by `process/context/tests/all-tests.md` §Known Gaps). This plan adds a minimal, scoped `vitest` setup for one pure-function test file (`reorder.test.ts`) rather than a full RN component-test framework — see Implementation Checklist step 3 and Touchpoints. This does not resolve the project-wide "no mobile-side (RN) test runner" gap tracked in `all-tests.md` (that gap is specifically about RN *component* rendering, e.g. jest-expo); it only closes the narrower gap for plain-TS logic testing in `apps/mobile`.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm typecheck` across `packages/types`, `packages/ui`, `apps/mobile` | Fully-Automated | Type extension (A4) compiles cleanly; no regressions |
| `pnpm lint && node packages/ui/scripts/check-raw-tokens.mjs` | Fully-Automated | No raw hex/px in `OrderHistoryCard`/screens; lint clean |
| `pnpm --filter @jojopotato/ui test` (new `order-history-card.test.tsx`) | Fully-Automated | `OrderHistoryCard` renders without throwing against representative fixtures (completed w/ stars, cancelled w/ 0 stars, reorder button hidden for in-progress status per D1) |
| `pnpm --filter @jojopotato/mobile test` (new `reorder.test.ts`, vitest — **VALIDATE-corrected, 13-07-26**: was claimed Fully-Automated with no runner to execute it; now genuinely Fully-Automated once the Implementation Checklist step 3 vitest addition lands) | Fully-Automated | AC6 (current price, not snapshot), AC7 (unavailable line correctly flagged), AC9 (multi-option lines reconstructed with all options intact) — mechanically provable without rendering a screen |
| Agent-probe walkthrough: Order History screen — user-scoping (AC1, against the hardcoded `MOCK_CURRENT_USER_ID` filter per D6), sort order (AC2), cancelled-0-stars (AC3), completed-stars (AC4), empty state (AC5) | Agent-Probe | AC1–AC5 |
| Agent-probe walkthrough: Reorder happy path (all-available order → cart populated w/ current prices, no Reorder Review shown) and conflict path (unavailable-item order → Reorder Review shown, "needs re-selection" flag visible, explicit Continue/Back choice, never auto-drops) | Agent-Probe | AC6, AC7, AC8, D3 routing behavior |

---

## Validate Contract

**generated-by:** outer-pvl
**date:** 2026-07-13
**Date:** 13-07-26

### Parallel strategy
Parallel strategy: parallel-subagents
Rationale: 7-signal score 2/7 (S1 multi-package scope — `apps/mobile` + `packages/types` + `packages/ui`; S7 5+ blast-radius files — 12 touchpoints). No schema/auth/API/billing surface (order-history filter reads a hardcoded mock constant, not the live auth session), no phase-program context, no 3+ competing directions — MEDIUM tier, not a coordination-heavy fan-out. Executed in this pass as a single validate-agent performing the full Layer 1 (4 dimensions) + Layer 2 (per-section) checklist directly via targeted greps/reads (matching parallel-subagent-equivalent depth per finding — no Task/Agent tool fan-out needed for this session), consistent with the cart-screen precedent's own execution note.

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| T1 | Typecheck clean across `packages/types`, `packages/ui`, `apps/mobile` after the `Order` extension + new files | Fully-Automated | `pnpm typecheck` (turbo; or scoped: `pnpm --filter @jojopotato/types --filter @jojopotato/ui --filter @jojopotato/mobile typecheck`) | A |
| T2 | No raw hex/px in new/edited UI components; lint clean | Fully-Automated | `pnpm lint && node packages/ui/scripts/check-raw-tokens.mjs` | A |
| T3 | `OrderHistoryCard` renders without throwing (completed w/ stars, cancelled w/ 0 stars, Reorder button hidden for in-progress status per D1) | Fully-Automated | `pnpm --filter @jojopotato/ui test` (jest-expo — confirmed present in `packages/ui/package.json`) | A |
| T4 | `buildReorderPlan` correctness: AC6 (current price, not historical snapshot), AC7 (unavailable line flagged), AC9 (multi-option lines reconstructed with all options intact) | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (new `reorder.test.ts`, vitest — runner added by this plan's Implementation Checklist step 3; **VALIDATE correction**: plan originally claimed this tier without a runner existing) | B |
| T5 | Typed-routes codegen resolves the new `reorder/[orderId]` dynamic route before typecheck relies on it | Fully-Automated | `expo start` once (then stop) → `pnpm --filter @jojopotato/mobile typecheck` (VALIDATE-added Implementation Checklist step 8 note; matches the documented convention in `process/context/all-context.md`) | B |
| T6 | AC1 (own-user-only, via hardcoded `MOCK_CURRENT_USER_ID` — D6 correction), AC2 (sort), AC3 (cancelled+0-stars), AC4 (completed stars), AC5 (empty state) | Agent-Probe | Manual/agent-driven walkthrough of Order History screen against `MOCK_ORDER_HISTORY`; screenshot/recording evidence captured | A |
| T7 | AC6 (happy-path reorder, current prices), AC7 (unavailable flagged → Reorder Review), AC8 (never silently dropped, explicit Continue/Back), D3 routing (conditional navigate) | Agent-Probe | Manual/agent-driven walkthrough of both the happy path and the conflict path | A |
| T8 | Mock dataset invariants hold: ≥1 different-`userId` order (D6), ≥1 cancelled order w/ `starsEarned:0` (D5), ≥1 line referencing `nuggets-classic`/`isAvailable:false` (D4), ≥1 price-drift line (D4), ≥1 multi-option (2+ `selectedOptions`) line (AC9) | Agent-Probe | Manual authoring-time verification during Implementation Checklist step 2 (explicitly called out in that step) | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries only Fully-Automated / Hybrid / Agent-Probe. Known-Gap is never a `strategy:` value — it is a named residual row, never used to prove developed behavior in this plan (see §Open gaps: no behavior in this plan's blast radius rests solely on Known-Gap).

**Failing stub — T1:**
```
test("should typecheck cleanly across packages/types, packages/ui, apps/mobile after the Order extension", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: run `pnpm typecheck`, expect exit 0")
})
```
**Failing stub — T2:**
```
test("should have zero raw hex/px in new order-history UI and pass lint", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: run `pnpm lint && node packages/ui/scripts/check-raw-tokens.mjs`, expect exit 0")
})
```
**Failing stub — T3:**
```
test("should render OrderHistoryCard without throwing for completed/cancelled/in-progress fixtures", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: OrderHistoryCard renders across status variants, Reorder button hidden per D1")
})
```
**Failing stub — T4:**
```
test("should reconstruct reorder lines at current price, flag unavailable items, and preserve multi-option lines", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: buildReorderPlan AC6/AC7/AC9")
})
```
**Failing stub — T5:**
```
test("should resolve the new reorder/[orderId] typed route after expo start codegen", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: run `expo start` once then `pnpm --filter @jojopotato/mobile typecheck`, expect exit 0")
})
```
(T6/T7/T8 are Agent-Probe — no stub per policy.)

**Legacy line form:**
- Types/lint/tokens (T1/T2): Fully-automated: `pnpm typecheck && pnpm lint && node packages/ui/scripts/check-raw-tokens.mjs`
- Component render tests (T3): Fully-automated: `pnpm --filter @jojopotato/ui test`
- Reorder logic unit tests (T4): Fully-automated: `pnpm --filter @jojopotato/mobile test` (new vitest setup, this plan)
- Typed routes (T5): Fully-automated: `expo start` (once) → `pnpm --filter @jojopotato/mobile typecheck`
- Screen behavior (T6/T7/T8): Agent-probe: manual/agent walkthrough + authoring-time dataset check, evidence captured

### Dimension findings
- Infra fit: CONCERN → **RESOLVED in this pass** — the plan's original Touchpoints table did not mention Expo Router's documented "run `expo start` once before `tsc --noEmit` resolves new typed hrefs" requirement for the new `reorder/[orderId]` dynamic route (this repo's established convention, per `process/context/all-context.md`). Added as Touchpoints note + Implementation Checklist step 8 + Test gate T5. The proposed route registration shape itself is correct — confirmed against the two existing dynamic-route entries (`product/[productId]`, `tracking/[orderId]`) in `order/_layout.tsx` via direct read; identical pattern.
- Test coverage: CONCERN → **RESOLVED in this pass** — the plan's Verification Evidence table claimed `reorder.test.ts` (in `apps/mobile/src/features/order-history/`) as **Fully-Automated**, but `apps/mobile/package.json` has zero test runner configured (no jest/vitest, no `test` script — confirmed by direct read and corroborated by `process/context/tests/all-tests.md` §Known Gaps: "No mobile-side (RN) test runner"). Without a fix, T4 (which alone proves AC9 — no other gate covers multi-option reconstruction) would have had no way to actually run. Resolved by adding a minimal, scoped `vitest` setup (Implementation Checklist step 3, Touchpoints) — `reorder.ts`'s functions are pure (no RN/React imports), so this needs no jest-expo/RN-renderer, just plain Vitest (same category as `packages/api`'s existing usage). This does not resolve the project-wide RN-component-test-runner gap (unrelated, tracked separately in `all-tests.md`).
- Breaking changes: PASS → **re-confirmed via grep, 13-07-26** — `Order` type has zero import consumers anywhere in the repo outside `packages/types/src/order.ts` itself (checked every `from '@jojopotato/types'` import site across `apps/mobile/src`, plus every `\bOrder\b` occurrence across `packages/`). The additive extension is genuinely greenfield. Plan's original claim was accurate.
- Security surface: PASS — no auth/billing/schema/secrets/trust-boundary surface touched; `packages/api` is untouched; the order-history user filter is corrected (D6) to use a hardcoded mock constant rather than the live auth session, which if anything *reduces* surface area versus the plan's original design (no `useAuth()` read at all in the filter path).

### Section-level (Layer 2) findings
- Decisions Required (D1–D8): CONCERN → **RESOLVED in this pass** — D6's original design ("read `useAuth().user?.id`, fall back to a mock id") is a genuine correctness bug, not a style nit: `apps/mobile/src/features/auth/lib/dev-auto-login.ts` mints a **real** better-auth session for a fixed dev email, and better-auth auto-creates that user with a real DB-generated id on first use — that id is never literally `'mock-user'` and isn't guaranteed stable across a dev-DB reset. As written, the primary path would silently produce zero matching orders (masquerading as the AC5 empty state) rather than the intended AC1 "user's own orders" list. Confirmed there is no existing precedent for filtering mock data by the live auth id either — the Home tab renders `MOCK_REWARDS` with no `useAuth()`-based filter at all (grep-confirmed). Corrected D6 and A5 to unconditionally hardcode `MOCK_CURRENT_USER_ID = 'mock-user'`, matching `MOCK_REWARDS.userId` (confirmed identical value in `mock-home.ts`) and removing the `useAuth()` dependency from the filter path entirely. This is a mock-data-only pass; tying it to a real, unpredictable session id bought no realism and introduced a silent-failure risk.
- Architecture Decisions (A1–A6): PASS — mechanical feasibility confirmed for A1 (existing placeholder + registered route, no nav changes), A2 (route registration pattern matches existing dynamic routes), A3 (`useCart().addItem` signature confirmed to recompute price from the current `MenuItem` — direct source read of `unitPriceFor()`), A4 (additive `Order` extension, greenfield), A6 (all cited `@jojopotato/ui` components — `Card`, `Badge`, `Button`, `OrderStatusBadge`, `EmptyState` — confirmed present and exported).
- Public Contracts & Touchpoints: PASS (after the 3 VALIDATE-added rows — vitest config, `reorder.test.ts`, `package.json` edit — see Test coverage above) — `Order` extension is additive/greenfield; `mock-order-history.ts` and `reorder.ts` contracts are well-specified and internally consistent with A3/A4/D4.
- Implementation Checklist: CONCERN → **RESOLVED in this pass** — added step 3 (vitest setup) and the `expo start` codegen note to step 8; sequencing is otherwise correct (types → mock dataset → test runner → reorder logic+tests → UI component → screen 1 → trigger wiring → route registration → screen 2 → verification).
- Acceptance Criteria mapping: PASS — every AC1–9 now has at least one Fully-Automated or Agent-Probe gate (T3/T4/T6/T7/T8); no AC rests solely on a Known-Gap (net-gate vacuous-green check: clear).

### Open gaps
None unresolved — all 4 CONCERNs found during this VALIDATE pass (Infra fit, Test coverage, Decisions Required/D6, Implementation Checklist) were fixed directly in the plan text (see Dimension/Section findings above). Pre-existing accepted known-gaps carried forward unchanged from the plan (none are "developed behavior with zero gate" — each has at least Agent-Probe coverage or an explicit out-of-scope rationale, so the net-gate vacuous-green ban does not apply):
- Option-level (not whole-item) unavailability/price-drift is out of scope (D7) — explicit scoped exclusion, not a gap in covered behavior.
- No project-wide RN-component E2E/regression harness exists (`process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`) — AC1–AC5 and the routing/UI-visible parts of AC6–AC8 are proven via T6/T7 agent-probe in this plan, not an automated regression suite. This is a pre-existing project-wide gap, not introduced by this plan.
- Real backend-backed order history / availability reads are explicitly deferred — mock dataset and re-check logic are designed to be structurally swappable later (same "swap the seam" pattern as `use-cart.ts`), no backend ticket scoped here.

### What this coverage does NOT prove
- T1/T2 (typecheck/lint/tokens) do not prove runtime correctness of the reorder logic or UI behavior — only that types compile and lint/token rules are satisfied.
- T3 (jest render test) proves `OrderHistoryCard` renders without throwing for the specific fixtures exercised — it does not prove pixel-perfect layout, animation, or every prop combination.
- T4 (vitest unit tests on `buildReorderPlan`) proves the pure-function logic is correct against the specific `MOCK_ORDER_HISTORY` fixtures exercised — it does not prove the screen actually calls this function correctly or wires its output to `useCart()` correctly (that's T7's job).
- T5 proves the new route's typed href resolves after codegen — it does not exercise actual runtime navigation to/from the Reorder Review screen (T7 covers that).
- T6/T7 (agent-probe walkthroughs) prove the 9 acceptance criteria behave correctly against mock data in one manual/agent-driven pass — they do not prove behavior under real backend data, concurrent multi-device carts, or a real (non-`'mock-user'`) auth session actually filtering correctly (explicitly out of scope — D6 deliberately decouples the filter from the live session).
- T8 (dataset invariant check) is a manual authoring-time verification, not a runtime assertion — it relies on the executing agent actually checking the dataset at step 2, not on an automated lint rule enforcing the invariants going forward.
- None of these gates prove backend integration correctness — `packages/api` is untouched and has no order-history consumer yet; that is explicitly out of scope for this pass.

**Gate: PASS**

---

## Autonomous Goal Block

SESSION GOAL: Ship Order History (HIST-001) + Reorder with availability/price re-check (HIST-002) — screens-only, mock data, no backend.
Charter + umbrella plan: N/A — single plan (`process/features/ordering-cart/active/order-history-reorder_13-07-26/order-history-reorder_PLAN_13-07-26.md`)
Autonomy: Standard RIPER-5 autonomy — EXECUTE requires explicit "ENTER EXECUTE MODE"; PVL/EVL supplement-fix loops (if any) run autonomously per `process/development-protocols/orchestration.md` §PVL/EVL Loop Routing; blocked items go to backlog and execution continues on remaining checklist items.
Hard stop conditions / safety constraints:
- No `packages/api` / DB / backend work of any kind — explicit user scope for this pass.
- No new cart state seam — reorder MUST drive the existing `useCart()` hook (A3); do not fork or duplicate cart state.
- The order-history user filter MUST use the hardcoded `MOCK_CURRENT_USER_ID = 'mock-user'` constant, NOT a live `useAuth()` session id (D6 — VALIDATE correction; using the live session id will silently break AC1).
- Every UI step MUST go through `ui-ux-pro-max` → `impeccable` before implementation, constrained to existing `theme.ts` tokens only — no new hexes/px; `check-raw-tokens.mjs` must stay green.
- Do not modify `apps/mobile/src/features/cart/hooks/use-cart.ts` or `apps/mobile/src/app/(tabs)/order/cart.tsx` — consumed as-is.
- Unavailable items must never be silently dropped from a reorder (D8) — this is a hard product/AC requirement, not a style preference.
- The new `vitest` setup (Implementation Checklist step 3) is scoped ONLY to `reorder.test.ts` — do not expand it into a general RN component-test framework as part of this plan.
Next phase: EXECUTE — `process/features/ordering-cart/active/order-history-reorder_13-07-26/order-history-reorder_PLAN_13-07-26.md` (Implementation Checklist steps 1–10)
Validate contract: inline in plan (`## Validate Contract` section, this file) — Gate: PASS, 13-07-26
Execute start: `pnpm typecheck && pnpm lint` (fully-auto baseline) | T4 vitest run once step 3 lands | T6/T7 agent-probe walkthrough of AC1–9 | high-risk pack: no

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/ordering-cart/active/order-history-reorder_13-07-26/order-history-reorder_PLAN_13-07-26.md`
2. **Last completed phase or step:** VALIDATE complete (Gate: PASS, 13-07-26). Not yet executed.
3. **Validate-contract status:** PASS — see `## Validate Contract` above. All 4 CONCERNs found during VALIDATE (Infra fit / Test coverage / D6 mock-user-id bug / Implementation Checklist gaps) were corrected directly in this plan text.
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `packages/types/src/order.ts`, `packages/types/src/cart.ts`, `packages/ui/src/index.ts` + `card.tsx`/`order-status-badge.tsx`/`star-progress-bar.tsx`/`empty-state.tsx`, `apps/mobile/src/features/cart/hooks/use-cart.ts`, `apps/mobile/src/features/cart/mock-cart.ts`, `apps/mobile/src/features/home/mock-home.ts`, `apps/mobile/src/features/auth/hooks/use-auth.ts`, `apps/mobile/src/features/auth/lib/dev-auto-login.ts`, `packages/api/src/lib/dev-auto-login.ts`, `apps/mobile/src/app/(tabs)/order/history.tsx`, `apps/mobile/src/app/(tabs)/order/_layout.tsx`, `apps/mobile/package.json`, `packages/ui/package.json`, the cart-screen plan (`process/features/ordering-cart/active/cart-screen_09-07-26/cart-screen_PLAN_09-07-26.md`), `docs/jojo-potato-mobile-prd.md` §6.11.
5. **Next step for a fresh agent picking up mid-execution:** Say "ENTER EXECUTE MODE" to begin the Implementation Checklist. Apply the VALIDATE corrections as written into the plan (D6/A5 hardcoded mock-user-id, the 3 test-infra Touchpoints, the `expo start` codegen note) — no separate action needed, they are now part of the checklist/touchpoints.

---

## Known Gaps (carried forward, not blocking)

- Option-level (not whole-item) unavailability/price-drift is out of scope (D7) — e.g. a specific flavor option becoming unavailable while the base product stays available is not re-checked in this pass.
- No automated E2E/regression harness exists for either screen (project-wide gap, `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`) — AC1–AC9 rely on agent-probe walkthroughs plus the mechanical `reorder.test.ts` assertions, not a full navigation E2E suite.
- Real backend-backed order history / availability reads are explicitly deferred — this plan's mock dataset and re-check logic are designed to be structurally swappable later (same "swap the seam" pattern as `use-cart.ts`), but no backend ticket is scoped here.
- The order-history user filter (D6) is deliberately decoupled from the live auth session — when a real backend lands, this filter needs to be re-wired to the real session/user id at that time (not before); tracked here as a forward-compat note, not a current defect.
