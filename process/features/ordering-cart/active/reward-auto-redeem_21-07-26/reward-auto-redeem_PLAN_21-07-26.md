---
name: plan:reward-auto-redeem
description: "Wire reward Redeem to auto-add the eligible item to cart at the selected branch, apply the discount, and route to cart"
date: 21-07-26
feature: ordering-cart
---

# Reward Auto-Redeem — Implementation Plan (SIMPLE)

**Date**: 21-07-26
**Feature**: ordering-cart
**Complexity**: SIMPLE
**Status**: CODE NOT STARTED

**TL;DR:** Thread `eligibleProductId` (already in `rewards` DB column + admin `ApiReward`) through the private customer `serializeReward` and the shared `Reward` type, then rewrite `handleRedeem` on the rewards screen to look the eligible product up in `useMenu()`, auto-add it (idempotent) via `addItem(menuItem, [], 1)`, apply the reward discount, and route to cart — with a pure `findEligibleMenuItem` helper and jest/vitest coverage for AC1–AC8.

---

## Overview

Today, tapping Redeem on the Jojo Potato rewards screen errors unless the eligible item is already in the cart — customers must manually hunt for the item first. This plan makes Redeem one-tap: find the tier's eligible product in the selected branch's `useMenu()` result, silently auto-add it (idempotent), apply the reward discount, and open the cart. The prerequisite data gap — `eligibleProductId` is in the `rewards` DB column and admin `ApiReward` but stripped by the customer-facing `serializeReward` — is closed additively. Context router: `process/context/all-context.md`. Test routing: `process/context/tests/all-tests.md`.

## Goals

- Make Redeem a one-tap flow: auto-add eligible item → apply discount → open cart.
- Surface `eligibleProductId` to the customer-facing rewards endpoint and shared type (additive, wire-safe).
- Cover the flow with automated tests (node-vitest for pure logic + API integration; jest for the screen).

## Scope

In scope: the 7 files below. Out of scope (per SPEC §Out Of Scope): auto branch-select, options picker, resume-after-branch-pick replay, star-balance mechanics, new reward types, `apps/admin`, multi-item tiers, per-tier loading state.

---

## Ground-Truth Corrections (confirmed against repo, 21-07-26)

The decision-summary snippets differ from live code. **Use the confirmed values below, not the snippet literals:**

| Decision snippet said | Actual repo truth | Action |
|---|---|---|
| `cart.branchId` | `cart.pickupBranchId` | Use `cart.pickupBranchId` for the branch guard. |
| branch-guard toast "pick a branch" | current toast: `"Select a pickup branch and add the reward item to your cart first."` | Change wording to contain `"pick a branch"` (AC1 asserts case-insensitive substring). |
| `tier.reward.eligibleProductId` | correct — `RewardTier.reward: Reward`; add field to `Reward` (not `RewardTier`) | No `RewardTier` shape change. |
| public `serializeReward` "already has field via shared ApiReward" | the customer route `packages/api/src/routes/rewards.ts` has its OWN private `serializeReward` that omits it; `serializers.ts` `ApiReward`/`serializeReward` (line 784/789) already has `eligibleProductId` mapping `reward.eligible_product_id` | Edit the **private** `serializeReward` in `rewards.ts` (add `eligibleProductId: row.eligible_product_id`). |
| — | no jest `*.test.tsx` exists for the rewards screen yet | Create it new. |

Column name confirmed: `eligible_product_id` (serializers.ts:796). `useMenu()` returns `UseQueryResult<MenuResponse>` — read `.data` for the `MenuResponse`.

---

## Touchpoints

