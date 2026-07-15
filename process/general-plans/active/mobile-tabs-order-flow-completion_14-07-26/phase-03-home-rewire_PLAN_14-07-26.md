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
- `apps/mobile/src/features/home/components/*` — adapt props to real types where needed.
- `apps/mobile/src/features/home/lib/menu-to-home-view.ts` — **NEW** (added by PVL supplement). Pure adapter that flattens `useMenu()`'s tree-shaped `MenuResponse.categories: Category[]` (nested `Category.products: Product[]`, no `sortOrder`) into the flat `MenuCategory[]`/`MenuItem[]` shapes `CategorySelector`/`ProductGrid` actually accept (`sortOrder` derived from array index, `categoryId` derived from the parent category, cents fields renamed `basePriceCents`→`priceCents`). Direct "swap MOCK_X for real data" is NOT a 1:1 replacement — `Product`/`Category` (real menu types) and `MenuItem`/`MenuCategory` (Home's prop types) are two distinct, differently-shaped types in `packages/types/src/menu.ts`. See Implementation Checklist A2/A2a.
- `apps/mobile/src/features/rewards/hooks/use-rewards-summary.ts` — NEW react-query hook (may be created here or reused from Phase 4 if built first).
- `apps/mobile/src/lib/api-client.ts` — **NEW touchpoint (added by PVL supplement).** Add a `getRewardsBalance()` fetch function mirroring `getBranches`/`getMenu`/`getDeals`'s pattern (`getJson<T>('/rewards/balance')`, mapped against Phase 1's `{ currentStars, lifetimeStars, tier, tierProgress }` shape); `use-rewards-summary.ts` needs this to exist and it wasn't previously listed.
- Reuse `useBranch`, `useMenu` (`features/branch`, `features/menu`), `useDeals` (`features/deals`).
- `packages/ui/src/components/{reward-progress-card,star-progress-bar}.tsx` — **NOT edited by this phase**, but their prop contracts (`RewardProgressCardProps.rewards: RewardsAccount` — `{userId, points, tier}`; `StarProgressBarProps.progress: RewardsTierProgress` — `{currentPoints, pointsToNextTier, nextTier}`) are the OLD placeholder shapes. Phase 1 rewrites `packages/types/src/rewards.ts` to the new schema-based `StarBalance`/`TierProgress` shape and is expected (via its A3 "fix broken consumers" step) to update these two components, but neither phase's Blast Radius names the files explicitly. Flagged as a cross-phase coordination gap — see Execute-Agent Instructions in the Validate Contract below.

## Implementation Checklist

### Step A — Data wiring

- [ ] A1. Replace `MOCK_BRANCH`/branch selection with `useBranch()` (selected branch + switcher).
- [ ] A1a. **(added by PVL supplement)** On mount and on branch switch, call `useCart().setBranch(selectedBranch.id)` when `useBranch().selectedBranch` changes. `useDeals()` sources its branch id from `useCart().cart.pickupBranchId` (NOT from `useBranch()`), and `useCart()` starts with `pickupBranchId: ''` until explicitly set — without this sync, the Home deals strip would only show branch-agnostic deals until the user manually opens a branch, contradicting AC1's "real branch/menu/deals" intent.
- [ ] A2. Replace `MOCK_PRODUCTS`/`MOCK_CATEGORIES` with `useMenu()` real menu categories/products (via the new adapter, A2a — `useMenu()` takes no argument, it derives branch id internally from `useBranch()`).
- [ ] A2a. **(added by PVL supplement)** Add `apps/mobile/src/features/home/lib/menu-to-home-view.ts` exporting a pure function (e.g. `flattenMenuForHome(menu: MenuResponse): { categories: MenuCategory[]; products: MenuItem[] }`) that flattens the real nested `Category[]`/`Product[]` tree into the flat shapes `CategorySelector`/`ProductGrid` expect. Cover it with a vitest unit test in `apps/mobile/src/features/home/lib/__tests__/menu-to-home-view.test.ts` (Fully-Automated — this is exactly the kind of pure Home-viewmodel-assembly logic the Test Infra Improvement Notes below call out).
- [ ] A3. Replace the Home deals strip with `useDeals()` real deals (no argument — branch id comes from cart via A1a).
- [ ] A4. Add a rewards summary card fed by `useRewardsSummary()` → `GET /rewards/balance` (currentStars/tier/progress). Reuse `RewardProgressCard`/`StarProgressBar` from `@jojopotato/ui` **only after confirming their prop types match Phase 1's actual output shape** (see Blast Radius note above and Execute-Agent Instructions in the validate-contract) — if Phase 1 left them on the old `RewardsAccount`/`RewardsTierProgress` shape, adapt the call site or the component props before wiring.
- [ ] A5. **(added by PVL supplement)** Add `getRewardsBalance()` to `apps/mobile/src/lib/api-client.ts` (mirrors `getBranches`/`getMenu`/`getDeals`); `use-rewards-summary.ts` (A4) consumes it via `useQuery`.

