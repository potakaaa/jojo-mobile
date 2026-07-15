---
name: plan:mobile-tabs-order-flow-completion-phase-02-coupons-backend
description: "Mobile Tabs + Order-Flow Completion — Phase 02: Coupons backend (list + redeem) on the reconciled coupons type/schema"
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
**Status**: ⏳ PLANNED
**Complexity**: COMPLEX (phase of a COMPLEX phase program)
**Report destination:** process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-02-coupons-backend_REPORT_14-07-26.md

## Overview / Context

TL;DR: Serve the `coupons` table (already migrated in 0000) with a real list + redeem API so the Phase 4 coupon wallet has real data. Coupon issuance already exists via reward redemption (Phase 1 `POST /rewards/:id/redeem` creates a coupon). This phase adds the read + redeem surface and defines coupon→order-discount application semantics for pay-at-branch. Read `process/context/all-context.md` and `process/context/tests/all-tests.md` first.

Coupon status transitions are server-authoritative: `available → used` (and `available → expired` by TTL). Never trust a client-sent discount.

**Expiry semantics (clarified at VALIDATE, 14-07-26):** `expires_at` TTL expiry is derived at READ/REDEEM time only — this phase never writes `status='expired'` back to the DB row (no cron/background job in scope). `GET /coupons` relabels a still-`available` row as `expired` in the response when `expires_at` is in the past; `POST /coupons/:id/redeem` independently re-checks `expires_at` at redeem time and rejects with 409 if past, regardless of the stored `status` value.

## Phase Completion Rules

This phase is VERIFIED only when: all checklist items checked; the phase validate-contract exists with green gates; regression checks against overlapping earlier phases pass; and the phase report is written. Code-only completion is CODE DONE, never VERIFIED. Mobile-screen behavior with no automated runner is proven by Agent-Probe and recorded as Known-Gap. Post-phase testing uses the Exit Gate test gates (see process/context/tests/all-tests.md).

## Acceptance Criteria

- AC1: GET /coupons lists own coupons with status filter + user isolation (Fully-Automated).
- AC2: POST /coupons/:id/redeem flips available->used; already-used/expired -> 409 (Fully-Automated).
- AC3: coupon from reward redemption appears in list.

## Entry Gate

