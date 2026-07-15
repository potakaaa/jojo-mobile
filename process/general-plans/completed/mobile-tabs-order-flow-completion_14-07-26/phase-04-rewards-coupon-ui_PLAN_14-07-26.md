---
name: plan:mobile-tabs-order-flow-completion-phase-04-rewards-coupon-ui
description: "Mobile Tabs + Order-Flow Completion — Phase 04: real Rewards tab (balance/tier/redeem) + coupon wallet UI + new RN component test runner for apps/mobile"
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

**Inner-loop expansion (this supplement):** per explicit user instruction, implementations in this phase must have real verifying tests, not Agent-Probe deferrals wherever mechanically possible. `apps/mobile` currently has NO RN component/render test runner (only pure-TS vitest). This phase now ALSO stands up that runner (mirroring `packages/ui`'s existing jest-expo setup) as Step T, executed FIRST in EXECUTE, so the Rewards/Coupon screens below can be covered by real component tests instead of Agent-Probe-only.

**PVL re-run addendum (14-07-26, this pass):** the prior CONDITIONAL/STALE contract's "Section T feasibility: PASS" claim was empirically re-tested by actually installing the pinned devDeps and running jest against real repo files (`floating-tab-bar.tsx`, `ComingSoon`, `@jojopotato/ui`'s `EmptyState`) under a probe config copied verbatim from the plan's Step T2 recipe. The probe found 3 concrete gaps the plan text did not cover — all now fixed in Step T2/T4 below with proven-working code (see Validate Contract → Section T feasibility for the full empirical evidence). Two hypotheses from the original supplement were also independently confirmed as NON-issues (see below) — corrected accordingly.

## Phase Completion Rules

This phase is VERIFIED only when: all checklist items checked; the phase validate-contract exists with green gates; regression checks against overlapping earlier phases pass; and the phase report is written. Code-only completion is CODE DONE, never VERIFIED. Screen behavior not coverable even by the new RN component runner (real device gestures, real navigation stack transitions) is proven by Agent-Probe and recorded as Known-Gap. Post-phase testing uses the Exit Gate test gates (see process/context/tests/all-tests.md).

## Acceptance Criteria

- AC1: Rewards tab shows real balance/tier/catalog with redeem (Fully-Automated via new jest-expo component tests; Agent-Probe retained only for real-device/navigation confirmation).
- AC2: coupon wallet lists + redeems real coupons (Fully-Automated via new jest-expo component tests; Agent-Probe retained only for real-device/navigation confirmation).
- AC3: affordability/eligibility pure logic unit-tested (Fully-Automated); typecheck+lint green.
- AC-T (NEW): apps/mobile gains a working jest-expo RN component test runner, wired into the package's `test` script and CI's `pnpm turbo run test`, without disturbing the existing vitest pure-TS suite.

## Entry Gate

- Phase 1 exit gate passed (rewards balance/catalog/redeem routes). **Re-confirmed this pass: umbrella `## Current Execution State` lists Phase 1 as ✅ VERIFIED; `GET /rewards`, `GET /rewards/balance`, `POST /rewards/:id/redeem` read directly from `packages/api/src/routes/rewards.ts` and confirmed present with the exact shapes this plan consumes.**
- Phase 2 exit gate passed (coupons list/redeem routes). **Re-confirmed this pass: umbrella lists Phase 2 as ✅ VERIFIED; `GET /coupons`, `POST /coupons/:id/redeem` read directly from `packages/api/src/routes/coupons.ts` and confirmed present, including the `ApiCouponWithLabel.displayLabel` join this phase's adapter (B2) depends on.**

## Blast Radius

- `apps/mobile/package.json` — NEW devDeps: `jest`, `jest-expo`, `@testing-library/react-native`, `@types/jest`, `react-test-renderer` (pinned to the same versions `packages/ui` already uses: jest@^29.7.0, jest-expo@~57.0.1, react-test-renderer@19.2.3, @testing-library/react-native@^14.0.0); `test` script updated to run both vitest and jest.
- `apps/mobile/jest.config.js` — NEW. jest-expo preset + pnpm-aware `transformIgnorePatterns` copied verbatim from `packages/ui/jest.config.js` (the one known `.pnpm/`-segment gotcha, already solved there); `testMatch` scoped to `**/*.test.tsx` only (vitest keeps `*.test.ts`, no collision). **Additionally (empirically confirmed this pass): a `setupFiles: ['<rootDir>/src/test-utils/jest-setup.ts']` entry that installs the hand-rolled `react-native-reanimated` mock (see T2 below) — the official `react-native-reanimated/mock` export is CONFIRMED BROKEN for this repo's exact version pin (reanimated 4.5.0 + react-native-worklets 0.10.0) and crashes at import time even when `react-native-worklets` is separately mocked. No `moduleNameMapper` is needed for the `@/` alias — empirically confirmed to resolve correctly out of the box via the shared babel-preset-expo transform (same mechanism Metro uses), no extra config required.**
- `apps/mobile/src/test-utils/jest-setup.ts` — NEW (empirically required, added this pass). Registers `jest.mock('react-native-reanimated', () => ({ ... hand-rolled no-op stubs ... }))` globally via `setupFiles`, so individual test files never need to redeclare it. Exact working recipe (proven via a real jest run against `floating-tab-bar.tsx` in this repo):
  ```js
  jest.mock('react-native-reanimated', () => {
    const RN = require('react-native');
    return {
      __esModule: true,
      default: { View: RN.View, createAnimatedComponent: (C) => C },
      useAnimatedStyle: (fn) => fn(),
      useSharedValue: (v) => ({ value: v }),
      withTiming: (v) => v,
      withSpring: (v) => v,
      interpolate: (v) => v,
      interpolateColor: (v) => v,
    };
  });
  ```
  This is required because `floating-tab-bar.tsx` (imported transitively by any tab-root screen following the established `getFloatingTabBarClearance` pattern, which the new Rewards/Coupon screens are expected to follow per every other real tab-root screen in the repo) imports `react-native-reanimated` at module scope.
