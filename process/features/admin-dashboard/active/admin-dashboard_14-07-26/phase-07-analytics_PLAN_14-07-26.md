---
name: plan:admin-phase-07-analytics
description: "Admin dashboard Phase 7 — read-only analytics aggregation routes + dashboard screen (ADM-007, #45)"
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: 7
---

# Phase 7 — Analytics Dashboard (ADM-007, #45)

**Date**: 14-07-26
**Complexity**: COMPLEX (last phase of an 8-phase program; flexible depth per instruction)
**Status**: ⏳ PLANNED

## Phase Completion Rules

This phase is CODE DONE only when all `## Implementation Checklist` items are implemented; it is
VERIFIED only when the `## Validate Contract` gates are green (fully-automated tiers passing,
hybrid tiers passing or documented, agent-probe judgments recorded) and the EVL confirmation run
has re-confirmed those gates independently. Code-complete without a green validate-contract must be
reported as `🔨 CODE DONE`, never `✅ VERIFIED`.

---

## Overview

Phase 7 is the LAST and LEAST-PRECEDENTED phase of the admin-dashboard program. It adds one new
read-only route file, `packages/api/src/routes/admin/analytics.ts`, exposing time-range-filterable
aggregation metrics over data produced by Phases 2-6 (branches, products/deals, rewards, orders), plus
one new `apps/admin/src/features/analytics/**` screen to display them.

Metrics in scope (all P2 priority, per umbrella Phase Map):
- Pickup orders per branch (count, over a time range)
- Average order value (AOV)
- Deals-vs-no-deals comparison / lift
- Repeat-purchase rate
- Stars issued (over a time range)
- Rewards redeemed (over a time range)

**No aggregation-query precedent exists anywhere in `packages/api`** — every existing route
(`packages/api/src/routes/orders.ts:77,90,106,232,242,268,278`) does single-row/simple-filter
`db.select().from(...).where(...)` reads, never a `GROUP BY`/aggregate/join-heavy analytics query.
This is the single biggest risk of this phase (see umbrella Phase Map "Biggest risk" column) and is
carried forward into `## Implementation Steps` as an explicitly OPEN INNOVATE decision: whether to
use Drizzle's `sql` template / aggregate helpers (`sql<number>\`count(*)\``, `avg()`, etc.) or hand-
written raw SQL via `db.execute(sql\`...\`)`. **This plan does NOT decide that** — it is deferred to
this phase's own inner-loop INNOVATE step, per the umbrella's HYBRID build strategy (Phases 3-7 are
"reassessed per-domain during their own RESEARCH step").

Because query shapes depend on the real schema/data shapes finalized by Phases 2-6 (which do not yet
exist as executed code at PLAN time), this plan is intentionally kept **HIGH-LEVEL**. The
`## Implementation Steps` section below is an outline, not an EXECUTE-ready checklist.

---

## Cross-Cutting Compliance

1. **Modularity** — one new route file `packages/api/src/routes/admin/analytics.ts`, mounted inside
   the existing `adminRouter` (established in Phase 1, mirroring `staffRouter` at
   `packages/api/src/index.ts:51`) behind `requireAdmin(auth)` — no new mount point, no per-handler
   auth checks. One new `apps/admin/src/features/analytics/**` feature folder (hooks + components),
   following the same feature-folder convention as `features/branches/`, `features/orders/`, etc.
   from earlier phases. Shared money/serializer helpers (`numericToCents`,
   `packages/api/src/routes/lib/serializers.ts:105-107`) are reused, not reimplemented, for any
   currency-shaped metric (AOV, discount lift).

2. **Clarity** — Zod `safeParse` validation for the time-range query params (`from`/`to`/branch
   filter), same pattern as `routes/orders.ts`/`routes/branches.ts`. Response envelope
   `{ resource: { ...metrics } }` (singular — analytics is one aggregate object, not a list),
   consistent with the `{ resource }`/`{ resources }` family used program-wide. Errors mirror
   `OrderError` (`orders.ts:39-47`) via a shared `AdminApiError` (established earlier phases) rather
   than bare `throw new Error(...)`. Naming: kebab-case files, camelCase functions, PascalCase
   components (repo-wide convention).

