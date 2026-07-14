---
name: backlog:adm-002-is-accepting-pickup-race-condition
description: "is_accepting_pickup has no optimistic-concurrency guard against future STAFF-004 mobile writes; revisit when STAFF-004 is planned"
date: 14-07-26
metadata:
  node_type: memory
  type: backlog
  feature: admin-dashboard
  priority: P2
---

# Backlog: `is_accepting_pickup` Shared-State Race (Known-Gap)

**Priority:** P2 — accepted Known-Gap, blocked on a not-yet-built dependency (STAFF-004)
**Phase:** Phase 2 — Branches CRUD (ADM-002, #40)
**Discovered:** Phase 2 RESEARCH/VALIDATE, 14-07-26

## Problem

There is NO optimistic-concurrency guard (`updated_at` compare, `FOR UPDATE` lock, or version column)
anywhere on `branches` writes. That makes `is_accepting_pickup` (and every other branch field) an
**admin-vs-admin last-write-wins race today**: two admins editing the same branch concurrently via
`PATCH /api/admin/branches/:id` silently clobber each other, and the loser gets no warning. This gap
is real now, with only the admin dashboard as a writer — it is NOT contingent on STAFF-004.

`is_accepting_pickup` additionally has no separate admin-only flag: the (not-yet-built) mobile staff
shell (STAFF-004) will write the exact same column, adding a **second, cross-role** writer and
widening the same race. Last-write-wins is accepted for now.

The admin-vs-admin case is testable today (two concurrent PATCHes on one branch id); the cross-role
admin-vs-staff case can only be tested once STAFF-004's write path exists.

## What To Do

- When STAFF-004 (mobile staff branch pickup-settings) is planned, its RESEARCH step must revisit
  this note and decide whether an optimistic-concurrency guard is needed on `branches` writes (both
  admin's and staff's write paths).
- If STAFF-004 ships such a guard, Phase 2's admin `PATCH /api/admin/branches/:id` route needs a
  follow-up patch to respect it (flagged in the Phase 2 report's Forward Preview).

## Notes

- This is a deliberate, documented Known-Gap per the Phase 2 validate-contract (gap-resolution `D`
  — backlog test-building stub), not a silently dropped concern.
- Non-blocking for Phase 2 archival — the admin-vs-admin race requires two concurrent admin editors
  on the same branch (low-likelihood, self-correcting: re-toggle fixes it, no data loss/money/authz
  surface); the cross-role widening waits on STAFF-004.
