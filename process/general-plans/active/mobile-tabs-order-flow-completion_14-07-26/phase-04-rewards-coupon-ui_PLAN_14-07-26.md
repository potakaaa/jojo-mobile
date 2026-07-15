---
name: plan:mobile-tabs-order-flow-completion-phase-04-rewards-coupon-ui
description: "Mobile Tabs + Order-Flow Completion — Phase 04: real Rewards tab (balance/tier/redeem) + coupon wallet UI"
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: mobile-tabs-order-flow-completion
  phase: phase-04
---

# Phase 04 — Rewards Tab + Coupon Wallet UI

**Program:** mobile-tabs-order-flow-completion
**Umbrella plan:** process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/mobile-tabs-order-flow-completion-umbrella_PLAN_14-07-26.md
**Date**: 14-07-26
**Status**: ⏳ PLANNED
**Complexity**: COMPLEX (phase of a COMPLEX phase program)
**Report destination:** process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-04-rewards-coupon-ui_REPORT_14-07-26.md

## Overview / Context

TL;DR: Replace the `<ComingSoon>` Rewards tab (`(tabs)/rewards/index.tsx`, 23 ln) and `coupons.tsx` with real screens: star balance + tier progress + redeemable rewards catalog + redeem action (Phase 1 API), and a coupon wallet listing real coupons with redeem (Phase 2 API). Reuse `RewardProgressCard`, `StarProgressBar`, `CouponCard`, `EmptyState` from `@jojopotato/ui`. Read `process/context/all-context.md` first. Prioritize user friendliness — clear redeem confirmation, optimistic-yet-safe feedback, friendly empty/error states.

## Phase Completion Rules

This phase is VERIFIED only when: all checklist items checked; the phase validate-contract exists with green gates; regression checks against overlapping earlier phases pass; and the phase report is written. Code-only completion is CODE DONE, never VERIFIED. Mobile-screen behavior with no automated runner is proven by Agent-Probe and recorded as Known-Gap. Post-phase testing uses the Exit Gate test gates (see process/context/tests/all-tests.md).

## Acceptance Criteria

- AC1: Rewards tab shows real balance/tier/catalog with redeem (Agent-Probe).
- AC2: coupon wallet lists + redeems real coupons (Agent-Probe).
- AC3: affordability/eligibility pure logic unit-tested (Fully-Automated); typecheck+lint green.

## Entry Gate

- Phase 1 exit gate passed (rewards balance/catalog/redeem routes).
- Phase 2 exit gate passed (coupons list/redeem routes).

## Blast Radius

- `apps/mobile/src/app/(tabs)/rewards/index.tsx` — real Rewards screen (replace ComingSoon).
- `apps/mobile/src/app/(tabs)/rewards/coupons.tsx` — real coupon wallet screen (replace ComingSoon).
- `apps/mobile/src/features/rewards/hooks/{use-rewards-summary,use-rewards-catalog,use-redeem-reward}.ts` — NEW react-query hooks.
- `apps/mobile/src/features/coupons/hooks/{use-coupons,use-redeem-coupon}.ts` — NEW react-query hooks.
- `packages/ui/src/components/{reward-progress-card,star-progress-bar,coupon-card}.tsx` — **CONDITIONAL FINDING, was "additive only" — corrected by VALIDATE:** these 3 components are hard-typed to the pre-reconciliation placeholder shapes (`RewardsAccount.{points,tier}`, `RewardsTierProgress.{currentPoints,pointsToNextTier,nextTier}`, `Coupon.{title,discountLabel,isRedeemed}`) that Phase 1 replaces. Phase 4 must NOT assume drop-in reuse — see Execute-Agent Instructions below. `packages/ui/src/components/empty-state.tsx` remains genuinely additive-only (no rewards/coupons type coupling).
- Remove the `rewards/index.tsx` `Dev: View Coupons` dev link (tracked debt: `process/general-plans/backlog/mobile-dev-nav-links-gating_NOTE_09-07-26.md`).

## Implementation Checklist

### Step A — Rewards screen

