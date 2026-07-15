---
name: context:all-tests
description: "Test runner selection, commands, and verification order — vitest in packages/api, apps/mobile, and apps/admin; jest-expo in packages/ui"
keywords: test, tests, testing, typecheck, lint, verification, runner, jest, vitest, detox, playwright, auth, orders, cart, checkout, admin, tanstack, jsdom, testing-library
related: []
date: 14-07-26
---

# Jojo Potato - All Tests

Last updated: 2026-07-14

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

- test runner selection (vitest in `packages/api` + `apps/mobile` + `apps/admin`; jest-expo in `packages/ui`; still none in `packages/{types,utils}`)
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

### Four runners now exist: Vitest (`packages/api`, `apps/mobile`, `apps/admin`), Jest/jest-expo (`packages/ui`)

`packages/api` declares `vitest` (`"test": "vitest run"`) and has real coverage:
`src/db/schema/__tests__/smoke.test.ts`, `src/lib/__tests__/auth.integration.test.ts` (5
integration tests covering better-auth's email/password, phone-OTP-stub, magic-link, Google-OAuth
config, and the `role` `input:false` guard), and `src/routes/__tests__/{branches,orders}.test.ts`
(covers `order_number` retry-on-collision, session-boundary 401/403 isolation,
`estimated_ready_at` derivation, concurrent-order-number uniqueness, and back-to-back order
independence) — run against a real local Postgres via `docker compose up -d` + `db:migrate`, same
DB the app itself uses. `packages/ui` has component tests for
`order-status-badge`/`order-status-timeline` and others — check `packages/ui/package.json` for the
runner wiring before assuming.

`apps/mobile` gained its first runner — `vitest` (`"test": "vitest run"`, `apps/mobile/vitest.config.ts`,
`environment: 'node'`, scoped to `src/**/__tests__/**/*.test.ts` — pure-TS logic only, no RN
component rendering). Added by the checkout-flow (CART-002) plan for the `useOrder()` seam's pure
functions: `src/features/order/__tests__/mock-order.test.ts` covers `generateOrderNumber()`,
`validatePlaceOrderRequest()`, and `buildOrderFromRequest()`. This does NOT close the "no mobile-side
RN component/E2E test runner" gap below — it only covers plain-TypeScript pure-function logic.

`packages/ui` has `jest`/`jest-expo` (`"test": "jest"`, `packages/ui/jest.config.js`) with component
tests for `OrderStatusBadge`/`OrderStatusTimeline` and others (from the shared-ui-component-library
work). `packages/{types,utils}` still declare no runner.

