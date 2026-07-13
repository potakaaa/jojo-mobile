---
name: plan:pickup-order-flow
description: "Wire the full customer pickup-order flow end-to-end (branch -> menu -> customize -> cart -> review -> place order -> confirmation); new API routes + mobile cart/order state layer"
date: 10-07-26
feature: general
---

# Wire the Customer Pickup-Order Flow End-to-End — PLAN

**Date**: 10-07-26
**Status**: VERIFIED — EXECUTE + EVL complete (HALTED_SUCCESS, 13-07-26); archived to `completed/`
via UPDATE PROCESS. See `pickup-order-flow_REPORT_13-07-26.md` (this task folder) for the closeout.

**Complexity**: COMPLEX (multi-package: `packages/api`, `apps/mobile`, `packages/types`,
`packages/ui`; new API surface; new mobile state layer; ~33 touched/new files).

## Phase Completion Rules

This is a single-pass COMPLEX plan (not a phase program) — one execution pass covers the
Implementation Checklist below, gated by VALIDATE before EXECUTE and by EVL after EXECUTE.
Completion states for this plan:

- **PLAN** (current) — this file is written and formalizes the pre-approved design; no code has
  changed yet.
- **CODE DONE** — all 33 Implementation Checklist items are implemented; automated/hybrid gates in
  Verification Evidence are not yet all confirmed green.
- **VERIFIED** — all Fully-Automated and Hybrid gates in Verification Evidence are green, the
  Agent-Probe cold-open→confirmation QA script has been walked and passed, and the EVL confirmation
  run (an independent vc-tester re-run of the validate-contract gates, per
  `process/development-protocols/orchestration.md` §EVL routing) is green. `CODE DONE` must never be
  reported as `VERIFIED` — pending testing/manual verification is a distinct, honestly-labeled
  state, not a green check.

**Process note (RESEARCH/SPEC/INNOVATE provenance):** RESEARCH, SPEC, and INNOVATE for this plan
were performed in a prior interactive planning session with the user (not via `vc-research-agent` /
`vc-spec-agent` / `vc-innovate-agent` spawns). The design below was presented to and **approved by
the user** in that session. This PLAN-phase write is a formalization/transcription of that
already-approved design into this repo's canonical plan-artifact structure — it is a legitimate
skip-to-PLAN under the "existing decision already made" allowance, not a protocol violation. No
scope, API design, data-model, or state-management decisions in this plan were made or altered by
the plan-agent; they are carried over verbatim from the approved design. VALIDATE (owned by
`vc-validate-agent`) is the next phase and has not run yet — the `## Validate Contract` section
below is a placeholder only.

---

## Context

`jojo-mobile` currently has a fully-designed database schema for ordering (branches, categories,
products, product options, branch-product-availability, orders, order_items) but **zero API
routes and zero real mobile screens** for the order flow — every screen under `(tabs)/order/` and
`(tabs)/branches/` is a `<ComingSoon>` placeholder, and there is no cart state anywhere in the app.
This plan wires the customer journey PRD §8.2 describes (branch → menu → customize → cart → review
→ place order → confirmation) into one continuous, working flow, and satisfies the stated
acceptance criteria: a DB-unique, human-readable `order_number`; a correctly computed
`estimated_ready_at` derived from the branch's prep time; and fully independent order rows when a
user places two orders back-to-back.

## Goals

1. A customer can go from cold app open to a placed order and confirmation screen with no dead ends.
2. `orders.order_number` is unique (DB-enforced), human-readable, referenceable at pickup.
3. `orders.estimated_ready_at` is populated from the branch's `estimated_prep_minutes` at order
   placement time.
4. Two back-to-back orders from the same account produce two fully independent `orders` rows.

## Scope (confirmed with user in the prior approved design session)

**In scope:**
- Customer-facing steps only: select branch → browse menu → select product/size/flavor → add to
  cart → review cart → place order → confirmation with status display.
- `pay_at_branch` as the only *selectable* checkout payment method; `online_payment` is shown but
  visibly **disabled** ("coming soon").

**Explicitly out of scope (deferred):**
- Staff-side status transitions (accept/ready/complete) — separate staff-app work.
- Star-earning / rewards accrual — separate rewards work.
- Coupon redemption (PRD step 5) — `orders.discount_total` stays `0` this pass; the column already
  exists so adding redemption later is additive (no migration needed).
- Live payment processing via `online_payment` — no processor is chosen yet (see
  `process/context/all-context.md` §Open Questions).
- Polling/websocket live order-status updates — fetch-on-focus is sufficient this pass.

This plan spans both `process/features/ordering-cart/` and `process/features/pickup-branches/`
(both currently empty scaffolds) since it is genuinely one continuous, integrated flow — hence it
lives in `process/general-plans/active/` rather than a single feature folder, per the task
framing given for this session.

---

## API Design (`packages/api/src/`)

No route modules exist yet — `index.ts` is a flat file with better-auth mounted at
`/api/auth/*splat`, then `express.json()`. New routers get created and mounted the same way, after
`express.json()`.

### New files

- `packages/api/src/middleware/require-session.ts` — Express middleware using
  `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })` (note: `req.headers`, not `req` —
  `fromNodeHeaders` takes a headers object; the only existing `better-auth/node` usage in this repo
  is `toNodeHandler(auth)` in `index.ts`, a different call, so this is a first-use, not an existing
  established pattern), attaches `req.user`/`req.session`, responds 401 if absent.
- `packages/api/src/types/express.d.ts` — augments Express `Request` with `user`/`session`.
- `packages/api/src/routes/branches.ts` — public reads.
- `packages/api/src/routes/orders.ts` — requires session.
- `packages/api/src/routes/lib/order-number.ts` — generation + retry logic.
- `packages/api/src/routes/lib/serializers.ts` — Drizzle `numeric` (string) → integer cents,
  menu/order response shaping.
- `packages/api/src/routes/__tests__/orders.test.ts`
- `packages/api/src/routes/__tests__/branches.test.ts`

### Modified files

- `packages/api/src/index.ts` — mount `branches` and `orders` routers after `express.json()`.

### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/branches` | none | Active branches (`is_active`); optional distance sort via `lat`/`lng` query params. |
| GET | `/branches/:branchId` | none | Branch detail; 404 if missing/inactive. |
| GET | `/branches/:branchId/menu` | none | Categories → active products (INNER JOIN `branch_product_availability` where `is_available`) → each product's active options grouped by `option_type` (`size`/`flavor`/`add_on`). |
| POST | `/orders` | required | Create order (transaction flow below). Body: `{ branchId, paymentMethod, items: [{ productId, quantity, selectedOptions: [{ optionId }] }] }`. |
| GET | `/orders/:orderId` | required | Full order + items; 404 if missing, 403 if not the requesting user's order. |
| GET | `/orders` | required | Caller's order history, `placed_at desc`, simple limit/cursor pagination. |

