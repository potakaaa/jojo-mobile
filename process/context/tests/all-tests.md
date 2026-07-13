---
name: context:all-tests
description: "Test runner selection, commands, and verification order — vitest in packages/api and apps/mobile, jest-expo in packages/ui"
keywords: test, tests, testing, typecheck, lint, verification, runner, jest, vitest, detox, playwright, auth, order, checkout
related: []
date: 13-07-26
---

# Jojo Potato - All Tests

Last updated: 2026-07-13

Attach this file first when the task involves testing, verification, or test debugging.

This is the fast operator guide for the testing surface:

- which runner to use
- what command to start with
- how to quickly debug common failures
- which deeper file to read next

Do not load the whole `process/context/tests/` folder by default. Start here, then drill down.

---

## How This File Works

This is the `all-tests.md` entrypoint for the `tests/` context group. It follows the `all-*.md` routing convention:

1. Agents read `all-context.md` first and get routed here for testing tasks
2. This file gives quick decision rules and commands
3. For deeper details, agents follow the routing table below to specific docs

As the project grows, add deeper docs to this group (e.g., `e2e-tests.md`, `debugging-and-pitfalls.md`) and add routing entries below. This file stays the fast-start entrypoint.

---

## What This Covers

- test runner selection (vitest in `packages/api` + `apps/mobile`; jest-expo in `packages/ui`; still none in `packages/{types,utils}`)
- quick commands by package
- fast debugging procedures
- current testing gaps worth remembering

## Read This When

Use this file when you need to:

- run tests after implementation
- decide between test runners
- debug failing tests
- decide whether a plan needs to introduce a test runner before it can be verified

## Quick Routing

(No deeper test docs yet. Add routing entries here as they are created.)

## Quick Decision Guide

### Three runners now exist: Vitest (`packages/api`, `apps/mobile`), Jest/jest-expo (`packages/ui`)

`packages/api` declares `vitest` (`"test": "vitest run"`) and has real coverage:
`src/db/schema/__tests__/smoke.test.ts` plus `src/lib/__tests__/auth.integration.test.ts` (5
integration tests covering better-auth's email/password, phone-OTP-stub, magic-link, Google-OAuth
config, and the `role` `input:false` guard — run against a real local Postgres via
`docker compose up -d` + `db:migrate`, same DB the app itself uses).

`apps/mobile` gained its first runner — `vitest` (`"test": "vitest run"`, `apps/mobile/vitest.config.ts`,
`environment: 'node'`, scoped to `src/**/__tests__/**/*.test.ts` — pure-TS logic only, no RN
component rendering). Added by the checkout-flow (CART-002) plan for the `useOrder()` seam's pure
functions: `src/features/order/__tests__/mock-order.test.ts` covers `generateOrderNumber()`,
`validatePlaceOrderRequest()`, and `buildOrderFromRequest()`. This does NOT close the "no mobile-side
RN component/E2E test runner" gap below — it only covers plain-TypeScript pure-function logic.

`packages/ui` has `jest`/`jest-expo` (`"test": "jest"`, `packages/ui/jest.config.js`) with component
tests for `OrderStatusBadge`/`OrderStatusTimeline` and others (from the shared-ui-component-library
work). `packages/{types,utils}` still declare no runner.

Until a mobile-side (RN component) E2E runner is chosen, "verification" for RN-rendered UI still
means:

1. `pnpm typecheck` (tsc --noEmit per package, via turbo)
2. `pnpm lint` (ESLint flat config per package, via turbo)
3. manual verification in the Expo app (`pnpm ios` / `pnpm android` / `pnpm web`) or Agent-Probe walkthrough
4. `pnpm --filter @jojopotato/mobile test` (vitest, pure-TS logic) / `pnpm --filter @jojopotato/ui test` (jest-expo, component logic) / `pnpm --filter @jojopotato/api test` (vitest, integration) — whichever package was touched

When a plan introduces real logic worth unit-testing on a package with no runner yet
(`packages/types`, `packages/utils`), the plan should explicitly propose adding one (Vitest for
TS-only packages is the proven pattern in this repo) rather than assuming one already exists.

