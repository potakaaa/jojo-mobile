---
phase: phase-04-rewards-coupon-ui
date: 2026-07-15
status: COMPLETE
feature: mobile-tabs-order-flow-completion
plan: process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-04-rewards-coupon-ui_PLAN_14-07-26.md
---

# Phase 04 — Rewards Tab + Coupon Wallet UI — EXECUTE Report

**TL;DR:** Delivered the real Rewards tab (balance/progress/redeemable catalog with affordability
gating + redeem-confirm) and coupon wallet (status-grouped, adapter-driven `CouponCard`, redeem +
friendly inline 409), and stood up `apps/mobile`'s FIRST RN component test runner (jest-expo) with
the 3 empirically-proven fixes from the inner PVL. Exit Gate fully green: mobile typecheck clean,
mobile test **vitest 32/32 + jest 12/12**, ui regression **47/47**, root lint 0 errors,
format:check clean. Code + tests DONE; awaits orchestrator EVL confirmation run.

## What Was Done

**Step T — RN component test runner (first for `apps/mobile`):**
- `apps/mobile/package.json`: added devDeps `jest`, `jest-expo`, `@testing-library/react-native`,
  `@types/jest`, `react-test-renderer` (versions pinned identical to `packages/ui`), plus
  `@jest/globals` (see Deviations); `test` script → `vitest run --passWithNoTests && jest`.
- `apps/mobile/jest.config.js` (new): jest-expo preset, `testMatch: ['**/*.test.tsx']`,
  `setupFiles`, pnpm-aware `transformIgnorePatterns` copied verbatim from `packages/ui`.
