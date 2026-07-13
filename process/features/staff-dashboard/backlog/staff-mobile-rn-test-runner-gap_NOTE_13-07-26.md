---
name: backlog:staff-mobile-rn-test-runner-gap
description: "No RN test runner — staff role-gate, (staff) shell, and useStaffMe are Agent-Probe only"
date: 13-07-26
metadata:
  node_type: memory
  type: backlog
  feature: staff-dashboard
  priority: P1
---

# Backlog: Mobile RN Test Runner Gap (staff-dashboard impact)

**Priority:** P1 — blocks automated regression for AC1/AC2/AC4 mobile criteria
**See also:** `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`
  (project-wide backlog note — the fix lives there; this note documents the staff-dashboard impact)

## Problem

`apps/mobile` has no RN test runner (no jest-expo, Maestro, Detox). The following
STAFF-001 deliverables are Agent-Probe only (manual device/simulator verification):

- `isStaff` derivation in `useAuth()` — not unit-tested
- `Stack.Protected` three-guard logic in `app/_layout.tsx` — not tested; a regression would
  silently mis-route staff users to the customer tab or customer users to the staff shell
- `useStaffMe()` hook loading/error state transitions — not tested
- Staff shell render (`(staff)/index.tsx`) — not tested
- AC1 (staff login → (staff) stack), AC2 (customer blocked), AC4 (session persistence on restart)
  — all Known-Gap residuals from the STAFF-001 validate-contract

## What Must Be Done

Introduce a mobile RN test runner per `mobile-e2e-navigation-harness_NOTE_09-07-26.md`. Once
that is done:

1. Add a unit test for `isStaff` derivation: `role = 'staff'` → `isStaff = true`; `role = 'customer'` → `isStaff = false`.
2. Add a render test for `useStaffMe` loading → data and loading → error paths.
3. Add a navigation integration test for the three-guard root gate routing.

Until a runner exists, manually re-verify AC1/AC2/AC4 whenever the root `_layout.tsx` or
`use-auth.ts` files are modified.