- Phase 1 exit gate passed (coupons type reconciled to schema; reward-redemption coupon creation exists).
- **Confirmed at VALIDATE (14-07-26): `packages/types/src/coupons.ts` still carries the OLD placeholder shape (`title`/`discountLabel`/`isRedeemed`) as of this pass — Phase 1 has not executed yet.** This is expected (Phase 1 has not started per the umbrella's Current Execution State) and is exactly what this Entry Gate exists to catch. Do NOT begin EXECUTE on this phase until Phase 1's exit gate (type reconciliation to `code`/`status`/`dealId`/`rewardId`/`expiresAt`) is verified green — `coupons.ts`/`coupons.test.ts` in this phase consume the reconciled shape and will not typecheck against the current placeholder shape.

## Blast Radius

- `packages/api/src/routes/coupons.ts` — NEW session-gated route file.
- `packages/api/src/routes/lib/serializers.ts` — add `serializeCoupon`/`ApiCoupon`, **including a read-time join to `deals`/`rewards` to produce the display label field(s) consumed by `CouponCard`** (see Step A0/A1a — added post-PVL to close a gap found by Phase 4's validator).
- `packages/api/src/index.ts` — mount `/coupons` (see mount-path correction below — no `/api` prefix).
- `packages/api/src/routes/__tests__/coupons.test.ts` — NEW automated gate.
- Possibly `packages/api/src/routes/orders.ts` — IF coupon-at-checkout application is in scope (decide in RESEARCH; default: redeem marks used, discount application to an order is a documented follow-up if it widens scope).

**Mount-path correction (applied at VALIDATE, 14-07-26 — was `/api/coupons`, corrected to `/coupons`):** the existing customer-facing session-gated routes (`/branches`, `/deals`, `/orders` in `packages/api/src/index.ts`) are mounted WITHOUT an `/api` prefix; only the role-gated staff/admin surfaces (`/api/staff`, `/api/admin`) use the prefix. Coupons is a customer route (same tier as orders), not a role-gated staff/admin route, so it follows the `/orders`-style convention: mount as `app.use('/coupons', couponsRouter)` alongside the existing `app.use('/orders', ordersRouter)` line — no `/api` prefix. This also corrects the Public Contracts section below.

**Session-gating pattern correction (applied at VALIDATE, 14-07-26):** gate PER-ROUTE with `requireSession` (mirror `orders.ts`: `couponsRouter.get('/', requireSession, ...)`), NOT at router-mount level (`app.use('/coupons', requireSession, couponsRouter)`). The existing customer routers (`ordersRouter`) apply `requireSession` per-route inside the router file; only staff/admin apply the guard once at the `app.use(...)` mount. Follow the `orders.ts` pattern, not the `staff.ts`/`admin` pattern.

## Implementation Checklist

**Cross-phase ownership note (added post-PVL supplement, closing a gap found by Phase 4's validator):** this phase (Phase 2) only produces the coupon display-label DATA at the API boundary (via the `serializeCoupon` join, Step A1a). The `Coupon` type shape carrying that label field (and the 3-state `status: 'available' | 'used' | 'expired'` replacing the old boolean `isRedeemed`) is owned by Phase 1's type reconciliation. The `CouponCard` UI consumption redesign (rendering the new label field, showing a 3-state status badge instead of a boolean) is owned by Phase 4's INNOVATE/EXECUTE. Phase 2 must not attempt to redesign `CouponCard` or `packages/types/src/coupons.ts` — those remain out of this phase's scope.

### Step A — List

- [ ] A0. **RESEARCH note (Phase 2 inner-loop RESEARCH, Step 1):** decide the exact display-label source for `serializeCoupon` by inspecting the `coupons`/`deals`/`rewards` schema for what's joinable — deal name, reward name, or a coupon-specific label. `coupons` has nullable `deal_id`/`reward_id` FKs (confirmed in `packages/api/src/db/schema/coupons.ts`) but no label column of its own, so the label must come from a read-time join to the referenced `deals`/`rewards` row. Do NOT add a migration unless RESEARCH finds the schema genuinely lacks any label source on both `deals` and `rewards` — flag it explicitly in the phase report if so, do not silently add a column.
- [ ] A1a. **`serializeCoupon` MUST produce a display label** — join the referenced deal (via `deal_id`) and/or reward (via `reward_id`) to surface a human-readable name + discount-label string in the `GET /coupons` response, so the coupon wallet (`CouponCard` in `packages/ui`) has something to render (gap found by Phase 4's validator: the current placeholder shape's `title`/`discountLabel` fields have no data source once the type is reconciled — `GET /coupons` otherwise returns only `dealId`/`rewardId`/`status`/`code`/`expiresAt`). This is a read-time join in the serializer, mirroring how `serializeDeal` shapes boundary output in `packages/api/src/routes/lib/serializers.ts`.
- [ ] A1. `GET /coupons` (session-gated via per-route `requireSession`, mirror `orders.ts`) → the caller's coupons, newest-first, serialized. Support optional `?status=available` filter. Derive/relabel expired coupons (past `expires_at`) as `expired` in the response — READ-TIME ONLY, never write `status='expired'` back to the row in this phase (see Expiry semantics note in Overview).
- [ ] A2. Cover list shape + status filter + user-isolation (caller sees only own coupons → empty result for others, not 403 — this is a list-scoping filter, not an ownership-check endpoint) **and the display-label join (A1a)** — assert a seeded coupon with `deal_id` set (or `reward_id` set) returns a non-empty human-readable label field in `coupons.test.ts` (Fully-Automated, mirrors `deals.test.ts`'s serializer assertions).

### Step B — Redeem

- [ ] B1. `POST /coupons/:id/redeem` (session-gated via per-route `requireSession`) → **atomic compare-and-swap UPDATE, mirroring the STAFF-003 order-status-transition pattern in `packages/api/src/routes/staff.ts` (`.update(coupons).set({status:'used', used_at: now}).where(and(eq(coupons.id, id), eq(coupons.user_id, userId), eq(coupons.status, 'available'))).returning()`)** — do NOT use a separate SELECT-then-UPDATE (TOCTOU race window that could let two concurrent redeem calls both pass a status check before either commits). After the CAS update: if 0 rows returned, distinguish the reason with follow-up reads for correct status codes — no such coupon id → 404; coupon exists but `user_id` mismatch → 403; coupon exists, owned, but `status != 'available'` (already used) → 409; coupon exists, owned, `status='available'` but `expires_at` in the past → 409 (checked in the same WHERE via `and(..., or(isNull(coupons.expires_at), gt(coupons.expires_at, now)))`, so an expired coupon never gets swapped even though its stored status is still `available`). Return the updated coupon on success.
- [ ] B2. Decide + document coupon→order linkage for pay-at-branch: either (a) redeem is a standalone status flip surfaced to branch staff, or (b) coupon applies a discount to a specific order at checkout. Default to (a) to avoid widening into the order-discount engine; if (b), scope it explicitly and keep `discount_total` server-computed in cents.
- [ ] B3. Cover redeem success, redeem-already-used → 409, redeem-expired → 409, redeem-not-owner → 403, **and a concurrent-double-redeem regression case** (two redeem calls against the same fixture coupon; assert exactly one succeeds and the other returns 409 — proves the CAS WHERE clause, not just the happy path).
- [ ] B4. **Coupon-from-reward-redemption fixture independence:** implement AC3 ("coupon from reward redemption appears in list") by inserting a coupon row directly in the test fixture with `reward_id` set (hermetic, self-seeding — mirror the pattern in `deals.test.ts`/`require-staff.integration.test.ts`), NOT by calling Phase 1's live `POST /rewards/:id/redeem` endpoint. This keeps `coupons.test.ts` self-contained and independent of Phase 1's execution order at the test level (the Entry Gate above still governs when EXECUTE may start).

## Exit Gate

```bash
docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test
# Expected: coupons.test.ts green; no regressions in rewards/orders/deals suites

pnpm --filter @jojopotato/mobile typecheck
# Expected: exit 0
```

- All checklist items checked; redeem is transactional + idempotent (no double-use), proven by an explicit concurrent-redeem regression test (B3).
- Phase report written to report destination above.

## Blockers That Would Justify BLOCKED Status

- Coupon→order-discount application turns out to be required AND expands into the pricing engine (route to follow-up plan; keep Phase 2 to list+redeem status flip).
- Phase 1 coupon-creation contract not yet available (entry gate not met).

## Phase Loop Progress

- [ ] 1. RESEARCH — research-agent: prior phase reports read; test context loaded; coupon→order semantics decided-input gathered; plan drift checked
- [ ] 2. INNOVATE — innovate-agent: redeem semantics approach decided; Decision Summary written
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: phase plan updated (or "n/a — research clean")
- [ ] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per example-validate-output.md
- [ ] 5. EXECUTE — all checklist items done; per-section test gates green
- [ ] 6. EVL — all EVL gates green; follow-up stubs registered; EVL HANDOFF SUMMARY written
- [ ] 7. UPDATE PROCESS — phase report written, umbrella state updated, commit done

**Validate-contract required before execute.**

## Touchpoints

- `packages/api/src/routes/coupons.ts`, `packages/api/src/routes/lib/serializers.ts`, `packages/api/src/index.ts`
- `packages/api/src/routes/__tests__/coupons.test.ts`
- `packages/types/src/coupons.ts` (consume reconciled shape — do NOT re-edit shape here; see Entry Gate note — not yet reconciled as of this validate pass)

## Public Contracts

- NEW: `GET /coupons`, `POST /coupons/:id/redeem` (session-gated per-route via `requireSession`; no `/api` prefix — corrected at VALIDATE to match the `/orders`/`/deals`/`/branches` convention).
- Order/payment behavior UNCHANGED unless coupon-at-checkout is explicitly scoped in Step B2; `payment_status` stays `unpaid` regardless.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `GET /coupons` returns own coupons, status filter works, other users isolated (`coupons.test.ts`) | Fully-Automated | AC-3 (coupons listable) |
| `POST /coupons/:id/redeem` flips available→used; already-used/expired → 409; not-owner → 403 | Fully-Automated | AC-3 (coupons redeemable) |
| Concurrent double-redeem: exactly one of two simultaneous redeem calls succeeds | Fully-Automated | AC-2 (idempotent, no double-use) |
| Coupon created by reward redemption (Phase 1) appears in list (via direct fixture insert) | Fully-Automated | AC-2/AC-3 |
| `serializeCoupon` returns a display label (deal/reward join) for seeded coupons with `deal_id` or `reward_id` set (`coupons.test.ts`) | Fully-Automated | AC-3 (coupon wallet has renderable label data) |

```bash
pnpm --filter @jojopotato/api test
# Expected: coupons.test.ts green, no regressions
```

## Test Infra Improvement Notes

(none identified yet)

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-02-coupons-backend_PLAN_14-07-26.md`
- Last completed step: not started (validate-contract now written; PVL complete)
- Validate-contract status: written (14-07-26) — Gate: PASS
- Supporting context: `packages/api/src/db/schema/coupons.ts`, Phase 1 report (coupon-creation contract), `deals.test.ts` as supertest pattern, `staff.ts` (compare-and-swap update pattern for B1).
- Next step: Spawn vc-research-agent for RESEARCH (Step 1) — decide coupon redeem semantics (status-flip vs order-discount) per B2; confirm Phase 1 exit gate is green before EXECUTE starts on this phase.

## Validate Contract

Status: PASS
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
- B2's (a)-vs-(b) redeem-semantics decision is deferred to INNOVATE (Phase Loop Step 2) per the plan's own design — this is intentional scope control, not an unresolved validate gap.

Post-PVL supplement note (added by plan-agent, PVL-supplement mode, this pass): Phase 4's validator found that the coupon wallet UI has no display-label data source once the type is reconciled (coupons carry only `dealId`/`rewardId`/`status`/`code`/`expiresAt`, no name/discount-label field). Added Step A0 (RESEARCH note to pick the label source), A1a (serializeCoupon must join deals/rewards to produce the label), extended A2's test coverage, and a cross-phase ownership note clarifying Phase 1 owns the type shape and Phase 4 owns the UI consumption. This is additive scope clarification within the existing blast radius (`serializers.ts`, `coupons.ts`, `coupons.test.ts`) — no new files, no new API surface, no schema change (join only, no migration). Validate-contract gate remains PASS; no FAIL was raised.

What this coverage does NOT prove:
- `pnpm --filter @jojopotato/api test` (coupons.test.ts) proves: list/filter/isolation shape, redeem status transitions incl. 409/403 terminal cases, one concurrent-redeem race case, and reward-linked coupon visibility via a direct fixture. It does NOT prove: coupon behavior under real network latency/retry from the mobile client (no mobile UI in this phase's scope — deferred to Phase 4); a full reward→coupon→redeem round trip through Phase 1's live endpoint end-to-end (B4 deliberately decouples via a fixture, so a genuine Phase-1-to-Phase-2 integration seam is unverified until Phase 4's Agent-Probe walkthrough or a future cross-phase regression check); coupon behavior at scale (many concurrent redeem attempts beyond the single two-caller regression case); or any coupon-to-order discount application (explicitly out of scope per B2's default).
- `pnpm --filter @jojopotato/mobile typecheck` proves: no other mobile consumer is broken by anything in this phase's blast radius (there should be none, since Phase 2 has no mobile touchpoints). It does NOT prove anything about coupon UI, which lands in Phase 4.

Gate: PASS (no FAILs; all CONCERNs fixed directly in plan text this pass — see Dimension findings)
Accepted by: session (autonomous outer-PVL pass, no user gate reached — all CONCERNs were resolved as direct plan-text fixes before the net-gate computation, consistent with V3 Net Gate Rule: "PASS: 0 FAILs, 0 CONCERNs. All plan fixes applied.")
