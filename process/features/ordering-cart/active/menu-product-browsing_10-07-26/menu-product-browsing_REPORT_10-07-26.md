---
phase: menu-product-browsing
date: 2026-07-10
status: COMPLETE_WITH_GAPS
feature: ordering-cart
plan: process/features/ordering-cart/active/menu-product-browsing_10-07-26/menu-product-browsing_PLAN_10-07-26.md
---

# EXECUTE Report — Menu Browsing & Product Details (MENU-001 + MENU-002)

TL;DR: All 36 checklist steps implemented across the three hard-gated sections (Infra → MENU-001 →
MENU-002). Every automated/hybrid gate is green: `pnpm typecheck` (5/5), `pnpm lint` (6/6, 0 errors),
`pnpm --filter @jojopotato/utils test` (26/26), `pnpm --filter @jojopotato/api test` (32/32, incl. 11
new integration tests), and the `@jojopotato/ui` Jest suite (19/19). The 5 Agent-Probe UI rows
(AC3/AC4/AC6/AC9/AC11-UI) were NOT executed — a device/simulator walk is not feasible in this
headless environment (documented, not claimed as verified). No DB migration introduced; auth mount
order untouched.

## What Was Done

### Section 1 — Infra (steps 1–22) — GREEN
- Rewrote `packages/types/src/{menu,cart}.ts` to the real DB shape (`Category`, `Product`,
  `ProductOption`, `ProductOptionType`, `ProductDetail`, `MenuResponse`; `CartSelectedOption`,
  `CartItem` snapshot, `Cart`, `CartAction`). Extended `pickup.ts`'s `PickupBranch` additively.
- Added `packages/utils` pure logic + Vitest runner: `pricing.ts` (AC7), `product-options.ts`
  (AC8/AC9-boolean), `cart.ts` (AC10), `formatPricePHP` in `currency.ts`; 3 test suites (26 cases).
- New API routes `packages/api/src/routes/{branches,menu}.ts` mounted in `index.ts` AFTER
  `express.json()` (auth `*splat` mount untouched). `branchId` validated against active branches
  (400 on invalid); snake_case→camelCase mapping; `numeric` money parsed to `number`.
- New integration tests `{branches,menu}.integration.test.ts` (11 cases) via an ephemeral Express
  server (no new deps) against local Postgres.
- Mobile infra: `@tanstack/react-query` added; `lib/query-client.ts`, `lib/api-client.ts`,
  `features/branch/hooks/use-branch.ts`, `features/cart/hooks/use-cart.ts`; providers wired into
  `_layout.tsx` (QueryClientProvider → Auth → Branch → Cart).
- Type-fallout fixed across all discovered consumers (see Deviations).

### Section 2 — MENU-001 (steps 23–28) — GREEN (automated halves)
- `features/menu/hooks/use-menu.ts` (branch-keyed query, disabled until a branch is selected),
  `components/branch-switcher.tsx`, `components/category-section.tsx` (empty-state for AC4),
  rewrote `(tabs)/order/index.tsx` (real menu, loading/error/empty states, nav to product; kept
  Cart/History dev links, removed "Dev: View Product 123").

### Section 3 — MENU-002 (steps 29–36) — GREEN (automated halves)
- `features/menu/hooks/use-product-details.ts` (`refetchOnWindowFocus` + 20s `refetchInterval`,
  AC11), `lib/group-options.ts`, `packages/ui/components/addon-selector.tsx` (+ barrel export),
  `components/option-group-selector.tsx` (maps `ProductOption[]` → `{id,name}`/`{id,label}` per the
  Touchpoints adapter note), `components/add-to-cart-bar.tsx` (live price, dim-until-complete,
  inline blocked-attempt message AC9, unavailable state AC11), rewrote
  `(tabs)/order/product/[productId].tsx` (full screen wiring selection → live price → snapshot add).

## Test Gate Outcomes
| Gate | Command | Result |
|---|---|---|
| Pure logic (AC7/AC8/AC9-bool/AC10) | `pnpm --filter @jojopotato/utils test` | 26/26 PASS |
| API routes (AC1/AC2/AC11-API/branchId/branches) | `pnpm --filter @jojopotato/api test` | 32/32 PASS |
| Shared UI regression | `pnpm --filter @jojopotato/ui test` (jest) | 19/19 PASS |
| Whole-repo compile (AC5 typed route + type-fallout) | `pnpm typecheck` | 5/5 PASS |
| Whole-repo lint | `pnpm lint` | 6/6 PASS (0 errors; 3 pre-existing warnings in untouched `dev-with-tunnel.mjs`) |
| Manual sim walk (AC3/AC4/AC6/AC9/AC11-UI) | `pnpm ios`/`android`/`web` | NOT RUN — headless env; see Gaps |

Precondition met for the hybrid gate: `docker compose up -d` (started Docker Desktop) +
`pnpm --filter @jojopotato/api db:migrate` before the API suite.

