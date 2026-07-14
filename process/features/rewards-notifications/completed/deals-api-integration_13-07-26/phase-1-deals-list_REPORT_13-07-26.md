---
phase: phase-1-deals-list
date: 2026-07-14
status: COMPLETE_WITH_GAPS
feature: rewards-notifications
plan: process/features/rewards-notifications/active/deals-api-integration_13-07-26/phase-1-deals-list_PLAN_13-07-26.md
---

# Phase 1 — Deals List — EXECUTE Report

## What Was Done

Backend (`packages/api`):
1. `routes/lib/serializers.ts` — added `ApiDeal` interface (comment enforces `ApiDeal ≡ @jojopotato/types Deal`) + `serializeDeal(deal, eligibleBranchIds, eligibleProductIds)` + private `dealDiscountLabel(dealType, value)` helper. Money rule applied exactly: `minimumOrderAmount` always `numericToCents`; `discountValue` = un-scaled `Number()` for `percentage_discount`, `numericToCents` for `fixed_discount`, `0` for the four complex types (and `0` when `discount_value` is null). Added `deals` to the schema type import + `DealRow`/`DealType` type aliases. Additive — no existing export changed.
2. `routes/deals.ts` — CREATED. `dealsRouter` + `GET /`: optional `branchId` uuid-guarded (`400 { error: 'Invalid branchId' }`); SQL filter `is_active && start_at<=now && end_at>=now`; JS branch-scope filter (agnostic always, scoped only when matching branchId); flattened `deal_branches`/`deal_products` id maps; `{ deals: ApiDeal[] }` envelope; early `{ deals: [] }` return when no active rows.
3. `index.ts` — added `import { dealsRouter }` + `app.use('/deals', dealsRouter)` immediately after the `/branches` mount.
4. `routes/__tests__/deals.test.ts` — CREATED. Self-seeding hermetic suite (branches.test.ts pattern, unique suffix, own `express()` app, `app.listen(0)`). 6 tests: envelope shape + own expired/inactive absent; window/is_active exclusion by id; branch agnostic/scoped/other-branch; no-branchId agnostic-only; money (percentage un-scaled=20, fixed=5000 cents, min=1500 cents) + field-name guard; invalid branchId→400. All own-fixture assertions — never global emptiness.

Mobile (`apps/mobile`):
5. `lib/api-client.ts` — added `getDeals(branchId?)` (imports `Deal` type; appends `?branchId=` only when truthy; reuses private `getJson`; unwraps `{ deals }`).
6. `features/deals/hooks/use-deals.ts` — CREATED. `useDeals()` reads `useCart().cart.pickupBranchId`; `queryKey: ['deals', branchId]`; always enabled; `refetchOnWindowFocus: true`.
7. `app/(tabs)/deals/index.tsx` — swapped off `MOCK_DEALS`/`filterActiveBranchDeals`/`useMemo`/`useCart` onto `useDeals()`; added `ScreenLoader` (loading) + `ScreenMessage` retry (error); kept existing `EmptyState` (empty) and unchanged `onPress` router.push (interim graceful-degradation to Phase 2). `mock-deals.ts` NOT deleted.

## What Was Skipped or Deferred

- Client render / loading / error / empty visual states + interim tap-through: Agent-Probe-pending (no RN test runner project-wide — accepted standing gap; not run in this environment).
- Interim tap-through (real deal → "Deal not found" until Phase 2): accepted CONDITIONAL residual — not fixed (out of Phase 1 blast radius).
- No seed/schema/migration change (per hard constraint).

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| pnpm install (fix api install-state) | `pnpm install` | PASS (15 pkgs added) |
| api typecheck | `pnpm --filter @jojopotato/api typecheck` | PASS |
| types typecheck | `pnpm --filter @jojopotato/types typecheck` | PASS |
| mobile typecheck | `pnpm -C apps/mobile exec tsc --noEmit` | PASS (no output) |
| api lint | `pnpm --filter @jojopotato/api lint` | PASS (0 errors) |
| mobile lint | `pnpm --filter @jojopotato/mobile lint` | PASS (0 errors; 3 pre-existing warnings in unrelated scripts/dev-with-tunnel.mjs) |
| docker + migrate | `docker compose up -d` + `db:migrate` | PASS |
| api test suite | `pnpm --filter @jojopotato/api test` | PASS — 62/62 tests, 8/8 files; `deals.test.ts` 6/6 |

