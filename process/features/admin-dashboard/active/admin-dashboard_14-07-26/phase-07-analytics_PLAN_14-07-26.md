---
name: plan:admin-phase-07-analytics
description: "Admin dashboard Phase 7 — read-only analytics aggregation route + dashboard screen (ADM-007, #45). Decisions locked, unparked, PLAN-SUPPLEMENT applied 17-07-26, ready for PVL."
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: 7
---

# Phase 7 — Basic Analytics Dashboard (ADM-007, #45)

**Date**: 14-07-26 (stub) — fleshed out to full DRAFT 17-07-26 — PLAN-SUPPLEMENT (ground-truth
re-confirm + D8 wiring) applied 17-07-26 — EXECUTE + EVL complete 17-07-26
**Complexity**: COMPLEX (last phase of the 8-phase program; money-adjacent correctness)
**Status**: ✅ VERIFIED (17-07-26) — EVL-green, EVL independently re-confirmed 493/493 api +
72/72 admin, both typechecks/build/format clean. Gate was CONDITIONAL at PVL (0 FAILs, 5
CONCERNs, all resolved via Execute-Agent Instructions E1-E5 during EXECUTE, no plan-scope change,
no Known-Gap rows) — this acceptance is recorded here for the audit trail. **This is the FINAL
phase of the 8-phase admin-dashboard program — the program's scoped Definition of Done is now
met.** See `phase-07-analytics_REPORT_17-07-26.md` for the full closeout report.

> **TL;DR:** One new read-only route `GET /api/admin/analytics?from=&to=[&branchId=]` returning all
> **eight** #45 metrics in one payload, computed in cents server-side with Drizzle `sql` aggregates
> and `count()`/`.groupBy()` (an idiom already proven in-repo via `admin/deals.ts`); one new
> `apps/admin/src/features/analytics/**` screen of stat tiles + two tables (per-branch, top-products)
> (no chart library at MVP); exact-value seeded-fixture tests per AC. Ready for PVL.

## Open Decisions For Review — ✅ RESOLVED (user, 17-07-26)

D1–D7 all ACCEPTED as drafted (verified sound against live schema by RESEARCH). D8 (KPI set) and D9
(sequencing) added this pass, informed by competitor-dashboard research (Toast/Square/Olo/loyalty
platforms). The two new D8 metrics' full checklist/AC/serializer/touchpoint wiring is now folded
into this plan (see below) — the inner-loop RESEARCH re-confirm pass (17-07-26) found P7's
underlying source columns present and unchanged, so this PLAN-SUPPLEMENT completes the wiring
rather than deferring it.

