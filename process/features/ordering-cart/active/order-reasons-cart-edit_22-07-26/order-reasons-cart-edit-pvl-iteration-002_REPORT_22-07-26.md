---
name: report:order-reasons-cart-edit-pvl-iteration-002
description: "PVL cycle 2 — 6 prior fixes confirmed; 3 new gaps incl. reasons never rendered anywhere in the UI"
date: 22-07-26
feature: ordering-cart
metadata:
  node_type: report
  type: pvl-iteration
  cycle: 2
  domain: plan
---

# PVL Iteration 002 — order-reasons-cart-edit

**TL;DR:** `Gate: CONDITIONAL` — 0 FAILs, 3 new CONCERNs, all already folded into the plan text by
the validate pass. All 6 cycle-1 fixes independently re-verified correct against live source with
no regressions. Two of the three new gaps would have caused REQUIRED Agent-Probe criteria to fail
on-device after the work was already called CODE DONE.

## Cycle-1 fixes — all re-verified against live source

| Claim | Verification | Result |
|---|---|---|
| `Order` (`order.ts:30`) vs `ApiOrder` (`serializers.ts:275`) are two files | Read both at exact lines | ✅ |
| `notifyCustomer` (`staff.ts:70`) unexported; use `dispatchOrderNotification` (`notification-dispatch.ts:94`) | Grepped export keywords on both | ✅ |
| `handleAdd`/`isSwitchingBranch`/`clearCart()` at `product/index.tsx:123/138/162` | Grepped exact lines | ✅ exact match |
| Sibling plan touches `orders.ts:126-135` only — no overlap | Read that plan's Verified Facts | ✅ |
| `packages/types` typecheck script exists | Read `package.json:8` | ✅ |
| Migration head `0021_...`; no reason columns exist yet | Listed `drizzle/*.sql`, read schema | ✅ additive confirmed |

Also re-confirmed the cycle-0 "sound, no change needed" set: CAS + ownership-before-status
byte-identical to `/complete`; `order-state-machine.ts` untouched; B4 product-swap prevention
structural; `cart_items` carries no DB unique constraint that could block the merge sequence.

## New gaps found this cycle

| ID | Severity | Gap | Fix |
|---|---|---|---|
| 7 | CONCERN (real defect) | B2's mobile wiring never created a mutation hook to invalidate the staff order-detail query cache. `useStaffOrderDetail` has no polling and no focus-refetch, and the global `staleTime` is 30s — so a successful reject would not visibly update the screen, failing B2.7's on-device requirement. B3 already did this correctly by mirroring `use-complete-order.ts`; B2 had no equivalent. | New checklist step 14 (`use-reject-order.ts`). |
| 8 | CONCERN (real gap) | **No checklist step rendered `reasonCode`/`reasonNote` anywhere in the UI.** Only the wire-level fields existed end to end. SPEC B3.9 ("staff see the order… with the reason… visible") and the B2 flow diagram both imply reason-display UI. The feature would have persisted reasons that no screen ever showed — the user's literal ask was a *reason message*. | New checklist step 13b (renders a reason block on the staff order-detail screen). A genuine SPEC-internal ambiguity (prose vs. flow diagram) was resolved in favour of the narrower, explicitly-locked prose, and recorded as a decision rather than a guess. |
| 9 | CONCERN (mechanical) | Touchpoints listed a comment-only edit to `order-state-machine.ts`, but no checklist step performed it. EXECUTE follows the checklist literally and would have skipped it silently. | New checklist step 2b. |

## Why these were routed to another cycle rather than accepted as known-gaps

Gaps 7 and 8 both touch REQUIRED SPEC acceptance criteria (B2.7, B3.9) and both fixes are cheap.
Accepting them would have meant shipping a plan whose own criteria could not pass on device.

## Cycle outcome

All three fixes are already written into the plan text by this pass, so the next cycle is a
confirmation/consistency check rather than fresh design work. Following the same handling as the
sibling `closed-branch-order-gate` loop, the redundant `vc-plan-agent` supplement spawn is skipped
and `vc-validate-agent` is re-spawned from V1 directly to confirm.
