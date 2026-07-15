---
name: plan:order-history-reorder-api
description: "COMPLEX plan — real-API Order History display (HIST-001) + Reorder (HIST-002), pure frontend; encodes 6 locked decisions from the SPEC"
date: 13-07-26
feature: ordering-cart
---

# PLAN — Order History + Reorder, Real API Integration (HIST-001 / HIST-002)

## Archived via UPDATE PROCESS (14-07-26)

EXECUTE complete (see `order-history-reorder-api_REPORT_13-07-26.md`, status `COMPLETE_WITH_GAPS`):
all 19 checklist steps applied, all automated gates green, Gate: CONDITIONAL accepted (2
pre-documented known-gaps — AC7 stars accrual, RN-runner screen coverage — both backlogged; see
`process/features/ordering-cart/backlog/stars-accrual-and-history-display_NOTE_13-07-26.md`). Code
merged to `main` via PR #73 (`399e415`). This folder was left in `active/` past EXECUTE; archived
now as part of GitHub issue #72 housekeeping — no further code changes made.

**Date**: 13-07-26
**Status**: COMPLETE_WITH_GAPS — EXECUTE done, merged (PR #73); Gate: CONDITIONAL, accepted known-gaps only
**Complexity**: COMPLEX
**Feature:** ordering-cart

**TL;DR:** Add three visible fields to each real Order History row (branch name via client
cross-reference, an item summary, and NO stars — omitted) and build the entire Reorder feature.
Reorder re-checks each past line against **today's** menu for the order's branch, adds available
items to the real `useCart()` cart at live prices, and surfaces now-unavailable items as
**inline flagged rows in the existing cart screen** that block checkout until acknowledged.
Pure frontend — **zero `packages/api`/DB/migration changes**. Reconciliation logic is extracted
into pure functions in `packages/utils` (which already has vitest wired) for real automated
coverage; screen behavior is Agent-Probe (no RN runner exists).

Complexity: **COMPLEX** (multi-surface: shared package + 3 mobile files + a new state seam +
availability/price reconciliation logic + conflict UX).

Supporting context: `process/context/all-context.md`, `process/context/tests/all-tests.md`, and the
SPEC in this task folder.

---

## Overview / Goal

Deliver the two GitHub issues against the **real** backend (not mock data — the superseded
`order-history-reorder_13-07-26` plan's mock approach is dead; the real `Order` shape already
exists):

- **HIST-001 (Order History display):** the list screen is already wired to `GET /orders`. Add the
  three missing row fields: (a) branch name, (b) items-ordered summary, (c) stars — **omitted this
  pass** (accrual does not exist server-side; recorded as a known gap).
- **HIST-002 (Reorder):** greenfield. A "Reorder" action on `completed`/`cancelled` orders rebuilds
  the cart against today's availability + prices, flags unavailable items inline in the cart, and
  blocks checkout until the customer resolves them.

Non-goals (from SPEC Out Of Scope): stars/rewards accrual, coupon-on-reorder, live payment,
push/websocket updates, option-level (sub-item) unavailability as a hard requirement, any change to
`POST /orders`/tracking/checkout beyond a reordered cart landing in the existing cart screen, and
any RN e2e harness.

---

## Architecture Decisions (encoding the 6 LOCKED choices)

These are **locked** (INNOVATE was intentionally skipped). They are recorded here as the plan's
approach, not re-opened.

1. **DECISION 1 — Branch name = CLIENT cross-reference.** `history.tsx` resolves each order's branch
   name from the already-fetched branch list (`useBranch().branches`) by `order.branchId`. No
   backend/serializer change. WHY: `GET /orders` returns only `branchId`; the branch list is already
   loaded app-wide for the cart/menu, so a client lookup avoids an API-contract change.
   GRACEFUL FALLBACK: `useBranch().branches` is filtered to `openOnly` (active branches). An order
   placed at a now-closed/inactive branch will miss the list → render a neutral fallback
   (`'Unknown branch'`), never crash. (REJECTED: extending `serializeOrder` — would be a public-API
   contract change, out of scope.)

2. **DECISION 2 — Item summary = render from existing `items[]`.** `GET /orders` already returns full
   `items[]` (`productName`, `quantity`) per order. A pure `summarizeOrderItems(items)` helper
   produces a compact line (e.g. `"2× Classic Fries + 1 more"`). No backend change. WHY: data is
   already client-side; only rendering is missing.

3. **DECISION 3 — Stars = OMIT the row entirely.** No stars UI is rendered. No formula is invented.
   WHY: `star_transactions` is never written by any route — there is no real value to show. Recorded
   as an explicit **Known Gap** with a backlog stub (see Known Gaps). Reorder/history ship without
   any stars affordance.

4. **DECISION 4 — Reorder eligibility = `completed` + `cancelled` only.** The Reorder button is shown
   only when `order.status ∈ {completed, cancelled}`; hidden for `pending`/`accepted`/`preparing`/
   `flavoring`/`ready`. Encoded as pure `reorderEligibility(status): boolean`.

5. **DECISION 5 — Conflict UX = INLINE flags in the cart (no new route/screen).** Reorder populates
   **available** items into the cart via `useCart().addItem`; **unavailable** items are surfaced as
   flagged/blocked rows in the EXISTING cart screen with a clear notice, and block checkout until
   removed/acknowledged.
   **CONTRACT RECONCILIATION (required by task — resolved, see Risks):** the locked `Cart`/`CartItem`
   type (`packages/types/src/cart.ts`) has **no field to represent a "flagged unavailable" line**,
   and every `cart.items` entry flows into `subtotalCents`/`totalCents` math AND into checkout →
   `POST /orders`. Injecting unavailable lines into `cart.items` would corrupt totals and let an
   un-orderable item reach checkout. Therefore unavailable items are **NOT** put into `cart.items`.
   They travel out-of-band through a small ephemeral **`ReorderConflictProvider`** seam (mirrors the
   `CartSessionProvider`/`BranchProvider` context pattern) and are rendered as a notice above the
   cart items. This keeps the locked `Cart` contract untouched — no type expansion — while satisfying
   "never silently dropped." (REJECTED: adding an `isAvailable`/`blocked` flag to `CartItem` — would
   expand the locked cart contract and thread through totals/checkout; out of scope and riskier.)

6. **DECISION 6 — Availability + price re-check = reuse `getMenu()`.** Reorder re-checks each past line
   against the CURRENT menu for the **order's** branch via the existing `getMenu(branchId)` (the same
   source `useMenu()` uses; it already encodes `products.is_active AND branch_product_availability.is_available`).
   Price comes from the **current** `Product.basePriceCents` + current option `priceDeltaCents`,
   applied live by `useCart().addItem` (`unitPriceFor`), **never** the historical
   `OrderItem.unitPriceCents` snapshot. WHY: single source of truth for availability/price; matches
   the app-wide convention.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cart contract can't represent a flagged-unavailable line (DECISION 5) | Certain (analyzed) | Resolved: conflicts held out-of-band in `ReorderConflictProvider`; `Cart` type untouched. This is the plan's key design point — surfaced explicitly, not silently forced. |