- [ ] A1. `useRewardsSummary()` + `useRewardsCatalog()` hooks (react-query, cents/units-native).
- [ ] A2. Render balance + tier progress (reuse `RewardProgressCard`/`StarProgressBar`) and the redeemable rewards catalog.
- [ ] A3. `useRedeemReward()` mutation → `POST /rewards/:id/redeem`; on success invalidate summary + coupons caches. Confirm-before-redeem dialog. Disable/gray rewards the user cannot afford, with a clear "need N more stars" message.
- [ ] A4. Friendly loading skeleton + empty (no rewards) + error-with-retry states.

### Step B — Coupon wallet

- [ ] B1. `useCoupons()` hook → `GET /coupons` (optional status filter tabs: Available / Used / Expired).
- [ ] B2. Render coupons with `CouponCard`; empty state via `EmptyState`.
- [ ] B3. `useRedeemCoupon()` mutation → `POST /coupons/:id/redeem`; confirm dialog; on success invalidate coupons cache; friendly 409 (already used/expired) inline message.

### Step C — Wiring + cleanup

- [ ] C1. Ensure Rewards tab nav (index ↔ coupons) works; remove the `Dev: View Coupons` dev link.
- [ ] C2. Extract any pure logic (affordability check, tier-progress math if not already in Phase 1 types) so it is vitest-coverable.

## Exit Gate

```bash
pnpm --filter @jojopotato/mobile typecheck && pnpm lint
# Expected: exit 0

pnpm --filter @jojopotato/mobile test
# Expected: 0 failures (pure redeem-eligibility/affordability unit tests green)
```

- All checklist items checked.
- Agent-Probe: redeem-reward → coupon appears in wallet → redeem coupon round-trip works; friendly states throughout.
- Phase report written to report destination above.

## Blockers That Would Justify BLOCKED Status

- Phase 1 or Phase 2 routes not available (entry gate not met).
- A required redeem/coupon card variant needs a `packages/ui` component that expands into a design task beyond scope (route to Phase 6 or follow-up).

## Phase Loop Progress

- [ ] 1. RESEARCH — research-agent: prior phase reports read; test context loaded; UI component reuse mapped; plan drift checked
- [ ] 2. INNOVATE — innovate-agent: redeem UX approach decided; Decision Summary written
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: phase plan updated (or "n/a — research clean")
- [ ] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per example-validate-output.md
- [ ] 5. EXECUTE — all checklist items done; per-section test gates green
- [ ] 6. EVL — all EVL gates green; follow-up stubs registered; EVL HANDOFF SUMMARY written
- [ ] 7. UPDATE PROCESS — phase report written, umbrella state updated, commit done

**Validate-contract required before execute.**

## Touchpoints

- `apps/mobile/src/app/(tabs)/rewards/index.tsx`, `.../rewards/coupons.tsx`
- `apps/mobile/src/features/rewards/hooks/*`, `apps/mobile/src/features/coupons/hooks/*`
- `packages/ui/src/components/{reward-progress-card,star-progress-bar,coupon-card,empty-state}.tsx`

## Public Contracts

- No API changes — consumes Phase 1 + Phase 2 routes.
- Rewards tab navigation (index ↔ coupons) preserved; dev link removed.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Redeem-eligibility/affordability pure logic (unit test) | Fully-Automated | AC-2 (redeem gating) |
| typecheck + lint green | Fully-Automated | AC-5 |
| `packages/ui` reward/coupon component regression (`reward-progress-card.test.tsx`, `star-progress-bar.test.tsx`, `coupon-card.test.tsx`) | Fully-Automated | AC-1, AC-2 (reused components still render post-Phase-1-reconciliation) |
| Rewards tab shows real balance/tier/catalog; redeem → coupon; wallet lists + redeems coupon; friendly states (walkthrough) | Agent-Probe (Known-Gap for automation) | AC-2, AC-3, AC-5, AC-7 |

```bash
pnpm --filter @jojopotato/mobile test
# Expected: 0 failures
```

## Test Infra Improvement Notes

