---
name: plan:mobile-tabs-order-flow-completion-phase-02-coupons-backend
description: "Mobile Tabs + Order-Flow Completion — Phase 02: Coupons backend (list + redeem + checkout auto-apply) on the reconciled coupons type/schema"
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: mobile-tabs-order-flow-completion
  phase: phase-02
---

# Phase 02 — Coupons Backend

**Program:** mobile-tabs-order-flow-completion
**Umbrella plan:** process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/mobile-tabs-order-flow-completion-umbrella_PLAN_14-07-26.md
**Date**: 14-07-26
**Status**: ✅ VERIFIED (EVL-confirmed 15-07-26 — 189/189 API tests, typecheck/lint/format green, migration 0007_round_menace applied; UPDATE PROCESS closeout complete)
**Complexity**: COMPLEX (phase of a COMPLEX phase program) — **HIGH-RISK** (scope expanded 14-07-26 into the order pricing/discount engine — see Inner Loop Refresh Note)
**Report destination:** process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-02-coupons-backend_REPORT_14-07-26.md

## Overview / Context

TL;DR: Serve the `coupons` table (already migrated in 0000) with a real list + redeem API so the Phase 4 coupon wallet has real data. Coupon issuance already exists via reward redemption (Phase 1 `POST /rewards/:id/redeem` creates a coupon). This phase adds the read + redeem surface AND (as of the 14-07-26 scope expansion) server-side coupon auto-apply at checkout — `POST /orders` gains an optional `couponId` that the server validates, prices, and atomically marks used. Read `process/context/all-context.md` and `process/context/tests/all-tests.md` first.

Coupon status transitions are server-authoritative: `available → used` (and `available → expired` by TTL). Never trust a client-sent discount.

**Expiry semantics (clarified at VALIDATE, 14-07-26):** `expires_at` TTL expiry is derived at READ/REDEEM time only — this phase never writes `status='expired'` back to the DB row (no cron/background job in scope). `GET /coupons` relabels a still-`available` row as `expired` in the response when `expires_at` is in the past; `POST /coupons/:id/redeem` independently re-checks `expires_at` at redeem time and rejects with 409 if past, regardless of the stored `status` value. `POST /orders` with `couponId` applies the same not-expired check inside the order-placement transaction.

## Phase Completion Rules

This phase is VERIFIED only when: all checklist items checked; the phase validate-contract exists with green gates; regression checks against overlapping earlier phases pass; and the phase report is written. Code-only completion is CODE DONE, never VERIFIED. Mobile-screen behavior with no automated runner is proven by Agent-Probe and recorded as Known-Gap. Post-phase testing uses the Exit Gate test gates (see process/context/tests/all-tests.md). Per the HIGH-risk classification (money-adjacent, order pricing engine), a high-risk evidence pack is required before EXECUTE is treated as finalize-ready (mirrors Phase 1's admin-dashboard precedent — evidence pack lives at `harness/phase-02-coupons-backend/` in this program's task folder, same shape as `harness/phase-01-rewards-backend/`).

## Acceptance Criteria

- AC1: GET /coupons lists own coupons with status filter + user isolation (Fully-Automated).
- AC2: POST /coupons/:id/redeem flips available->used; already-used/expired -> 409 (Fully-Automated).
- AC3: coupon from reward redemption appears in list.
- AC4 (added 14-07-26 — scope expansion): POST /orders with an optional `couponId` computes a real server-derived discount per the coupon's linked reward/deal, clamps it to subtotal, stacks correctly with an existing `dealId` discount, and atomically marks the coupon `used` — never twice (Fully-Automated).

## Entry Gate

- Phase 1 exit gate passed (coupons type reconciled to schema; reward-redemption coupon creation exists).
- **RE-CONFIRMED at this inner-PVL pass (14-07-26): Phase 1 (rewards backend) is `✅ VERIFIED` per the umbrella's Program Status Table, and `phase-01-rewards-backend_REPORT_14-07-26.md` confirms all 13 checklist items done, Exit Gate green, high-risk evidence pack present.** `packages/types/src/coupons.ts` ALREADY carries the reconciled schema-based shape (`Coupon{id,userId,code,status,dealId,rewardId,expiresAt,usedAt,createdAt}` + a separate `CouponDisplay` UI helper) — the placeholder shape is gone. `packages/api/src/routes/lib/serializers.ts` ALREADY has `serializeCoupon`/`ApiCoupon` (added by Phase 1, consumed today by `POST /rewards/:id/redeem`). **This Entry Gate is now satisfied — EXECUTE may proceed once this validate-contract is written.** (Prior stale text claiming Phase 1 had not executed and the type was still placeholder was written before Phase 1 finished and was never updated — corrected this pass.)
- **Migration entry gate for Step C (confirmed this pass).** `packages/api/src/db/schema/orders.ts` has NO `coupon_id` column — only `deal_id`. Step C REQUIRES a new additive migration before EXECUTE can touch `orders.ts`'s write path. See Step C0 below.

## Blast Radius