## Default Verification Order

Unless the task clearly needs a different path:

1. `pnpm typecheck` (fast, catches most regressions in a TS-only monorepo like this one)
2. `pnpm lint`
3. manual run via `pnpm ios` / `pnpm android` / `pnpm web` for UI-visible changes
4. add automated tests once a runner is introduced (see Known Gaps)

## Commands

| Package | Runner | Command | Notes |
|---|---|---|---|
| root (all packages) | tsc (via turbo) | `pnpm typecheck` | runs `tsc --noEmit` in every package with a `typecheck` script |
| root (all packages) | eslint (via turbo) | `pnpm lint` | flat-config ESLint 9, per-package `eslint.config.js` |
| root | prettier | `pnpm format:check` | check-only; `pnpm format` to write |
| `apps/mobile` | tsc | `pnpm --filter @jojopotato/mobile typecheck` | single-package typecheck |
| `apps/mobile` | eslint | `pnpm --filter @jojopotato/mobile lint` | single-package lint |
| `packages/{types,ui,utils}` | tsc | `pnpm --filter @jojopotato/{types,ui,utils} typecheck` | single-package typecheck |
| `packages/api` | vitest | `pnpm --filter @jojopotato/api test` | needs local Postgres via `docker compose up -d` + `db:migrate` first |
| `apps/mobile` (pure-TS logic) | vitest | `pnpm --filter @jojopotato/mobile test` | `environment: 'node'`, scoped to `src/**/__tests__/**/*.test.ts` — no RN rendering |
| `packages/ui` (component) | jest / jest-expo | `pnpm --filter @jojopotato/ui test` | `packages/ui/jest.config.js` |
| `apps/mobile` (RN component/E2E) | (no test runner configured) | -- | see Known Gaps |

## Debugging Quick Reference

- Test-specific config now exists: `packages/api/vitest.config.ts`, `apps/mobile/vitest.config.ts` (node env, pure-TS only), `packages/ui/jest.config.js`. `packages/{types,utils}` still have none.
- Typecheck failures are the fastest signal in this repo today — packages are TS-source-only (no build step), so `tsc --noEmit` catches cross-package type breakage immediately via workspace links.
- `turbo` caches `typecheck`/`lint` results — if a fix doesn't seem to take effect, try `pnpm typecheck --force` or check `.turbo/` cache state.
- Widening a shared enum/union in `packages/types` (e.g. `OrderStatus`, `PaymentMethod`) can silently break `Record<Enum, ...>`/exhaustive-array consumers in `packages/ui` — `tsc --noEmit` catches these immediately, but always grep for every consumer of the type before assuming "no other consumer" (this was a real VALIDATE-caught FAIL during checkout-flow_13-07-26).

## Known Gaps

- **No RN component/E2E test runner for `apps/mobile`** — `apps/mobile` now has `vitest` for pure-TS logic (see above) but no `jest-expo`/Detox/Maestro for RN component rendering or E2E flows. `packages/types`/`packages/utils` still have no runner at all. Flag in any plan that adds real business logic without also proposing a runner for that surface.
- **No automated coverage for `apps/mobile`'s `useAuth()` hook** — the better-auth server integration is tested (5 vitest cases in `packages/api`), but the mobile consumption side (`src/features/auth/hooks/use-auth.ts`, `src/features/auth/lib/auth-client.ts`) has no automated test, consistent with the mobile-side runner gap above. Manual/simulator verification (sign-up/login, phone OTP, Google button, magic-link deep link, session persistence across restart, logout) is still required — see backlog note `process/features/auth-accounts/backlog/wire-better-auth-hook-test-coverage_NOTE_09-07-26.md`.
- **No CI pipeline** — no `.github/workflows/`, so `typecheck`/`lint`/`packages/api`'s vitest suite are not automatically enforced on PRs yet.
- **No e2e coverage** — no Detox/Maestro/Playwright setup for the Expo app; see `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md` (navigation-focused, pre-dates auth; auth flows would be additional scenarios for the same future harness).
