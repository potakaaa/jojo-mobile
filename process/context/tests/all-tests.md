---
name: context:all-tests
description: "Test runner selection, commands, and verification order — vitest now live in packages/api"
keywords: test, tests, testing, typecheck, lint, verification, runner, jest, vitest, detox, playwright, auth, orders, cart
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

- test runner selection (currently: none configured)
- quick commands by package (typecheck/lint only, for now)
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

### `packages/api` now has Vitest — `apps/mobile` and the other packages still do not

`packages/api` declares `vitest` (`"test": "vitest run"`) and has real coverage:
`src/db/schema/__tests__/smoke.test.ts`, `src/lib/__tests__/auth.integration.test.ts` (5
integration tests covering better-auth's email/password, phone-OTP-stub, magic-link, Google-OAuth
config, and the `role` `input:false` guard), and `src/routes/__tests__/{branches,orders}.test.ts`
(44 tests total in the suite as of `pickup-order-flow` — covers `order_number` retry-on-collision,
session-boundary 401/403 isolation, `estimated_ready_at` derivation, concurrent-order-number
uniqueness, and back-to-back order independence) — run against a real local Postgres via
`docker compose up -d` + `db:migrate`, same DB the app itself uses. No other `package.json`
(root, `apps/mobile`, `packages/{types,ui,utils}`) declares Jest, Vitest, Detox, Playwright, or any
other runner yet. `packages/ui` now has vitest-run component tests too
(`order-status-badge`/`order-status-timeline`, 32 tests) even though `packages/ui` itself has no
`test` script wired the same way as `packages/api` — check `packages/ui/package.json` before
assuming otherwise.

Until a mobile-side (RN) runner is chosen, "verification" for `apps/mobile` and the other packages
means:

1. `pnpm typecheck` (tsc --noEmit per package, via turbo)
2. `pnpm lint` (ESLint flat config per package, via turbo)
3. manual verification in the Expo app (`pnpm ios` / `pnpm android` / `pnpm web`)

For `packages/api`, add `pnpm --filter @jojopotato/api test` (vitest) to the above. When a plan
introduces real logic worth unit-testing elsewhere (e.g. cart price calculation, currency
formatting in `packages/utils`, or a mobile-side `useAuth()` hook), the plan should explicitly
propose adding a runner for that surface (Vitest for TS-only packages — already proven in
`packages/api`; Jest via `jest-expo` or Detox/Maestro for RN component or e2e coverage) rather than
assuming one already exists.

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
| `apps/mobile` (unit/component) | (no test runner configured) | -- | see Known Gaps |

## Debugging Quick Reference

- No test-specific config exists yet (no `jest.config.*`, `vitest.config.*`, `.env.test`, mocks, or fixtures anywhere in the repo).
- Typecheck failures are the fastest signal in this repo today — packages are TS-source-only (no build step), so `tsc --noEmit` catches cross-package type breakage immediately via workspace links.
- `turbo` caches `typecheck`/`lint` results — if a fix doesn't seem to take effect, try `pnpm typecheck --force` or check `.turbo/` cache state.

## Known Gaps

- **No mobile-side (RN) test runner** — `apps/mobile` and `packages/{types,utils}` still have no Jest/Vitest/Detox/Playwright. `packages/api` is the one exception (Vitest, since the `db-schema` plan; extended with auth integration tests by `wire-better-auth` and route tests by `pickup-order-flow`); `packages/ui` also runs vitest for its components. Flag in any plan that adds real business logic to the mobile app or shared packages (cart math, pricing, a `useAuth()` hook) without also proposing a runner for that surface. **Still open as of `pickup-order-flow` (13-07-26):** that plan added a non-trivial amount of new mobile business logic with zero automated coverage — `CartProvider`'s reducer, `cart-totals.ts`, all 9 new screens, and every mobile API-client mapping function are verified only by typecheck/lint + a manual Agent-Probe QA script, not by unit/component tests. This is also the surface where an EVL confirmation run caught a real bug (`tsc` cannot validate a `fetch` response shape against a bare `as T` cast) that a runtime-validated fixture or a component test would likely have caught earlier — see `process/general-plans/completed/pickup-order-flow_10-07-26/` closeout report.
- **No automated coverage for `apps/mobile`'s `useAuth()` hook** — the better-auth server integration is tested (5 vitest cases in `packages/api`), but the mobile consumption side (`src/features/auth/hooks/use-auth.ts`, `src/features/auth/lib/auth-client.ts`) has no automated test, consistent with the mobile-side runner gap above. Manual/simulator verification (sign-up/login, phone OTP, Google button, magic-link deep link, session persistence across restart, logout) is still required — see backlog note `process/features/auth-accounts/backlog/wire-better-auth-hook-test-coverage_NOTE_09-07-26.md`.
- **No CI pipeline** — no `.github/workflows/`, so `typecheck`/`lint`/`packages/api`'s vitest suite are not automatically enforced on PRs yet.
- **No e2e coverage** — no Detox/Maestro/Playwright setup for the Expo app; see `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md` (navigation-focused, pre-dates auth; auth flows would be additional scenarios for the same future harness). The `pickup-order-flow` plan's full cold-open→confirmation customer journey is another concrete scenario this future harness should cover — it currently relies on a one-off Agent-Probe manual QA script for its primary happy-path gate.
- **No live-integration check between parallel EXECUTE phases building opposite sides of a network contract** — surfaced by `pickup-order-flow`'s EVL cycle 1 (API and mobile drifted on menu response field names when built in parallel against a documented-but-not-live-tested contract; caught only by the independent EVL confirmation run, not by `tsc` or either agent's self-report). Not a fixable test-runner gap in the traditional sense, but worth remembering as a process/workflow risk: treat a live-integration checkpoint or a shared runtime-validated contract fixture (see `apps/mobile/src/features/menu/lib/api-client.contract.ts`) as close to mandatory whenever a plan splits a network-contract's two sides across parallel execute agents.
