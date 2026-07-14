---
phase: phase-3-cart-apply-placement
date: 2026-07-14
status: COMPLETE_WITH_GAPS
feature: rewards-notifications
plan: process/features/rewards-notifications/active/deals-api-integration_13-07-26/phase-3-cart-apply-placement_PLAN_13-07-26.md
---

# Phase 3 — Cart Apply + Placement (DEAL-003 / #24) — EXECUTE Report

TL;DR: All checklist items A→D implemented exactly per plan. 83/83 api tests green (orders suite 10→25, +15 deal-apply cases incl. row-lock concurrency). api/types/mobile typecheck + api/mobile lint all clean. High-risk evidence pack (5 artifacts) written and validator-clean. No plan deviations. Ready for EVL confirmation + UPDATE PROCESS.

## What Was Done

### A. Schema + migration
- `packages/api/src/db/schema/orders.ts`: imported `deals`; added `deal_id: uuid('deal_id').references(() => deals.id)` (nullable, NO ACTION — matches user_id/branch_id precedent, decision 4).
- Generated `packages/api/drizzle/0004_parched_stick.sql` via `db:generate` (NOT hand-written). Reviewed before applying: additive-only — `ADD COLUMN deal_id uuid` (nullable) + FK `ON DELETE no action ON UPDATE no action`. No data backfill.
- Applied via `docker compose up -d && db:migrate` — clean.

### B. Server placement rewrite (`packages/api/src/routes/orders.ts`)
- `createOrderSchema` gains `dealId: z.string().uuid().optional()` — the ONLY deal-related field accepted (no discount/amount/eligibility field, ever).
- New `computeDealDiscountCents(dealType, discountValue, subtotalCents)` helper — computes from the RAW `deals.discount_value`; both clamps `Math.max(0, Math.min(computed, subtotalCents))` (decision 7 / PVL C2).
- In-tx deal block inserted AFTER the subtotal loop, BEFORE the order insert, inside the existing `db.transaction`: (a) `SELECT ... FOR UPDATE` the active deal row (decision 1); (b) reject the 4 complex types with 400 before any math (decision 3); (c) 6-step eligibility 1:1 with `eligibility.ts` (window → branch → product-in-cart → minimum → per-user usage → total usage), each failure `throw new OrderError(400, ...)`; (d) real discount.
- Order insert: `deal_id: body.dealId ?? null`, `discount_total: centsToNumeric(discountCents)`, `total: centsToNumeric(subtotalCents - discountCents)`.
- `serializers.ts`: `ApiOrder.dealId: string | null` + `serializeOrder` maps `order.deal_id` (decision 5).
- `packages/types/src/order.ts`: `Order.dealId: string | null`.

### C. Server tests (`packages/api/src/routes/__tests__/orders.test.ts`)
- Added 12 self-seeding hermetic deal fixtures (uid-suffixed, assert-by-id) + a second real product for product-scope.
- `describe('POST /orders — deal apply')`: percentage happy (260/1040), fixed partial (500/800), fixed clamp-to-subtotal (1300/0), all 6 rejection reasons (each 400 + zero rows), complex-type reject, unknown/inactive reject, atomicity (400 leaves zero rows), no-dealId regression (0/subtotal/null), concurrency usage_limit_per_user:1 → exactly one 201.

### D. Mobile wiring
- `orders/lib/api-client.ts`: `CreateOrderInput.dealId?: string`.
- `apply-deal.ts`: `applyDealById` now async (`await getDeal`), rejects the 4 complex types (C1 backstop); added `isComplexDealType`; DELETED `resolveAndApplyDeal` (only caller removed); dropped `MOCK_DEALS` import.
- `deal/[dealId].tsx`: real Apply CTA (`applyDealById` → `applyDiscount` → navigate to cart); CTA gated/disabled + explained for complex types (C1).
- `cart.tsx`: DELETED code-input UI (`couponCode` state, `handleApplyCoupon`, Input branch, `Input` import, `couponEntry`/`couponInput` styles, `applyDiscount`); applied-deal display + Remove + expiry `useEffect` kept; `useReorderConflicts()` import + conflict-notice render path PRESERVED untouched.
- `checkout.tsx`: passes `dealId` from `cart.appliedDiscount` (source==='deal'); Total display fixed subtotalCents→totalCents with Subtotal/Discount/Total breakdown.

