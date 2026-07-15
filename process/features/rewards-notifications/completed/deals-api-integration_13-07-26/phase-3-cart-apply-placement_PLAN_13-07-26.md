---
name: plan:deals-api-integration-phase-3-cart-apply-placement
description: "Deals API Integration — Phase 3: cart apply (browse→details→Apply→cart) + server-authoritative placement discount/eligibility + orders.deal_id migration — DEAL-003 / #24 (HIGH RISK)"
date: 13-07-26
feature: rewards-notifications
metadata:
  node_type: memory
  type: plan
  feature: rewards-notifications
  phase: phase-3
---

# Phase 3 — Cart Apply + Placement Validation (DEAL-003 / #24)

**Date**: 13-07-26 (full plan authored 14-07-26)
**Status**: ✅ VERIFIED (EVL-confirmed clean 14-07-26; high-risk evidence pack complete + validator-clean; PHASE COMPLETE — archived to `completed/`)
**Complexity**: COMPLEX (3 packages, ~9 touchpoints, HIGH risk — billing + schema migration + placement transaction)

**Program:** deals-api-integration
**Umbrella plan:** process/features/rewards-notifications/active/deals-api-integration_13-07-26/deals-api-integration_UMBRELLA_13-07-26.md
**Report destination:** process/features/rewards-notifications/active/deals-api-integration_13-07-26/phase-3-cart-apply-placement_REPORT_13-07-26.md
**Risk:** HIGH — 3 of 6 high-risk classes (billing/credits + schema/migration + public API contract). **Requires the High-Risk Execution Handoff (manual-first evidence pack per `vc-risk-evidence-pack`) BEFORE finalize — a hard stop, not autonomously skippable.**
**GitHub issue:** #24 DEAL-003
**Filename note:** renamed from the `_STUB_` scaffold to `_PLAN_` now that the full plan is authored (matches Phase 1/2 convention). Umbrella + registry references still resolve (registry claim unchanged — see Blast Radius).

---

## TL;DR

Make applying a deal in the cart real and money-safe. Three moving parts:

