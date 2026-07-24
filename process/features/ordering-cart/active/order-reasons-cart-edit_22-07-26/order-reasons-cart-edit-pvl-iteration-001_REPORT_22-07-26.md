---
name: report:order-reasons-cart-edit-pvl-iteration-001
description: "PVL cycle 1 — first-pass Gate CONDITIONAL; 6 CONCERNs, two real EXECUTE-breakers plus one cart-wipe risk"
date: 22-07-26
feature: ordering-cart
metadata:
  node_type: report
  type: pvl-iteration
  cycle: 1
  domain: plan
---

# PVL Iteration 001 — order-reasons-cart-edit

**TL;DR:** First-pass VALIDATE returned `Gate: CONDITIONAL` — 0 FAILs, 6 CONCERNs, all one-line
instruction fixes. Two were verified-by-read defects that would have broken EXECUTE outright; one
was a data-loss risk nobody had flagged. Routed to `vc-plan-agent` in PVL-supplement mode.

## Gap list

| ID | Severity | Gap | Fix requested |
|---|---|---|---|
| 1 | CONCERN (real defect) | Checklist step 5 treats `Order` and `ApiOrder` as one type in one file. `Order` is `packages/types/src/order.ts:30` (client); `ApiOrder` is locally declared at `packages/api/src/routes/lib/serializers.ts:275` per this repo's deliberate no-cross-dependency wire-type convention. `serializeOrder()` (`serializers.ts:451`) returns an object literal, so adding fields without widening `ApiOrder` fails TS excess-property checking. | Split into two explicit sub-steps naming both files and both interfaces. |
| 2 | CONCERN (real defect) | Checklist step 10 tells `orders.ts` to call `notifyCustomer(...)`. That function is a bare NON-exported module-private function in `staff.ts:70-75` — not importable from `orders.ts`. It wraps the exported `dispatchOrderNotification` (`notification-dispatch.ts:94`). | Correct call target to `dispatchOrderNotification(updatedOrder, 'cancelled')` with the right import. `'cancelled'` already exists on `OrderNotificationEvent`; no type widening needed. |
| 3 | CONCERN (data-loss risk) | Checklist step 18 says only "on Save, if `lineId` present, call `editCartLine`". It does not address that `handleAdd()` in `product/index.tsx` carries branch-switch-confirm logic that calls `clearCart()`. An edited line is by construction already in the current branch, so naive reuse risks a nonsensical branch-switch prompt or a cart wipe during what the user believes is a single-line edit. | Require a DISTINCT edit-save handler that skips the `isSwitchingBranch`/`setPendingSwitch`/`clearCart` branch, plus an AC-level note that editing a line must never clear the cart. |
| 4 | CONCERN | Evidence-pack scope named only B2+B3's new routes, omitting the 2-line `reason_actor='staff'` stamp on the EXISTING generic staff PATCH — a live trust-boundary route being modified. | Widen the scope sentence to include it. |
| 5 | CONCERN | Sibling active plan `closed-branch-order-gate_22-07-26` also edits `packages/api/src/routes/orders.ts` (its edits ~lines 126-135; this plan's near 635+). No line overlap, but same-file parallel-EXECUTE risk. | Add a coordination note: serialize EXECUTE, or require re-read-before-edit if parallel. |
| 6 | CONCERN | Verification sequence hedges `pnpm --filter @jojopotato/types typecheck` with "if a typecheck script exists". It exists (`packages/types/package.json:8`). | State unconditionally. |

## Confirmed sound (no change needed)

- CAS transaction, ownership-before-status ordering, and no-caller-supplied-status body all
  byte-verified identical to the live `PATCH /orders/:orderId/complete` precedent
  (`orders.ts:635-714`).
- B3's `pending`-only narrowing is a route-level gate, not a weakening of the shared state machine
  — `order-state-machine.ts` untouched, `accepted→cancelled` still legal for staff.
- B4 product-swap prevention is structural: the server reads the line's own `product_id` from
  `requireOwnedLine`'s returned row, and no `productId` field exists in the extended body.
- The `reason_actor` SPEC-scope reading held up under adversarial re-check.
- Migration head `0021_...` re-confirmed on disk; the plan's `0022_*` claim is correct.
- Test tier assignments match `all-tests.md` and the SPEC's locked rule.

## Execution note

The validate agent had no subagent-spawn tool available and ran the two-layer fan-out as a single
sequential deep-review pass (direct `Read`/`Grep` verification of every touchpoint) rather than the
parallel strategy the 5/7 signal score would normally call for. It flagged this transparently
rather than substituting silently. Coverage appears complete on the evidence returned, but this is
recorded as a deviation from the recommended strategy.

## Cycle outcome

Routed to `vc-plan-agent` (PVL-supplement mode) with the 6-gap SUPPLEMENT REQUEST. On
`SUPPLEMENT_APPLIED`, re-spawn `vc-validate-agent` from V1.
