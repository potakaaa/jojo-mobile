---
name: note:stars-accrual-and-history-display
description: "Backlog — re-add stars to the order-history row once star_transactions is written server-side"
date: 13-07-26
feature: ordering-cart
---

# BACKLOG NOTE — Stars accrual + history-row display (AC7)

**Status:** DEFERRED / Known Gap (from `order-history-reorder-api` EXECUTE, 13-07-26)

## Why deferred

AC7 asks the Order History row to show stars earned (and `0` for cancelled orders). No
server route currently writes `star_transactions` — there is no real accrued value to
display. Per DECISION 3 of the plan, the stars row was **omitted entirely** rather than
faked with an invented formula. No nonzero stars value is ever shown (Agent-Probe
guarantee). This dimension stays **CONDITIONAL** — it is not a silent PASS.

## What to build when picked up

1. **Server accrual first.** Add star-transaction writes at order placement
   (`packages/api/src/routes/orders.ts`) — cancelled orders accrue `0`. This is the real
   blocker; the display is trivial once the data exists.
2. **Expose the value.** Either extend `serializeOrder` (public-API change — re-classify
   risk) or add a dedicated stars/rewards read endpoint. Decide during that plan's PLAN phase.
3. **Re-add the history-row affordance.** Render the stars earned per row in
   `apps/mobile/src/app/(tabs)/order/history.tsx` (a `StarProgressBar`/`Badge` from
   `@jojopotato/ui` — do not hardcode). Cancelled → `0`.
4. **Close the loop.** Flip AC7 from CONDITIONAL to PASS once real accrual + display exist.

## Pointers

- Plan: `process/features/ordering-cart/active/order-history-reorder-api_13-07-26/order-history-reorder-api_PLAN_13-07-26.md` (§Known Gaps #1, DECISION 3)
- Rewards types placeholder: `packages/types/src/rewards.ts`
