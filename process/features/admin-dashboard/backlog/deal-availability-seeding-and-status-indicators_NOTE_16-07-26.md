# NOTE — Deal availability seeding + active/visibility indicators (Deals, Promotions, Offers)

**Status: RESOLVED (16-07-26).** Bug 1 fixed by Fix 1 (`d17d296` — seed branch-availability rows
on deal create, option (a)) and further hardened by Fix 4 (`dd5312d` — branch-availability editor
on the deal manage page, option (b); plus an optional `branchIds[]` param on
`POST /api/admin/deals` for choosing availability at creation time). Bug 2 fixed by Fix 3
(`878ecce` — `StatusBadge`/`entity-status.ts` shared surfaces; badges on deals/offers/promotions
list+detail). See `process/context/all-context.md` (16-07-26 delta) for the full description.
Kept in place for history — do not delete.

Date: 16-07-26
Feature: admin-dashboard
Origin: found live on 16-07-26 while testing the `feat/deals_unification` merge — admin-created
deals never appeared on the mobile Deals tab; a second deal created during the session hit the
same wall despite the user toggling Deactivate/Reactivate.

## Bug 1 (primary): deal creation seeds no branch availability rows

A "Deal" is a `products` row with `is_deal = true`. The mobile Deals tab reads
`GET /branches/:id/menu?isDeal=true`, and the menu query (`packages/api/src/routes/branches.ts`,
`eq(branchProductAvailability.is_available, true)`) only returns products that have an explicit
`branch_product_availability` row with `is_available = true` for that branch.

`POST /api/admin/deals` (and the create wizard) creates the product + components but **zero
availability rows** → every new deal is invisible at every branch until someone inserts rows by
hand. The admin deals screen has no availability editor (the Phase-3 products screen has one, but
its list hides `is_deal` products by default), and Deactivate/Reactivate toggles `is_active` —
a different flag that does not affect branch availability. Nothing in the UI indicates the deal
is unavailable everywhere.

Dev workaround used (per-DB, must be re-run for each new deal):

```sql
INSERT INTO branch_product_availability (branch_id, product_id, is_available)
SELECT b.id, p.id, true FROM branches b CROSS JOIN products p WHERE p.is_deal = true
ON CONFLICT (branch_id, product_id) DO UPDATE SET is_available = true, updated_at = now();
```

Fix options (pick at PLAN time):
- (a) Seed availability rows for all active branches inside the create transaction
  (`POST /api/admin/deals` already wraps a `db.transaction()` since Enhancement E1), and/or
- (b) add a branch-availability editor to the deal manage page (reuse the products screen's
  availability sub-editor pattern), and/or
- (c) make the deals menu filter treat "no row" as available (matches offers' empty-set
  semantics — see below — but changes the existing menu contract for regular products; riskiest).

## Bug 2 (UX): no active/visibility status indicators on Deals, Promotions, or Offers screens

None of the three list/detail screens show at-a-glance whether the entity is actually live for
customers. Requested: a clear status indicator (e.g. Active / Inactive / "Not available at any
branch" badge) on each of:

- **Deals** (`apps/admin` features/deals) — must combine `is_active` AND branch availability,
  since either one can hide the deal from mobile.
- **Offers** (features/offers) — active flag + validity window + branch scope.
- **Promotions** (features/promotions) — active flag + window; roll-up of child offer states
  would be a bonus.

## Important semantic asymmetry (do NOT "unify" these blindly)

The three entities do **not** share visibility mechanics:

| Entity | Branch scoping | Empty scope means |
|---|---|---|
| Deal (`is_deal` product) | `branch_product_availability` | **Invisible everywhere** (menu filter requires an `is_available=true` row) |
| Offer | `offer_branches` junction | **Valid everywhere** — branch-agnostic (`packages/api/src/routes/orders.ts` step 2: "empty offer_branches = branch-agnostic"; same in `coupon-apply.ts`) |
| Promotion | none (window + active only) | n/a |

So the "invisible by default" trap is deals-only. Offers/promotions need indicators (Bug 2) but
have no seeding bug. Any fix that tries to make deals behave like offers (option (c) above) is a
contract change to the regular menu path and needs its own validation.

## Suggested routing

Small bounded feature — RESEARCH → PLAN → EXECUTE within admin-dashboard. Touches
`packages/api/src/routes/admin/deals.ts` (seeding) + `apps/admin` deals/offers/promotions
screens (indicators). No schema change required for options (a)/(b).