| Reorder for the order's branch needs a menu different from the selected branch | Medium | Imperative `queryClient.fetchQuery(['menu', order.branchId], …)` — fetch the order-branch menu directly on tap; do not rely on `useMenu()`'s selected-branch key. |
| `setBranch` no-ops on unchanged id → stale cart items survive reorder | Medium | Always `clearCart()` after `setBranch(order.branchId)` to guarantee a fresh reorder cart. |
| New markup introduces raw hex/px | Low | Compose from `@jojopotato/ui` + theme tokens only; token check gate. |
| Stale conflict block strands the user | Low | Clear conflicts on the acknowledge button, on `clearCart`, and when the cart empties. |
| **All-unavailable reorder hits the empty-cart short-circuit -> notice never renders (AC13 hole)** | Medium (found in VALIDATE) | `cart.tsx` early-returns `<EmptyState>` when `cart.items.length === 0`, BEFORE the items list. An all-unavailable reorder yields zero available items -> empty cart -> the "above the items list" notice is hidden and the user sees a bare "Your cart is empty" with no explanation (a silent drop). RESOLVED (VALIDATE P1): render the conflict notice whenever `conflicts.length > 0` **regardless of `isEmpty`/loading/error** -- restructure `cart.tsx` so `conflicts.length > 0` is evaluated before/around the empty short-circuit (see Section D step 15, revised). |

---

## Public Contracts

New public surface (all additive; no existing signature changes):

### `packages/utils` — new pure exports (unit-agnostic, cents-native; only import `@jojopotato/types`)

```ts
// packages/utils/src/reorder.ts

/** DECISION 4: reorder is offered only for finished orders. */
export function reorderEligibility(status: OrderStatus): boolean; // true iff status ∈ {'completed','cancelled'}

/** One rebuildable line: current-menu Product + cart-shaped options + original quantity. */
export interface ReorderAvailableLine {
  product: Product;                 // from CURRENT menu (basePriceCents = today's price)
  optionsForCart: CartItemOption[]; // matched to CURRENT options by optionId (priceDeltaCents = today's delta)
  quantity: number;                 // carried from the past OrderItem
}

/** One line that cannot be faithfully rebuilt today. */
export interface ReorderUnavailableLine {
  productName: string;                                   // from the historical OrderItem (for display)
  reason: 'product_unavailable' | 'option_unavailable';  // product gone from menu, or a chosen option gone
}

export interface ReorderReconciliation {
  available: ReorderAvailableLine[];
  unavailable: ReorderUnavailableLine[];
}

/**
 * DECISION 6: re-check each order line against the CURRENT branch menu.
 * - product not present in menu tree  → unavailable ('product_unavailable')
 * - any selectedOption.optionId no longer in the product's current options → unavailable ('option_unavailable')
 *   (AC15: a partially-reconstructable multi-option line is flagged, never silently simplified)
 * - otherwise available, with options + price sourced from the CURRENT menu.
 */
export function reconcileReorder(order: Order, menu: MenuResponse): ReorderReconciliation;
```

```ts
// packages/utils/src/order-display.ts

/** DECISION 2: compact one-line summary, e.g. "2× Classic Fries + 1 more". Empty items → "". */
export function summarizeOrderItems(items: OrderItem[]): string;
```

Both files re-exported from `packages/utils/src/index.ts`.

### `apps/mobile` — new hooks (no new public API beyond the app)

```ts
// apps/mobile/src/features/cart/hooks/use-reorder-conflicts.ts
export interface ReorderConflictState {
  conflicts: ReorderUnavailableLine[];
  setConflicts: (lines: ReorderUnavailableLine[]) => void;
  clearConflicts: () => void;
}
export function ReorderConflictProvider(props: { children: ReactNode }): JSX.Element;
export function useReorderConflicts(): ReorderConflictState;

// apps/mobile/src/features/orders/hooks/use-reorder.ts
/** Runs the full reorder flow for one order, then navigates to the cart. */
export function useReorder(): { reorder: (order: Order) => Promise<void>; isReordering: boolean };
```