| # | Decision | Resolution |
|---|---|---|
| D1 | **"Orders using deals" definition** (post-ADM-004/008 there are 3 possible signals) | An order "uses a deal" iff ANY of: (a) `orders.coupon_id IS NOT NULL` (offer/reward coupon applied), (b) `orders.deal_id IS NOT NULL` (legacy dormant column — near-zero rows, included for correctness), (c) the order has ≥1 `order_items` line whose `products.is_deal = true` (bundle deal). This is a boolean per order, so deal-orders + non-deal-orders is an exact partition and AC3's sum-to-total property holds by construction. |
| D2 | **Order status filter for order-count + AOV** | Exclude `cancelled` and `rejected`; include all other placed statuses (`pending…completed`). Rationale: reflects real demand without waiting for completion; matches "what the customer committed to pay". AC4 repeat-rate numerator uses `completed` only per issue #45 verbatim. |
| D3 | **Timezone for date ranges** | Interpret `from`/`to` as **Asia/Manila calendar dates** (fixed `+08:00`, PH has no DST), converted server-side to UTC timestamp bounds (`from 00:00:00+08` inclusive → `to+1day 00:00:00+08` exclusive) against `orders.placed_at` / `star_transactions.created_at` / `coupons.created_at|used_at`. Rationale: admins think in local business days; a UTC boundary silently shifts late-evening orders into the wrong day. |
| D4 | **"Rewards unlocked" / "rewards redeemed" definitions** | Unlocked = `COUNT(coupons) WHERE reward_id IS NOT NULL AND created_at IN range` (a reward coupon is minted exactly when a reward is unlocked, STAR-003). Redeemed = `COUNT(coupons) WHERE reward_id IS NOT NULL AND used_at IN range`. (Alternative rejected: `star_transactions.type='redeemed'` — that tracks star spends, which STAR-side flows may not 1:1 mirror coupon burns.) **Extra confidence (found during PLAN-SUPPLEMENT research, 17-07-26):** migration `0015` added a DB `CHECK` constraint `coupons_reward_offer_mutex` (`reward_id IS NULL OR offer_id IS NULL`), so the reward-vs-offer coupon split this metric relies on is now DB-ENFORCED, not just app-layer convention — reward-coupon counting cannot double-count an offer coupon by construction. |
| D5 | **"Stars earned" definition** | `SUM(star_transactions.stars) WHERE type = 'earned' AND created_at IN range`. `adjusted`/`expired`/`redeemed` excluded from the headline number. |
| D6 | **Chart library** | NONE at MVP. Plain stat tiles (new small `metric-card` composite) + the existing `data-table` composite for the per-branch and top-products breakdowns. Consistent with issue #45's explicit "basic — no BI tooling". Charts are a possible later enhancement, not in scope. |
| D7 | **Endpoint + query shape** | ✅ ACCEPTED. ONE combined `GET /api/admin/analytics` returning all metrics in a single `{ resource }` payload (one screen = one fetch); Drizzle `sql`-template aggregate helpers (`sql<string>\`sum(...)\``, `count()`) — NOT raw `db.execute` — staying inside the codebase's Drizzle idiom. The `count()`/`.groupBy()` idiom is already proven in-repo (`packages/api/src/routes/admin/deals.ts:203,219,229`, `orders.ts:310,321`); this phase's genuinely new surface is `sum()` + date-range + multi-table aggregation, not aggregation itself — extra care at EXECUTE stays warranted for the money-adjacent `sum()` paths. |
| D8 | **MVP KPI set** (competitor-research-informed) | **✅ LOCKED, NOW FULLY WIRED (this PLAN-SUPPLEMENT):** keep the original 6 (orders/branch, AOV, deals split, repeat-purchase rate, stars earned, rewards unlocked-vs-redeemed) + ADD 2 zero-migration metrics: (a) **Top-selling products** — ranked `data-table`, source `order_items.product_id/quantity/total_price` + `products` (confirmed present, `products.ts` + `order_items.ts`); (b) **New vs. returning customers** — source `orders.user_id` + `users.created_at` (confirmed at `users.ts:40`), reuses the repeat-rate user grouping. **8 metrics total**, rendered as stat cards + two tables (per-branch + top-products). Fine-tune defaults: rewards-redemption metric stays **reward-coupon only** for MVP (offer/promo-coupon redemption deferred to Phase 2 — see D4's DB-CHECK note, this split is now DB-enforced); new-vs-returning gets its own stat card. **Deferred to a Phase-2 note (cheap but out of MVP):** order-status funnel (cancel/reject rate), stars breakage (`type='expired'`), offer-coupon redemption rate, peak-hours/day-parts (⚠️ needs hour-bucketing), prep-time (⚠️ needs accepted_at→ready_at duration aggregate). |
| D9 | **Chart vs. cards/tables + sequencing** | **✅ LOCKED and SATISFIED:** D6's no-chart-library decision re-confirmed by research — the universal MVP norm is stat cards (headline numbers) + tables (ranked/itemized); charts are a deliberate Phase-2 enhancement once daily-checked numbers are known. **Sequencing park condition (Phase 6 execution) is now SATISFIED** — Phase 6 (ADM-006, Orders view) is ✅ VERIFIED, commit `7bb0918`, on branch `feat/adm-006-branchview` (PR to `development` in flight). This phase is UNPARKED and ready for PVL. |

## Phase Completion Rules

This phase is CODE DONE only when all `## Implementation Checklist` items are implemented; it is
VERIFIED only when the `## Validate Contract` gates are green (fully-automated tiers passing,
hybrid tiers passing or documented, agent-probe judgments recorded) and the EVL confirmation run
has re-confirmed those gates independently. Code-complete without a green validate-contract must be
reported as `🔨 CODE DONE`, never `✅ VERIFIED`.

---

## Overview

Phase 7 adds the program's final surface: a read-only analytics endpoint and dashboard screen for
the eight #45-and-D8 metrics — pickup orders per branch, average order value (AOV), deals-vs-no-deals
split, repeat purchase rate, stars earned, rewards unlocked/redeemed, top-selling products, and
new-vs-returning customers — all time-range filterable (last 7/30 days presets client-side;
arbitrary `from`/`to` server-side).

Ground truth this draft is written against (verified 17-07-26 initially, RE-CONFIRMED 17-07-26 via
PLAN-SUPPLEMENT inner-loop RESEARCH pass against the merged `development` tree, post-P5/P6):

- **Money is stored as `numeric(10,2)` pesos in Postgres** (`orders.subtotal/discount_total/total`,
  `order_items.unit_price/total_price`). The program-wide API convention converts to **cents at the
  boundary** via `numericToCents` (`routes/lib/serializers.ts:259`). All analytics aggregates are
  therefore computed as: SQL `SUM(...)` returns a numeric string → converted to cents integer →
  any division (AOV) done in integer cents with `Math.round` — never float peso math.
- **Deal signal is 3-way post-ADM-004/008** (see D1): legacy `orders.deal_id` (dormant),
  `orders.coupon_id` (live — offer + reward coupons), and `is_deal` bundle products via
  `order_items → products` join. There is no single order-level "deal" flag.
- **`star_transactions`** carries `type ∈ {earned, redeemed, adjusted, expired}`, `stars` (int),
  `created_at` (no branch column). **`coupons`** distinguishes reward coupons (`reward_id IS NOT
  NULL`) from offer coupons (`offer_id IS NOT NULL`), with `created_at` (mint) and `used_at` (burn),
  and now (migration `0015`) a DB `CHECK` enforcing `reward_id`/`offer_id` mutual exclusivity.
- **Aggregation idiom already proven in-repo** — `admin/deals.ts` already uses Drizzle
  `count()`/`.groupBy()` and `orders.ts` uses `count()`; this phase's genuinely new surface is
  `sum()` + date-range + multi-table aggregation, not the `count()`/`groupBy()` idiom itself (D7).
- **No chart library** exists in `apps/admin` (D6: none added).
- `orders.created_at`/`users.created_at` (`users.ts:40`) confirmed present for D8's
  new-vs-returning metric; `order_items`/`products` confirmed present for D8's top-selling-products
  metric. `orders_branch_status_idx` confirmed present (`orders.ts:56`).

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
| `rewardsUnlocked` / `rewardsRedeemed` | D4: reward-coupon rows (`reward_id IS NOT NULL`) counted by `created_at` (unlocked) / `used_at` (redeemed) in range. DB-enforced mutual exclusivity with offer coupons (migration `0015`). |
| `topSellingProducts` | D8(a): from the same filtered order set (D2 status filter, range, optional `branchId`), join `order_items → products`, `GROUP BY product_id`, `SUM(quantity)` and `SUM(total_price)` (converted to cents), ordered by `SUM(quantity) DESC`, top 10. Returns `[{ productId, productName, quantitySold, revenueCents }]`. |
| `newVsReturning` | D8(b): among distinct users with ≥1 order in range (same D2-filtered set), a user is "new" iff their EARLIEST order across all time (not just this range) falls inside the range (i.e. `users.created_at` in range is NOT the signal — first-order-in-range-vs-ever is); "returning" otherwise. Returns `{ newCount, returningCount }`. |

`branchId` query param (optional) scopes `ordersPerBranch`/`averageOrderValueCents`/`dealsSplit`/
`repeatPurchaseRate`/`topSellingProducts`/`newVsReturning` to one branch; `starsEarned`/
`rewardsUnlocked`/`rewardsRedeemed` are program-wide (star/coupon rows carry no branch) and are
returned unchanged with a `branchScoped: false` note in the response shape — the UI labels them
"all branches".

---

## Cross-Cutting Compliance

1. **Modularity** — one new route file `packages/api/src/routes/admin/analytics.ts`, appended to
   the existing `adminRouter` aggregator (`routes/admin/index.ts`, append-only per its own doc
   comment). Current mount order (re-confirmed 17-07-26): users, branches, categories, products,
   deals, promotions, offers, coupons, rewards, orders — **analytics is the 11th confirmed
   consumer**. One new `apps/admin/src/features/analytics/**` feature folder. `numericToCents`
   reused from `routes/lib/serializers.ts`, never reimplemented.
2. **Clarity** — Zod `safeParse` for `from`/`to`/`branchId` (400 on invalid; `from > to` → 400).
   Response envelope `{ resource: {...} }` (singular). Errors via the shared admin error helpers in
   `routes/admin/lib/errors.ts`.
3. **Safety** — READ-ONLY phase: zero writes, zero schema mutation, zero migrations. The risk is
   metric-definition correctness (business-decision-informing numbers), addressed by exact-value
   fixture tests + the Open Decisions sign-off.
4. **Security** — `requireAdmin(auth)` inherited via the aggregator mount. Aggregates only — no
   per-customer identifying field in any response (including `topSellingProducts`/`newVsReturning`,
   both of which are aggregate counts/sums, never per-user rows). If any future metric needs
   customer rows, that is a scope change, not a silent addition.
5. **UI reusability** — reuses `page-header`, `query-states`, `data-table` composites. New shared
   piece: a small `metric-card` stat-tile component (built once, used by all headline metrics incl.
   new-vs-returning); `topSellingProducts` reuses `data-table` exactly like the per-branch table.

---

## Touchpoints

- `packages/api/src/routes/admin/analytics.ts` (NEW) — the single combined analytics route
- `packages/api/src/routes/admin/index.ts` (MODIFIED) — append `adminRouter.use('/analytics', analyticsRouter)`
- `packages/api/src/routes/admin/__tests__/admin-analytics.integration.test.ts` (NEW) — seeded exact-value fixture suite (all 8 metrics)
- `packages/types/src/admin.ts` (MODIFIED, additive) — `AdminAnalytics` response type incl. `topSellingProducts`/`newVsReturning` sub-shapes
- `apps/admin/src/features/analytics/lib/admin-analytics-api.ts` (NEW) — fetch wrapper (`credentials:'include'`, mirrors `admin-branches-api.ts`)
- `apps/admin/src/features/analytics/hooks/use-analytics.ts` (NEW) — react-query hook keyed on `['admin','analytics',from,to,branchId]`
- `apps/admin/src/features/analytics/components/{metric-card,time-range-picker,branch-orders-table,top-products-table}.tsx` (NEW) — `top-products-table.tsx` is new this pass, mirrors `branch-orders-table.tsx` on the `data-table` composite
- `apps/admin/src/routes/(dashboard)/analytics.tsx` (NEW) — TanStack Start route (single screen — no detail child, so no `<Outlet/>` split needed; if a detail view is ever added, apply the layout+index split gotcha from Phase 3)
- `apps/admin/src/config/nav-config.ts` (MODIFIED) — **CREATE a new Analytics `NavItem`** (Management group, `to: '/analytics'`) — confirmed via research that no disabled placeholder for Analytics exists in `nav-config.ts` today; this is a net-new entry, not a flip.
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
    topSellingProducts: [{ productId, productName, quantitySold, revenueCents }],
    newVsReturning: { newCount, returningCount },
    branchScoped: boolean
} }
```

- No mutation contract. No schema change. Wire-frozen surfaces from earlier phases untouched.

## Blast Radius

- **Packages:** `packages/api` (1 new route + 1-line aggregator append + 1 new test file),
  `apps/admin` (1 new feature folder incl. `top-products-table.tsx` + 1 new route file + 1 new
  nav-config entry), `packages/types` (additive type incl. `topSellingProducts`/`newVsReturning`).
- **Risk class:** LOW — read-only aggregation; no schema/auth/billing/migration surface. The
  money-adjacent correctness risk is covered by exact-value Fully-Automated fixture tests (the
  program's Known-Gap ban for money ACs applies here — see Verification Evidence).
- **Dependencies:** P2–P6 schema/data shapes all exist and are committed (P6 ✅ VERIFIED, commit
  `7bb0918`) — the D9 park condition is satisfied. No remaining hard code dependency; this phase
  only READS existing tables.

---

## Implementation Checklist

Server (packages/api):

1. Add `AdminAnalytics` (+ sub-shapes, incl. `AdminTopSellingProduct`, `AdminNewVsReturning`) to
   `packages/types/src/admin.ts` — additive export.
2. Create `packages/api/src/routes/admin/analytics.ts`:
   a. Zod query schema: `from`/`to` as `YYYY-MM-DD` strings (required), optional `branchId` uuid;
      reject `from > to` with 400 via the shared admin error helper.
   b. Range helper: convert `from`/`to` Manila dates to UTC `Date` bounds — `[from 00:00+08:00,
      (to+1d) 00:00+08:00)` half-open interval (D3). Pure function, unit-testable.
   c. Query 1 — orders base set: Drizzle select over `orders` filtered by `placed_at >= lower AND
      placed_at < upper AND status NOT IN ('cancelled','rejected')` (+ optional `branch_id`),
      selecting `id, branch_id, user_id, status, total, coupon_id, deal_id`.
      **Implementation note:** with "basic" scale, fetch the filtered order rows once and compute
      count/sum/AOV/deals-split/repeat-rate/new-vs-returning groupings in TypeScript from that
      single result set (exact integer-cents math via `numericToCents` per row) — one indexed
      query, zero float SQL, trivially fixture-testable. Switch to SQL `GROUP BY` only if row
      volume ever makes this a problem (noted in Test Infra Improvement Notes; no index changes
      needed — `orders_branch_status_idx` exists).
   d. Query 2 — deal-bundle order ids: `SELECT DISTINCT order_items.order_id FROM order_items JOIN
      products ON products.id = order_items.product_id WHERE products.is_deal = true AND
      order_items.order_id IN (base set ids)` — used for D1 signal (c).
   e. Query 3 — `ordersPerBranch` branch names: `LEFT JOIN` from `branches` (or fetch branches list
      and merge in TS) so zero-order branches appear with 0. When `branchId` given, restrict to it.
   f. Query 4 — stars earned: `SUM(stars)` where `type='earned'` and `created_at` in range.
   g. Query 5 — rewards unlocked/redeemed: two counts over `coupons` with `reward_id IS NOT NULL`,
      by `created_at` / `used_at` in range.
   h. Query 6 (NEW, D8a) — top-selling products: `order_items JOIN products` over the base order-id
      set, `GROUP BY product_id, product_name`, `SUM(quantity)`, `SUM(total_price)` (→ cents),
      `ORDER BY SUM(quantity) DESC LIMIT 10`. Use Drizzle `count()`/`.groupBy()` idiom (proven
      pattern, see D7 note).
   i. Query 7 (NEW, D8b) — new vs. returning: for each distinct `user_id` in the base order set,
      determine whether their globally-earliest order (`MIN(placed_at)` across ALL orders, not just
      this range) falls inside `[lower, upper)`; count new vs. returning. Implementable as one
      extra query: `SELECT user_id, MIN(placed_at) FROM orders WHERE user_id IN (base set user ids)
      GROUP BY user_id`, then classify in TS against the range bounds.
      **[E1, see Validate Contract]** apply the SAME D2 status filter (`status NOT IN
      ('cancelled','rejected')`) to this global `MIN(placed_at)` lookup — do not compute the
      "earliest order ever" from cancelled/rejected rows, since the base order set itself excludes
      them (consistency, not a new decision — D2 already governs this).
   j. Assemble response per Public Contracts; AOV = `Math.round(sumTotalCents / count)`, `null` on
      zero count; repeat rate per definition table (`completed` numerator, D2 denominator).
      **[E2, see Validate Contract]** compute the D1 "has a deal" signal as one explicit per-order
      boolean (`hasDeal = coupon_id != null || deal_id != null || orderId ∈ bundleOrderIds`) so an
      order matching more than one D1 signal is counted exactly once (AC3's double-signal case).
3. Append `adminRouter.use('/analytics', analyticsRouter)` to `routes/admin/index.ts` (append-only).
4. Write `admin-analytics.integration.test.ts` (hermetic self-seeding, mirroring
   `require-admin.integration.test.ts` / `admin-deals.integration.test.ts` patterns) — cases in
   Verification Evidence, covering all 8 metrics. Includes the Manila-boundary edge fixture (an
   order at 23:30 Manila on the range's last day = 15:30 UTC must be INCLUDED; 00:30 Manila the next
   day excluded). **[E3, see Validate Contract]** also add a direct unit test for the pure
   Manila-boundary range-helper function (checklist 2b) in isolation, in addition to the
   integration-level AC5 fixture that exercises it end-to-end.

Client (apps/admin):

5. `admin-analytics-api.ts` fetch wrapper + `use-analytics.ts` react-query hook (query key includes
   the full param tuple so a range change re-fetches — AC5's UI half). **[E4, see Validate
   Contract]** normalize `branchId` to a stable placeholder value (e.g. `'all'`) when unset inside
   the query key tuple, so the "all branches" view and a specific branch view are distinct cache
   entries.
6. `time-range-picker.tsx`: "Last 7 days" / "Last 30 days" presets (computed in Manila local dates)
   + custom from/to date inputs. Presets are pure date math — unit-testable.
7. `metric-card.tsx` stat tile (label, value, sub-label) — shared composite for AOV, repeat rate,
   stars, rewards, new-vs-returning; `branch-orders-table.tsx` and `top-products-table.tsx` on the
   existing `data-table` composite.
8. `(dashboard)/analytics.tsx` route composing `page-header` + picker + cards + both tables +
   `query-states` for loading/error/empty; **create** the new Analytics `NavItem` in
   `nav-config.ts` (Management group, `to: '/analytics'`, no `disabled` flag — no placeholder
   entry existed to flip).
9. Component tests (vitest + @testing-library/react): picker preset math; screen renders all eight
   metrics from a mocked payload (incl. top-products table rows and new-vs-returning card);
   changing the range updates the hook params (mock-level assert).
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
   proves every one of the eight metrics changes between range A and range B, including the D3
   Manila-boundary edge case.
6. `starsEarned` / `rewardsUnlocked` / `rewardsRedeemed` match hand-computed fixtures per D4/D5
   (earned-only stars; reward-coupon mint vs burn counting; offer coupons excluded — now also
   backed by the migration `0015` DB CHECK).
7. Non-admin roles (staff/customer) are rejected on `/api/admin/analytics` (inherited guard —
   regression assert, no new auth logic).
8. Invalid params rejected with 400: missing `from`/`to`, malformed date, `from > to`.
9. The analytics screen renders all eight metrics and the range picker triggers a re-fetch with
   updated params (component test for wiring + user Agent-Probe walkthrough for visuals).
10. No per-customer identifying field in any response payload (code-review check).
11. **(D8a, NEW)** `topSellingProducts` matches a hand-computed fixture: exact `quantitySold`/
    `revenueCents` per product across 3+ products with overlapping order lines, ordered
    descending by quantity, capped at 10 rows, and correctly `branchId`-scoped when provided.
12. **(D8b, NEW)** `newVsReturning` matches a hand-computed fixture: a user whose only-ever order
    falls inside the queried range is counted `new`; a user with a prior order OUTSIDE the range
    and a second order INSIDE the range is counted `returning`; counts sum to the distinct-user
    count of the base order set. **Add a fourth fixture user (per Validate Contract E1) whose
    ONLY-EVER order is `cancelled` and falls outside the range, with a second, non-cancelled order
    INSIDE the range — this user must be counted `new`** (their earliest COUNTED order, i.e. the
    D2-filtered earliest order, is the in-range one), proving the E1 status-filter fix.

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
| Seeded fixture: two-range recalculation of all 8 metrics + Manila 23:30/00:30 boundary edge | Fully-Automated (api vitest) | AC5 |
| Seeded fixture: starsEarned (earned-only), rewardsUnlocked (mint), rewardsRedeemed (burn), offer-coupon exclusion | Fully-Automated (api vitest) | AC6 |
| Integration: staff/customer request → rejected by inherited requireAdmin | Fully-Automated (api vitest, existing hermetic session pattern) | AC7 |
| Integration: 400s for missing/malformed/inverted range params | Fully-Automated (api vitest) | AC8 |
| Component tests: screen renders 8 metrics from mocked payload; picker preset math; range change updates query params | Fully-Automated (admin vitest/jsdom) | AC9 (wiring half) |
| User walkthrough: analytics screen visual render + live range-change behavior against dev DB | Agent-Probe (user-run, per repo convention) | AC9 (visual half) |
| Code-review scan: response shapes contain no customer-identifying field | Agent-Probe | AC10 |
| Seeded fixture: top-selling products exact quantity/revenue per product, ordering, 10-row cap, branch scoping | Fully-Automated (api vitest) | AC11 |
| Seeded fixture: new-vs-returning classification exact for new-only-order user vs. prior-order-outside-range user; counts sum to distinct-user count; cancelled-first-order user counted `new` (E1 fix) | Fully-Automated (api vitest) | AC12 |

Money-adjacent gates (AC2, AC3, AC6, AC11) are HARD: Known-Gap is banned for them per the program
charter — each must be a real passing Fully-Automated test before this phase can be VERIFIED.

---

## Test Infra Improvement Notes

- First aggregation-metric fixture pattern in the api suite — capture the seeded
  multi-branch/multi-user/multi-range fixture builder as a reusable helper if more metrics are
  ever added (now needs to also seed multi-product order lines and pre-range order history for
  D8's two new metrics).
- If order volume ever makes the fetch-rows-compute-in-TS approach (checklist 2c) slow, the
  follow-up is SQL `GROUP BY` + possibly a partial index on `orders.placed_at` — deferred as
  premature at MVP (no materialized views, per issue #45 "basic").

---

## Phase Loop Progress

- [x] 1. RESEARCH — schema/columns re-verified 17-07-26 against `feat/deals_unification` ground
      truth; **PLAN-SUPPLEMENT inner-loop re-confirm pass complete 17-07-26** against merged
      `development` (post-P5/P6) — 3 stale facts corrected (aggregator ordinal, aggregation-query
      precedent framing, nav-config flip-vs-create) via this PLAN-SUPPLEMENT
- [x] 2. INNOVATE — decisions D1–D9 locked with user 17-07-26 (D6/D7 pre-resolved,
      competitor-research-informed D8/D9)
- [x] 3. PLAN-SUPPLEMENT — 3 ground-truth corrections + D4 DB-CHECK note + full D8 metric wiring
      (checklist/AC/serializer/touchpoints/verification-evidence for topSellingProducts and
      newVsReturning) applied 17-07-26
- [x] 4. PVL — vc-validate-agent writes validate-contract (V1-V7) — CONDITIONAL, 17-07-26 (this
      pass; 0 FAILs, 2 substantive CONCERNs resolved via Execute-Agent Instructions E1/E2, 3 minor
      implementation-guidance CONCERNs via E3/E4/E5, none requiring a plan-scope change)
- [x] 5. EXECUTE — implemented per checklist 17-07-26 (E1–E5 all applied). Gates green:
      api typecheck ✓, api test 493/493 (468 baseline + 25 new: 18 analytics integration + 7
      range-helper unit), admin typecheck ✓, admin test 72/72 (58 baseline + 14 new), admin
      build ✓, `pnpm format:check` ✓. Money ACs (AC2/AC3/AC6/AC11) proven by real passing
      Fully-Automated fixtures — Known-Gap unused. Read-only/no-migration held.
- [x] 6. EVL — independent gate re-run confirmation: 493/493 api (matches execute-agent's
      report exactly), 72/72 admin, both typechecks/build/format clean. No regression against
      Phases 0-6/ADM-008/Fix-6 surfaces.
- [x] 7. UPDATE PROCESS — phase report written
      (`phase-07-analytics_REPORT_17-07-26.md`), plan/umbrella/context reconciled, this pass;
      process commit staged separately from the execution commit (`ba88318`)

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-07-analytics_PLAN_14-07-26.md`
2. **Last completed step:** UPDATE PROCESS complete 17-07-26 (this pass) — phase is ✅ VERIFIED.
   All 7 Phase Loop Progress steps ticked. Program-level: this was the FINAL phase — all 8 phases
   of the admin-dashboard program are now ✅ VERIFIED.