## Plan Deviations

- `dealDiscountLabel` uses the real enum value `buy_one_take_one` (→ 'BOGO'), not the plan's shorthand `bogo`. The plan text used `bogo` loosely; the DealType enum + `eligibility.ts deriveDiscountLabel` use `buy_one_take_one`. Within blast radius — matches source of truth. tsc-verified exhaustive switch (no `default` branch needed; the union is closed).

## Test Infra Gaps Found

- None new. Standing project-wide gap: `apps/mobile` has no RN test runner, so client behavior is Agent-Probe only. Tracked at `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`.

## Closeout Packet

- Selected plan: `phase-1-deals-list_PLAN_13-07-26.md`
- Finished: all 10 checklist items (backend 1–6 verified green; mobile 7–10 code-done + tsc/lint green).
- Verified: backend endpoint/filter/money/400 via automated `deals.test.ts` (AC22.1–22.5 backend). Build integrity of hook + swap via tsc/lint.
- Unverified: client visual render/loading/error/empty + interim tap-through (Agent-Probe-pending — accepted gap; no runner in this environment).
- Blast radius: RESPECTED. Only the 7 registry-claimed Phase 1 files touched. No schema/migration/seed/`deal/[dealId].tsx`/`cart.tsx`/`use-cart.ts`/`mock-deals.ts` change.
- Classification: Keep in active/testing — code-complete + automated gate green; Agent-Probe walkthrough still pending user confirmation.

## Forward Preview

### Test Infra Found
- api vitest+supertest is the live automated gate (requires `docker compose up -d` + `db:migrate`). No RN runner for mobile.

### Blast Radius Changes
- New `packages/api/src/routes/deals.ts` + `serializeDeal`/`ApiDeal` are the shape-lock Phase 2 extends (`GET /:id`). `features/deals/hooks/` now exists (Phase 2 adds a single-deal hook).

### Commands to Stay Green
- `pnpm --filter @jojopotato/api test` (after `docker compose up -d` + `db:migrate`)
- `pnpm -C apps/mobile exec tsc --noEmit`; `pnpm --filter @jojopotato/api typecheck`; `pnpm --filter @jojopotato/types typecheck`
- api + mobile lint

### Dependency Changes
- None (no new package deps; `@tanstack/react-query` already present).

## Follow-up Stubs Created
- None (interim tap-through is owned by the existing Phase 2 stub `phase-2-deal-details-eligibility_STUB_13-07-26.md`).

## CONTEXT_PARTIAL
- None.

## EVL Confirmation (independent re-run)

All 6 validate-contract gates re-run independently by vc-tester and GREEN:
`pnpm --filter @jojopotato/api test` (62/62, `deals.test.ts` 6/6), api typecheck, types typecheck,
mobile typecheck, api lint, mobile lint (0 errors). Blast radius CONFORMANT — only the 7 claimed
Phase 1 files touched; no `packages/api/src/db/` changes; `deal/[dealId].tsx`/`use-cart.ts`/
`mock-deals.ts` untouched. Money contract spot-checked correct in `serializeDeal`
(serializers.ts:270-306). Accepted known-gaps unchanged (client render/loading/error/empty is
Agent-Probe-only — no RN runner; interim tap-through to "Deal not found" until Phase 2).
closeout_classification: CLEAN.

**Outstanding (non-blocking):** a manual Agent-Probe walkthrough of the deals list screen
(loading/error/empty/render + graceful "Deal not found" tap-through) is still owed by the user.
Automated gates are this phase-program's exit criterion for backend behavior; RN screen behavior is
Agent-Probe-only project-wide per the umbrella charter. This does not block Phase 1 → Phase 2
advancement — recorded here as a follow-up for the user to confirm when convenient.