**Contract note (Constraints):** no `GET /orders` / `serializeOrder` field is added — this stays a
**pure-frontend** change with no public-API-surface impact. If EXECUTE discovers a backend change is
truly unavoidable, STOP and flag it (it changes the risk class); do not silently expand scope.

---

## Touchpoints

| File | Package | Read / Modify / New | Purpose |
|---|---|---|---|
| `packages/utils/src/reorder.ts` | utils | **New** | `reorderEligibility`, `reconcileReorder` (pure) |
| `packages/utils/src/order-display.ts` | utils | **New** | `summarizeOrderItems` (pure) |
| `packages/utils/src/__tests__/reorder.test.ts` | utils | **New** | vitest coverage for reconcile + eligibility |
| `packages/utils/src/__tests__/order-display.test.ts` | utils | **New** | vitest coverage for summary |
| `packages/utils/src/index.ts` | utils | Modify | export the two new modules |
| `apps/mobile/src/features/cart/hooks/use-reorder-conflicts.ts` | mobile | **New** | ephemeral conflict seam (DECISION 5) |
| `apps/mobile/src/features/orders/hooks/use-reorder.ts` | mobile | **New** | imperative reorder action |
| `apps/mobile/src/app/(tabs)/order/history.tsx` | mobile | Modify | branch name + item summary + Reorder button |
| `apps/mobile/src/app/(tabs)/order/cart.tsx` | mobile | Modify | render conflict flags + block checkout |
| `apps/mobile/src/app/_layout.tsx` | mobile | Modify | mount `ReorderConflictProvider` |
| `apps/mobile/src/lib/{api-client,query-client}.ts` | mobile | Read | `getMenu`, `queryClient` (imperative fetch) |
| `apps/mobile/src/features/cart/lib/product-to-menu-item.ts` | mobile | Read | `productToMenuItem` for cart binding |
| `apps/mobile/src/features/cart/hooks/use-cart.ts` | mobile | Read | `addItem`/`setBranch`/`clearCart` seam |
| `apps/mobile/src/features/branch/hooks/use-branch.ts` | mobile | Read | branch-name cross-reference source |
| `packages/types/src/{order,cart,menu,product-option}.ts` | types | Read | real cents-native types (no change) |
| `packages/ui/src/index.ts` | ui | Read | reuse `Card`/`Badge`/`Button`/`EmptyState` (no change) |

---

## Blast Radius

- **Files changed/new:** 10 (4 new utils, 2 new mobile hooks, 3 modified mobile, 1 modified utils
  index). Reads-only: ~7.
- **Packages touched:** `packages/utils` (new pure logic + tests), `apps/mobile` (screens + hooks).
  **`packages/api`, DB, migrations: NONE.** `packages/types`, `packages/ui`: read-only (no change).
- **Risk class:** LOW-to-MEDIUM, pure frontend. NOT auth/billing/schema/migration/public-API. The one
  design-sensitive area is the cart-contract reconciliation (DECISION 5) — resolved by keeping
  conflicts out-of-band so the locked `Cart` type is untouched.
- **Regression-sensitive surfaces:** the cart screen (`cart.tsx`) already renders items + coupon +
  checkout; the new conflict notice must not alter the empty/loading/error branches or the existing
  totals math. History screen's existing loading/error/empty states must be preserved.

---

## Implementation Checklist (EXECUTE order)

Ordered so pure logic + tests land first (TDD-first), then mobile wiring, then the two screens.

**Section A — pure reconciliation logic (`packages/utils`, automated-testable)**

1. Create `packages/utils/src/order-display.ts` with `summarizeOrderItems(items)`:
   - empty → `''`; one item → `"{qty}× {productName}"`; multiple → `"{qty}× {firstName} + {n} more"`
     where `n = items.length - 1`. Use `×` (U+00D7), not `x`.
2. Create `packages/utils/src/reorder.ts` with `reorderEligibility(status)` returning
   `status === 'completed' || status === 'cancelled'`.
3. In the same file add `reconcileReorder(order, menu)`:
   - Flatten `menu.categories.flatMap(c => c.products)` into a `Map<productId, Product>`.
   - For each `order.items` line: if product id absent → push `{ productName, reason:'product_unavailable' }`.
   - Else, for each `line.selectedOptions`, look up the matching current option by `optionId` across
     `product.options.size|flavor|add_on`. If ANY selected option id is missing →
     `{ productName, reason:'option_unavailable' }` (AC15 — flag, never simplify).
   - Else build `optionsForCart: CartItemOption[]` from the CURRENT options
     (`{ optionType, id: optionId, name, priceDeltaCents }`) and push
     `{ product, optionsForCart, quantity: line.quantity }` to `available`.
4. Export both modules from `packages/utils/src/index.ts`.
5. Write `packages/utils/src/__tests__/reorder.test.ts` (vitest) — see Verification Evidence for the
   scenario list. Start red (assert against not-yet-final output), then implement to green.
6. Write `packages/utils/src/__tests__/order-display.test.ts` (vitest).
7. Run `pnpm --filter @jojopotato/utils test` → green. (If `vitest run` needs a config, add a minimal
   `packages/utils/vitest.config.ts` mirroring `packages/api`; only if the default run fails.)

**Section B — mobile state + action seams**