## What Was Skipped or Deferred
- Nothing in scope skipped. Deferred per charter (unchanged): complex-type real pricing, coupons, star/rewards accrual, live online payment.

## Test Gate Outcomes
- `pnpm --filter @jojopotato/api db:generate` → 0004_parched_stick.sql (additive) — PASS
- `docker compose up -d && pnpm --filter @jojopotato/api db:migrate` — PASS
- `pnpm --filter @jojopotato/api test` — 8 files / 83 tests PASS (orders.test.ts = 25)
- `pnpm --filter @jojopotato/api exec tsc --noEmit` — PASS
- `pnpm --filter @jojopotato/types exec tsc --noEmit` — PASS
- `pnpm -C apps/mobile exec tsc --noEmit` — PASS
- `pnpm --filter @jojopotato/api lint` — PASS (0 errors)
- `pnpm --filter @jojopotato/mobile lint` — PASS (0 errors; 3 pre-existing warnings in untouched scripts/dev-with-tunnel.mjs)
- High-risk evidence pack — `validate-risk-artifacts.mjs` → 0 failures, 0 warnings

## Plan Deviations
None. Implementation matches the plan and all 5 locked decisions + money-math clamps + row-lock + atomicity exactly.

## Test Infra Gaps Found
- Standing (accepted): no RN test runner — the mobile cart→apply→checkout UX and the client-side complex-type Apply guard (C1) are Agent-Probe only. Tracked at `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`.
- Concurrency test proves the usage-limit invariant (exactly one 201) but not physical lock contention; confirmed by code review of the single `.for('update')` call + adversarial-validation.json.

## SPEC Achievement

Per the umbrella Program Goal Charter (governs SPEC for this phase-program inner loop) and the
plan's Acceptance Criteria Mapping (#24 DEAL-003):

| AC | Criterion | Scored | Evidence |
|---|---|---|---|
| AC24.1 | Apply-a-deal flow sends `dealId` at checkout; server persists `orders.deal_id` | **met** | `orders.test.ts` happy-path asserts `order.dealId === dealId`; migration 0004 applied |
| AC24.2 | Server computes REAL discount (%/fixed only), never trusts client amount; `total = subtotal − discount` | **met** | `orders.test.ts` %/fixed cases; `createOrderSchema` has no price field |
| AC24.3 | Server re-runs eligibility at placement; ineligible → 400, atomic rollback | **met** | `orders.test.ts` 6 rejection cases + atomicity (DB-queried, real) |
| AC24.4 | 4 complex deal types rejected at placement (400), never a guessed discount | **met** | `orders.test.ts` `buy_one_take_one` → 400 + no `deal_id` persisted (DB-checked) |
| AC24.5 | Real browse→details→Apply→cart flow; code-input removed; `useReorderConflicts` preserved | **met** (automated build-guard) / **Agent-Probe pending** (UX) | `tsc`/lint green (code-input gone, `useReorderConflicts` intact); full UX walkthrough still owed — see Known Gaps |

All 5 criteria are **met** by their Fully-Automated proving test where one exists. AC24.5's UX
half rests on Agent-Probe only (no RN runner) — this is a disclosed, accepted known-gap per the
plan's Verification Evidence table, not a vacuous pass (the money-critical logic is fully
automated; only the human-observable flow is manual). No unmet criteria — no backlog NOTE
required for AC gaps. The standing RN-runner gap itself is already tracked at
`process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`.

## Closeout Packet
- Selected plan: `phase-3-cart-apply-placement_PLAN_13-07-26.md`
- Finished: all A→D checklist items; migration 0004 applied; 5-artifact high-risk evidence pack written + validator-clean.
- Verified: placement discount/eligibility/atomicity/complex-reject/backward-compat/concurrency (automated); migration additive; api/types/mobile typecheck + lint.
- Still unverified: mobile runtime cart→apply→checkout UX (Agent-Probe, RN-runner gap) — not run in this headless EXECUTE.
- Best next state: EVL confirmation run (spawn vc-tester to re-run the validate-contract gates), then UPDATE PROCESS (archive Phase 3, update umbrella state, commit).

