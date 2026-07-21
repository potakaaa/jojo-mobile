---
phase: phase-00-scaffold
date: 2026-07-14
status: COMPLETE_WITH_GAPS
feature: admin-dashboard
plan: process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-00-scaffold_PLAN_14-07-26.md
---

# Phase 0 — Scaffold — EXECUTE Report

**TL;DR:** `apps/admin` (`@jojopotato/admin`) scaffolded from empty: TanStack Start (Vite 8) +
Tailwind v4 + shadcn/ui primitives + separate react-query client + Vitest. All 7 automated gates
green. `turbo.json` NOT touched (build outputs to `dist/` — matches the existing glob). Only remaining
work: AC7-9 Agent-Probe browser visual check (no automated visual runner exists — by design).

## What Was Done

Created `apps/admin/` (18 authored files + generated `routeTree.gen.ts`), all under `apps/admin/`:

- **Workspace/tooling:** `package.json` (`@jojopotato/admin`, `"type": "module"`, scripts
  `dev/build/lint/typecheck/test` matching repo shape), `tsconfig.json` (extends
  `@jojopotato/config/typescript/base` + web overrides: jsx react-jsx, DOM.Iterable, `noEmit`,
  `@/*` alias), `eslint.config.cjs` (Option A — `eslint-base` + inline react-hooks + browser
  globals), `.env.example` (VITE_ placeholders), `.gitignore` (dist/.tanstack/.output).
- **TanStack Start:** `vite.config.ts` (`resolve.tsconfigPaths` + plugins `[tailwindcss(),
  tanstackStart(), viteReact()]` in that order), `src/router.tsx` (`getRouter`), `src/routes/__root.tsx`
  (`shellComponent`, mounts `QueryClientProvider`), `src/routes/index.tsx`, `tsr.config.json`,
  generated `src/routeTree.gen.ts`.
- **Tailwind v4 + tokens:** `src/styles/globals.css` — `@import "tailwindcss"` + `tw-animate-css`,
  full `@theme` port of `packages/ui/src/theme.ts` (Palette Tier1+Tier2, named Spacing, Radii with
  2xl/3xl overriding Tailwind defaults, comic hard + soft Shadows, Fredoka/Plus-Jakarta fonts, TypeScale
  as `--text-*`), plus the two-block shadcn semantic mapping (`:root` raw slots + `@theme inline`
  color remap), light-mode only, all semantic slots incl. `--chart-1..5` and `--radius`.
- **shadcn/ui:** `components.json`, `src/lib/utils.ts` (`cn`), `src/components/ui/button.tsx` +
  `card.tsx` (canonical registry source, `radix-ui` dep), `src/components/admin-home.tsx`
  (placeholder proving boot + brand tokens + stock primitives on-brand).
- **react-query:** `src/lib/query-client.ts` (separate instance).
- **Test:** `vitest.config.ts` (jsdom, separate from vite.config so tanstackStart SSR plugin isn't
  loaded), `src/routes/index.test.tsx` (renders `AdminHome`, asserts brand wordmark — 1 test, green).

## Test Gate Outcomes

