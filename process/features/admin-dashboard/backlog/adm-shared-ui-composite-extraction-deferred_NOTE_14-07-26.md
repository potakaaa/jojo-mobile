---
name: backlog:adm-shared-ui-composite-extraction-deferred
description: "Extract data-table/form-dialog/confirm-dialog/page-header/query-states shared composites once a real second CRUD consumer exists (P3+)"
date: 14-07-26
metadata:
  node_type: memory
  type: backlog
  feature: admin-dashboard
  priority: P2
---

# Backlog: Shared Admin UI Composite Extraction (Deferred from Phase 2)

**Priority:** P2 — cleanup/reuse improvement, not a defect
**Phase:** Phase 2 — Branches CRUD (ADM-002, #40); relevant to Phase 3 (Products/Categories)
**Discovered:** Phase 2 EXECUTE, 14-07-26

## Problem

Phase 2's umbrella-level Cross-Cutting Compliance §5 called for extracting five shared composites
(`components/data-table.tsx`, `form-dialog.tsx`, `confirm-dialog.tsx`, `page-header.tsx`,
`query-states.tsx`) on shadcn primitives, to be reused by every later CRUD domain (P3-P7). Phase 2
built feature-folder-local components instead (`features/branches/components/{branch-list,
branch-form,deactivate-branch-dialog}.tsx`) and did NOT extract the shared composites.

Reasons (from the phase report's Plan Deviations):
1. No gate exercises the composites and AC7 is manual-only — no verification benefit this phase.
2. A parallel unrelated workstream was actively editing `apps/admin` components at the time
   (`admin-button-refinement`), making 5 new speculative shared files a collision/scope risk.

## What To Do

- When Phase 3 (Products/Categories CRUD, ADM-003) starts RESEARCH, revisit this extraction: if
  Phase 3 would copy-paste a Phase 2 branches component, promote it to a shared composite instead
  (the "second consumer" rule already defined in the umbrella plan §5).
- Do not pre-build the composites speculatively before Phase 3 confirms the actual duplication
  shape — `ponytail:` discipline still applies.

## Notes

- The Phase 2 CRUD shapes (list/form/confirm-dialog) are cleanly separated and reusable AS-IS as a
  reference pattern for P3-P7, even without formal extraction.
- This is a within-blast-radius internal `apps/admin` structure decision, not a contract change.
