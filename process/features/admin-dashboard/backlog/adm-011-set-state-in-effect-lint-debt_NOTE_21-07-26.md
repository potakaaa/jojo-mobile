---
name: note:adm-011-set-state-in-effect-lint-debt
description: "Pre-existing react-hooks/set-state-in-effect lint failure in add-staff-dialog.tsx (ADM-011), keeps full apps/admin lint red; zero diff in ADM-012"
date: 21-07-26
feature: admin-dashboard
metadata:
  node_type: backlog-note
  type: note
  status: OPEN
---

# ADM-011 `set-state-in-effect` lint debt (pre-existing, not new)

**Filed:** 21-07-26, during ADM-012 UPDATE PROCESS.
**Status:** OPEN — small, low-risk, not blocking any current work.

## The gap

`apps/admin/src/features/staff/components/add-staff-dialog.tsx:63` fails the
`react-hooks/set-state-in-effect` ESLint rule. This was last touched by ADM-011
(commit `0bf8365`) — **zero diff in ADM-012** (confirmed by direct commit-range diff).
It keeps the full `apps/admin` lint run red until fixed; the ADM-012 gate table above
only ran `test`/`typecheck`/`build`/`format`, not the full lint task, so this did not
block ADM-012's own gates.

## Why it matters now

ADM-012's own accept-screen rewrite (`staff-invite-accept.tsx`) deliberately avoided
introducing the SAME class of violation (see the ADM-012 report's Plan Deviations §1 —
the routing-state collapse) by NOT using a `setState`-in-`useEffect` pattern to react to
another state change. That pattern is real and enforced on this branch; `add-staff-dialog.tsx`
predates that discipline.

## Recommended fix

Small, low-risk quick-fix scoped to `add-staff-dialog.tsx` only — refactor the
effect-driven `setState` into the same class of synchronous-resolution pattern ADM-012
used, or restructure per whatever the lint rule's suggested fix is. Recommend routing
this as a follow-up on **ADM-011**, not ADM-012 (ADM-012 has zero diff on this file).

## Out of scope for ADM-012

Not touched by this plan. Filed here purely for tracking so `apps/admin` lint red isn't
mistaken for a new ADM-012 regression.