## What Was Skipped or Deferred
- **Agent-Probe manual sim walk (AC3, AC4, AC6, AC9, AC11-UI half):** not executed — no
  device/simulator available in this headless environment. These are the carried-forward Known-Gap
  rows (no RN component/e2e runner exists). The logic/API halves that CAN be automated are green.
  The UI wiring was statically verified via typecheck + code review, not a live walk.

## Plan Deviations (all within the type-rewrite / infra blast radius; none hard-stop class)
1. **`packages/ui` has a LIVE Jest suite** (`"test": "jest"`, `tsconfig` includes `__tests__`) —
   contradicts the stale `all-tests.md` ("only packages/api has a runner"). Rewriting the types
   broke `cart-item.tsx`, `__tests__/mocks.ts`, `__tests__/cart-item.test.tsx` (none in the plan's
   Touchpoints). Fixed all three; jest suite re-run green. `CONTEXT_PARTIAL: tests` (see below).
2. **`packages/utils` gained a `@jojopotato/types` workspace dependency** — required for
   `pricing`/`product-options`/`cart` to reference domain types. Not in plan; necessary to compile.
3. **New `CartItem` type includes a `quantity` field** (default 1 in `buildCartItemSnapshot`) — not
   spelled out in the plan; needed so the shared `CartItem` line component renders a quantity. Does
   not affect AC10 (which asserts `unitPrice`/`selectedOptions` immutability).
4. **`packages/ui/cart-item.tsx` rewritten to render from the new self-contained `CartItem`
   snapshot** (dropped the old `product`/`flavor`/`size` props). Forced by the `cart.ts` rewrite;
   only the dev showcase + its own tests consumed it (cart review UI is out of SPEC scope).
5. **Expo typed-routes regeneration required** — pre-existing staleness (`.expo/types/router.d.ts`
   from Jul 9 lacked `phone-otp`) surfaced as an unrelated typecheck failure. Ran `expo start`
   briefly to regenerate typegen (documented repo quirk), then stopped it. No source change.
6. **`Router` type annotations added** to the two route exports (`export const menuRouter: Router`)
   to satisfy TS2883 portable-inference.
7. **`getBranches()` derives `isOpen = isActive && isAcceptingPickup`** — the API response has no
   `isOpen`, but `PickupBranch.isOpen` stays required (branch-card/branch-selector read it).

## Test Infra Gaps Found
- `CONTEXT_PARTIAL: tests` — `process/context/tests/all-tests.md` is stale: it states only
  `packages/api` has a test runner, but `packages/ui` has a working `jest` + `jest-expo` suite
  (17 suites / 19 tests). UPDATE PROCESS should correct the Commands table and Known Gaps section
  (and add the new `packages/utils` Vitest runner per the plan's Test Infra Improvement Notes).
- No mobile-side (RN) component/screen runner and no e2e/navigation harness still — the 5
  Agent-Probe rows remain Known-Gap (carried forward, not newly introduced).

## Closeout Packet
- **Selected plan:** `process/features/ordering-cart/active/menu-product-browsing_10-07-26/menu-product-browsing_PLAN_10-07-26.md`
- **Finished:** all 36 checklist steps; all automated + hybrid gates green.
- **Verified:** AC1, AC2, AC5, AC7, AC8, AC9 (boolean gate), AC10, AC11 (API half), branchId
  security, branches contract — via automated/hybrid tests.
- **Unverified:** AC3, AC4, AC6, AC9 (inline-message UI), AC11 (UI poll) — Agent-Probe, need a
  device/sim walk not possible here.
- **Cleanup remaining:** UPDATE PROCESS to (a) fix stale `all-tests.md`, (b) record the new
  `packages/utils` Vitest + confirm `packages/ui` Jest, (c) archive plan when the manual sim walk
  is done. Docker Postgres container left running (used for the hybrid gate).
- **Closeout classification:** `Keep in active/testing` — code-complete and automated-green, but the
  Agent-Probe UI walk is still pending, so the plan should stay active until that manual pass runs.
- **No follow-up plan stubs created.** No hard-stop deviations; no BLOCKED items.

## Forward Preview
- **Test Infra Found:** `packages/ui` Jest suite (`"test": "jest"`), new `packages/utils` Vitest
  (`"test": "vitest run"`), API integration pattern via ephemeral Express server + local Postgres.
- **Blast Radius Changes:** 5 packages touched (`apps/mobile`, `packages/{api,types,utils,ui}`);
  ~34 files (32 planned + `cart-item.tsx`, `mocks.ts`, `cart-item.test.tsx` discovered). One file
  deleted (`home/components/product-card.tsx`, orphaned).
- **Commands to Stay Green:** `pnpm typecheck && pnpm lint`; `pnpm --filter @jojopotato/utils test`;
  `docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test`;
  `pnpm --filter @jojopotato/ui test`.
- **Dependency Changes:** `+@tanstack/react-query` (apps/mobile), `+vitest` (packages/utils dev),
  `+@jojopotato/types` (packages/utils).
