---
name: plan:admin-phase-07-analytics
description: "Admin dashboard Phase 7 — read-only analytics aggregation route + dashboard screen (ADM-007, #45). Full DRAFT plan pending user review of Open Decisions."
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: 7
---

# Phase 7 — Basic Analytics Dashboard (ADM-007, #45)

**Date**: 14-07-26 (stub) — fleshed out to full DRAFT 17-07-26
**Complexity**: COMPLEX (last phase of the 8-phase program; money-adjacent correctness)
**Status**: ✅ DECISIONS LOCKED (D1–D9 resolved with user 17-07-26, KPI set informed by competitor-dashboard research) — PARKED pending Phase 6 execution; do NOT plan-supplement/validate until P6 is done (D9)

> **TL;DR:** One new read-only route `GET /api/admin/analytics?from=&to=[&branchId=]` returning all
> six #45 metrics in one payload, computed in cents server-side with Drizzle `sql` aggregates; one
> new `apps/admin/src/features/analytics/**` screen of stat tiles + a per-branch table (no chart
> library at MVP); exact-value seeded-fixture tests per AC. Six product decisions are recommended
> below but held open for user sign-off.

## Open Decisions For Review — ✅ RESOLVED (user, 17-07-26)

D1–D7 all ACCEPTED as drafted (verified sound against live schema by RESEARCH). D8 (KPI set)
and D9 (sequencing) added this pass, informed by competitor-dashboard research (Toast/Square/Olo/
loyalty platforms). The two new metrics' full checklist/AC/serializer/touchpoint wiring is folded
in at PLAN-SUPPLEMENT when the phase activates (post-P6) — this pass records the decision only.

| # | Decision | Resolution |
|---|---|---|
| D1 | **"Orders using deals" definition** (post-ADM-004/008 there are 3 possible signals) | An order "uses a deal" iff ANY of: (a) `orders.coupon_id IS NOT NULL` (offer/reward coupon applied), (b) `orders.deal_id IS NOT NULL` (legacy dormant column — near-zero rows, included for correctness), (c) the order has ≥1 `order_items` line whose `products.is_deal = true` (bundle deal). This is a boolean per order, so deal-orders + non-deal-orders is an exact partition and AC3's sum-to-total property holds by construction. |
| D2 | **Order status filter for order-count + AOV** | Exclude `cancelled` and `rejected`; include all other placed statuses (`pending…completed`). Rationale: reflects real demand without waiting for completion; matches "what the customer committed to pay". AC4 repeat-rate numerator uses `completed` only per issue #45 verbatim. |
| D3 | **Timezone for date ranges** | Interpret `from`/`to` as **Asia/Manila calendar dates** (fixed `+08:00`, PH has no DST), converted server-side to UTC timestamp bounds (`from 00:00:00+08` inclusive → `to+1day 00:00:00+08` exclusive) against `orders.placed_at` / `star_transactions.created_at` / `coupons.created_at|used_at`. Rationale: admins think in local business days; a UTC boundary silently shifts late-evening orders into the wrong day. |
| D4 | **"Rewards unlocked" / "rewards redeemed" definitions** | Unlocked = `COUNT(coupons) WHERE reward_id IS NOT NULL AND created_at IN range` (a reward coupon is minted exactly when a reward is unlocked, STAR-003). Redeemed = `COUNT(coupons) WHERE reward_id IS NOT NULL AND used_at IN range`. (Alternative rejected: `star_transactions.type='redeemed'` — that tracks star spends, which STAR-side flows may not 1:1 mirror coupon burns.) |
| D5 | **"Stars earned" definition** | `SUM(star_transactions.stars) WHERE type = 'earned' AND created_at IN range`. `adjusted`/`expired`/`redeemed` excluded from the headline number. |
| D6 | **Chart library** | NONE at MVP. Plain stat tiles (new small `metric-card` composite) + the existing `data-table` composite for the per-branch breakdown. Consistent with issue #45's explicit "basic — no BI tooling". Charts are a possible later enhancement, not in scope. |
| D7 | **Endpoint + query shape** | ✅ ACCEPTED. ONE combined `GET /api/admin/analytics` returning all metrics in a single `{ resource }` payload (one screen = one fetch); Drizzle `sql`-template aggregate helpers (`sql<string>\`sum(...)\``, `count()`) — NOT raw `db.execute` — staying inside the codebase's Drizzle idiom. (First aggregation route in the codebase — extra care at EXECUTE.) |
| D8 | **MVP KPI set** (new — competitor-research-informed) | **✅ LOCKED: keep the original 6 (orders/branch, AOV, deals split, repeat-purchase rate, stars earned, rewards unlocked-vs-redeemed) + ADD 2 zero-migration metrics:** (a) **Top-selling products** — ranked `data-table`, source `order_items.product_id/quantity/total_price` + `products` (the one universally-present competitor widget missing from our set); (b) **New vs. returning customers** — source `orders.user_id` + `users.createdAt`, reuses the repeat-rate user grouping. So **8 metrics total**, rendered as stat cards + two tables (per-branch + top-products). **Fine-tune defaults (flip at PLAN-SUPPLEMENT if wanted):** rewards-redemption metric stays **reward-coupon only** for MVP (offer/promo-coupon redemption deferred to Phase 2); new-vs-returning gets its own stat card. **Deferred to a Phase-2 note (cheap but out of MVP):** order-status funnel (cancel/reject rate), stars breakage (`type='expired'`), offer-coupon redemption rate, peak-hours/day-parts (⚠️ needs hour-bucketing), prep-time (⚠️ needs accepted_at→ready_at duration aggregate). |
| D9 | **Chart vs. cards/tables + sequencing** (new) | **✅ LOCKED: D6's no-chart-library decision re-confirmed by research** — the universal MVP norm is stat cards (headline numbers) + tables (ranked/itemized); charts are a deliberate Phase-2 enhancement once daily-checked numbers are known. **Sequencing: PARKED** — do NOT plan-supplement/validate/execute P7 until **Phase 6 has finished execution** (P5 → P6 → P7 serialized behind the shared aggregator/serializer/nav edits). |