1. **Schema:** add a nullable `orders.deal_id` uuid FK→`deals` (migration `0004`, generated into `packages/api/drizzle/`).
2. **Server (the real work):** rewrite `POST /orders` to accept an optional `dealId`, and — INSIDE the existing placement transaction, AFTER subtotal is computed and BEFORE the order insert — `SELECT … FOR UPDATE` the deal row, reject the 4 complex deal types, re-run the 6-step eligibility server-side against a freshly-read deal + live usage counts, compute a REAL `discount_total` for `percentage_discount`/`fixed_discount` ONLY (from the raw DB value — never a client-sent amount), write `total = subtotal − discount`, and persist `orders.deal_id`. All atomic.
3. **Mobile:** wire the browse→Deal Details→**Apply**→cart flow for real (replacing Phase 2's deferred Alert); send `dealId` from `cart.appliedDiscount` at checkout; **delete the cart's coupon/deal code-input UI** (the `deals` table has no `code` column, so it could never resolve a real deal); fix the checkout "Total" display bug (shows subtotal today). **Preserve `useReorderConflicts()` untouched.**

Server owns ALL money math. Coupons stay deferred. No `deal_usages` table (usage derives from `orders.deal_id`). `packages/api` vitest+supertest is the automated gate; `apps/mobile` cart→checkout UX is Agent-Probe (no RN runner).

---

## Overview

Phases 1+2 built the read surface: `GET /deals` (list), `GET /deals/:id` (details), `serializeDeal`, and the client eligibility engine as DISPLAY. Phase 3 is the WRITE surface and the program's only billing/schema/transaction phase. It closes the loop: a customer browses deals (#22), opens Deal Details (#23), taps **Apply** (now real), lands in the cart with the deal applied, and at checkout the SERVER — not the client — re-validates the deal against fresh state and computes the actual discount that is charged and persisted.

The security spine is **server authority over money**: `createOrderSchema` never accepted price fields (server recomputes item prices from the DB), and it must not start trusting a client discount now. The client's `AppliedDiscount.amountCents` is a DISPLAY optimism; the number that hits the DB is computed server-side from the raw `deals.discount_value`.

### Goal (from locked scope)

- Server-authoritative deal apply at order placement: real discount for `percentage_discount`/`fixed_discount` only, atomic eligibility re-validation + discount + `orders.deal_id` write, cart sends `dealId`. The 4 complex deal types are rejected at placement (400) — never a guessed discount.

---

## Architecture Decisions

RESEARCH is complete; INNOVATE's open questions were resolved by explicit user decision this session. The 5 LOCKED decisions below are encoded, not re-opened. Remaining choices are mechanical (established repo patterns dictate them).

### 1. DECISION (LOCKED): Usage-limit race safety = LOCK the deal row (`SELECT … FOR UPDATE`).

Inside the `POST /orders` transaction, before reading usage counts, acquire a row lock on the target `deals` row: drizzle `.for('update')` on the deal `select`. This serializes concurrent placements against the SAME deal so two simultaneous orders cannot both pass a `usage_limit_per_user`/`total_usage_limit` check that only one should. **WHY:** usage is derived from `orders.deal_id` (no `deal_usages` table — charter constraint); without the lock, two concurrent placements read the same pre-insert count and both succeed. Row-level `FOR UPDATE` is the standard serialization primitive and only adds contention when the same deal is hit concurrently (the common case — different deals or no deal — is unaffected). **REJECTED:** a separate `deal_usages` counter table (charter forbids it); advisory locks / SERIALIZABLE isolation (heavier, repo has no precedent); trusting the app-level count without a lock (the actual race bug).

### 2. DECISION (LOCKED): Remove the cart's coupon/deal code-input UI entirely.

Delete the "Enter coupon code" `Input` + "Apply" button + `handleApplyCoupon` + `couponCode` state from `cart.tsx`, and delete `resolveAndApplyDeal(code, …)` from `apply-deal.ts` (cart's `handleApplyCoupon` is its ONLY caller — verified). **WHY:** the `deals` table has NO `code` column (`serializeDeal` hard-sets `code: undefined`), so `resolveAndApplyDeal` can never resolve a real deal — the input is dead against real data. The ONLY real apply path is browse deals (#22) → Deal Details (#23) → **Apply** CTA (decision 5) → cart. **REJECTED:** keeping the input wired to `MOCK_DEALS` (would be a fake feature that resolves nothing real); adding a `code` column now (out of scope; coupons deferred).

### 3. DECISION (LOCKED): Reject the 4 complex deal types at placement (400).

If the `dealId` in `POST /orders` resolves to `buy_one_take_one` | `free_item` | `free_upgrade` | `bundle`, return `400 { error: 'This deal cannot be applied at checkout yet' }` — do NOT persist `deal_id` with a zero/guessed `discount_total`. Only `percentage_discount` and `fixed_discount` compute a real server-side discount. **WHY:** the charter forbids charging a guessed discount for complex types; `serializeDeal` already returns `discountValue: 0` for them, and the client `computeDealDiscountCents` uses a mock "cheapest eligible line" heuristic that is explicitly NOT a real pricing engine. Persisting `deal_id` with `discount_total = 0` would silently record a "deal applied" that gave nothing. **REJECTED:** persisting `deal_id` with `0` discount (misleading order record); implementing real BOGO/bundle pricing (large out-of-scope pricing-engine work).

### 4. DECISION (LOCKED): `orders.deal_id` = nullable uuid, `.references(() => deals.id)`, NO explicit `onDelete` (NO ACTION).

Matches the existing `orders.user_id` / `orders.branch_id` FK precedent in `schema/orders.ts` (both plain `.references(() => x.id)` with no `onDelete`, Postgres default NO ACTION). **WHY:** consistency with the established FK convention; a deal referenced by a placed order should not be deletable (NO ACTION rejects the delete), which is the correct audit behavior. **REJECTED:** `onDelete: 'set null'` (would silently erase the deal linkage from historical orders); `onDelete: 'cascade'` (would delete orders when a deal is deleted — catastrophic).

### 5. DECISION (LOCKED): Add `dealId` to `ApiOrder` + `serializeOrder` (and the client `Order` type).

`serializeOrder` gains `dealId: order.deal_id` (`string | null`, null when no deal applied). Added to `ApiOrder` (serializers.ts) and the client `Order` type (`packages/types/src/order.ts`) so the shapes stay aligned and future order-history "deal applied" display is enabled cheaply. **WHY:** near-free once the column exists; enables downstream UX without a second migration. **REJECTED:** omitting it (would need another serializer change + type churn later).

### 6. DECISION (mechanical): Server-side eligibility is freshly authored in `orders.ts`, kept 1:1 with the client engine's ordering/reasons — NOT a shared import.

Port the 6-step order/reasons from `apps/mobile/.../eligibility.ts` into `orders.ts` server-side logic (against the raw `deals` row + join tables + live usage counts). **WHY:** RESEARCH infra note — `packages/api` does not take a workspace dependency on `apps/mobile` (wrong direction) and the client engine reads the serialized `Deal` shape + a mock `DealUsageRecord[]`, not raw rows. Keeping the ordering/reason-codes 1:1 keeps client DISPLAY and server AUTHORITY consistent. **REJECTED:** importing the mobile engine into the API (illegal dependency direction); extracting a shared package (scope creep — one consumer each side, different data shapes).

### 7. DECISION (mechanical): Compute discount from the RAW `deals.discount_value` decimal string, never from `serializeDeal` output and never from any client-sent amount.

`serializeDeal`'s already-converted value is for API RESPONSES; inside the tx we read the raw row. `fixed_discount`: `Math.max(0, Math.min(Math.round(Number(deal.discount_value) * 100), subtotalCents))`. `percentage_discount`: `Math.max(0, Math.min(Math.round(subtotalCents * Number(deal.discount_value) / 100), subtotalCents))`. Both clamps are mandatory: `Math.min(…, subtotalCents)` caps the discount at the subtotal; `Math.max(0, …)` floors it at zero so a negative/garbage raw value can never produce a negative discount (PVL C2). **WHY:** server authority over money (the hard safety constraint); mirrors the existing item-price recompute (`Math.round(Number(product.base_price) * 100)`). **REJECTED:** trusting `cart.appliedDiscount.amountCents` (client-controlled — the exact thing server authority forbids); reading via `serializeDeal` (an extra conversion round-trip, and couples tx logic to the response serializer).

### 8. DECISION (mechanical): Fix the checkout "Total" display bug as part of this phase.

`checkout.tsx` currently renders `formatCurrency(subtotalCents)` under the "Total" label. Change to show `totalCents` (and ideally a subtotal / discount / total breakdown). **WHY:** once a real discount exists, showing the subtotal as "Total" is a money-display defect the user would see at the exact moment a deal is applied. In-scope because it is the same file that gains the `dealId` pass-through. **REJECTED:** deferring (would ship a visible money bug alongside the feature that creates the discrepancy).

---

## Public Contracts

### Migration `0004_*.sql` (NEW — generated)

- Adds `orders.deal_id uuid` — nullable, `REFERENCES deals(id)` (NO ACTION on delete/update). Generated by `pnpm --filter @jojopotato/api db:generate` after editing `schema/orders.ts`; lands in `packages/api/drizzle/` (next free slot `0004`). No data backfill (nullable, existing rows get NULL).

### `POST /orders` (CHANGED — public API contract)

- **Request body:** `createOrderSchema` gains `dealId: z.string().uuid().optional()`. All existing fields unchanged. Backward-compatible: a body WITHOUT `dealId` behaves exactly as today (`discount_total = 0.00`, `total = subtotal`, `deal_id = null`).
- **New behavior when `dealId` present** (inside the existing `db.transaction`):
  1. `SELECT … FROM deals WHERE id = dealId AND is_active = true FOR UPDATE` — not found/inactive → `400 { error: 'Deal not found or inactive' }`.
  2. Complex-type reject (decision 3) → `400 { error: 'This deal cannot be applied at checkout yet' }`.
  3. 6-step eligibility (decision 6) → first failure returns `400` with the reason-specific message.
  4. Real discount (decision 7), clamped to subtotal.
  5. Order insert `.values({ …, discount_total: centsToNumeric(discountCents), total: centsToNumeric(subtotalCents - discountCents), deal_id: dealId })`.
- **Response:** `201 { order: ApiOrder }` — `ApiOrder` now includes `dealId` and real `discountTotalCents`/`totalCents`.
- All discount/eligibility rejections throw `OrderError(400, …)` inside the tx → the whole placement rolls back (atomic; no partial order).

### Server-side discount helper (NEW — internal to `orders.ts`)

```ts
// discountValue is the RAW deals.discount_value decimal string (e.g. "50.00").
function computeDealDiscountCents(
  dealType: 'percentage_discount' | 'fixed_discount',
  discountValue: string,
  subtotalCents: number,
): number
// fixed_discount    → Math.max(0, Math.min(Math.round(Number(discountValue) * 100), subtotalCents))
// percentage_discount → Math.max(0, Math.min(Math.round(subtotalCents * Number(discountValue) / 100), subtotalCents))
// Both clamps are MANDATORY (PVL C2): inner Math.min(…, subtotalCents) upper-bounds the discount so it can
//   never exceed the subtotal; outer Math.max(0, …) lower-bounds it so a negative/garbage raw
//   deals.discount_value can never produce a negative discount (which would make total > subtotal). See Validate Contract C2.
```

(Name shadows the mobile `computeDealDiscountCents` in a different package — no clash; server version takes raw value + type only, no cart heuristics.)

### `ApiOrder` / `Order` (CHANGED — additive)

- `ApiOrder` (serializers.ts) gains `dealId: string | null`; `serializeOrder` sets it from `order.deal_id`.
- Client `Order` (`packages/types/src/order.ts`) gains `dealId: string | null` (kept aligned with `ApiOrder`).

### `CreateOrderInput` (CHANGED — additive)

- `apps/mobile/.../orders/lib/api-client.ts` `CreateOrderInput` gains `dealId?: string`.

### Unchanged / PRESERVED contracts

- `POST /orders` behavior for orders WITHOUT a `dealId` (byte-for-byte).
- `AppliedDiscount` / `useCart()` display seam (no change to the cart hook's public shape — `refId` already carries the dealId).
- `useReorderConflicts()` import + conflict-notice render path in `cart.tsx`.
- `serializeDeal` / `ApiDeal` / `GET /deals` / `GET /deals/:id` (Phases 1/2 — read/reused, not edited).

---

## Touchpoints

| # | File | Package | Action | Notes |
|---|---|---|---|---|
| 1 | `packages/api/src/db/schema/orders.ts` | api | EDIT | add `deal_id: uuid('deal_id').references(() => deals.id)` (nullable, no `.notNull()`); import `deals` from `./deals` |
| 2 | `packages/api/drizzle/0004_*.sql` | api | CREATE (generated) | `pnpm --filter @jojopotato/api db:generate` after edit #1; do NOT hand-write |
| 3 | `packages/api/src/routes/orders.ts` | api | EDIT | `createOrderSchema` + `dealId`; in-tx FOR UPDATE deal read, complex-type reject, 6-step eligibility, real discount, `deal_id` persist; hard-set `discount_total`/`total` become computed |
| 4 | `packages/api/src/routes/lib/serializers.ts` | api | EDIT | `ApiOrder` gains `dealId: string \| null`; `serializeOrder` maps `order.deal_id` |
| 5 | `packages/api/src/routes/__tests__/orders.test.ts` | api | EDIT | add `describe('POST /orders — deal apply')` self-seeding deal fixtures (hermetic, uid-suffixed) |
| 6 | `packages/types/src/order.ts` | types | EDIT | `Order` gains `dealId: string \| null` |
| 7 | `apps/mobile/src/features/orders/lib/api-client.ts` | mobile | EDIT | `CreateOrderInput` gains `dealId?: string` |
| 8 | `apps/mobile/src/features/deals/lib/apply-deal.ts` | mobile | EDIT | `applyDealById` → `await getDeal(dealId)` (real fetch); DELETE `resolveAndApplyDeal` (now unused); **reject the 4 complex deal types client-side (PVL C1)** |
| 9 | `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` | mobile | EDIT | wire real Apply CTA: `applyDealById` → `applyDiscount` → navigate to cart (replaces the deferred Alert); **gate the CTA against complex deal types (PVL C1)** |
| 10 | `apps/mobile/src/app/(tabs)/order/cart.tsx` | mobile | EDIT | DELETE code-input UI + `handleApplyCoupon` + `couponCode` + unused `Input` import; **PRESERVE `useReorderConflicts()`**; keep applied-deal display + Remove + auto-strip `useEffect` |
| 11 | `apps/mobile/src/app/(tabs)/order/checkout.tsx` | mobile | EDIT | pass `dealId` into `placeOrder({...})`; fix Total to show `totalCents` (breakdown) |

Read-only for context: `packages/api/src/routes/deals.ts` (join-table read pattern), `packages/api/src/db/schema/deals.ts` (raw columns), `packages/api/src/routes/branches.ts` (in-tx read pattern), `apps/mobile/src/features/deals/lib/eligibility.ts` (6-step ordering to port 1:1), `apps/mobile/src/lib/api-client.ts` (`getDeal` from Phase 2), `apps/mobile/src/features/cart/hooks/use-cart.ts` (`applyDiscount`/`clearDiscount` seam — unchanged).

**NOT touched / PRESERVE:** `use-cart.ts` public shape; `useReorderConflicts()` + `use-reorder-conflicts.ts`; `mock-deals.ts` (still consumed by cart's auto-strip `useEffect` + display re-lookup — do NOT delete); `serializeDeal`/`deals.ts`/`deals.test.ts` (Phase 1/2).

---

## Blast Radius

- Packages touched: `packages/api`, `packages/types`, `apps/mobile` (3).
- Files: CREATE 1 (migration `0004`, generated). EDIT 10 (schema/orders.ts, orders.ts, serializers.ts, orders.test.ts, types/order.ts, orders/api-client.ts, apply-deal.ts, deal/[dealId].tsx, cart.tsx, checkout.tsx). DELETE: `resolveAndApplyDeal` function (within apply-deal.ts) + code-input block (within cart.tsx) — no whole-file deletions.
- **Schema migration (`orders.deal_id`) + billing/discount rewrite in the placement transaction + public API contract change** = 3 of 6 high-risk classes → **HIGH risk; High-Risk Execution Handoff (evidence pack) required** (see §High-Risk Evidence Pack Requirement).
- Registry: `phase-blast-radius-registry.md` §Phase 3 claims schema/orders.ts, migration, orders.ts, orders test, types, use-cart.ts, cart.tsx. **This plan adds `serializers.ts`, `orders/lib/api-client.ts`, `apply-deal.ts`, `deal/[dealId].tsx`, `checkout.tsx` and DROPS `use-cart.ts` (its public shape is unchanged — no edit needed) vs the stub's claim.** Registry §Phase 3 entry is updated at PLAN-SUPPLEMENT to reflect the real file set (see registry update below). DISJOINT from Phase 1/2's read surface (`deals.ts`, `features/deals/hooks/`, `deals.test.ts`); the only shared concept is the `Deal` shape (read/reused, not edited). `cart.tsx` co-owns a file with the order-history batch's `useReorderConflicts()` — Phase 3 edits a DISJOINT region (the coupon/deal slot) and preserves the conflict path.

### Registry update applied (Phase 3 entry)

Phase 3's registry entry is refined to the real file set: **ADD** `packages/api/src/routes/lib/serializers.ts` (EDIT — `ApiOrder.dealId`), `packages/types/src/order.ts` (EDIT), `apps/mobile/src/features/orders/lib/api-client.ts` (EDIT), `apps/mobile/src/features/deals/lib/apply-deal.ts` (EDIT — real fetch; delete `resolveAndApplyDeal`), `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` (EDIT — real Apply), `apps/mobile/src/app/(tabs)/order/checkout.tsx` (EDIT — dealId + Total fix). **REMOVE** `use-cart.ts` (unchanged — its `applyDiscount`/`clearDiscount` seam already suffices). No new overlap with Phases 1/2. `[dealId].tsx` was a Phase 2 file but is now DONE/committed — Phase 3 edits it under the sequential join (no concurrent edit).

---

## Implementation Checklist (EXECUTE order — schema+migration → server+tests → types → mobile)

**Gate the high-risk evidence pack FIRST:** before substantial implementation, initiate the High-Risk Execution Handoff (see §High-Risk Evidence Pack Requirement). `risk-gate.json` + `context-snippets.json` are written before code; `verification.json` + `review-decision.json` + `adversarial-validation.json` after the automated gate is green and before finalize.

### A. Schema + migration (backend foundation)

1. **`schema/orders.ts` — add `deal_id`.** Import `deals` from `./deals`. Add to the `orders` table columns: `deal_id: uuid('deal_id').references(() => deals.id),` (nullable — no `.notNull()`, no `onDelete` — decision 4). Place it near `branch_id` for readability.
2. **Generate migration.** Run `pnpm --filter @jojopotato/api db:generate`. Confirm it emits `packages/api/drizzle/0004_*.sql` adding a nullable `deal_id` column + FK constraint to `deals(id)`. Do NOT hand-edit the SQL. Confirm `drizzle/meta` snapshot updated.
3. **Apply + sanity.** `docker compose up -d && pnpm --filter @jojopotato/api db:migrate` → migration applies clean; `orders.deal_id` exists and is nullable.

### B. Server placement rewrite (`orders.ts`) — the core

4. **`createOrderSchema`** (~lines 24–36): add `dealId: z.string().uuid().optional()`.
5. **Import deal schema:** add `dealBranches`, `dealProducts`, `deals` to the `db/schema/index` import.
6. **In-tx deal block** — insert AFTER the item-pricing `for` loop completes (subtotal known, ~after line 154) and BEFORE the order insert (~line 165), all inside the existing `db.transaction`:
   - `let discountCents = 0;`
   - `if (body.dealId) { … }` containing, in order:
     a. **Lock + read:** `const [deal] = await tx.select().from(deals).where(and(eq(deals.id, body.dealId), eq(deals.is_active, true))).for('update');` → `if (!deal) throw new OrderError(400, 'Deal not found or inactive');`
     b. **Complex-type reject (decision 3):** `if (deal.deal_type !== 'percentage_discount' && deal.deal_type !== 'fixed_discount') throw new OrderError(400, 'This deal cannot be applied at checkout yet');`
     c. **6-step eligibility (decision 6), 1:1 with `eligibility.ts` order/reasons:**
        1. window: `const now = new Date(); if (deal.start_at > now || deal.end_at < now) throw new OrderError(400, 'This deal is not currently available');` (active already guaranteed by the `is_active` filter).
        2. branch: read `dealBranches` for `deal.id`; if non-empty and `!branchIds.includes(body.branchId)` → `throw new OrderError(400, 'This deal is not available at your selected branch');`
        3. product-in-cart: read `dealProducts` for `deal.id`; if non-empty and no intersection with `productIds` (the order's actual product ids) → `throw new OrderError(400, 'Your cart has no item eligible for this deal');`
        4. minimum: `if (subtotalCents < numericToCents(deal.minimum_order_amount)) throw new OrderError(400, 'Order subtotal is below this deal\'s minimum');`
        5. per-user usage (only if `deal.usage_limit_per_user != null`): count `orders WHERE deal_id = deal.id AND user_id = userId`; `if (count >= deal.usage_limit_per_user) throw new OrderError(400, 'You have reached the usage limit for this deal');`
        6. total usage (only if `deal.total_usage_limit != null`): count `orders WHERE deal_id = deal.id`; `if (count >= deal.total_usage_limit) throw new OrderError(400, 'This deal has reached its total usage limit');`
        (Counts run AFTER the `FOR UPDATE` lock so concurrent same-deal placements serialize — decision 1. Import `numericToCents` from `./lib/serializers`; add `count`/`sql` from drizzle if using `count()`, or select rows and read `.length`.)
     d. **Real discount (decision 7):** `discountCents = computeDealDiscountCents(deal.deal_type, deal.discount_value ?? '0', subtotalCents);` (add the helper defined in Public Contracts; `deal.discount_value` is nullable in schema — coalesce to `'0'`; PVL C2 lower-bound clamp applies inside the helper).
7. **Order insert** (~lines 169–179): change the hard-set trio to computed values — `discount_total: centsToNumeric(discountCents)`, `total: centsToNumeric(subtotalCents - discountCents)`, and add `deal_id: body.dealId ?? null` to the `.values({...})` block.
8. **`serializers.ts`:** add `dealId: string | null` to `ApiOrder`; in `serializeOrder` add `dealId: order.deal_id`.
9. **`packages/types/src/order.ts`:** add `dealId: string | null` to `Order`.

### C. Server tests (`orders.test.ts` — the automated gate)

10. **Add `describe('POST /orders — deal apply')`** self-seeding hermetic deal fixtures (uid-suffixed ids; assert by id — never by global array length), mirroring `deals.test.ts` seeding. Seed at least: an agnostic `percentage_discount` (e.g. 20%), a `fixed_discount` (e.g. `'50.00'` → 5000 cents), a branch-scoped deal, a product-scoped deal, an expired-but-active deal, a `usage_limit_per_user: 1` deal, and a `buy_one_take_one` (complex) deal. Cases:
    - **Happy path %/fixed:** place order with `dealId` (percentage) → 201; `order.discountTotalCents` = round(subtotal × pct/100); `order.totalCents` = subtotal − discount; `order.dealId` === dealId. Repeat for `fixed_discount` (discount = min(5000, subtotal)).
    - **All 6 rejection reasons (400, order NOT created):** not_in_window (expired deal), branch-ineligible (scoped to another branch), product-ineligible (scoped to a product not in cart), below-minimum (min > subtotal), per-user usage-limit reached (place once, then second placement with same user+deal → 400), total usage-limit reached.
    - **Complex-type rejection (decision 3):** place with the `buy_one_take_one` dealId → 400; assert no order row with that `deal_id` was created.
    - **Not-found/inactive:** unknown uuid → 400; inactive deal → 400.
    - **Atomicity:** on an eligibility 400, assert NO `orders` row was inserted for that placement (query by would-be uniqueness / user). Confirms the throw rolls back the whole tx.
    - **No-dealId regression:** existing no-deal placement still returns `discount_total = 0`, `total = subtotal`, `dealId = null` (backward-compat).
    - **Concurrency / row-lock:** two near-simultaneous placements of a `usage_limit_per_user: 1` deal by the same user → exactly ONE 201, the other 400 (proves the invariant; the existing suite already fires concurrent `Promise.all` order_number requests, so the primitive exists). Assertion is outcome-deterministic (exactly one 201) regardless of forced overlap; that the lock was contended is confirmed by code review of `.for('update')` + `adversarial-validation.json`.
11. **Run backend gate:** `docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test` → orders + deals suites green. Fix inline until green.
12. **Typecheck packages:** `pnpm --filter @jojopotato/api exec tsc --noEmit` + `pnpm --filter @jojopotato/types exec tsc --noEmit` green.

### D. Mobile wiring (Agent-Probe-gated)

13. **`orders/lib/api-client.ts`:** add `dealId?: string` to `CreateOrderInput`. (No `use-checkout.ts` edit needed — `placeOrder(input: CreateOrderInput)` forwards straight through to `createOrder`.)
14. **`apply-deal.ts`:** change `applyDealById` to `async` and swap `MOCK_DEALS.find((d) => d.id === dealId)` → `const deal = await getDeal(dealId);` (import `getDeal` from `@/lib/api-client`; wrap in try/catch — on fetch failure return `{ ok: false, reason: 'not_found', message: 'Deal not found.' }`). **PVL C1: reject the 4 complex deal types** — after resolving the deal, if `deal.dealType` is `buy_one_take_one`/`free_item`/`free_upgrade`/`bundle`, return `{ ok: false, reason: 'not_found', message: 'This deal can\'t be applied at checkout yet.' }` (or a dedicated reason) BEFORE `applyResolvedDeal` — so the client never applies a guessed discount (charter: "never apply a guessed discount"). **DELETE `resolveAndApplyDeal`** (its only caller — cart's `handleApplyCoupon` — is removed in step 16). Keep `applyResolvedDeal` (still used by `applyDealById`). Adjust `ApplyDealResult` usage for the now-async signature.
15. **`deal/[dealId].tsx` — wire real Apply:** replace `handleApply`'s deferred Alert with the real apply: `const result = await applyDealById(deal.id, cart, cart.pickupBranchId, []);` → on `!result.ok` show `Alert.alert('Cannot apply deal', result.message)`; on ok call `applyDiscount(result.discount)` then `router.push('/(tabs)/order/cart')`. Pull `applyDiscount` from `useCart()`. **PVL C1: gate the Apply CTA against complex deal types** — disable (or message) the button for the 4 complex types so the user gets clear feedback instead of an apply-then-checkout-400 dead-end (the `applyDealById` guard is the backstop; the CTA gate is the visible UX). Keep the disabled-when-`!isEligible` behavior and the eligibility display. (Removes Phase 2's "Not available here yet" Alert.)
16. **`cart.tsx` — delete code-input (decision 2), PRESERVE conflicts:**
    - DELETE: the `couponCode` state, `handleApplyCoupon`, the `<Input>`/"Apply" `couponEntry` branch (the `else` of `cart.appliedDiscount ?`), the `resolveAndApplyDeal` import, the now-unused `Input` import (from `@jojopotato/ui`), and the now-unused `couponEntry`/`couponInput` styles.
    - KEEP: the applied-deal display (`CouponCard` + "Remove discount"), the `appliedDeal` re-lookup, and the auto-strip-expired `useEffect` (unchanged — `MOCK_DEALS`/`MOCK_DEAL_USAGE` imports stay for it; server is the placement-time backstop regardless — see Known Gaps).
    - **PRESERVE UNTOUCHED:** `useReorderConflicts()` import, `conflicts`/`clearConflicts`, `conflictNotice`, and all conflict render/style paths. Do not remove or reorder them.
17. **`checkout.tsx` — pass dealId + fix Total:**
    - Destructure `discountTotalCents, totalCents` from `useCart()` (add to the existing `{ cart, subtotalCents, clearCart }`).
    - In the `placeOrder({...})` call, add `dealId: cart.appliedDiscount?.source === 'deal' ? cart.appliedDiscount.refId : undefined,`.
    - Change the "Total" display from `formatCurrency(subtotalCents)` → `formatCurrency(totalCents)`; ideally render a small breakdown (Subtotal / Discount −`formatCurrency(discountTotalCents)` when > 0 / Total).
18. **Run mobile gate:** `pnpm -C apps/mobile exec tsc --noEmit` + lint green (proves the async `applyDealById`, `dealId` pass-through, deleted code-input, and preserved `useReorderConflicts` all compile). Then Agent-Probe the full flow (see Verification Evidence).

---

## Acceptance Criteria Mapping (#24 DEAL-003)

GitHub issue #24 is the verbatim source of truth. "Apply deal or coupon" = apply DEAL only (coupons out of scope). Working restatement of the 5 ACs (final `proven by:` / `strategy:` links locked at Step 4 PVL — REQ-TEST-LINK):

| AC | Criterion (restated) | proven by | strategy |
|---|---|---|---|
| AC24.1 | Applying a deal (browse→details→Apply→cart) sends `dealId` at checkout; server persists `orders.deal_id` | `orders.test.ts` happy-path asserts `order.dealId === dealId`; migration `0004` applied; Agent-Probe cart→checkout flow | Fully-Automated (persist) + Agent-Probe (flow) |
| AC24.2 | Server computes the REAL discount for `percentage_discount`/`fixed_discount` (never trusts a client amount); `total = subtotal − discount` | `orders.test.ts` %/fixed happy-path assert `discountTotalCents`/`totalCents`; `createOrderSchema` has no price field (code review) | Fully-Automated |
| AC24.3 | Server re-runs eligibility at placement; ineligible deal → 400, order not placed; atomic rollback | `orders.test.ts` 6 rejection-reason cases + atomicity (no order row on 400) | Fully-Automated |
| AC24.4 | The 4 complex deal types rejected at placement (400) — never a guessed discount / `deal_id` persist | `orders.test.ts` `buy_one_take_one` → 400 + no order-with-deal_id | Fully-Automated |
| AC24.5 | Apply path = browse→details→Apply→cart (real); code-input removed; one-deal-per-cart + applied-deal display + expiry auto-clear + `useReorderConflicts` preserved | `tsc`/lint (code-input gone, `applyDealById` async, `useReorderConflicts` intact) + Agent-Probe (apply from details lands in cart; Remove works; single deal replaces) | Fully-Automated (build guard) + Agent-Probe (UX) |

**Race-safety note (decision 1):** the usage-limit enforcement (part of AC24.3) is proven automated by the sequential per-user case AND the concurrent `FOR UPDATE` case (outcome-deterministic: exactly one 201). The row lock's contention is additionally confirmed by code review (present in `orders.ts`) + `adversarial-validation.json` — never a vacuous pass.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/api test` — `orders.test.ts` happy path: percentage + fixed → 201, `discountTotalCents`/`totalCents`/`dealId` correct | Fully-Automated | AC24.1, AC24.2 |
| `orders.test.ts` — 6 rejection reasons (not_in_window / branch / product / minimum / per-user usage / total usage) → 400, no order row | Fully-Automated | AC24.3 |
| `orders.test.ts` — atomicity: eligibility 400 leaves NO `orders` row (tx rollback) | Fully-Automated | AC24.3 |
| `orders.test.ts` — `buy_one_take_one` dealId → 400, no `deal_id` persisted | Fully-Automated | AC24.4 |
| `orders.test.ts` — not-found/inactive dealId → 400; no-dealId placement still `discount_total=0`/`total=subtotal`/`dealId=null` | Fully-Automated | AC24.1, AC24.3 |
| `orders.test.ts` — concurrency: two same-user placements of a `usage_limit_per_user:1` deal → exactly one 201 (row-lock serialization, outcome-deterministic) | Fully-Automated | AC24.3 (decision 1) |
| `pnpm --filter @jojopotato/api exec tsc --noEmit` + `@jojopotato/types` tsc + `pnpm -C apps/mobile exec tsc --noEmit` + lint | Fully-Automated | AC24.2, AC24.5 (build guards: async apply, dealId wiring, code-input removed, useReorderConflicts intact) |
| Agent-Probe: open a deal → tap Apply → lands in cart with deal applied (CouponCard shows it); no code-input UI present; complex-type deal shows clear "can't apply" feedback (not a dead-end) | Agent-Probe | AC24.1, AC24.5 |
| Agent-Probe: cart shows subtotal/discount/total; checkout "Total" shows `totalCents` (not subtotal); place order → confirmation reflects discounted total | Agent-Probe | AC24.2, AC24.5 |
| Agent-Probe: apply a second deal → one-deal-per-cart replace-confirm; Remove discount clears it; reorder-conflict notice still renders when conflicts exist | Agent-Probe | AC24.5 |

**Commands:**
```bash
pnpm --filter @jojopotato/api db:generate                 # → packages/api/drizzle/0004_*.sql
docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test
pnpm --filter @jojopotato/api exec tsc --noEmit
pnpm --filter @jojopotato/types exec tsc --noEmit
pnpm -C apps/mobile exec tsc --noEmit
```

**TDD stubs (Fully-Automated rows — for the validate-contract Test Gates; NOT written to disk during PLAN; hermetic own-fixture convention):**
```
test("POST /orders with a percentage_discount dealId computes real discount, total, and persists deal_id", () => { throw new Error("NOT IMPLEMENTED — TDD stub"); })
test("POST /orders with a fixed_discount dealId computes cents discount clamped to subtotal", () => { throw new Error("NOT IMPLEMENTED — TDD stub"); })
test("POST /orders rejects (400) each of the 6 eligibility failure reasons and creates no order", () => { throw new Error("NOT IMPLEMENTED — TDD stub"); })
test("POST /orders rejects (400) the 4 complex deal types and never persists a guessed discount", () => { throw new Error("NOT IMPLEMENTED — TDD stub"); })
test("POST /orders without dealId still returns discount_total 0, total = subtotal, dealId null", () => { throw new Error("NOT IMPLEMENTED — TDD stub"); })
test("POST /orders serializes exactly one 201 for concurrent same-user usage_limit_per_user=1 placements", () => { throw new Error("NOT IMPLEMENTED — TDD stub"); })
```

---

## §High-Risk Evidence Pack Requirement

Phase 3 touches **billing/credits + schema/data migration + public API contract** (3 of the 6 high-risk classes). Per the umbrella charter Hard Safety Constraints and `process/development-protocols/orchestration.md` §High-Risk Execution Handoff, this phase MUST produce a manual-first evidence pack (`vc-risk-evidence-pack`, 5 artifacts) BEFORE finalize. **This is an explicit hard stop — not autonomously skippable, even under a standing /goal.** VALIDATE and EXECUTE must not treat the phase as VERIFIED without it.

Artifacts (written to `process/features/rewards-notifications/active/deals-api-integration_13-07-26/harness/`):

| Artifact | Content | Written when |
|---|---|---|
| `risk-gate.json` | Declared risk classes (billing, schema-migration, public-API), the money-boundary + server-authority constraints, and the auto-stop conditions | BEFORE code (Step A/entry) |
| `context-snippets.json` | The exact code touchpoints under change — the `orders.ts` in-tx insertion region, the `createOrderSchema` diff, the migration DDL, and the discount-helper — with line anchors | BEFORE code |
| `verification.json` | The run outputs of the automated gate (orders suite green: happy %/fixed, 6 rejections, complex-type, atomicity, no-dealId regression, concurrency) + typecheck/lint | AFTER gate green |
| `review-decision.json` | Explicit human/agent sign-off that server authority holds (no client amount trusted), discount is clamped to subtotal (and ≥ 0), FK is NO ACTION, and complex types cannot persist a discount | Before finalize |
| `adversarial-validation.json` | Attack cases considered: client-forged `amountCents` ignored; tampered `dealId` for another branch/product rejected; expired/inactive deal rejected; concurrent usage-limit race serialized; negative/over-subtotal discount clamped | Before finalize |

Auto-stop rule: if the evidence pack cannot be produced (e.g. the automated gate cannot run — docker/Postgres unavailable), the phase is BLOCKED for finalize (code may still be written, but not marked VERIFIED). Surface to the user; do not silently finalize.

---

## Known Gaps

- **Client-side auto-strip `useEffect` is effectively a no-op for REAL applied deals.** The cart's expiry/ineligibility auto-strip (and the `appliedDeal` display re-lookup) look up `MOCK_DEALS.find((d) => d.id === refId)`. A real applied deal carries a real uuid `refId` absent from `MOCK_DEALS`, so the lookup misses and the effect returns early (no client-side strip). **This is acceptable and intentional per the locked guidance:** the SERVER re-validates eligibility at placement (`POST /orders` rejects an ineligible deal with 400 — the real backstop), so a stale client-side deal cannot actually be charged. The `useEffect` is kept unchanged (still strips MOCK-catalog deals in demo/showcase paths) to avoid widening blast radius; wiring a real client-side re-validation (a `useDeal(refId)` recheck) is a deferred follow-up, not required for correctness. Recorded as a backlog-eligible note.
- **Concurrency/row-lock contention proof.** The concurrency test's outcome (exactly one 201) is deterministic regardless of whether the harness forces true overlap, so it is Fully-Automated; what it does NOT prove is that the `FOR UPDATE` lock was actually contended (vs. lucky sequential timing). Contention is confirmed by code review of the single `.for('update')` call + `adversarial-validation.json`. Never claimed as a vacuous pass.
- **No RN test runner (project-wide).** The full cart→Apply→checkout UX, the removed code-input, the Total-breakdown display, one-deal-per-cart/Remove, and the client-side complex-type Apply guard (C1) are Agent-Probe only — never claimed as automated coverage. Tracked at `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`. `packages/api` `orders.test.ts` IS the automated gate for the placement logic.
- **Complex deal types remain unapplicable.** `buy_one_take_one`/`free_item`/`free_upgrade`/`bundle` are shown in the list/details but rejected at placement (decision 3) AND now blocked from client-side apply (C1). Real BOGO/bundle pricing is out of scope (deferred, charter).
- **Coupons remain out of scope.** No `code` column, no `/coupons`, no coupon wallet. The removed code-input (decision 2) is not a regression — it never resolved a real deal.

---

## Test Infra Improvement Notes

- **Concurrency-test primitive:** `orders.test.ts` may reuse the existing concurrent-`Promise.all` pattern (already used for order_number uniqueness) to fire two overlapping `POST /orders` requests and assert exactly one 201 (proving `FOR UPDATE` serialization outcome). The primitive already exists in this suite — no new infra needed. (Standing project-wide gap unchanged: `apps/mobile` has no RN runner — cart/checkout UX is Agent-Probe.)

---

## Dependencies

- Depends on: Phase 1 (DONE — `serializeDeal`, `{ deals }`/`Deal` shape, `deals.ts` router, `deals.test.ts` fixture bootstrap) + Phase 2 (DONE — `GET /deals/:id`, `getDeal`, `useDeal`, deferred Apply CTA now wired for real here). Both committed under the sequential join — no concurrent edit.
- Resolves the Phase 2 cross-phase note: `orders.deal_id` created here makes real usage counts possible; Phase 2's interim `usage: []` display is now superseded by server-side placement enforcement.
- Provides downstream: real `discount_total`/`deal_id` on orders → future order-history "deal applied" display (enabled by decision 5) and future star/rewards accrual (out of scope).

---

## Entry Gate

- Phase 1 AND Phase 2 exit gates both passed ✅ (umbrella Program Status: Phase 1 + Phase 2 ✅ VERIFIED).
- High-risk evidence pack initiated (`risk-gate.json` + `context-snippets.json`) before substantial implementation.
- Migration slot `0004` confirmed free in `packages/api/drizzle/` (verified at RESEARCH + PVL — `0000`–`0003` taken).

## Exit Gate

- Migration `0004_*` applied; `orders.deal_id` (nullable, FK→deals, NO ACTION) persists.
- `POST /orders` with `dealId`: computes real `discount_total` (%/fixed only), writes `total = subtotal − discount`, persists `deal_id`, re-validates eligibility server-side under a `FOR UPDATE` deal lock — all atomically. Complex types + ineligible + not-found/inactive → 400 (order not created).
- Cart code-input removed (decision 2); browse→details→Apply→cart flow works; complex-type deals blocked from client apply (C1); `useReorderConflicts()` import + render path preserved; checkout "Total" shows `totalCents`.
- `orders.test.ts` (incl. all dealId cases) green; api/types/mobile typecheck + lint green.
- **High-risk manual-first evidence pack (5 artifacts) complete and accepted.**
- Phase report written to the report destination.

## Blockers That Would Justify BLOCKED Status

- `0004` slot collision (re-check `packages/api/drizzle/` at RESEARCH — confirmed free this pass).
- `docker compose` / local Postgres unavailable → automated gate cannot run (hybrid precondition) → evidence pack `verification.json` cannot be produced → phase cannot be finalized VERIFIED (BLOCKED for finalize; code may still be written). Backlog + surface to user.
- High-risk evidence pack cannot be produced → hard stop; do NOT mark VERIFIED.
- Concurrency serialization cannot be validated automatically AND code review cannot confirm the `FOR UPDATE` lock → escalate (should not occur; the lock is a single `.for('update')` call).

---

## Phase Completion Rules

- A checklist item is complete only when its code is written AND its paired gate has run.
- Backend items (A–C) are complete only when `orders.test.ts` (incl. dealId cases) is green — code-written without a green suite is 🔨 CODE DONE, not ✅ VERIFIED.
- Mobile items (D) are complete when `tsc --noEmit` + lint pass AND the Agent-Probe walkthrough is recorded.
- The phase is ✅ VERIFIED only after: exit gate met, validate-contract recorded (PASS or accepted-CONDITIONAL), regression check against Phase 1/2 surfaces (`GET /deals`, `GET /deals/:id` still green) passes, AND the high-risk evidence pack is complete + accepted. Code-only completion is 🔨 CODE DONE, never ✅ VERIFIED without that confirmation.
- No item may be ticked on training-data assumption — every gate is an actually-run command or a recorded Agent-Probe observation.

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. Canonical 7-step inner loop `R → I → P → PVL → E → EVL → UP` SKIPS SPEC (umbrella SPEC governs).

- [x] 1. RESEARCH — research-agent: Phase 1+2 reports + landed source spot-checked (orders.ts placement tx, orders schema, serializers.ts, deals.ts join reads, deals.ts schema, eligibility.ts 6-step order, apply-deal.ts callers, [dealId].tsx deferred CTA, cart.tsx code-input + useReorderConflicts, checkout.tsx Total bug, use-cart seam, drizzle migration folder). Migration slot `0004` confirmed free in `packages/api/drizzle/` (stub's `src/db/migrations/` path corrected). Plan drift checked — clean.
- [x] 2. INNOVATE — resolved by explicit user decision this session: 5 LOCKED decisions (FOR UPDATE row lock; remove code-input; reject 4 complex types at placement; nullable FK NO ACTION; add dealId to ApiOrder/serializeOrder/Order). Encoded in Architecture Decisions; not re-opened.
- [x] 3. PLAN-SUPPLEMENT — plan-agent: STUB expanded into the full checklist + contracts + AC mapping + verification evidence + high-risk evidence-pack section (this pass); stub renamed `_STUB_` → `_PLAN_`; registry §Phase 3 file set refined (see Blast Radius). Inner Loop Refresh Note: n/a — this is the initial full authoring of the stub (not a re-supplement of an existing full plan).
- [x] 4. PVL — vc-validate-agent: full V1–V7 run 14-07-26; validate-contract written (Gate: CONDITIONAL, generated-by: inner-pvl: phase-3). Security/correctness core (row-lock, cents math, complex-reject, no-client-money, atomicity, migration, AC coverage, evidence-pack) all PASS. TWO fixable concerns routed to PVL supplement: **C1** (client-side complex-type Apply guard) + **C2** (server discount lower-bound clamp). High-risk evidence-pack flagged as mandatory EXECUTE-time hard gate. **First-pass CONDITIONAL — orchestrator runs one PVL supplement cycle (vc-plan-agent applies C1/C2), then re-spawns VALIDATE.** **PVL supplement cycle 1 (14-07-26): C1 confirmed already concretely specified in Steps 14/15 + Touchpoints #8/#9 (no edit needed); C2 finalized — the both-clamp formula `Math.max(0, Math.min(computed, subtotalCents))` is now shown explicitly in the Public Contracts helper spec + Decision 7 (was previously upper-clamp-only with a prose NOTE). 1 gap needed a real edit; re-spawn VALIDATE next.** **PVL re-validation (cycle 2, 14-07-26): C1 confirmed resolved (concretely specified in Touchpoints #8/#9 + Steps 14/15); C2 confirmed resolved (both-clamp formula `Math.max(0, Math.min(computed, subtotalCents))` present in Decision 7 + Public Contracts helper spec — max outside min, cannot produce a negative discount). Sections B + D now PASS. Gate: CONDITIONAL TERMINAL — cycle N≥1, all in-scope concerns resolved, residual = accepted known-gaps. `PHASE_COMPLETE: VALIDATE` emitted. EXECUTE requires the manual-first high-risk evidence pack (mandatory hard gate; manual-first / user-checkpoint).**
- [x] 5. EXECUTE — all checklist items done (A schema+migration → B server rewrite → C tests → D mobile); per-section gates green (83 api tests incl. 25 orders/15 deal-apply; api/types/mobile tsc; api/mobile lint); high-risk evidence pack (5 artifacts) produced + validator-clean. Completed 14-07-26.
- [x] 6. EVL — vc-tester independently re-ran all 6 validate-contract gate groups (execute-agent's internal green claim is NOT trusted as substitute): `pnpm --filter @jojopotato/api test` (83/83, orders.test.ts 25 incl. 15 deal-apply), api/types/mobile `tsc --noEmit`, api/mobile lint, risk-evidence-pack validator — all GREEN. 7 security/correctness spot-checks independently verified against landed code (FOR UPDATE row-lock, dual discount clamps, complex-type 400-reject-before-write, dealId-only schema, atomic rollback, real atomicity+concurrency+complex-type DB assertions, additive-only migration, mobile C1 guard + real getDeal(), cart.tsx code-input removed + useReorderConflicts preserved, checkout.tsx dealId+Total fix). Known-gaps accepted: mobile cart→apply→checkout UX Agent-Probe-only (no RN runner); client auto-strip useEffect intentional no-op for real deals (server is authoritative backstop). closeout_classification: CLEAN. Note: working tree has co-mingled uncommitted work from sibling batches (order-history-reorder-api + this program's own diffs) — not a Phase 3 regression, flagged for commit-scoping in UPDATE PROCESS.
- [x] 7. UPDATE PROCESS — phase report reconciled with EVL confirmation; umbrella state updated (all 3 phases VERIFIED); program task folder archived active/ → completed/; commit deferred (co-mingled tree — see UPDATE PROCESS closeout).

**Validate-contract written (Gate: CONDITIONAL, TERMINAL — after 1 PVL supplement cycle).** Step 4 (PVL) complete — the contract below is real (not a placeholder). C1/C2 resolved in supplement cycle 1; residual = accepted known-gaps only → EXECUTE is legal. HIGH RISK: EXECUTE requires the manual-first evidence pack per `vc-risk-evidence-pack` (mandatory hard gate; manual-first / user-checkpoint — not silently auto-finalized).

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/rewards-notifications/active/deals-api-integration_13-07-26/phase-3-cart-apply-placement_PLAN_13-07-26.md`
2. **Last completed step:** Step 4 PVL first pass (validate-contract written, Gate: CONDITIONAL). Steps 1 (RESEARCH) + 2 (INNOVATE) + 3 (PLAN-SUPPLEMENT) done. Next = PVL supplement cycle (vc-plan-agent applies C1/C2) → re-spawn vc-validate-agent → then EXECUTE.
3. **Validate-contract status:** written 14-07-26 — Gate: CONDITIONAL, generated-by: inner-pvl: phase-3. Two concerns (C1/C2) routed to supplement; standing residuals accepted.
4. **Supporting context files loaded:** umbrella plan; `phase-1-deals-list_{PLAN,REPORT}_13-07-26.md`; `phase-2-deal-details-eligibility_{PLAN,REPORT}_13-07-26.md`; `packages/api/src/routes/{orders.ts,deals.ts,branches.ts,lib/serializers.ts}`; `packages/api/src/db/schema/{orders.ts,deals.ts,deal_branches.ts,deal_products.ts}`; `packages/api/drizzle/` (migration slots); `packages/api/src/routes/__tests__/{orders.test.ts,deals.test.ts}`; `packages/types/src/order.ts`; `apps/mobile/src/features/deals/lib/{apply-deal.ts,eligibility.ts}`; `apps/mobile/src/features/orders/{lib/api-client.ts,hooks/use-checkout.ts}`; `apps/mobile/src/features/cart/hooks/use-cart.ts`; `apps/mobile/src/app/(tabs)/{deals/deal/[dealId].tsx,order/cart.tsx,order/checkout.tsx}`; `process/context/tests/all-tests.md`.
5. **Context routing:** start from `process/context/all-context.md`; automated gate follows `process/context/tests/all-tests.md` (vitest+supertest in `packages/api`; `docker compose up -d` + `db:migrate` preconditions; no RN runner for `apps/mobile` — client is Agent-Probe).
6. **Execute-anchor:** this file is the single EXECUTE anchor for Phase 3. No supporting/legacy phase files.
7. **Next step for a fresh agent:** orchestrator runs the PVL supplement cycle (spawn vc-plan-agent PVL-supplement mode with the SUPPLEMENT REQUEST for C1/C2), then re-spawns vc-validate-agent from V1. On the re-validated PASS/accepted-CONDITIONAL, EXECUTE follows the Implementation Checklist in order (A schema+migration → B server rewrite → C tests → D mobile), with the evidence pack initiated before code and completed before finalize.

---

## Validate Contract

Status: CONDITIONAL
Date: 14-07-26
date: 2026-07-14
generated-by: inner-pvl: phase-3
supersedes: 14-07-26 (inner-pvl: phase-3) — PVL supplement cycle 1 resolved C1/C2; this re-validated contract has current evidence (terminal CONDITIONAL)

Parallel strategy: sequential (single-plan inner PVL; execution is one ordered vc-execute-agent pass A→B→C→D — no independent fan-out)
Rationale: Signal score 4/7 (S1 multi-package, S2 schema/API/auth surface, S6 high-risk class, S7 5+ files) — but the checklist is strictly sequential (schema+migration → server → tests → mobile), so a single opus execute-agent is correct. EXECUTE strategy recommendation restated at phase end.

**HIGH-RISK HARD GATE (non-negotiable):** This phase touches 3 of 6 high-risk classes (billing/credits + schema/data migration + public API contract). The manual-first High-Risk Execution Handoff evidence pack (`vc-risk-evidence-pack`, 5 artifacts — see §High-Risk Evidence Pack Requirement) is a MANDATORY EXECUTE-time gate before finalize. It is NOT autonomously skippable, even under the standing /goal. VALIDATE and EXECUTE must not mark this phase VERIFIED without it.

### Test gates (C3 5-column table — ADDITIVE; legacy line form retained below)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC24.1/AC24.2 | `POST /orders` w/ `percentage_discount` dealId computes real discount, `total = subtotal − discount`, persists `deal_id` | Fully-Automated | `pnpm --filter @jojopotato/api test` — `orders.test.ts` %-happy-path asserts `discountTotalCents === round(subtotal×pct/100)`, `totalCents`, `dealId` | A |
| AC24.2 | `POST /orders` w/ `fixed_discount` dealId computes cents discount clamped to subtotal | Fully-Automated | `orders.test.ts` fixed-happy-path asserts `discountTotalCents === min(value×100, subtotal)` | A |
| AC24.3 | Server re-runs 6-step eligibility at placement; each of 6 reasons → 400, no order row | Fully-Automated | `orders.test.ts` 6 rejection cases (not_in_window / branch / product / minimum / per-user usage / total usage) | B (per-user usage case is new: place once then re-place → 400) |
| AC24.3 | Atomicity: eligibility 400 leaves NO `orders` row (tx rollback) | Fully-Automated | `orders.test.ts` atomicity case — query by user after a 400, assert zero new rows | A |
| AC24.4 | The 4 complex deal types rejected at placement (400), never a persisted/guessed discount | Fully-Automated | `orders.test.ts` `buy_one_take_one` dealId → 400 + assert no order-with-that-deal_id | A |
| AC24.1/AC24.3 | Not-found/inactive dealId → 400; no-dealId placement still `discount_total=0`/`total=subtotal`/`dealId=null` | Fully-Automated | `orders.test.ts` not-found + inactive + no-deal regression cases | A |
| AC24.3 (decision 1) | `FOR UPDATE` serialization: two concurrent same-user `usage_limit_per_user:1` placements → exactly ONE 201 | Fully-Automated (outcome-deterministic) | `orders.test.ts` `Promise.all([post,post])` — the existing suite already fires concurrent order_number requests; assert exactly one 201/one 400 | A (proves the invariant; lock contention confirmed by code review of `.for('update')` + `adversarial-validation.json`) |
| AC24.2/AC24.5 | Build guards: async `applyDealById`, `dealId` pass-through, code-input removed, `useReorderConflicts` intact, `ApiOrder.dealId`/`Order.dealId` aligned, C1 client complex-type guard compiles | Fully-Automated | `pnpm --filter @jojopotato/api exec tsc --noEmit` + `@jojopotato/types` tsc + `pnpm -C apps/mobile exec tsc --noEmit` + lint | A |
| AC24.1/AC24.5 | Browse→details→Apply→cart flow; no code-input; CouponCard shows applied deal; Remove clears; one-deal-per-cart replace; complex-type deal shows clear "can't apply" feedback (C1) | Agent-Probe | Simulator walkthrough (no RN runner) — apply a deal, verify cart state, Remove, replace; attempt a complex-type deal → clear feedback, no dead-end | D (standing RN-runner known-gap; named residual, backlog-tracked) |
| AC24.2/AC24.5 | Checkout "Total" shows `totalCents` (not subtotal); subtotal/discount/total breakdown; confirmation reflects discounted total | Agent-Probe | Simulator: apply a %/fixed deal, open checkout, verify Total = discounted total + breakdown; place order; confirmation shows discounted total | D (standing RN-runner known-gap) |

gap-resolution legend: A — proven now · B — gate added by this plan's checklist · C — deferred to named later phase · D — backlog test-building stub (named residual).

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Agent-Probe used here; Hybrid n/a). Known-Gap is never a strategy — the RN-runner residual is carried as gap-resolution D, not as a strategy that proves a behavior.

**Failing stubs (Fully-Automated rows — for EXECUTE red-first; NOT written to disk during VALIDATE):**
```
test("POST /orders with a percentage_discount dealId computes real discount, total, and persists deal_id", () => { throw new Error("NOT IMPLEMENTED — TDD stub: percentage happy path"); })
test("POST /orders with a fixed_discount dealId computes cents discount clamped to subtotal", () => { throw new Error("NOT IMPLEMENTED — TDD stub: fixed happy path"); })
test("POST /orders rejects (400) each of the 6 eligibility failure reasons and creates no order", () => { throw new Error("NOT IMPLEMENTED — TDD stub: 6 rejection reasons"); })
test("POST /orders atomicity — an eligibility 400 leaves no orders row", () => { throw new Error("NOT IMPLEMENTED — TDD stub: atomicity rollback"); })
test("POST /orders rejects (400) the 4 complex deal types and never persists a guessed discount", () => { throw new Error("NOT IMPLEMENTED — TDD stub: complex-type reject"); })
test("POST /orders not-found/inactive dealId → 400; no-dealId still discount_total 0, total = subtotal, dealId null", () => { throw new Error("NOT IMPLEMENTED — TDD stub: not-found + no-deal regression"); })
test("POST /orders serializes exactly one 201 for concurrent same-user usage_limit_per_user=1 placements", () => { throw new Error("NOT IMPLEMENTED — TDD stub: FOR UPDATE serialization"); })
```

Legacy line form (retained for existing validate-contract consumers):
- packages/api placement (discount/eligibility/atomicity/complex-reject/backward-compat/concurrency): Fully-automated: `docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test`
- api/types/mobile typecheck + lint: Fully-automated: `pnpm --filter @jojopotato/api exec tsc --noEmit` + `pnpm --filter @jojopotato/types exec tsc --noEmit` + `pnpm -C apps/mobile exec tsc --noEmit` + `pnpm lint`
- migration generation: Fully-automated: `pnpm --filter @jojopotato/api db:generate` → emits `packages/api/drizzle/0004_*.sql` (nullable `deal_id` + FK)
- mobile cart→apply→checkout UX (+ C1 complex-type guard): Agent-probe: simulator walkthrough (no RN runner) — precondition: Expo app running
- high-risk evidence pack: MANUAL-FIRST hard gate: 5 `vc-risk-evidence-pack` artifacts required before finalize (NOT skippable)

### Dimension findings

- Infra fit: PASS — vitest+supertest in `packages/api` is the real automated gate; `drizzle-orm@0.45.2` supports `.for('update')` (verified in the installed `select.d.ts`: `for(strength: LockStrength, config?: LockConfig)`); migration slot `0004` free; `docker compose up -d` + `db:migrate` preconditions documented; node-postgres returns `numeric` as a decimal string so `Number(deal.discount_value)` is precision-safe (precedent: orders.ts:121 + serializers.ts `numericToCents`).
- Test coverage: CONCERN — placement/discount/eligibility/atomicity logic is fully automated; the entire mobile cart→apply→checkout UX is Agent-Probe only (project-wide RN-runner gap). Not vacuously green — Agent-Probe is a proving strategy; the money-critical behavior rests on the automated backend gate.
- Breaking changes: PASS — `POST /orders` additive/backward-compatible (no-`dealId` path byte-for-byte unchanged); `ApiOrder`/client `Order`/`CreateOrderInput` additive; `serializeDeal`/`GET /deals*` unedited.
- Security surface: PASS — server authority over money is airtight; only a uuid `dealId` crosses the trust boundary; complex types rejected before any discount/write; all rejections roll the tx back atomically; FK is NO ACTION (no historical linkage erasure). High-risk evidence pack is a mandatory forward gate.
- Section A (schema+migration): PASS — additive nullable FK, NO ACTION (matches `user_id`/`branch_id` precedent), no data backfill, drizzle-generated. Highest-risk edit: hand-editing the generated SQL — mitigation: do NOT hand-edit; verify emitted DDL is nullable + FK-only.
- Section B (server placement rewrite): PASS — core logic correct (lock-before-count in-tx; raw-value cents math; atomic rollback). C2 RESOLVED (supplement cycle 1): `computeDealDiscountCents` now shows both clamps `Math.max(0, Math.min(computed, subtotalCents))` explicitly in Decision 7 + the Public Contracts helper spec (max outside min — a negative/garbage raw `discount_value` cannot produce a negative discount). Highest-risk edit: the in-tx deal-block ordering — mitigation: place the FOR-UPDATE lock + all eligibility throws strictly BEFORE the order insert loop.
- Section C (server tests): PASS — hermetic self-seeding fixture pattern proven in `orders.test.ts` (uid-suffixed, assert-by-id); concurrency test is outcome-deterministic via `Promise.all`. Highest-risk edit: omitting the atomicity assertion — mitigation: after each 400 case, query by user and assert zero new order rows.
- Section D (mobile wiring): PASS — C1 RESOLVED (supplement cycle 1): the deal-details Apply CTA gate + `applyDealById` complex-type reject are concretely specified (Touchpoints #8/#9, Steps 14/15) — the client rejects `buy_one_take_one`/`free_item`/`free_upgrade`/`bundle` BEFORE applying, so it never applies a guessed discount (charter consistency; removes the apply-then-checkout-400 dead-end). Highest-risk edit: deleting the code-input while preserving `useReorderConflicts` — mitigation: the plan marks the conflict path PRESERVE-untouched and edits only the disjoint coupon slot; remove the now-unused `Input` import + `couponCode` state + styles to keep lint green.

### Open gaps

- **C1 (RESOLVED — supplement cycle 1):** Deal-details Apply CTA + `applyDealById` now reject the 4 complex deal types client-side (disable + explain) — concretely specified in Touchpoints #8/#9 + Steps 14/15. The client never applies a guessed discount; no apply-then-checkout-400 dead-end. Closed.
- **C2 (RESOLVED — supplement cycle 1):** Server `computeDealDiscountCents` now carries both clamps `Math.max(0, Math.min(computed, subtotalCents))` explicitly (Decision 7 + Public Contracts helper spec) — a negative/garbage raw `discount_value` cannot produce a negative discount. Closed.
- Concurrency/`FOR UPDATE` contention: the automated test proves the invariant (exactly one 201) but not that the lock was contended vs. lucky sequential timing — accepted; mitigated by code review of the single `.for('update')` call + `adversarial-validation.json`.
- **known-gap (standing, accepted):** No RN test runner (project-wide) — all mobile cart→apply→checkout UX (incl. C1 guard) is Agent-Probe only, never claimed as automated coverage. Tracked at `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`.
- **forward hard gate (accepted, mandatory):** High-Risk Execution Handoff evidence pack (5 artifacts) — an EXECUTE-time deliverable, not skippable; the phase cannot be finalized VERIFIED without it.
- Complex deal types remain unapplicable at placement by design (decision 3) — deferred, charter. Coupons out of scope — charter.

### What this coverage does NOT prove

- `docker compose up -d && … db:migrate && … test` (packages/api suite): proves the placement discount/eligibility/atomicity/complex-reject/backward-compat/concurrency-invariant server logic. Does NOT prove: the client cart→Apply→checkout UX renders/navigates correctly; that the `FOR UPDATE` lock was actually contended (only that the usage-limit invariant holds); any real-device network behavior.
- `tsc --noEmit` + lint (api/types/mobile): proves the async `applyDealById` signature, `dealId` pass-through wiring, code-input removal, `useReorderConflicts` preservation, C1 guard, and `ApiOrder`/`Order` shape alignment all compile. Does NOT prove runtime behavior, the nav flow, or that the applied discount displays correctly (RN runtime is unvalidated — no RN runner).
- `db:generate` migration emit: proves the DDL is generated as a nullable FK column. Does NOT prove it applies cleanly against production-shaped data (local Postgres only) or rollback behavior.
- Agent-Probe simulator walkthrough: proves the flow works to a human observer once. Does NOT provide regression protection — it is not re-run automatically on future changes.
- No gate proves the high-risk evidence pack contents are accurate — that is a manual reviewer sign-off (`review-decision.json`), by design.

Gate: CONDITIONAL (0 FAILs; security/correctness core items 1–8 all PASS; C1/C2 RESOLVED in supplement cycle 1 — Sections B + D now PASS; residual = standing accepted known-gaps only). This is a TERMINAL CONDITIONAL — cycle N≥1 (one PVL supplement cycle completed), all in-scope concerns resolved, EXECUTE is legal. HIGH RISK: the manual-first High-Risk Execution Handoff evidence pack (5 artifacts, `vc-risk-evidence-pack`) remains a MANDATORY EXECUTE-time hard gate before finalize — the orchestrator must treat Phase 3 EXECUTE as manual-first / user-checkpoint, never silently auto-finalized.
Accepted by: session (autonomous, /goal execution) — C1 (client complex-type guard) + C2 (server lower-bound clamp) RESOLVED and accepted (supplement cycle 1). Standing residuals accepted: RN-runner Agent-Probe-only mobile UX; high-risk evidence pack as a mandatory EXECUTE-time hard gate; concurrency-contention caveat (invariant proven; lock contention confirmed by code review of the single `.for('update')` call + `adversarial-validation.json`).