- Rewards/wallet screen render is Agent-Probe only (no RN runner). Affordability + tier-progress logic extracted to pure TS to keep it Fully-Automated.
- `packages/ui`'s existing `reward-progress-card.test.tsx`/`star-progress-bar.test.tsx`/`coupon-card.test.tsx` are currently smoke tests against the pre-reconciliation mock shapes (`MOCK_COUPON`, etc. in `packages/ui/src/components/__tests__/mocks.ts`) — Phase 1 must update these fixtures/tests when it reconciles `packages/types/src/{rewards,coupons}.ts`; Phase 4 must re-run `pnpm --filter @jojopotato/ui test` as a regression check, not assume it is still green untouched.

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-04-rewards-coupon-ui_PLAN_14-07-26.md`
- Last completed step: not started
- Validate-contract status: written (CONDITIONAL) — see below
- Supporting context: Phase 1 + Phase 2 reports (route contracts), `packages/ui/src/index.ts` (available components).
- Next step: Spawn vc-research-agent for RESEARCH (Step 1) — map existing UI components to the two screens, and confirm (as part of RESEARCH, not assumption) whether Phase 1 has landed and updated `RewardProgressCard`/`StarProgressBar`/`CouponCard` prop shapes before Phase 4 EXECUTE begins.

## Validate Contract

Status: CONDITIONAL
Date: 14-07-26
date: 2026-07-14
generated-by: outer-pvl

Parallel strategy: sequential (executed as a single-pass synthesis — this validate-agent invocation had no Agent/Task tool grant for nested fan-out spawn in this session; Layer 1 + Layer 2 analysis performed directly via file/plan inspection in one context)
Rationale: Signal score if fanned out would be ~2/7 (S6 high-risk money-adjacent class present via rewards/coupon consumption; S7 5+ blast-radius files present) → MEDIUM → parallel-subagents (4 Layer-1 + 3 Layer-2 ≈ 7 agents) would have been the recommendation had spawn tooling been available; the single-pass synthesis below covers the same 4+3 dimensions/sections.

Test gates (5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC3 | Redeem-eligibility / affordability pure logic (can-afford check against current vs required stars) | Fully-Automated | `pnpm --filter @jojopotato/mobile test` — new `apps/mobile/src/features/rewards/__tests__/redeem-eligibility.test.ts` | B |
| AC3/AC5 | Mobile app typecheck + lint stay green with new hooks/screens | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck && pnpm lint` | B |
| AC1/AC2 | `RewardProgressCard`/`StarProgressBar`/`CouponCard` render correctly against Phase-1-reconciled prop shapes (regression, not new behavior) | Fully-Automated | `pnpm --filter @jojopotato/ui test` — existing `reward-progress-card.test.tsx`, `star-progress-bar.test.tsx`, `coupon-card.test.tsx` (Phase 1 must update fixtures first; Phase 4 re-runs as regression gate) | C |
| AC5 | "Dev: View Coupons" dev link removed from `rewards/index.tsx` | Fully-Automated | `grep -c "Dev: View Coupons" "apps/mobile/src/app/(tabs)/rewards/index.tsx"` expect `0` | B |
| AC1 | Rewards screen: real balance/tier/catalog render; redeem below-threshold disabled+messaged; redeem at/above-threshold → confirm → success → coupon appears in wallet | Agent-Probe | Manual walkthrough (sign in → Rewards tab → attempt under-threshold redeem → attempt eligible redeem → confirm dialog → verify coupon in wallet) | D |
| AC2 | Coupon wallet: real coupons list (Available/Used/Expired); redeem an available coupon; re-redeem attempt shows friendly inline 409 | Agent-Probe | Manual walkthrough (open wallet → verify list → redeem → confirm → re-attempt redeem on same coupon → verify inline error, not a crash) | D |
| AC5/AC7 | Loading skeleton + empty (zero stars / zero coupons) + error-with-retry states on both screens | Agent-Probe | Manual walkthrough (fresh/zero-stars account → verify empty state; simulate network failure → verify retry affordance) | D |
| CROSS-PHASE | `GET /coupons` response has no human-readable label (`title`/`discountLabel` are dropped by Phase 1/2's reconciliation to `code`/`status`/`dealId`/`rewardId`) — `CouponCard` has nothing display-friendly to render without a joined reward/deal name | Known-Gap | — | D — backlog note required before Phase 4 EXECUTE begins: either Phase 2's `serializeCoupon` joins and includes a reward/deal name in `ApiCoupon`, or `CouponCard` is redesigned in Phase 4 to display `code` + `status` badge only (no title/discount line) |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist: C2 extracts pure logic; C1 removes dev link; Exit Gate already runs typecheck/lint)
- C — deferred to a named later phase/plan (Phase 1 must update the 3 `packages/ui` component fixtures/props before Phase 4 EXECUTE; Phase 4 re-runs `pnpm --filter @jojopotato/ui test` as a regression check)
- D — backlog test-building stub (named residual; keep-active; continue) — Agent-Probe rows are the accepted project-wide mobile-UX residual (see `process/context/tests/all-tests.md` Known Gaps); the CROSS-PHASE row is a genuine new residual surfaced by this validation, tracked below

