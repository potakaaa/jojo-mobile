---
name: report:closed-branch-order-gate-pvl-iteration-002
description: "PVL cycle 2 — cycle 1's own F1 fix found incomplete; 4th affected test file caught by a differently-shaped sweep"
date: 22-07-26
feature: pickup-branches
metadata:
  node_type: report
  type: pvl-iteration
  cycle: 2
  domain: plan
---

# PVL Iteration 002 — closed-branch-order-gate

**TL;DR:** `Gate: BLOCKED` again. Cycle 1's independent re-sweep found that **cycle 0's F1 fix was
itself incomplete** — a 4th affected test file. F2 re-verified correct and non-vacuous. Fix folded
into the plan; cycle 2 re-run required before EXECUTE is legal.

## The finding

| Item | Result |
|---|---|
| F1 scope as fixed in cycle 0 (3 added files) | Confirmed accurate by direct read — line numbers, helper names, and test names all match. |
| **F1 continuation (NEW this cycle)** | `packages/api/src/routes/__tests__/cart.integration.test.ts` also seeds `opening_hours: '08:00-20:00'` on 2 branches and places 2 real orders through the live `ordersRouter` (`AC8-snapshot`, `AC9`). Both would flip 201→400 once the opening-hours gate lands. One is a snapshot-integrity test of the "HARD, Known-Gap banned" class. |
| **Why cycle 0 missed it** | Cycle 0's sweep matched the literal `.post('/orders')` chain style. This file uses a `req('POST', '/orders', ...)` helper instead. A search-pattern blind spot, not a reasoning error — which is exactly why a second pass with a differently-shaped query caught it. |
| Exhaustive re-sweep | ~15 further `opening_hours: '08:00-20:00'` sites cross-checked against every real `POST /orders` path. All either never place an order or insert directly into `orders`/`order_items`, bypassing the route. **No 5th file exists.** |
| F2 (boundary test) | Re-verified correct. The `<` → `<=` mutation was explicitly traced: only the "at exact closing minute" assertion detects it. Non-vacuous. |
| Line numbers, `OrderError` class, catch handler, 19 call sites, evidence-pack skip | All re-confirmed unchanged by direct read. |

## Cross-plan coordination — recommendation changed

The sibling plan `order-reasons-cart-edit_22-07-26` touches `orders.ts` at L635-701 only; this plan
touches L63 / L131-135 / L563-570. **Zero line or symbol overlap.** Cycle 1 recommends **no hard
serialization** — a re-read-before-edit Execute-Agent Instruction (E1/E2) is sufficient, and forcing
serialization would cost scheduling time for no safety gain. This supersedes the earlier
serialize-EXECUTE recommendation.

## Process note

The validate agent reported that a shell backtick-interpolation bug momentarily corrupted one
paragraph of the plan mid-edit, dropping the `## Public Contracts` section. It was caught
immediately by the structural validator's warning and repaired via a clean file-splice before
finalizing. Recorded here rather than omitted; the final structural validator run is clean
(0 failures, 1 pre-existing unrelated warning). No source code was touched.

## Cycle outcome

Gaps folded into plan text (Touchpoints, Blast Radius, Implementation Checklist step 11 +
renumbering, Test Procedure, Verification Evidence, Phase Completion Rules, and a rewritten cycle-1
`## Validate Contract` carrying `supersedes:`). Next action: re-spawn `vc-validate-agent` from V1
for cycle 2 to confirm the `cart.integration.test.ts` fix AND independently re-check the
"no 5th file" conclusion.