| # | File | Change |
|---|---|---|
| 1 | `packages/types/src/rewards.ts` | Add `eligibleProductId: string \| null` to `Reward` (additive). |
| 2 | `packages/api/src/routes/rewards.ts` | Private `serializeReward` emits `eligibleProductId: row.eligible_product_id`. |
| 3 | `apps/mobile/src/features/rewards/lib/find-eligible-menu-item.ts` | NEW pure helper. |
| 4 | `apps/mobile/src/app/(tabs)/rewards/index.tsx` | Rewrite `handleRedeem`; add `useMenu()`; import helper + `productToMenuItem`. |
| 5 | `apps/mobile/src/features/rewards/lib/__tests__/derive-reward-tiers.test.ts` | Update `reward()` factory + assertions to carry `eligibleProductId`. |
| 6 | `apps/mobile/src/features/rewards/lib/__tests__/find-eligible-menu-item.test.ts` | NEW node-vitest tests for the helper. |
| 7 | `apps/mobile/src/app/(tabs)/rewards/__tests__/rewards-screen.test.tsx` | NEW jest component tests (AC1, AC3–AC7). |

**Note:** `deriveRewardTiers` needs NO source change — `RewardTier.reward: Reward` already carries whatever fields `Reward` has, so once the `Reward` type gains `eligibleProductId` it round-trips for free (AC8 is a test-only change). No `derive-reward-tiers.ts` source edit.

## Public Contracts

- **`Reward` interface** (`@jojopotato/types`) gains `eligibleProductId: string | null` — additive, no rename/removal. All consumers keep compiling; the new field is `null` for rewards without an eligible product.
- **`GET /rewards/summary` and `GET /rewards/available`** response bodies gain `reward.eligibleProductId` — additive JSON field, wire-safe (existing clients ignore unknown/new fields).
- **`findEligibleMenuItem(eligibleProductId, menu)`** — new pure export: `(string | null, MenuResponse | undefined) => Product | null`.
- No new backend routes. No `useCart` API change (`addItem(menuItem, [], 1)` is the existing contract).

## Blast Radius

- **7 files** (2 source edits, 1 new pure helper, 1 screen rewrite, 3 test files: 1 edit + 2 new).
- **Packages:** `packages/types`, `packages/api`, `apps/mobile`.
- **Risk class:** LOW. No schema/migration (`eligible_product_id` column already exists). No auth/billing surface. The one wire change is an additive read-only JSON field. Highest-risk item is the screen rewrite (`handleRedeem`) — covered by AC1/AC3–AC7 jest tests.

---

## Acceptance Criteria

- **AC1** — No branch selected (`cart.pickupBranchId` null): tapping Redeem shows a toast containing "pick a branch" (case-insensitive), navigates to `/(tabs)/branches`, cart unchanged.
- **AC2** — `Reward.eligibleProductId` (`string | null`) present in `packages/types` `Reward`, in `GET /rewards` response body, and in the `RewardTier` derived shape; a seeded reward's real UUID arrives intact.
- **AC3** — Branch set + eligible item in menu + not in cart: item added once, discount applied, navigate to cart.
- **AC4** — Eligible item already in cart: no `addItem` call, discount applied, navigate to cart.
- **AC5** — Branch set + eligible item absent from branch menu: error toast, stay on rewards screen, cart unchanged.
- **AC6** — Reward with `eligibleProductId: null`: no auto-add, existing `resolveAndApplyDeal` apply path runs, no crash.
- **AC7** — Redeem button disabled + loading from tap until completion, re-enabled on completion.
- **AC8** — `deriveRewardTiers()` propagates `eligibleProductId` unchanged from input `Reward[]` to output `RewardTier[]`.
- **AC9** — (Agent-Probe) After successful redeem, cart shows the auto-added item + reward discount line; tab badge updates.

---

## Implementation Checklist

1. **`packages/types/src/rewards.ts`** — add `eligibleProductId: string | null;` to the `Reward` interface (place after `isActive`). Update the interface doc comment to note the field is a `products.id` UUID or `null`.

2. **`packages/api/src/routes/rewards.ts`** — in the private `serializeReward(row)`, add `eligibleProductId: row.eligible_product_id,` to the returned object. (Column confirmed as `eligible_product_id`; `RewardRow = typeof rewards.$inferSelect` already exposes it.) No other field changes.

