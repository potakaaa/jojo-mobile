---
name: backlog:staff-003-star-earn-wiring-dependency
description: "STAFF-003 must call creditStarForCompletedOrder / reverseStarForRefundedOrder from live staff endpoints — entire earn+unlock chain built but unwired"
date: 14-07-26
metadata:
  node_type: memory
  type: backlog
  feature: rewards-notifications
---

# Backlog NOTE — STAFF-003 Star-Earn Wiring Dependency

**Created:** 2026-07-14 (STAR-003 UPDATE PROCESS)
**Priority:** High (P0 — the full earn→unlock chain is built and tested but NOTHING calls it on real order completion)
**Source:** STAR-001/002/003 out-of-scope deferred work

## Problem

The entire Jojo Stars backend chain is implemented and fully tested:

- STAR-001: `creditStarForCompletedOrder(orderId)` + `reverseStarForRefundedOrder(orderId)` — idempotent, hermetic
- STAR-002: `/rewards/summary|available|history` read API — session-gated, per-user isolated
- STAR-003: battle-pass unlock + coupon generation — runs inside STAR-001's credit transaction

BUT: no live endpoint calls these services on real order completion/refund. The TODO seams are in `packages/api/src/lib/star-earning.ts` module header:

```typescript
// TODO(STAFF-003): call creditStarForCompletedOrder(order.id) when order status → 'completed'
// TODO(STAFF-003): call reverseStarForRefundedOrder(order.id) when payment_status → 'refunded'
```

## Current Behavior

Stars are NEVER credited in production — the services only run in hermetic tests. The Rewards screen shows 0 stars for all users because `creditStarForCompletedOrder` is never called.

## Required Fix (STAFF-003)

In `packages/api/src/routes/staff.ts` (or a new `staff-orders.ts` route), the staff order-status PATCH endpoint must:

1. When transitioning `order.status` → `'completed'`: call `await creditStarForCompletedOrder(orderId)` and log the result.
2. When transitioning `order.payment_status` → `'refunded'`: call `await reverseStarForRefundedOrder(orderId)` and log the result.

Both services are idempotent — a double-fire is safe (returns `already-credited`/`already-reversed`).

## Prerequisites

- STAFF-003 plan (not yet written) — requires the staff order-status update endpoint to exist. See `process/features/staff-dashboard/` for existing STAFF-001 work and the `(staff)` shell.
- STAFF-002 (active orders screen) may need to land first to make order-status updates relevant.

## Acceptance Criteria

- Staff completing an order from the active-orders screen credits 1 star to the customer
- Staff refunding an order decrements `current_stars` (but not `lifetime_stars`) for the customer
- Duplicate completion events (network retry) don't double-credit (proven by existing STAR-001 idempotency — just confirmed it's respected end-to-end)
- Earn is proven by: STAR-001 service tests + a new E2E probe or staff-endpoint integration test

## Blocked By

The staff order-status PATCH endpoint — STAFF-002 or STAFF-003 must build it first.

## Related

- `process/features/staff-dashboard/` — the `(staff)` shell and STAFF-001 authz pattern
- `packages/api/src/lib/star-earning.ts` — the service module with the TODO seams
- `packages/api/src/lib/__tests__/star-earning.integration.test.ts` — 99 passing tests (all hermetic)
