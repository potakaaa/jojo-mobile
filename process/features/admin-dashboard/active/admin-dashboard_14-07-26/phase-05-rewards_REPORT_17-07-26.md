---
phase: phase-05-rewards
date: 2026-07-17
status: COMPLETE_WITH_GAPS
feature: admin-dashboard
plan: process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-05-rewards_PLAN_14-07-26.md
---

# Phase 5 — Rewards Configuration CRUD (ADM-005, #43) — EXECUTE/EVL Report

Branch: `feat/adm-005-rewards`. Commits: `7a198b9` (feat — rewards CRUD + free_upgrade money
path), `c847eb0` (docs — plan update, pre-EXECUTE). Status: CODE-COMPLETE, EVL-green,
`## Known Gap: G10` owed (user-run), not yet merged.

## What Was Done

- `packages/api/src/routes/admin/rewards.ts` (new) — `GET` list-all / `GET :id` / `POST` /
  `PATCH`. `isActive: false` PATCH is the only deactivation path (no hard `DELETE`, matching
  the `offers.ts` D3 precedent). D4 type-conditional cross-field validation via Zod
  `.superRefine` on the merged PATCH state (mirrors `offers.ts`'s `mechanicBenefitError`
  pattern): `reward_type ∈ {free_item, free_upgrade}` requires `eligibleProductId` and
  forbids `rewardValueCents`; discount types require `rewardValueCents` and forbid
  `eligibleProductId`. `assertProductExists` rejects a nonexistent, inactive, or
  `is_deal=true` product (Execute-Agent Instruction E3 applied — an unredeemable-in-cart
  product can never be a valid reward target).
- Appended to the existing append-only `/api/admin` aggregator
  (`adminRouter.use('/rewards', rewardsRouter)`) — the 5th confirmed consumer of the same
  pattern used by branches/products-categories/deals/promotions-offers-coupons. `requireAdmin`
  + `adminCors` inherited automatically, zero new mount.
- `packages/types/src/rewards.ts` — `REWARD_TYPES` const + `RewardType` type, now
  `['free_item', 'fixed_discount', 'percentage_discount', 'free_upgrade']` (D2).
- `packages/api/src/routes/lib/serializers.ts` — additive `AdminReward extends ApiReward` +
  `serializeAdminReward` (local-declaration convention, matches `AdminBranch`/`AdminOffer`);
  public `ApiReward`/`serializeReward` left untouched (wire-frozen). `rewardDiscountLabel`
  gained a `case 'free_upgrade':` arm (previously fell through to `default`).
- **Money path (D2/free_upgrade, HARD, Known-Gap banned):** `packages/api/src/routes/lib/
  coupon-apply.ts`'s `resolveCouponDiscount` reward-coupon branch now SELECTs
  `rewards.reward_type` alongside `eligible_product_id` and dispatches: `free_item` →
  `computeRewardDiscountCents` (unchanged); `free_upgrade` → `computeFreeUpgradeDiscountCents`
  (offer-side helper, `packages/utils/src/discount.ts`, signature-identical
  `(productId, cart) => cents`, reused verbatim per Execute-Agent Instruction E1 — no
  adapter). A computed `<= 0` result on the `free_upgrade` branch is REJECTED with a 400 and
  the coupon is left `available` (unburned) — closes a latent ₱0-burn class of bug on the
  reward path (the offer-side equivalent already had this guard; the reward side did not,
  until this phase).
- `apps/admin/src/features/rewards/**` (new): `lib/admin-rewards-api.ts`, `hooks/
  use-admin-rewards.ts`, `components/{reward-list,reward-form}.tsx` (+ their `.test.tsx`
  siblings). Routes: `(dashboard)/rewards.tsx` (thin `<Outlet/>` layout) +
  `(dashboard)/rewards.index.tsx` (list) — the Phase 3 nested-detail-route `<Outlet/>`
  precedent applied proactively (no repeat of the P3 bug). `nav-config.ts` gained a new,
  non-disabled `NavItem` under Management (Execute-Agent Instruction E4 — no prior disabled
  placeholder existed to "enable").
- Tests: `admin-rewards.integration.test.ts` (19 new — G1-G8 CRUD/retroactivity/RBAC/
  validation), `coupons.integration.test.ts` (+2 — G13a/b free_upgrade waive + reject-unburned,
  placed adjacent to the existing offer-side free_upgrade cases per Execute-Agent Instruction
  E2), `reward-list.test.tsx` (5), `reward-form.test.tsx` (4).

## What Was Skipped / Deferred

