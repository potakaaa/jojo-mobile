---
name: context:all-tests
description: "Test runner selection, commands, and verification order — vitest in packages/api, apps/mobile, and apps/admin; jest-expo in packages/ui"
keywords: test, tests, testing, typecheck, lint, verification, runner, jest, vitest, detox, playwright, auth, orders, cart, checkout, admin, tanstack, jsdom, testing-library, utils, packages/utils
related: []
date: 17-07-26
---

# Jojo Potato - All Tests

Last updated: 2026-07-17 (corrected stale claim: packages/utils has a vitest runner, 39/39 tests, verified live during MENU-003/MENU-004)

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

- test runner selection (vitest in `packages/api` + `apps/mobile` + `apps/admin` + `packages/utils`; jest-expo in `packages/ui` + `apps/mobile`; still none in `packages/types`)
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

### Five runners now exist: Vitest (`packages/api`, `apps/mobile`, `apps/admin`), Jest/jest-expo (`packages/ui`, `apps/mobile`)

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

`apps/mobile` gained its first runner — `vitest` (`"test": "vitest run --passWithNoTests"`,
`apps/mobile/vitest.config.ts`, `environment: 'node'`, scoped to `src/**/__tests__/**/*.test.ts` —
pure-TS logic only, no RN component rendering). Added by the checkout-flow (CART-002) plan; current
count 44 tests. This alone does NOT close the "no mobile-side RN component/E2E test runner" gap —
see the next paragraph for the runner that does (component-level only; E2E/navigation still open).