## Phase Completion Rules

This phase is CODE DONE only when all `## Implementation Checklist` items are implemented; it is
VERIFIED only when the `## Validate Contract` gates are green (fully-automated tiers passing,
hybrid tiers passing or documented, agent-probe judgments recorded) and the EVL confirmation run
has re-confirmed those gates independently. Code-complete without a green validate-contract must be
reported as `🔨 CODE DONE`, never `✅ VERIFIED`.

---

## Overview

Phase 7 adds the program's final surface: a read-only analytics endpoint and dashboard screen for
the six #45 metrics — pickup orders per branch, average order value (AOV), deals-vs-no-deals split,
repeat purchase rate, stars earned, rewards unlocked/redeemed — all time-range filterable (last
7/30 days presets client-side; arbitrary `from`/`to` server-side).

Ground truth this draft is written against (verified 17-07-26, branch `feat/deals_unification`):

- **Money is stored as `numeric(10,2)` pesos in Postgres** (`orders.subtotal/discount_total/total`,
  `order_items.unit_price/total_price`). The program-wide API convention converts to **cents at the
  boundary** via `numericToCents` (`routes/lib/serializers.ts`). All analytics aggregates are
  therefore computed as: SQL `SUM(...)` returns a numeric string → converted to cents integer →
  any division (AOV) done in integer cents with `Math.round` — never float peso math.
- **Deal signal is 3-way post-ADM-004/008** (see D1): legacy `orders.deal_id` (dormant),
  `orders.coupon_id` (live — offer + reward coupons), and `is_deal` bundle products via
  `order_items → products` join. There is no single order-level "deal" flag.
- **`star_transactions`** carries `type ∈ {earned, redeemed, adjusted, expired}`, `stars` (int),
  `created_at`. **`coupons`** distinguishes reward coupons (`reward_id IS NOT NULL`) from offer
  coupons (`offer_id IS NOT NULL`), with `created_at` (mint) and `used_at` (burn).
- **No aggregation-query precedent** exists in `packages/api` — this phase establishes it (D7:
  Drizzle `sql` aggregates). This remains the phase's biggest technical risk.
- **No chart library** exists in `apps/admin` (D6: none added).

---

## Metric Definitions (locked to Open Decisions above)

All ranges use the D3 Asia/Manila day-boundary convention. All money values are cents integers in
the response.

