# ADM-010 — Deferred: trigram/GIN search index on `users` (NOTE)

Date: 21-07-26
Feature: admin-dashboard
Status: DEFERRED (not a gap to fix now — explicitly out of scope per SPEC Constraints/D3)

## What

The ADM-010 customer search (`GET /api/admin/customers?q=`) runs a plain
case-insensitive `ILIKE '%q%'` OR-combined across `users.name`, `users.email`, and
`users.phoneNumber`. There is no trigram/GIN index on those columns today, so each
search is a sequential scan.

## Why deferred

Acceptable at current dev-seed scale — locked as an accepted tradeoff in the SPEC
(D3) and the PLAN Scope. A leading-wildcard `%q%` ILIKE cannot use a normal B-tree
index anyway; it needs a `pg_trgm` GIN index to be sped up, which is real migration
+ extension work not justified until the customer table grows large enough for the
scan to become a measured performance problem.

## Suggested fix if/when it matters

1. `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
2. Add GIN trigram indexes on `users.name`, `users.email`, `users.phone_number`
   (a new additive migration).
3. Re-measure the `q=` search latency at the then-current customer-table size.

No code change to `routes/admin/customers.ts` is required — the ILIKE query plan
would simply start using the index.
