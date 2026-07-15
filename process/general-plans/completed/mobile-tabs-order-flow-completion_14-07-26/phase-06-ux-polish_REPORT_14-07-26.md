---
phase: phase-06-ux-polish
date: 2026-07-15
status: COMPLETE_WITH_GAPS
feature: mobile-tabs-order-flow-completion
plan: process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-06-ux-polish_PLAN_14-07-26.md
---

# Phase 06 — Cross-Tab UX Polish — EXECUTE Report

TL;DR: All code items (B1, B1a, B2, B3, B4, C1, C2, C4) done and the full Exit Gate is green.
C3 (optional checkout jest test) was skipped honestly — the checkout screen crashes at render under
the shared jest reanimated mock (uses `FadeIn`/`SlideInDown`/`Easing`/`cancelAnimation`, none stubbed),
and extending the shared mock is out of this bounded phase's scope. Order flow un-regressed:
`orders.test.ts` 41/41 green. Status: COMPLETE_WITH_GAPS (the one gap = C3 optional/non-blocking).

## What Was Done

- **B1 — Branches react-query migration** (`apps/mobile/src/app/(tabs)/branches/index.tsx`): replaced
  the local `useEffect`/`useState`/`reloadToken` `apiFetch('/api/branches')` fetch with
  `useQuery(['branches','all'], getBranches)` (UNFILTERED canonical `/branches` endpoint — did NOT
  reuse `useBranch()`'s pre-filtered open-only list). `onRetry` now calls `refetch()`. `isPending`
  replaces `isFetching`; `isError` (aliased `fetchError`) replaces the manual error flag. Loading /
  error+retry / empty JSX and the per-item `getIsOpenNow` closed-badge logic are byte-preserved.
  Removed now-unused imports (`ApiBranch`/`mapApiBranch`, `apiFetch`, `useEffect`).
- **B1a — `priority` passthrough (the accepted backend carve-out), APPLIED not deferred:**
  - `packages/api/src/routes/lib/serializers.ts`: added `priority: number` to `ApiBranch` and
    `priority: branch.priority` to `serializeBranch()` (the DB column `branches.priority` already
    exists — additive response-shape passthrough, no migration, no logic change).
  - `apps/mobile/src/lib/api-client.ts`: added `priority: number` to `BranchResponse`. `getBranches()`
    already spreads `...branch`, so the field flows to `PickupBranch.priority` automatically — the
    screen's `sort((a,b) => (a.priority ?? 0) - (b.priority ?? 0))` no longer silently degrades.
- **B2 — Dev-link cleanup** (`apps/mobile/src/app/(tabs)/order/index.tsx`): replaced the 2
  `__DEV__`-gated "Dev: View Cart" / "Dev: Order History" links with a real in-screen header row
  (Menu heading + `cart-outline` and `receipt-outline` Ionicons Pressables, each with
  `accessibilityRole="button"` + label, routing to the real Cart and History screens). Removed the
  `DevLink` component and the `devLinks` style. Zero `"Dev:"` remain in `(tabs)`.
- **B3 — Pay-at-branch copy (copy-only):** added "Pay when you pick up — settle your order in cash or
  card at the branch counter." to checkout's Payment `Card` (`order/checkout.tsx`) and the
  confirmation screen (`order/confirmation/[orderId].tsx`). No `payment_status`, `useCheckout`, or any
  behavior changed.
- **B4 — a11y (bounded):** `order/checkout.tsx` confirm-drawer backdrop `Pressable` got
  `accessibilityRole="button"` + `accessibilityLabel="Dismiss order confirmation"` (the one confirmed
  bare target). `cart.tsx` and `coupons.tsx` confirmed to have ZERO bare `Pressable`/`TouchableOpacity`
  (all interaction goes through shared primitives that already carry roles) → correctly-scoped no-op.
- **C2 — New jest component test** (`apps/mobile/src/app/(tabs)/branches/index.test.tsx`, 4 tests, all
  pass): open+closed branches both render with correct Open/Closed badges (closed-branch regression
  guard), loading state, error+retry (retry re-runs the query), and ascending-`priority` sort order
  (AC6). Forces the web list-only render path and stubs the native-only `@gorhom/bottom-sheet` /
  `BranchMap` / `useUserLocation`; mocks `getBranches` and runs the real `useQuery` integration.
  Added inert `testID="branches-loading"` to the two loading `ActivityIndicator`s to support the
  loading assertion.

Files changed (7) + new (1):
- `packages/api/src/routes/lib/serializers.ts` (B1a)
- `apps/mobile/src/lib/api-client.ts` (B1a)
- `apps/mobile/src/app/(tabs)/branches/index.tsx` (B1 + testID)
- `apps/mobile/src/app/(tabs)/order/index.tsx` (B2)
- `apps/mobile/src/app/(tabs)/order/checkout.tsx` (B3 + B4)
- `apps/mobile/src/app/(tabs)/order/confirmation/[orderId].tsx` (B3)
- NEW `apps/mobile/src/app/(tabs)/branches/index.test.tsx` (C2)

## What Was Skipped or Deferred

- **C3 (optional checkout jest regression test)** — SKIPPED, non-blocking per the plan. The checkout
  screen uses reanimated entering/exiting animations (`FadeIn`/`FadeOut`/`SlideInDown`/`SlideOutDown`/
  `Easing`/`cancelAnimation`) at render time; none are in the shared `test-utils/jest-setup.ts`
  reanimated stub, so the screen throws on render (`undefined.duration`). Extending that shared mock
  is a test-infra change affecting every mobile jest test — outside this bounded phase's scope.
  `orders.test.ts` (C4) remains the hard order-flow regression gate.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| AC5 typecheck | `pnpm --filter @jojopotato/mobile typecheck` | PASS (exit 0) |
| AC5 lint | `pnpm lint` | PASS (exit 0) |
| AC5 format | `pnpm format:check` | PASS — all files Prettier-clean |
| AC1/AC6 + regression | `pnpm --filter @jojopotato/mobile test` | PASS — vitest 5 files/44 tests + jest 6 suites/23 tests (19 baseline + 4 new branches tests) |
| AC5 order-flow guard | `pnpm --filter @jojopotato/api test` | PASS — 17 files / 189 tests; `orders.test.ts` 41/41; `branches.test.ts` 7/7; `deals.test.ts` 13/13 |
| AC2 | `grep -rn "Dev:" apps/mobile/src/app/(tabs)` | PASS — 0 occurrences |

All Fully-Automated gates green. Agent-Probe rows (AC3 pay-at-branch copy clarity, AC4 a11y quality)
remain manual judgment — the copy/labels are present and read clearly on code review; no RN
screen-reader automation exists in this repo (standing project-wide gap).

## Plan Deviations (all within blast radius; none hard-stop)

1. `branches/index.tsx`: added `testID="branches-loading"` to the two loading `ActivityIndicator`s.
   Rationale: the plan's C2 requires a loading-state assertion; `testID` is the idiomatic query and
   the exported `RenderResult` type doesn't expose `UNSAFE_getByType`. Inert (presentation-only),
   inside a file already in the B1 blast radius.
2. B2 added `accessibilityRole`/`accessibilityLabel` to the new order-header Cart/History icons.
   Rationale: natural part of "real nav icons" + good a11y; within blast radius.
3. C3 not delivered — explicitly permitted skip (see above).

No auth/billing/schema/API-contract/container/secret surface touched. B1a is the only `packages/api`
change (additive response field of an existing DB column). `use-auth.ts` untouched. No high-risk
evidence pack required (presentation-only + additive field passthrough).

## Test Infra Gaps Found

- **Env, not code:** the API vitest suite needs a live Postgres on `:5432`. It was down at EXECUTE
  start (`ECONNREFUSED`) and Docker Desktop is not installed on this box. Brought up the native
  `postgresql@14` via `brew services start postgresql@14`, created a superuser `jojo` role
  (password `jojo`) + `postgres`/`jojopotato` databases; vitest `global-setup.ts` then created and
  migrated the ephemeral `jojopotato_test` DB itself. Matches the "native Postgres, not docker"
  gotcha in `process/context/tests/all-tests.md` (that doc's `systemctl` hint is Linux; this box is
  macOS/brew). No repo change made for this — it is a local-machine setup step.
- **Pre-existing, standing (not new):** no RN screen-reader / a11y-linter automation, and the shared
  jest reanimated mock (`test-utils/jest-setup.ts`) covers only `useAnimatedStyle`/`useSharedValue`/
  `withTiming`/`withSpring`/`interpolate(Color)` — it lacks the layout-animation exports
  (`FadeIn`/`FadeOut`/`SlideInDown`/`SlideOutDown`/`Easing`/`cancelAnimation`) needed to render any
  animation-heavy screen (checkout) under jest. Recommended future backlog item: extend the shared
  reanimated mock so checkout/animation screens become jest-testable (would unlock C3).

## Closeout Packet

- Selected plan: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-06-ux-polish_PLAN_14-07-26.md`
- Finished: B1, B1a, B2, B3, B4, C1, C2, C4 (all code + required tests). C3 skipped (optional).
- Verified: full Exit Gate green (typecheck/lint/format 0; mobile vitest 44 + jest 23; api 189 incl.
  orders 41; 0 "Dev:"). AC1/AC6 proven by the new `branches/index.test.tsx`.
- Still unverified (Agent-Probe): pay-at-branch copy wording clarity + a11y label quality on-device.
- Remaining cleanup: UPDATE PROCESS (archive phase, update umbrella `## Current Execution State`,
  refresh `all-context.md` if desired, commit). This is the FINAL phase → program-level closeout.
- Follow-up plan stubs created: none (C3 gap captured here + in the plan; no new plan file needed).
- CONTEXT_PARTIAL items: none.
- Best next state: `Ready for UPDATE PROCESS archival` (program complete pending closeout).

## Forward Preview

- **Test Infra Found:** native `postgresql@14` (brew) is the working API-test DB path on this box
  (Docker not installed); shared jest reanimated mock lacks layout-animation exports (blocks
  animation-screen jest tests).
- **Blast Radius Changes:** `serializeBranch()`/`ApiBranch`/`BranchResponse` now carry `priority`
  (additive). Branches tab now uses react-query `['branches','all']`. Order tab has a real header
  (Cart/History icons). Pay-at-branch copy on checkout + confirmation.
- **Commands to Stay Green:** `pnpm --filter @jojopotato/mobile typecheck && pnpm lint && pnpm format:check`;
  `pnpm --filter @jojopotato/mobile test`; `pnpm --filter @jojopotato/api test` (needs Postgres up:
  `brew services start postgresql@14`); `grep -rn "Dev:" apps/mobile/src/app/(tabs)`.
- **Dependency Changes:** none (no new packages; `priority` uses an existing DB column).