### `POST /orders` transaction (`db.transaction`)

1. Validate body (zod): branch exists and `is_accepting_pickup`; each product active and available
   at that branch; each `selectedOptions.optionId` belongs to that product and is active.
2. **Recompute price server-side** — never trust client prices. `unit_price = base_price + Σ
   price_delta` for the line's selected options.
3. `subtotal = Σ line totals`; `discount_total = 0`; `total = subtotal`.
4. Generate `order_number` (format below); insert using
   `db.insert(orders).values({...}).onConflictDoNothing({ target: orders.order_number }).returning()`
   in a loop — regenerate `order_number` and retry up to 5 times while the returned row set is
   empty, then respond 500 after 5 empty attempts. `onConflictDoNothing` never throws on collision,
   so the surrounding `db.transaction()` never enters Postgres's aborted-transaction state. Do NOT
   implement a bare `try/catch` on `error.code === '23505'` with a plain retry insert inside the
   same transaction — once any statement in a Postgres transaction raises an error, the whole
   transaction is aborted and a second attempt in that same transaction fails.
5. `placed_at = now()`; `estimated_ready_at = placed_at + branch.estimated_prep_minutes` (branch row
   read inside the same transaction, so it reflects state at placement time).
6. Bulk-insert `order_items` with `product_name_snapshot` and `selected_options` JSON snapshot
   (denormalized — later menu edits never retroactively change historical orders).
7. Return the created order + items in one response (mobile navigates to confirmation with it — no
   extra round trip).

Each `POST /orders` call is a fully isolated transaction with its own generated id and
`order_number` — there is no shared mutable counter, which is what makes back-to-back orders
trivially independent (this directly satisfies Goal 4 / acceptance criterion 4).

### `order_number` format

`JP-YYMMDD-XXXX`, e.g. `JP-260710-4Q7K` — `XXXX` is 4 Crockford-base32 characters (excludes
ambiguous `0/O/1/I`) from `crypto.randomInt`. Date-scoped keyspace (~1M combinations/day) keeps
collisions vanishingly rare at real order volume; the DB unique constraint + app-level
retry-on-`23505` is the actual correctness guarantee, not the keyspace size (this satisfies Goal 2 /
acceptance criterion 2).

---

## Mobile App Design (`apps/mobile/src/`)

### Cart state