Legacy line form (retained so existing validate-contract consumers still parse):
- Rewards/coupon affordability logic: Fully-automated: `pnpm --filter @jojopotato/mobile test` | Fully-automated: `pnpm --filter @jojopotato/mobile typecheck && pnpm lint` | Fully-automated (regression): `pnpm --filter @jojopotato/ui test` | agent-probe: full redeem round-trip walkthrough on both screens | known-gap: documented — coupon display-label join not yet designed (see CROSS-PHASE row above)

Failing stub (AC3 — redeem-eligibility):
```
test("should disable redeem when currentStars < requiredStars and show 'need N more stars'", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: redeem-eligibility / affordability check")
})
```

Failing stub (AC3/AC5 — typecheck+lint): N/A — this is a static-analysis command gate (`tsc --noEmit` + ESLint), not a behavior-assertion test; compliance is exit-code based, no TDD red/green stub applies.

Failing stub (AC1/AC2 — packages/ui regression): N/A — these are EXISTING test files (`reward-progress-card.test.tsx`, `star-progress-bar.test.tsx`, `coupon-card.test.tsx`), not new. No new stub is written; Phase 1's execute-agent updates the existing assertions/fixtures to the reconciled types, and this phase's EXECUTE re-runs them as a regression gate (see gap-resolution C).

Failing stub (AC5 — dev-link removal): N/A — grep-based structural check, not a behavior test; `grep -c ... expect 0` is the assertion.