## Forward Preview
- **Test Infra Found:** api vitest+supertest is the automated gate; no RN runner (mobile Agent-Probe only).
- **Blast Radius Changes:** orders schema (deal_id), orders placement tx, serializers, orders test, types/order, mobile api-client/apply-deal/[dealId]/cart/checkout. Registry Phase 3 → DONE.
- **Commands to Stay Green:** `docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test`; api/types/mobile `tsc --noEmit`; api/mobile `lint`.
- **Dependency Changes:** none (no new deps). Migration slot 0004 consumed; next free is 0005.

## Follow-up stubs created
None required. Standing backlog notes referenced (RN e2e harness) already exist.

## CONTEXT_PARTIAL
None.

## EVL Confirmation (independent re-run by vc-tester)

Execute-agent's internal "all gates green" claim is NOT trusted as a substitute — vc-tester
independently re-ran the exact validate-contract gate commands:

| Gate | Command | Result |
|---|---|---|
| API test suite | `pnpm --filter @jojopotato/api test` | GREEN — 83/83 (orders.test.ts 25, incl. 15 new deal-apply cases) |
| API typecheck | `pnpm --filter @jojopotato/api exec tsc --noEmit` | GREEN |
| Types typecheck | `pnpm --filter @jojopotato/types exec tsc --noEmit` | GREEN |
| Mobile typecheck | `pnpm -C apps/mobile exec tsc --noEmit` | GREEN |
| API + mobile lint | `pnpm --filter @jojopotato/api lint` + `pnpm --filter @jojopotato/mobile lint` | GREEN (mobile: 3 pre-existing warnings in untouched `scripts/dev-with-tunnel.mjs`) |
| High-risk evidence pack | `validate-risk-artifacts.mjs` | GREEN — 0 failures, 0 warnings |

**7 security/correctness spot-checks independently verified against the actual landed code (not
just the report's claims):**
1. `FOR UPDATE` row-lock acquired before usage-count reads (`orders.ts:189-193`)
2. Dual discount clamp `Math.max(0, Math.min(...))` present (`orders.ts:75`)
3. Complex-type 400-reject happens before any write (`orders.ts:200-202`)
4. `createOrderSchema` accepts only `dealId` — no price/discount/amount field (`orders.ts:27-42`)
5. Atomic rollback via throw-inside-tx (`orders.ts:284`)
6. Real (not vacuous) atomicity test (DB-queried row count) + real concurrency test
   (`Promise.all` racing a `usage_limit_per_user:1` deal, asserts exactly one 201 + count===1) +
   real complex-type DB check (`deal_id IS NULL` after reject)
7. Migration `0004_parched_stick.sql` is additive-only (`ADD COLUMN` + FK, no `ALTER`/`DROP`/backfill)

Mobile spot-checks: C1 client-side complex-type guard present in both `apply-deal.ts` and
`deal/[dealId].tsx`; `applyDealById` performs a real `getDeal()` fetch (not a mock lookup);
`cart.tsx` code-input UI fully removed AND `useReorderConflicts()` cross-feature import + render
path preserved intact; `checkout.tsx` passes `dealId` and the Total-display bug is fixed.

**Accepted known-gaps (unchanged from PVL/EXECUTE):**
- Mobile cart→apply→checkout UX is Agent-Probe-only (no RN test runner, project-wide gap).
- The client-side auto-strip `useEffect` is an intentional no-op for real (non-mock) deals — the
  server is the authoritative backstop at placement time.

**Note flagged at EVL:** the working tree has co-mingled uncommitted work from sibling batches —
`order-history-reorder-api` (a separate, unrelated feature batch) plus this program's own Phase
1/2 diffs — alongside Phase 3's changes. This is NOT a Phase 3 regression; it means the tree is
not isolated to a single logical commit. See UPDATE PROCESS closeout for the recommended
commit-scoping split.

closeout_classification: CLEAN

Status updated: COMPLETE → all gates independently confirmed; Phase 3 is ✅ VERIFIED.