| Metric | Definition |
|---|---|
| `ordersPerBranch` | Per branch: `COUNT(orders)` where `placed_at` in range and `status NOT IN ('cancelled','rejected')` (D2). Includes branch id + name (join `branches`). Branches with 0 orders in range appear with count 0 (LEFT JOIN from `branches`). |
| `averageOrderValueCents` | `Math.round(sumTotalCents / orderCount)` over the same filtered set as `ordersPerBranch` (post-discount `orders.total` — what the customer pays). `null` when orderCount = 0 (never divide by zero, never fake a 0 AOV). |
| `dealsSplit` | Partition the same filtered order set by the D1 boolean. Returns `{ withDeals: { count, sumTotalCents }, withoutDeals: { count, sumTotalCents } }`. Invariant (AC3): `withDeals.count + withoutDeals.count === total order count` and the two sums add to the total sum. |
| `repeatPurchaseRate` | `distinct users with ≥2 COMPLETED orders in range ÷ distinct users with ≥1 order (any non-cancelled/rejected status, D2) in range` (issue #45 AC4 verbatim numerator). Returned as `{ numerator, denominator, rate }` with `rate: null` when denominator = 0. |
| `starsEarned` | D5: `SUM(star_transactions.stars) WHERE type='earned' AND created_at IN range`. 0 when no rows. |
| `rewardsUnlocked` / `rewardsRedeemed` | D4: reward-coupon rows (`reward_id IS NOT NULL`) counted by `created_at` (unlocked) / `used_at` (redeemed) in range. |

`branchId` query param (optional) scopes `ordersPerBranch`/`averageOrderValueCents`/`dealsSplit`/
`repeatPurchaseRate` to one branch; `starsEarned`/`rewardsUnlocked`/`rewardsRedeemed` are
program-wide (star/coupon rows carry no branch) and are returned unchanged with a
`branchScoped: false` note in the response shape — the UI labels them "all branches".

---

## Cross-Cutting Compliance

1. **Modularity** — one new route file `packages/api/src/routes/admin/analytics.ts`, appended to
   the existing `adminRouter` aggregator (`routes/admin/index.ts`, append-only per its own doc
   comment — this is the 5th confirmed consumer). One new `apps/admin/src/features/analytics/**`
   feature folder. `numericToCents` reused from `routes/lib/serializers.ts`, never reimplemented.
2. **Clarity** — Zod `safeParse` for `from`/`to`/`branchId` (400 on invalid; `from > to` → 400).
   Response envelope `{ resource: {...} }` (singular). Errors via the shared admin error helpers in
   `routes/admin/lib/errors.ts`.
3. **Safety** — READ-ONLY phase: zero writes, zero schema mutation, zero migrations. The risk is
   metric-definition correctness (business-decision-informing numbers), addressed by exact-value
   fixture tests + the Open Decisions sign-off.
4. **Security** — `requireAdmin(auth)` inherited via the aggregator mount. Aggregates only — no
   per-customer identifying field in any response. If any future metric needs customer rows, that
   is a scope change, not a silent addition.
5. **UI reusability** — reuses `page-header`, `query-states`, `data-table` composites. New shared
   piece: a small `metric-card` stat-tile component (built once, used by all headline metrics).

---

## Touchpoints

- `packages/api/src/routes/admin/analytics.ts` (NEW) — the single combined analytics route
- `packages/api/src/routes/admin/index.ts` (MODIFIED) — append `adminRouter.use('/analytics', analyticsRouter)`
- `packages/api/src/routes/admin/__tests__/admin-analytics.integration.test.ts` (NEW) — seeded exact-value fixture suite
- `packages/types/src/admin.ts` (MODIFIED, additive) — `AdminAnalytics` response type
- `apps/admin/src/features/analytics/lib/admin-analytics-api.ts` (NEW) — fetch wrapper (`credentials:'include'`, mirrors `admin-branches-api.ts`)
- `apps/admin/src/features/analytics/hooks/use-analytics.ts` (NEW) — react-query hook keyed on `['admin','analytics',from,to,branchId]`
- `apps/admin/src/features/analytics/components/{metric-card,time-range-picker,branch-orders-table}.tsx` (NEW)
- `apps/admin/src/routes/(dashboard)/analytics.tsx` (NEW) — TanStack Start route (single screen — no detail child, so no `<Outlet/>` split needed; if a detail view is ever added, apply the layout+index split gotcha from Phase 3)
- `apps/admin/src/config/nav-config.ts` (MODIFIED) — flip the Analytics nav item from `disabled: true` to live (or add it)
- Read-only (no changes): `db/schema/{orders,order_items,products,star_transactions,coupons,branches,users}.ts`, `lib/require-admin.ts`, `routes/lib/serializers.ts`

## Public Contracts

- **NEW** `GET /api/admin/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD[&branchId=uuid]` —
  `requireAdmin`-gated (admin/super_admin only; staff/customer rejected by the inherited guard).
  `from`/`to` required (no silent all-time default), validated `YYYY-MM-DD`, `from <= to`,
  interpreted per D3 (Asia/Manila days). Unknown `branchId` → empty-scoped results (not 404).
- Response (all money in cents integers):

```
{ resource: {
    range: { from, to, timezone: "Asia/Manila" },
    ordersPerBranch: [{ branchId, branchName, orderCount }],
    averageOrderValueCents: number | null,
    orderCount: number,
    dealsSplit: { withDeals: { count, sumTotalCents }, withoutDeals: { count, sumTotalCents } },
    repeatPurchaseRate: { numerator, denominator, rate: number | null },
    starsEarned: number,
    rewardsUnlocked: number,
    rewardsRedeemed: number,
    branchScoped: boolean
} }
```

- No mutation contract. No schema change. Wire-frozen surfaces from earlier phases untouched.

## Blast Radius

- **Packages:** `packages/api` (1 new route + 1-line aggregator append + 1 new test file),
  `apps/admin` (1 new feature folder + 1 new route file + nav-config line), `packages/types`
  (additive type).
- **Risk class:** LOW — read-only aggregation; no schema/auth/billing/migration surface. The
  money-adjacent correctness risk is covered by exact-value Fully-Automated fixture tests (the
  program's Known-Gap ban for money ACs applies here — see Verification Evidence).
- **Dependencies:** P2–P5 schema/data shapes all exist and are committed on
  `feat/deals_unification` (verified 17-07-26) — the stub's "cannot start until P3-P6 land"
  blocker is now cleared, except P5 (Rewards CRUD, ADM-005) and P6 (Orders view, ADM-006) admin
  UIs are not built; this phase only READS the underlying tables, which all exist, so P7 is no
  longer hard-blocked on P5/P6 execution. Note for inner-loop RESEARCH: re-confirm this claim at
  phase entry.

---

## Implementation Checklist

Server (packages/api):

1. Add `AdminAnalytics` (+ sub-shapes) to `packages/types/src/admin.ts` — additive export.
2. Create `packages/api/src/routes/admin/analytics.ts`:
   a. Zod query schema: `from`/`to` as `YYYY-MM-DD` strings (required), optional `branchId` uuid;
      reject `from > to` with 400 via the shared admin error helper.
   b. Range helper: convert `from`/`to` Manila dates to UTC `Date` bounds — `[from 00:00+08:00,
      (to+1d) 00:00+08:00)` half-open interval (D3). Pure function, unit-testable.
   c. Query 1 — orders base set: Drizzle select over `orders` filtered by `placed_at >= lower AND
      placed_at < upper AND status NOT IN ('cancelled','rejected')` (+ optional `branch_id`),
      selecting `id, branch_id, user_id, status, total, coupon_id, deal_id`.
      **Implementation note:** with "basic" scale, fetch the filtered order rows once and compute
      count/sum/AOV/deals-split/repeat-rate groupings in TypeScript from that single result set
      (exact integer-cents math via `numericToCents` per row) — one indexed query, zero float SQL,
      trivially fixture-testable. Switch to SQL `GROUP BY` only if row volume ever makes this a
      problem (noted in Test Infra Improvement Notes; no index changes needed — `orders_branch_status_idx` exists).
   d. Query 2 — deal-bundle order ids: `SELECT DISTINCT order_items.order_id FROM order_items JOIN
      products ON products.id = order_items.product_id WHERE products.is_deal = true AND
      order_items.order_id IN (base set ids)` — used for D1 signal (c).
   e. Query 3 — `ordersPerBranch` branch names: `LEFT JOIN` from `branches` (or fetch branches list
      and merge in TS) so zero-order branches appear with 0. When `branchId` given, restrict to it.
   f. Query 4 — stars earned: `SUM(stars)` where `type='earned'` and `created_at` in range.
   g. Query 5 — rewards unlocked/redeemed: two counts over `coupons` with `reward_id IS NOT NULL`,
      by `created_at` / `used_at` in range.
   h. Assemble response per Public Contracts; AOV = `Math.round(sumTotalCents / count)`, `null` on
      zero count; repeat rate per definition table (`completed` numerator, D2 denominator).
3. Append `adminRouter.use('/analytics', analyticsRouter)` to `routes/admin/index.ts` (append-only).
4. Write `admin-analytics.integration.test.ts` (hermetic self-seeding, mirroring
   `require-admin.integration.test.ts` / `admin-deals.integration.test.ts` patterns) — cases in
   Verification Evidence. Includes the Manila-boundary edge fixture (an order at 23:30 Manila on
   the range's last day = 15:30 UTC must be INCLUDED; 00:30 Manila the next day excluded).

Client (apps/admin):

5. `admin-analytics-api.ts` fetch wrapper + `use-analytics.ts` react-query hook (query key includes
   the full param tuple so a range change re-fetches — AC5's UI half).
6. `time-range-picker.tsx`: "Last 7 days" / "Last 30 days" presets (computed in Manila local dates)
   + custom from/to date inputs. Presets are pure date math — unit-testable.
7. `metric-card.tsx` stat tile (label, value, sub-label) — shared composite for AOV, repeat rate,
   stars, rewards, deals split; `branch-orders-table.tsx` on the existing `data-table` composite.
8. `(dashboard)/analytics.tsx` route composing `page-header` + picker + cards + table +
   `query-states` for loading/error/empty; register/enable the nav item in `nav-config.ts`.
9. Component tests (vitest + @testing-library/react): picker preset math; screen renders all six
   metrics from a mocked payload; changing the range updates the hook params (mock-level assert).
10. `pnpm --filter @jojopotato/admin typecheck` + `build` clean; api typecheck clean. (Test-suite
    runs deferred per the concurrent-workflow DB lock — see Verification Evidence note.)

---

## Acceptance Criteria

1. **(#45 AC1)** `ordersPerBranch` matches hand-computed counts for a seeded multi-branch fixture
   over a known range, excluding cancelled/rejected per D2.
2. **(#45 AC2)** `averageOrderValueCents` equals a hand-computed exact cents value for a seeded
   fixture (regression-style — including a cancelled order that must NOT move the number, and a
   discounted order proving post-discount `total` is used).
3. **(#45 AC3)** `dealsSplit.withDeals.count + withoutDeals.count === orderCount` AND the two
   `sumTotalCents` add to the fixture's total — with the fixture containing all three D1 signal
   kinds (coupon order, legacy deal_id order, is_deal bundle order) plus plain orders, and an order
   carrying BOTH a coupon and a bundle line counted exactly once.
4. **(#45 AC4)** `repeatPurchaseRate` matches a hand-computed fixture: users with 2+ completed
   orders ÷ users with ≥1 (non-cancelled/rejected) order, incl. a user whose 2 orders are only
   `pending` (in denominator, not numerator).
5. **(#45 AC5)** Changing `from`/`to` recalculates ALL metrics: a fixture spanning two ranges
   proves every one of the six metrics changes between range A and range B, including the D3
   Manila-boundary edge case.
6. `starsEarned` / `rewardsUnlocked` / `rewardsRedeemed` match hand-computed fixtures per D4/D5
   (earned-only stars; reward-coupon mint vs burn counting; offer coupons excluded).
7. Non-admin roles (staff/customer) are rejected on `/api/admin/analytics` (inherited guard —
   regression assert, no new auth logic).
8. Invalid params rejected with 400: missing `from`/`to`, malformed date, `from > to`.
9. The analytics screen renders all six metrics and the range picker triggers a re-fetch with
   updated params (component test for wiring + user Agent-Probe walkthrough for visuals).
10. No per-customer identifying field in any response payload (code-review check).

---

## Verification Evidence

> Note: per this session's constraint, no test suite or DB command is run at PLAN time (a
> concurrent workflow owns the test DB). All Fully-Automated gates below run at EXECUTE/EVL via
> `pnpm --filter @jojopotato/api test` (needs migrated Postgres) and
> `pnpm --filter @jojopotato/admin test`.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Seeded fixture: orders-per-branch counts exact across 2+ branches, cancelled/rejected excluded, zero-order branch shows 0 | Fully-Automated (api vitest) | AC1 |
| Seeded fixture: AOV exact cents value; cancelled order and discount handling proven | Fully-Automated (api vitest) | AC2 |
| Seeded fixture: deals split partition sums to total across all 3 D1 signals; double-signal order counted once | Fully-Automated (api vitest) | AC3 |
| Seeded fixture: repeat purchase rate exact ratio incl. pending-only user edge | Fully-Automated (api vitest) | AC4 |
| Seeded fixture: two-range recalculation of all 6 metrics + Manila 23:30/00:30 boundary edge | Fully-Automated (api vitest) | AC5 |
| Seeded fixture: starsEarned (earned-only), rewardsUnlocked (mint), rewardsRedeemed (burn), offer-coupon exclusion | Fully-Automated (api vitest) | AC6 |
| Integration: staff/customer request → rejected by inherited requireAdmin | Fully-Automated (api vitest, existing hermetic session pattern) | AC7 |
| Integration: 400s for missing/malformed/inverted range params | Fully-Automated (api vitest) | AC8 |
| Component tests: screen renders 6 metrics from mocked payload; picker preset math; range change updates query params | Fully-Automated (admin vitest/jsdom) | AC9 (wiring half) |
| User walkthrough: analytics screen visual render + live range-change behavior against dev DB | Agent-Probe (user-run, per repo convention) | AC9 (visual half) |
| Code-review scan: response shapes contain no customer-identifying field | Agent-Probe | AC10 |

Money-adjacent gates (AC2, AC3, AC6) are HARD: Known-Gap is banned for them per the program
charter — each must be a real passing Fully-Automated test before this phase can be VERIFIED.

---

## Test Infra Improvement Notes

- First aggregation-metric fixture pattern in the api suite — capture the seeded
  multi-branch/multi-user/multi-range fixture builder as a reusable helper if more metrics are
  ever added.
- If order volume ever makes the fetch-rows-compute-in-TS approach (checklist 2c) slow, the
  follow-up is SQL `GROUP BY` + possibly a partial index on `orders.placed_at` — deferred as
  premature at MVP (no materialized views, per issue #45 "basic").

---

## Phase Loop Progress

- [x] 1. RESEARCH — schema/columns re-verified against `feat/deals_unification` ground truth
      17-07-26 (this draft pass); metric-definition sign-off PENDING via `## Open Decisions For
      Review`
- [ ] 2. INNOVATE — largely pre-resolved by D6/D7 recommendations; confirm or override at review
- [ ] 3. PLAN-SUPPLEMENT — apply user's Open-Decision overrides (or mark "n/a — decisions accepted")
- [ ] 4. PVL — vc-validate-agent writes validate-contract (V1-V7)
- [ ] 5. EXECUTE — implement per checklist
- [ ] 6. EVL — independent gate re-run confirmation
- [ ] 7. UPDATE PROCESS — archive phase, capture learnings, commit

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-07-analytics_PLAN_14-07-26.md`
2. **Last completed phase or step:** DRAFT fleshed out 17-07-26 from the 14-07-26 stub against live
   schema ground truth (branch `feat/deals_unification`). Awaiting user review of
   `## Open Decisions For Review` (D1–D7). No code written.
3. **Validate-contract status:** pending — placeholder below. PVL must not run until the Open
   Decisions are accepted or overridden.
4. **Supporting context files loaded:** umbrella plan (`admin-dashboard_UMBRELLA_PLAN_14-07-26.md`,
   Current Execution State + composite rules), `process/context/all-context.md`,
   `process/context/tests/all-tests.md`,
   `packages/api/src/db/schema/{orders,order_items,star_transactions,coupons,rewards,products}.ts`,
   `packages/api/src/routes/admin/index.ts`, `apps/admin/src/{features,components}` listing.
5. **Next step for a fresh agent picking up:** present D1–D7 to the user; on acceptance run
   PLAN-SUPPLEMENT (usually "n/a — decisions accepted") then PVL. On any override, update the
   Metric Definitions table + checklist + ACs to match before PVL. Note the umbrella's Current
   Execution State says Phase 5 (ADM-005) is nominally next — sequencing this phase ahead of P5/P6
   is itself subject to user confirmation, though no hard code dependency blocks it (see Blast
   Radius — Dependencies).

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