3. **`apps/mobile/src/features/rewards/lib/find-eligible-menu-item.ts`** (NEW) — pure helper:
   ```ts
   import type { MenuResponse, Product } from '@jojopotato/types';

   /**
    * Find the eligible reward product within a branch menu tree. Returns null when
    * there is no eligible product id, no menu yet, or the product is absent from
    * the branch's menu (unavailable / inactive / deal-with-unavailable-components,
    * since useMenu() only returns orderable products). Pure — node-vitest testable.
    */
   export function findEligibleMenuItem(
     eligibleProductId: string | null,
     menu: MenuResponse | undefined,
   ): Product | null {
     if (!eligibleProductId || !menu) return null;
     return menu.categories.flatMap((c) => c.products).find((p) => p.id === eligibleProductId) ?? null;
   }
   ```
   Confirm `MenuResponse.categories[].products` shape against `packages/types/src/menu.ts` before finalizing; adjust the traversal only if the field names differ.

4. **`apps/mobile/src/app/(tabs)/rewards/index.tsx`** — rewrite `handleRedeem`. Add imports:
   - `import { useMenu } from '@/features/menu/hooks/use-menu';`
   - `import { findEligibleMenuItem } from '@/features/rewards/lib/find-eligible-menu-item';`
   - `import { productToMenuItem } from '@/features/cart/lib/product-to-menu-item';`
   Add `const menuQuery = useMenu();` alongside the other hooks (top of component, before early returns). Pull `addItem` from `useCart()` (currently only `cart`/`applyDiscount` are destructured — add `addItem`).
   Change `handleRedeem` signature to receive the tier (or `code` + `eligibleProductId`) so it can access `tier.reward.eligibleProductId`. New flow:
   1. `if (applying) return; setApplying(true);` (unchanged global lock — SPEC-accepted).
   2. Branch guard: `if (!cart.pickupBranchId) { showToast('Pick a branch to use your rewards.', 'error'); router.push('/(tabs)/branches'); return; }` — wording MUST contain "pick a branch" (case-insensitive). No cart mutation. (AC1)
   3. `const eligibleProductId = tier.reward.eligibleProductId;`
   4. If `eligibleProductId` is set: `const product = findEligibleMenuItem(eligibleProductId, menuQuery.data);`
      - If `product === null`: `showToast("This reward item isn't available at your current branch.", 'error'); return;` (stay on screen, cart unchanged). (AC5)
      - Else if not already in cart (`!cart.items.some((i) => i.menuItemId === eligibleProductId)`): `const ok = await addItem(productToMenuItem(product, true), [], 1); if (!ok) { showToast('Could not add the reward item. Please try again.', 'error'); return; }` (AC3). If already in cart, skip add (AC4).
   5. If `eligibleProductId` is `null`: skip the auto-add block entirely — fall straight through to the existing apply path (AC6, degrade gracefully).
   6. Existing apply path: `const result = await resolveAndApplyDeal(code, cart, cart.pickupBranchId); if (!result.ok) { showToast(result.message, 'error'); return; } applyDiscount(result.discount); router.push('/(tabs)/cart');`
   7. `finally { setApplying(false); }` (unchanged — powers AC7 button disable via `applying`).
   Update the `onPress` call site to pass the tier: `onPress={() => handleRedeem(tier)}` (or `handleRedeem(tier.couponCode!, tier.reward.eligibleProductId)`), keeping `disabled={applying} loading={applying}`.

5. **`apps/mobile/src/features/rewards/lib/__tests__/derive-reward-tiers.test.ts`** — update the `reward()` factory to include `eligibleProductId: null` in the default object; add one test asserting `deriveRewardTiers([reward('a', 5, { eligibleProductId: 'prod-123' })], ...).tiers[0].reward.eligibleProductId === 'prod-123'` (AC8 round-trip fidelity).

6. **`apps/mobile/src/features/rewards/lib/__tests__/find-eligible-menu-item.test.ts`** (NEW, node-vitest) — cases: (a) found in menu → returns the `Product`; (b) id present but absent from menu → `null` (AC5 backing); (c) `eligibleProductId === null` → `null`; (d) `menu === undefined` → `null`. Use a minimal `MenuResponse` fixture built from the real `menu.ts` shape.