- `apps/mobile/src/test-utils/jest-setup.ts` (new): hand-rolled `react-native-reanimated` mock
  (the official `/mock` crashes on this repo's 4.5.0/worklets-0.10.0 pin), an `expo-router` stub,
  and a global `@/features/auth/lib/auth-client` stub (see Deviations).
- `apps/mobile/src/test-utils/render.tsx` (new): async `renderWithProviders()` (awaits RTL render),
  `<SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>` fixed metrics, fresh per-render
  `QueryClient`, `spyOnAlert()` helper.
- `apps/mobile/src/test-utils/__tests__/runner-smoke.test.tsx` (new): EmptyState smoke test.

**Step A/B — Rewards + Coupon screens & data layer:**
- `apps/mobile/src/lib/api-client.ts`: added `ApiError` (carries HTTP status), a shared session-cookie
  `authedJson` helper, `getRewardsCatalog`/`redeemReward`/`getCoupons`/`redeemCoupon`, and the local
  `ApiCouponWithLabel` type; refactored `getRewardsBalance` onto `authedJson` (same behavior).
- Hooks: `features/rewards/hooks/{use-rewards-catalog,use-redeem-reward}.ts`,
  `features/coupons/hooks/{use-coupons,use-redeem-coupon}.ts` (react-query; redeem mutations
  invalidate `['rewards','balance']`,`['rewards','catalog']`,`['coupons']`).
- Pure logic: `features/coupons/lib/to-coupon-display.ts` (adapter),
  `features/rewards/lib/redeem-eligibility.ts` (affordability).
- Screens: `app/(tabs)/rewards/index.tsx` (real body — balance, progress, catalog with
  affordability-gated redeem + `Alert.alert` confirm, per-section loading/empty/error, "My coupons"
  entry replacing the removed dev link), `app/(tabs)/rewards/coupons.tsx` (real wallet — status
  grouping, `CouponCard` via adapter, redeem-confirm, inline 409). Both reuse `@jojopotato/ui` only.

**Step C — cleanup:** `Dev: View Coupons` link removed (grep count 0); affordability logic extracted
for unit coverage.

**Step D — real component tests:** `rewards-screen.test.tsx` (6), `coupons-screen.test.tsx` (5),
`to-coupon-display.test.ts` (5), `redeem-eligibility.test.ts` (5).

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Mobile typecheck | `pnpm --filter @jojopotato/mobile typecheck` | PASS (exit 0) |
| Mobile tests | `pnpm --filter @jojopotato/mobile test` | PASS — vitest 32/32 (+10 new) + jest 12/12 (3 suites) |
| UI regression | `pnpm --filter @jojopotato/ui test` | PASS — 47/47 |
| Root lint | `pnpm lint` | PASS — 0 errors (3 pre-existing warnings in `dev-with-tunnel.mjs`, unrelated) |
| Format | `pnpm format:check` | PASS — clean |

AC1 (Rewards) + AC2 (Coupons) are now Fully-Automated (jest-expo), not Agent-Probe-only. AC3
affordability + adapter are vitest-covered. AC-T (runner) proven via smoke + real screen tests.

## What Was Skipped or Deferred

- Real-device gesture / navigation-stack transitions remain Agent-Probe (Known-Gap) — no runner
  substitutes for a real device. Narrowed scope, as planned.
- End-to-end wiring (real API responses shape-matching the mocked hooks; real redeem→wallet
  round-trip) remains Agent-Probe — jest tests prove render + mocked-interaction, not live server.

## Plan Deviations (all within Phase 4 blast radius; none hard-stop class)

1. **Added `@jest/globals` devDep** (not in the plan's exact devDep list). Reason: under pnpm, tsc
   cannot resolve jest globals for typecheck; explicit `@jest/globals` imports match the repo's
   existing vitest explicit-import style and avoid gambling with the inherited expo `types` field.
2. **`expo-router` + `auth-client` mocks live in `jest-setup.ts` (global), not `render.tsx`.**
   `jest.mock` is file-scoped/hoisted, so global module mocks belong in `setupFiles`. Functionally
   equivalent to the plan's intent.
3. **Global `jest.mock('@/features/auth/lib/auth-client')` added** — REQUIRED, corrects PVL
   finding #2. The coupons screen imports `@/lib/api-client` directly (for `ApiError`), which
   transitively loads `@better-auth/*` ESM that jest can't transform. This is exactly the
   "different native module than reanimated" case the plan's BLOCKED-note anticipated; resolved by
   stubbing the auth-client module (test-only; no auth SOURCE touched — `use-auth.ts`/`auth-client.ts`
   are unchanged).
4. **`ApiError` class added + `getRewardsBalance` refactored onto shared `authedJson`** — needed for
   plan B3's friendly-409 requirement; DRY. Same runtime behavior; api-client.ts is in-scope.
5. **Coupon `discountLabel` is status-driven** ("Ready to use"/"Used"/"Expired") with `title` =
   `displayLabel` — matches the plan's "title=displayLabel, minimal/badge-driven discountLabel".

## Test Infra Gaps Found

- None blocking. `apps/mobile` now has a working RN component runner for this surface; other
  `apps/mobile` screens remain uncovered until similarly migrated (project-wide follow-up, not
  blocking). Durable reuse target for P5/P6: `test-utils/{render.tsx,jest-setup.ts}` — the
  reanimated/safe-area/async-render/auth-client fixes are proven, do not re-derive.

## Closeout Packet

- **Selected plan:** `.../phase-04-rewards-coupon-ui_PLAN_14-07-26.md` (Gate: PASS, inner-pvl phase-4)
- **Finished:** Steps T, A, B, C, D — all checklist items ticked.
- **Verified:** typecheck, mobile vitest+jest, ui regression, lint, format — all green (this agent's
  internal run). **Unverified:** independent EVL confirmation run (orchestrator spawns vc-tester);
  real-device Agent-Probe walkthrough.
- **Remaining:** EVL confirmation; then UPDATE PROCESS (umbrella state, context delta, commit).
- **Follow-up plan stubs created:** none.
- **CONTEXT_PARTIAL:** none.
- **Closeout classification:** Keep in active/testing until EVL confirmation completes.

## Forward Preview

- **Test Infra Found:** `apps/mobile` jest-expo runner + `test-utils/` helpers are the reusable base
  for all future `apps/mobile` component tests (P5 Account/profile, P6 UX polish).
- **Blast Radius Changes:** new `features/coupons/` folder; `api-client.ts` gained `ApiError` +
  session-cookie helpers; `apps/mobile` `test` script now runs two runners sequentially.
- **Commands to Stay Green:** `pnpm --filter @jojopotato/mobile test` (both runners),
  `pnpm --filter @jojopotato/ui test` (47/47), `pnpm --filter @jojopotato/mobile typecheck`,
  `pnpm lint`, `pnpm format:check`.
- **Dependency Changes:** +devDeps `jest`, `jest-expo`, `@testing-library/react-native`,
  `@types/jest`, `react-test-renderer`, `@jest/globals` (apps/mobile).
