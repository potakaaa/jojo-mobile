---
name: note:confirm-dialog-followups
description: "Deferred/residual ConfirmDialog follow-ups from the kid-friendly UI Phase A (staff order-detail confirm; cart replace-discount reachability)"
date: 16-07-26
metadata:
  node_type: memory
  type: note
  feature: general
---

# Backlog: ConfirmDialog follow-ups (from kid-friendly UI Phase A)

Source: `process/general-plans/active/kid-friendly-ui-deals-unification_16-07-26/` Phase A.
The shared `ConfirmDialog` (`@jojopotato/ui`) shipped in Phase A. Two items were deliberately
left out of Phase A scope and are tracked here so they are not silently dropped.

## 1. Staff order-detail destructive confirm — DEFERRED (scope lock item 3)

`apps/mobile/src/app/(staff)/order-detail/[orderId].tsx:78` still uses a raw `Alert.alert()`
2-button confirm for a staff order-status action. Phase A explicitly deferred all `(staff)`
screens (staff are not the "kid" audience; mirrors the order-detail deferral in the plan).
Follow-up: migrate this call site to `ConfirmDialog` when a staff-UX pass is scheduled. No
behavior change intended — same confirm/cancel handlers.

## 2. Cart "Replace applied discount?" confirm — reachability residual

`apps/mobile/src/app/(tabs)/order/cart.tsx` `handleApplyCoupon` was migrated from
`Alert.alert('Replace applied discount?', ...)` to a `ConfirmDialog` (state:
`pendingReplaceCode`). This path is currently **UI-unreachable** in the cart layout: the coupon
Input + "Apply" button render only when `cart.appliedDiscount` is falsy, and the replace branch
requires `cart.appliedDiscount` to be truthy at apply time — the two are mutually exclusive, so
the Apply button is hidden exactly when the replace confirm could fire. This is a pre-existing
condition, not introduced by Phase A.

Consequence: the replace confirm could not be exercised by an honest integration render test, so
it has no dedicated per-screen jest gate (unlike the reachable cart "Change branch?" confirm and
the product "Switch branch?" confirm, both fully tested). Its confirm/cancel semantics are
identical to the component-level `ConfirmDialog` contract, which IS covered by
`packages/ui/src/components/__tests__/confirm-dialog.test.tsx`.

Follow-up options (either is acceptable; not urgent): (a) surface a "replace/apply another code"
affordance while a discount is applied so the path becomes reachable and testable, or (b) if the
path is confirmed permanently dead, remove the `pendingReplaceCode` branch. Decide during a
future cart/deals UX pass; do not change cart flow behavior speculatively.