| Gate | AC | Result |
|---|---|---|
| `pnpm --filter @jojopotato/admin typecheck` | AC2 | PASS (exit 0) |
| `pnpm --filter @jojopotato/admin lint` | AC3 | PASS (exit 0) |
| `pnpm --filter @jojopotato/admin test` | AC4 | PASS — 1 test executes green (not passWithNoTests skip) |
| `pnpm --filter @jojopotato/admin build` + `dist` non-empty | AC5 | PASS — dist/client + dist/server produced |
| Root `pnpm lint` includes + passes admin | AC1, AC6 | PASS — 7/7 tasks green |
| Root `pnpm typecheck` includes + passes admin | AC1, AC6 | admin task PASS; root command RED due to pre-existing `@jojopotato/mobile` typed-route errors (unrelated — see Concerns) |
| Admin in root `build`/`test` turbo graphs (`--dry`) | AC6 | PASS — `@jojopotato/admin#build`, `@jojopotato/admin#test` present |
| `git diff --stat` diff-scope | AC10 | PASS — only `apps/admin/**` (new) + `pnpm-lock.yaml`; no apps/mobile, packages/*, or turbo.json changes |
| Harness validators (agent-parity/skills/context-discovery/protocol-wiring) | umbrella | PASS (no harness files touched; run as precaution) |
| Visual on-brand render (cream bg/ink text/Fredoka+Jakarta/4px hard shadow/brand radius/stock shadcn on-brand) | AC7, AC8, AC9 | PENDING — Agent-Probe/manual, no automated visual runner (by design) |

## What Was Skipped or Deferred

- **AC7-9 Agent-Probe visual walkthrough** — requires loading the dev server (`pnpm --filter
  @jojopotato/admin dev`, port 3100) in a browser. No automated visual-regression runner exists in
  this repo (project-wide gap). Deferred to manual QA / EVL Agent-Probe step.
- shadcn primitives beyond Button/Card (Input/Dialog/Table/Select) — plan said "only what's needed
  to prove the placeholder route renders" for P0; those are added in P1+ when first consumed (YAGNI).

## Plan Deviations (all within-blast-radius, apps/admin only)

1. **`eslint.config.js` → `eslint.config.cjs`** — `"type": "module"` makes `.js` ESM, but the base
   config is CommonJS (`require`). Renamed to `.cjs`. (Plan named `eslint.config.js`; `.cjs` is the
   correct extension given `type: module`.)
2. **react-hooks wired manually** — `reactHooks.configs['recommended-latest']` in v7.1.1 embeds a
   legacy array `plugins` field that flat config rejects; wired `plugins: { 'react-hooks': reactHooks }`
   + `configs.recommended.rules` instead. eslint-plugin-react + jsx-a11y NOT added (react-hooks is the
   high-value rule set; a11y deferred until real screens exist — Option A intent preserved).
3. **vitest v4 instead of repo-standard v3** — vitest 3 bundles vite 7, whose `Plugin` type clashes
   with the app's vite 8 `@vitejs/plugin-react`, breaking typecheck. vitest 4 is vite-8-based
   (the TanStack template's own choice) and removes the clash. Still Vitest; isolated per-package.
4. **Type scale uses `--text-*` not `--font-size-*`** — Tailwind v4's font-size utility namespace is
   `--text-*`; the plan's `--font-size-*` would not generate `text-display` etc. utilities. Corrected
   so tokens are actually usable (AC8 intent).
5. **Fonts via Google Fonts `@import url()` not `@fontsource/*`** — the plan *preferred* fontsource but
   left it open ("confirm package names"). Google Fonts @import is the TanStack template's own
   convention, adds zero dependencies, and satisfies AC7 ("fonts loaded, visually distinct"). Documented
   as the chosen option; can switch to fontsource later with no API change.

No hard-stop-class deviations (no schema/auth/API/billing/container/secret surface touched).

## Test Infra Gaps Found

- **First web-app Vitest runner precedent** (jsdom + @testing-library/react) established in
  `apps/admin`. `process/context/tests/all-tests.md` should document it alongside the existing
  vitest-in-api / vitest-in-mobile / jest-expo-in-ui entries — **flagged for UPDATE PROCESS**, not
  done here.
- No automated visual-regression/E2E browser runner (project-wide, pre-existing) — AC7-9 rely on
  Agent-Probe. Consistent with prior phases (e.g. pickup-order-flow).

## turbo.json Decision (E1 / AC5)

**Not touched.** Empirical build (E1) confirmed TanStack Start v1.168 (Vite 8) outputs to `dist/`
(`dist/client` + `dist/server`), which matches `turbo.json`'s existing `build.outputs: ["dist/**"]`
glob exactly. Root `.gitignore` already ignores `dist/`. No turbo.json edit, no gitignore edit, and
therefore no mobile-build regression re-check needed (E1 trigger condition never met).

## Closeout Packet

- **Selected plan:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-00-scaffold_PLAN_14-07-26.md`
- **Finished:** full apps/admin scaffold; all 7 automated gates green; diff confined to apps/admin + lockfile.
- **Verified vs unverified:** automated typecheck/lint/test/build + turbo inclusion VERIFIED; AC7-9
  visual on-brand rendering UNVERIFIED (Agent-Probe pending).
- **Classification:** `Keep in active/testing` — code-complete, awaiting EVL confirmation run +
  Agent-Probe visual pass before UPDATE PROCESS archival.
- **Follow-up stubs created:** none (no code gap required deferral).
- **CONTEXT_PARTIAL:** none.

## Forward Preview

- **Test Infra Found:** `apps/admin` Vitest (jsdom + @testing-library/react) — run
  `pnpm --filter @jojopotato/admin test`. First web-app runner in the repo.
- **Blast Radius Changes:** new package `@jojopotato/admin` at `apps/admin/`. `pnpm-lock.yaml` grew
  (new deps: @tanstack/react-start/router, tailwindcss v4, radix-ui, cva/clsx/tailwind-merge,
  vitest 4). turbo.json unchanged.
- **Commands to Stay Green:** `pnpm --filter @jojopotato/admin typecheck|lint|test|build`. NOTE: root
  `pnpm typecheck` is RED due to PRE-EXISTING `@jojopotato/mobile` typed-route errors (staff
  order-detail, deals routes) — NOT introduced by this phase (apps/mobile has zero changes in this
  diff). Phase 1 should be aware root typecheck was already red on entry.
- **Dependency Changes:** P1 (auth) consumes this scaffold: adds `apps/admin/src/features/auth/**`,
  the real `/api/admin` client in `apps/admin/src/lib/`, and shadcn Input/Dialog primitives. The
  brand token layer (globals.css) is now the cross-phase styling contract — changing it later is a
  cross-phase change.
