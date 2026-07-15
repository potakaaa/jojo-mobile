---
name: plan:mobile-tabs-order-flow-completion-phase-03-home-rewire
description: "Mobile Tabs + Order-Flow Completion — Phase 03: rewire the 100%-mock Home tab to real useBranch/useMenu/useDeals + rewards summary"
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: mobile-tabs-order-flow-completion
  phase: phase-03
---

# Phase 03 — Home Tab Rewire

**Program:** mobile-tabs-order-flow-completion
**Umbrella plan:** process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/mobile-tabs-order-flow-completion-umbrella_PLAN_14-07-26.md
**Date**: 14-07-26
**Status**: ⏳ PLANNED
**Complexity**: COMPLEX (phase of a COMPLEX phase program)
**Report destination:** process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-03-home-rewire_REPORT_14-07-26.md

## Overview / Context

TL;DR: Replace the Home tab's 100%-mock render path (`apps/mobile/src/features/home/mock-home.ts` — `MOCK_BRANCH/PRODUCTS/CATEGORIES/REWARDS`) with real data via existing react-query hooks (`useBranch`, `useMenu`, `useDeals`) plus a real rewards summary (`GET /rewards/balance` from Phase 1). Only `useCart().setBranch` is currently real. Keep the friendly visual design; swap the data source. Read `process/context/all-context.md` first. Prioritize user friendliness (loading skeletons, graceful empty/error states).

## Phase Completion Rules

This phase is VERIFIED only when: all checklist items checked; the phase validate-contract exists with green gates; regression checks against overlapping earlier phases pass; and the phase report is written. Code-only completion is CODE DONE, never VERIFIED. Mobile-screen behavior with no automated runner is proven by Agent-Probe and recorded as Known-Gap. Post-phase testing uses the Exit Gate test gates (see process/context/tests/all-tests.md).

## Acceptance Criteria

- AC1: Home renders real branch/menu/deals + real star balance (Agent-Probe).
- AC2: no production import of mock-home remains (Fully-Automated grep).
- AC3: friendly loading/empty/error states; typecheck+lint green.

## Entry Gate

- Phase 1 exit gate passed (`GET /rewards/balance` available for the Home rewards summary card).

## Blast Radius

- `apps/mobile/src/app/(tabs)/index.tsx` — Home screen; swap mock imports for real hooks.
- `apps/mobile/src/features/home/mock-home.ts` — remove from render path (delete or demote to showcase-only).
- `apps/mobile/src/features/home/components/rewards-teaser-card.tsx` — **NEW (added by inner-loop supplement).** Confirmed dead code (no importers) and a duplicate of `packages/ui`'s `RewardProgressCard`; delete in this phase's cleanup step (C1a) rather than deferring.
- `apps/mobile/src/features/home/components/*` — adapt props to real types where needed.
- `apps/mobile/src/features/home/lib/menu-to-home-view.ts` — **NEW** (added by PVL supplement). Pure adapter that flattens `useMenu()`'s tree-shaped `MenuResponse.categories: Category[]` (nested `Category.products: Product[]`, no `sortOrder`) into the flat `MenuCategory[]`/`MenuItem[]` shapes `CategorySelector`/`ProductGrid` actually accept (`sortOrder` derived from array index, `categoryId` derived from the parent category, cents fields renamed `basePriceCents`→`priceCents`). Direct "swap MOCK_X for real data" is NOT a 1:1 replacement — `Product`/`Category` (real menu types) and `MenuItem`/`MenuCategory` (Home's prop types) are two distinct, differently-shaped types in `packages/types/src/menu.ts`. See Implementation Checklist A2/A2a.
- `apps/mobile/src/features/rewards/hooks/use-rewards-summary.ts` — NEW react-query hook (may be created here or reused from Phase 4 if built first).
- `apps/mobile/src/lib/api-client.ts` — **NEW touchpoint (added by PVL supplement).** Add a `getRewardsBalance()` fetch function mirroring `getBranches`/`getMenu`/`getDeals`'s pattern (`getJson<T>('/rewards/balance')`); `use-rewards-summary.ts` needs this to exist and it wasn't previously listed. **Confirmed in this inner PVL pass (read `packages/api/src/routes/rewards.ts` directly):** the real, live response shape is `{ currentStars, lifetimeStars, rewardThreshold, starsToNextReward }` — tier-free, no `tier`/`tierProgress` fields at all (the earlier assumed shape in this note was stale/wrong). The route returns this object directly with NO envelope wrapper key, unlike `getBranches`/`getDeals`'s `{ branches }`/`{ deals }` pattern — `getRewardsBalance()` should follow `getMenu()`'s no-envelope pattern instead.
- Reuse `useBranch`, `useMenu` (`features/branch`, `features/menu`), `useDeals` (`features/deals`).
- `packages/ui/src/components/{reward-progress-card,star-progress-bar}.tsx` — **NOT edited by this phase**, but their prop contracts (`RewardProgressCardProps.rewards: RewardsAccount` — `{userId, points, tier}`; `StarProgressBarProps.progress: RewardsTierProgress` — `{currentPoints, pointsToNextTier, nextTier}`) are the OLD placeholder shapes. Phase 1 rewrites `packages/types/src/rewards.ts` to the new schema-based `StarBalance`/`TierProgress` shape and is expected (via its A3 "fix broken consumers" step) to update these two components, but neither phase's Blast Radius names the files explicitly. Flagged as a cross-phase coordination gap — see Execute-Agent Instructions in the Validate Contract below.