3. **Safety** — this phase is READ-ONLY: no writes, no deletes, no schema mutation. It cannot
   violate the two program-level hard invariants (order_items snapshot integrity, star_transactions
   retroactivity) because it never writes to any table. The only safety-relevant judgment is
   **metric-definition correctness** (see below) — a wrong AOV or repeat-purchase-rate definition is
   a correctness bug, not a destructive-action risk, but it is treated with equivalent rigor because
   it directly informs business decisions.

4. **Security** — `requireAdmin(auth)` gate inherited automatically via the `adminRouter` mount
   (established Phase 1); no route in this file is reachable by `staff`/`customer` roles. Aggregates
   only — no per-customer row-level data is returned by any metric in scope (all six metrics are
   counts/sums/averages/ratios over anonymized groups: per-branch, per-time-bucket, or program-wide).
   If a future metric needed per-customer detail (e.g. "top customers"), it would need the same PII
   boundary note Phase 6 (orders view) already flagged — **no such metric is in this phase's scope**,
   so no PII exposure risk is introduced here. Flag explicitly: if RESEARCH/INNOVATE discovers a need
   to expose any customer-identifying row, treat it as a scope change requiring the same design note
   pattern as Phase 6, not a silent addition.

5. **UI component modularity & reusability** — `features/analytics/` reuses the P2 `page-header`,
   `query-states`, and (where a shared filter-bar was promoted in P6) the branch/time-range filter
   controls. Analytics-specific UI is limited to genuinely new pieces: stat/metric cards and any chart
   component. If more than one metric needs the same card/chart shape, build it ONCE as a shared
   `metric-card`/`chart` composite in `components/`, not per-metric. Token-driven styling only; charts
   consume the ported Tailwind color tokens rather than a separate palette.

---

## Metric Definitions Requiring Explicit Sign-Off

**These are PROPOSED definitions only.** None of them may be treated as "obviously correct" —
each requires explicit user/acceptance sign-off before EXECUTE, because a wrong definition produces
plausible-looking but incorrect business numbers that nobody would notice from the UI alone.

| Metric | Proposed definition | Open question(s) |
|---|---|---|
| Pickup orders per branch | `COUNT(orders.id)` grouped by `orders.branch_id`, filtered to `orders.placed_at BETWEEN :from AND :to` | Should cancelled orders (`status = 'cancelled'`) be excluded from the count, or counted separately as a cancellation-rate signal? Proposed: exclude cancelled from the headline count, but not decided here. |
| Average order value (AOV) | `AVG(orders.total)` over the same time-range/branch filter | (a) Which statuses count — `completed` only, or all non-cancelled placed orders? (b) Should discounted orders' `total` (post-discount) or `subtotal` (pre-discount) be used? Proposed: `total` (post-discount, what the customer actually paid), status = all non-cancelled. |
| Deals-vs-no-deals comparison/lift | Split orders into `discount_total > 0` (deal-orders) vs `discount_total = 0` (non-deal-orders); compare each group's AOV and order count; "lift" = `(deal-group AOV - non-deal-group AOV) / non-deal-group AOV` | Is `discount_total > 0` a reliable proxy for "used a deal" (vs. e.g. a coupon unrelated to a deal, per the `coupons.ts` schema)? Needs confirmation once Phase 4's coupon/deal linkage is finalized. |
| Repeat-purchase rate | `(COUNT DISTINCT user_id WHERE order-count-in-window >= 2) / COUNT DISTINCT user_id WHERE order-count-in-window >= 1`, computed over the selected time-range window | Should the window be the same `from`/`to` filter as other metrics, or a fixed lookback (e.g. "customers who ordered ≥2 times in the last 90 days" regardless of the displayed range)? Proposed: same `from`/`to` filter as the rest of the dashboard, for consistency — flagged as needing sign-off since a fixed-lookback definition is equally defensible. |
| Stars issued | `SUM(star_transactions.stars) WHERE type = 'earned' AND created_at BETWEEN :from AND :to` | Should `'adjusted'` (manual staff adjustments, if positive) also count toward "issued"? Proposed: `'earned'` only; `'adjusted'` and `'expired'` excluded. |
| Rewards redeemed | `COUNT(star_transactions.id) WHERE type = 'redeemed' AND created_at BETWEEN :from AND :to` (count of redemption events) — alternative: `SUM(ABS(stars))` for total stars spent redeeming | Count of redemption events, or total stars spent? Proposed: count of events as the headline number, with total-stars-spent as a secondary stat if UI space allows. |

