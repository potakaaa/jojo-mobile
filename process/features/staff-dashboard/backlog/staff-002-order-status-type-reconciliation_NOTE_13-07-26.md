---
name: backlog:staff-002-order-status-type-reconciliation
description: "OrderStatus type in packages/types out of sync with DB orders enum — blocks real staff order data"
date: 13-07-26
metadata:
  node_type: memory
  type: backlog
  feature: staff-dashboard
  priority: P1
---

# Backlog: OrderStatus Type vs DB Enum Reconciliation

**Priority:** P1 — blocks STAFF-002 and STAFF-003 (real order data screens)
**Discovered:** STAFF-001 UPDATE PROCESS, 2026-07-13
**Blocks:** STAFF-002 (active orders feed), STAFF-003 (status-change actions), shared `OrderStatusBadge` component

## Problem

`packages/types/src/order.ts` defines `OrderStatus` as:
```text
pending | confirmed | preparing | ready_for_pickup | completed | cancelled
```

The DB `orders` table enum is:
```text
pending | accepted | preparing | flavoring | ready | completed | cancelled
```

These do not match. Differences:
- `confirmed` in types vs `accepted` in DB
- `ready_for_pickup` in types vs `ready` in DB
- `flavoring` exists in DB but not in types

The PRD §6.6 customer-facing status labels are:
- `pending` → "Order received"
- `accepted` → "Preparing your order"
- `preparing` → "Frying now"
- `flavoring` → "Shaking the flavor"
- `ready` → "Ready for pickup"
- `completed` → "Completed"
- `cancelled` → "Cancelled"

The shared `OrderStatusBadge` and `OrderStatusTimeline` components in `packages/ui` consume the
types enum. Using them for real staff order data (STAFF-002/003) will produce type errors or
incorrect badge labels until reconciled.

## Fix Options

1. **Update `packages/types/src/order.ts`** to match the DB enum exactly:
   `pending | accepted | preparing | flavoring | ready | completed | cancelled`.
   Then update `OrderStatusBadge`/`OrderStatusTimeline` in `packages/ui` to use the DB-aligned
   labels from PRD §6.6. This is the correct fix — types should derive from the DB truth.

2. **Add a mapping layer** in the UI components between DB values and display labels. More
   indirection for no gain over option 1.

## Notes

- Do NOT use `OrderStatusBadge` with real staff order data until this is resolved — it will
  silently render incorrect labels or produce TypeScript errors.
- The `(staff)/active-orders.tsx` mock screen (STAFF-001 preview scaffold) uses hardcoded strings
  and does not consume `OrderStatusBadge`, so it is not affected.
- Reconcile before writing STAFF-002 API (`GET /api/staff/orders`) so the response type is correct
  from day 1.