- `apps/mobile/vitest.config.ts` — verify only, no functional change; stays scoped to `src/**/*.test.ts` (pure-TS). Confirm its existing "do not expand to render RN components" comment is still accurate/updated to note jest now owns that role.
- `apps/mobile/src/test-utils/render.tsx` — NEW. Shared `renderWithProviders()` helper + standard mocks: `expo-router` (`useRouter`/`useLocalSearchParams`), a fresh `QueryClientProvider` per test, `authClient`/better-auth (`useSession`/`getCookie`), `expo-secure-store` (verify jest-expo auto-mock is sufficient — confirmed NOT exercised by Step D tests since D1/D2 mock the hooks directly, not authClient; kept for P5/P6 reusability), `Alert.alert` mock for confirm-dialog assertions. **Additionally (empirically confirmed this pass, MANDATORY — not optional):**
  1. `renderWithProviders()` MUST wrap children in `<SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>` where `TEST_SAFE_AREA_METRICS` is an explicit fixed object (`{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }`) — passing `initialWindowMetrics` (the library's own export) is INSUFFICIENT because it is `null` under jest (no real layout pass ever fires), which silently renders an EMPTY tree with no error. Any screen using `useSafeAreaInsets` (this includes every tab-root screen following the `ComingSoon`/floating-tab-bar pattern) needs this or its component test will find zero elements.
  2. `renderWithProviders()` MUST be an `async` function that `await`s the underlying `@testing-library/react-native` `render(...)` call and returns the awaited result. Empirically confirmed: `@testing-library/react-native@14.0.1` under React 19.2.3, in `apps/mobile`'s actual dependency graph (not packages/ui's — the packages differ in installed native-module set, notably `expo-font`/`@expo-google-fonts/*`), returns render() as a pending `Promise` rather than a synchronous `RenderResult`. Calling `.getByText(...)` on the un-awaited return value fails with `getByText is not a function` / `render function has not been called`. `packages/ui`'s own tests get away with the synchronous form only because `packages/ui` has no `expo-font` dependency in its tree — do NOT copy that pattern verbatim into `apps/mobile` tests. Step D tests (and T5's smoke test, if it queries by text/role) MUST use `await renderWithProviders(...)`.
  Reusable by later phases (P5/P6) needing screen tests — this file is the durable fix location for all 3 gotchas above; future screens do not need to rediscover them.