8. Create `apps/mobile/src/features/cart/hooks/use-reorder-conflicts.ts`:
   `ReorderConflictProvider` holding `useState<ReorderUnavailableLine[]>([])` + `setConflicts`/
   `clearConflicts`; `useReorderConflicts()` throws outside provider (mirror `useCart`).
9. Mount `<ReorderConflictProvider>` in `apps/mobile/src/app/_layout.tsx` adjacent to the existing
   `CartSessionProvider` (inside it, so cart + conflicts share lifetime).
10. Create `apps/mobile/src/features/orders/hooks/use-reorder.ts`:
    - `reorder(order)`: `clearConflicts()`; `setBranch(order.branchId)`; `clearCart()` (guarantees a
      fresh cart even when `order.branchId` equals the current branch, since `setBranch` no-ops on an
      unchanged id);
    - `const menu = await queryClient.fetchQuery({ queryKey:['menu', order.branchId], queryFn:()=>getMenu(order.branchId) })`
      (reuses the react-query cache the menu screen populates);
    - `const { available, unavailable } = reconcileReorder(order, menu)`;
    - `available.forEach(l => addItem(productToMenuItem(l.product, true), l.optionsForCart, l.quantity))`;
    - `setConflicts(unavailable)`; `router.push('/(tabs)/order/cart')`.
    - Track `isReordering` around the async fetch; guard errors (menu fetch failure) with a neutral
      `Alert` and no navigation.

**Section C — Order History screen (HIST-001)**

11. In `history.tsx`, add `const { branches } = useBranch();` and a per-row branch-name resolver:
    `branches.find(b => b.id === item.branchId)?.name ?? 'Unknown branch'` (DECISION 1 fallback).
12. Render the branch name and `summarizeOrderItems(item.items)` in the row Card, using existing
    `theme`/`Spacing`/`TypeScale`/`FontFamily` tokens (no raw hex/px — token check stays green).
    Do NOT add any stars affordance (DECISION 3).