- `packages/api/src/routes/coupons.ts` — NEW session-gated route file (Step A/B). Confirmed absent from disk this pass.
- `packages/api/src/routes/lib/serializers.ts` — **`serializeCoupon`/`ApiCoupon` ALREADY EXIST (added by Phase 1, consumed by `rewards.ts`'s `POST /rewards/:id/redeem`). This phase EXTENDS the module by adding a NEW `serializeCouponWithLabel` function (Step A1a) rather than modifying `serializeCoupon`'s signature — see the Step A1a note on why a new function name is required, not a signature change.** Also adds a NEW `rewardDiscountLabel(reward_type, reward_value)` helper (Step A1b, analogous to the existing `dealDiscountLabel`) — confirmed absent from `serializers.ts` this pass.
- `packages/api/src/index.ts` — mount `/coupons` (see mount-path correction below — no `/api` prefix). Confirmed no `/coupons` mount exists yet.
- `packages/api/src/routes/__tests__/coupons.test.ts` — NEW automated gate (Step A/B).
- **`packages/api/src/routes/orders.ts` — IN SCOPE (14-07-26 expansion, Step C).** Adds optional `couponId` to `POST /orders`'s request schema; extends the existing placement transaction to lock, validate, price, and CAS-mark-used the coupon; stacks with the existing `dealId` discount path. Needs new imports: `coupons`, `rewards` from `../db/schema/index` (neither is currently imported in this file — confirmed by reading the current import block).
- **`packages/api/src/routes/__tests__/orders.test.ts` — EXTENDED (14-07-26 expansion, Step C4).** New coupon-apply cases added to the existing suite. `orders.test.ts` already has a proven concurrent-request test pattern (`Promise.all([...])` — see the existing `order_number` collision-retry test), reused for the coupon race case.
- **NEW migration file (name TBD by `db:generate`, additive nullable `orders.coupon_id uuid` FK, NO ACTION) — Step C0.** `packages/api/src/db/schema/orders.ts` gains a `coupon_id` column mirroring the existing `deal_id` column shape.

**Mount-path correction (applied at VALIDATE, 14-07-26 — was `/api/coupons`, corrected to `/coupons`):** the existing customer-facing session-gated routes (`/branches`, `/deals`, `/orders`, `/rewards` in `packages/api/src/index.ts`) are mounted WITHOUT an `/api` prefix; only the role-gated staff/admin surfaces (`/api/staff`, `/api/admin`) use the prefix. Coupons is a customer route (same tier as orders/rewards), not a role-gated staff/admin route, so it follows the `/orders`-style convention: mount as `app.use('/coupons', couponsRouter)` alongside the existing `app.use('/rewards', rewardsRouter)` line — no `/api` prefix. This also corrects the Public Contracts section below.

**Session-gating pattern correction (applied at VALIDATE, 14-07-26):** gate PER-ROUTE with `requireSession` (mirror `orders.ts`: `couponsRouter.get('/', requireSession, ...)`), NOT at router-mount level (`app.use('/coupons', requireSession, couponsRouter)`). The existing customer routers (`ordersRouter`, `rewardsRouter`) apply `requireSession` per-route inside the router file; only staff/admin apply the guard once at the `app.use(...)` mount. Follow the `orders.ts`/`rewards.ts` pattern, not the `staff.ts`/`admin` pattern.

## Implementation Checklist

**Cross-phase ownership note (added post-PVL supplement, closing a gap found by Phase 4's validator):** this phase (Phase 2) only produces the coupon display-label DATA at the API boundary (via the `serializeCouponWithLabel` join, Step A1a) and the checkout discount math (Step C). The `Coupon` type shape carrying the label field (and the 3-state `status: 'available' | 'used' | 'expired'` replacing the old boolean `isRedeemed`) is owned by Phase 1's type reconciliation (already delivered — see Entry Gate). The `CouponCard` UI consumption redesign AND the mobile checkout screen's `couponId` wiring (passing a selected coupon into `POST /orders`) are owned by **Phase 4's** INNOVATE/EXECUTE, not this phase. Phase 2 must not attempt to redesign `CouponCard`, `packages/types/src/coupons.ts`, or any mobile checkout UI — those remain out of this phase's scope. This phase only makes the BACKEND accept + correctly discount a `couponId`.

### Step A — List

- [ ] A0. **RESEARCH note (Phase 2 inner-loop RESEARCH, Step 1):** decide the exact display-label source for the list join by inspecting the `coupons`/`deals`/`rewards` schema for what's joinable — deal name, reward name, or a coupon-specific label. `coupons` has nullable `deal_id`/`reward_id` FKs (confirmed in `packages/api/src/db/schema/coupons.ts`) but no label column of its own, so the label must come from a read-time join to the referenced `deals`/`rewards` row. Do NOT add a migration unless RESEARCH finds the schema genuinely lacks any label source on both `deals` and `rewards` — flag it explicitly in the phase report if so, do not silently add a column.
- [ ] A1a. **NEW `serializeCouponWithLabel(coupon, deal | null, reward | null)` function in `serializers.ts` — do NOT modify the existing `serializeCoupon(coupon)` function's signature.** `serializeCoupon` is already shipped (Phase 1) and is consumed today by `POST /rewards/:id/redeem` (`rewards.ts:122`, called with only the coupon row — it has no joined deal/reward data available at that call site and doesn't need a label there). Changing `serializeCoupon`'s signature to require deal/reward params would be a breaking change to that existing call site. Instead, add a new function `serializeCouponWithLabel` that wraps `serializeCoupon`'s output and adds a `displayLabel: string` field, built from the joined deal (via `dealDiscountLabel`, reuse verbatim) or reward (via the new `rewardDiscountLabel`, A1b) row. `GET /coupons` (A1) uses `serializeCouponWithLabel`; `POST /rewards/:id/redeem` keeps using the unmodified `serializeCoupon`. This is a read-time join in the serializer, mirroring how `serializeDeal` shapes boundary output.
- [ ] A1b. **NEW: `rewardDiscountLabel(reward_type, reward_value)` helper** in `serializers.ts`, analogous to the existing `dealDiscountLabel(dealType, discountValue)` (serializers.ts:255). Produces a human-readable label for reward-issued coupons: `fixed_discount` → `"₱X OFF"`, `percentage_discount` → `"X% OFF"`, `free_item` → `"Free item"` or the reward's `name` if more specific. Used by A1a's join when a coupon's `reward_id` is set (vs `dealDiscountLabel` when `deal_id` is set — reuse the existing helper, export it if it is not already exported). **`reward_type` is a plain `varchar` column with no DB-level enum constraint (confirmed via schema read — `packages/api/src/db/schema/rewards.ts`) — only `'free_item'` has been seeded/tested so far (Phase 1's `rewards.test.ts`). `rewardDiscountLabel` MUST have an explicit `default:`/`else` branch for any `reward_type` string outside the three known values, returning a generic fallback label (e.g. the reward's own `name`) rather than throwing or returning `undefined`.**
- [ ] A1. `GET /coupons` (session-gated via per-route `requireSession`, mirror `orders.ts`) → the caller's coupons, newest-first, serialized via `serializeCouponWithLabel` over a LEFT JOIN to `deals`+`rewards` in the LIST QUERY itself (not N+1 per-row lookups). Support optional `?status=available` filter. Derive/relabel expired coupons (past `expires_at`) as `expired` in the response — READ-TIME ONLY, never write `status='expired'` back to the row in this phase (see Expiry semantics note in Overview).
- [ ] A2. Cover list shape + status filter + user-isolation (caller sees only own coupons → empty result for others, not 403 — this is a list-scoping filter, not an ownership-check endpoint) **and the display-label join (A1a/A1b)** — assert a seeded coupon with `deal_id` set AND a separate seeded coupon with `reward_id` set both return non-empty human-readable `displayLabel` fields in `coupons.test.ts` (Fully-Automated, mirrors `deals.test.ts`'s serializer assertions). Also assert `POST /rewards/:id/redeem`'s existing response shape is UNCHANGED (no `displayLabel` field, `serializeCoupon` untouched) — regression guard for the A1a signature-collision fix.

### Step B — Redeem (standalone status-flip, unchanged from original scope)

- [ ] B1. `POST /coupons/:id/redeem` (session-gated via per-route `requireSession`) → **atomic compare-and-swap UPDATE, mirroring the STAFF-003 order-status-transition pattern in `packages/api/src/routes/staff.ts` (`.update(coupons).set({status:'used', used_at: now}).where(and(eq(coupons.id, id), eq(coupons.user_id, userId), eq(coupons.status, 'available'))).returning()`)** — do NOT use a separate SELECT-then-UPDATE (TOCTOU race window that could let two concurrent redeem calls both pass a status check before either commits). After the CAS update: if 0 rows returned, distinguish the reason with follow-up reads for correct status codes — no such coupon id → 404; coupon exists but `user_id` mismatch → 403; coupon exists, owned, but `status != 'available'` (already used) → 409; coupon exists, owned, `status='available'` but `expires_at` in the past → 409 (checked in the same WHERE via `and(..., or(isNull(coupons.expires_at), gt(coupons.expires_at, now)))`, so an expired coupon never gets swapped even though its stored status is still `available`). Return the updated coupon on success.
- [ ] B2. **Coupon→order linkage: RESOLVED 14-07-26 — option (b) chosen.** `POST /orders` accepts an optional `couponId` and applies a real, server-computed discount (see Step C). `POST /coupons/:id/redeem` (this section) remains available as a standalone status-flip for any non-checkout redemption use case (e.g. staff-facing manual redemption at the branch counter) but is NOT the primary path for checkout discounting — that is Step C's job. Both paths share the same terminal invariant: a coupon can only ever transition `available → used` once, enforced by CAS in both places.
- [ ] B3. Cover redeem success, redeem-already-used → 409, redeem-expired → 409, redeem-not-owner → 403, **and a concurrent-double-redeem regression case** (two redeem calls against the same fixture coupon; assert exactly one succeeds and the other returns 409 — proves the CAS WHERE clause, not just the happy path).
- [ ] B4. **Coupon-from-reward-redemption fixture independence:** implement AC3 ("coupon from reward redemption appears in list") by inserting a coupon row directly in the test fixture with `reward_id` set (hermetic, self-seeding — mirror the pattern in `deals.test.ts`/`require-staff.integration.test.ts`), NOT by calling Phase 1's live `POST /rewards/:id/redeem` endpoint. This keeps `coupons.test.ts` self-contained. The same hermetic-fixture approach is reused for Step C's deal-issued-coupon test case (a coupon row with `deal_id` set has no live code path yet — no feature creates one today — so it must also be a direct fixture insert).

### Step C — Coupon auto-apply at checkout (NEW, 14-07-26 scope expansion — HIGH-RISK, money-adjacent)

- [ ] C0. **Migration.** Confirm (already confirmed this pass via direct schema read) that `packages/api/src/db/schema/orders.ts` has NO `coupon_id` column. Add `coupon_id: uuid('coupon_id').references(() => coupons.id)` to the `orders` table definition, mirroring the existing `deal_id: uuid('deal_id').references(() => deals.id)` column exactly (nullable, no `onDelete` action = NO ACTION default). Run `pnpm --filter @jojopotato/api db:generate` to produce the migration file, then `db:migrate` in Exit Gate. Do NOT hand-write the migration SQL — use drizzle-kit generate per repo convention (see the existing `0001`-`0006` migration history, all generated).
- [ ] C1. `POST /orders` request schema (zod) gains an OPTIONAL `couponId: z.string().uuid().optional()`, additive alongside the existing `dealId` field — do not touch existing required fields. Add `import { coupons, rewards } from '../db/schema/index';` to `orders.ts`'s existing import block (neither table is currently imported there).
- [ ] C2. **Inside the existing order-placement transaction** (same transaction that already handles `dealId` — see `orders.ts`'s existing deal-discount block for the pattern to extend, not replace): if `couponId` present, `SELECT ... FOR UPDATE` the coupon row scoped to `id = couponId`. **Lock ordering: acquire the coupon lock AFTER the deal lock when both `dealId` and `couponId` are present on the same request (i.e., keep the coupon block textually after the existing deal block), so every code path locks rows in the same relative order and no lock-order-dependent deadlock is possible between the two blocks.** Validate in order: (a) row exists → else 404; (b) `user_id` matches the session's caller → else 403; (c) `status = 'available'` → else 409; (d) `expires_at` is null or in the future → else 409 (reuse the same not-expired check as B1). Any failure aborts the transaction before any write — no partial state.
- [ ] C3. **Compute `couponDiscountCents` server-side** from the coupon's linked reward (`reward_id` → join `rewards`) or deal (`deal_id` → reuse `computeDealDiscountCents`, orders.ts:60-74, already a local non-exported function in the same file — no export needed):
  - `fixed_discount` → `numericToCents(reward_value)`.
  - `percentage_discount` → `Math.round(subtotalCents * reward_value / 100)`.
  - `free_item` → **the reward's `eligible_product_id`'s BASE PRICE in cents (`Math.round(Number(product.base_price) * 100)`, looked up via the already-built `productById` map from the items loop), NOT any specific order line's customized `unitPriceCents`.** Rationale: if the eligible product appears in the cart multiple times with different add-on/size selections (multiple order lines, same `product_id`, different `selectedOptions`), a specific-line lookup is ambiguous (which line?) and gameable (a customer could select the most-expensive customization on the free-item line to inflate the discount). Using the product's own `base_price` is unambiguous and server-derived, independent of which line/customization the client chose. Apply ONLY if `reward.eligible_product_id` is present among the order's distinct `productIds` (checked before the price lookup); if absent → reject with 400 and a clear message (e.g. `"Add {product name} to redeem this reward."`) — do not silently apply a 0 discount.
  - deal-issued coupon (`deal_id` set on the coupon row) → reuse `computeDealDiscountCents` verbatim (same complex-type rejection rules already enforced there — `buy_one_take_one`/`free_item`/`free_upgrade`/`bundle` deal types are rejected with 400 before any write, per the existing Phase-3-deals precedent in `orders.ts`).
  - **Unrecognized `reward_type` (i.e., `reward_id` is set but `reward_type` matches none of `fixed_discount`/`percentage_discount`/`free_item`, and `deal_id` is not set): reject with 400 ("This coupon cannot be applied at checkout") before any write — do not fall through to a 0 or `undefined` discount.** `reward_type` has no DB-level enum constraint (plain `varchar`), so this defensive branch is required, not optional.
  - ALL branches clamp EACH part individually: `Math.max(0, Math.min(computedDiscountCents, subtotalCents))`.
- [ ] C4. **Stacking with an existing `dealId` discount.** If BOTH `dealId` and `couponId` are present on the same request: compute `combinedDiscountCents = Math.min(dealDiscountCents + couponDiscountCents, subtotalCents)` — this is the value written to BOTH `discount_total` and used for `total`. **`discount_total` MUST store the CLAMPED combined value, never the raw unclamped sum** — storing the raw sum in `discount_total` while using the clamped value for `total` would break the invariant `subtotal - discount_total === total` in the persisted row (e.g. a 60%-off deal plus a large fixed coupon on a small order could sum past the subtotal; if `discount_total` stored that raw over-subtotal sum, the API response would show a `discountTotalCents` larger than `subtotalCents`, which is a data-integrity bug even though `total` itself would still correctly floor at 0). Write `discount_total = centsToNumeric(combinedDiscountCents)`, `total = centsToNumeric(subtotalCents - combinedDiscountCents)`, `deal_id`, and `coupon_id` atomically in the same INSERT as today's other order fields. When only ONE of `dealId`/`couponId` is present, `combinedDiscountCents` reduces to that single (already individually clamped) value — no behavior change from today's deal-only path.
- [ ] C5. **After the order row is successfully inserted, in the SAME transaction:** CAS-mark the coupon used — `UPDATE coupons SET status='used', used_at=now() WHERE id=:couponId AND status='available'`. If the CAS affects 0 rows (raced against a concurrent redeem/order-placement using the same coupon), ABORT the entire transaction (roll back the order insert too) and return 409. A coupon must never be usable twice, whether via `/coupons/:id/redeem` or via `/orders`'s auto-apply — both paths race against each other on the same CAS condition (`status='available'`), so a redeem-then-order-apply race and an order-apply-then-order-apply race are both correctly serialized by Postgres row locking (the `FOR UPDATE` in C2 already holds the lock through the CAS in C5, so no separate coordination is needed — confirmed by direct comparison against the existing `deals` `.for('update')` pattern in this same file, which is held through the equivalent usage-count reads).
- [ ] C6. **Client never sends a discount amount.** Confirm no existing or new field lets the client pass `discountTotal`/`couponDiscountCents` directly — the server always derives it from `couponId`/`dealId` alone. Mirror the existing invariant already enforced for `dealId`.

## Exit Gate

```bash
docker compose up -d && pnpm --filter @jojopotato/api db:generate && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test
# Expected: coupons.test.ts green; orders.test.ts green (incl. new coupon-apply cases); rewards.test.ts green (no regression from A1a's serializeCoupon-preserving fix); no regressions in deals suite

pnpm --filter @jojopotato/mobile typecheck
# Expected: exit 0
```

- All checklist items checked; redeem is transactional + idempotent (no double-use), proven by an explicit concurrent-redeem regression test (B3).
- **Coupon-at-checkout (Step C) is transactional + idempotent** — a coupon can be consumed exactly once whether via `/coupons/:id/redeem` or `/orders`, proven by the concurrent-double-use regression case (C-race, see Verification Evidence).
- Migration `orders.coupon_id` applied and confirmed via `db:migrate` running clean.
- **High-risk evidence pack required** (money-adjacent surface) before this phase is treated as finalize-ready — see Phase Completion Rules.
- Phase report written to report destination above.

## Blockers That Would Justify BLOCKED Status

- ~~Coupon→order-discount application turns out to be required AND expands into the pricing engine~~ — RESOLVED 14-07-26: this is now explicitly in scope as Step C. No longer a blocker condition.
- ~~Phase 1 coupon-creation contract not yet available (entry gate not met)~~ — RESOLVED: Phase 1 is `✅ VERIFIED` (confirmed this pass).
- Migration `orders.coupon_id` cannot be generated cleanly against current schema state (e.g. drizzle-kit detects an unrelated pending diff) — if so, isolate the coupon-id column into its own migration generation pass, do not bundle unrelated schema drift into this migration.

## Phase Loop Progress

- [ ] 1. RESEARCH — research-agent: prior phase reports read; test context loaded; coupon→order semantics decided-input gathered; plan drift checked
- [ ] 2. INNOVATE — innovate-agent: redeem semantics approach decided; Decision Summary written — **NOTE: this decision is now LOCKED by the user as option (b), auto-apply at checkout (see B2/Step C) — INNOVATE for this phase should confirm/refine implementation details of the locked decision, not re-litigate (a) vs (b).**
- [x] 3. PLAN-SUPPLEMENT — plan-agent: phase plan updated to fold in the checkout auto-apply scope expansion (14-07-26 pass) + this inner-PVL pass's direct plan-text fixes (14-07-26)
- [x] 4. PVL — vc-validate-agent: full V1-V7 RE-RUN complete this pass; validate-contract written below (`generated-by: inner-pvl: phase-2`)
- [x] 5. EXECUTE — all 22 checklist items done (A0-A2, B1-B4, C0-C6); Exit Gate green (API 189/189, typecheck 6/6, lint clean, mobile typecheck clean, format:check clean); migration 0007_round_menace.sql applied; high-risk evidence pack written + validated (15-07-26)
- [x] 6. EVL — all EVL gates green (independent orchestrator-driven re-run): API 189/189, typecheck 6/6, lint clean (3 pre-existing unrelated `dev-with-tunnel.mjs` warnings), mobile typecheck clean, format:check clean, migration `0007_round_menace.sql` applied clean; no follow-up stubs required (no gate failures)
- [x] 7. UPDATE PROCESS — phase report present (`phase-02-coupons-backend_REPORT_14-07-26.md`); umbrella `## Current Execution State` rewritten to Phase 3; execution commit still pending (orchestrator to invoke `vc-git-manager`)

## Deviations (recorded at EXECUTE, 15-07-26)

- **`rewardDiscountLabel` signature — within-blast-radius, minor.** Plan A1b wrote the helper as `rewardDiscountLabel(reward_type, reward_value)`. Implemented as `rewardDiscountLabel(rewardType, rewardValue, rewardName)` — the third `rewardName` param is REQUIRED to satisfy the plan's OWN stated behavior in the same item ("`free_item` → 'Free item' or the reward's `name`" and "returning a generic fallback label (e.g. the reward's own name)"). A pure `(type, value)` signature cannot access the name. Same file (`serializers.ts`), same blast-radius, same semantic operation. No public contract impact (helper is internal, only consumed by `serializeCouponWithLabel`). Rationale: necessary to implement the specified fallback behavior.

**Validate-contract is current as of this pass (Gate: PASS — see below). EXECUTE may proceed once the orchestrator confirms Steps 1-2 (RESEARCH/INNOVATE) are handled per the umbrella's inner-loop sequencing — this VALIDATE pass ran ahead per explicit user instruction to re-gate Step C rigorously; RESEARCH/INNOVATE for Step C's implementation-detail confirmation (not the already-locked (a)-vs-(b) decision) should still run before EXECUTE per the standard 7-step loop, unless the orchestrator judges the plan sufficiently detailed to proceed directly.**

## Inner Loop Refresh Note

**Date: 14-07-26**

Inner-loop RESEARCH + a user-directed scope decision ran this pass (outside the normal RESEARCH→INNOVATE sequencing — the user directly specified the locked design for the checkout auto-apply feature, superseding what would have been an INNOVATE (a)-vs-(b) discussion for B2). Summary of what changed:

- **Scope EXPANDED**: this phase now includes coupon auto-apply at checkout (`POST /orders` gains optional `couponId`), which touches the order pricing/discount engine (`orders.ts`) — previously explicitly out of scope ("Possibly `packages/api/src/routes/orders.ts` — IF coupon-at-checkout application is in scope... default: redeem marks used").
- **B2's (a)-vs-(b) decision is now RESOLVED as (b)** — auto-apply at checkout, not a standalone status-flip-only design.
- **New migration required**: `orders.coupon_id` column confirmed absent from schema — Step C0 added.
- **Risk classification raised**: HIGH-RISK (money-adjacent, order pricing engine) — a high-risk evidence pack is now required before this phase is finalize-ready.
- **New blast-radius files**: `orders.ts`, `orders.test.ts` (extended), a new migration file, `serializers.ts` (additionally gains `rewardDiscountLabel` + `serializeCouponWithLabel`).
- Mobile checkout UI wiring (passing a selected `couponId` into the `POST /orders` call) is explicitly Phase 4's responsibility, not this phase's — this phase only makes the backend correctly accept and price a `couponId` when present.

**Full inner PVL ran this pass (14-07-26, second cycle).** The prior `Gate: PASS` contract (dated 14-07-26, `generated-by: outer-pvl`, retained below in the collapsed history block) covered ONLY the original list+redeem scope. This pass re-ran V1-V7 in full against the supplemented plan (Step C, the new migration, the stacking/clamping math, and the cross-coupon-cross-order race condition) and found + fixed 5 gaps directly in plan text: (1) stale Entry Gate/Blast Radius text (Phase 1 was actually already `✅ VERIFIED`, not pending), (2) a breaking-change collision — Step A1a would have changed `serializeCoupon`'s signature and broken `rewards.ts`'s existing call site (fixed via a new `serializeCouponWithLabel` function instead), (3) an ambiguous/gameable free-item discount price source (fixed: use product base price, not a specific cart line's customized price), (4) a `discount_total` clamping ambiguity that could store an inconsistent value relative to `total` (fixed: store the clamped combined value), (5) no defensive branch for an unrecognized `reward_type` string (fixed: explicit 400 rejection). See the new Validate Contract below for the full dimension findings.

## Touchpoints

- `packages/api/src/routes/coupons.ts`, `packages/api/src/routes/lib/serializers.ts`, `packages/api/src/index.ts`
- `packages/api/src/routes/__tests__/coupons.test.ts`
- `packages/types/src/coupons.ts` (consume reconciled shape — do NOT re-edit shape here; already reconciled by Phase 1, confirmed this pass)
- **`packages/api/src/routes/orders.ts`** (adds optional `couponId` to request schema; extends the placement transaction with coupon lock/validate/price/CAS-mark-used; stacks with existing `dealId` discount; adds `coupons`/`rewards` imports).
- **`packages/api/src/routes/__tests__/orders.test.ts`** (extended with coupon-apply cases).
- **`packages/api/src/db/schema/orders.ts`** (adds `coupon_id` column) + a new drizzle-generated migration file.
- `packages/api/src/routes/__tests__/rewards.test.ts` (regression assertion only — confirm `serializeCoupon`'s existing response shape is unchanged after A1a).

## Public Contracts

- NEW: `GET /coupons`, `POST /coupons/:id/redeem` (session-gated per-route via `requireSession`; no `/api` prefix — corrected at VALIDATE to match the `/orders`/`/deals`/`/branches`/`/rewards` convention).
- **CHANGED: `POST /orders`** — gains an OPTIONAL, additive `couponId` field in the request body. Existing callers that omit `couponId` are entirely unaffected (backward-compatible). Response shape for `Order` gains a `coupon_id` field (nullable), mirroring the existing `deal_id` field's presence in the response — additive, non-breaking.
- **UNCHANGED (confirmed this pass, was a risk — see Inner Loop Refresh Note): `POST /rewards/:id/redeem`** — response shape is exactly as Phase 1 shipped it (uses `serializeCoupon`, no `displayLabel` field). The new label-join logic lives entirely in the new `serializeCouponWithLabel` function, used only by `GET /coupons`.
- Order/payment behavior otherwise UNCHANGED: `payment_status` stays `unpaid` regardless of coupon/deal application; no live payment processing is introduced by this phase.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `GET /coupons` returns own coupons, status filter works, other users isolated (`coupons.test.ts`) | Fully-Automated | AC-1 (coupons listable) |
| `POST /coupons/:id/redeem` flips available→used; already-used/expired → 409; not-owner → 403 | Fully-Automated | AC-2 (coupons redeemable) |
| Concurrent double-redeem: exactly one of two simultaneous redeem calls succeeds | Fully-Automated | AC-2 (idempotent, no double-use) |
| Coupon created by reward redemption (Phase 1) appears in list (via direct fixture insert) | Fully-Automated | AC-3 |
| `serializeCouponWithLabel` returns a `displayLabel` (deal/reward join) for seeded coupons with `deal_id` or `reward_id` set (`coupons.test.ts`) | Fully-Automated | AC-3 (coupon wallet has renderable label data) |
| `POST /rewards/:id/redeem` response shape unchanged (no `displayLabel`, `serializeCoupon` untouched) — regression guard | Fully-Automated | Breaking-change guard (Step A1a fix) |
| `POST /orders` with `couponId` (fixed_discount reward) computes correct cents discount, clamps to subtotal (`orders.test.ts`) | Fully-Automated | AC-4 |
| `POST /orders` with `couponId` (percentage_discount reward) computes correct rounded cents discount | Fully-Automated | AC-4 |
| `POST /orders` with `couponId` (free_item reward), eligible product present with add-on customizations on its order line → discount equals the product's BASE price, not the customized line price | Fully-Automated | AC-4 (free-item price-source fix) |
| `POST /orders` with `couponId` (free_item reward), eligible product absent from cart → 400, no order written | Fully-Automated | AC-4 |
| `POST /orders` with `couponId` (deal-issued coupon, hermetic fixture with `deal_id` set) reuses `computeDealDiscountCents`; complex deal types rejected 400 | Fully-Automated | AC-4 |
| `POST /orders` with `couponId` whose linked reward has an unrecognized `reward_type` → 400, no order written | Fully-Automated | AC-4 (defensive reward_type fix) |
| `POST /orders` with both `dealId` and `couponId`: `discountTotalCents` in the response equals `subtotalCents - totalCents` exactly (clamped-sum invariant), never exceeds subtotal | Fully-Automated | AC-4 (stacking + discount_total consistency fix) |
| `POST /orders` with expired/used/not-owned `couponId` → 400/409/403, no order written | Fully-Automated | AC-4 |
| Concurrent double-apply: two simultaneous `POST /orders` using the same `couponId` — exactly one order succeeds with the coupon applied, the other 409s, coupon ends `used` exactly once | Fully-Automated | AC-4 (race safety) |
| Coupon rollback: if order placement fails after the coupon lock but before commit, the coupon remains `available` (transaction rollback, not partial CAS) | Fully-Automated | AC-4 (atomicity) |

```bash
pnpm --filter @jojopotato/api test
# Expected: coupons.test.ts green, orders.test.ts green (incl. new coupon cases), rewards.test.ts green (no regression), no regressions elsewhere
```

## Test Infra Improvement Notes

(none identified yet)

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-02-coupons-backend_PLAN_14-07-26.md`
- Last completed step: PVL (this pass, 14-07-26, second cycle) — full V1-V7 re-run against the Step C scope expansion; 5 gaps found and fixed directly in plan text; validate-contract below is current (`Gate: PASS`, `generated-by: inner-pvl: phase-2`).
- Validate-contract status: **CURRENT — see `## Validate Contract` below.**
- Supporting context: `packages/api/src/db/schema/{coupons,orders,rewards}.ts`, Phase 1 report (`phase-01-rewards-backend_REPORT_14-07-26.md` — confirms Phase 1 `✅ VERIFIED`), `deals.test.ts`/`orders.test.ts` as supertest + concurrency-test patterns, `staff.ts` (compare-and-swap update pattern), `orders.ts`'s existing `computeDealDiscountCents` + deal-discount transaction block (the pattern Step C extends), `rewards.ts` (existing `serializeCoupon` call site that Step A1a must not break).
- Next step: EXECUTE may proceed on this phase per the Validate Contract's `Gate: PASS` below, once the orchestrator confirms the standard inner-loop RESEARCH/INNOVATE steps for Step C's implementation details are either run or explicitly judged unnecessary given this plan's level of detail.

## Validate Contract

Date: 14-07-26
date: 2026-07-14
generated-by: inner-pvl: phase-2
supersedes: 2026-07-14 (outer-pvl) — inner PVL has current evidence (full re-scope: Step C checkout auto-apply, the new migration, the stacking/clamping math, and the cross-coupon-cross-order race condition were not evaluated by the prior outer-pvl contract)

Parallel strategy: sequential
Rationale: Score 4/7 (S2 API/auth surface, S4 phase-program, S6 high-risk billing/credits-adjacent class present, S7 blast radius now 7+ files across `packages/api/src/{routes,db/schema}` — crossing the 5-file threshold with the Step C expansion). This 4/7 score would nominally suggest workflow/agent-team for the VALIDATE fan-out itself (and this pass effectively ran that way — 4 Layer-1 dimension checks + 3 Layer-2 section checks against real code, not just plan text). For the upcoming EXECUTE phase, the dominant fact overrides the raw score: Steps A/B write into the SAME new files (`coupons.ts`, `coupons.test.ts`) and Step C edits are entirely inside the SAME existing file (`orders.ts`, `orders.test.ts`) that Steps A/B do not touch — there is no file-level parallelism opportunity that wouldn't require artificial splitting of a single file's edits across agents, which is unsafe. Recommend **sequential** — one `vc-execute-agent` for EXECUTE, working Step A → Step B → Step C in order (each step is independently gate-able per its own test cases).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | `GET /coupons` lists caller's own coupons, newest-first, `?status=` filter, other users' coupons excluded | Fully-Automated | `pnpm --filter @jojopotato/api test` — `coupons.test.ts` list-shape + filter + isolation cases | A |
| AC2 | `POST /coupons/:id/redeem` flips `available→used`; already-used/expired → 409; not-owner → 403 | Fully-Automated | `pnpm --filter @jojopotato/api test` — `coupons.test.ts` redeem success/409/403 cases | A |
| AC2 (race) | Concurrent double-redeem: exactly one of two simultaneous calls on the same coupon succeeds, the other gets 409 | Fully-Automated | `pnpm --filter @jojopotato/api test` — `coupons.test.ts` concurrent-redeem regression case (B3) | A |
| AC3 | Coupon created via reward redemption (`reward_id` set) appears in the caller's list; label present via `serializeCouponWithLabel` | Fully-Automated | `pnpm --filter @jojopotato/api test` — `coupons.test.ts` fixture-insert + label-join cases (B4, A2) | A |
| Breaking-change guard | `POST /rewards/:id/redeem` response shape is byte-identical to Phase 1's shipped shape (no `displayLabel`) | Fully-Automated | `pnpm --filter @jojopotato/api test` — `rewards.test.ts` existing assertions must remain green (regression, no new test needed beyond confirming no drift) | A |
| AC4 — fixed_discount | `POST /orders` with a `fixed_discount`-reward coupon computes correct cents discount, clamped to subtotal | Fully-Automated | `pnpm --filter @jojopotato/api test` — `orders.test.ts` new coupon-apply case | A |
| AC4 — percentage_discount | `POST /orders` with a `percentage_discount`-reward coupon computes correct rounded cents discount | Fully-Automated | `pnpm --filter @jojopotato/api test` — `orders.test.ts` new coupon-apply case | A |
| AC4 — free_item (present, customized) | `POST /orders` with a `free_item`-reward coupon whose eligible product is in cart WITH add-on customizations discounts the product's BASE price, not the customized line price | Fully-Automated | `pnpm --filter @jojopotato/api test` — `orders.test.ts` new coupon-apply case | A |
| AC4 — free_item (absent) | `POST /orders` with a `free_item`-reward coupon whose eligible product is NOT in cart → 400, no order written | Fully-Automated | `pnpm --filter @jojopotato/api test` — `orders.test.ts` new coupon-apply case | A |
| AC4 — deal-issued coupon | `POST /orders` with a hermetic-fixture coupon (`deal_id` set) reuses `computeDealDiscountCents`; complex deal types rejected 400 | Fully-Automated | `pnpm --filter @jojopotato/api test` — `orders.test.ts` new coupon-apply case | A |
| AC4 — unrecognized reward_type | `POST /orders` with a coupon whose reward has an unrecognized `reward_type` → 400, no order written | Fully-Automated | `pnpm --filter @jojopotato/api test` — `orders.test.ts` new coupon-apply case | A |
| AC4 — stacking consistency | `POST /orders` with both `dealId` and `couponId`: `discountTotalCents === subtotalCents - totalCents` exactly, sum-clamped, never negative | Fully-Automated | `pnpm --filter @jojopotato/api test` — `orders.test.ts` new coupon-apply case | A |
| AC4 — terminal rejections | `POST /orders` with expired/used/not-owned `couponId` → 400/409/403, no order written | Fully-Automated | `pnpm --filter @jojopotato/api test` — `orders.test.ts` new coupon-apply cases | A |
| AC4 — race | Concurrent double-apply: two simultaneous `POST /orders` on the same `couponId` — exactly one succeeds, the other 409s, coupon ends `used` exactly once | Fully-Automated | `pnpm --filter @jojopotato/api test` — `orders.test.ts` new coupon-race case (reuses the proven `Promise.all` pattern already in this file) | A |
| AC4 — atomicity | Coupon rollback: order placement failing after the coupon lock but before commit leaves the coupon `available` | Fully-Automated | `pnpm --filter @jojopotato/api test` — `orders.test.ts` new coupon-apply case | A |
| Migration | `orders.coupon_id` migration applies cleanly, additive, no data loss | Hybrid | `pnpm --filter @jojopotato/api db:generate && pnpm --filter @jojopotato/api db:migrate` — precondition: local/CI Postgres via docker compose (or native fallback per `all-tests.md`) | A |

gap-resolution legend: A — proven now (gate passes in this cycle). No B/C/D rows — no deferred or backlog-only coverage in this phase's scope.

Legacy line form:
- coupons list+redeem+checkout-apply (packages/api): Fully-automated: `docker compose up -d && pnpm --filter @jojopotato/api db:generate && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test` | hybrid precondition: local/CI Postgres via docker compose (or the native Postgres fallback documented in `all-tests.md`) | agent-probe: n/a (no mobile UI in this phase) | known-gap: none

Dimension findings:
- Infra fit: CONCERN → FIXED IN PLAN — Entry Gate and Blast Radius text were stale (written before Phase 1 finished; claimed Phase 1 not executed and `serializeCoupon`/`ApiCoupon` as net-new). Re-confirmed via direct reads: Phase 1 is `✅ VERIFIED`, `packages/types/src/coupons.ts` already carries the reconciled shape, and `serializeCoupon`/`ApiCoupon` already exist in `serializers.ts`. Corrected Entry Gate and Blast Radius text this pass. Mount path (`/coupons`, no `/api` prefix) and per-route session-gating pattern were already correctly specified from the prior pass and remain unchanged. Migration path (drizzle-kit `db:generate`, additive nullable FK, NO ACTION) confirmed correct via direct schema read — `orders.ts` genuinely has no `coupon_id` column.
- Test coverage: CONCERN → FIXED IN PLAN — the original Verification Evidence table listed every AC4 money path but did not explicitly test the `discount_total`-vs-`total` consistency invariant under stacking, nor the free-item multi-line price-source ambiguity, nor an unrecognized-`reward_type` rejection path. All three are now explicit rows in the Verification Evidence table and the Test Gates table above (all Fully-Automated, using the existing `orders.test.ts`/`coupons.test.ts` supertest + `Promise.all` concurrency pattern already proven in this codebase — no new test infra required). Every developed money-path behavior in this phase's blast radius now has an asserting Fully-Automated test row; no behavior rests on Known-Gap.
- Breaking changes: CONCERN → FIXED IN PLAN — the original Step A1a would have changed `serializeCoupon`'s signature (or its behavior) to add a display label, which would have broken `rewards.ts`'s existing `POST /rewards/:id/redeem` call site (`serializeCoupon(coupon)`, called with only the coupon row, no deal/reward context, already shipped by Phase 1). Fixed by introducing a NEW function `serializeCouponWithLabel(coupon, deal, reward)` used only by `GET /coupons`, leaving `serializeCoupon` completely untouched. Added an explicit regression assertion (rewards.test.ts response-shape check) to the Test Gates table to guard this going forward. The `POST /orders` `couponId` addition itself is correctly additive/backward-compatible (optional field, mirrors the proven `dealId` pattern) — confirmed by direct code read of the existing zod schema and insert statement.
- Security surface: CONCERN → FIXED IN PLAN — two money-correctness gaps found by direct code-level reasoning: (1) the free-item discount's price source was ambiguous/gameable when the eligible product appears on multiple order lines with different customizations — fixed by pricing from the product's `base_price` (server-derived, unambiguous) instead of any specific line's customized price; (2) `reward_type` is an unconstrained `varchar` (no DB enum) and the plan had no fallback branch for an unrecognized value — fixed by adding an explicit 400-reject branch. Row-locking (`SELECT...FOR UPDATE` on the coupon, held through the CAS mark-used) and the CAS-mark-used-inside-the-same-transaction-as-the-order-insert design were already correctly specified and are confirmed sound by direct comparison against the existing, already-proven `deals` `.for('update')` pattern in the same file — no client-sent discount amount is ever accepted (server always derives from `couponId`/`dealId` alone, C6). Added a lock-ordering note (coupon lock always acquired after the deal lock, textually) to eliminate any theoretical cross-lock deadlock when both `dealId` and `couponId` are present on the same request.
- Section A — List: CONCERN → FIXED IN PLAN — same signature-collision issue as Breaking changes above (Step A1a), fixed by the new `serializeCouponWithLabel` function. Mechanically feasible otherwise (new file, no collisions); expiry relabeling remains read-time-derived only, never a DB write in this phase.
- Section B — Redeem: PASS — unchanged from the prior validated pass; CAS-update pattern already correct and precedented (STAFF-003). B2's scope-control decision is resolved (option (b)) and consistently reflected across B2/Step C. B4's hermetic-fixture approach is reused for Step C's deal-issued-coupon test case (no live code path creates a `deal_id`-set coupon yet), confirmed mechanically feasible.
- Section C — Checkout auto-apply (NEW): CONCERN → FIXED IN PLAN — mechanical feasibility confirmed by direct comparison against `orders.ts`'s existing deal-discount transaction block (same file, same transaction, same `.for('update')` pattern, `computeDealDiscountCents` already a local reusable function). Gaps found and fixed: missing `coupons`/`rewards` imports (noted explicitly in C1), the discount_total clamping ambiguity (C4), the free-item price-source ambiguity (C3), the unrecognized-reward_type fallback (C3), and the lock-ordering note (C2). No conflicts with other phases — `orders.ts` is not listed as a shared surface in the umbrella's Pre-PVL Conflict Resolution section, confirming no concurrent phase touches this file. Highest-risk edit: the coupon CAS-mark-used at C5, sequenced after the order insert within the same transaction — mitigation already correctly specified (any prior failure throws before C5 is reached, rolling back the whole transaction including any implicit coupon state change).

Open gaps:
- None blocking. Residual note (non-blocking): `reward_type`'s lack of a DB-level enum means a future admin-authored reward row with an unexpected `reward_type` string will be safely rejected at checkout (400, per this pass's fix) rather than silently mispriced — this is the correct defensive behavior, not a gap, but worth remembering if a future phase adds a `reward_type` enum constraint at the schema level (would be a natural follow-up, not required now).
- High-risk evidence pack (`harness/phase-02-coupons-backend/`) is an EXECUTE-time deliverable per Phase Completion Rules — not required to exist at VALIDATE time, but EXECUTE must produce it (mirrors Phase 1's `harness/phase-01-rewards-backend/` precedent) before this phase is finalize-ready.

What this coverage does NOT prove:
- `pnpm --filter @jojopotato/api test` (coupons.test.ts + orders.test.ts + rewards.test.ts) proves: list/filter/isolation shape, redeem status transitions incl. 409/403 terminal cases, concurrent-redeem and concurrent-order-apply race safety (two-caller regression, not many-caller load), reward-linked and deal-linked coupon discount computation across all 3 reward types plus deal reuse, the discount_total/total consistency invariant under stacking, defensive rejection of malformed/expired/used/not-owned coupons and unrecognized reward types, transactional rollback-on-failure atomicity, and that `POST /rewards/:id/redeem`'s existing response shape is unbroken. It does NOT prove: coupon/discount behavior under real network latency/retry from the mobile client (no mobile UI in this phase's scope — deferred to Phase 4); a full reward→coupon→redeem→checkout round trip through Phase 1's live endpoint end-to-end in one flow (fixtures deliberately decouple each phase's tests, so a genuine cross-phase integration seam is unverified until Phase 4's Agent-Probe walkthrough or a future cross-phase regression check); coupon/order behavior at scale (many concurrent attempts beyond the two-caller regression cases); or any UI-level coupon selection/application behavior (Phase 4's scope).
- `pnpm --filter @jojopotato/mobile typecheck` proves: no mobile consumer is broken by anything in this phase's blast radius (there should be none — Phase 2 has no mobile touchpoints). It does NOT prove anything about coupon UI, which lands in Phase 4.
- `db:generate && db:migrate` (Hybrid, requires local/CI Postgres) proves: the migration applies cleanly against the current schema state with no destructive change. It does NOT prove the migration is safe against a production dataset with existing rows in unexpected states (no such dataset exists yet — pre-launch project).

Gate: PASS (no unresolved FAILs; all 5 CONCERNs found this pass were fixed directly in plan text — see Dimension findings above; every developed money-path behavior has an asserting Fully-Automated test row, satisfying the net-gate vacuous-green ban)
Accepted by: session (autonomous inner-PVL pass per explicit user instruction to "fix small forward-text gaps directly in the plan" and "emit the Gate verdict" — all CONCERNs were resolved as direct plan-text fixes before the net-gate computation, consistent with the V3 Net Gate Rule: "PASS: 0 FAILs, 0 CONCERNs. All plan fixes applied.")

<details>
<summary>Prior PASS contract (list+redeem scope only, dated 14-07-26, generated-by: outer-pvl, now superseded)</summary>

Date: 14-07-26
date: 2026-07-14
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Score 3/7 (S2 API/auth surface, S4 phase-program, S6 high-risk billing/credits-adjacent class present; S1/S3/S5/S7 absent — blast radius is 4 firm files, all inside `packages/api`, single package). MEDIUM-band signal count would suggest parallel subagents for the *fan-out that validated this plan* (and that IS how this VALIDATE pass was run: 4 Layer-1 dimension checks + 2 Layer-2 section checks), but for the upcoming EXECUTE phase the dominant fact overrides the raw score: Step A and Step B both write into the SAME new file (`coupons.ts`) and the SAME new test file (`coupons.test.ts`) — parallel execute agents would collide on those two files. Recommend **sequential** — one `vc-execute-agent` for EXECUTE.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | `GET /coupons` lists caller's own coupons, newest-first, `?status=` filter, other users' coupons excluded | Fully-Automated | `pnpm --filter @jojopotato/api test` — `coupons.test.ts` list-shape + filter + isolation cases | A |
| AC2 | `POST /coupons/:id/redeem` flips `available→used`; already-used/expired → 409; not-owner → 403 | Fully-Automated | `pnpm --filter @jojopotato/api test` — `coupons.test.ts` redeem success/409/403 cases | A |
| AC2 (race) | Concurrent double-redeem: exactly one of two simultaneous calls on the same coupon succeeds, the other gets 409 | Fully-Automated | `pnpm --filter @jojopotato/api test` — `coupons.test.ts` concurrent-redeem regression case (B3) | A |
| AC3 | Coupon created via reward redemption (`reward_id` set) appears in the caller's list | Fully-Automated | `pnpm --filter @jojopotato/api test` — `coupons.test.ts` fixture-insert case (B4, hermetic — does not call Phase 1's live endpoint) | A |
| AC3 (mobile) | Type reconciliation from Phase 1 flows through to a typecheck-clean consumer in this phase (no mobile UI in Phase 2 scope) | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` | A |
| AC3 (label) | `serializeCoupon` display-label join (deal/reward name → renderable label) present in `GET /coupons` response for seeded coupons | Fully-Automated | `pnpm --filter @jojopotato/api test` — `coupons.test.ts` label-join case (A2, added post-PVL supplement) | A |

gap-resolution legend: A — proven now (gate passes in this cycle). No B/C/D rows — no deferred or backlog-only coverage in this phase's scope.

Legacy line form:
- coupons list+redeem (packages/api): Fully-automated: `docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test` | hybrid precondition: local/CI Postgres via docker compose (or the native Postgres fallback documented in `all-tests.md`) | agent-probe: n/a (no mobile UI in this phase) | known-gap: none

Dimension findings:
- Infra fit: CONCERN → FIXED IN PLAN — plan originally specified an `/api/coupons` mount and left the session-gating layer ambiguous. Corrected to `/coupons` (mirrors the established `/orders`/`/deals`/`/branches` customer-route convention — `/api/*` is reserved for the newer staff/admin role-gated surfaces) and to per-route `requireSession` (mirrors `orders.ts`, not the router-mount-level guard used by staff/admin). `coupons` table + `coupon_status` enum already exist in migration `0000_puzzling_lightspeed.sql` — no new migration needed, confirmed by reading `packages/api/src/db/schema/coupons.ts`.
- Test coverage: CONCERN → FIXED IN PLAN — the original checklist did not include an explicit concurrent-double-redeem regression test (only the happy path + terminal-state 409s), and AC3's coverage plan implicitly depended on Phase 1's live redeem endpoint being available at test time. Added B3's concurrent-redeem case and B4's hermetic fixture-insert approach (mirrors `deals.test.ts`/`require-staff.integration.test.ts`'s self-seeding pattern). All scenarios remain Fully-Automated/Hybrid-precondition (real Postgres via docker compose) — meets the minimum tier for the billing/credits-adjacent high-risk class.
- Breaking changes: PASS — additive-only new routes; `packages/types/src/coupons.ts` is consumed, not re-edited, in this phase (edited once in Phase 1). No existing public contract is modified.
- Security surface: CONCERN → FIXED IN PLAN — the original B1 ("verify ownership + status + expiry, then set status='used'") was a SELECT-then-UPDATE pattern with a TOCTOU race window: two concurrent redeem calls could both pass the read-side check before either commits the write, producing a double-redeem. Corrected to an atomic compare-and-swap UPDATE (`.where(and(eq(id,…), eq(user_id,…), eq(status,'available'), not-expired))`) — the exact pattern already proven in production by STAFF-003's order-status transitions (`packages/api/src/routes/staff.ts`), so this is a known-good, already-precedented mitigation, not a novel one. Ownership check (403) and no-client-sent-discount (redeem takes no amount param, pure status flip) both already correctly specified in the original plan.
- Section A — List: PASS (after clarification) — mechanically feasible (new file, no collisions); clarified that expiry relabeling is read-time-derived only, never a DB write in this phase, avoiding an implicit cron/background-job scope creep.
- Section B — Redeem: CONCERN → FIXED IN PLAN — same CAS-update fix as Security surface above; B2's (a)-vs-(b) scope-control decision (status-flip default, order-discount deferred as a documented follow-up) was already well-specified in the original plan and needed no change — this correctly prevents scope creep into the `POST /orders` discount-math engine (confirmed by reading `orders.ts`'s existing deal-discount code path: it is a self-contained, deal-specific block that this phase does not need to touch under the chosen default).

Open gaps:
- Phase 1 dependency (informational, not a plan defect): as of this VALIDATE pass, `packages/types/src/coupons.ts` still carries the pre-reconciliation placeholder shape (`title`/`discountLabel`/`isRedeemed`) — Phase 1 has not executed yet (umbrella's Current Execution State shows Phase 1 at loop step RESEARCH, not started). This phase's own Entry Gate already correctly requires Phase 1's exit gate before EXECUTE begins; no plan change needed, flagged here so EXECUTE does not start out of sequence.
- ~~B2's (a)-vs-(b) redeem-semantics decision is deferred to INNOVATE~~ — RESOLVED 14-07-26 as (b); see Step C.

Post-PVL supplement note (added by plan-agent, PVL-supplement mode, prior pass): Phase 4's validator found that the coupon wallet UI has no display-label data source once the type is reconciled (coupons carry only `dealId`/`rewardId`/`status`/`code`/`expiresAt`, no name/discount-label field). Added Step A0 (RESEARCH note to pick the label source), A1a (serializeCoupon must join deals/rewards to produce the label), extended A2's test coverage, and a cross-phase ownership note clarifying Phase 1 owns the type shape and Phase 4 owns the UI consumption. This is additive scope clarification within the existing blast radius (`serializers.ts`, `coupons.ts`, `coupons.test.ts`) — no new files, no new API surface, no schema change (join only, no migration). Validate-contract gate remains PASS; no FAIL was raised.

What this coverage does NOT prove:
- `pnpm --filter @jojopotato/api test` (coupons.test.ts) proves: list/filter/isolation shape, redeem status transitions incl. 409/403 terminal cases, one concurrent-redeem race case, and reward-linked coupon visibility via a direct fixture. It does NOT prove: coupon behavior under real network latency/retry from the mobile client (no mobile UI in this phase's scope — deferred to Phase 4); a full reward→coupon→redeem round trip through Phase 1's live endpoint end-to-end (B4 deliberately decouples via a fixture, so a genuine Phase-1-to-Phase-2 integration seam is unverified until Phase 4's Agent-Probe walkthrough or a future cross-phase regression check); coupon behavior at scale (many concurrent redeem attempts beyond the single two-caller regression case); or (as of this stale contract) ANY coupon-to-order discount application — that is now Step C, unvalidated by this contract.
- `pnpm --filter @jojopotato/mobile typecheck` proves: no other mobile consumer is broken by anything in this phase's blast radius (there should be none, since Phase 2 has no mobile touchpoints). It does NOT prove anything about coupon UI, which lands in Phase 4.

Gate: PASS (list+redeem scope only — no FAILs; all CONCERNs fixed directly in plan text this pass — see Dimension findings). **This gate does NOT cover Step C (checkout auto-apply) — see Inner Loop Refresh Note.**
Accepted by: session (autonomous outer-PVL pass, no user gate reached — all CONCERNs were resolved as direct plan-text fixes before the net-gate computation, consistent with V3 Net Gate Rule: "PASS: 0 FAILs, 0 CONCERNs. All plan fixes applied.")

</details>
