---
name: backlog:adm-004-is-deal-partial-index-deferred
description: "No partial index on products.is_deal for menu/admin filter queries; deferred as premature until a real scale problem appears"
date: 16-07-26
metadata:
  node_type: memory
  type: backlog
  feature: admin-dashboard
  priority: P3
---

# Backlog: No Partial Index on `products.is_deal` (Deferred Hardening)

**Priority:** P3 — deferred hardening, premature optimization at current scale
**Phase:** Phase 4a — Deals-as-Products (ADM-004 RE-PLAN)
**Discovered:** Phase 4a post-EXECUTE review, 16-07-26

## Problem

Every one of the 5 `is_deal` filter sites (see `phase-04-deals_PLAN_14-07-26.md` §"The 5 `is_deal`
Filter Sites") queries `products` with an `is_deal = true` or `is_deal = false` predicate, but there
is no dedicated index on `products.is_deal` (partial or otherwise) — these queries currently rely on
whatever existing indexes/table scan Postgres's planner chooses.

## Why deferred, not fixed now

The product catalog is small (dev/early-production scale — tens to low hundreds of rows, not
thousands). A `WHERE is_deal = ...` filter over a small table is not a measured performance problem
today; adding an index speculatively, before any query-latency signal exists, would be optimizing
without evidence. This is explicitly the kind of premature hardening the umbrella plan's "don't add
without a real second need" principle (mirrored from the UI-composite reuse rule) argues against.

## Fix options (for whoever picks this up)

1. A partial index such as `CREATE INDEX products_is_deal_true_idx ON products (id) WHERE is_deal =
   true` (and/or the `false` complement, if the regular-menu-exclusion query becomes the hot path
   instead) once real query-performance data justifies it.
2. A plain composite index if `is_deal` ends up commonly filtered together with another column
   (e.g. `category_id` or `is_active`) in the same query — decide the exact shape based on the actual
   slow query, not speculatively now.

## Recommendation

No action needed until a real scale/latency signal appears (e.g. slow menu-load reports, a
production catalog large enough to matter, or profiling data from Phase 7's analytics work showing
this as a hot path). Revisit opportunistically, not on a schedule.