## Implementation Checklist

### Step A — Data wiring

- [x] A1. Replace `MOCK_BRANCH`/branch selection with `useBranch()` (selected branch + switcher).
- [x] A1a. **(added by PVL supplement)** On mount and on branch switch, call `useCart().setBranch(selectedBranch.id)` when `useBranch().selectedBranch` changes. `useDeals()` sources its branch id from `useCart().cart.pickupBranchId` (NOT from `useBranch()`), and `useCart()` starts with `pickupBranchId: ''` until explicitly set — without this sync, the Home deals strip would only show branch-agnostic deals until the user manually opens a branch, contradicting AC1's "real branch/menu/deals" intent.
- [x] A2. Replace `MOCK_PRODUCTS`/`MOCK_CATEGORIES` with `useMenu()` real menu categories/products (via the new adapter, A2a — `useMenu()` takes no argument, it derives branch id internally from `useBranch()`).
- [x] A2a. **(added by PVL supplement)** Add `apps/mobile/src/features/home/lib/menu-to-home-view.ts` exporting a pure function (e.g. `flattenMenuForHome(menu: MenuResponse): { categories: MenuCategory[]; products: MenuItem[] }`) that flattens the real nested `Category[]`/`Product[]` tree into the flat shapes `CategorySelector`/`ProductGrid` expect. Cover it with a vitest unit test in `apps/mobile/src/features/home/lib/__tests__/menu-to-home-view.test.ts` (Fully-Automated — this is exactly the kind of pure Home-viewmodel-assembly logic the Test Infra Improvement Notes below call out). **Confirmed in this inner PVL pass (read `packages/types/src/menu.ts` directly):** `Product` has no `isAvailable` field but `MenuItem` requires one — since the branch menu tree only contains available products (server-side filtered; see `ProductDetail`'s doc comment in the same file), the adapter should set `isAvailable: true` unconditionally for every flattened product. The unit test should assert this derivation alongside the `categoryId`/`sortOrder`/`priceCents` mappings.
- [x] A3. Replace the Home deals strip with `useDeals()` real deals (no argument — branch id comes from cart via A1a).
- [x] A4. Add a rewards summary card fed by `useRewardsSummary()` → `GET /rewards/balance` (currentStars/tier/progress). Reuse `RewardProgressCard`/`StarProgressBar` from `@jojopotato/ui` **only after confirming their prop types match Phase 1's actual output shape** (see Blast Radius note above and Execute-Agent Instructions in the validate-contract) — if Phase 1 left them on the old `RewardsAccount`/`RewardsTierProgress` shape, adapt the call site or the component props before wiring.
- [x] A5. **(added by PVL supplement)** Add `getRewardsBalance()` to `apps/mobile/src/lib/api-client.ts` (follows `getMenu()`'s no-envelope pattern, confirmed in this inner PVL pass — `/rewards/balance` returns `{ currentStars, lifetimeStars, rewardThreshold, starsToNextReward }` directly, not wrapped in a key like `getBranches`/`getDeals`); `use-rewards-summary.ts` (A4) consumes it via `useQuery`.

### Step B — Friendliness (loading/empty/error)

- [x] B1. Skeleton/loading state while queries are pending (no blank flash). Note: no shared "Skeleton" shimmer primitive exists in `@jojopotato/ui` — follow the existing `ActivityIndicator` precedent used elsewhere in the app (e.g. deals screens), not a new component.
- [x] B2. Friendly empty states (no branch selected, no menu, no deals) using `EmptyState` (exported from `@jojopotato/ui`).
- [x] B3. Error state with retry for each query (`useBranch`/`useMenu`/`useDeals`/`useRewardsSummary` all expose `isError`/`refetch`).
- [x] B4. Preserve real navigation (product → details, branch switch) — verify no dead mock links remain.

### Step C — Cleanup

- [x] C1. Remove `mock-home.ts` from the render path; if any showcase still needs it, isolate it to a non-production showcase file. Confirm no production import of `mock-home` remains (grep). Note: `apps/mobile/src/features/cart/mock-cart.ts` also imports from `mock-home.ts` — this is confirmed dev/demo-only seed data for `component-showcase.tsx` (not `use-cart.ts`'s production default, per `process/context/all-context.md`) and is intentionally OUT of this grep's scope (`apps/mobile/src/app` + `features/home/components` only) — do not widen the grep or touch `mock-cart.ts` in this phase.
- [x] C1a. **(added by inner-loop supplement)** Delete `apps/mobile/src/features/home/components/rewards-teaser-card.tsx` — confirmed dead code (no importers anywhere in `apps/mobile/src`), duplicate of `packages/ui`'s `RewardProgressCard`. No longer deferred to Phase 6.

## Exit Gate

```bash
pnpm --filter @jojopotato/mobile typecheck && pnpm lint
# Expected: exit 0

grep -rn "mock-home" apps/mobile/src/app apps/mobile/src/features/home/components || echo "no production mock-home import"
# Expected: no production render-path import of mock-home

test -f apps/mobile/src/features/home/components/rewards-teaser-card.tsx && echo "FAIL: dead file still present" || echo "rewards-teaser-card.tsx deleted"
# Expected: file deleted

pnpm --filter @jojopotato/mobile test
# Expected: exit 0, incl. new menu-to-home-view.test.ts
```

- All checklist items checked.
- Agent-Probe walkthrough: Home shows real branch/menu/deals + real star balance; loading/empty/error states are friendly.
- Phase report written to report destination above.

## Blockers That Would Justify BLOCKED Status

- `GET /rewards/balance` not available (Phase 1 not complete) — entry gate not met.
- Home component props too tightly coupled to mock shapes to adapt without a component refactor beyond scope (route the refactor to Phase 6 or a follow-up).
- Phase 1 leaves `RewardProgressCard`/`StarProgressBar` (packages/ui) on the old `RewardsAccount`/`RewardsTierProgress` shape AND adapting them is more than a small prop-shape fix (route the component refactor to a follow-up rather than widening this phase's scope).

## Phase Loop Progress

- [ ] 1. RESEARCH — research-agent: prior phase reports read; test context loaded; Home component prop coupling to mocks mapped; plan drift checked
- [ ] 2. INNOVATE — innovate-agent: rewire approach decided; Decision Summary written
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: phase plan updated (or "n/a — research clean")
- [x] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per example-validate-output.md
- [x] 5. EXECUTE — all checklist items done; per-section test gates green
- [x] 6. EVL — all EVL gates green; follow-up stubs registered; EVL HANDOFF SUMMARY written
- [x] 7. UPDATE PROCESS — phase report written, umbrella state updated, commit done

**Validate-contract required before execute.**

## Touchpoints

- `apps/mobile/src/app/(tabs)/index.tsx`, `apps/mobile/src/features/home/**`
- `apps/mobile/src/features/home/lib/menu-to-home-view.ts` (new adapter — added by PVL supplement)
- `apps/mobile/src/features/rewards/hooks/use-rewards-summary.ts`
- `apps/mobile/src/lib/api-client.ts` (new `getRewardsBalance()` — added by PVL supplement)
- Existing hooks: `features/branch/hooks/use-branch.ts`, `features/menu/hooks/use-menu.ts`, `features/deals/hooks/use-deals.ts`

## Public Contracts

- No API contract changes — consumes existing `/branches`, `/branches/:id/menu`, `/deals` and new `/rewards/balance`.
- Home navigation behavior preserved.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| No production import of `mock-home` remains (grep) | Fully-Automated | AC-4 (no mock render path) |
| typecheck + lint green after rewire | Fully-Automated | AC-4 |
| `menu-to-home-view.ts` adapter correctly flattens `Category[]`/`Product[]` into `MenuCategory[]`/`MenuItem[]` (categoryId/sortOrder derivation) | Fully-Automated (vitest, `apps/mobile`) | AC1 (real menu data renders correctly) |
| Home renders real branch/menu/deals + real star balance; friendly loading/empty/error (walkthrough) | Agent-Probe (Known-Gap for automation) | AC-4, AC-7 |

```bash
pnpm --filter @jojopotato/mobile typecheck
# Expected: exit 0

pnpm --filter @jojopotato/mobile test
# Expected: exit 0
```

## Test Infra Improvement Notes

- Home render is Agent-Probe only (no RN runner — project-wide gap). Any pure data-shaping helper (e.g. Home viewmodel assembly) should be extracted to pure TS so it CAN be vitest-covered. **Resolved for the menu-flatten step by A2a's new `menu-to-home-view.ts` adapter — extract it rather than inlining the flatten logic in the screen component.**

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-03-home-rewire_PLAN_14-07-26.md`
- Last completed step: inner PVL re-confirm (validate-contract written below; Gate: PASS)
- Validate-contract status: written 14-07-26 (inner-pvl: phase-3) — PASS, supersedes the 14-07-26 outer-pvl CONDITIONAL contract
- Supporting context: `apps/mobile/src/features/home/mock-home.ts` (what to replace), existing branch/menu/deals hooks, Phase 1 report (rewards balance route).
- Next step: EXECUTE — all Implementation Checklist items (A1-A5, B1-B4, C1-C1a) are ready to implement directly against the confirmed real shapes documented in this plan; no further RESEARCH/INNOVATE needed for this phase.

## Inner Loop Refresh Note

Date: 2026-07-14
Triggered by: Step 1 RESEARCH + Step 2 INNOVATE (inner loop) re-run for Phase 3.

Research facts confirmed (see full findings in the phase-loop handoff — summarized here):
- Home screen render path, mock inventory, and the real hook surface (`useBranch`/`useMenu`/`useDeals`) matched the existing plan text; no drift found.
- Menu shape mismatch (nested `Category[]`/`Product[]` vs flat `MenuCategory[]`/`MenuItem[]`) reconfirmed real — A2a adapter approach stands.
- `useDeals()` branch sourcing from `useCart().cart.pickupBranchId` (not `useBranch()`) reconfirmed — A1a sync step stands.
- `GET /rewards/balance` confirmed live and session-gated; `RewardProgressCard`/`StarProgressBar` in `packages/ui` were confirmed to ALREADY use the tier-free `RewardsAccount`/`RewardsProgress` shapes (Phase 1 delivered this) — **the E1 cross-phase coordination concern is RESOLVED**: wire A4 directly against the current component props, no adaptation needed. E1 instruction is downgraded from a live risk to a "confirm and proceed" note for EXECUTE.
- `mock-home.ts` deletion confirmed safe (only `(tabs)/index.tsx` imports it in production; `cart/mock-cart.ts` is an unrelated demo-only import, unaffected).
- `rewards-teaser-card.tsx` confirmed dead code (zero importers) — moved from a deferred known-gap into this phase's cleanup scope (C1a) rather than punting to Phase 6.

Decisions locked (INNOVATE):
1. No new backend route — reuse `/branches`, `/branches/:id/menu`, `/deals`, `/rewards/balance`.
2. New mobile plumbing: `getRewardsBalance()` in `apps/mobile/src/lib/api-client.ts` (A5); `use-rewards-summary.ts` react-query hook (A4). EXECUTE must verify the exact `/rewards/balance` response body before committing to a specific derivation of `RewardsProgress` fields (threshold constant of 5 as a fallback if the endpoint returns balance only, not progress).
3. Menu adapter: pure `menu-to-home-view.ts` + `menu-to-home-view.test.ts` (Fully-Automated, vitest) — confirmed as the correct pattern.
4. Branch/cart sync: `useEffect` in `(tabs)/index.tsx` syncing `useBranch().selectedBranch` → `useCart().setBranch(...)` — confirmed, do not touch `useDeals()` itself.
5. Real deals strip: replace static "Deals & offers" Card with a live `useDeals()`-backed horizontal strip using `packages/ui` `DealCard`, tap → `deal/[dealId]`.
6. Friendliness states: no-branch-selected / loading (`ActivityIndicator`) / empty menu (`EmptyState`) / error+retry, per query. Reuse `packages/ui` `EmptyState` — no one-off UI.
7. Cleanup: delete `mock-home.ts` (render path) AND `rewards-teaser-card.tsx` (dead code) — both now in-scope for this phase (C1, C1a). Exit-gate grep/file-existence checks updated accordingly.
8. Reuse shared UI only: `RewardProgressCard`, `StarProgressBar`, `DealCard`, `BranchCard`, `ProductCard`/`ProductGrid`, `CategorySelector` — no hardcoded colors/spacing.

Net effect on plan: Blast Radius, Implementation Checklist (C1a added), Exit Gate (file-deletion check added), and Open Gaps (rewards-teaser-card gap closed, no longer deferred) were updated in this pass. Existing outer-PVL Test Gates/Dimension Findings/Execute-Agent Instructions below are otherwise still current — E1 is now a lower-risk "confirm, don't adapt" note rather than a live coordination risk, but is left in place verbatim since it remains a valid pre-flight check for EXECUTE.

Because this Refresh Note postdates the existing validate-contract (both dated 14-07-26, but this note reflects material fact changes — the C1a cleanup addition and E1 downgrade — that the current gate table and Open Gaps section have not yet incorporated), **inner PVL re-run from V1 is required** before EXECUTE.

## Validate Contract

Status: PASS
Date: 14-07-26
date: 2026-07-14
generated-by: inner-pvl: phase-3
supersedes: 14-07-26 (outer-pvl) — inner PVL has current evidence

Parallel strategy: sequential
Rationale: Signal count 1/7 (mobile-UI phase, no schema/auth/API/billing surface, single plan section, ~7 blast-radius files). Focused re-confirm targeting specific locked decisions against live source — a single-context direct verification pass was sufficient; no multi-agent Layer 1/2 fan-out needed for this size/risk.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC2 | No production import of `mock-home` remains in the Home render path | Fully-Automated | `grep -rn "mock-home" apps/mobile/src/app apps/mobile/src/features/home/components \|\| echo "clean"` | B |
| AC3 | typecheck + lint stay green after the rewire | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck && pnpm lint` | B |
| AC1 | `menu-to-home-view.ts` adapter correctly flattens real nested `Category[]`/`Product[]` into flat `MenuCategory[]`/`MenuItem[]` (categoryId/sortOrder/priceCents derivation, `isAvailable: true` derivation — re-confirmed necessary in this pass by direct type read) | Fully-Automated | `pnpm --filter @jojopotato/mobile test` — new `menu-to-home-view.test.ts` | B |
| AC2 (cleanup) | `rewards-teaser-card.tsx` deleted (confirmed dead code, zero importers) | Fully-Automated | `test -f apps/mobile/src/features/home/components/rewards-teaser-card.tsx && echo FAIL || echo deleted` | B |
| AC1 | Home renders real branch/menu/deals + real star balance | Agent-Probe | Manual walkthrough: open Home cold, confirm branch card / product grid / deals strip / rewards card all render from live data, not `mock-home.ts` values | B |
| AC1/AC7 | Friendly loading/empty/error states across all 4 Home queries (branch, menu, deals, rewards) | Agent-Probe | Manual walkthrough: force each query into pending/empty/error and confirm ActivityIndicator, `EmptyState`, and retry-on-error render correctly | B |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Failing stub (menu-to-home-view.test.ts, per vc-test-coverage-plan TDD-stub requirement):
```
test("should flatten nested Category[]/Product[] into flat MenuCategory[]/MenuItem[] with categoryId, sortOrder, priceCents, and isAvailable:true derived", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: menu-to-home-view adapter flatten")
})
```

Legacy line form (retained so existing validate-contract consumers still parse):
- Home mock-import removal: Fully-automated: `grep -rn "mock-home" apps/mobile/src/app apps/mobile/src/features/home/components || echo clean`
- Home typecheck/lint: Fully-automated: `pnpm --filter @jojopotato/mobile typecheck && pnpm lint`
- Home menu-adapter unit test: Fully-automated: `pnpm --filter @jojopotato/mobile test` (new `menu-to-home-view.test.ts`)
- rewards-teaser-card.tsx deletion: Fully-automated: `test -f apps/mobile/src/features/home/components/rewards-teaser-card.tsx && echo FAIL || echo deleted`
- Home real-data render + rewards card: agent-probe: manual Home walkthrough against live API
- Home loading/empty/error friendliness: agent-probe: manual walkthrough forcing pending/empty/error states

Dimension findings:
- Infra fit: PASS — mechanically re-confirmed by direct source read. All 4 consumed routes (`/branches`, `/branches/:id/menu`, `/deals`, `/rewards/balance`) exist and are mounted (`packages/api/src/index.ts`) — no new backend route needed, confirming Decision 1. `apps/mobile/src/lib/api-client.ts` confirmed as the correct, established location for `getRewardsBalance()` (`getBranches`/`getMenu`/`getDeals` pattern read directly). The Blast Radius note's assumed `/rewards/balance` response shape (`{tier, tierProgress}`) was stale/wrong — corrected in this pass, by direct read of `rewards.ts`, to the real shape `{ currentStars, lifetimeStars, rewardThreshold, starsToNextReward }` (tier-free, no envelope wrapper). Fixed directly in the plan text (Blast Radius + A5).
- Test coverage: PASS — `apps/mobile/vitest.config.ts`'s `src/**/*.test.ts` glob confirmed to cover the planned `menu-to-home-view.test.ts` location. Menu shape mismatch re-confirmed real by direct type read of `packages/types/src/menu.ts`: `Category{id,name,products:Product[]}` (no `sortOrder`, `Product` uses `basePriceCents`, has no `isAvailable`) vs `MenuCategory{id,name,sortOrder}`/`MenuItem{id,name,priceCents,categoryId,isAvailable}` — the adapter (A2a) is mechanically necessary, not speculative, and its scope was widened in this pass to also cover the previously-unmentioned `isAvailable: true` derivation (Product has no such field; the menu tree is server-side filtered to available-only products per `ProductDetail`'s own doc comment). Agent-Probe/Known-Gap honesty for Home render/state behavior re-confirmed correct — no RN component/E2E runner exists (project-wide gap, unchanged).
- Breaking changes: PASS (upgraded from outer-PVL CONCERN) — direct read of `packages/ui/src/components/reward-progress-card.tsx` and `star-progress-bar.tsx` empirically confirms BOTH already consume the new tier-free `RewardsAccount`/`RewardsProgress` shapes from `packages/types/src/rewards.ts` (`{userId,currentStars,lifetimeStars}` / `{currentStars,rewardThreshold,starsToNextReward}`) — Phase 1 delivered this exactly as the Inner Loop Refresh Note's research claimed, now independently verified rather than taken on faith. E1's cross-phase coordination risk is CLOSED. Current `(tabs)/index.tsx` was also confirmed to already import and render `RewardProgressCard` from `@jojopotato/ui` with `MOCK_REWARDS`, confirming the wiring point is real and the swap is a straight data-source change, not a structural one.
- Security surface: PASS — unchanged from outer-PVL, re-confirmed: `GET /rewards/balance` is `requireSession`-gated (`rewards.ts` line 45, direct read); no auth/billing/schema/secrets surface touched by this phase.
- Section A feasibility (Data wiring): PASS — `useCart().setBranch(branchId)`, `useDeals()`'s `cart.pickupBranchId` sourcing (confirmed NOT `useBranch()`, via direct read of `use-deals.ts`'s own doc comment), and `useBranch().selectedBranch` all confirmed present and shaped exactly as A1a describes. `EmptyState`, `DealCard`, `RewardProgressCard`, `StarProgressBar` all confirmed real exports of `@jojopotato/ui` (`packages/ui/src/index.ts`, `export *` re-exports). `deal/[dealId]` route confirmed present on disk for A3's tap-through target.
- Section B/C feasibility (Friendliness / Cleanup): PASS — unchanged from outer-PVL, re-confirmed by re-running the grep checks live: `mock-home` importers are exactly `(tabs)/index.tsx` + `cart/mock-cart.ts` (matches C1's declared exclusion of `mock-cart.ts` exactly); `rewards-teaser-card.tsx` confirmed present on disk with ZERO importers anywhere in `apps/mobile/src` — C1a deletion is safe and mechanically clean. `ActivityIndicator` precedent re-confirmed present in `deal/[dealId].tsx`.

Open gaps: none. The single outer-PVL open gap (cross-phase `RewardProgressCard`/`StarProgressBar` prop-shape coordination, E1) is RESOLVED — empirically closed in this inner PVL pass, not carried forward.

Execute-Agent Instructions:
- E1 (CLOSED, re-confirm only): This inner PVL pass empirically verified — by directly reading the current component source, not by inference — that `RewardProgressCard`/`StarProgressBar` already consume the new tier-free `RewardsAccount`/`RewardsProgress` shapes. EXECUTE may wire Implementation Checklist A4 directly against current prop types with no adaptation. Note in the phase report that no adaptation was needed (satisfies the original instruction's documentation requirement trivially).
- E2: When implementing A5 (`getRewardsBalance()`), follow `getMenu()`'s no-envelope pattern (`getJson<T>('/rewards/balance')` returns the balance object directly), NOT `getBranches`/`getDeals`'s `{ branches }`/`{ deals }` envelope-unwrap pattern — confirmed by direct read of `rewards.ts`'s route handler in this pass.

What this coverage does NOT prove:
- The grep/typecheck/lint gates prove absence of a stale import and static type correctness — they do NOT prove the screen actually renders correctly at runtime, that navigation still works, or that the visual layout is acceptable.
- The `menu-to-home-view.ts` unit test proves correct data flattening for the cases exercised — it does NOT prove `CategorySelector`/`ProductGrid` render the flattened data correctly on-device (that remains Agent-Probe).
- The Agent-Probe walkthroughs prove one manual pass at one point in time on one device/simulator — they do NOT provide regression protection against future changes (no RN component/E2E runner exists in this repo — project-wide gap, see `process/context/tests/all-tests.md`).
- None of these gates prove `GET /rewards/balance` returns correct data under all conditions — that is proven by Phase 1's own `rewards.test.ts`, not by this phase's gates. This pass DID confirm the route's exact response shape and session-gating by direct source read (stronger evidence than the outer-PVL pass had), but that is a static-shape confirmation, not a live-data-correctness proof.

Gate: PASS (0 FAILs, 0 unresolved CONCERNs. All 4 outer-PVL CONCERNs are now resolved: 3 were structural gaps already fixed by the prior PVL supplement [A1a, A2a, A5 existence] and re-confirmed mechanically sound in this pass; E1, the one execute-agent-instruction-carried concern, is empirically CLOSED in this pass by direct source read, not just re-asserted. 3 additional small forward-text gaps (stale `/rewards/balance` response-shape assumption, missing `isAvailable` derivation note, missing no-envelope clarification for `getRewardsBalance()`) were found and fixed directly in this pass — none rose to CONCERN severity since they were self-contained plan-text corrections with no design-decision impact.)
Accepted by: N/A — Gate is PASS, no CONCERNs require acceptance.