3. **Validate-contract status:** WRITTEN 17-07-26 — `generated-by: inner-pvl: phase-7`, Gate:
   CONDITIONAL at PVL, all 5 concerns resolved via Execute-Agent Instructions E1-E5 during EXECUTE
   (no plan-scope change, no Known-Gap rows). See `## Validate Contract` below.
4. **Supporting context files loaded:** umbrella plan (`admin-dashboard_UMBRELLA_PLAN_14-07-26.md`,
   Current Execution State + composite rules), `process/context/all-context.md`,
   `process/context/tests/all-tests.md`,
   `packages/api/src/db/schema/{orders,order_items,star_transactions,coupons,rewards,products,users}.ts`,
   `packages/api/src/routes/admin/{index,deals,orders}.ts`, `packages/api/src/routes/lib/serializers.ts`,
   `apps/admin/src/config/nav-config.ts`, `apps/admin/src/{features,components}` listing.
5. **Next step:** No next phase for THIS program — it is complete. Any further admin-dashboard
   work (Customers module/Tier 3, remaining ADM-008 coupons follow-up exploration, or backlog
   items) should be scoped as a new follow-up plan or feature-folder task, not resumed inside this
   plan. Execution commit `ba88318` on `feat/adm-007-analytics` (cut off merged `development`,
   which already includes P6's `feat/adm-006-branchview` merge); this pass's process-only doc
   changes are staged for a separate `process(admin): ...` commit.

---

## Validate Contract

Status: CONDITIONAL
Date: 17-07-26
date: 2026-07-17
generated-by: inner-pvl: phase-7

Parallel strategy: sequential
Rationale: 7-signal score 1/7 (only S7 — 5+ files in blast radius — present: ~11 touchpoint files
across `packages/api`, `apps/admin`, `packages/types`). No multi-package-scope-in-the-3+-sense
signal (S1), no schema/auth/billing surface (S2/S6 — explicitly LOW risk, read-only), no 3+
competing directions (S3), this single phase plan is not itself further decomposed into a
sub-program (S4), no explicit user request for depth (S5), no prior parallel-execution precedent
being escalated (S7 covered above). LOW tier → one `vc-execute-agent` working the checklist in
its natural dependency order (server route + types + tests, THEN client fetch/hook/components,
since the client genuinely depends on the server route existing) — splitting server/client into
parallel agents would not save wall-clock time here and risks the client guessing at a response
shape the server hasn't finalized yet.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | `ordersPerBranch` exact counts across branches, cancelled/rejected excluded, zero-order branch shows 0 | Fully-Automated | `admin-analytics.integration.test.ts` — seeded multi-branch fixture | A |
| AC2 | `averageOrderValueCents` exact cents value; cancelled order excluded; discounted order uses post-discount `total` | Fully-Automated | `admin-analytics.integration.test.ts` — AOV fixture | A |
| AC3 | `dealsSplit` partition sums to `orderCount`/total; all 3 D1 signals represented; double-signal order counted once (E2) | Fully-Automated | `admin-analytics.integration.test.ts` — deals-split fixture | A |
| AC4 | `repeatPurchaseRate` exact ratio; pending-only 2-order user in denominator not numerator | Fully-Automated | `admin-analytics.integration.test.ts` — repeat-rate fixture | A |
| AC5 | All 8 metrics recalculate across two ranges; Manila 23:30/00:30 boundary instant included/excluded correctly | Fully-Automated | `admin-analytics.integration.test.ts` — two-range + boundary fixture | A |
| AC6 | `starsEarned`/`rewardsUnlocked`/`rewardsRedeemed` exact per D4/D5; offer coupons excluded (DB-CHECK backed) | Fully-Automated | `admin-analytics.integration.test.ts` — stars/rewards fixture | A |
| AC7 | Staff/customer rejected on `/api/admin/analytics` | Fully-Automated | `admin-analytics.integration.test.ts` — hermetic session role matrix | A |
| AC8 | 400 on missing/malformed/inverted `from`/`to` | Fully-Automated | `admin-analytics.integration.test.ts` — param-validation cases | A |
| AC9 (wiring) | Screen renders 8 metrics from mocked payload; picker preset math; range change updates query params | Fully-Automated | `apps/admin` vitest/jsdom component test on the analytics route/hook | A |
| AC9 (visual) | Screen visual render + live range-change behavior reads correctly against dev DB | Agent-Probe | user-run walkthrough (repo convention — no `apps/admin` browser/E2E runner) | A |
| AC10 | No per-customer identifying field in any response payload | Agent-Probe | code-review scan of the assembled response object | A |
| AC11 | `topSellingProducts` exact quantity/revenue per product, DESC order, 10-row cap, branch-scoped | Fully-Automated | `admin-analytics.integration.test.ts` — top-products fixture (3+ products, overlapping lines) | A |
| AC12 | `newVsReturning` exact classification incl. cancelled-first-order edge (E1 fix); counts sum to distinct-user count | Fully-Automated | `admin-analytics.integration.test.ts` — new-vs-returning fixture incl. 4th cancelled-first-order user | A |
| — | Pure Manila-boundary range-helper function (checklist 2b) correct in isolation, not only via the AC5 integration fixture | Fully-Automated | new direct unit test for the range-helper pure function (E3) | B |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist, via Execute-Agent Instruction E3)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated /
Hybrid / Agent-Probe). Known-Gap is NEVER used in this contract — every developed behavior in this
phase's blast radius has a real proving gate (Fully-Automated or Agent-Probe), consistent with the
program's Known-Gap ban on money-adjacent ACs (AC2, AC3, AC6, AC11) and the net-gate
vacuous-green ban (no behavior here rests on Known-Gap alone).