- G10 (Agent-Probe full-flow admin UI walkthrough: list→create→edit→deactivate→verify mobile
  Rewards screen) — user-run, no `apps/admin` browser/E2E runner exists (standing
  project-wide gap, same precedent as every prior phase in this program: P1 AC8, P2 AC7,
  P3 AC8, 4a AC12, Phase-4 E1 AC-E6). Not new debt. → backlog: covered by the existing
  standing note in `process/context/tests/all-tests.md`; no new backlog artifact created
  (matches the validate-contract's own "Backlog artifacts to create" = none).
- Branch merge into `development` — deliberately not done in this UPDATE PROCESS pass
  (doc-only reconciliation scope; merge is a separate user-owned action).

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| G1-G8, G13 (`packages/api`) | `pnpm --filter @jojopotato/api test` | 448/448 green |
| G9 (`apps/admin` component) | `pnpm --filter @jojopotato/admin test` | 58/58 green |
| G11 (regression) | same full API run above | no drop vs. pre-phase baseline (427, per E5) |
| G12 (structural) | `pnpm --filter @jojopotato/api typecheck && pnpm --filter @jojopotato/admin typecheck && pnpm --filter @jojopotato/admin build` | clean, 0 errors |
| Format | `pnpm format:check` | clean |
| G10 | manual admin UI walkthrough | owed — user-run |

EVL (this UPDATE PROCESS pass) independently re-confirmed the above — execute-agent's own
green report was not taken on faith; the orchestrator-owned confirmation run reproduced the
same 448/448 + 58/58 + clean-typecheck/build/format result.

## Plan Deviations

Three deviations, all within the plan's own blast radius, none hard-stop:

1. **Reward-side zero-guard reason code is `no_upgrade_to_waive`**, not the offer-side
   `no_eligible_product` string the plan's checklist item 3b bullet cited by analogy.
   Semantically more precise for the reward context (there is no "offer" being applied).
   Money behavior is identical to the plan's intent — 400, coupon unburned — and is proven
   by gate G13b. Not a defect; a naming refinement made during EXECUTE.
2. **No new `packages/utils/discount.test.ts` unit tests were added.** The validate-contract
   explicitly states this is correct, not a gap: `computeFreeUpgradeDiscountCents` is reused
   verbatim (zero new logic in `packages/utils`) and is already covered by the existing 35/35
   passing exact-cents unit suite from ADM-008 Fix 6. The new reward-side *dispatch wiring* in
   `coupon-apply.ts` is what needed proof, and that is exactly what gate G13's integration
   tests provide. Matches the contract's own "Section E feasibility" finding, not a deviation
   from intent.
3. **Execute-agent added `!build` to `.claude/.vcignore`** to unblock the `apps/admin` build
   gate, per the scout-block hook's own instruction at the time. This is a benign harness
   allowance (unignores the build artifact path for scanning purposes) with zero source-code
   impact — noted here for completeness, not because it affects the plan's behavior claims.

## Test Infra Gaps Found

None new this phase. G10's Agent-Probe residual is the same standing project-wide gap tracked
in `process/context/tests/all-tests.md` (no `apps/admin` browser/E2E runner) — not a new gap
introduced here.

## SPEC Achievement

This phase has no dedicated `*_SPEC_*.md` — it is governed by the admin-dashboard umbrella
program's SPEC/charter (phase-program inner loop skips per-phase SPEC). Scoring against the
phase plan's own AC1-AC7 (as the closest equivalent to acceptance criteria):

| AC | Criterion | Status | Proving gate |
|---|---|---|---|
| AC1 | STAR-002 live-pickup, no cache | met | G4 |
| AC2a/b | Retroactivity — `star_transactions`/issued coupons never mutated by admin edits | met | G1, G2 |
| AC3 | Deactivation stops new unlocks; pre-issued coupons survive + still redeem | met | G3 |
| AC4 | Multi-tier (battle-pass) determinism | met | G5 |
| AC5 | CRUD round-trips; no hard DELETE; validation rejection | met | G6, G7 |
| AC6 | `requireAdmin` guard on every route | met | G8 |
| AC7 | Admin UI renders + full-flow walkthrough | partially met — component render (G9) met; full-flow Agent-Probe (G10) unmet, owed |

No unmet HARD criterion. AC7's G10 residual is the standing project-wide Agent-Probe gap, not
a new backlog item (already tracked).

## Closeout Packet

1. **Selected plan path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-05-rewards_PLAN_14-07-26.md`
2. **Closeout classification:** Keep in active/testing — CODE-COMPLETE + EVL-green, but G10
   (user-run manual walkthrough) and the branch merge are still pending. Not archived.
3. **What was finished:** see "What Was Done" above.
4. **Verified vs unverified:** Fully-Automated gates G1-G9, G11-G13 all independently
   EVL-confirmed green. G10 (full-flow browser walkthrough) unverified — awaiting user.
4b. **Validate-contract compliance:** present, inline in plan, Gate: PASS (17-07-26,
   `generated-by: inner-pvl: phase-5`).
5. **Cleanup done vs still needed:** this pass — phase report written, Phase Loop Progress
   Steps 5/6 ticked, umbrella `## Current Execution State` + Phase Ordering/Program Status
   tables reconciled, `process/context/all-context.md` updated. Still needed: G10 walkthrough,
   branch merge, then archive this task folder's phase-05 artifacts (plan stays with the
   shared `admin-dashboard_14-07-26/` folder regardless, since P6/P7 are also there).
6. **Next valid state:** Keep the plan active; user runs G10 walkthrough and merges the
   branch; then a follow-up UPDATE PROCESS pass stamps Phase 5 ✅ VERIFIED at the umbrella
   level and unparks Phase 6 (D8) per its own locked sequencing gate.
7. **Commit checkpoint:** Execution commit already made (`7a198b9`, `c847eb0`) — this pass is
   process-only (plan/report/context edits). Recommend a separate `process(...)` commit for
   this pass's doc changes; do not fold into the execution commit.
8. **Regression status:** G11 (full `packages/api` suite, 448/448) and G12 (both typechecks +
   admin build) both re-run and green — no regression against Phases 0-4a/ADM-008/Fix-6
   surfaces.
9. **SPEC achievement:** see table above — no HARD unmet criteria; AC7/G10 is a standing,
   already-tracked residual.

Drift score: MEDIUM (3 signals: 3 memory-worthy observations/decisions this pass — D1-D4 lock,
3 execution deviations, umbrella staleness reconciled; feature-folder plan reconciliation
across 3 phase plans; no `.claude/`/`.codex`/protocol-doc edits). Recommend UPDATE PROCESS --
significant changes detected. (This pass IS that UPDATE PROCESS.)