Dimension findings:
- Infra fit: PASS — Phase 4's consumed routes (`GET/POST /api/rewards*`, `GET/POST /api/coupons*`) are explicitly defined by Phase 1 and Phase 2 respectively; the umbrella's Phase Ordering and this plan's Entry Gate correctly sequence Phase 4 after both. Minor observational note: this plan's checklist abbreviates routes without the `/api` prefix (e.g. "POST /rewards/:id/redeem" vs Phase 1's "POST /api/rewards/:id/redeem") — cosmetic only, matches the existing api-client base-URL-prefix pattern used elsewhere in the app.
- Test coverage: PASS — honest tiering (Fully-Automated pure logic + typecheck/lint + packages/ui component regression; Agent-Probe/Known-Gap explicitly named for screen render/redeem-flow, consistent with the project-wide no-RN-runner gap). Not vacuously green: redeem/coupon behavior has real Fully-Automated coverage (affordability logic + component regression), Known-Gap is not the sole proof for any developed behavior.
- Breaking changes: PASS — no new API contracts introduced; existing Rewards nav (index ↔ coupons) preserved; dev-link removal is additive cleanup, non-breaking.
- Security surface: PASS — redeem mutations only send an id (session-gated per Phase 1/2 routes); no client-supplied star count or discount amount is trusted, consistent with the umbrella's hard safety constraint ("Star/coupon mutations are server-authoritative").
- Section A feasibility (Rewards screen): CONCERN — mechanically the hooks/screen work are straightforward, BUT `RewardProgressCard`/`StarProgressBar` are hard-typed to the pre-reconciliation placeholder shapes (`RewardsAccount.{points,tier}`, `RewardsTierProgress.{currentPoints,pointsToNextTier,nextTier}`) that Phase 1 replaces with schema-derived fields (`currentStars`/`lifetimeStars`/derived tier). This plan's Blast Radius previously said "additive only" for `packages/ui`, which understates the risk — corrected above. Highest-risk edit: A3 (redeem mutation + confirm) — mitigate by following the STAFF-003 precedent (`Alert.alert` confirm, no optimistic star-decrement before server confirms).
- Section B feasibility (Coupon wallet): CONCERN — same type-coupling issue applies to `CouponCard`, and it is sharper here: `CouponCard` renders `coupon.title`/`coupon.discountLabel`, both of which are DROPPED entirely by Phase 1/2's reconciled `Coupon` shape (`code`/`status`/`dealId`/`rewardId`/`expiresAt`/`usedAt` — no display label). This is a genuine 3-way gap spanning Phase 1 (type reconciliation), Phase 2 (`serializeCoupon`/`ApiCoupon` — does not currently plan to join a reward/deal name), and Phase 4 (assumes `CouponCard` is a drop-in). `isRedeemed: boolean` also conflicts with the tri-state `status` enum (`available`/`used`/`expired`) — a boolean-to-enum change, not just a rename. Flagged as the CROSS-PHASE Known-Gap row above.
- Section C feasibility (Wiring + cleanup): PASS — dev-link removal target string confirmed present and uniquely matchable at `apps/mobile/src/app/(tabs)/rewards/index.tsx:15`; C2 extraction is low-risk and mechanically clear.

Open gaps:
- `packages/ui/src/components/{reward-progress-card,star-progress-bar,coupon-card}.tsx` prop-shape compatibility with Phase 1's reconciled types is NOT yet resolved by any phase plan's explicit Blast Radius (Phase 1's checklist item A3 — "fix broken consumers" — implicitly covers this but does not name these 3 files). Recommend: add these 3 files explicitly to Phase 1's Blast Radius, or add an execute-agent pre-check in Phase 4 that fails fast if the components still reference the old field names.
- `GET /coupons` has no planned display-label source (`title`/`discountLabel` are gone; nothing replaces them). Recommend: Phase 2's RESEARCH step (B2 in its checklist, "decide + document coupon→order linkage") also decide whether `serializeCoupon` joins the parent reward/deal name, OR Phase 4 redesigns `CouponCard` consumption to show `code` + a `status` badge only (no title/discount line) — this is a design decision, route to Phase 4's INNOVATE step, not silently assumed.
- Redeem-confirmation UI primitive (native `Alert.alert` vs custom modal) is unspecified in A3/B3 — non-blocking, execute-agent should follow the existing STAFF-003 confirm-alert precedent for consistency.

What this coverage does NOT prove:
- The Fully-Automated affordability/eligibility unit test does NOT prove the screen actually wires the disabled/grayed-out UI state correctly, or that the "need N more stars" copy renders — that is Agent-Probe only.
- The `packages/ui` component regression gate proves the components still RENDER without throwing against whatever fixture shape is passed in — it does NOT prove the fixture shape matches the real reconciled API response, nor that Phase 4's screens pass the correct real data into these components. That end-to-end wiring is Agent-Probe only.
- typecheck/lint prove structural/type correctness only — they do not prove the redeem mutation, cache invalidation, or 409-handling behave correctly at runtime.
- The dev-link-removal grep proves the string is gone from the file — it does NOT prove navigation between Rewards and Coupons still works after removal (Agent-Probe covers that separately).
- No automated coverage proves the CROSS-PHASE coupon-display gap is resolved — it remains an explicit Known-Gap until Phase 2/Phase 4 make the design decision noted above.

Gate: CONDITIONAL (0 FAILs; 2 CONCERNs — Section A, Section B — both traced to the same root cause: `packages/ui` reward/coupon components are coupled to pre-reconciliation placeholder types; plus 1 Known-Gap — coupon display-label join — carried forward as an explicit residual, not silently passed)
Accepted by: session (validate-agent synthesis, 14-07-26) — concerns are addressed via the Execute-Agent Instructions embedded above (Blast Radius correction + Open Gaps) rather than requiring a separate plan-supplement cycle; recommend the orchestrator relay the two Open Gaps to Phase 1 and Phase 2's RESEARCH/PLAN-SUPPLEMENT steps before Phase 4 EXECUTE begins, since both root causes originate outside Phase 4's own blast radius.
