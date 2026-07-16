---
phase: phase-03-home-rewire
date: 2026-07-15
status: COMPLETE
feature: mobile-tabs-order-flow-completion
plan: process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-03-home-rewire_PLAN_14-07-26.md
---

# Phase 03 — Home Tab Rewire — EXECUTE Report

TL;DR: The Home tab now renders 100% real data (branch / menu / deals / star balance) via
existing react-query hooks + one new rewards summary hook, with per-section friendly
loading / empty / error-with-retry states. Mock render path removed; dead `rewards-teaser-card.tsx`
deleted. All Fully-Automated Exit Gate gates are green (typecheck, lint, format, the new adapter
unit test 9/9, mock-home grep, file-deletion). Screen runtime behavior remains Agent-Probe
(no RN runner — project-wide gap).

## What Was Done

- **A1 / A1a — branch wiring + cart sync:** `MOCK_BRANCH` replaced with `useBranch()`. Added a
  `useEffect` in `(tabs)/index.tsx` syncing `selectedBranch.id → useCart().setBranch(id)` (keyed on
  `branchId`, `setBranch` no-ops on unchanged id) so `useDeals()` (which reads
  `cart.pickupBranchId`) gets a real branch without a manual branch-open.
- **A2 / A2a — menu wiring + pure adapter:** `MOCK_PRODUCTS`/`MOCK_CATEGORIES` replaced with
  `useMenu()` flattened through the NEW pure `apps/mobile/src/features/home/lib/menu-to-home-view.ts`
  (`flattenMenuForHome`): nested `Category[]`/`Product[]` → flat `MenuCategory[]`/`MenuItem[]`;
  derives `sortOrder` (array index), `categoryId` (parent), `priceCents` (← `basePriceCents`), and
  `isAvailable: true` (menu tree is server-filtered available-only). Covered by
  `__tests__/menu-to-home-view.test.ts` (9 vitest cases — multi-category, price mapping, empty menu,
  ordering, categoryId/sortOrder/isAvailable derivations, description/imageUrl passthrough).
- **A3 — live deals strip:** the static "Deals & offers" `Card` replaced with a horizontal
  `useDeals()`-backed strip of `@jojopotato/ui` `DealCard`s (fixed 260px width), tap →
  `router.push('/(tabs)/deals/deal/[dealId]')`.
- **A4 — rewards summary card:** `useRewardsSummary()` feeds `RewardProgressCard` (star balance) +
  `StarProgressBar` (progress). **E1 re-confirm (no adaptation needed):** both components already
  consume the tier-free `RewardsAccount`/`RewardsProgress` shapes (Phase 1 delivered this) — wired
  directly against current prop types, exactly as the inner-PVL Execute-Agent Instruction E1
  predicted.
- **A5 — `getRewardsBalance()` in `apps/mobile/src/lib/api-client.ts`:** returns the balance object
  directly (no-envelope, mirroring `getMenu`), typed `RewardsBalance = RewardsProgress & { lifetimeStars }`.
  New `useRewardsSummary()` hook (`features/rewards/hooks/use-rewards-summary.ts`, key
  `['rewards','balance']`) consumes it. **See Deviation D1** re: session-cookie attachment.
- **B1-B4 — friendliness:** per-section states — `ActivityIndicator` loader (via a local
  `SectionLoader`), `@jojopotato/ui` `EmptyState` for empty + error (error variants carry
  `actionLabel="Retry"` + `onAction=refetch`) across all 4 queries + a no-branch-selected empty
  state. Real navigation preserved (branch → detail, product → details, deal → detail); no dead
  mock links remain.