Legacy line form (retained so existing validate-contract consumers still parse):
- API route + tests: `pnpm --filter @jojopotato/api test` (Fully-automated — needs local Postgres
  migrated via `pnpm --filter @jojopotato/api db:migrate` first; the global-setup drops/recreates a
  fixed-name test DB — run EXCLUSIVELY per the existing `api-test-db-concurrency-guard` backlog
  note, no concurrent test run against the same Postgres instance)
- API typecheck: `pnpm --filter @jojopotato/api typecheck` (Fully-automated)
- Admin route/hook/components: `pnpm --filter @jojopotato/admin test` (Fully-automated — jsdom,
  no DB dependency)
- Admin typecheck: `pnpm --filter @jojopotato/admin typecheck` (Fully-automated)
- Admin build: `pnpm --filter @jojopotato/admin build` (Fully-automated)
- Analytics screen visual walkthrough + range-picker live behavior: (agent-probe: user-run,
  against a locally running `apps/admin` dev server + migrated Postgres — no in-repo browser/E2E
  runner exists, per repo convention)
- PII field-shape scan of the assembled `AdminAnalytics` response object: (agent-probe: code
  review at EXECUTE/EVL time — no customer `name`/`email`/`phone`/`userId`-as-row field anywhere)

Dimension findings:
- Infra fit: PASS — the append-only `/api/admin` aggregator pattern is proven 10 times already
  (`routes/admin/index.ts` doc comment: "later admin phases mount their own sub-routers here —
  they never re-apply the guard and never restructure this file, only append"); analytics will be
  the 11th confirmed consumer, one `adminRouter.use('/analytics', analyticsRouter)` line. Zero new
  runtime/container/port surface (read-only, in-process route). The genuinely new Drizzle surface
  (`sum()` + multi-table `groupBy()` for `topSellingProducts`) is mechanically confirmed to exist
  and be correctly typed (`export declare function sum(expression: SQLWrapper): SQL<string | null>`
  in `drizzle-orm/sql/functions/aggregate.d.ts`, sibling to the already-used `count()`) — no
  runtime probe was needed; this is a type-level API-existence check, not an untested behavior.
- Test coverage: PASS — all 4 money-adjacent ACs (AC2, AC3, AC6, AC11) are Fully-Automated with
  exact-value seeded fixtures, honoring the program's Known-Gap ban. Gate commands sourced from
  `process/context/tests/all-tests.md`'s command table (not inferred). The destructive test-DB
  drop/recreate precondition (`packages/api` vitest `global-setup.ts`) is documented in the gate
  commands above per the existing `api-test-db-concurrency-guard` backlog note — run exclusively.
- Breaking changes: PASS — `GET /api/admin/analytics` is a brand-new route with no existing
  consumer; `packages/types/src/admin.ts` additions are additive exports only (confirmed the
  existing `AdminMe`/`AdminUserSummary` types are untouched by this phase). No wire-frozen surface
  from any earlier phase is read, written, or renamed.
- Security surface: PASS — `requireAdmin` is inherited via the aggregator mount (confirmed comment
  in `routes/admin/index.ts`: guard + CORS applied once at the `/api/admin` mount point in
  `index.ts`, every sub-router inherits automatically — no handler re-checks role). AC7
  regression-tests staff/customer rejection using the existing hermetic session pattern. All 8
  metric response shapes were reviewed field-by-field against the Public Contracts section: none
  carry a `user_id`, `name`, `email`, or `phone` field — `topSellingProducts` and `newVsReturning`
  (the two newest, most PII-adjacent-sounding metrics) are aggregate counts/sums only, never
  per-user rows.
- Server section feasibility (analytics.ts + types + aggregator append + test file): CONCERN —
  the `newVsReturning` global earliest-order lookup (checklist 2i) as originally drafted queried
  `MIN(placed_at)` over ALL orders for a user with no status filter, while the base order set used
  everywhere else in this metric family excludes `cancelled`/`rejected` (D2). This is a real
  correctness ambiguity: a user whose only-ever order was cancelled, plus a later real order inside
  the queried range, would be misclassified `returning` instead of `new` under the unfiltered
  query. Resolved via Execute-Agent Instruction E1 (apply the D2 status filter to the global
  lookup too) + a new required AC12 fixture case (4th user, cancelled-first-order) added to this
  plan's Acceptance Criteria and Verification Evidence this pass. Also flagged: E2 (make the D1
  double-signal union boolean explicit so a coupon+bundle order is counted exactly once — AC3
  already requires this, E2 is implementation guidance ensuring it's built that way) and E3 (add a
  direct unit test for the pure Manila-boundary range-helper function, in addition to the AC5
  integration-level fixture that exercises it end-to-end — improves failure localization if the
  boundary math ever regresses).