**Acceptance criteria below require each of these definitions to be locked (via user sign-off during
this phase's inner-loop RESEARCH/INNOVATE step) before the corresponding fixture-based test is
written.** A metric shipped against an un-signed-off definition is not acceptable, even if the query
runs and returns a plausible number.

---

## Touchpoints

- `packages/api/src/routes/admin/analytics.ts` (new) — aggregation route(s) for the 6 metrics above
- `packages/api/src/routes/admin/index.ts` or equivalent adminRouter mount file (established Phase 1)
  — register the new analytics sub-router
- `packages/api/src/routes/lib/serializers.ts` — reuse `numericToCents`/money helpers for any
  currency-shaped metric (AOV, per-branch totals); do not reimplement
- `apps/admin/src/features/analytics/**` (new) — hooks (`use-analytics.ts` or similar, React Query),
  components (metric cards, time-range picker, per-branch breakdown table/chart)
- `apps/admin/src/routes/` or equivalent TanStack Start route file wiring the analytics screen into
  the dashboard nav (established Phase 0/1 shell)
- Read (no changes): `packages/api/src/db/schema/orders.ts` (`orders.placed_at`, `.status`,
  `.total`, `.discount_total`, `.branch_id`), `packages/api/src/db/schema/order_items.ts`,
  `packages/api/src/db/schema/star_transactions.ts` (`.type`, `.stars`, `.created_at`, `.user_id`),
  `packages/api/src/db/schema/user_stars.ts`, `packages/api/src/db/schema/deals.ts`,
  `packages/api/src/db/schema/coupons.ts` (if deal-linkage needs it), `packages/api/src/db/schema/
  branches.ts`
- Read: `packages/api/src/lib/require-admin.ts` (established Phase 1) — auth guard reused, not
  modified
- Read: `packages/types/src/admin.ts` (established Phase 1) — extend with analytics response types
  if not already covered by a generic shape

---

## Public Contracts

- New route(s) under `/api/admin/analytics/*` (exact sub-paths decided at INNOVATE — e.g. one
  combined `GET /api/admin/analytics?from=&to=&branchId=` returning all 6 metrics in one payload, vs.
  6 separate endpoints — this is an open INNOVATE decision, not locked here).
- Request: query params `from` (ISO date), `to` (ISO date), optional `branchId` (uuid) for
  branch-scoped views. All validated server-side via Zod `safeParse` — missing/invalid params
  rejected with 400, not silently defaulted to "all time" without the client knowing.
- Response envelope: `{ resource: { ordersPerBranch: [...], aov: number, dealsLift: {...},
  repeatPurchaseRate: number, starsIssued: number, rewardsRedeemed: number } }` (exact shape decided
  at INNOVATE/EXECUTE — this is the proposed contour, not final).
- No mutation contract — this phase introduces zero writable endpoints.
- Auth contract: `requireAdmin(auth)` — admin and super_admin only; staff/customer roles get 403 (or
  the equivalent rejection the adminRouter mount already produces for non-admin roles, established
  Phase 1).

---

## Blast Radius

- **Packages touched:** `packages/api` (1 new route file + adminRouter registration), `apps/admin`
  (1 new feature folder: hooks + components + route wiring), `packages/types` (possible extension of
  `admin.ts` for analytics response types).
- **Files (new):** `packages/api/src/routes/admin/analytics.ts`,
  `apps/admin/src/features/analytics/hooks/use-analytics.ts` (or similar),
  `apps/admin/src/features/analytics/components/*` (metric cards, time-range filter, per-branch
  table), 1 new route file wiring the screen into TanStack Start routing.
- **Files (modified):** adminRouter mount file (register new sub-router), possibly
  `packages/types/src/admin.ts` (add analytics response types).
- **Risk class:** READ-ONLY aggregation — no schema/auth/billing/migration surface touched. Low
  Safety risk (no writes possible). Security risk is bounded to the standard `requireAdmin` gate +
  no-PII-in-aggregates rule stated in Cross-Cutting Compliance #4.
- **Dependency on earlier phases:** requires real data shapes from P2 (branches), P3 (products —
  indirectly, via `order_items`/`orders.total`), P4 (deals — via `orders.discount_total`), P5
  (rewards — via `star_transactions`), P6 (orders view — shares the branch/status/date filter
  pattern this phase's query params should mirror for UI consistency). This phase cannot start
  meaningfully until P3-P6 have real, committed schema/route code to query against — per umbrella
  Phase Ordering, P7 depends on P3, P4, P5, P6.

---

## Implementation Checklist (Implementation Steps — FLEXIBLE OUTLINE)

**FLEXIBLE OUTLINE — not an EXECUTE-ready checklist.**

> EXECUTE-level checklist finalized at this phase's inner-loop PLAN-SUPPLEMENT after RESEARCH — kept
> flexible; query shapes depend on data produced by P2-P6.

High-level shape (subject to change at PLAN-SUPPLEMENT):

1. RESEARCH: confirm final schema/columns actually shipped by P2-P6 (branches, products, deals,
   coupons, rewards, orders, order_items, star_transactions, user_stars) — do not assume this plan's
   cited columns are still exactly right; re-verify against the committed code at phase entry.
2. RESEARCH: get explicit sign-off on the 6 metric definitions in the table above (or revised
   definitions if RESEARCH surfaces new evidence — e.g. coupon/deal linkage nuance).
3. INNOVATE (open decision, not decided here): Drizzle `sql` template helpers vs. raw SQL via
   `db.execute(sql\`...\`)` for the aggregation queries; single combined endpoint vs. per-metric
   endpoints; whether time-bucketing (e.g. daily/weekly breakdown) is in scope or only a single
   aggregate over the whole range.
4. Implement `packages/api/src/routes/admin/analytics.ts` per the INNOVATE decision — Zod-validated
   query params, `requireAdmin`-gated, response envelope per Public Contracts.
5. Register the new sub-router on the existing `adminRouter` mount (no new top-level mount).
6. Build seeded-fixture-backed automated tests proving each metric's KNOWN expected value (see
   Acceptance Criteria) — written against the real schema, not mocked.
7. Build `apps/admin/src/features/analytics/**`: React Query hook(s) calling the new endpoint(s),
   time-range picker component, metric-card/table components, wire into dashboard nav.
8. Manual/agent-probe pass: confirm the dashboard screen renders all 6 metrics correctly for a known
   seeded scenario and that changing the time-range filter changes the displayed numbers as expected.

---

## Acceptance Criteria

1. Each of the 6 metrics is computed correctly against a seeded fixture with a KNOWN expected value
   — not merely "returns a number of the right type." Example shape: seed 3 orders for branch A
   (2 completed at $100/$150, 1 cancelled at $200) and assert AOV computes to exactly the value implied
   by the signed-off definition (e.g. `(100+150)/2 = 125` if cancelled orders are excluded and AOV
   uses `total`).
2. Each metric's definition (from the Metric Definitions table) has explicit sign-off recorded
   (in the phase report or a validate-contract note) before its fixture test is treated as
   authoritative — a green test against an un-signed-off definition does not satisfy this criterion.
3. Changing the `from`/`to` time-range query params changes the returned metric values in the
   expected direction for a seeded fixture spanning multiple time buckets (e.g. orders both inside
   and outside the queried range — the metric must exclude the out-of-range orders).
4. Only `admin`/`super_admin` roles can read `/api/admin/analytics*` — a `staff` or `customer` role
   request is rejected (403 or equivalent, matching the existing `adminRouter` rejection behavior
   established Phase 1). Cite `packages/api/src/lib/require-admin.ts` (Phase 1) as the enforcing
   mechanism — no new auth logic is written in this phase.
5. No response payload from any analytics endpoint contains per-customer identifying fields (name,
   email, phone, address) — aggregates only, per Cross-Cutting Compliance #4.
6. The `apps/admin` analytics screen renders all 6 metrics and its time-range filter control actually
   triggers a re-fetch with updated query params (agent-probe verified).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Seeded-fixture test: orders-per-branch count matches known expected value across 2+ branches | Fully-Automated | AC1 |
| Seeded-fixture test: AOV computes to the exact signed-off-definition value for a known order set (incl. cancelled-order exclusion check) | Fully-Automated | AC1, AC2 |
| Seeded-fixture test: deals-vs-no-deals lift computed correctly for a mixed known order set (some `discount_total > 0`, some `= 0`) | Fully-Automated | AC1, AC2 |
| Seeded-fixture test: repeat-purchase rate matches known expected ratio for a seeded customer set (some with 1 order, some with 2+) | Fully-Automated | AC1, AC2 |
| Seeded-fixture test: stars-issued sum matches known expected value, excluding `'adjusted'`/`'expired'` types per signed-off definition | Fully-Automated | AC1, AC2 |
| Seeded-fixture test: rewards-redeemed count matches known expected value for a seeded set of `'redeemed'` star_transactions rows | Fully-Automated | AC1, AC2 |
| Seeded-fixture test: time-range filter change excludes out-of-range orders/transactions from all 6 metrics | Fully-Automated | AC3 |
| Integration test: `staff`/`customer` role request to `/api/admin/analytics*` is rejected | Hybrid (requires seeded non-admin session against running Postgres, mirrors existing `require-staff.integration.test.ts` pattern) | AC4 |
| Manual code-review check: no per-customer identifying field appears in any analytics response shape | Agent-Probe | AC5 |
| Agent-probe walkthrough: analytics screen renders all 6 metrics; changing time-range filter re-fetches with updated params and visibly changes displayed numbers | Agent-Probe | AC6 |
| Metric-definition sign-off record: each of the 6 metrics in the Metric Definitions table has an explicit accept/revise decision on file (phase report or validate-contract note) before its fixture test is authoritative | Agent-Probe (process gate, not a runtime test) | AC2 |

---

## Test Infra Improvement Notes

Testing context: this phase's fully-automated tiers rely on seeded-fixture integration tests against
the running Postgres test DB (mirroring the existing `packages/api` vitest+supertest pattern, e.g.
`require-staff.integration.test.ts`), run via `pnpm --filter @jojopotato/api test` after
`docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate`. No aggregation-query test
pattern exists yet in this repo — the fixture/assertion style for multi-row `GROUP BY`/aggregate
results is new territory for this test suite and should be captured as a reusable pattern once
written, for reuse if the program ever adds more analytics metrics.

(otherwise: none identified yet)

---

## Phase Loop Progress

- [ ] 1. RESEARCH — confirm real P2-P6 schema/columns; get metric-definition sign-off
- [ ] 2. INNOVATE — decide Drizzle-aggregate vs raw-SQL query approach; decide endpoint shape
- [ ] 3. PLAN-SUPPLEMENT — finalize EXECUTE-level checklist based on RESEARCH+INNOVATE findings (or mark "n/a — research clean")
- [ ] 4. PVL — vc-validate-agent writes validate-contract (V1-V7)
- [ ] 5. EXECUTE — implement per finalized checklist
- [ ] 6. EVL — independent gate re-run confirmation
- [ ] 7. UPDATE PROCESS — archive phase, capture learnings, commit

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-07-analytics_PLAN_14-07-26.md`
2. **Last completed phase or step:** none — this plan file has just been written; Phase Loop Progress
   step 1 (RESEARCH) has not yet started. This phase itself cannot meaningfully begin until Phases
   P2-P6 have committed, executed code (see Blast Radius — Dependency on earlier phases).
3. **Validate-contract status:** pending — no validate-contract written yet (placeholder below).
4. **Supporting context files loaded:**
   `process/features/admin-dashboard/active/admin-dashboard_14-07-26/admin-dashboard_UMBRELLA_PLAN_14-07-26.md`,
   `process/context/all-context.md`,
   `packages/api/src/db/schema/{orders,order_items,deals,star_transactions,user_stars,rewards}.ts`,
   `packages/api/src/routes/orders.ts` (Drizzle query-style reference),
   `docs/jojo-potato-mobile-prd.md` (analytics mentions at lines ~105, 658, 746, 1219, 1386, 1567, 1706, 1748).
5. **Next step for a fresh agent picking up mid-execution:** confirm Phases P2-P6 are actually
   committed and merged (check `git log`/`process/features/admin-dashboard/active/`|`completed/` for
   their phase reports and status), then run this phase's Step 1 RESEARCH — re-verify schema/columns
   against the committed reality and secure explicit sign-off on the 6 metric definitions before any
   INNOVATE or EXECUTE work begins.

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