13. Add a `Reorder` `<Button>` (shared `@jojopotato/ui`) inside the row, rendered only when
    `reorderEligibility(item.status)` is true; `onPress={() => reorder(item)}` (stop row-press
    propagation so it doesn't also open tracking). Preserve the existing loading/error/empty states
    unchanged.

**Section D — Cart conflict surface + checkout block (HIST-002 DECISION 5)**

14. In `cart.tsx`, read `const { conflicts, clearConflicts } = useReorderConflicts();`.
15. When `conflicts.length > 0`, render a notice block that appears **whenever there are conflicts,
    regardless of `isEmpty`/loading/error state**. IMPORTANT (VALIDATE P1): `cart.tsx` currently
    early-returns `<EmptyState>` when `cart.items.length === 0` (and `<ScreenLoader>`/`<ScreenMessage>`
    on branch load/error) BEFORE any items render. Restructure the render so `conflicts.length > 0`
    is checked FIRST (or is composed into the empty branch), so an **all-unavailable reorder**
    (0 available items -> empty cart) STILL shows the notice instead of a bare "Your cart is empty"
    (AC13: never silently dropped). The notice is a `Card` containing a short explanation + one flagged
    row per conflict (product name + a `Badge` reading "Unavailable" / "Option unavailable"), plus a
    `Button` "Remove unavailable & continue" that calls `clearConflicts()`. When items exist, the
    notice sits ABOVE the items list. Compose from existing UI primitives + theme tokens only
    (screen-specific -> no new `packages/ui` component).
16. Disable the Checkout `<Button>` while `conflicts.length > 0` (extend the existing `disabled`
    expression: `disabled={isEmpty || conflicts.length > 0}`). Clear conflicts on `clearCart` paths
    and when the cart becomes empty, so a stale block can't strand the user.
17. Ensure conflicts are cleared when the user leaves/greenlights (acknowledge button) — never
    silently, always by explicit user action (AC13).

**Section E — verification**

18. `pnpm --filter @jojopotato/utils test` (green), `pnpm typecheck`, `pnpm lint`, and the repo's
    raw-token check — all green.
19. Agent-Probe walkthrough of AC1–AC15 screen behaviors (see Verification Evidence).

---

## Phase Completion Rules

This is a single-plan (non-phase-program) COMPLEX plan. Completion is gated as follows:

- **CODE DONE** — all 19 checklist steps applied; `pnpm --filter @jojopotato/utils test`, `pnpm typecheck`,
  `pnpm lint`, and the raw-token check are green (Fully-Automated gates). This is code-complete, NOT verified.
- **VERIFIED** — CODE DONE **plus** the Agent-Probe walkthrough of AC5, AC6 (render), AC9–AC15 screen
  behaviors passes AND the user confirms the manual walkthrough. Because `apps/mobile` has no RN
  runner, VERIFIED for the screen surface requires explicit user confirmation of the Agent-Probe run —
  it cannot be claimed on automated gates alone.
- **CONDITIONAL (stars)** — AC7's accrual dimension is a Known Gap; the plan ships with stars OMITTED
  and a backlog stub written. This dimension stays CONDITIONAL (never a silent PASS) until accrual exists.
- Do not mark any surface `✅ VERIFIED` without both the automated gates and the user-confirmed
  Agent-Probe evidence.

---

## Acceptance Criteria Mapping (AC1–AC15 from SPEC)

| AC | Requirement | Where satisfied | Strategy |
|---|---|---|---|
| AC1 | Only caller's own orders | Already true (`GET /orders` session-scoped) — no change | Fully-Automated (existing `orders.test.ts`) |
| AC2 | Newest-first | Already true (`placed_at desc`) — no change | Hybrid (existing + probe) |
| AC3 | Row shows date + total | Already true (`history.tsx`) — unchanged | Agent-Probe |
| AC4 | Row shows status badge | Already true (`OrderStatusBadge`) — unchanged | Agent-Probe |
| AC5 | Row shows branch **name** | Step 11–12 (DECISION 1 client cross-ref + fallback) | Agent-Probe |
| AC6 | Row shows items summary | Step 1, 12 (`summarizeOrderItems`) | Fully-Automated (summary fn) + Agent-Probe (render) |
| AC7 | Stars earned; cancelled = 0 | **OMITTED** (DECISION 3) — Known Gap; no nonzero ever shown | Known-Gap (accrual) / Agent-Probe (no stars visible) |
| AC8 | Zero orders → empty state | Already true (`EmptyState`) — unchanged | Agent-Probe |
| AC9 | Reorder on completed+cancelled | Step 2, 13 (`reorderEligibility`) | Fully-Automated (eligibility fn) + Agent-Probe |
| AC10 | No Reorder on in-progress | Step 2, 13 | Fully-Automated (eligibility fn) + Agent-Probe |
| AC11 | Reorder at TODAY's prices | Step 3, 10 (current `Product.basePriceCents` + live `addItem`) | Fully-Automated (reconcile fn) + Agent-Probe |
| AC12 | Reorder at TODAY's availability | Step 3, 10 (reconcile vs current menu tree) | Fully-Automated (reconcile fn) + Agent-Probe |
| AC13 | Unavailable surfaced explicitly, never silent | Step 14–17 (inline conflict notice + checkout block) | Agent-Probe |
| AC14 | All-available → no extra friction | Step 10 (empty conflicts → lands in cart directly) | Agent-Probe |
| AC15 | Multi-option carried intact or flagged | Step 3 (`option_unavailable` when any option gone; else all options forwarded) | Fully-Automated (reconcile fn) |

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm typecheck` (all packages) exits 0 | Fully-Automated | Cross-package type integrity (no contract breakage) |
| `pnpm lint` exits 0 | Fully-Automated | Style/lint gate |
| Raw-token check exits 0 (no raw hex/px in new markup) | Fully-Automated | Constraint: reuse `@jojopotato/ui` + theme tokens |
| `reorder.test.ts`: `reorderEligibility` true for completed/cancelled, false for the other 5 statuses | Fully-Automated | AC9, AC10 |
| `reorder.test.ts`: all-available order → every line in `available`, options mapped from current menu, quantity carried | Fully-Automated | AC11, AC12, AC15 |
| `reorder.test.ts`: product removed from menu → line in `unavailable` (`product_unavailable`) | Fully-Automated | AC12, AC13 |
| `reorder.test.ts`: a selected option id absent from current product → line `unavailable` (`option_unavailable`), never silently simplified | Fully-Automated | AC15, AC13 |
| `reorder.test.ts`: price sourced from current `basePriceCents`/`priceDeltaCents`, NOT historical `unitPriceCents` | Fully-Automated | AC11 |
| `order-display.test.ts`: 0 / 1 / N items summaries | Fully-Automated | AC6 |
| Probe: history row shows branch name; order at an inactive branch shows `Unknown branch` (no crash) | Agent-Probe | AC5 |
| Probe: history row shows item summary line; NO stars affordance anywhere | Agent-Probe | AC6, AC7 (interim) |
| Probe: Reorder button present on completed/cancelled, absent on in-progress | Agent-Probe | AC9, AC10 |
| Probe: reorder an all-available order → lands in cart, items at today's price, no interruption | Agent-Probe | AC11, AC14 |
| Probe: reorder an order with a discontinued item → cart shows inline flagged row + notice; Checkout disabled until acknowledged; nothing silently dropped | Agent-Probe | AC12, AC13 |
| Probe: reorder a multi-option line → all size/flavor/add-on choices present in the cart line | Agent-Probe | AC15 |
| Probe: existing cart flows (empty/loading/error, coupon, totals, checkout for a normal cart) unchanged | Agent-Probe | Regression guard |

**Failing-stub note (TDD):** for each Fully-Automated `reorder.test.ts`/`order-display.test.ts` row,
start with a red `throw new Error("NOT IMPLEMENTED — TDD stub for: <scenario>")` test matching the
scenario text, then implement to green (Section A order).

Test context: `process/context/tests/all-tests.md` (Post-Phase Testing / verification order).

---

## Known Gaps

1. **Stars accrual (AC7) — Known Gap.** No route writes `star_transactions`; there is no real value
   to display, so the stars row is **omitted entirely** (DECISION 3), not faked. Gate stays
   **CONDITIONAL** for AC7's accrual dimension. **Backlog stub required at EXECUTE/UPDATE PROCESS:**
   `process/features/ordering-cart/backlog/stars-accrual-and-history-display_NOTE_13-07-26.md` —
   "re-add stars to the history row once `star_transactions` is written by order placement." The only
   automated-adjacent guarantee this pass is Agent-Probe: no nonzero stars value ever appears.
2. **No RN test runner for screen behavior.** `apps/mobile` has no Jest/Vitest/Detox — AC5/AC13/AC14
   and the render side of AC6/AC9–AC12/AC15 are **Agent-Probe only**. Mitigated by extracting all
   decidable logic (eligibility, reconciliation, price/availability, option carry-forward, summary)
   into `packages/utils` where vitest IS wired. Not fixed here (project-wide gap; see
   `mobile-e2e-navigation-harness_NOTE_09-07-26`).
3. **Option-level unavailability is flagged as whole-line unavailable.** Per SPEC Out Of Scope,
   sub-item (single-option) unavailability is not separately surfaced; a line with a missing option is
   flagged `option_unavailable` (honest — never silently simplified). Finer-grained option repair is
   deferred.
4. **Conflict seam is in-memory + ephemeral.** `ReorderConflictProvider` state is not persisted; a
   force-quit mid-reorder clears it (same lifetime semantics as the cart itself, by design).

---

## Test Infra Improvement Notes

- **Confirmed (supersedes stale `all-tests.md`):** `packages/utils` **already has `"test": "vitest run"`
  and a `vitest` devDependency** — so pure reorder/summary logic placed there gets real automated
  coverage with **zero new test infra**. This is the chosen lighter option (vs standing up an RN
  runner in `apps/mobile`). Recommend UPDATE PROCESS correct the `all-tests.md` line claiming
  `packages/{types,utils}` have no runner.
- No RN runner added for `apps/mobile` this pass (deliberate — heavier, higher risk, project-wide gap
  tracked separately).

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/ordering-cart/active/order-history-reorder-api_13-07-26/order-history-reorder-api_PLAN_13-07-26.md`
2. **Last completed step:** PLAN written; VALIDATE not yet run.
3. **Validate-contract status:** PENDING — VALIDATE (vc-validate-agent) must write the `## Validate Contract`
   section before EXECUTE. Note the DECISION 5 cart-contract reconciliation as the key thing to validate.
4. **Supporting context loaded:** SPEC (`..._SPEC_13-07-26.md`), `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, and all real source files in the Touchpoints table
   (grounded — `packages/utils/package.json` confirms vitest is wired).
5. **Next step for a fresh agent:** run VALIDATE, then **ENTER EXECUTE MODE** in Section A→E order;
   pure logic + its vitest gate first, then the two mobile hooks, then history + cart screens. Do NOT
   touch `packages/api`/DB/migrations — if a backend change appears necessary, STOP and flag it as a
   decision (scope/risk-class change), do not proceed silently.

---

## Validate Contract

Status: CONDITIONAL
Date: 13-07-26
date: 2026-07-13
generated-by: outer-pvl

Parallel strategy: parallel-subagents
Rationale: 3/7 signals (S1 multi-package: utils+mobile; S7 5+ files: 10 changed; MEDIUM band). Layer 1 (4 dimensions) + Layer 2 (4 sections) fanned out as read-only independent checks; no cross-agent coordination needed.

### Test gates (C3 5-column table — additive; legacy line form below)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC9, AC10 | `reorderEligibility(status)` true for completed/cancelled, false for the other 5 statuses | Fully-Automated | `pnpm --filter @jojopotato/utils test` — reorder.test.ts eligibility cases | A |
| AC11 | reorder price sourced from CURRENT `Product.basePriceCents` + `priceDeltaCents`, never historical `OrderItem.unitPriceCents` | Fully-Automated | reorder.test.ts price-source case | A |
| AC12 | product absent from current menu tree → `unavailable` (`product_unavailable`) | Fully-Automated | reorder.test.ts product_unavailable case | A |
| AC15 | multi-option line carried intact; ANY selected `optionId` missing from current product → `option_unavailable`, never simplified | Fully-Automated | reorder.test.ts multi-option + option_unavailable cases | A |
| AC6 (logic) | `summarizeOrderItems` for 0 / 1 / N items | Fully-Automated | order-display.test.ts | A |
| cross-package integrity | no contract breakage across utils/types/mobile | Fully-Automated | `pnpm typecheck` exits 0 | A |
| style/token | lint clean; no raw hex/px in new markup | Fully-Automated | `pnpm lint` + raw-token check exit 0 | A |
| AC5 | history row shows branch name via client cross-ref; inactive-branch order → "Unknown branch", no crash | Agent-Probe | probe: open history against a real order + an order at a closed branch | A |
| AC6 (render) | history row shows item-summary line; NO stars affordance anywhere | Agent-Probe | probe: inspect a history row | A |
| AC9, AC10 (render) | Reorder button present on completed/cancelled, absent on in-progress | Agent-Probe | probe: rows across statuses | A |
| AC13 | unavailable items surfaced inline; checkout blocked until acknowledged; notice shows even for the ALL-unavailable (empty-cart) reorder | Agent-Probe | probe: reorder an order with a discontinued item AND an all-unavailable order | B (render-fix added by this plan — Section D step 15 revised, VALIDATE P1) |
| AC14 | all-available reorder → lands in cart at today's price, no extra friction | Agent-Probe | probe: reorder an all-available order | A |
| AC7 | stars OMITTED — no nonzero stars value ever shown | Agent-Probe (no-stars-visible) | probe: confirm no stars UI | D (accrual is a named residual — backlog stub; see Open Gaps) |

Failing stubs (Fully-Automated rows only — TDD red-first, destined for `reorder.test.ts` / `order-display.test.ts`, NOT written to disk during VALIDATE):

```
test("reorderEligibility is true for completed and cancelled, false for the other 5 statuses", () => { throw new Error("NOT IMPLEMENTED — TDD stub: eligibility across all 7 OrderStatus values") })
test("reconcileReorder prices available lines from CURRENT basePriceCents/priceDeltaCents, not historical unitPriceCents", () => { throw new Error("NOT IMPLEMENTED — TDD stub: current-price-not-snapshot") })
test("reconcileReorder flags a product absent from the current menu tree as product_unavailable", () => { throw new Error("NOT IMPLEMENTED — TDD stub: product_unavailable") })
test("reconcileReorder flags a line whose selected optionId is gone as option_unavailable, never silently simplified", () => { throw new Error("NOT IMPLEMENTED — TDD stub: option_unavailable multi-option AC15") })
test("reconcileReorder carries a fully-available multi-option line intact with options mapped from the current menu", () => { throw new Error("NOT IMPLEMENTED — TDD stub: multi-option carry-forward AC15") })
test("summarizeOrderItems returns empty for 0, single for 1, and summary-plus-more for N", () => { throw new Error("NOT IMPLEMENTED — TDD stub: summarizeOrderItems 0/1/N") })
```

Legacy line form (retained for existing consumers):
- packages/utils reorder/summary logic: Fully-automated: `pnpm --filter @jojopotato/utils test`
- cross-package types: Fully-automated: `pnpm typecheck`
- style/token: Fully-automated: `pnpm lint` + raw-token check
- apps/mobile screen behavior (AC5, AC13, AC14, render halves of AC6/AC9-12/AC15): agent-probe: manual Agent-Probe walkthrough (no RN runner exists)
- stars accrual (AC7): known-gap: documented — accrual never written server-side; stars row omitted, backlog stub required

### Dimension findings

- Infra fit: PASS — `packages/utils` has vitest wired (`"test": "vitest run"`, vitest ^3.2.4); pure logic gets real automated coverage with zero new infra. `apps/mobile` has no RN runner (confirmed). All touchpoint paths, reused UI exports (Card/Badge/Button/EmptyState), `getMenu`/`queryClient`, and the `CartSessionProvider` mount point resolve on disk. No container/infra/worker surface.
- Test coverage: CONCERN — all decidable logic (eligibility, reconcile, price/availability, option carry-forward, summary) is extracted to `packages/utils` and Fully-Automated. Screen behavior (AC5, AC13, AC14 + render halves) is Agent-Probe ONLY — no RN runner. Honestly disclosed; a project-wide gap, not this plan's fault. Named residual, not a silent pass.
- Breaking changes: PASS — purely additive. Verified against source: NO `packages/api`/DB/serializer/migration change; `serializeOrder`/`GET /orders` untouched; the locked `Cart`/`CartItem` type is UNTOUCHED (conflicts held out-of-band in `ReorderConflictProvider`). Pure-frontend claim holds (branch name via already-loaded `useBranch().branches`; summary from existing `items[]`).
- Security surface: PASS — no auth/identity/billing/secret/trust-boundary change. `GET /orders` already session-scoped (AC1, existing coverage); reorder drives the existing cart seam; `POST /orders`/checkout untouched. Not a high-risk class → no evidence pack required.
- Section A (pure reconciliation logic — utils): PASS — all edit targets are new files + one additive index export. Match-by-`optionId` across `product.options.{size,flavor,add_on}` confirmed viable against real types (`SelectedOption.optionId`, `ProductOption.optionId`, `product.options: Record<ProductOptionType, ProductOption[]>`). Highest-risk edit: the option-matching loop → covered by the AC15 multi-option + option_unavailable tests.
- Section B (mobile state + action seams): PASS — `setBranch`/`clearCart`/`addItem` semantics confirmed; ordering (clearConflicts → setBranch → clearCart → fetch → reconcile → addItem → setConflicts → navigate) is correct. `queryClient.fetchQuery(['menu', order.branchId])` matches `useMenu`'s exact cache key (cache-reuse claim TRUE). Minor: `queryClient` has `staleTime: 30_000` → see execute-agent instruction E2.
- Section C (Order History screen — HIST-001): PASS — `useBranch().branches` (openOnly-filtered `PickupBranch[]` with id+name) supports the branch-name cross-ref + "Unknown branch" fallback; `summarizeOrderItems(item.items)` and `reorderEligibility(item.status)` both operate on the real `Order` shape.
- Section D (Cart conflict surface + checkout block): CONCERN → RESOLVED in-plan (VALIDATE P1). `cart.tsx` `disabled={isEmpty}` (line 316) is extendable to `disabled={isEmpty || conflicts.length > 0}`. Gap found: the `isEmpty` early-return `<EmptyState>` (line 190) hides the "above the items list" notice for an all-unavailable reorder → AC13 silent-drop hole. Fixed by revising Section D step 15 + adding a Risks row: notice must render whenever `conflicts.length > 0` regardless of empty/loading/error.

### Layer verdicts

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | CONCERN |
| Breaking changes | PASS |
| Security surface | PASS |

| Layer 2 sections | Status |
|---|---|
| Section A — pure reconciliation logic (utils) | PASS |
| Section B — mobile state + action seams | PASS |
| Section C — Order History screen (HIST-001) | PASS |
| Section D — Cart conflict surface + checkout block | CONCERN (resolved in-plan, P1) |

Totals: 0 FAILs / 2 CONCERNs (test-coverage RN-runner gap [known-gap, excluded]; Section D render gap [resolved in-plan P1]) / 6 PASSes

### Execute-Agent Instructions

| # | Instruction | Trigger |
|---|---|---|
| E1 | Section D step 15 (revised): the conflict notice MUST render whenever `conflicts.length > 0` regardless of `isEmpty`/loading/error. Restructure `cart.tsx` so the `conflicts.length > 0` block is evaluated BEFORE (or composed into) the `isEmpty` `<EmptyState>` early-return. Verify the all-unavailable reorder case in the Agent-Probe (empty cart still shows the notice, not a bare "Your cart is empty"). | Editing `cart.tsx` |
| E2 | The reorder menu fetch uses `queryClient.fetchQuery({ queryKey:['menu', order.branchId], ... })`. `queryClient` has `staleTime: 30_000`, so a menu fetched <30s ago is returned cached. That is acceptably fresh (matches app-wide convention; `useMenu` polls 20s). If strict "availability exactly at tap" is desired, pass `staleTime: 0` on this one `fetchQuery` call. Do NOT change the global `queryClient` config. | Writing `use-reorder.ts` |
| E3 | Do NOT touch `packages/api`/DB/migrations/`serializeOrder`. If a backend change appears unavoidable, STOP and flag it — it changes the risk class (currently LOW-MEDIUM pure-frontend). | Any step |
| E4 | Write the stars-accrual backlog stub before UPDATE PROCESS: `process/features/ordering-cart/backlog/stars-accrual-and-history-display_NOTE_13-07-26.md`. | Section E / closeout |

### Open gaps

- Stars accrual (AC7): known-gap: documented as backlog stub required — `star_transactions` is never written server-side; the stars row is OMITTED (not faked), never shows a nonzero value (Agent-Probe). Stub: `process/features/ordering-cart/backlog/stars-accrual-and-history-display_NOTE_13-07-26.md`. Pre-classified known-gap (plan §Known Gaps #1) — excluded from CONCERN/FAIL count.
- RN-runner screen coverage: known-gap: documented — `apps/mobile` has no Jest/Vitest/Detox, so AC5/AC13/AC14 and render halves of AC6/AC9-12/AC15 are Agent-Probe only. Existing backlog note `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`. Pre-classified known-gap (plan §Known Gaps #2) — excluded from CONCERN/FAIL count.
- Option-level (sub-item) unavailability is flagged as whole-line `option_unavailable` (plan §Known Gaps #3, per SPEC Out Of Scope) — honest, never silently simplified.

### What this coverage does NOT prove

- `pnpm --filter @jojopotato/utils test` (reorder/summary logic): proves the pure reconciliation math (eligibility, availability check, current-price sourcing, option carry-forward, summary string). Does NOT prove: the cart actually populates on screen, the notice renders, checkout is actually disabled, navigation lands on the cart, or that `addItem`/`fetchQuery` are wired correctly — those are Agent-Probe.
- `pnpm typecheck`: proves cross-package type integrity and that call signatures line up. Does NOT prove runtime behavior, react-query cache hits, or that a `fetch` response actually matches `MenuResponse` at runtime (a `tsc`-invisible class of bug that bit `pickup-order-flow`).
- `pnpm lint` + raw-token check: proves style/lint compliance and no raw hex/px. Proves nothing about behavior.
- Agent-Probe walkthrough (AC5/AC13/AC14 + render halves): proves observed screen behavior in one manual run; does NOT provide regression protection (no automated RN gate re-runs it). VERIFIED for the screen surface therefore requires explicit user confirmation of the Agent-Probe run — it cannot be claimed on automated gates alone.
- Nothing here proves stars accrual (AC7) — accrual does not exist server-side; stars is omitted by design.

Gate: CONDITIONAL (0 FAILs; Section D render gap fixed in-plan (P1); remaining drivers are the two pre-documented accepted known-gaps — stars accrual AC7 and RN-runner screen coverage — plus the plan's own rule that the screen/stars surface stays CONDITIONAL until user-confirmed Agent-Probe / real accrual)
Accepted by: session — accepted documented known-gaps: (1) stars accrual AC7 (omitted, backlog stub); (2) RN-runner screen coverage (Agent-Probe only, existing backlog note). Section D render gap was resolved in-plan, not accepted as a gap.

---

## Autonomous Goal Block

```
SESSION GOAL: Order History real-API display (HIST-001) + Reorder (HIST-002) — pure frontend, zero packages/api/DB changes.
Charter + umbrella plan: N/A — single plan (process/features/ordering-cart/active/order-history-reorder-api_13-07-26/order-history-reorder-api_PLAN_13-07-26.md)
Autonomy: proceed autonomously on all reversible frontend edits (feedback_autonomous_phase_execution) — CONDITIONAL gaps are documented and accepted, continue; BLOCKED → backlog + continue.
Hard stop conditions / safety constraints:
- If any backend change (packages/api / DB / migration / serializeOrder / GET /orders shape) appears necessary, STOP and flag it — it changes the risk class from LOW-MEDIUM pure-frontend. Do not silently expand scope.
- Do NOT modify the locked Cart/CartItem type — conflicts stay out-of-band in ReorderConflictProvider.
- Do NOT invent a stars value — stars stays omitted until real accrual exists.
- Money stays in cents everywhere; never reintroduce decimal-peso.
Next phase: EXECUTE — Section A (pure logic + vitest, TDD red-first) → B (hooks + _layout mount) → C (history.tsx) → D (cart.tsx conflict surface, apply E1 render fix) → E (verify).
Validate contract: inline in plan (## Validate Contract, Gate: CONDITIONAL, generated-by: outer-pvl)
Execute start: fully-auto: pnpm --filter @jojopotato/utils test + pnpm typecheck + pnpm lint + raw-token check | agent-probe: AC1-AC15 screen walkthrough (incl. all-unavailable reorder empty-cart notice) | high-risk pack: no
```