- Client section feasibility (apps/admin analytics feature folder + route + nav-config): CONCERN
  (minor) — the plan's react-query key (`['admin','analytics',from,to,branchId]`) does not specify
  how an unset `branchId` is represented in the key tuple; `undefined` vs a placeholder string can
  produce cache-key collisions or unintended stale-view leakage between "all branches" and a
  specific branch. Resolved via Execute-Agent Instruction E4 (normalize `branchId` to a stable
  placeholder, e.g. `'all'`, inside the key tuple). File/pattern structure otherwise mechanically
  matches the `apps/admin/src/features/orders/**` precedent exactly (lib/hooks/components split,
  same fetch-wrapper shape); no `<Outlet/>` split needed (single screen, no detail child route —
  correctly identified in the plan).
- Cross-phase consistency: CONCERN (low severity, informational) — Phase 6 (`routes/admin/orders.ts`)
  uses UTC start-of-day semantics for its `dateFrom`/`dateTo` filters, while this phase uses
  Asia/Manila local-day semantics (D3) for the same class of date-range parameter. Both are
  deliberate, documented decisions in their respective phase plans (D3's rationale: "admins think
  in local business days"; Phase 6 never revisited this question). Neither is a defect — this is
  surfaced as a CONCERN only so the divergence is on record, not accidentally discovered later as
  a "bug". Resolved via Execute-Agent Instruction E5 (no code change — document the intentional
  divergence in the analytics route's file-header comment, mirroring how `orders.ts` documents its
  own UTC-day convention).

Execute-Agent Instructions:

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | Apply the D2 status filter (`status NOT IN ('cancelled','rejected')`) to the `newVsReturning` global `MIN(placed_at)` lookup (checklist 2i), not just to the range-scoped base order set. Add the 4th AC12 fixture user (only-ever order cancelled + outside range, second real order inside range) and assert they classify `new`. | Implementing checklist item 2i / writing the AC12 fixture |
| E2 | Compute the D1 "has a deal" signal as one explicit per-order boolean union (`coupon_id != null \|\| deal_id != null \|\| orderId ∈ bundleOrderIds`) so a coupon+bundle order is never double-counted across `withDeals`/`withoutDeals`. | Implementing checklist item 2j / writing the AC3 double-signal fixture |
| E3 | Add a direct unit test for the pure Manila-boundary range-helper function (checklist 2b) in isolation (e.g. `2026-07-17` Manila → exact UTC bounds), in addition to the AC5 integration-level fixture. | Writing `admin-analytics.integration.test.ts` (or a co-located unit test file for the pure helper) |
| E4 | Normalize `branchId` to a stable placeholder value (e.g. `'all'`) inside the `use-analytics.ts` react-query key tuple when unset, so "all branches" and a specific branch produce distinct, non-colliding cache entries. | Writing `use-analytics.ts` |
| E5 | Add a one- or two-line file-header comment in `analytics.ts` noting the Asia/Manila day-boundary convention (D3) and that it intentionally differs from `routes/admin/orders.ts`'s UTC-day convention (Phase 6) — no code change required, documentation only. | Writing `packages/api/src/routes/admin/analytics.ts` |

Open gaps: none — all 5 CONCERNs found this pass are resolved via Execute-Agent Instructions E1-E5
(E1 additionally required a new AC12 fixture case, folded into this plan's Acceptance Criteria and
Verification Evidence above). No FAILs found. No Known-Gap rows in this contract.

What this coverage does NOT prove:
- The exact-value seeded fixture tests (AC1-AC6, AC11-AC12) prove correctness against the SPECIFIC
  seeded scenarios in the test file; they do not prove correctness at production data volumes (the
  plan's own `fetch-rows-compute-in-TS` approach for checklist 2c is documented as a "basic scale"
  choice, with a named follow-up to switch to SQL `GROUP BY` if volume ever makes it slow — see
  Test Infra Improvement Notes).
- `topSellingProducts`'s fixture proves the 10-row cap and DESC ordering for a small (3+ product)
  fixture; it does not prove ranking stability when two products tie exactly on `SUM(quantity)`
  (no explicit tie-break rule is specified in the plan — acceptable at MVP scale, not proven either
  way by the gates above).
- The `apps/admin` component test (AC9 wiring half) proves the screen wires to a MOCKED payload and
  that range changes update hook params; it does not prove the visual layout, spacing, or
  readability of the two tables + cards at real screen sizes, nor does it exercise the live network
  round-trip against a real Postgres-backed API response — that is the Agent-Probe visual half
  (AC9 visual), owed as a user-run walkthrough, consistent with every prior phase in this program.
- The AC10 PII code-review scan proves the CURRENTLY-defined response shape carries no
  customer-identifying field; it does not automatically re-verify a future metric addition — that
  scan must be re-run by hand whenever the `AdminAnalytics` response shape changes.
- The AC7 non-admin-rejection test proves staff/customer requests are rejected by the INHERITED
  `requireAdmin` guard on this specific route; it does not re-verify `requireAdmin`'s own internal
  correctness (that is Phase 1's test suite's responsibility, not duplicated here).
- The mechanical Drizzle `sum()` type-existence check (Infra fit finding) proves the API surface
  compiles; it does not substitute for the AC11 fixture actually exercising it against real seeded
  rows — the fixture test, not the type check, is what proves correctness.

Gate: CONDITIONAL (0 FAILs; 5 CONCERNs found, all resolved via Execute-Agent Instructions E1-E5
this cycle — 2 substantive (E1 correctness ambiguity, E2 double-count guard) and 3 minor
implementation-guidance/documentation items (E3, E4, E5); no plan-scope change needed; no Known-Gap
rows). Execution can proceed.
Accepted by: session (inner-PVL autonomous pass, 17-07-26) — concerns E1 (newVsReturning earliest-
order status-filter consistency with D2, plus new AC12 fixture case), E2 (D1 double-signal union
boolean explicitness), E3 (direct unit test for the pure Manila-boundary helper), E4 (react-query
key branchId normalization), E5 (cross-phase UTC-vs-Manila timezone convention documentation note)
— all folded into the Implementation Checklist and Acceptance Criteria above as binding
Execute-Agent Instructions for this phase's EXECUTE pass.
