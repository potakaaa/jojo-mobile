---
phase: reward-auto-redeem
date: 2026-07-21
status: COMPLETE_WITH_GAPS
feature: ordering-cart
plan: process/features/ordering-cart/active/reward-auto-redeem_21-07-26/reward-auto-redeem_PLAN_21-07-26.md
---

# Reward Auto-Redeem — EXECUTE Report

**TL;DR:** All 7 plan checklist items implemented; every Fully-Automated gate green (types/api/mobile
typechecks 0 errors, mobile 77 vitest + 101 jest, API 538/538, format:check clean). One-tap Redeem now
guards on branch, auto-adds the eligible reward item to cart (idempotent), applies the discount, and
routes to cart. **CODE DONE, not VERIFIED** — AC9 on-device Agent-Probe walkthrough owed by the user;
task folder stays in `active/`.

## What Was Done

| # | File | Change |
|---|---|---|
| 1 | `packages/types/src/rewards.ts` | Added `eligibleProductId: string \| null` to `Reward` (additive) + doc comment. |
| 2 | `packages/api/src/routes/rewards.ts` | Private `serializeReward` now emits `eligibleProductId: row.eligible_product_id ?? null`. |
| 3 | `apps/mobile/src/features/rewards/lib/find-eligible-menu-item.ts` (NEW) | Pure helper: finds the eligible `Product` in `menu.categories[].products`; null on no-id/no-menu/absent. |
| 4 | `apps/mobile/src/app/(tabs)/rewards/index.tsx` | `handleRedeem(tier: RewardTier)` rewrite: branch guard ("Pick a branch first to redeem your rewards." + navigate to `/(tabs)/branches`), auto-add eligible item via `addItem(productToMenuItem(product, true), [], 1)` (idempotent via `cart.items.some(i => i.menuItemId === ...)`), AC5 unavailable-stop toast, AC6 null-eligible passthrough. Added `useMenu()`, pulled `addItem` from `useCart()`. `onPress={() => handleRedeem(tier)}`. |
| 5 | `apps/mobile/src/features/rewards/lib/__tests__/derive-reward-tiers.test.ts` | Factory now includes `eligibleProductId: null`; added AC8 round-trip assertion. |
| 6 | `apps/mobile/src/features/rewards/lib/__tests__/find-eligible-menu-item.test.ts` (NEW) | 5 node-vitest cases: found / found-in-later-category / absent / null-id / undefined-menu. |
| 7 | `apps/mobile/src/app/(tabs)/rewards/__tests__/rewards-screen.test.tsx` (NEW) | jest-expo, 6 tests: AC1/AC3/AC4/AC5/AC6/AC7. |
| + | `packages/api/src/routes/__tests__/rewards.integration.test.ts` | Added 2 AC2 assertions (E3) — `/summary` target reward + `/available` rows carry non-null UUID. |

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| types typecheck | `tsc --noEmit` (@jojopotato/types) | 0 errors |
| api typecheck | `tsc --noEmit` (@jojopotato/api) | 0 errors |
| mobile typecheck | `tsc --noEmit` (@jojopotato/mobile) | 0 errors |
| mobile vitest (AC5-helper, AC8) | `pnpm --filter @jojopotato/mobile test` (vitest leg) | 77/77 (find-eligible 5, derive 7) |
| mobile jest (AC1/AC3/AC4/AC5/AC6/AC7) | `pnpm --filter @jojopotato/mobile test` (jest leg) | 101/101, 26 suites — rewards-screen 6/6 |
| api vitest (AC2) | `pnpm --filter @jojopotato/api test` | 538/538 (rewards suite 14/14) |
| format:check | prettier --check (touched files) | clean |
| lint (touched mobile) | eslint | 0 errors (1 pre-existing warning, not in scope) |
| AC9 on-device cart visual | Agent-Probe | **OWED — user-run, standing no-RN-E2E gap** |

## Plan Deviations

Both within blast radius, non-hard-stop, documented per §Deviation Handling:

1. **AC2 seed assertion (test-authoring correction).** Plan/E3 assumed a seeded discount reward with
   `null eligibleProductId` would exist (drawn from `data.ts`'s unused `seedRewards`). Ground truth:
   the live `runSeed()` uses `seed.ts`'s `REWARD_ROADMAP` — **all free_item rewards, each mapped to an
   eligible product** (5→classic-fries, 10→cheese-fries, 15→fries-corndog-combo, 20→cheese-fries). No
   null-eligible reward exists in the real seed. Removed the impossible
   `some(r => eligibleProductId === null)` assertion. Retained assertions prove AC2 exactly (field
   present on every row + non-null UUID for seeded rewards). The `null` branch of the `string | null`
   field is proven by the mobile vitest helper/derive tests and the AC6 jest test instead.
2. **`?? null` on the serializer** (E-safe): plan said `eligibleProductId: row.eligible_product_id`;
   the column is nullable FK so `?? null` normalizes `undefined`→`null` for wire-shape stability.
   Behavior-identical for a real DB row (column is `null` or a UUID).

## Test Infra Gaps Found

None new. Pre-existing `nextLockedThreshold` unused-var eslint warning in `derive-reward-tiers.test.ts:87`
(an existing test case I did not touch) — left as-is (out of scope).

## Closeout Packet

- **Selected plan:** `process/features/ordering-cart/active/reward-auto-redeem_21-07-26/reward-auto-redeem_PLAN_21-07-26.md`
- **What was finished:** All 7 checklist items; AC1–AC8 fully automated and green.
- **Verified vs unverified:** AC1–AC8 automated-verified. AC9 (on-device cart visual + tab badge) is
  Agent-Probe, owed by the user.
- **Cleanup/context remaining:** UPDATE PROCESS pass (context doc bullet, archival decision) after AC9.
- **Closeout classification:** **Keep in active/testing** — CODE DONE, AC9 Agent-Probe owed before
  archival per the plan's Phase Completion Rules.
- **Follow-up plan stubs created:** none.
- **CONTEXT_PARTIAL items:** none.

## Forward Preview

**Test Infra Found:** mobile jest-expo `getByRole('button', { name, disabled: true })` is the clean
pattern for asserting a Button's in-flight disabled state (used for AC7). `renderWithProviders` async +
`waitFor` on the final navigation absorbs the trailing `setApplying(false)` update.

**Blast Radius Changes:** `Reward` now carries `eligibleProductId` — any future `Reward` factory in a
test must include it (already updated in `derive-reward-tiers.test.ts`).

**Commands to Stay Green:** `pnpm --filter @jojopotato/mobile test` (vitest+jest), `pnpm --filter
@jojopotato/api test` (needs live Postgres — native pg on :5432 on this box), 3 typechecks, format:check.

**Dependency Changes:** none.