**`apps/mobile` gained a SECOND runner — `jest`/`jest-expo` for RN component tests (added 15-07-26 by
the mobile-tabs-order-flow-completion program, Phase 4).** This is the FIRST RN component-test-runner
precedent for `apps/mobile` (mirrors `packages/ui`'s existing jest-expo setup). `apps/mobile/package.json`'s
`test` script is now `vitest run --passWithNoTests && jest` — vitest owns pure-TS `*.test.ts` files,
jest owns component `*.test.tsx` files, run sequentially. `apps/mobile/jest.config.js` mirrors
`packages/ui`'s pinned dep versions and pnpm-aware `transformIgnorePatterns`. Reusable helpers:
`apps/mobile/src/test-utils/render.tsx` (exports an ASYNC `renderWithProviders()` — must be
`await`ed, wraps RTL render to flush the `QueryClientProvider` tree — plus `spyOnAlert()`) and
`apps/mobile/src/test-utils/jest-setup.ts`, which carries 3 empirically-proven gotcha fixes:
(a) a hand-rolled `react-native-reanimated` mock (the official `/mock` export crashes on this repo's
reanimated 4.5.0 + worklets 0.10.0 pin) — **this mock covers `useAnimatedStyle`/`useSharedValue`/
`withTiming`/`withSpring`/`interpolate(Color)` ONLY; it lacks layout-animation exports
(`FadeIn`/`FadeOut`/`SlideInDown`/`SlideOutDown`/`Easing`/`cancelAnimation`)**, which means any screen
using entering/exiting animations (e.g. checkout.tsx) currently crashes at render under jest — a
known, recorded gap (blocked an optional Phase 6 test; extending the mock is the fix, tracked as a
recommended backlog item, not yet done); (b) a `SafeAreaProvider` `initialMetrics` fixture
(`TEST_SAFE_AREA_METRICS` — without fixed metrics the provider does not resolve synchronously in
jest); (c) a global `expo-router` stub AND a global `jest.mock('@/features/auth/lib/auth-client')` —
required whenever a screen (even transitively) imports `@/lib/api-client`, since that module pulls in
`@better-auth/*` ESM that jest cannot transform; new test files get this mock for free. A further
established pattern: `jest.mock('@/features/auth/hooks/use-auth', () => ({ useAuth: jest.fn() }))`
for any screen needing a signed-in-user fixture. **This CLOSES the "no RN component test runner"
project-wide gap for component-level tests.** It does NOT add navigation-level/E2E coverage
(Detox/Maestro/Playwright) — that part of the gap (see Known Gaps below) remains fully open. Current
count: 23 tests across 6 suites.

`packages/ui` has `jest`/`jest-expo` (`"test": "jest"`, `packages/ui/jest.config.js`) with component
tests for `OrderStatusBadge`/`OrderStatusTimeline` and others (from the shared-ui-component-library
work). `packages/types` still declares no runner.

**`packages/utils` has `vitest` (`"test": "vitest run"`) — CORRECTING a previously-stale claim in
this file that said it had none.** Verified live 17-07-26 (re-confirmed 4x during MENU-003/MENU-004):
39/39 tests green across 4 suites (`order-display`, `product-options`, `discount`, `reorder`). Real,
non-vacuous coverage — `packages/utils/src/reorder.ts`'s `reconcileReorder`/`packages/utils/src/discount.ts`'s
discount math are both proven by these tests, not Agent-Probe. Do not assign Agent-Probe verification
tiers to `packages/utils` logic changes — check `packages/utils/package.json` first.

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
| `packages/utils` | vitest | `pnpm --filter @jojopotato/utils test` | `"test": "vitest run"` — 39 tests, 4 suites (order-display, product-options, discount, reorder); no dedicated vitest.config.ts, uses defaults |
| `packages/api` | vitest | `pnpm --filter @jojopotato/api test` | needs local Postgres via `docker compose up -d` + `db:migrate` first |
| `apps/mobile` (pure-TS logic + RN component) | vitest + jest/jest-expo | `pnpm --filter @jojopotato/mobile test` | runs `vitest run --passWithNoTests && jest` sequentially — vitest owns `*.test.ts` (node env, no rendering), jest owns `*.test.tsx` (RN component rendering via `test-utils/render.tsx` + `jest-setup.ts`) |
| `packages/ui` (component) | jest / jest-expo | `pnpm --filter @jojopotato/ui test` | `packages/ui/jest.config.js` |
| `apps/admin` (component) | vitest + @testing-library/react | `pnpm --filter @jojopotato/admin test` | jsdom env, `apps/admin/vitest.config.ts` (separate from `vite.config.ts`) — first web-app component-test runner in the repo |
| `apps/admin` | tsc | `pnpm --filter @jojopotato/admin typecheck` | single-package typecheck |
| `apps/admin` | eslint | `pnpm --filter @jojopotato/admin lint` | single-package lint |
| `apps/admin` | vite | `pnpm --filter @jojopotato/admin build` | outputs to `dist/` — matches existing `turbo.json` glob, no config change needed |
| `apps/mobile` (E2E/navigation) | (no test runner configured) | -- | see Known Gaps — component-level RN tests now exist (jest, row above); navigation/E2E still absent |

## Debugging Quick Reference

- Test-specific config now exists: `packages/api/vitest.config.ts`, `apps/mobile/vitest.config.ts` (node env, pure-TS only) + `apps/mobile/jest.config.js` (RN component), `apps/admin/vitest.config.ts` (jsdom env, component rendering, separate from `vite.config.ts` to avoid loading the TanStack Start SSR plugin), `packages/ui/jest.config.js`, `packages/utils` (`vitest run`, no dedicated config file — uses vitest defaults). `packages/types` still has none.
- Typecheck failures are the fastest signal in this repo today — packages are TS-source-only (no build step), so `tsc --noEmit` catches cross-package type breakage immediately via workspace links.
- `turbo` caches `typecheck`/`lint` results — if a fix doesn't seem to take effect, try `pnpm typecheck --force` or check `.turbo/` cache state.
- Widening a shared enum/union in `packages/types` (e.g. `OrderStatus`, `PaymentMethod`) can silently break `Record<Enum, ...>`/exhaustive-array consumers in `packages/ui` — `tsc --noEmit` catches these immediately, but always grep for every consumer of the type before assuming "no other consumer" (this was a real VALIDATE-caught FAIL during checkout-flow_13-07-26).
- **Dev-machine gotcha (this box, not a repo-wide fact):** host port 5432 is occupied by a native `postgresql.service`, so a plain `docker compose up -d` for Postgres fails to bind. `packages/api`'s vitest integration suites (which need a live migrated Postgres) run fine against the already-running native instance instead — a `jojo` role (with `CREATEDB`) + `jojopotato` database were created against it once (discovered during admin-dashboard Phase 1 RESEARCH), letting vitest's `global-setup.ts` create its own ephemeral `<db>_test` databases per run. If `pnpm --filter @jojopotato/api test` fails with a connection error, check `sudo systemctl status postgresql` before assuming docker compose is the only path.

## Known Gaps

- **Root `pnpm typecheck` is RED on `dev/admin` as of 14-07-26 — pre-existing, not caused by `apps/admin`.** `@jojopotato/mobile` has pre-existing typed-route errors (staff order-detail, deals routes; commit `6e160fe`) unrelated to the admin-dashboard program — `apps/admin`'s own `pnpm --filter @jojopotato/admin typecheck` is clean, and `apps/mobile` had zero file changes in the admin-dashboard Phase 0 diff. Do not attempt to fix this from within the admin-dashboard program; it belongs to a separate mobile-app fix.
- **RESOLVED (component-level only) — `apps/mobile` now has an RN component test runner** (`jest`/`jest-expo`, added 15-07-26 by mobile-tabs-order-flow-completion Phase 4; see above). Screens can now get real component-level regression coverage (e.g. `branches/index.test.tsx`'s open/closed-branch badge + loading/error + sort-order assertions). **Still open: navigation-level E2E** — no Detox/Maestro/Playwright for full navigation flows. `packages/types`/`packages/utils` still have no runner at all. Flag in any plan that adds real business logic without also proposing test coverage for that surface. Prior gap history (kept for context): `pickup-order-flow` (13-07-26) shipped a non-trivial amount of new mobile business logic with zero automated coverage at the time — screens and mobile API-client mapping functions were verified only by typecheck/lint + a manual Agent-Probe QA script; that EVL confirmation run caught a real bug (`tsc` cannot validate a `fetch` response shape against a bare `as T` cast) that a runtime-validated fixture or a component test would likely have caught earlier — see `process/general-plans/completed/pickup-order-flow_10-07-26/` closeout report. The jest runner added 15-07-26 is the concrete fix for that class of gap going forward, but is not retroactively applied to pre-existing screens.
- **New, recorded 15-07-26: shared jest reanimated mock (`apps/mobile/src/test-utils/jest-setup.ts`) lacks layout-animation exports** (`FadeIn`/`FadeOut`/`SlideInDown`/`SlideOutDown`/`Easing`/`cancelAnimation`) — any screen using reanimated's entering/exiting animations (e.g. `order/checkout.tsx`) crashes at render under jest. Blocked an optional Phase 6 checkout regression test (non-blocking, documented). Recommended backlog item: extend the mock to unlock jest coverage for animation-heavy screens.
- **No automated coverage for `apps/mobile`'s `useAuth()` hook** — the better-auth server integration is tested (5 vitest cases in `packages/api`), but the mobile consumption side (`src/features/auth/hooks/use-auth.ts`, `src/features/auth/lib/auth-client.ts`) has no automated test, consistent with the mobile-side runner gap above. Manual/simulator verification (sign-up/login, phone OTP, Google button, magic-link deep link, session persistence across restart, logout) is still required — see backlog note `process/features/auth-accounts/backlog/wire-better-auth-hook-test-coverage_NOTE_09-07-26.md`.
- ~~No CI pipeline~~ **RESOLVED:** GitHub Actions CI exists (`.github/workflows/ci.yml` — format/lint/typecheck/test/build with a Postgres service).
- **No e2e coverage** — no Detox/Maestro/Playwright setup for the Expo app; see `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md` (navigation-focused, pre-dates auth; auth flows would be additional scenarios for the same future harness). The `pickup-order-flow` plan's full cold-open→confirmation customer journey is another concrete scenario this future harness should cover — it currently relies on a one-off Agent-Probe manual QA script for its primary happy-path gate.
- **No live-integration check between parallel EXECUTE phases building opposite sides of a network contract** — surfaced by `pickup-order-flow`'s EVL cycle 1 (API and mobile drifted on menu response field names when built in parallel against a documented-but-not-live-tested contract; caught only by the independent EVL confirmation run, not by `tsc` or either agent's self-report). Not a fixable test-runner gap in the traditional sense, but worth remembering as a process/workflow risk: treat a live-integration checkpoint or a shared runtime-validated contract fixture (see `apps/mobile/src/lib/api-client.contract.ts` — relocated 13-07-26 by `merge-menu-api-reconciliation` from the deleted `features/menu/lib/api-client.contract.ts`, same regression-guard intent preserved) as close to mandatory whenever a plan splits a network-contract's two sides across parallel execute agents.