7. **`apps/mobile/src/app/(tabs)/rewards/__tests__/rewards-screen.test.tsx`** (NEW, jest-expo) — render the screen with mocked hooks (`useCart`, `useMenu`, `useRewardsSummary`, `useAvailableRewards`, `useMyCoupons`, `useRewardsHistory`, `useToast`, `resolveAndApplyDeal`, `expo-router`). Cover:
   - AC1: empty `pickupBranchId` → tap Redeem → toast contains "pick a branch" (case-insensitive) + `router.push('/(tabs)/branches')` + `addItem` not called.
   - AC3: branch set + eligible product in menu + empty cart → `addItem` called with the mapped `menuItem` + `router.push('/(tabs)/cart')`.
   - AC4: eligible product already in `cart.items` → `addItem` NOT called + discount applied + navigate to cart.
   - AC5: branch set + eligible product absent from menu → error toast + no navigation + `addItem` not called.
   - AC6: `eligibleProductId: null` tier → no crash, no `addItem`, existing `resolveAndApplyDeal` path invoked.
   - AC7: after tapping Redeem, assert button `disabled` in pending state, re-enabled after resolution.
   Follow the existing jest-expo mocking conventions (see `packages/ui` component tests and any existing `apps/mobile` jest specs).

8. **Run all verification gates** (see Verification Evidence) and fix any failures inline before handoff.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/api test` — GET /rewards/summary + /available response include `reward.eligibleProductId` (non-null for seeded reward with id, null otherwise) | Fully-Automated (vitest, packages/api) | AC2 |
| `pnpm --filter @jojopotato/mobile test` (vitest) — `find-eligible-menu-item.test.ts` found/absent/null-id/undefined-menu cases green | Fully-Automated (node-vitest, apps/mobile) | AC5 (helper), design correctness |
| `pnpm --filter @jojopotato/mobile test` (vitest) — `derive-reward-tiers.test.ts` `eligibleProductId` round-trip assertion green | Fully-Automated (node-vitest, apps/mobile) | AC8 |
| `pnpm --filter @jojopotato/mobile test:jest` (or the app's jest-expo command) — `rewards-screen.test.tsx` AC1/AC3/AC4/AC5/AC6/AC7 green | Fully-Automated (jest-expo, apps/mobile) | AC1, AC3, AC4, AC5, AC6, AC7 |
| `pnpm --filter @jojopotato/types typecheck` + `--filter @jojopotato/api typecheck` + `--filter @jojopotato/mobile typecheck` — 0 errors | Fully-Automated (tsc) | additive-type/wire safety (AC2 constraints) |
| `pnpm format:check` on touched files clean | Fully-Automated | commit hygiene |
| On-device: tap Redeem on a tier with configured `eligibleProductId` → item + discount line appear in cart, tab badge updates | Agent-Probe (no RN E2E runner — standing project-wide gap) | AC9 |

**TDD stubs (Fully-Automated rows, for execute-agent red-first):**
```
test("AC1: no branch → toast 'pick a branch' + navigate to branches, cart unchanged", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: AC1"); })
test("AC3: eligible item available + empty cart → addItem + navigate to cart", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: AC3"); })
test("AC4: eligible item already in cart → skip addItem, apply discount, navigate", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: AC4"); })
test("AC5: eligible item absent from branch menu → error toast, stay on screen", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: AC5"); })
test("AC6: eligibleProductId null → no auto-add, existing apply path, no crash", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: AC6"); })
test("AC7: Redeem button disabled while in-flight, re-enabled on completion", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: AC7"); })
test("AC2: GET /rewards response includes reward.eligibleProductId", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: AC2"); })
test("AC8: deriveRewardTiers propagates eligibleProductId unchanged", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: AC8"); })
```

**Confirm exact test commands** against `process/context/tests/all-tests.md` during EXECUTE — the mobile jest vs vitest split and the exact `packages/api` test preconditions (`docker compose up -d` + `db:migrate`) live there. AC2 requires a seeded reward with a non-null `eligible_product_id`; VALIDATE confirmed `runSeed()` sets it (5-star reward → `classic-fries` slug), so the AC2 assertion can target the existing seeded reward — no new fixture seed needed.

## Test Infra Improvement Notes

(none identified yet — a jest-expo `*.test.tsx` for the rewards screen is being introduced by this plan, extending screen-level coverage in `apps/mobile`, which historically had none.)

---

## Phase Completion Rules

- **CODE DONE** = all 7 checklist items implemented and every Fully-Automated gate in the Verification Evidence table is green (API vitest, mobile vitest, mobile jest, three typechecks, format:check).
- **VERIFIED** = CODE DONE **plus** the AC9 Agent-Probe on-device walkthrough performed and confirmed by the user.
- The task folder stays in `active/` until VERIFIED. Per the standing project-wide no-RN-runner gap, AC9 is user-run and owed before archival — do NOT move to `completed/` on CODE DONE alone.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/ordering-cart/active/reward-auto-redeem_21-07-26/reward-auto-redeem_PLAN_21-07-26.md`
2. **Last completed step:** none — plan written, VALIDATE complete (CONDITIONAL/PASS-eligible contract written below), EXECUTE not started.
3. **Validate-contract status:** written 21-07-26 (see `## Validate Contract` below).
4. **Supporting context loaded:** SPEC (same task folder), `packages/types/src/rewards.ts`, `packages/api/src/routes/rewards.ts` (+ `serializers.ts` ApiReward), `apps/mobile` rewards screen + `derive-reward-tiers.ts` + `product-to-menu-item.ts` + `use-menu.ts` + `use-cart.ts`, existing `derive-reward-tiers.test.ts` + `rewards.integration.test.ts`, `process/context/all-context.md`.
5. **Next step for a fresh agent:** EXECUTE checklist steps 1→8 in order (types → API → helper → screen → tests), honoring the Ground-Truth Corrections table and the Execute-Agent Instructions (E1–E4) in the validate-contract verbatim. Run all Fully-Automated gates and fix inline; the Agent-Probe AC9 walkthrough is owed by the user before the task folder leaves `active/`.

---

## Validate Contract

Status: CONDITIONAL
Date: 21-07-26
date: 2026-07-21
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: signal score 1/7 (only S1 multi-package present). LOW-risk, self-contained, 7-file ordered dependency chain — one opus execute-agent. No fan-out.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC2 | `GET /rewards/summary` + `/available` responses carry a non-null `reward.eligibleProductId` UUID for the seeded 5-star reward | Fully-Automated | `pnpm --filter @jojopotato/api test` — assertion added to existing `rewards.integration.test.ts` (both endpoints) | A |
| AC5-helper | `findEligibleMenuItem` returns the Product when present; null on absent/null-id/undefined-menu | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (vitest) — new `find-eligible-menu-item.test.ts` | B |
| AC8 | `deriveRewardTiers` propagates `eligibleProductId` input→output unchanged | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (vitest) — `derive-reward-tiers.test.ts` round-trip assertion | B |
| AC1 | No branch → toast contains "pick a branch" + navigate to `/(tabs)/branches` + cart unchanged | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (jest) — `rewards-screen.test.tsx` | B |
| AC3 | Branch set + eligible in menu + empty cart → `addItem` once + navigate to cart | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (jest) — `rewards-screen.test.tsx` | B |
| AC4 | Eligible already in cart → no `addItem`, discount applied, navigate | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (jest) — `rewards-screen.test.tsx` | B |
| AC6 | `eligibleProductId: null` → no auto-add, existing apply path, no crash | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (jest) — `rewards-screen.test.tsx` | B |
| AC7 | Redeem button disabled while in-flight, re-enabled on completion | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (jest) — `rewards-screen.test.tsx` | B |
| AC9 | Cart shows auto-added item + reward discount line; tab badge updates | Agent-Probe | On-device tap-Redeem walkthrough (no RN E2E runner) | D |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist; C — deferred to named later phase; D — backlog test-building stub (named residual).

Legacy line form:
- packages/api serializeReward: Fully-automated: `pnpm --filter @jojopotato/api test` (precondition: live migrated Postgres — `docker compose up -d` + `db:migrate`, or native Postgres per tests/all-tests.md)
- apps/mobile find-eligible-menu-item + derive-reward-tiers: Fully-automated: `pnpm --filter @jojopotato/mobile test` (vitest leg)
- apps/mobile rewards-screen handleRedeem (AC1/AC3/AC4/AC5/AC6/AC7): Fully-automated: `pnpm --filter @jojopotato/mobile test` (jest leg)
- typechecks: Fully-automated: `pnpm --filter @jojopotato/{types,api,mobile} typecheck` — 0 errors
- format:check: Fully-automated: `pnpm format:check` on touched files
- AC9 on-device cart visual: known-gap: Agent-Probe (standing project-wide no-RN-E2E gap) — documented, user-run

**Failing stub (AC2, Fully-Automated):**
`test("AC2: GET /rewards response includes reward.eligibleProductId", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: AC2") })`

**Failing stub (AC5-helper, Fully-Automated):**
`test("findEligibleMenuItem: found/absent/null-id/undefined-menu cases", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: AC5-helper") })`

**Failing stub (AC8, Fully-Automated):**
`test("AC8: deriveRewardTiers propagates eligibleProductId unchanged", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: AC8") })`

**Failing stub (AC1, Fully-Automated):**
`test("AC1: no branch → toast 'pick a branch' + navigate to branches, cart unchanged", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: AC1") })`

**Failing stub (AC3, Fully-Automated):**
`test("AC3: eligible item available + empty cart → addItem + navigate to cart", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: AC3") })`

**Failing stub (AC4, Fully-Automated):**
`test("AC4: eligible item already in cart → skip addItem, apply discount, navigate", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: AC4") })`

**Failing stub (AC6, Fully-Automated):**
`test("AC6: eligibleProductId null → no auto-add, existing apply path, no crash", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: AC6") })`

**Failing stub (AC7, Fully-Automated):**
`test("AC7: Redeem button disabled while in-flight, re-enabled on completion", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: AC7") })`

Dimension findings:
- Infra fit: PASS — no container/proxy/worker/port surfaces; all 7 target paths verified on disk; `useMenu().data` is `MenuResponse`; `menu.categories[].products` traversal confirmed against real `menu.ts`.
- Test coverage: PASS — all runners confirmed live (packages/api vitest self-seeding via `runSeed()`; apps/mobile vitest node + jest-expo component). AC1–AC8 all Fully-Automated; AC9 Agent-Probe (standing no-RN-E2E gap). 25 existing apps/mobile jest specs establish the mocking convention.
- Breaking changes: PASS — `Reward` gains `eligibleProductId` additively; `serializeReward` emits an additive JSON field (wire-safe); `findEligibleMenuItem` new export; no `useCart`/route contract change. `handleRedeem` signature change is screen-internal.
- Security surface: PASS — no auth/billing/secrets/trust-boundary change. `eligibleProductId` is a read-only product UUID already public via `GET /branches/:id/menu` and already emitted by admin API; session-gated customer route. No new write path.
- Section A — Touchpoints 1–2 (types + serializer): PASS — both edit targets uniquely matchable; `RewardRow = typeof rewards.$inferSelect` exposes `eligible_product_id` (schema `uuid('eligible_product_id')` confirmed). Additive, no collision.
- Section B — Touchpoint 3 (find-eligible-menu-item helper): PASS — new file, no collision; traversal verified against real `menu.ts`; pure, node-vitest testable.
- Section C — Touchpoint 4 (handleRedeem rewrite): CONCERN — highest-risk edit. Signature/arg ambiguity (pass full `tier`) and toast-wording contract; both resolved via E1/E2. `tier.couponCode!` non-null assertion is safe (button only renders for `unlocked`). `showToast(msg, 'error')` confirmed valid (`ToastSeverity` includes `'error'`).
- Section D — Touchpoints 5–7 (tests): CONCERN — AC2 fixture: existing self-seeding `rewards.integration.test.ts` runs against `runSeed()` which now seeds `eligible_product_id` non-null (5-star reward → `classic-fries`), so AC2 can assert the existing seeded reward — no new fixture seed. Resolved via E3.

Open gaps: none blocking. AC9 on-device cart-visual walkthrough is a named Agent-Probe residual (standing project-wide no-RN-E2E gap), owed by the user before the task folder leaves `active/`. No new backlog note needed (already tracked in `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`).

What this coverage does NOT prove:
- The AC1/AC3/AC4/AC5/AC6/AC7 jest tests mock `useCart`/`useMenu`/`resolveAndApplyDeal`/`expo-router` — they prove `handleRedeem` control flow, NOT the real cart mutation round-trip, real menu fetch, or real navigation stack.
- The AC2 API test proves the wire field is present with a non-null UUID for the seeded reward; it does NOT prove the mobile screen reads it (that path is covered by the mocked jest AC3/AC4 tests, not by an end-to-end fetch).
- No automated test proves the on-device visual result (item + discount line in cart, tab badge) — AC9 Agent-Probe only.
- Live-integration between the real `packages/api` response shape and the real mobile parse is NOT exercised (mobile tests mock the hooks) — standing project-wide gap noted in `tests/all-tests.md`.

Execute-agent instructions:
- E1: Change `handleRedeem` to accept the full `tier: RewardTier`. Read `tier.couponCode!` (safe — Redeem button only renders when `status === 'unlocked'`, which sets `couponCode`) and `tier.reward.eligibleProductId`. Update `onPress={() => handleRedeem(tier)}`.
- E2: Branch-guard toast must contain "pick a branch" (case-insensitive) to satisfy AC1. The plan's "Pick a branch to use your rewards." is compliant. Use `severity: 'error'` (valid `ToastSeverity`).
- E3: Add AC2 assertions to the EXISTING `packages/api/src/routes/__tests__/rewards.integration.test.ts` (do NOT create a new API test file) for both `/summary` and `/available`. `runSeed()` seeds `eligible_product_id` non-null (5-star reward → `classic-fries`), so assert the seeded reward's `eligibleProductId` is a non-null UUID; no extra fixture seed needed.
- E4: `packages/api` vitest needs a live migrated Postgres (`docker compose up -d` + `db:migrate`, or the native local Postgres per `tests/all-tests.md` dev-machine note). The new `rewards-screen.test.tsx` jest spec must include the global `expo-router` stub + `jest.mock('@/features/auth/lib/auth-client')` (required whenever a screen transitively imports `@/lib/api-client`) and use `await renderWithProviders(...)` per `apps/mobile/src/test-utils/render.tsx`.

Gate: CONDITIONAL (2 minor CONCERNs, both resolved via execute-agent instructions E1–E3; 0 FAILs; every developed AC1–AC8 behavior has a Fully-Automated gate; AC9 named Agent-Probe residual)
Accepted by: session (autonomous validate — single self-contained plan, no active /goal). Accepted concerns: C1 handleRedeem arg shape (→ E1), C2 branch-guard toast wording (→ E2), C3 AC2 fixture location (→ E3). All three are informational execute-agent instructions requiring zero plan-text changes.

## Autonomous Goal Block

```
SESSION GOAL: Reward Auto-Redeem — one-tap Redeem auto-adds the eligible reward item to cart at the selected branch, applies the discount, and routes to cart.
Charter + umbrella plan: N/A — single plan (process/features/ordering-cart/active/reward-auto-redeem_21-07-26/reward-auto-redeem_PLAN_21-07-26.md)
Autonomy: reversible edits auto-proceed; surface only hard stops. No irreversible/outward-facing actions in scope.
Hard stop conditions / safety constraints:
- Do NOT call setBranch() anywhere in this flow — it wipes the entire cart (SPEC constraint).
- Keep the eligibleProductId thread additive/wire-safe — no rename/removal on Reward, no other serializeReward field change.
- No new backend routes; no useCart API change (addItem(menuItem, [], 1) is the existing contract).
Next phase: EXECUTE (process/features/ordering-cart/active/reward-auto-redeem_21-07-26/reward-auto-redeem_PLAN_21-07-26.md)
Validate contract: inline in plan (## Validate Contract — Gate: CONDITIONAL, E1–E4)
Execute start: pnpm --filter @jojopotato/api test | pnpm --filter @jojopotato/mobile test (vitest + jest) | 3 typechecks | format:check | high-risk pack: no
```
