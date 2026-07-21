---
name: spec:customer-mark-picked-up
description: "Customer self-confirms pickup from the order-tracking screen — requirements lock"
date: 21-07-26
feature: ordering-cart
---

# SPEC — Customer "Mark as picked up"

## Goal

A customer whose order is `ready` can confirm pickup themselves from the order-tracking
screen. The order becomes `completed`, the Jojo Star for that order credits, and live
polling stops — without requiring a staff member to press anything.

## Use Cases

| # | Scenario | Expected |
|---|---|---|
| U1 | Order status is `ready`; customer opens tracking | "Mark as picked up" button visible |
| U2 | Customer taps the button | Confirm dialog appears; nothing is sent until confirmed |
| U3 | Customer confirms | `PATCH /orders/:orderId/complete` → 200; status `completed`; star credited once; polling stops (terminal) |
| U4 | Order status is anything other than `ready` | Button not rendered |
| U5 | Staff already completed the order; customer's stale screen still shows the button | Server returns 409; screen refreshes to the true state; no second star |
| U6 | User B sends the request for user A's order | 403; order unchanged |

## Acceptance Criteria

| ID | Criterion |
|---|---|
| AC1 | `PATCH /orders/:orderId/complete` transitions a `ready` order owned by the caller to `completed` and sets `completed_at` |
| AC2 | A user cannot complete an order they do not own → 403, order unchanged |
| AC3 | Completion from any non-`ready` status (`pending`, `accepted`, `preparing`, `flavoring`, `completed`, `cancelled`, `rejected`) → 409, order unchanged |
| AC4 | Exactly one star is credited on customer self-completion |
| AC5 | A repeat call, or a subsequent staff completion attempt, never credits a second star |
| AC6 | A concurrent transition that lands first causes the loser to receive 409 (compare-and-swap), never a silent overwrite |
| AC7 | Non-existent / malformed order id → 404 (matching `GET /orders/:orderId`, not 400) |
| AC8 | The request body carries no `status` field — the route cannot express any other target status |
| AC9 | The button renders only when `order.status === 'ready'` |
| AC10 | Tapping shows a confirm dialog; dismissing it sends nothing |
| AC11 | On success the tracking screen reflects `completed` and stops polling (on-device) |

## Out of Scope

- Any change to the staff route, the staff button, or the staff confirm behaviour
- Refund / star reversal paths
- A push notification on completion — `OrderNotificationEvent` has no `completed` member, so this path is structurally excluded and stays that way
- Any customer route that accepts a caller-supplied target status
- Extracting a shared `applyOrderStatusTransition()` helper

## Constraints

- `ready` is the ONLY accepted source status. Everything else is 409.
- Ownership is enforced via `orders.user_id`, following the `GET /orders/:orderId` precedent exactly.
- `apps/mobile/src/features/orders/hooks/use-order-query.ts`'s three LIVE-001 E4 options
  (`staleTime: 0`, `refetchIntervalInBackground: false`, terminal-returning `refetchInterval`)
  MUST NOT be edited.
- `ready → completed` is already legal in the state machine — no state-machine change is permitted.