`apps/admin` (added 14-07-26, admin-dashboard Phase 0 — Scaffold) is the FIRST WEB-APP test runner
precedent in the repo: `vitest` (`"test": "vitest run --passWithNoTests"`) + `@testing-library/react`
+ `jsdom` (`apps/admin/vitest.config.ts` — deliberately SEPARATE from `apps/admin/vite.config.ts` so
the TanStack Start SSR plugin isn't loaded during tests). One trivial passing test
(`src/routes/-index.test.tsx` — renamed from `index.test.tsx` during Phase 1 UPDATE PROCESS; the
leading `-` makes TanStack Start's route generator ignore the file as a route while vitest still
discovers it via the `*.test.tsx` glob — do this for any future test file placed directly inside
`apps/admin/src/routes/`) proving the runner precedent end-to-end. Unlike `apps/mobile`'s vitest
(pure-TS logic only, no rendering), `apps/admin`'s vitest DOES render components via
`@testing-library/react` — it is a real component-test runner, not just a pure-function runner.
Phase 1 (Auth/RBAC) added `packages/api/src/lib/__tests__/require-admin.integration.test.ts`
(mirrors `require-staff.integration.test.ts`'s hermetic self-seeding pattern — no shared fixture
dependency) — full API suite is now **78/78** (75 at first close, +3 post-AC8 CORS regression tests:
preflight OPTIONS on `/api/auth/sign-in/email`, a real cross-origin sign-in, and a no-Origin
mobile-path guard). A real-browser AC8 walkthrough found that credentialed CORS must be mounted on
BOTH `/api/auth/*` and `/api/admin` — `trustedOrigins` alone (CSRF allowlist) does not add HTTP CORS
headers, so a browser blocks the response without them even when the origin is trusted. As Phase 2+
build real admin CRUD screens, `apps/admin`'s vitest is the runner to extend.

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
| `apps/admin` (component) | vitest + @testing-library/react | `pnpm --filter @jojopotato/admin test` | jsdom env, `apps/admin/vitest.config.ts` (separate from `vite.config.ts`) — first web-app component-test runner in the repo |
| `apps/admin` | tsc | `pnpm --filter @jojopotato/admin typecheck` | single-package typecheck |
| `apps/admin` | eslint | `pnpm --filter @jojopotato/admin lint` | single-package lint |
| `apps/admin` | vite | `pnpm --filter @jojopotato/admin build` | outputs to `dist/` — matches existing `turbo.json` glob, no config change needed |
| `apps/mobile` (RN component/E2E) | (no test runner configured) | -- | see Known Gaps |

## Debugging Quick Reference

- Test-specific config now exists: `packages/api/vitest.config.ts`, `apps/mobile/vitest.config.ts` (node env, pure-TS only), `apps/admin/vitest.config.ts` (jsdom env, component rendering, separate from `vite.config.ts` to avoid loading the TanStack Start SSR plugin), `packages/ui/jest.config.js`. `packages/{types,utils}` still have none.
- Typecheck failures are the fastest signal in this repo today — packages are TS-source-only (no build step), so `tsc --noEmit` catches cross-package type breakage immediately via workspace links.
- `turbo` caches `typecheck`/`lint` results — if a fix doesn't seem to take effect, try `pnpm typecheck --force` or check `.turbo/` cache state.
- Widening a shared enum/union in `packages/types` (e.g. `OrderStatus`, `PaymentMethod`) can silently break `Record<Enum, ...>`/exhaustive-array consumers in `packages/ui` — `tsc --noEmit` catches these immediately, but always grep for every consumer of the type before assuming "no other consumer" (this was a real VALIDATE-caught FAIL during checkout-flow_13-07-26).
- **Dev-machine gotcha (this box, not a repo-wide fact):** host port 5432 is occupied by a native `postgresql.service`, so a plain `docker compose up -d` for Postgres fails to bind. `packages/api`'s vitest integration suites (which need a live migrated Postgres) run fine against the already-running native instance instead — a `jojo` role (with `CREATEDB`) + `jojopotato` database were created against it once (discovered during admin-dashboard Phase 1 RESEARCH), letting vitest's `global-setup.ts` create its own ephemeral `<db>_test` databases per run. If `pnpm --filter @jojopotato/api test` fails with a connection error, check `sudo systemctl status postgresql` before assuming docker compose is the only path.

## Known Gaps

- **Root `pnpm typecheck` is RED on `dev/admin` as of 14-07-26 — pre-existing, not caused by `apps/admin`.** `@jojopotato/mobile` has pre-existing typed-route errors (staff order-detail, deals routes; commit `6e160fe`) unrelated to the admin-dashboard program — `apps/admin`'s own `pnpm --filter @jojopotato/admin typecheck` is clean, and `apps/mobile` had zero file changes in the admin-dashboard Phase 0 diff. Do not attempt to fix this from within the admin-dashboard program; it belongs to a separate mobile-app fix.
- **No RN component/E2E test runner for `apps/mobile`** — `apps/mobile` now has `vitest` for pure-TS logic (see above, added by checkout-flow CART-002) but no `jest-expo`/Detox/Maestro for RN component rendering or E2E flows. `packages/types`/`packages/utils` still have no runner at all. Flag in any plan that adds real business logic without also proposing a runner for that surface. **Still open as of `pickup-order-flow` (13-07-26):** that plan added a non-trivial amount of new mobile business logic with zero automated coverage — screens and mobile API-client mapping functions are verified only by typecheck/lint + a manual Agent-Probe QA script. This is also the surface where an EVL confirmation run caught a real bug (`tsc` cannot validate a `fetch` response shape against a bare `as T` cast) that a runtime-validated fixture or a component test would likely have caught earlier — see `process/general-plans/completed/pickup-order-flow_10-07-26/` closeout report.
- **No automated coverage for `apps/mobile`'s `useAuth()` hook** — the better-auth server integration is tested (5 vitest cases in `packages/api`), but the mobile consumption side (`src/features/auth/hooks/use-auth.ts`, `src/features/auth/lib/auth-client.ts`) has no automated test, consistent with the mobile-side runner gap above. Manual/simulator verification (sign-up/login, phone OTP, Google button, magic-link deep link, session persistence across restart, logout) is still required — see backlog note `process/features/auth-accounts/backlog/wire-better-auth-hook-test-coverage_NOTE_09-07-26.md`.
- ~~No CI pipeline~~ **RESOLVED:** GitHub Actions CI exists (`.github/workflows/ci.yml` — format/lint/typecheck/test/build with a Postgres service).
- **No e2e coverage** — no Detox/Maestro/Playwright setup for the Expo app; see `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md` (navigation-focused, pre-dates auth; auth flows would be additional scenarios for the same future harness). The `pickup-order-flow` plan's full cold-open→confirmation customer journey is another concrete scenario this future harness should cover — it currently relies on a one-off Agent-Probe manual QA script for its primary happy-path gate.
- **No live-integration check between parallel EXECUTE phases building opposite sides of a network contract** — surfaced by `pickup-order-flow`'s EVL cycle 1 (API and mobile drifted on menu response field names when built in parallel against a documented-but-not-live-tested contract; caught only by the independent EVL confirmation run, not by `tsc` or either agent's self-report). Not a fixable test-runner gap in the traditional sense, but worth remembering as a process/workflow risk: treat a live-integration checkpoint or a shared runtime-validated contract fixture (see `apps/mobile/src/lib/api-client.contract.ts` — relocated 13-07-26 by `merge-menu-api-reconciliation` from the deleted `features/menu/lib/api-client.contract.ts`, same regression-guard intent preserved) as close to mandatory whenever a plan splits a network-contract's two sides across parallel execute agents.
