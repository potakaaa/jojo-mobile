---
name: report:closed-branch-order-gate-pvl-iteration-001
description: "PVL cycle 1 — first-pass Gate BLOCKED; fixture-regression blast radius widened from 1 file to 4, boundary test rewritten"
date: 22-07-26
feature: pickup-branches
metadata:
  node_type: report
  type: pvl-iteration
  cycle: 1
  domain: plan
---

# PVL Iteration 001 — closed-branch-order-gate

**TL;DR:** First-pass VALIDATE returned `Gate: BLOCKED` on 1 FAIL + 1 CONCERN. Both were
mechanical and were folded directly into the plan text by the validate agent. Re-running VALIDATE
from V1 to confirm.

## Gap list

| ID | Severity | Gap | Resolution applied |
|---|---|---|---|
| F1 | FAIL (blocking) | The plan's fixture-repair scope was too narrow. It named 5 malformed non-JSON `opening_hours` sites in `orders.test.ts`. A repo-wide cross-reference of every `opening_hours`/`openingHours` fixture against every real `POST /orders` call site found the identical defect in **3 further files**, together carrying 5 currently-green assertions that the new opening-hours check would flip from 201 to 400 — **3 of them "Known-Gap banned" HARD gates**: `admin-deals.integration.test.ts` (AC9 snapshot-integrity, AC10), `admin-products.integration.test.ts` (AC1, 2 cases), `deals-products.test.ts` (deal-at-branch-B placement). | Plan Touchpoints, Implementation Checklist steps 8-12, Test Procedure, and Verification Evidence updated to cover all 4 files. |
| F2 | CONCERN | AC5 requires proving there is **no grace window at the exact closing minute**. The plan's proposed `open === close` always-shut-range fixture proves only that a permanently-shut branch is rejected — an empty range is insensitive to `<` vs `<=`, so the test cannot detect a boundary regression. Additionally `getIsOpenNow` has **zero unit tests anywhere in the repo**. | Boundary test rewritten to pin the exact closing instant, following the existing in-repo pattern at `deal-schedule.test.ts` (exact-instant block for `isDealScheduleLive`). `getIsOpenNow` is TZ-safe by construction (UTC accessors only), so no TZ-pin vacuity risk. |

## Confirmed correct (no change needed)

- Line numbers and edit targets in `orders.ts` (`OrderError` class, `is_accepting_pickup` block, catch handler).
- `@jojopotato/utils` import convention.
- D3 deferral of the reopen-time derivation helper — AC7 does not actually require it.
- The decision to skip the 5-artifact high-risk evidence pack.

## Cycle outcome

Gaps addressed in plan text; no design ambiguity remained, so no INNOVATE/PLAN round-trip was
required. Next action: re-spawn `vc-validate-agent` from V1 against the updated plan.