Context + `useReducer`, following the existing `AuthProvider` pattern in
`features/auth/hooks/use-auth.ts` exactly (no zustand/react-query — neither is installed, and a
single-consumer-tree cart doesn't need them).

### New feature folders (mirroring `features/auth/{hooks,lib}`)

- `features/cart/hooks/use-cart.ts` — `CartProvider`/`useCart()`. State: `{ branchId: string | null;
  items: CartLine[] }`. `CartLine = { lineId, productId, name, unitPriceCents, quantity,
  selectedOptions }`. Actions: `SET_BRANCH` (clears cart on branch change — pickup is
  single-branch per order), `ADD_ITEM`, `UPDATE_QUANTITY`, `REMOVE_ITEM`, `CLEAR`.
- `features/cart/lib/cart-totals.ts` — pure `lineTotalCents`/`cartSubtotalCents` helpers.
- `features/branches/lib/api-client.ts` + `features/branches/hooks/use-branches.ts`
- `features/menu/lib/api-client.ts` + `features/menu/hooks/use-branch-menu.ts`
- `features/orders/lib/api-client.ts` + `features/orders/hooks/use-order.ts`,
  `hooks/use-order-history.ts`, `hooks/use-checkout.ts`

API client fetch wrapper uses `env.apiUrl` (`config/env.ts`) and attaches the session via
`authClient.$fetch` (the better-auth client already used in `features/auth/lib/auth-client.ts`), so
custom routes ride the same persisted session as everything else — no separate auth wiring.

Mount `<CartProvider>` in `apps/mobile/src/app/_layout.tsx` alongside `<AuthProvider>`.

### Screen-by-screen wiring

Replacing each `ComingSoon`, reusing `packages/ui` components (`ProductCard`, `CartItem`,
`FlavorSelector`, `SizeSelector`, `PickupTimeBadge`, `BranchCard`, `OrderStatusBadge`,
`OrderStatusTimeline`, `Button`) — never one-off screen UI, per repo convention.

1. `(tabs)/index.tsx` — wire real navigation for the first time: `BranchCard` press →
   `/(tabs)/branches/[branchId]`; product press → `/(tabs)/order/product/[productId]`.
2. `(tabs)/branches/index.tsx` — fetch `GET /branches`, list via `BranchCard`; tap → `SET_BRANCH` +
   push detail.
3. `(tabs)/branches/[branchId].tsx` — fetch detail + `GET /branches/:id/menu`, render categories
   with `ProductCard` grid; tap product → product screen with `branchId` param.
4. `(tabs)/order/product/[productId].tsx` — `SizeSelector`/`FlavorSelector` + quantity stepper +
   "Add to cart" → `ADD_ITEM` → navigate to cart.
5. `(tabs)/order/cart.tsx` — `CartItem` rows wired to reducer actions, subtotal footer, empty-state
   CTA back to menu (no dead end), "Checkout" → checkout screen.
6. `(tabs)/order/checkout.tsx` — branch name, `PickupTimeBadge`, payment method selector
   (`pay_at_branch` selectable, `online_payment` visible-but-disabled with a "coming soon" label),
   "Place order" → `POST /orders`; on success `CLEAR` cart + `router.replace` to confirmation with
   the real `orderId`; on failure inline error, cart preserved (retryable, no dead end).
7. `(tabs)/order/confirmation/[orderId].tsx` — fetch `GET /orders/:orderId`, show `order_number`
   prominently, `OrderStatusBadge`, formatted `estimated_ready_at`, "Track order" + "Back to home".
8. `(tabs)/order/tracking/[orderId].tsx` and `(tabs)/order/history.tsx` — same
   `GET /orders/:orderId` / `GET /orders`, `OrderStatusTimeline` / list with `OrderStatusBadge`.
   Fetch-on-focus is sufficient for this pass (no polling/websocket).

Remove the temporary un-gated `Dev:` nav links in `order/index.tsx`, `branches/index.tsx`,
`confirmation/[orderId].tsx` once real navigation entry points supersede them (tracked tech debt
per `process/general-plans/backlog/mobile-dev-nav-links-gating_NOTE_09-07-26.md`).

---

## Types Reconciliation (`packages/types/src/`)

- `order.ts` — replace `OrderStatus` with the real 7-value DB enum (`pending | accepted | preparing
  | flavoring | ready | completed | cancelled`); replace `Order` shape to match the API response
  (`id, orderNumber, branchId, status, subtotalCents, discountTotalCents, totalCents,
  paymentMethod, paymentStatus, estimatedReadyAt, placedAt, items: OrderItem[]`); add `OrderItem`.
- `cart.ts` — `CartItem` gains `selectedOptions: SelectedOption[]` and a client `lineId`.
- `pickup.ts` — `PickupBranch` gains `estimatedPrepMinutes`, `isAcceptingPickup`; `isOpen` becomes
  client-computed from `opening_hours` rather than API-sourced.
- New shared `SelectedOption { optionId; optionType: 'size'|'flavor'|'add_on'; name;
  priceDeltaCents }` (new file or added to an existing `types/src/` file).
- Standardize on **cents everywhere in shared types** — the API converts Drizzle `numeric` (string
  decimals) to integer cents at the response boundary, keeping mobile/`packages/ui` decimal-free.
- `packages/ui/src/components/order-status-badge.tsx` and `order-status-timeline.tsx` currently
  hardcode the OLD 6-value enum (`pending/confirmed/preparing/ready_for_pickup/completed/cancelled`)
  — update their `STATUS_META`/sequence maps to the real 7 values with PRD customer-facing labels
  ("Order received", "Confirmed by branch", "Frying now", "Shaking the flavor", "Ready for
  pickup", "Picked up", "Cancelled"), and update their existing tests in `__tests__/` to match.
- `apps/mobile/src/app/component-showcase.tsx` hardcodes a local `ORDER_STATUSES: OrderStatus[]`
  literal (`['pending','confirmed','preparing','ready_for_pickup','completed','cancelled']`,
  line ~155) using the OLD 6-value enum. This file is a consumer of `OrderStatus` not previously
  listed in Touchpoints/Blast Radius/Implementation Checklist — once `OrderStatus` is redefined to
  the new 7-value enum this literal fails `tsc --noEmit`, breaking the repo-wide `pnpm typecheck`
  gate. Update the literal to the new 7 values in the same change.

---

## DB Migration

**None needed.** `orders.order_number` already has `.unique().notNull()`; app-level generate +
retry-on-conflict is sufficient. Seed data already covers `product_options` and
`branch_product_availability` for all products × all branches (`seedProductOptionsTable`,
`seedBranchProductAvailabilityTable` in `packages/api/src/db/seed/seed.ts`), so no seed gap either.

---

## Implementation Checklist

1. `packages/api/src/types/express.d.ts` — augment Express `Request` with `user`/`session`.
2. `packages/api/src/middleware/require-session.ts` — session-check middleware using
   `auth.api.getSession`.
3. `packages/api/src/routes/lib/order-number.ts` — Crockford-base32 `order_number` generator.
4. `packages/api/src/routes/lib/serializers.ts` — numeric-string → cents conversion + menu/order
   shaping helpers.
5. `packages/api/src/routes/branches.ts` — `GET /branches`, `GET /branches/:branchId`,
   `GET /branches/:branchId/menu`.
6. `packages/api/src/routes/orders.ts` — `POST /orders` (transaction per spec above), `GET
   /orders/:orderId`, `GET /orders`.
7. `packages/api/src/index.ts` — mount `branches` and `orders` routers after `express.json()`.
8. `packages/api/src/routes/__tests__/branches.test.ts` — endpoint coverage.
9. `packages/api/src/routes/__tests__/orders.test.ts` — transaction coverage incl. `order_number`
   collision retry, `estimated_ready_at` derivation, two-back-to-back-orders independence (see
   Verification Evidence).
10. `packages/types/src/order.ts` — new `OrderStatus` enum (7 values), `Order`, `OrderItem` shapes.
11. `packages/types/src/cart.ts` — `CartItem` + `SelectedOption` additions.
12. `packages/types/src/pickup.ts` — `PickupBranch` additions, `isOpen` client-computed.
13. New `SelectedOption` shared type (new file or appended to an existing `types/src/` file).
14. `packages/types/src/index.ts` — re-export updates for the above.
15. `packages/ui/src/components/order-status-badge.tsx` — update `STATUS_META` to the real 7-value
    enum + PRD labels; update its test in `__tests__/`.
16. `packages/ui/src/components/order-status-timeline.tsx` — update sequence map to the real
    7-value enum + PRD labels; update its test in `__tests__/`.
17. `apps/mobile/src/app/component-showcase.tsx` — update the local `ORDER_STATUSES` literal to the
    new 7-value `OrderStatus` enum (see Types Reconciliation / SUPPLEMENT REQUEST Gap 2).
18. `apps/mobile/src/features/cart/hooks/use-cart.ts` — `CartProvider`/`useCart()` reducer.
19. `apps/mobile/src/features/cart/lib/cart-totals.ts` — pure total helpers.
20. `apps/mobile/src/features/branches/lib/api-client.ts` +
    `apps/mobile/src/features/branches/hooks/use-branches.ts`.
21. `apps/mobile/src/features/menu/lib/api-client.ts` +
    `apps/mobile/src/features/menu/hooks/use-branch-menu.ts`.
22. `apps/mobile/src/features/orders/lib/api-client.ts` +
    `apps/mobile/src/features/orders/hooks/use-order.ts`, `hooks/use-order-history.ts`,
    `hooks/use-checkout.ts`.
23. `apps/mobile/src/app/_layout.tsx` — mount `<CartProvider>` alongside `<AuthProvider>`.
24. `apps/mobile/src/app/(tabs)/index.tsx` — wire real navigation from Home tab.
25. `apps/mobile/src/app/(tabs)/branches/index.tsx` — real branch list + `SET_BRANCH` on tap.
26. `apps/mobile/src/app/(tabs)/branches/[branchId].tsx` — branch detail + menu render.
27. `apps/mobile/src/app/(tabs)/order/product/[productId].tsx` — size/flavor selection + add to
    cart.
28. `apps/mobile/src/app/(tabs)/order/cart.tsx` — cart review screen.
29. `apps/mobile/src/app/(tabs)/order/checkout.tsx` — checkout + place order. Disable (or show a
    loading state on) the "Place order" button for the duration of the in-flight `POST /orders`
    call, so a double-tap cannot fire two real orders (minor supplement note).
30. `apps/mobile/src/app/(tabs)/order/confirmation/[orderId].tsx` — confirmation screen.
31. `apps/mobile/src/app/(tabs)/order/tracking/[orderId].tsx` — order tracking screen.
32. `apps/mobile/src/app/(tabs)/order/history.tsx` — order history list.
33. Remove un-gated `Dev:` nav links in `order/index.tsx`, `branches/index.tsx`,
    `confirmation/[orderId].tsx` (superseded by real navigation entry points from steps 24–32).
    Verified by the grep-based Fully-Automated gate in Verification Evidence (Gap 4).
34. Run full verification suite (see Verification Evidence) and the cold-open → confirmation
    manual QA script.

---

## Touchpoints

**API — new:**
`packages/api/src/routes/branches.ts`, `packages/api/src/routes/orders.ts`,
`packages/api/src/routes/lib/order-number.ts`, `packages/api/src/routes/lib/serializers.ts`,
`packages/api/src/middleware/require-session.ts`, `packages/api/src/types/express.d.ts`,
`packages/api/src/routes/__tests__/orders.test.ts`,
`packages/api/src/routes/__tests__/branches.test.ts`

**API — modified:** `packages/api/src/index.ts` (mount routers)

**Mobile screens — modified (ComingSoon → real):**
`apps/mobile/src/app/(tabs)/index.tsx`, `(tabs)/branches/index.tsx`,
`(tabs)/branches/[branchId].tsx`, `(tabs)/order/index.tsx`, `order/product/[productId].tsx`,
`order/cart.tsx`, `order/checkout.tsx`, `order/confirmation/[orderId].tsx`,
`order/tracking/[orderId].tsx`, `order/history.tsx`, `apps/mobile/src/app/_layout.tsx` (mount
`CartProvider`)

**Mobile — other modified (breaking-change touchpoint):**
`apps/mobile/src/app/component-showcase.tsx` (update local `ORDER_STATUSES` literal to the new
7-value `OrderStatus` enum — required so `pnpm typecheck` doesn't fail on the breaking rename)

**Mobile state/data layer — new:**
`apps/mobile/src/features/cart/hooks/use-cart.ts`, `features/cart/lib/cart-totals.ts`,
`features/branches/lib/api-client.ts`, `features/branches/hooks/use-branches.ts`,
`features/menu/lib/api-client.ts`, `features/menu/hooks/use-branch-menu.ts`,
`features/orders/lib/api-client.ts`, `features/orders/hooks/use-order.ts`,
`features/orders/hooks/use-order-history.ts`, `features/orders/hooks/use-checkout.ts`

**Shared types — modified:**
`packages/types/src/order.ts`, `cart.ts`, `pickup.ts`, new `SelectedOption` type (new file or
appended to existing), `packages/types/src/index.ts` re-exports;
`packages/ui/src/components/order-status-badge.tsx`, `order-status-timeline.tsx` + their existing
`__tests__/` files

---

## Public Contracts

- **New public API surface** (`packages/api`, mounted under the Express app, alongside existing
  `/api/auth/*`):
  - `GET /branches`, `GET /branches/:branchId`, `GET /branches/:branchId/menu` — unauthenticated
    reads.
  - `POST /orders`, `GET /orders/:orderId`, `GET /orders` — session-gated via
    `require-session.ts`; 401 on missing session, 403 on cross-user `GET /orders/:orderId` access.
  - Response bodies use **integer cents** for all money fields (a new repo-wide convention for this
    surface — Drizzle `numeric` strings are converted at the serializer boundary, never leaked raw).
- **Shared type contract changes** (`packages/types`): `OrderStatus` enum goes from 6 values to the
  real 7-value DB enum — this is a **breaking rename**, not additive. Every existing consumer of the
  old enum (`packages/ui`'s `order-status-badge.tsx`/`order-status-timeline.tsx` and their tests)
  must be updated in the same change (see Implementation Checklist items 15–16); no dual-enum
  transition period.
- **No DB schema changes** — `orders`/`order_items`/`branches`/etc. schemas are consumed as-is; this
  plan reads/writes existing columns only (see DB Migration section).

## Blast Radius

- **Packages touched:** `packages/api` (new routers + middleware + serializers), `packages/types`
  (breaking `OrderStatus` shape change + additive type changes), `packages/ui` (2 existing
  components' status-mapping logic updated), `apps/mobile` (new state layer + 9 screens rewired
  from placeholder to real).
- **File count:** ~34 touched/new files (see Implementation Checklist — 9 new API files, 1 modified
  API file, 4 modified/new `packages/types` files, 2 modified `packages/ui` component files + their
  tests, ~8 new mobile state/data-layer files, ~10 modified mobile screen files, plus
  `apps/mobile/src/app/component-showcase.tsx` — a `OrderStatus`-consumer touchpoint surfaced during
  VALIDATE and folded in here).
- **Risk class:** No auth/billing/schema-migration surface is touched directly, but this plan
  **does** introduce a new authenticated public API surface (`POST /orders`, `GET /orders*`) that
  reads the better-auth session and enforces per-user data isolation (403 on cross-user order
  access) — that authorization boundary is the single highest-risk element in this plan and should
  receive explicit test coverage (see Verification Evidence). No payments/billing processing occurs
  (`online_payment` is disabled this pass); no destructive writes; no DB migration.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Cold-open → confirmation manual QA script: fresh login → Home → tap a branch → menu loads with categories/products → tap a product → select size + flavor → Add to cart → Cart shows correct line total → Checkout → Place order → lands on Confirmation with a non-empty `order_number`, correct branch name, `estimated_ready_at` ≈ `estimated_prep_minutes` from now → "Track order" confirms the same status → navigate to Order History and confirm the just-placed order appears with the correct `order_number`/status/date. No screen in the path is `<ComingSoon>`. | Agent-Probe (manual/scripted QA walkthrough — no E2E harness exists yet per `process/context/tests/all-tests.md`; see `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`) | AC1: full 6-step flow completes with no dead-end / unhandled error; also covers `(tabs)/order/history.tsx` rendering (checklist item 32) |
| Grep gate: no un-gated `Dev:` nav links remain in the order/branches screens. `grep -rn "Dev:" apps/mobile/src/app/\(tabs\)/order/index.tsx apps/mobile/src/app/\(tabs\)/branches/index.tsx "apps/mobile/src/app/(tabs)/order/confirmation/[orderId].tsx"` exits 1 (no matches). | Fully-Automated | Checklist item 33: removal of temporary un-gated `Dev:` nav links |
| Unit test: force a first-attempt `23505` unique-violation on `order_number` insert, assert retry generates a distinct number and the insert succeeds. | Fully-Automated (`packages/api` test runner — vitest, per `process/context/tests/all-tests.md`) | AC2: `order_number` uniqueness (retry-on-collision correctness) |
| Integration test: fire ~20 concurrent `POST /orders` against a real test DB, assert `SELECT count(distinct order_number) = 20`. | Hybrid (requires a running test Postgres instance — precondition, not always available in bare CI) | AC2: `order_number` unique across all orders (DB-level constraint proof) |
| Integration test: seed a branch with a known `estimated_prep_minutes` (e.g. 20), place an order, assert `estimated_ready_at - placed_at` is within a couple seconds of 20 minutes; repeat with a second branch using a non-default prep time to prove the value is read from the branch row, not hardcoded. | Hybrid (requires test DB) | AC3: `estimated_ready_at` set at creation, real future timestamp derived from branch prep time |
| Integration test: same user, two sequential `POST /orders` calls; assert distinct `id`/`order_number`; `GET /orders` returns exactly 2 rows with correct, non-overlapping `order_items` (verified via `order_id` FK scoping). | Hybrid (requires test DB) | AC4: two back-to-back orders produce 2 distinct, independent `orders` rows |
| Regression: `packages/api/src/db/schema/__tests__/smoke.test.ts` passes unmodified (no schema changes in this plan). | Fully-Automated | Regression guard — confirms "no DB migration needed" claim holds |
| Regression: `pnpm --filter @jojopotato/ui test` passes with updated `OrderStatus` fixtures in `order-status-badge`/`order-status-timeline` tests. | Fully-Automated | Regression guard — confirms the breaking `OrderStatus` enum rename doesn't silently break existing UI component tests |
| Session-boundary test: `GET /orders/:orderId` for another user's order returns 403; missing/invalid session on any `/orders*` route returns 401. | Fully-Automated | Blast-Radius risk item — proves the new authenticated API surface's per-user isolation boundary (highest-risk element of this plan) |

## Test Infra Improvement Notes

(none identified yet)

---

## Notes / Known Follow-ups (not this plan)

- `packages/ui`'s `ProductCard`/`BranchCard` vs. the Home tab's local
  `features/home/components/product-card.tsx` duplication is pre-existing and out of scope here —
  this plan reuses `packages/ui` per repo convention but doesn't consolidate the Home-local copies.
- Coupon redemption, staff-side status transitions, and star-earning are deferred to follow-up
  feature work (rewards / staff-app), per the scope decision above.
- No automated E2E/regression harness exists yet for any navigation flow (project-wide gap, see
  `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`) — this is why the
  primary flow-completion gate above is Agent-Probe rather than Fully-Automated.

---

## Validate Contract

Status: PASS
Date: 13-07-26
date: 2026-07-13
generated-by: outer-pvl
supersedes: 2026-07-10 (outer-pvl) — this re-validation pass has current evidence after 1 PVL
supplement cycle (see `results.tsv` cycle 1: `SUPPLEMENT_APPLIED`)

Parallel strategy: sequential (actual — single deep-verification pass by one vc-validate-agent
instance covering all 4 Layer-1 dimensions + 3 Layer-2 sections directly; no Task/Agent spawn
tooling available in this invocation)
Rationale (recommended strategy per 7-signal score): 5/7 signals present — S1 multi-package
(packages/api, apps/mobile, packages/types, packages/ui), S2 new authenticated API surface, S5
explicit request to verify each fix against real source/API rather than trust the text diff, S6
high-risk class (new authenticated, per-user-isolated API surface), S7 ~34 files in blast radius →
HIGH → parallel-subagents or agent-team would be the ordinary recommendation for this fan-out.
Executed sequentially here because this pass runs as a single delegated agent without Task/Agent
spawn tooling; evidence depth was kept equivalent by re-reading every cited source file directly
(`orders.ts` schema, `branches.ts` schema, `packages/api/package.json` for the `drizzle-orm`
version, `packages/ui`'s order-status components + their tests, `packages/types` files,
`component-showcase.tsx`, all 9 mobile screen files named in Touchpoints, `packages/api/vitest.config.ts`)
and by running the structural validator script, rather than summarizing from the plan text alone.

### Fix Verification (this re-validation's core task)

Each of the 5 prior-pass fixes was independently re-verified against source, not just checked for
text presence:

1. **`order_number` retry rewrite (Gap 1a):** plan text now specifies
   `db.insert(orders).values({...}).onConflictDoNothing({ target: orders.order_number }).returning()`
   in a retry loop (API Design step 4, lines ~134–141). Confirmed against `packages/api/package.json`
   (`drizzle-orm: ^0.45.2`) that `.onConflictDoNothing({ target })` is a real, current Drizzle
   Postgres API — it never throws on conflict (returns an empty row set instead), so the surrounding
   `db.transaction()` never enters Postgres's aborted-transaction state. Confirmed `orders.order_number`
   is `varchar('order_number').unique().notNull()` in `packages/api/src/db/schema/orders.ts` — the
   unique constraint the retry loop depends on is real. **Verified correct — CONCERN resolved.**
2. **`fromNodeHeaders` signature fix (Gap 1b):** plan text now specifies
   `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })` (was `fromNodeHeaders(req)`) and
   no longer claims this pattern is already established in `src/lib/auth.ts`. Confirmed via
   `grep -n "toNodeHandler|fromNodeHeaders|getSession" packages/api/src/index.ts packages/api/src/lib/auth.ts`
   that the repo's only existing `better-auth/node` usage is `toNodeHandler(auth)` in `index.ts` — the
   plan's revised, more modest claim ("first-use, not an established pattern") is now accurate.
   **Verified correct — CONCERN resolved.**
3. **`component-showcase.tsx` touchpoint (Gap 2):** confirmed via
   `grep -n "ORDER_STATUSES|OrderStatus" apps/mobile/src/app/component-showcase.tsx` that the file
   exists, imports `OrderStatus`, and hardcodes `ORDER_STATUSES: OrderStatus[]` at line 155 exactly
   as described. Now present in Types Reconciliation, Touchpoints ("Mobile — other modified"), and
   Implementation Checklist item 17. Re-ran `grep -rl "OrderStatus" apps/ packages/` to confirm no
   other consumer was missed — result set (component-showcase.tsx, order-status-badge.tsx +
   order-status-timeline.tsx + their tests, order.ts, barrel-import.test.tsx) matches the plan's
   coverage exactly; `barrel-import.test.tsx` only asserts export names (re-confirmed), unaffected.
   **Verified correct and complete — CONCERN resolved.**
4. **History screen + `Dev:` nav-link gates (Gaps 3 & 4):** confirmed `apps/mobile/src/app/(tabs)/order/history.tsx`
   exists (checklist item 32) and Verification Evidence row 1 explicitly extends the QA script to
   cover it ("also covers `(tabs)/order/history.tsx` rendering (checklist item 32)"). Confirmed the
   new Fully-Automated grep gate (`grep -rn "Dev:" order/index.tsx branches/index.tsx
   confirmation/[orderId].tsx`, expects exit 1) is meaningful, not vacuous: direct `grep` against the
   current file contents confirms all 3 named files presently DO contain `Dev:` nav links (3 in
   `order/index.tsx`, 1 in `branches/index.tsx`, 1 in `confirmation/[orderId].tsx`), so the gate will
   correctly fail pre-removal and pass post-removal. **Verified correct — CONCERNs resolved.**
5. **Checkout double-submit guard (minor):** confirmed Implementation Checklist item 29 now states
   the "Place order" button must be disabled/loading for the duration of the in-flight `POST /orders`
   call. Execute-Agent Instruction E2 (below) retained as a belt-and-suspenders reminder.
   **Verified correct — minor concern resolved.**

No new gaps were introduced by any of the 5 fixes; all referenced files (`orders.ts`/`branches.ts`
schema, all 9 mobile screens named in Touchpoints, `packages/types/src/{order,cart,pickup,index}.ts`,
both `packages/ui` order-status components + their existing `__tests__/` files) exist on disk and
match the plan's descriptions.

### Layer 1 — Dimension Findings

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | PASS |
| Breaking changes | PASS |
| Security surface | PASS |

- **Infra fit — PASS:** both prior CONCERNs (order_number retry-in-transaction semantics;
  `fromNodeHeaders` signature/citation) are corrected and verified against real Drizzle/better-auth
  APIs (see Fix Verification #1–2). `db.transaction` remains a supported, standard API on the
  `drizzle-orm/node-postgres` driver already wired in `db/client.ts`.
- **Test coverage — PASS:** both prior gaps (`(tabs)/order/history.tsx` and `Dev:` nav-link removal
  had zero gate of any tier) are now closed with a QA-script extension and a new Fully-Automated grep
  gate respectively (see Fix Verification #4). The Fully-Automated / Hybrid / Agent-Probe / Known-Gap
  split remains a defensible tier assignment — no developed behavior in this plan's blast radius now
  rests on Known-Gap alone (see Net-Gate Vacuous-Green Check below).
- **Breaking changes — PASS:** the previously-missed `component-showcase.tsx` consumer of the
  breaking `OrderStatus` rename is now fully accounted for in Touchpoints/Blast Radius/Implementation
  Checklist (see Fix Verification #3); a fresh `grep -rl "OrderStatus"` sweep confirms no consumer
  remains unlisted.
- **Security surface — PASS (unchanged from prior pass):** `/orders*` routes remain session-gated
  with explicit per-user isolation (403 cross-user, 401 missing/invalid session), covered by a
  dedicated Fully-Automated test row. `POST /orders` recomputes price server-side. `role` remains
  server-owned, unrelated to this plan. No secrets/billing/destructive-write surface touched.

### Layer 2 — Section Feasibility

| Layer 2 sections | Status |
|---|---|
| API Design (`packages/api/src/`) | PASS |
| Mobile App Design (`apps/mobile/src/`) | PASS |
| Types Reconciliation (`packages/types/src/`) | PASS |

- **Section: API Design (`packages/api/src/`)**
  - Mechanical feasibility: PASS — all named file paths are new/creatable, no naming collisions;
    endpoint shapes match the actual `orders`/`order_items`/`branches`/`product_options`/
    `branch_product_availability` schema columns (re-confirmed by direct read of `orders.ts` and
    `branches.ts` in this pass).
  - Gaps found: none remaining — order_number retry semantics and `fromNodeHeaders` signature are
    both corrected (Fix Verification #1–2).
  - Conflicts found: none.
  - Highest-risk edit + mitigation: `POST /orders` transaction body (order-number retry + server-side
    price recompute) — mitigation is now the corrected, verified `onConflictDoNothing`-loop pattern
    (Execute-Agent Instruction E1), to be covered by the planned Hybrid concurrency test before
    promoting to `CODE DONE`.

- **Section: Mobile App Design (`apps/mobile/src/`)**
  - Mechanical feasibility: PASS — confirmed all 9 named mobile screen files exist on disk (checked
    directly in this pass: `order/index.tsx`, `branches/index.tsx`,
    `confirmation/[orderId].tsx`, `history.tsx`, `tracking/[orderId].tsx`, `cart.tsx`,
    `checkout.tsx`, `product/[productId].tsx`, `branches/[branchId].tsx`, `_layout.tsx`), and
    `authClient.$fetch`/`env.apiUrl`/`AuthProvider` mirroring pattern are all real, already-wired
    mechanisms.
  - Gaps found: none remaining — `component-showcase.tsx` touchpoint gap and history/dev-link
    Verification Evidence gaps are both closed (Fix Verification #3–4).
  - Conflicts found: none.
  - Highest-risk edit + mitigation: `checkout.tsx` "Place order" handler — mitigated by
    Implementation Checklist item 29's disable/loading-state requirement (Execute-Agent Instruction
    E2), verified present in this pass.

- **Section: Types Reconciliation (`packages/types/src/`)**
  - Mechanical feasibility: PASS — `packages/types/src/index.ts` uses wildcard re-exports, so the
    additive `SelectedOption` type and `Order`/`OrderItem` shape changes fit cleanly.
  - Gaps found: none.
  - Conflicts found: none.
  - Highest-risk edit + mitigation: the `OrderStatus` breaking rename itself — mitigated by
    Implementation Checklist items 15–17 (all 3 real consumers, including the previously-missing
    `component-showcase.tsx`, now covered).

**Totals: 0 FAILs / 0 CONCERNs / 7 PASSes**

**→ Net Gate: PASS** (all 5 prior-pass concerns independently re-verified as correctly resolved
against real source/schema/dependency evidence; no new gaps introduced)

### Net-Gate Vacuous-Green Check

Scanned the full blast radius for developed behavior with zero automated/hybrid/agent-probe gate.
Result: every developed behavior has at least one Fully-Automated, Hybrid, or Agent-Probe gate (see
Test Gates table below). The only items resting on Known-Gap are explicitly named residuals
(mobile-side unit/component test runner absence; true-simultaneous double-submit), both of which
are pre-existing/documented gaps with alternative coverage (typecheck/lint + Agent-Probe for the
former; UI-layer disable-on-submit mitigation for the latter) — not the sole proof for any
behavior. PASS is not vacuous.

### III. Test Coverage Plan (C3 5-column table)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC2-retry | `order_number` retry succeeds after forced first-attempt `23505` | Fully-Automated | `pnpm --filter @jojopotato/api test` — new case in `orders.test.ts` | B |
| SEC1-crossuser | `GET /orders/:orderId` returns 403 for another user's order | Fully-Automated | `pnpm --filter @jojopotato/api test` — new case in `orders.test.ts` | B |
| SEC1-session | 401 on missing/invalid session on any `/orders*` route | Fully-Automated | `pnpm --filter @jojopotato/api test` — new case in `orders.test.ts` | B |
| REG-schema | No DB migration introduced (schema untouched) | Fully-Automated | `pnpm --filter @jojopotato/api test` — `src/db/schema/__tests__/smoke.test.ts` (unmodified) | A |
| GAP4-devlinks | Un-gated `Dev:` nav links removed from order/branches screens | Fully-Automated | `grep -rn "Dev:" apps/mobile/src/app/\(tabs\)/order/index.tsx apps/mobile/src/app/\(tabs\)/branches/index.tsx "apps/mobile/src/app/(tabs)/order/confirmation/[orderId].tsx"` exits 1 | B |
| REG-ui | `OrderStatus` rename doesn't break `packages/ui` components | Fully-Automated | `pnpm --filter @jojopotato/ui test` (updated `order-status-badge`/`order-status-timeline` fixtures) | B |
| TYPE-crosspackage | All packages compile against new/changed shared types incl. `component-showcase.tsx` | Fully-Automated | `pnpm typecheck` (root, via turbo) — run only after `component-showcase.tsx` literal is updated | B |
| LINT-mobile | Mobile package compiles/lints clean | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` / `pnpm --filter @jojopotato/mobile lint` | B |
| AC2-concurrency | ~20 concurrent `POST /orders` produce 20 distinct `order_number`s | Hybrid | `pnpm --filter @jojopotato/api test` — precondition: `docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate` | B |
| AC3-timestamp | `estimated_ready_at` derives from branch `estimated_prep_minutes` at placement time | Hybrid | same precondition as above | B |
| AC4-independence | Two sequential `POST /orders` produce 2 distinct, independent `orders` rows | Hybrid | same precondition as above | B |
| AC1-happypath | Cold-open → confirmation walkthrough, no dead ends, incl. order history | Agent-Probe | Verification Evidence row 1 (QA script, extended per Gap 3) | B |
| KNOWN-mobile-unit | Automated component/unit coverage for new mobile screens + `CartProvider` reducer | — (Known-Gap) | — | D — pre-existing project-wide gap (`process/context/tests/all-tests.md` §Known Gaps); mitigated by typecheck/lint + Agent-Probe |
| KNOWN-simultaneous | True simultaneous (not sequential) double-submit of `POST /orders` | — (Known-Gap) | — | D — mitigated at UI layer only (Execute-Agent Instruction E2); backend concurrency test (AC2-concurrency) covers distinct-order-number collision, not literal same-instant double-tap timing |

gap-resolution legend:
- A — proven now (gate passes in this cycle: schema-smoke test is unmodified/pre-existing and green)
- B — fixed in this plan (gate added by this plan's checklist; will run and prove out at EXECUTE — no code exists yet, this is pre-EXECUTE VALIDATE)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form (retained so existing validate-contract consumers still parse):
- `packages/api` routes: Fully-automated: `pnpm --filter @jojopotato/api test` | Hybrid: `pnpm --filter @jojopotato/api test` + `docker compose up -d` && `db:migrate` | Agent-probe: cold-open→confirmation QA script | Known-gap: true-simultaneous double-submit (mitigated at UI layer)
- `packages/ui` order-status components: Fully-automated: `pnpm --filter @jojopotato/ui test`
- `packages/types` cross-package contract: Fully-automated: `pnpm typecheck`
- `apps/mobile` state layer + screens: Fully-automated: `pnpm --filter @jojopotato/mobile typecheck` + `pnpm --filter @jojopotato/mobile lint` | Agent-probe: cold-open→confirmation QA script | Known-gap: no RN unit/component test runner exists yet

Failing stub — `order_number` retry:
```
test("should regenerate order_number and succeed after a forced first-attempt 23505 collision", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: order_number retry-on-collision correctness")
})
```

Failing stub — session boundary:
```
test("should return 403 on GET /orders/:orderId for another user's order", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: cross-user order access returns 403")
})
test("should return 401 on /orders* routes with missing or invalid session", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: missing/invalid session returns 401")
})
```

Failing stub — `Dev:` nav-link removal:
```
test("should have no un-gated Dev: nav links remaining in order/branches screens", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: Dev: nav link removal (grep-based gate, checklist item 33)")
})
```

Failing stub — repo-wide typecheck coverage of the breaking rename:
```
test("component-showcase.tsx ORDER_STATUSES literal matches the 7-value OrderStatus enum", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: component-showcase.tsx updated to the new enum")
})
```
(Enforced in practice by `pnpm typecheck` once `component-showcase.tsx` is updated per checklist item 17.)

**Missing test areas**

| Area | Why untestable in this plan | Resolution chosen |
|---|---|---|
| True simultaneous (not just sequential) double-submit of `POST /orders` | Requires precise request-timing control beyond the planned Hybrid concurrency test's scope | C — accept as known-gap; mitigated at the UX layer by E2's disable-on-submit guard |
| Automated component/unit coverage for new mobile screens and `CartProvider` reducer | No RN test runner exists yet (project-wide gap) | D — backlog residual, tracked in `process/context/tests/all-tests.md` §Known Gaps |

### Dimension findings

- Infra fit: PASS — order_number retry (onConflictDoNothing loop) and require-session
  (`fromNodeHeaders(req.headers)`) both verified against real Drizzle/better-auth APIs.
- Test coverage: PASS — history screen and Dev:-nav-link removal now have explicit gates; no
  developed behavior rests on Known-Gap alone.
- Breaking changes: PASS — `component-showcase.tsx` now fully accounted for; fresh sweep confirms
  no other `OrderStatus` consumer is missing.
- Security surface: PASS — session-gated `/orders*` with per-user isolation, unchanged from prior
  pass, still sound.

### Execute-Agent Instructions

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | Implement `POST /orders`'s order_number retry using `db.insert(orders).values({...}).onConflictDoNothing({ target: orders.order_number }).returning()` in a loop (regenerate `order_number` and retry up to 5 times while the returned row set is empty; respond 500 after 5 empty attempts) — this never throws on collision, so the surrounding `db.transaction()` never aborts. Do NOT implement a bare `try/catch` on `error.code === '23505'` with a plain retry insert inside the same transaction. Separately, call `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })` in `require-session.ts` (note: `req.headers`, not `req`). | `packages/api/src/routes/orders.ts` (order-number retry) and `packages/api/src/middleware/require-session.ts` (session lookup) — Implementation Checklist items 2, 6 |
| E2 | Disable (or show a loading state on) the "Place order" button in `checkout.tsx` for the duration of the in-flight `POST /orders` call, so a double-tap cannot fire two real orders. This is a UX mitigation, not a backend correctness requirement — Goal 4 / AC4 is already satisfied by the transaction design regardless. | `apps/mobile/src/app/(tabs)/order/checkout.tsx` — Implementation Checklist item 29 |
| E3 | Run `pnpm typecheck` only AFTER `component-showcase.tsx`'s `ORDER_STATUSES` literal is updated to the 7-value enum (checklist item 17) — running it before will surface an already-known, already-planned-for failure. | `apps/mobile/src/app/component-showcase.tsx` — Implementation Checklist item 17 |

### What This Coverage Does NOT Prove

- The `packages/api` Fully-Automated and Hybrid gates prove backend correctness of the order flow
  (uniqueness, timestamp derivation, per-order independence, session isolation) but do NOT prove
  anything about the mobile UI rendering that data correctly — that is the Agent-Probe script's job.
- The Agent-Probe cold-open QA script proves the *happy path* completes with no dead ends; it does
  NOT prove error-path behavior (e.g. network failure mid-checkout, a 500 from the retry-exhaustion
  case, an expired session mid-flow) — none of these are covered by any gate in this contract.
- `pnpm typecheck`/`pnpm lint` prove structural/type integrity across packages; they do NOT prove
  runtime behavior, visual correctness, or accessibility.
- The Hybrid concurrency test (~20 simulated concurrent orders) proves uniqueness holds at that
  scale; it does NOT prove behavior at materially higher real-world concurrency, and it does NOT
  prove true *simultaneous* double-submit from a single user is prevented at the backend (mitigated
  only at the UI layer by E2).
- No gate in this contract exercises `online_payment` (intentionally disabled this pass) or coupon/
  discount logic (intentionally deferred, `discount_total` stays `0`).
- None of these gates have been RUN yet — this plan is still pre-EXECUTE (`CODE DONE`/`VERIFIED`
  states per Phase Completion Rules have not been reached). This validate-contract certifies the
  plan and its gates are sound and ready to execute against, not that the gates have passed.

Open gaps: none blocking EXECUTE. Two documented known-gaps carried forward (see Missing test areas
table above): true-simultaneous double-submit (mitigated at UI layer) and no RN unit/component test
runner (project-wide, pre-existing).

Gate: PASS (0 FAILs, 0 CONCERNs — all 5 prior-pass concerns independently re-verified as resolved
against real source/schema/API evidence in this re-validation pass; 2 known-gaps documented with
non-blocking mitigations, per Net-Gate Vacuous-Green Check)
Accepted by: N/A — Gate is PASS; no CONCERNs require acceptance. The 2 documented known-gaps
(true-simultaneous double-submit; no RN test runner) are pre-existing/mitigated residuals, not
blocking concerns requiring sign-off.

---

## Autonomous Goal Block

SESSION GOAL: Wire the customer pickup-order flow end-to-end (branch → menu → customize → cart →
review → place order → confirmation), satisfying AC1–AC4 (no-dead-end flow, unique order_number,
correct estimated_ready_at, independent back-to-back orders).
Charter + umbrella plan: N/A — single plan, not a phase program
(process/general-plans/active/pickup-order-flow_10-07-26/pickup-order-flow_PLAN_10-07-26.md).
Autonomy: Under a standing /goal: proceed directly to EXECUTE (validate-contract is now PASS,
after 1 completed PVL-supplement cycle). Outside /goal: surface this PASS contract to the user and
await explicit "ENTER EXECUTE MODE" before spawning vc-execute-agent.
Hard stop conditions / safety constraints:
- Do not implement the `POST /orders` order-number retry as a bare catch-and-retry inside the
  single `db.transaction()` — use the verified `onConflictDoNothing`-loop pattern (Execute-Agent
  Instruction E1).
- Do not treat `CODE DONE` as `VERIFIED` — the EVL confirmation run (independent vc-tester re-run
  of these gate commands) must be green first.
- Do not enable `online_payment` as a selectable checkout method — it must stay visible-but-disabled
  this pass; no payment processor is chosen yet.
- Do not skip updating `apps/mobile/src/app/component-showcase.tsx`'s `ORDER_STATUSES` literal —
  omitting it will fail `pnpm typecheck` repo-wide (Execute-Agent Instruction E3).
- Do not run `pnpm typecheck` before `component-showcase.tsx` is updated — see E3.
Next phase: EXECUTE —
process/general-plans/active/pickup-order-flow_10-07-26/pickup-order-flow_PLAN_10-07-26.md
(validate-contract: Gate PASS, generated-by outer-pvl, 13-07-26).
Validate contract: inline in plan (`## Validate Contract` section above).
Execute start: fully-auto commands: `pnpm typecheck` (AFTER component-showcase.tsx fix — E3),
`pnpm lint`, `pnpm --filter @jojopotato/api test` (needs `docker compose up -d` + `db:migrate`),
`pnpm --filter @jojopotato/ui test`, `pnpm --filter @jojopotato/mobile typecheck`, `pnpm --filter
@jojopotato/mobile lint` | e2e spec: none (no harness) | probe scenario: cold-open → confirmation
manual QA script (Verification Evidence row 1, includes order history) | high-risk pack: no (no
auth/billing/migration surface is directly modified; the new authenticated API surface is covered
by SEC1/E1, not a 6-class high-risk trigger per `vc-risk-evidence-pack`).

---

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/general-plans/active/pickup-order-flow_10-07-26/pickup-order-flow_PLAN_10-07-26.md`
2. **Last completed phase or step:** VALIDATE (V1–V7 re-run fresh after 1 PVL-supplement cycle) —
   Gate: PASS.
3. **Validate-contract status:** written (13-07-26), `Gate: PASS`, `generated-by: outer-pvl`,
   supersedes the 10-07-26 first-pass CONDITIONAL contract. See `## Validate Contract` above for
   the full re-verification evidence, dimension findings, and test coverage plan.
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, `process/development-protocols/orchestration.md`
   (§VALIDATE Gate), plus direct reads of `packages/api/src/db/schema/orders.ts`,
   `packages/api/src/db/schema/branches.ts`, `packages/api/package.json` (drizzle-orm version),
   `packages/api/src/index.ts`, `packages/ui/src/components/order-status-{badge,timeline}.tsx` +
   their `__tests__/` files, `apps/mobile/src/app/component-showcase.tsx`, all 9 mobile screen
   files named in Touchpoints, `packages/api/vitest.config.ts`, and the plan-artifact structural
   validator (`validate-plan-artifact.mjs` — 0 failures, 0 warnings).
5. **Next step for a fresh agent picking up mid-execution:** spawn `vc-execute-agent` against this
   plan file. Pass the validate-contract's Test Gates table (C3 5-column) and Execute-Agent
   Instructions E1–E3 as explicit execution constraints. EXECUTE is legal — validate-contract Gate
   is PASS with 1 completed PVL-supplement cycle on record (`results.tsv`: cycle 0 baseline
   CONDITIONAL, cycle 1 `SUPPLEMENT_APPLIED`, this pass is the post-supplement V1–V7 re-run).
