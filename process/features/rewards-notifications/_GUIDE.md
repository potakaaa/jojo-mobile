# rewards-notifications

<!-- Part of Jojo Potato -->

## Scope

Loyalty/rewards program and push notifications for the Jojo Potato mobile app. Covers rewards
accrual/redemption and push notification delivery (order status, promotions). No notifications
provider is decided yet (see `process/context/all-context.md`).

## Key Source Files

### Backend (live as of STAR-001, 14-07-26)

- `packages/api/src/lib/star-earning.ts` — `creditStarForCompletedOrder(orderId)` + `reverseStarForRefundedOrder(orderId)` + `isOrderEligibleForStar(order)`. Idempotent via partial unique index on `star_transactions (order_id, type) WHERE order_id IS NOT NULL` + `onConflictDoNothing`. Atomic `db.transaction`: insert ledger row first, bump `user_stars` only when row was actually inserted.
- `packages/api/src/lib/star-earning-config.ts` — `STAR_EARNING_MINIMUM_CENTS = 0` + `getStarEarningMinimumCents()` getter (the ADM-005 seam — swap for a config-table read when ready).
- `packages/api/src/db/schema/star_transactions.ts` — partial unique index added (migration 0005).
- `packages/api/drizzle/0005_nosy_genesis.sql` — migration: `CREATE UNIQUE INDEX star_transactions_order_type_unique ON star_transactions (order_id, type) WHERE order_id IS NOT NULL`.
- `packages/types/src/rewards.ts` — real star model: `StarTransactionType`, `UserStars` (`currentStars`, `lifetimeStars`), `StarTransaction`. No longer a placeholder.
- `packages/api/src/lib/__tests__/star-earning.integration.test.ts` — 10 hermetic vitest tests covering AC1–AC5 + 3 edge cases (idempotent earn, idempotent reversal, reverse-without-earn).

### Mobile (not yet started)

- `apps/mobile/src/app/(tabs)/rewards/` — still `<ComingSoon>` placeholder (STAR-002 scope).

## STAFF-003 Wiring Seam

The star-earning services are **decoupled and unwired**. STAFF-003 must call them when the staff order-status / refund endpoints are built:

```typescript
// In the staff PATCH /orders/:id/status endpoint (mark-completed path):
// TODO(STAFF-003): call creditStarForCompletedOrder(order.id) after status → 'completed'

// In the staff PATCH /orders/:id/status endpoint (refund path):
// TODO(STAFF-003): call reverseStarForRefundedOrder(order.id) after payment_status → 'refunded'
```

Both are in the `star-earning.ts` module header as `TODO(STAFF-003)` comments. These are the only call sites needed — the services handle their own idempotency.

## Known Product Decision (C2 gap)

`lifetime_stars` on refund: PRD §6.10 is silent on whether a refund should decrement `lifetime_stars`. Current implementation: **lifetime stays monotonic** (reversal touches `current_stars` only). EDGE tests lock this behavior. If the product owner decides lifetime should also decrement: one-line change in `reverseStarForRefundedOrder` + one test update.

## Delivery History

| Plan | Status | What it delivered |
|---|---|---|
| `completed/star-001-star-earning_14-07-26/` | VERIFIED (STAR-001) | Idempotent earn + refund-reversal services, migration 0005, real rewards types, 10 integration tests |

## Related Context

- `process/context/all-context.md` — overall repo structure and tech stack
- `process/features/staff-dashboard/_GUIDE.md` — STAFF-003 will own the endpoint wiring that calls these services

## Open Work (not started)

| Task ID | Scope |
|---|---|
| STAR-002 | Mobile rewards screen (star progress display) |
| STAR-003 | Coupon issuance on 5-star threshold |
| STAFF-003 | Staff order-complete/refund endpoints that call `creditStarForCompletedOrder` / `reverseStarForRefundedOrder` |
| ADM-005 | Admin config-table minimum (replace `getStarEarningMinimumCents()` constant with a DB read) |

## Folder Contents

```
process/features/rewards-notifications/
  active/       -- in-progress plans (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans (star-001-star-earning_14-07-26/ is here)
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
