---
name: backlog:adm-002-ac7-manual-walkthrough-owed
description: "AC7 Agent-Probe manual browser walkthrough for admin branches CRUD is owed (no in-repo browser runner)"
date: 14-07-26
metadata:
  node_type: memory
  type: backlog
  feature: admin-dashboard
  priority: P1
---

# Backlog: ADM-002 AC7 Manual Walkthrough Owed

**Priority:** P1 — non-blocking, tracked residual on a Fully-Automated-verified phase
**Phase:** Phase 2 — Branches CRUD (ADM-002, #40)
**Discovered:** Phase 2 EXECUTE/EVL, 14-07-26

## Problem

AC7 (`apps/admin` branches list → create → edit → deactivate → duplicate-slug walkthrough against
a real running dev Postgres) is Agent-Probe tier per the validate-contract — it requires a running
`apps/admin` dev server + a browser session. No browser/E2E runner exists in this repo yet
(project-wide gap, see `process/context/tests/all-tests.md`), so this walkthrough has NOT been run.

AC1-AC6 (Fully-Automated, server-side CRUD + guard enforcement) are green (12/12 in
`admin-branches.integration.test.ts`, 134/134 whole API suite) and independently EVL-confirmed.
Server-side correctness is proven; the actual `apps/admin` screens rendering/wiring correctly in a
browser is not yet proven.

## What To Do

- Run the manual walkthrough: list → create → edit → deactivate → attempt duplicate slug, against
  the running `apps/admin` dev server + local Postgres.
- If it passes, update this note (or a phase report addendum) closing the gap — mirror the pattern
  used for Phase 1's AC8 (initially owed, later run and closed with a dedicated verification note).
- If it fails, file the defect and route to a fix (QUICK FIX or RESEARCH depending on scope).

## Notes

- Same pattern as Phase 1 (ADM-001)'s AC8 — initially recorded as Agent-Probe-owed, later
  RE-CLOSED after the walkthrough actually ran and caught a real CORS defect. Do not assume "owed"
  means "will pass" — treat as an open verification task.
- No automated regression exists for this surface and none is planned until an `apps/admin`
  browser/E2E runner is set up (tracked as the project-wide gap, not fixable within this phase).