### Step B — Friendliness (loading/empty/error)

- [ ] B1. Skeleton/loading state while queries are pending (no blank flash). Note: no shared "Skeleton" shimmer primitive exists in `@jojopotato/ui` — follow the existing `ActivityIndicator` precedent used elsewhere in the app (e.g. deals screens), not a new component.
- [ ] B2. Friendly empty states (no branch selected, no menu, no deals) using `EmptyState` (exported from `@jojopotato/ui`).
- [ ] B3. Error state with retry for each query (`useBranch`/`useMenu`/`useDeals`/`useRewardsSummary` all expose `isError`/`refetch`).
- [ ] B4. Preserve real navigation (product → details, branch switch) — verify no dead mock links remain.

### Step C — Cleanup

- [ ] C1. Remove `mock-home.ts` from the render path; if any showcase still needs it, isolate it to a non-production showcase file. Confirm no production import of `mock-home` remains (grep). Note: `apps/mobile/src/features/cart/mock-cart.ts` also imports from `mock-home.ts` — this is confirmed dev/demo-only seed data for `component-showcase.tsx` (not `use-cart.ts`'s production default, per `process/context/all-context.md`) and is intentionally OUT of this grep's scope (`apps/mobile/src/app` + `features/home/components` only) — do not widen the grep or touch `mock-cart.ts` in this phase.

## Exit Gate

```bash
pnpm --filter @jojopotato/mobile typecheck && pnpm lint
# Expected: exit 0

grep -rn "mock-home" apps/mobile/src/app apps/mobile/src/features/home/components || echo "no production mock-home import"
# Expected: no production render-path import of mock-home

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
- [ ] 5. EXECUTE — all checklist items done; per-section test gates green
- [ ] 6. EVL — all EVL gates green; follow-up stubs registered; EVL HANDOFF SUMMARY written
- [ ] 7. UPDATE PROCESS — phase report written, umbrella state updated, commit done

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
- Last completed step: PVL (validate-contract written below; Gate: CONDITIONAL)
- Validate-contract status: written 14-07-26 — CONDITIONAL
- Supporting context: `apps/mobile/src/features/home/mock-home.ts` (what to replace), existing branch/menu/deals hooks, Phase 1 report (rewards balance route).
- Next step: Spawn vc-research-agent for RESEARCH (Step 1) — map Home component prop coupling to mock shapes, and confirm Phase 1's actual `RewardProgressCard`/`StarProgressBar` prop-shape outcome before EXECUTE wires A4.

## Validate Contract

Status: CONDITIONAL
Date: 14-07-26
date: 2026-07-14
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Signal count 1/7 (S7 borderline — blast radius is ~7 files/areas but single-package, no schema/auth/API surface, single plan section fan-out). A single vc-validate-agent Layer1+Layer2 pass in one context window was sufficient; no multi-agent fan-out needed for a phase this size.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC2 | No production import of `mock-home` remains in the Home render path | Fully-Automated | `grep -rn "mock-home" apps/mobile/src/app apps/mobile/src/features/home/components \|\| echo "clean"` | B |
| AC3 | typecheck + lint stay green after the rewire | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck && pnpm lint` | B |
| AC1 | `menu-to-home-view.ts` adapter correctly flattens real nested `Category[]`/`Product[]` into flat `MenuCategory[]`/`MenuItem[]` (categoryId/sortOrder/priceCents derivation) | Fully-Automated | `pnpm --filter @jojopotato/mobile test` — new `menu-to-home-view.test.ts` | B |
| AC1 | Home renders real branch/menu/deals + real star balance | Agent-Probe | Manual walkthrough: open Home cold, confirm branch card / product grid / deals strip / rewards card all render from live data, not `mock-home.ts` values | B |
| AC1/AC7 | Friendly loading/empty/error states across all 4 Home queries (branch, menu, deals, rewards) | Agent-Probe | Manual walkthrough: force each query into pending/empty/error and confirm skeleton/ActivityIndicator, `EmptyState`, and retry-on-error render correctly | B |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form (retained so existing validate-contract consumers still parse):
- Home mock-import removal: Fully-automated: `grep -rn "mock-home" apps/mobile/src/app apps/mobile/src/features/home/components || echo clean`
- Home typecheck/lint: Fully-automated: `pnpm --filter @jojopotato/mobile typecheck && pnpm lint`
- Home menu-adapter unit test: Fully-automated: `pnpm --filter @jojopotato/mobile test` (new `menu-to-home-view.test.ts`)
- Home real-data render + rewards card: agent-probe: manual Home walkthrough against live API
- Home loading/empty/error friendliness: agent-probe: manual walkthrough forcing pending/empty/error states

Dimension findings:
- Infra fit: CONCERN — mechanically feasible (all consumed hooks/routes exist or are explicitly scoped as new in this plan; Phase 1 dependency is explicitly declared via Entry Gate). Two plan-completeness gaps found and fixed in this PVL pass: (1) Blast Radius/Touchpoints omitted `apps/mobile/src/lib/api-client.ts`, the established location for a new `getRewardsBalance()` fetch function — added as A5. (2) `useDeals()` reads branch id from `useCart().cart.pickupBranchId`, not from `useBranch()` — without an explicit sync step the deals strip would only show branch-agnostic deals until the user manually opens a branch — added as A1a.
- Test coverage: CONCERN — the plan honestly scopes Home render behavior as Agent-Probe/Known-Gap (no RN runner exists — correctly not over-claimed). However, the real menu data shape (`useMenu()`'s nested `Category[]`/`Product[]` tree) does not match `CategorySelector`/`ProductGrid`'s flat `MenuCategory[]`/`MenuItem[]` prop types — checklist A2 read as a direct swap, which is not mechanically possible without an adapter. Fixed in this pass: A2a adds a pure, vitest-testable `menu-to-home-view.ts` adapter, converting an implicit gap into a real Fully-Automated gate.
- Breaking changes: CONCERN — `RewardProgressCard`/`StarProgressBar` (`packages/ui`) currently take the OLD placeholder `RewardsAccount`/`RewardsTierProgress` shapes (`points`/`tier`, `currentPoints`/`pointsToNextTier`/`nextTier`). Phase 1 rewrites `packages/types/src/rewards.ts` to the new schema-based `StarBalance`/`TierProgress` shape (note: name differs from the existing `RewardsTierProgress` too). Phase 1's A3 ("fix broken consumers") should catch these two component files via its `points`/`tier` grep, but neither Phase 1's nor this phase's Blast Radius names them explicitly — a real cross-phase coordination gap that cannot be fully resolved until Phase 1 actually executes. Not fixable in Phase 3's plan text alone; carried forward as an Execute-Agent Instruction (E1) below.
- Security surface: PASS — no auth, billing, schema, or secrets surface touched; Home only consumes existing session-gated/public GET routes (`/branches`, `/branches/:id/menu`, `/deals`, and Phase 1's `/rewards/balance`). No new write surface introduced.
- Section A feasibility (Data wiring): CONCERN — mechanically feasible; edit targets (hooks, screen file) are real and uniquely matchable. Gaps found and fixed: menu-shape adapter (A2a), branch/cart sync (A1a), missing api-client touchpoint (A5). Highest-risk edit: A4 (rewards card wiring) — mitigated by the Execute-Agent Instruction below (verify Phase 1's actual component-prop outcome before wiring, not assume it).
- Section B feasibility (Friendliness): PASS — `EmptyState` is a real exported component; `ActivityIndicator` is an established loading-state precedent elsewhere in the app; `isError`/`refetch` are available on all four consumed hooks. Minor clarification only: "skeleton" in the plan text means the existing `ActivityIndicator` pattern, not a new shimmer primitive (none exists) — noted in the checklist to avoid scope creep.
- Section C feasibility (Cleanup): PASS — the grep-based removal check is correctly scoped to exclude `features/cart/mock-cart.ts` (confirmed dev/demo-only, not the production cart default per `process/context/all-context.md`); no conflicts found.

Open gaps:
- `apps/mobile/src/features/home/components/rewards-teaser-card.tsx` (`RewardsTeaserCard`) is dead code — not imported anywhere in the app — and also depends on the soon-to-be-broken `RewardsAccount` (`points`/`tier`) shape. It is NOT in this phase's Blast Radius and does not block this phase. known-gap: documented as a non-blocking cleanup item for whoever next touches `features/home/components/` (Phase 6 UX polish is the natural place to either delete it or wire it up) — no separate backlog artifact created for this trivial, in-repo-visible item.
- Cross-phase `RewardProgressCard`/`StarProgressBar` prop-shape coordination (see Breaking changes finding above) cannot be fully closed until Phase 1 executes — carried as Execute-Agent Instruction E1.

Execute-Agent Instructions:
- E1: Before wiring Implementation Checklist A4 (rewards summary card), read the CURRENT `packages/ui/src/components/reward-progress-card.tsx` and `star-progress-bar.tsx` prop types. If Phase 1 already updated them to the new `StarBalance`/`TierProgress` shape, wire directly. If they are still on the old `RewardsAccount`/`RewardsTierProgress` shape, either (a) adapt the call site (map the new hook's data into the old shape — quick, low-risk) or (b) update the two component prop types (small, additive) — do NOT silently skip the rewards card or hard-code placeholder data. Document which path was taken in the phase report.

What this coverage does NOT prove:
- The grep/typecheck/lint gates prove absence of a stale import and static type correctness — they do NOT prove the screen actually renders correctly at runtime, that navigation still works, or that the visual layout is acceptable.
- The `menu-to-home-view.ts` unit test proves correct data flattening for the cases exercised — it does NOT prove `CategorySelector`/`ProductGrid` render the flattened data correctly on-device (that remains Agent-Probe).
- The Agent-Probe walkthroughs prove one manual pass at one point in time on one device/simulator — they do NOT provide regression protection against future changes (no RN component/E2E runner exists in this repo — project-wide gap, see `process/context/tests/all-tests.md`).
- None of these gates prove the Phase 1 dependency (`GET /rewards/balance`) actually returns correct data — that is proven by Phase 1's own `rewards.test.ts`, not by this phase's gates.

Gate: CONDITIONAL (0 FAILs; 4 CONCERNs — 3 fixed directly in this plan via PVL supplement [A1a, A2a, A5]; 1 carried as an execute-agent instruction [E1, cross-phase component-prop coordination] since it cannot be fully resolved until Phase 1 executes)
Accepted by: session (autonomous outer-PVL pass — no interactive user present in this subagent invocation; all mechanically-fixable concerns were applied directly to the plan text in this same pass; the one non-mechanically-fixable concern (E1) is a documented execute-time check, not a plan defect)
