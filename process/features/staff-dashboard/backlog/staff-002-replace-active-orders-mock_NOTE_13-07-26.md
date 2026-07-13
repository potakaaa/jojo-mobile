---
name: backlog:staff-002-replace-active-orders-mock
description: "Replace hardcoded mock active-orders.tsx with real STAFF-002 data screen"
date: 13-07-26
metadata:
  node_type: memory
  type: backlog
  feature: staff-dashboard
  priority: P0
---

# Backlog: Replace Mock active-orders.tsx (STAFF-002)

**Priority:** P0 — part of milestone "Phase 3: Pickup Live Updates"
**GitHub Issue:** #32 (STAFF-002 Active Orders Dashboard)
**Discovered:** Added at user request during STAFF-001 execute session, 2026-07-13

## Problem

`apps/mobile/src/app/(staff)/active-orders.tsx` was added as a user-requested preview scaffold
during STAFF-001. It contains:
- Hardcoded sample order data (not from API)
- Inert status-change buttons (no onPress handlers that do anything)
- A static list render using `@jojopotato/ui` components

This file is NOT part of the STAFF-001 validate-contract. It exists only to demonstrate the
intended UI shape. STAFF-002 must replace it with a real implementation.

## What STAFF-002 Must Do

- Implement `GET /api/staff/orders?status=active` endpoint using `requireStaff` + `assertBranchScope`
- Replace the mock screen with a real data-fetching screen (react-query or similar if approved)
- Connect status-change buttons to real PATCH endpoints (STAFF-003)
- Reconcile `OrderStatus` type with DB enum FIRST (see `staff-002-order-status-type-reconciliation_NOTE_13-07-26.md`)

## Notes

- The mock screen is reachable from the staff shell index nav card ("Active Orders").
- Do NOT modify the mock screen for production features — delete and replace it in STAFF-002.
- The shell's nav card `onPress` for "Active Orders" already navigates to `/(staff)/active-orders`
  (or equivalent); the route exists so navigation works even though the content is placeholder.
