---
name: context:all-tests
description: "Test runner selection, commands, and verification order — no runner configured yet"
keywords: test, tests, testing, typecheck, lint, verification, runner, jest, vitest, detox, playwright
related: []
date: 08-07-26
---

# Jojo Potato - All Tests

Last updated: 2026-07-08

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

### There is no test runner configured yet

No `package.json` in this repo (root, `apps/mobile`, or any `packages/*`) declares Jest, Vitest,
Detox, Playwright, or any other test runner. `grep -r "jest\|vitest" **/package.json` returns
nothing outside `node_modules`.

Until a runner is chosen, "verification" for this repo means:

1. `pnpm typecheck` (tsc --noEmit per package, via turbo)
2. `pnpm lint` (ESLint flat config per package, via turbo)
3. manual verification in the Expo app (`pnpm ios` / `pnpm android` / `pnpm web`)

When a plan introduces real logic worth unit-testing (e.g. cart price calculation, currency
formatting in `packages/utils`), the plan should explicitly propose adding a test runner
(Vitest is the natural fit for the TS-only packages; Jest via `jest-expo` or Detox/Maestro for
RN component or e2e coverage) rather than assuming one already exists.

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
| (none) | (no test runner configured) | -- | see Known Gaps |

## Debugging Quick Reference

- No test-specific config exists yet (no `jest.config.*`, `vitest.config.*`, `.env.test`, mocks, or fixtures anywhere in the repo).
- Typecheck failures are the fastest signal in this repo today — packages are TS-source-only (no build step), so `tsc --noEmit` catches cross-package type breakage immediately via workspace links.
- `turbo` caches `typecheck`/`lint` results — if a fix doesn't seem to take effect, try `pnpm typecheck --force` or check `.turbo/` cache state.

## Known Gaps

- **No test runner configured at all** — no Jest/Vitest/Detox/Playwright in any `package.json`. This is expected for a fresh skeleton repo but should be flagged in any plan that adds real business logic (cart math, pricing, auth flows) without also proposing a test runner.
- **No CI pipeline** — no `.github/workflows/`, so `typecheck`/`lint` are not automatically enforced on PRs yet.
- **No e2e coverage** — no Detox/Maestro/Playwright setup for the Expo app.