- **C1 — mock render-path removal:** `mock-home` import removed from `(tabs)/index.tsx`. `mock-home.ts`
  itself is KEPT on disk (still imported by `features/cart/mock-cart.ts`, the demo-only showcase seed
  explicitly excluded from this phase's scope per C1). The Exit-Gate grep scope
  (`app` + `features/home/components`) is clean.
- **C1a — dead-code delete:** `apps/mobile/src/features/home/components/rewards-teaser-card.tsx`
  deleted (zero importers; duplicate of `RewardProgressCard`).

## Files Changed

- **Modified:** `apps/mobile/src/app/(tabs)/index.tsx` (full rewrite — real hooks + friendly states)
- **Modified:** `apps/mobile/src/lib/api-client.ts` (added `getRewardsBalance()` + `RewardsBalance` type)
- **New:** `apps/mobile/src/features/home/lib/menu-to-home-view.ts`
- **New:** `apps/mobile/src/features/home/lib/__tests__/menu-to-home-view.test.ts`
- **New:** `apps/mobile/src/features/rewards/hooks/use-rewards-summary.ts`
- **Deleted:** `apps/mobile/src/features/home/components/rewards-teaser-card.tsx`

## Test Gate Outcomes (real results)

| Gate | Command | Result |
|---|---|---|
| Mobile typecheck | `pnpm --filter @jojopotato/mobile typecheck` | PASS (exit 0) |
| Lint (root) | `pnpm lint` | PASS (7/7 tasks; 0 errors; 3 pre-existing warnings in `dev-with-tunnel.mjs`, outside blast radius) |
| Adapter unit test | `pnpm --filter @jojopotato/mobile test` | PASS (2 files, 22 tests; new `menu-to-home-view.test.ts` 9/9) |
| Format | `pnpm format:check` | PASS (exit 0, after `prettier --write` on the 2 new/changed files) |
| Mock render-path grep | `grep -rn "mock-home" apps/mobile/src/app apps/mobile/src/features/home/components` | PASS (no match) |
| Dead-file deletion | `test -f .../rewards-teaser-card.tsx` | PASS (deleted) |
| Zero MOCK_ in home render path | `grep -rn "MOCK_" apps/mobile/src/features/home` (excl. `mock-home.ts`) | PASS (no match) |

## Plan Deviations

- **D1 (within-blast-radius, implementation detail) — `getRewardsBalance()` attaches the session
  cookie.** The plan (A5/E2) said to mirror `getMenu()`'s no-envelope fetch pattern. `getMenu` is a
  PUBLIC route; `/rewards/balance` is `requireSession`-gated (confirmed in the plan's own Dimension
  Findings). A verbatim public fetch would 401 and break AC1 ("real star balance"). Resolution:
  `getRewardsBalance()` keeps the no-envelope response parsing (the actual emphasis of A5/E2) but
  attaches `Cookie: authClient.getCookie()` — the same documented `@better-auth/expo` pattern
  `features/staff/lib/staff-api.ts`'s `staffFetch` already uses. Impact: none negative — stays inside
  the named Phase 3 touchpoint (`lib/api-client.ts`), touches no auth/schema/API-contract surface,
  reuses an established in-repo pattern. Classified within-blast-radius (library-call variation within
  the same semantic operation), not a hard-stop class.

No other deviations. `mock-home.ts` retained (not deleted) is per plan C1's explicit `mock-cart.ts`
exclusion, not a deviation.

## Test Infra Gaps Found

- None new. The pre-existing project-wide gap stands: **no RN component/E2E runner for `apps/mobile`.**
  The plan's Test Infra Improvement Note (extract pure viewmodel logic so it CAN be vitest-covered)
  was honored — the menu-flatten logic was extracted to `menu-to-home-view.ts` and unit-tested rather
  than inlined in the screen.

## Known-Gaps (Agent-Probe only — no automated coverage)

- Home real-data render (branch card / product grid / deals strip / rewards card render from live API).
- Friendly loading / empty / error+retry rendering across the 4 queries.
- Branch↔cart sync runtime behavior (deals strip reflecting the selected branch).
- Navigation (branch → detail, product → details, deal → detail).

These are Agent-Probe / Known-Gap by design (project-wide RN-runner gap) — NOT claimed as automated
coverage. A manual walkthrough is owed at Agent-Probe time.

## Closeout Packet

- **Selected plan:** `.../phase-03-home-rewire_PLAN_14-07-26.md`
- **Finished:** all checklist items (A1-A5, B1-B4, C1-C1a). All Fully-Automated gates green.
- **Verified:** typecheck, lint, format, adapter unit test (9/9), grep + file-deletion gates.
- **Unverified (Agent-Probe owed):** on-device Home render + friendliness walkthrough.
- **Best next state:** EVL confirmation run (orchestrator re-runs the validate-contract gates via
  vc-tester), then UPDATE PROCESS to archive the phase and advance to Phase 4 (Rewards/coupon UI).
- **Classification:** Keep in active/testing (code + automated gates complete; Agent-Probe walkthrough
  pending). Ready for EVL.

## Forward Preview

- **Test Infra Found:** `apps/mobile` vitest (node env, `src/**/*.test.ts`) reliably covers pure
  Home viewmodel logic — the extraction pattern (`menu-to-home-view.ts`) is reusable for future
  screen-data-shaping helpers. No RN render runner still.
- **Blast Radius Changes:** `apps/mobile/src/features/rewards/` created (new feature dir with
  `hooks/use-rewards-summary.ts`). `lib/api-client.ts` now imports `authClient` (first non-public
  authed call in that file). Phase 4 (Rewards UI) will extend `features/rewards/`.
- **Commands to Stay Green:** `pnpm --filter @jojopotato/mobile typecheck && pnpm lint && pnpm --filter @jojopotato/mobile test && pnpm format:check`.
- **Dependency Changes:** none (no new packages).
