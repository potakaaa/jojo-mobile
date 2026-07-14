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

`branches.is_accepting_pickup` has no separate admin-only flag — it is the exact same DB column the
(not-yet-built) mobile staff shell (STAFF-004) will also write. There is ONE source of truth; admin
(this phase) and staff (STAFF-004, future) both write it directly. RESEARCH confirmed no
optimistic-concurrency guard (`updated_at` check, `FOR UPDATE` lock, or similar) exists anywhere on
`branches` writes today. Last-write-wins is accepted for now — no automated test is possible until
STAFF-004 exists.

## What To Do

- When STAFF-004 (mobile staff branch pickup-settings) is planned, its RESEARCH step must revisit
  this note and decide whether an optimistic-concurrency guard is needed on `branches` writes (both
  admin's and staff's write paths).
- If STAFF-004 ships such a guard, Phase 2's admin `PATCH /api/admin/branches/:id` route needs a
  follow-up patch to respect it (flagged in the Phase 2 report's Forward Preview).

## Notes

- This is a deliberate, documented Known-Gap per the Phase 2 validate-contract (gap-resolution `D`
  — backlog test-building stub), not a silently dropped concern.
- Non-blocking for Phase 2 archival — the race is theoretical until STAFF-004's write path exists.
