---
name: backlog:adm-004-deal-components-check-constraints-deferred
description: "deal_components has no DB CHECK constraint for quantity > 0 or deal_product_id <> component_product_id; app-layer already enforces both, DB constraint needs a new migration"
date: 16-07-26
metadata:
  node_type: memory
  type: backlog
  feature: admin-dashboard
  priority: P3
---

# Backlog: `deal_components` Missing DB `CHECK` Constraints (Deferred Hardening)

**Priority:** P3 — deferred hardening, not a known defect (app-layer already enforces both rules)
**Phase:** Phase 4a — Deals-as-Products (ADM-004 RE-PLAN)
**Discovered:** Phase 4a post-EXECUTE review, 16-07-26

## Problem

The `deal_components` table (migration `0007_fearless_crystal.sql`) has no DB-level `CHECK`
constraint for either of:

1. `quantity > 0` — the column is `integer not null default 1` with no lower-bound constraint at the
   DB level.
2. `deal_product_id <> component_product_id` — nothing at the DB level prevents a self-referential
   row (a deal listing itself as its own component).

Both rules ARE already enforced at the application layer (`packages/api/src/routes/admin/deals.ts`):
the component-attach route's Zod schema requires `quantity >= 1`, and the handler explicitly rejects
`componentProductId === dealProductId` (self-reference) before insert — see Decision 3 in
`phase-04-deals_PLAN_14-07-26.md`. This is real, tested protection (AC4), not a hypothetical gap in
practice. The gap is specifically the absence of a DB-level backstop against a future write path
that bypasses the app layer (a raw SQL migration, a script, a future direct-DB admin tool).

## Why deferred, not fixed now

Migration `0007` is already applied (live in the dev DB and merged into the migration history). A DB
`CHECK` constraint requires a NEW migration (e.g. `0008_...sql`) — it cannot be added by editing
`0007` in place. Adding a migration for defense-in-depth hardening, with no known active exploit
path and no urgent driver, was judged out of scope for the 16-07-26 UPDATE PROCESS doc-reconciliation
pass (which was explicitly scoped to NOT touch source code or schema).

## Fix options (for whoever picks this up)

1. New migration adding `CHECK (quantity > 0)` and `CHECK (deal_product_id <> component_product_id)`
   on `deal_components`. Low risk — the existing app-layer guards mean no live row should ever
   violate either constraint, so this should apply cleanly with no data cleanup needed. Recommended
   approach when picked up.
2. Leave as app-layer-only indefinitely if no additional DB write path is ever introduced. Acceptable
   if this table's only writer stays the admin API.

## Recommendation

Low priority. Revisit alongside any future phase (e.g. ADM-008) that adds a second write path to
`deal_components`, or as part of a general schema-hardening pass if one is ever scheduled.
