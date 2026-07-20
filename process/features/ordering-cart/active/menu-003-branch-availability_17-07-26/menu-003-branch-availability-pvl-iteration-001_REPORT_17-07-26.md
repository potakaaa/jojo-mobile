---
name: menu-003-branch-availability-pvl-iteration-001
description: PVL cycle 1 iteration report — first-pass CONDITIONAL gap set supplemented and closed
date: 2026-07-17
metadata:
  node_type: report
  type: pvl-iteration
  domain: plan
  iteration: 1
  feature: ordering-cart
  plan: process/features/ordering-cart/active/menu-003-branch-availability_17-07-26/menu-003-branch-availability_PLAN_17-07-26.md
---

# PVL Iteration 001 — MENU-003 Branch Availability

## TL;DR

First validate pass returned `Gate: CONDITIONAL` — 0 FAILs, 3 CONCERNs. All 3 are now closed
(1 was already fixed in-plan by vc-validate-agent during its own pass; 2 were closed by this
supplement cycle). Re-validate from V1 pending.

## Loop state

| Field | Value |
|---|---|
| Domain | plan |
| Iteration | 1 |
| Gaps found (validate pass) | 3 |
| FAIL count | 0 |
| CONCERN count | 3 |
| Applied this cycle | 2 |
| Already resolved pre-cycle | 1 |
| Gaps remaining | 0 (pending V1 re-confirm) |
| Cap | 10 cycles (not approached) |
| Plateau | n/a — first cycle |
| Regression | none |

## Gap set and resolution

**Gap 1 — plan-text defect (chronologically impossible checklist step).**
Section 2 step 5 offered "filter productRows BEFORE the productIds derivation" as an option.
Impossible: `availableDealIds` takes `productIds` as input, so the filter can only run after the
`if (isDealMenu && productIds.length)` block. Section 7 step 15's AC4 diff-scope self-check would
also have misfired on the plan's own correct implementation.
*Resolution:* already corrected in-plan by vc-validate-agent during its pass (it flagged this as
exceeding its narrower per-invocation scope; the correction was within standard V6 "Plan Updates
Applied" allowance and was the right call — leaving it would have handed EXECUTE a contradictory
instruction). This cycle verified both corrections are present and mutually consistent. No change
needed.

**Gap 2 — needless type divergence (`DbOrTx` vs the proven `Queryer`).**
The plan invented a new `DbOrTx` type. `packages/api/src/routes/lib/coupon-apply.ts:27` already
carries `type Queryer = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]`, used by
`resolveCouponDiscount`/`buildCartFromItems` and called with `tx` from `orders.ts:351` in
production today. That precedent is also what made a `VC-FEASIBILITY-PROBE-NEEDED` unnecessary for
the db-or-tx claim — the mechanism is shipped, not hypothetical.
*Resolution:* supplement found `Queryer` is currently module-private (declared `type Queryer`, not
exported). Added locked checklist steps 3-4 in Section 1: export `Queryer` from `coupon-apply.ts`,
import and reuse it in the new helper, explicitly banning a parallel `DbOrTx`. `coupon-apply.ts`
added to Touchpoints and Blast Radius accordingly.

**Gap 3 — untested "no bpa row at all" residual.**
Inner-join semantics mean a component with NO `branch_product_availability` row falls into
"unavailable" — correct, and identical to how regular products already behave, but untested and
distinct from a row with `is_available = false`.
*Resolution:* added a Fully-Automated `packages/api` integration test case (branches.test.ts)
covering component-has-no-bpa-row → deal hidden, plus a Verification Evidence row, a Test Tiers
row, a C3 gate row (resolution A, upgraded from D), and a TDD failing stub. Residual closed rather
than carried.

## Invariants re-confirmed intact this cycle

- AC5 (placement rejection) — Fully-Automated, Known-Gap **BANNED**. Money-safety trust boundary.
- Reorder ACs — Fully-Automated (`packages/utils` vitest runner, 35/35 green). `reconcileReorder`
  keeps zero signature change.
- `apps/mobile` screen-render ACs — Agent-Probe, honestly labeled. No RN component/E2E runner
  exists (project-wide gap).
- Multi-deal-line cart batching (E2) — locked with its test case. Predicted failure mode is an
  implementer hardcoding a single-deal assumption.
- AC4 regression lock on the regular non-deal path — intact.
- Production zero-component-deal pre-flight count — still a named, owned gate. Dev verified ZERO
  deals of any kind (live query this session); **production UNVERIFIED**.

## Process note

The INNOVATE phase ran its `vc-predict` 5-persona debate **inline and self-assessed** rather than
spawning independent agents. This PVL pass was therefore the first genuinely independent
adversarial review of the design. It found one real plan defect (Gap 1), which supports treating
the inline self-review as non-substitutable for real fan-out.

## Next

Re-spawn vc-validate-agent from V1 against the supplemented plan. Expected to reach `Gate: PASS`
— all 3 concerns are closed and no FAILs existed at any point. EXECUTE remains gated on explicit
user consent regardless of verdict.