- `turbo.json` — verify only: confirm the `test` task already covers apps/mobile's updated `test` script output/config; no edit expected unless a gap is found. **Confirmed this pass: `turbo.json`'s `test` task has no `testMatch`/framework-specific config — it generically runs the workspace package's own `test` npm script (`cache: false`, `dependsOn: ["^build"]`). No edit needed.**
- `.github/workflows/ci.yml` — verify only: confirm `pnpm turbo run test` will pick up the jest run via the updated `test` script; no edit expected unless CI wiring proves insufficient (if so, add explicitly and note it). **Confirmed this pass: the `test` job runs `pnpm turbo run test` with no per-package overrides — it will run whatever `apps/mobile`'s `test` script does, including the new `vitest run --passWithNoTests && jest` two-runner sequence. No CI edit needed. (The main real CI risk was never turbo/CI wiring — it was the reanimated/SafeAreaProvider/async-render gotchas above, now fixed.)**
- `apps/mobile/src/app/(tabs)/rewards/index.tsx` — real Rewards screen (replace ComingSoon).
- `apps/mobile/src/app/(tabs)/rewards/coupons.tsx` — real coupon wallet screen (replace ComingSoon).
- `apps/mobile/src/lib/api-client.ts` — NEW functions: `getRewardsCatalog()`, `redeemReward(rewardId)`, `getCoupons(status?)`, `redeemCoupon(couponId)` — session-cookie pattern matching the existing `getRewardsBalance()`. **Confirmed this pass: these 4 function names are net-new — no existing exports of the same name in `api-client.ts` (only `getBranches`, `getMenu`, `getDeals`, `getDeal`, `getRewardsBalance` exist today). Pattern to follow is confirmed identical to `getRewardsBalance()`: `fetch` with `Cookie: authClient.getCookie()` header, `AbortController` timeout, throw on non-ok status.**
- `apps/mobile/src/features/rewards/hooks/{use-rewards-catalog,use-redeem-reward}.ts` — NEW react-query hooks (existing `use-rewards-summary.ts` hook is reused, not replaced).
- `apps/mobile/src/features/coupons/hooks/{use-coupons,use-redeem-coupon}.ts` — NEW react-query hooks (new `features/coupons/` folder).
- `apps/mobile/src/features/coupons/lib/to-coupon-display.ts` — NEW pure adapter: `ApiCouponWithLabel` → `CouponDisplay` (`title = displayLabel`, `isRedeemed = status === 'used'`, minimal/badge-driven `discountLabel`). Unit-testable in isolation. **Confirmed this pass: `ApiCouponWithLabel` (extends `ApiCoupon` with `displayLabel: string`) is real, exported from `packages/api/src/routes/lib/serializers.ts`, and IS the shape `GET /coupons` returns (`serializeCouponWithLabel`). The adapter is mechanically well-founded.**
- `packages/ui/src/components/{reward-progress-card,star-progress-bar,coupon-card}.tsx` — **RESOLVED (was CONDITIONAL, corrected by this supplement's RESEARCH, RE-CONFIRMED this pass by reading source + running the real test suite):** all three components are ALREADY reconciled to the real types — `RewardProgressCard({ rewards: RewardsAccount })`, `StarProgressBar({ progress: RewardsProgress })` (field-for-field match against `RewardsAccount{userId,currentStars,lifetimeStars}` / `RewardsProgress{currentStars,rewardThreshold,starsToNextReward}` in `packages/types/src/rewards.ts`), `CouponCard({ coupon: CouponDisplay })` (matches `CouponDisplay{id,code,title,discountLabel,expiresAt?,isRedeemed}` in `packages/types/src/coupons.ts` exactly). `pnpm --filter @jojopotato/ui test` re-run this pass: 47/47 green, including `reward-progress-card.test.tsx`, `star-progress-bar.test.tsx`, `coupon-card.test.tsx`. No further type work needed in `packages/ui`; the prior CONDITIONAL type-mismatch concern from the original validate-contract is fully stale and resolved. `packages/ui/src/components/empty-state.tsx` remains additive-only, unchanged.
- Remove the `rewards/index.tsx` `Dev: View Coupons` dev link (tracked debt: `process/general-plans/backlog/mobile-dev-nav-links-gating_NOTE_09-07-26.md`). **Confirmed this pass: target string is present and uniquely matchable at `apps/mobile/src/app/(tabs)/rewards/index.tsx` line 15.**

## Implementation Checklist

### Step T — RN component test runner setup (NEW — run FIRST in EXECUTE)

- [x] T1. Add devDeps to `apps/mobile/package.json`: `jest`, `jest-expo`, `@testing-library/react-native`, `@types/jest`, `react-test-renderer`, pinned to the exact versions already used in `packages/ui/package.json`. DONE — installed, versions match packages/ui.
- [x] T2. Create `apps/mobile/jest.config.js`: jest-expo preset + the pnpm-aware `transformIgnorePatterns` copied from `packages/ui/jest.config.js`; `testMatch: ['**/*.test.tsx']`; **`setupFiles: ['<rootDir>/src/test-utils/jest-setup.ts']`**. DONE — reanimated hand-rolled mock + expo-router stub in jest-setup.ts; no moduleNameMapper needed (@/ resolves out of the box).
- [x] T3. Update `apps/mobile`'s `test` script to `vitest run --passWithNoTests && jest`. DONE — `pnpm --filter @jojopotato/mobile test` runs vitest (22/22) then jest.
- [x] T4. Create `apps/mobile/src/test-utils/render.tsx`: async `renderWithProviders()` + fresh react-query `QueryClientProvider` + `<SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>` fixed metrics + `spyOnAlert()`. DONE. (expo-router mocked globally in jest-setup.ts instead of render.tsx — jest.mock is file-scoped/hoisted so global mocks belong in setupFiles; authClient/expo-secure-store not needed since D1/D2 mock hooks directly, per PVL finding 2.)
- [x] T5. Smoke component test (`src/test-utils/__tests__/runner-smoke.test.tsx`) rendering `EmptyState` via async `renderWithProviders`. DONE — passes; jest picked up by the package `test` script (turbo runs the same script).

### Step A — Rewards screen

- [x] A1. `useRewardsCatalog()` + `useRedeemReward()` hooks (react-query); reuse existing `useRewardsSummary()`. Added `getRewardsCatalog()`/`redeemReward()` (+ shared `authedJson` helper + `ApiError`) to `api-client.ts`. DONE.
- [x] A2. Rendered balance + progress (`RewardProgressCard`/`StarProgressBar`) + redeemable catalog (`RewardRow` with cost `Badge`). DONE.
- [x] A3. `useRedeemReward()` → `POST /rewards/:id/redeem`; invalidates `['rewards','balance']`+`['rewards','catalog']`+`['coupons']`; `Alert.alert` confirm before redeem (no optimistic decrement); unaffordable rewards disabled + "Need N more stars". DONE.
- [x] A4. Loading spinner + empty ("No rewards yet") + error-with-retry via `EmptyState`, per section. DONE.

### Step B — Coupon wallet

- [x] B1. `useCoupons()` → `GET /coupons`. Added `getCoupons(status?)` to `api-client.ts`. DONE (wallet groups client-side; optional status arg supported).
- [x] B2. `features/coupons/lib/to-coupon-display.ts` pure adapter `ApiCouponWithLabel`→`CouponDisplay` (title=displayLabel, isRedeemed=status==='used', status-driven `discountLabel`). Rendered via `CouponCard`; empty via `EmptyState`. DONE.
- [x] B3. `useRedeemCoupon()` → `POST /coupons/:id/redeem`; `Alert.alert` confirm; invalidates `['coupons']`; friendly inline 409 message (via `ApiError.status`), no crash. DONE.

### Step C — Wiring + cleanup

- [x] C1. Rewards index↔coupons nav preserved (friendly "My coupons" card replaces the removed `Dev: View Coupons` link — grep count 0). DONE.
- [x] C2. Extracted affordability pure logic to `features/rewards/lib/redeem-eligibility.ts` (vitest-covered). DONE.

### Step D — Screen component test coverage (NEW — depends on Step T)

- [x] D1. `rewards-screen.test.tsx` (jest, mocked hooks, `await renderWithProviders`): balance/progress/catalog render; unaffordable → disabled + "Need N more stars"; redeem → `Alert.alert` → mutation; loading/empty/error+retry. 6/6 green.
- [x] D2. `coupons-screen.test.tsx` (jest, `await renderWithProviders`): status grouping; `CouponCard` via adapter (displayLabel/status); empty; error+retry; redeem confirm→mutation; inline 409. 5/5 green.
- [x] D3. `to-coupon-display.test.ts` (vitest pure): title/isRedeemed/discountLabel across available/used/expired + expiresAt handling. 5/5 green. (Plus `redeem-eligibility.test.ts` 5/5 for AC3 affordability.)

## Exit Gate

```bash
pnpm --filter @jojopotato/mobile typecheck && pnpm lint
# Expected: exit 0 (re-confirmed clean this pass — no pre-existing typecheck errors remain in apps/mobile)

pnpm --filter @jojopotato/mobile test
# Expected: 0 failures — now runs BOTH vitest (pure-TS incl. redeem-eligibility, affordability, to-coupon-display) AND jest (rewards/coupons screen component tests)

pnpm --filter @jojopotato/ui test
# Expected: 0 failures (reward-progress-card / star-progress-bar / coupon-card regression, already reconciled — re-confirmed 47/47 green this pass)
```

- All checklist items checked, including Step T (runner) and Step D (screen component tests).
- Agent-Probe (Known-Gap, narrowed scope): only real-device gesture/navigation-stack confirmation remains manual — redeem-reward → coupon appears in wallet → redeem coupon round-trip on a real device/simulator.
- Phase report written to report destination above.

## Blockers That Would Justify BLOCKED Status

- Phase 1 or Phase 2 routes not available (entry gate not met).
- A required redeem/coupon card variant needs a `packages/ui` component that expands into a design task beyond scope (route to Phase 6 or follow-up).
- jest-expo runner setup (Step T) hits an unresolvable pnpm-workspace module-resolution conflict with the existing vitest config (would require isolating the two runners into separate packages — out of scope; if hit, route to a follow-up plan and fall back to Agent-Probe for Step D only, not the whole phase). **UPDATE this pass: the specific conflict class anticipated here (reanimated/native-module incompatibility under jest) was hit and empirically resolved — see Blast Radius/Step T2 for the proven fix. This blocker is now considered LOW residual risk, not triggered, for Step T/D specifically. Retained verbatim as a general safety net for any *other* unresolvable conflict Step T might still surface during EXECUTE (e.g. a different native module than reanimated).**

## Phase Loop Progress

- [x] 1. RESEARCH — research-agent: prior phase reports read; test context loaded; UI component reuse mapped (found ALREADY reconciled — see Blast Radius correction); RN test runner feasibility confirmed low-risk via packages/ui precedent
- [x] 2. INNOVATE — innovate-agent: real-test-first decision locked (user mandate: no Agent-Probe deferral where mechanically avoidable) → build new jest-expo runner in apps/mobile mirroring packages/ui
- [x] 3. PLAN-SUPPLEMENT — plan-agent: phase plan updated (this supplement — Step T + Step D added, Blast Radius/Touchpoints/Verification Evidence updated); further updated by this PVL pass with 3 empirically-found jest-expo gotchas and their proven fixes
- [x] 4. PVL — vc-validate-agent: full V1-V7 re-run against the supplemented plan, INCLUDING a live empirical probe (real devDep install + real jest runs against real repo files, then fully reverted) — see Validate Contract below
- [x] 5. EXECUTE — all checklist items done (T→A→B→C→D); Exit Gate green: mobile typecheck clean, mobile test vitest 32/32 + jest 12/12, ui regression 47/47, root lint 0 errors, format:check clean
- [x] 6. EVL — all EVL gates green; follow-up stubs registered; EVL HANDOFF SUMMARY written (orchestrator spawns vc-tester) — confirmed independently: typecheck clean, mobile test vitest 32/32 + jest 12/12, ui regression 47/47, lint clean, format:check clean; jest tests confirmed to assert real behavior
- [x] 7. UPDATE PROCESS — phase report written (`phase-04-rewards-coupon-ui_REPORT_14-07-26.md`), umbrella state updated; commit still pending (orchestrator to invoke vc-git-manager)

**Validate-contract: PASS this pass — see Validate Contract section below. EXECUTE may proceed.**

## Inner Loop Refresh Note

- Date: 2026-07-14 (supplement pass, same calendar day as initial validate-contract — treat as newer for re-validation purposes since it postdates the contract's synthesis)
- Trigger: explicit user instruction — implementations must have real verifying tests, not Agent-Probe deferrals, wherever mechanically possible.
- Changes made:
  1. Added Step T — new jest-expo RN component test runner for `apps/mobile` (mirrors `packages/ui`'s existing setup: same pinned dep versions, same pnpm-aware `transformIgnorePatterns` recipe). Wired into `apps/mobile`'s `test` script so `pnpm turbo run test` covers it in CI without a separate CI edit (verify-only step included in case it isn't sufficient).
  2. Added Step D — real jest-expo component tests for both Rewards and Coupon-wallet screens (balance/catalog render, disabled-when-unaffordable state, redeem confirm→mutation flow, loading/empty/error states, coupon status grouping, adapter-driven CouponCard rendering, inline 409 handling) plus a pure vitest suite for the new `to-coupon-display.ts` adapter.
  3. Upgraded AC1/AC2 and their Verification Evidence rows from Agent-Probe to Fully-Automated (component-test-covered); Agent-Probe/Known-Gap is now narrowed to ONLY real-device gesture/navigation-stack confirmation, not full screen-behavior verification.
  4. RESOLVED the prior CONDITIONAL finding: `packages/ui`'s `RewardProgressCard`/`StarProgressBar`/`CouponCard` were found, during this supplement's research, to be ALREADY reconciled to the real types (`RewardsAccount`, `RewardsProgress`/`RewardsBalance`, `CouponDisplay`) — the original validate-contract's Section A/Section B CONCERNs (type-shape mismatch) and the associated Open Gaps are stale. Blast Radius corrected accordingly.
  5. Blast Radius/Touchpoints expanded to cover the new runner infra files (`jest.config.js`, `test-utils/render.tsx`, `package.json` devDeps, `turbo.json`/CI verify-only).
- Net effect: PVL must re-run from V1 against this updated plan — the previous CONDITIONAL gate (Section A/B CONCERNs, CROSS-PHASE Known-Gap) needs re-assessment now that (a) the type-mismatch root cause is resolved and (b) two of the previously Agent-Probe-only ACs now have real automated coverage. The CROSS-PHASE coupon-display-label gap is UNCHANGED by this supplement — `ApiCouponWithLabel.displayLabel` already provides the join Phase 2 needed; the adapter (B2 / to-coupon-display.ts) consumes it directly, so that Known-Gap is now considered ALSO RESOLVED (not just narrowed) — confirmed during this PVL re-run.

## PVL Re-Validation Findings (this pass, 14-07-26)

Ran a full V1–V7 re-validation, including a live empirical probe (not just source reading): temporarily added the exact pinned Step T devDeps to `apps/mobile/package.json`, ran `pnpm install`, wrote throwaway `*.probe.test.tsx` files exercising the plan's exact jest.config.js recipe against REAL repo files (`floating-tab-bar.tsx`, `ComingSoon`, `@jojopotato/ui`'s `EmptyState`), iterated to a fully green result, then reverted `package.json`/`pnpm-lock.yaml` via `git checkout` and deleted all probe files. Baseline `pnpm --filter @jojopotato/mobile test` (22/22) and `pnpm --filter @jojopotato/ui test` (47/47) re-confirmed green post-revert.

**Findings:**
1. **CONFIRMED NOT AN ISSUE:** the `@/` TS-path alias resolves correctly under jest-expo without any `moduleNameMapper` (shares babel-preset-expo's transform with Metro). No fix needed.
2. **CONFIRMED NOT AN ISSUE (for Step D's specific test scope):** `expo-secure-store`/`authClient` are never exercised by Step D tests since D1/D2 mock the hooks directly, not the underlying auth client. `test-utils/render.tsx`'s authClient mock is defensive/reusable infra for future phases, not load-bearing for this phase's own gates.
3. **REAL GAP, NOW FIXED IN PLAN TEXT:** `react-native-reanimated@4.5.0` + `react-native-worklets@0.10.0` (this repo's exact pin) crashes at import time under jest-expo — `TypeError: Cannot read properties of undefined (reading 'loadUnpackers')` — even when using the library's OWN documented `react-native-reanimated/mock` export (that mock still transitively imports the broken worklets initializer chain in v4). A hand-rolled mock (stub the handful of APIs actually used: `Animated.View`/`createAnimatedComponent`, `useAnimatedStyle`, `useSharedValue`, `withTiming`, `withSpring`, `interpolate`, `interpolateColor`) is REQUIRED and PROVEN WORKING via a real jest run against `floating-tab-bar.tsx`. This matters because any tab-root screen following the established `getFloatingTabBarClearance` pattern (near-certain for the new Rewards/Coupon screens, matching every other real tab-root screen in the repo) transitively imports reanimated at module scope.
4. **REAL GAP, NOW FIXED IN PLAN TEXT:** any component using `useSafeAreaInsets`/`SafeAreaProvider` (this includes `ComingSoon` and, by the same universal pattern, the new Rewards/Coupon screens) renders an EMPTY tree under jest unless `renderWithProviders()` wraps with `<SafeAreaProvider initialMetrics={...}>` using an EXPLICIT fixed metrics object — the library's own `initialWindowMetrics` export is `null` under jest (no real layout pass ever fires) and silently produces zero rendered elements with no thrown error, which is a dangerous silent-failure mode for assertion-based tests.
5. **REAL GAP, NOW FIXED IN PLAN TEXT:** `@testing-library/react-native@14.0.1`'s `render()` returns a pending `Promise` (not a synchronous `RenderResult`) in `apps/mobile`'s actual dependency graph — confirmed via a real jest run and `console.log`-based inspection of the return value. `packages/ui`'s own tests use the synchronous form and pass, but `packages/ui` has no `expo-font`/`@expo-google-fonts/*` dependency in its tree, which is the most likely differentiator (icon-font loading becoming Suspense-gated once `expo-font` is present). Step D tests MUST use `await renderWithProviders(...)`, not the synchronous destructure pattern.

All 3 real gaps are cheap, mechanical, and already proven working — folded directly into Blast Radius/Step T2/Step T4 above with the exact working code. Net effect: Section T feasibility moves from "PASS (assumed, CI-wiring was the only named risk)" to "PASS (empirically proven, 3 additional real risks found and fixed)". This is materially different and stronger evidence than the prior pass had.

## Touchpoints

- `apps/mobile/package.json`, `apps/mobile/jest.config.js` (new), `apps/mobile/vitest.config.ts` (verify), `apps/mobile/src/test-utils/render.tsx` (new), `apps/mobile/src/test-utils/jest-setup.ts` (new)
- `turbo.json` (verify), `.github/workflows/ci.yml` (verify)
- `apps/mobile/src/app/(tabs)/rewards/index.tsx`, `.../rewards/coupons.tsx`
- `apps/mobile/src/lib/api-client.ts`
- `apps/mobile/src/features/rewards/hooks/*`, `apps/mobile/src/features/coupons/hooks/*`, `apps/mobile/src/features/coupons/lib/to-coupon-display.ts`
- `packages/ui/src/components/{reward-progress-card,star-progress-bar,coupon-card,empty-state}.tsx` (regression only, no edits expected)
- `*.test.ts` / `*.test.tsx` files across the above

## Public Contracts

- No API changes — consumes Phase 1 + Phase 2 routes.
- Rewards tab navigation (index ↔ coupons) preserved; dev link removed.
- New: `apps/mobile`'s `test` script contract changes shape (now runs vitest + jest sequentially) — any downstream tooling that greps/parses the `test` script output should be aware it now covers two runners.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| jest-expo runner boots + smoke test passes (incl. reanimated hand-rolled mock + SafeAreaProvider fixed metrics, both empirically proven this pass) | Fully-Automated | AC-T (new runner works) |
| Redeem-eligibility/affordability pure logic (unit test) | Fully-Automated | AC-2 (redeem gating) |
| `to-coupon-display.ts` adapter mapping (available/used/expired) | Fully-Automated | AC-2 |
| typecheck + lint green | Fully-Automated | AC-5 |
| `packages/ui` reward/coupon component regression (`reward-progress-card.test.tsx`, `star-progress-bar.test.tsx`, `coupon-card.test.tsx`) | Fully-Automated | AC-1, AC-2 |
| Rewards screen component test (balance/catalog render, disabled-when-unaffordable, redeem confirm→mutation, loading/empty/error), rendered via `await renderWithProviders(...)` | Fully-Automated (jest-expo, NEW) | AC-1 |
| Coupon wallet component test (status grouping, CouponCard render via adapter, redeem confirm→mutation, inline 409), rendered via `await renderWithProviders(...)` | Fully-Automated (jest-expo, NEW) | AC-2 |
| Real-device gesture/navigation-stack walkthrough | Agent-Probe (Known-Gap for automation — narrowed scope) | AC-7 |

```bash
pnpm --filter @jojopotato/mobile test
# Expected: 0 failures (vitest + jest)

pnpm --filter @jojopotato/ui test
# Expected: 0 failures
```

## Test Infra Improvement Notes

- **RESOLVED by this supplement, empirically re-confirmed this PVL pass:** `apps/mobile` previously had NO RN component/render test runner (project-wide gap noted in `process/context/tests/all-tests.md`). Step T adds a jest-expo runner mirroring `packages/ui`'s existing setup (same pinned versions, same pnpm-aware `transformIgnorePatterns` recipe), PLUS a hand-rolled `react-native-reanimated` mock and an explicit-metrics `SafeAreaProvider` wrapper that `packages/ui` never needed (it has no reanimated/safe-area-context usage in its tested components). This closes the gap for THIS screen surface; other `apps/mobile` screens remain uncovered until similarly migrated (note as a project-wide follow-up in the phase report, not blocking this phase). **Durable finding for future phases (P5/P6, and any other `apps/mobile` RN component-test work): reuse `test-utils/render.tsx` and `test-utils/jest-setup.ts` as-is rather than re-deriving the reanimated/safe-area/async-render fixes — they are proven working, not just theorized.**
- Real-device gesture/navigation-stack behavior remains Agent-Probe only — no jest-expo/RN Testing Library setup can substitute for an actual device/simulator interaction; this is the correctly-narrowed residual, not a silently-passed gap.
- `packages/ui`'s existing `reward-progress-card.test.tsx`/`star-progress-bar.test.tsx`/`coupon-card.test.tsx` were confirmed this pass (both by reading source AND by running `pnpm --filter @jojopotato/ui test`, 47/47 green) to already target the reconciled real types.

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-04-rewards-coupon-ui_PLAN_14-07-26.md`
- Last completed step: PVL (Step 4) — this pass ran full V1-V7 with a live empirical probe; Gate: PASS.
- Validate-contract status: PASS (14-07-26, generated-by: inner-pvl: phase-4) — see Validate Contract section below.
- Supporting context: Phase 1 + Phase 2 reports (route contracts, re-confirmed by direct source read this pass), `packages/ui/src/index.ts` (available components, confirmed already reconciled + regression-tested), `packages/ui/jest.config.js` (runner recipe copied + extended this pass with the 3 empirically-found fixes).
- Next step: Spawn vc-execute-agent for Step T (run FIRST), then Steps A/B/C/D per the checklist above. Follow the exact Step T2/T4 code in Blast Radius verbatim — it is proven working, not illustrative.

## Validate Contract

Status: PASS
Date: 15-07-26
date: 2026-07-15
generated-by: inner-pvl: phase-4
supersedes: 2026-07-14 (outer-pvl) — inner PVL has current evidence (live empirical probe, not just source inspection)

Parallel strategy: sequential (single-context validate pass with direct Bash/Read tool access; Layer 1 + Layer 2 analysis performed via file inspection AND a live empirical probe — install real devDeps, run real jest, revert — rather than a multi-agent fan-out, since the dominant open question (does jest-expo + reanimated 4.5/worklets 0.10 actually work in this repo?) could only be resolved by direct execution, not parallel reasoning)
Rationale: Signal score ~2/7 (S6 money-adjacent surface present; S7 5+ blast-radius files present) → MEDIUM in the abstract, but the actual gating uncertainty this pass was a single empirical runtime question best resolved by one agent running one probe to completion rather than fanning out.

Test gates (5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC3 | Redeem-eligibility / affordability pure logic (can-afford check against current vs required stars) | Fully-Automated | `pnpm --filter @jojopotato/mobile test` — new `apps/mobile/src/features/rewards/__tests__/redeem-eligibility.test.ts` | B |
| AC3/AC5 | Mobile app typecheck + lint stay green with new hooks/screens | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck && pnpm lint` — re-confirmed clean baseline this pass (0 pre-existing errors) | A |
| AC1/AC2 | `RewardProgressCard`/`StarProgressBar`/`CouponCard` render correctly against Phase-1-reconciled prop shapes (regression, not new behavior) | Fully-Automated | `pnpm --filter @jojopotato/ui test` — existing `reward-progress-card.test.tsx`, `star-progress-bar.test.tsx`, `coupon-card.test.tsx` — re-run this pass, 47/47 green | A |
| AC5 | "Dev: View Coupons" dev link removed from `rewards/index.tsx` | Fully-Automated | `grep -c "Dev: View Coupons" "apps/mobile/src/app/(tabs)/rewards/index.tsx"` expect `0` (target string confirmed present at line 15 this pass) | B |
| AC-T | jest-expo runner boots under this repo's exact reanimated 4.5.0/worklets 0.10.0/RTL 14.0.1/React 19.2.3 pin, including a tab-root screen shape (reanimated import + SafeAreaProvider) | Fully-Automated | `pnpm --filter @jojopotato/mobile test` — new smoke test in Step T5, using the proven `test-utils/jest-setup.ts` + `render.tsx` recipe | A (proven this pass via live probe, not just planned) |
| AC1 | Rewards screen: real balance/tier/catalog render; redeem below-threshold disabled+messaged; redeem at/above-threshold → confirm → success → coupon appears in wallet | Fully-Automated (jest-expo, mocked hooks) + Agent-Probe (real-device only) | `pnpm --filter @jojopotato/mobile test` — Step D1, via `await renderWithProviders(...)`; Agent-Probe: manual walkthrough for real-device/navigation confirmation only | B |
| AC2 | Coupon wallet: real coupons list (Available/Used/Expired); redeem an available coupon; re-redeem attempt shows friendly inline 409 | Fully-Automated (jest-expo, mocked hooks) + Agent-Probe (real-device only) | `pnpm --filter @jojopotato/mobile test` — Step D2, via `await renderWithProviders(...)`; Agent-Probe: manual walkthrough for real-device/navigation confirmation only | B |
| AC5/AC7 | Loading skeleton + empty (zero stars / zero coupons) + error-with-retry states on both screens | Fully-Automated (jest-expo, mocked hooks) + Agent-Probe (real-device only) | `pnpm --filter @jojopotato/mobile test` — Step D1/D2 loading/empty/error assertions; Agent-Probe: real-device confirmation only | B |
| CROSS-PHASE | `GET /coupons` response has no human-readable label without a join to the linked reward/deal | N/A — resolved, no gate needed | `packages/api/src/routes/lib/serializers.ts`'s `ApiCouponWithLabel.displayLabel` confirmed present via direct source read this pass; `to-coupon-display.ts` (B2) consumes it directly | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist: T1-T5 stand up the runner incl. the 3 empirically-proven fixes; D1-D3 add the screen/adapter tests; C1 removes dev link; C2 extracts pure logic; Exit Gate already runs typecheck/lint)
- C — deferred to a named later phase/plan (none remaining this pass)
- D — backlog test-building stub (named residual; keep-active; continue) — narrowed to real-device/navigation-only, see Verification Evidence

Legacy line form (retained so existing validate-contract consumers still parse):
- Rewards/coupon affordability logic: Fully-automated: `pnpm --filter @jojopotato/mobile test` | Fully-automated: `pnpm --filter @jojopotato/mobile typecheck && pnpm lint` | Fully-automated (regression, re-confirmed 47/47): `pnpm --filter @jojopotato/ui test` | Fully-automated (NEW, jest-expo, empirically proven working incl. reanimated/safe-area/async-render fixes): rewards/coupon screen component tests | agent-probe (narrowed): real-device gesture/navigation confirmation only | known-gap: none remaining

Failing stub (AC3 — redeem-eligibility):
```
test("should disable redeem when currentStars < requiredStars and show 'need N more stars'", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: redeem-eligibility / affordability check")
})
```

Failing stub (AC-T — runner smoke test, proven-working recipe must be used verbatim):
```
test("renders a trivial component (EmptyState) under the new jest-expo runner without throwing", async () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: jest-expo runner smoke test (use test-utils/jest-setup.ts + render.tsx exactly as specified in Blast Radius)")
})
```

Failing stub (AC1 — Rewards screen component test, NEW):
```
test("disables redeem button and shows 'need N more stars' when unaffordable", async () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: Rewards screen affordance/redeem-gating render (use await renderWithProviders)")
})
```

Failing stub (AC2 — Coupon wallet component test, NEW):
```
test("shows friendly inline error on re-redeem of an already-used coupon (409)", async () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: coupon wallet re-redeem 409 handling (use await renderWithProviders)")
})
```

Failing stub (AC3/AC5 — typecheck+lint): N/A — static-analysis command gate, not a behavior-assertion test; compliance is exit-code based.

Failing stub (AC1/AC2 — packages/ui regression): N/A — EXISTING test files, already green (47/47 confirmed this pass). This phase's EXECUTE re-runs them as a regression gate only.

Failing stub (AC5 — dev-link removal): N/A — grep-based structural check, not a behavior test.

Dimension findings:
- Infra fit: PASS — Phase 4's consumed routes (`GET/POST /api/rewards*`, `GET/POST /api/coupons*`) confirmed present via direct source read of `packages/api/src/routes/{rewards,coupons}.ts` this pass, matching this plan's checklist exactly. Minor observational note (unchanged): checklist abbreviates routes without the `/api` prefix — cosmetic only, matches the existing api-client base-URL-prefix pattern used elsewhere.
- Test coverage: PASS, STRENGTHENED — screen behavior for AC1/AC2 has real Fully-Automated jest-expo coverage; the runner itself was LIVE-PROBED (not just planned) against real repo files this pass, surfacing and fixing 3 concrete gotchas (reanimated mock, SafeAreaProvider metrics, async render) that would otherwise have broken Step D silently or loudly during EXECUTE. Not vacuously green — every Fully-Automated claim in the table above traces to either a re-run existing test suite (47/47, 22/22) or a proven-working new recipe.
- Breaking changes: PASS — no new API contracts introduced; existing Rewards nav preserved; dev-link removal is additive cleanup. `apps/mobile`'s `test` script now runs two runners sequentially — noted in Public Contracts; confirmed this pass that `turbo.json`/CI need no edit (generic `test` script invocation).
- Security surface: PASS — redeem mutations only send an id (session-gated per Phase 1/2 routes, confirmed via direct source read of `rewardsRouter.post('/:id/redeem', ...)` and `couponsRouter.post('/:id/redeem', ...)` this pass — both server-derive the amount/stars, never trust client input); consistent with the umbrella's hard safety constraint ("Star/coupon mutations are server-authoritative").
- Section A feasibility (Rewards screen): PASS — `RewardProgressCard`/`StarProgressBar` confirmed already reconciled via direct source read (prop types match `RewardsAccount`/`RewardsProgress` field-for-field). Highest-risk edit remains A3 (redeem mutation + confirm) — mitigated by the STAFF-003 `Alert.alert` confirm precedent, now covered by a proven-working jest-expo component test recipe (D1).
- Section B feasibility (Coupon wallet): PASS — `CouponCard(CouponDisplay)` confirmed already reconciled via direct source read; the `title`/`discountLabel`/`isRedeemed` gap is closed via `to-coupon-display.ts` consuming `ApiCouponWithLabel.displayLabel`/`status`, both confirmed present in `packages/api/src/routes/lib/serializers.ts` this pass. Now also covered by a proven-working jest-expo component test recipe (D2) plus a pure vitest adapter test (D3).
- Section C feasibility (Wiring + cleanup): PASS — dev-link removal target string confirmed present and uniquely matchable at `apps/mobile/src/app/(tabs)/rewards/index.tsx:15` this pass; C2 extraction is low-risk and mechanically clear.
- Section T feasibility (RN test runner): PASS, upgraded from theoretical to EMPIRICALLY PROVEN this pass — a live probe (real devDep install, real jest runs against real repo files, then fully reverted) found and fixed 3 concrete gaps (reanimated mock, SafeAreaProvider fixed metrics, async `render()`) that the original plan text did not cover and that would have caused Step D tests to fail or silently render empty trees if EXECUTE had followed the original Step T4 spec verbatim. `testMatch` scoping (`*.test.tsx` for jest, `*.test.ts` for vitest) re-confirmed to avoid runner collision — both suites ran together cleanly during the probe.

Open gaps: none remaining.
What this coverage does NOT prove:
- The jest-expo component tests (D1/D2) prove render + mocked-interaction correctness against MOCKED hooks/data — they do NOT prove the real API responses shape-match what the mocks assume, nor real navigation-stack behavior. That end-to-end wiring remains Agent-Probe (narrowed scope).
- The `packages/ui` component regression gate proves the components still RENDER without throwing against whatever fixture shape is passed in — it does NOT prove Phase 4's screens pass the correct real data into these components at runtime (partially covered by D1/D2's mocked-hook assertions, but not a full E2E proof).
- typecheck/lint prove structural/type correctness only — they do not prove the redeem mutation, cache invalidation, or 409-handling behave correctly against a REAL server at runtime (D1/D2 prove it against mocks).
- The dev-link-removal grep proves the string is gone from the file — it does not prove navigation between Rewards and Coupons still works after removal (Agent-Probe covers that).
- No automated coverage proves real-device gesture/navigation-stack transitions work — that remains the sole Agent-Probe/Known-Gap residual.
- The empirical probe run this PVL pass proved the runner recipe works against `floating-tab-bar.tsx`/`ComingSoon`/`EmptyState` specifically — it does NOT prove every possible future component combination is reanimated/safe-area-safe; EXECUTE should still run the real Step T5 smoke test (not just trust this PVL pass's probe) before building on top of it.

Gate: PASS (0 FAILs, 0 CONCERNs — all findings from the prior CONDITIONAL contract resolved and re-confirmed with fresh evidence this pass, including 3 additional gaps found via live empirical probing and fixed in plan text before this contract was written)
Accepted by: session (validate-agent, 15-07-26) — no user acceptance of open concerns needed; net gate is a clean PASS, not CONDITIONAL.
