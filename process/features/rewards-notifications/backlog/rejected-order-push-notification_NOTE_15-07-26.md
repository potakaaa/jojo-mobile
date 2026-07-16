---
name: report:rejected-order-push-notification-note
description: "Backlog: extend order-status push notifications to fire on the `rejected` transition — surfaced during the development-branch merge where dev intended notifyCustomer(order, 'rejected') but OrderNotificationEvent only supports accepted/preparing/ready/cancelled"
date: 15-07-26
metadata:
  node_type: memory
  type: report
  feature: rewards-notifications
  phase: push-notifications-merge
---

# Backlog — Push Notification on Order `rejected`

**Status:** deferred (out of scope for the merge-conflict resolution that surfaced it — not a
defect). Extending it is a real feature increment requiring product/design decisions.

## What's deferred

During the `feat/push-notifications-api` ← `origin/development` merge, development's side of the
`PATCH /api/staff/orders/:orderId` handler (`packages/api/src/routes/staff.ts`) contained a call
`notifyCustomer(updatedOrder, 'rejected')` intended to send the customer a push notification when
staff reject an order.

That call was **dropped** during conflict resolution because it does not type-check against the
current notification contract: `OrderNotificationEvent` in
`packages/api/src/routes/lib/notification-dispatch.ts` only supports:

```
'accepted' | 'preparing' | 'ready' | 'cancelled'
```

`'rejected'` (like `'completed'`) is deliberately NOT a valid event today. The merged handler fires
push notifications for exactly those 4 transactional events; star credit for `completed` happens
atomically inside the status-flip transaction (no push).

## Why it was deferred

- Adding `'rejected'` is a real feature increment, not a merge reconciliation: it needs a new event
  type in `OrderNotificationEvent`, a new `EVENT_TO_TYPE` mapping entry, new customer-facing copy in
  `ORDER_COPY`, and dispatch-agent test coverage — plus a product/UX decision on the notification
  wording for a rejection.
- Resolving a merge conflict is not the place to make that product call; doing so silently would
  extend the feature's scope beyond the merge.

## Resolution when picked up

1. Add `'rejected'` to `OrderNotificationEvent` in `notification-dispatch.ts`.
2. Add its `EVENT_TO_TYPE` mapping and `ORDER_COPY` title/body (product-approved wording).
3. Re-add the `else if (targetStatus === 'rejected') { await notifyCustomer(updatedOrder, 'rejected'); }`
   branch in `staff.ts`'s status handler.
4. Add dispatch/notification test coverage for the rejected event.
