---
name: report:receipt-stage-token-prune-note
description: "Backlog: receipt-stage DeviceNotRegistered detection via getPushNotificationReceiptsAsync — deferred receipt-polling follow-up to real-push-delivery's ticket-level pruning (Open Design Decision 2)"
date: 15-07-26
metadata:
  node_type: memory
  type: report
  feature: rewards-notifications
  phase: real-push-delivery
---

# Backlog — Receipt-Stage Token Pruning (`getPushNotificationReceiptsAsync`)

**Status:** deferred (accepted Known-Gap, not a defect). Revisit once real push send volume
exists to justify the added scheduler + persistence complexity.

## What's deferred

The `real-push-delivery_15-07-26` pass prunes a dead `device_tokens` row when Expo reports a
`DeviceNotRegistered` error **at the ticket stage** — i.e. synchronously in the
`sendPushNotificationsAsync` response. That is the code path proven by `push-provider.test.ts`.

Expo's fully-correct long-term mechanism is a **two-phase** flow:
1. `sendPushNotificationsAsync` returns tickets immediately (each with a receipt id).
2. The caller polls `getPushNotificationReceiptsAsync` ~15+ minutes later for the delivery
   receipt that actually carries most `DeviceNotRegistered` errors.

Most `DeviceNotRegistered` failures manifest at the **receipt** stage, not the ticket stage. So a
token that fails only at the receipt stage is **NOT pruned** by the current pass.

## Why it was deferred (Open Design Decision 2, from the plan)

- Receipt polling needs **persistent ticket storage** + a **scheduler-driven delayed check** —
  materially larger scope than this SPEC's AC-3, which describes a synchronous same-call assertion.
- The current ticket-level detection is entirely provable today with `EXPO_ACCESS_TOKEN` unset
  and no new persistence layer.
- Building the delayed poll before any real send volume exists would be speculative — we don't yet
  know which error class (ticket vs receipt) dominates in production.

## Resolution when picked up

- Add receipt polling via the existing `packages/api/src/lib/scheduler.ts` substrate (from
  PUSH-004): persist `{ ticketId, pushToken }` on send, schedule a delayed
  `getPushNotificationReceiptsAsync` pass, and route `DeviceNotRegistered` receipt errors through
  the SAME `PERMANENT_PUSH_ERROR_CODES` / prune helper already in `notification-dispatch.ts`.
- The pruning classifier (`isPermanentPushError`) and the delete-by-`push_token` helper are
  already shared and reusable — this follow-up only adds the delayed *detection*, not new prune
  logic.

## Pointers

- Plan: `process/features/rewards-notifications/active/real-push-delivery_15-07-26/real-push-delivery_PLAN_15-07-26.md`
  (Open Design Decision 2, Missing Test Areas, Test Infra Improvement Notes).
- Ticket-level classifier lives in `packages/api/src/lib/push-provider.ts`
  (`PERMANENT_PUSH_ERROR_CODES`, `isPermanentPushError`).
- Prune helper lives in `packages/api/src/routes/lib/notification-dispatch.ts` (`sendAndPrune`).
