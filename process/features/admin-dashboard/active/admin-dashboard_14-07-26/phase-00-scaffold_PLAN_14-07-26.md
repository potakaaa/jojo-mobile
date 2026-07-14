---
name: plan:admin-phase-00-scaffold
description: "Phase 0 of admin-dashboard program — scaffold apps/admin (TanStack Start + Tailwind + shadcn/ui), port design tokens, wire tooling"
date: 14-07-26
feature: admin-dashboard
phase: "0"
---

# Phase 0 — Scaffold

**Date:** 14-07-26
**Complexity:** COMPLEX (foundation phase of an 8-phase program; no business logic, but tooling
decisions here are load-bearing for all 7 later phases)
**Status:** ⏳ PLANNED

Date: 14-07-26
Status: PLANNED
Complexity: COMPLEX

---

## Overview

Create `apps/admin` — a new workspace app, package `@jojopotato/admin` — as the foundation for the
Jojo Potato Admin Dashboard program. This phase produces NO business screens and NO auth. Its job is
purely: prove the app boots, prove the shared design tokens render, prove typecheck/lint/test/build
all run through the existing turbo pipeline the same way `apps/mobile` does, and resolve three open
tooling decisions (ESLint config shape, turbo build-output dir, test runner) so Phase 1+ never has to
revisit plumbing.

Stack: **TanStack Start** (file-based routing, Vite-based dev/build) + **Tailwind CSS** (v4, `@theme`
token block — same convention the design tokens were originally sourced *from*, see
`packages/ui/src/theme.ts:1-9`) + **shadcn/ui** (component primitives, installed as source into the
app, not a runtime dependency) + **`@tanstack/react-query`** (already a proven pattern in this repo —
`apps/mobile/package.json` already depends on `@tanstack/react-query@^5.62.0` for its menu/branch data
layer, see `process/context/all-context.md` §"Menu/branch data layer superseded" — Phase 0 gives
`apps/admin` its OWN separate query client instance, not a shared one, since it's a different
app/runtime).

`pnpm-workspace.yaml:1-3` already globs `apps/*`, so `apps/admin` is auto-discovered the moment its
`package.json` exists — no workspace config change needed.

---

## Cross-Cutting Compliance

1. **Modularity** — Phase 0 introduces exactly one new top-level unit: `apps/admin/`. Inside it,
   route files live under TanStack Start's file-based `src/routes/` convention (mirrors
   `apps/mobile/src/app/` Expo Router convention already in the repo). No feature folders
   (`src/features/{domain}/`) are created yet — those start in Phase 1 (auth) and Phase 2 (branches).
   Tailwind config and shadcn primitives are the only shared UI surface this phase adds; they live in
   one place (`apps/admin/src/styles/`, `apps/admin/src/components/ui/`) so Phase 1+ import from a
   single source, not copy-paste.

2. **Clarity** — `tsconfig.json` extends `@jojopotato/config/typescript/base`
   (`packages/config/package.json:12` → `./typescript/tsconfig.base.json`), the SAME base every
   non-Expo package in the repo already uses (NOT `./typescript/expo`, which is Expo/RN-specific and
   wrong for a web app — `apps/mobile/tsconfig.json:2` uses the expo variant precisely because it's
   an Expo app). ESLint: ADR below picks the lighter of two options and states why. Scripts
   (`dev`/`build`/`lint`/`typecheck`/`test`) mirror the exact script *names* `apps/mobile/package.json`
   already uses (`"lint": "eslint ."`, `"typecheck": "tsc --noEmit"`, `"test": "vitest run
   --passWithNoTests"`) so turbo's `dependsOn: ["^lint"]`/`["^typecheck"]` pipelines
   (`turbo.json:33-38`) work identically across both apps without special-casing.

3. **Safety** — this phase has no data/auth surface, so the two program-level hard invariants
   (order_items snapshot integrity, star_transactions retroactivity) do not apply here. The only
   safety-relevant action is repo-wide: do not touch `apps/mobile/**`, `packages/ui/**`, or any
   existing package's config while creating `apps/admin` — this phase is additive-only. `turbo.json`
   is edited ONLY if the build-output-dir investigation (Step 5 below) proves the default `dist/**`
   assumption wrong for TanStack Start; if so, the edit is scoped to adding a per-app `build.outputs`
   override, never removing the existing entry mobile/other apps rely on.

4. **Security** — no auth surface exists yet (Phase 1 adds `requireAdmin` + the browser-cookie
   session flow). Nothing in this phase talks to `packages/api` at all. No secrets, no env vars beyond
   a placeholder `.env.example` mirroring `apps/mobile/.env.example`'s shape for forward-compat.

---

## Touchpoints

New files/dirs (all under `apps/admin/`, created fresh):

- `apps/admin/package.json` — new, `@jojopotato/admin`
- `apps/admin/tsconfig.json` — extends `@jojopotato/config/typescript/base`
- `apps/admin/eslint.config.js` — flat config, per ADR below
- `apps/admin/vite.config.ts` — TanStack Start / Vinxi app config
- `apps/admin/app.config.ts` (or equivalent TanStack Start entry config — confirm exact filename
  during RESEARCH via `vc-docs-seeker`, TanStack Start scaffolding has moved between filenames across
  versions)
- `apps/admin/src/routes/__root.tsx` — root route (shell: renders children, mounts global providers)
- `apps/admin/src/routes/index.tsx` — placeholder home route proving boot + tokens render
- `apps/admin/src/styles/globals.css` — Tailwind v4 entry + `@theme` block (ported tokens)
- `apps/admin/src/lib/query-client.ts` — `@tanstack/react-query` client instance (mirrors
  `apps/mobile/src/lib/query-client.ts` shape, separate instance)
- `apps/admin/src/components/ui/` — shadcn/ui primitives (installed via `shadcn` CLI or copied
  source, per Implementation Steps)
- `apps/admin/.env.example` — placeholder, mirrors `apps/mobile/.env.example` shape
- `apps/admin/vitest.config.ts` (or config embedded in `vite.config.ts`) — Vitest + jsdom +
  `@testing-library/react`
- `apps/admin/src/routes/index.test.tsx` — one trivial passing test (renders placeholder route)

Existing files read (not modified unless Step 5 proves otherwise):

- `pnpm-workspace.yaml` (read-only — already covers `apps/*`)
- `turbo.json` (read-only unless build-output investigation forces a scoped `build.outputs` override)
- `packages/config/package.json`, `packages/config/typescript/tsconfig.base.json`,
  `packages/config/eslint-base.js`, `packages/config/eslint.js` (read for extension)
- `packages/ui/src/theme.ts` (read-only — source of truth for ported tokens; NOT imported at
  runtime, since `packages/ui` is RN-only and cannot render in a web app — see umbrella "Locked
  Architecture Decisions")

---

## Public Contracts

- **Package name:** `@jojopotato/admin` (new workspace member, `apps/admin/package.json`)
- **Scripts contract** (must match every other app/package in the monorepo so `turbo run <task>`
  fans out correctly): `dev`, `build`, `lint`, `typecheck`, `test` — `pnpm --filter @jojopotato/admin
  test` must work standalone, `pnpm test` (root, running `turbo run test`) must include it
  automatically.
- **Tailwind design tokens** exposed as CSS custom properties / Tailwind theme extension — consumed
  by every later phase's UI. Once Phase 1+ start building screens, changing these tokens is a
  cross-phase contract change; Phase 0 should get the token set right rather than approximate it (the
  full `Palette`/`Spacing`/`Radii`/`Shadows`/`FontFamily`/`TypeScale` in `packages/ui/src/theme.ts` is
  the exact contract to port — see Implementation Step 4).
- **No API contract yet** — this phase does not create or call any `/api/*` route.
- **Test runner contract:** Vitest + `@testing-library/react`, jsdom environment. This is a NEW
  precedent (no existing web-app runner in the repo) — Phase 1+ inherit this choice; document it in
  `process/context/tests/all-tests.md` during UPDATE PROCESS (not this phase's job to write the
  context update, but note it in the phase report as a follow-up for update-process-agent).

---

## Blast Radius

- **Packages touched:** 1 new (`apps/admin`). Zero existing packages modified, UNLESS the turbo
  build-output investigation (Implementation Step 5) proves `dist/**` wrong for TanStack Start/Vinxi,
  in which case `turbo.json` gets one additive, scoped change (a per-app `outputs` override — never a
  removal of the existing `dist/**` entry other apps rely on).
  - **Registry note:** if `turbo.json` needs a change, this is a SHARED root-config file also
    touchable by other phases in theory (none currently plan to touch it) — record in the
    phase-blast-radius-registry as `parallel-safe` since no other active phase plan touches
    `turbo.json`.
- **Risk class:** none of the umbrella's named high-risk classes (auth/billing/schema/API
  contract/deploy-runtime/secrets) apply — this is pure scaffolding. Lowest-risk phase in the program.
- **File count:** roughly 12-15 new files (see Touchpoints), all under `apps/admin/`.

---

## Implementation Checklist (Implementation Steps)

1. **Resolve the ESLint ADR (decision point, not mechanical)** — two options, pick one during
   INNOVATE for this phase, record the choice here before EXECUTE:
   - **Option A (recommended — lighter):** `apps/admin/eslint.config.js` re-exports
     `@jojopotato/config/eslint-base` (`packages/config/eslint-base.js` — the plain-TS base, no RN/JSX
     Expo rules) PLUS a small local override block adding `eslint-plugin-react`/
     `eslint-plugin-react-hooks`/JSX-a11y rules inline in the app's own config file — mirrors how
     `apps/mobile/eslint.config.js:1-6` layers `@jojopotato/config/eslint` (the RN/JSX-flavored export)
     + a local `ignores` override, except admin needs a *web*-React override, not RN's.
   - **Option B (heavier):** add a new `./eslint-web-react` export to `packages/config` (new file
     `packages/config/eslint-web-react.js`, new `package.json` export entry) that centralizes
     React-web + JSX + a11y rules for reuse by any *future* web app.
   - **Recommendation:** Option A. Only one web app exists right now — a new shared config export in
     `packages/config` is speculative until a second web app exists (YAGNI). If Phase 1+ or a later
     program adds a second web app, revisit and promote to Option B then. Confirm this recommendation
     during this phase's own INNOVATE step before EXECUTE.

2. **Verify TanStack Start scaffolding specifics via `vc-docs-seeker`** (mandatory before writing any
   checklist step referencing a TanStack Start API/CLI) — confirm: current recommended scaffold
   command/template, exact config filename(s) (`app.config.ts` vs `vite.config.ts` alone — this has
   moved across TanStack Start versions), and the file-based routing convention's exact root-file name
   (`__root.tsx` is the framework convention as of recent versions — confirm, don't assume from
   memory).

3. **Create `apps/admin/package.json`** with `name: "@jojopotato/admin"`, `private: true`, and scripts
   `dev`/`build`/`lint`/`typecheck`/`test` matching the exact script command shapes used elsewhere
   (`"lint": "eslint ."`, `"typecheck": "tsc --noEmit"`, `"test": "vitest run --passWithNoTests"` —
   copy verbatim from `apps/mobile/package.json:11-13` pattern; `"build"` runs the TanStack
   Start/Vinxi build command per Step 2's confirmed CLI). Add `@jojopotato/config` as a devDependency
   (workspace:*), plus TanStack Start, Tailwind, shadcn/ui deps, `@tanstack/react-query`, Vitest,
   `@testing-library/react`, `jsdom` as confirmed by Step 2.

4. **Create `apps/admin/tsconfig.json`** extending `@jojopotato/config/typescript/base`
   (`packages/config/package.json:12` export → `packages/config/typescript/tsconfig.base.json`) — NOT
   the `expo` variant. Add any TanStack Start-required `compilerOptions`/`include` per Step 2's
   findings (e.g. path aliases for `src/*`, matching the `@/*` convention `apps/mobile/tsconfig.json:4`
   already establishes for consistency, though the exact alias target differs per app).

5. **Verify turbo build-output directory** — before assuming `turbo.json`'s existing
   `build.outputs: ["dist/**"]` (`turbo.json:33-36`) covers TanStack Start: run the confirmed build
   command from Step 2 locally in `apps/admin` once scaffolded, inspect the actual output directory
   (Vinxi/Vite-based TanStack Start apps commonly output to `.output/` — confirm, don't assume). If the
   output dir differs from `dist/**`:
   - Preferred fix: configure Vinxi/Vite's build output path to `dist` (keeps `turbo.json` untouched,
     lowest blast radius).
   - Fallback: add a per-app override under `turbo.json`'s `build` task (e.g. Turbo's per-package task
     config via `apps/admin/turbo.json` extension file, or a root `build` task output-glob widening
     that also covers `.output/**` — confirm Turbo's supported mechanism for per-package output
     overrides via `vc-docs-seeker` before writing this file).
   - Document whichever path was taken in the phase report — this affects whether `pnpm build` /
     CI's build step actually caches/finds admin's build output.

6. **Port design tokens into Tailwind v4 `@theme` CSS block** (`apps/admin/src/styles/globals.css`).
   Source of truth: `packages/ui/src/theme.ts:19-220` (read-only, not imported at runtime — RN can't
   run in a web app). Map every export:
   - `Palette` (`theme.ts:19-51`) → CSS custom properties, e.g. `--color-cream: #FFF6E6;
     --color-ink: #1C1714; --color-jyellow: #FFD21E; --color-jred: #E81E26; --color-jorange: #FF7A18;
     --color-jgold: #F7B500; --color-jbrown: #C1440E; --color-panel: #2a2420; --color-panel-border:
     #4a4038;` plus the Tier 2 secondary palette (creamTint1-5, goldLight, green, greenDark, redDark,
     neutral100-950) — port all of them, not a subset, since later phases may need any of them.
   - `Spacing` (`theme.ts:99-107`) → `--spacing-half: 2px; --spacing-one: 4px; --spacing-two: 8px;
     --spacing-three: 16px; --spacing-four: 24px; --spacing-five: 32px; --spacing-six: 64px;` (named,
     not Tailwind's default numeric spacing scale — keep the RN app's naming convention consistent
     across web/mobile so a dev switching between them recognizes the same token names).
   - `Radii` (`theme.ts:117-126`) → `--radius-xs: 10px; --radius-sm: 12px; --radius-md: 16px;
     --radius-lg: 20px; --radius-xl: 24px; --radius-2xl: 34px; --radius-3xl: 40px; --radius-full:
     999px;`. **FLAG (per task instructions): Tailwind's default theme ALSO defines `2xl`/`3xl` radius
     keys with different values (Tailwind default `2xl` = 16px-ish, `3xl` = 24px-ish, framework
     version-dependent).** This phase MUST override, not extend/merge, these two keys in the `@theme`
     block so the brand's `34px`/`40px` values win outright — verify Tailwind v4's override-vs-extend
     semantics for `@theme` blocks via `vc-docs-seeker` before finalizing (in Tailwind v4, redeclaring
     a theme key in `@theme` replaces the default for that key; confirm this is still true for the
     installed version).
   - `Shadows` (`theme.ts:139-184`) → CSS `box-shadow` utilities/custom properties: `offsetSm/Md/Lg`
     become literal `box-shadow: 4px 4px 0 #1C1714` / `5px 5px 0 #1C1714` / `6px 6px 0 #1C1714` (the
     "comic hard shadow" — RN's `shadowOffset`+`shadowOpacity:1`+`shadowRadius:0` combo translates
     directly to a zero-blur CSS box-shadow, per the task's explicit instruction). `softSm/Md/Lg`
     become blurred variants: e.g. `box-shadow: 0 16px 28px rgba(28,23,20,0.4)` for `softSm` (RGB from
     `Palette.ink` #1C1714 = rgb(28,23,20), alpha from `shadowOpacity`, blur from `shadowRadius`,
     y-offset from `shadowOffset.height`) — repeat the rgba-conversion pattern for `softMd`/`softLg`.
   - `FontFamily` (`theme.ts:193-205`) → `@font-face` declarations or a fontsource package import
     (NOT Expo's font loader, which doesn't exist on web) for Fredoka (weights 600/700 —
     `Fredoka_600SemiBold`/`Fredoka_700Bold`) and Plus Jakarta Sans (weights 400/500/600/700/800).
     Prefer `@fontsource/fredoka` + `@fontsource-variable/plus-jakarta-sans` (or the fontsource
     packages matching the exact weights above) over hand-rolled `@font-face` + manual font files,
     since fontsource packages are the standard web convention and avoid asset-licensing/file-hosting
     work. Confirm exact package names via `vc-docs-seeker` before adding as a dependency.
   - `TypeScale` (`theme.ts:212-220`) → `--font-size-display: 32px; --font-size-h1: 26px;
     --font-size-h2: 22px; --font-size-h3: 18px; --font-size-body: 16px; --font-size-body-small: 14px;
     --font-size-caption: 12px;`.
   - `Colors.light`/`Colors.dark` (`theme.ts:73-94`) semantic mapping is OUT OF SCOPE for this phase —
     the admin dashboard is not required to support dark mode in P0-P7 per the umbrella (no dark-mode
     requirement stated in the Program Goal Charter); port the raw `Palette`/`Spacing`/`Radii`/
     `Shadows`/`FontFamily`/`TypeScale` primitives only. If a later phase needs semantic light/dark
     mapping, that phase adds it — do not speculatively build it now (YAGNI).

7. **Install shadcn/ui primitives** into `apps/admin/src/components/ui/` via the shadcn CLI
   (`npx shadcn@latest init` then `add` for the specific primitives Phase 1+ will need first — for
   Phase 0 itself, only what's needed to prove the placeholder route renders styled content, e.g.
   `button`, `card`). Confirm the shadcn CLI's Tailwind-v4-compatible init flow via `vc-docs-seeker`
   (shadcn's config format changed across Tailwind v3→v4 migrations).

8. **Wire `apps/admin/src/lib/query-client.ts`** — a `QueryClient` instance + `QueryClientProvider`
   wrapper, mounted in `src/routes/__root.tsx`. Mirror the shape of `apps/mobile/src/lib/query-client.ts`
   (read it during RESEARCH for the exact instantiation pattern) but instantiate a SEPARATE client —
   do not import or share the mobile app's instance (different runtime, different bundler).

9. **Create the placeholder root + index route.** `src/routes/__root.tsx` renders `<html>`/`<body>`
   shell + mounts `QueryClientProvider`. `src/routes/index.tsx` renders a minimal page: brand wordmark
   text styled with the ported tokens (e.g. `bg-[var(--color-cream)] text-[var(--color-ink)]`), a
   shadcn `Button` styled with the comic hard-shadow utility, proving (a) the app boots, (b) tokens
   render correctly, (c) shadcn primitives work. NO navigation, NO auth check, NO business content.

10. **Set up Vitest + `@testing-library/react`** (`apps/admin/vitest.config.ts` or embedded config),
    jsdom environment. Write exactly one trivial passing test
    (`apps/admin/src/routes/index.test.tsx`) that renders the placeholder index route and asserts the
    brand wordmark text is present — proves the test runner precedent works end-to-end, nothing more.

11. **Add `apps/admin/.env.example`** mirroring `apps/mobile/.env.example`'s shape (client-runtime
    config placeholders only — no secrets). Exact var names TBD during EXECUTE once the API base URL
    convention for a web client is confirmed (likely a `VITE_*`-prefixed equivalent of
    `EXPO_PUBLIC_API_URL`, per TanStack Start/Vite's env-var convention — confirm prefix via
    `vc-docs-seeker`).

12. **Run the full local verification loop** (see Verification Evidence) — `pnpm --filter
    @jojopotato/admin typecheck`, `lint`, `test`, `build`, then `pnpm build`/`pnpm typecheck`/`pnpm
    lint`/`pnpm test` from root to confirm turbo's pipeline picks up the new package automatically.

---

## Acceptance Criteria

1. `apps/admin/` exists as a workspace member; `pnpm install` at root recognizes `@jojopotato/admin`
   with zero manual `pnpm-workspace.yaml` edits (glob already covers it).
2. `pnpm --filter @jojopotato/admin typecheck` exits 0.
3. `pnpm --filter @jojopotato/admin lint` exits 0.
4. `pnpm --filter @jojopotato/admin test` exits 0 and runs the one placeholder test green (not
   `--passWithNoTests` skip — an actual test executes and passes).
5. `pnpm --filter @jojopotato/admin build` exits 0 and produces a build output directory; the
   directory is confirmed to be either `dist/**` (matching `turbo.json`'s existing glob) OR a
   documented, deliberately-added override is in place so `turbo run build` at root does not silently
   skip/miscache admin's output.
6. `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (root turbo commands) all include
   `@jojopotato/admin` in their run and all pass.
7. Running the app's dev server (per Step 2's confirmed command) and visiting the placeholder route
   in a browser shows: cream background, ink text, a button styled with the 4px/4px hard ink shadow,
   Fredoka/Plus Jakarta Sans fonts loaded (visually distinct from system default) — confirmed via
   Agent-Probe (see Verification Evidence).
8. Tailwind's default `2xl`/`3xl` radius key clash is confirmed resolved (brand's 34px/40px values
   win, not Tailwind's defaults) — confirmed via a rendered element using `rounded-2xl` or `rounded-3xl`
   showing the brand radius value, not Tailwind's default.
9. No existing package/app (`apps/mobile`, `packages/*`) has any file modified by this phase, UNLESS
   `turbo.json` needed the scoped build-output override (Acceptance Criterion 5) — in which case the
   diff to `turbo.json` is additive-only and does not alter the existing `dist/**` entry for other
   apps.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/admin typecheck` exits 0 | Fully-Automated | AC2 |
| `pnpm --filter @jojopotato/admin lint` exits 0 | Fully-Automated | AC3 |
| `pnpm --filter @jojopotato/admin test` — placeholder Vitest test renders index route, asserts brand wordmark text present | Fully-Automated | AC4 |
| `pnpm --filter @jojopotato/admin build` exits 0, output dir inspected | Fully-Automated | AC5 |
| Root `pnpm build`/`pnpm lint`/`pnpm typecheck`/`pnpm test` include and pass `@jojopotato/admin` | Fully-Automated | AC1, AC6 |
| CI workflow (`.github/workflows/ci.yml`) run including the new app — confirm no config change needed there (turbo auto-discovers) | Hybrid — precondition: CI run or local `act`/dry-run equivalent; if neither available, verify by reading `ci.yml`'s turbo invocation and confirming it uses root `pnpm build`/`test`/etc. without a hardcoded package list | AC6 |
| Agent-Probe: load the dev server placeholder route in a browser, visually confirm cream bg / ink text / Fredoka+Jakarta fonts / 4px hard ink-shadow button / brand-radius `rounded-2xl`/`rounded-3xl` (not Tailwind default) | Agent-Probe | AC7, AC8 |
| Manual diff review: `git diff --stat` shows only `apps/admin/**` (+ optionally a scoped `turbo.json` hunk) touched — no `apps/mobile/**` or `packages/*` files modified | Fully-Automated (`git diff --stat` + grep check) | AC9 |

---

## Test Infra Improvement Notes

This phase establishes the FIRST web-app test runner precedent in the repo (Vitest +
`@testing-library/react`, jsdom). No prior web-runner convention exists to compare against.
`process/context/tests/all-tests.md` should be updated during UPDATE PROCESS to document this new
runner alongside the existing vitest-in-`packages/api`/vitest-in-`apps/mobile` (pure-TS)/jest-expo-in-
`packages/ui` entries — flagged as a follow-up for update-process-agent, not resolved in this phase
plan.

(No other test infra gaps identified yet — this phase's scope is narrow enough that gaps found during
EXECUTE, if any, will be added here via PVL-supplement or the Inner Loop Refresh Note.)

---

## Phase Completion Rules

This phase is CODE DONE when all Implementation Checklist steps are applied and Acceptance
Criteria 1-6 and 9 pass automated gates. It is VERIFIED only after Acceptance Criteria 7-8
(Agent-Probe visual confirmation) are also confirmed and the validate-contract gates below are
green (no placeholder contract remains) plus this phase's EVL confirmation run passes.

**Execute anchor:** this file (`phase-00-scaffold_PLAN_14-07-26.md`) is the single primary execute
anchor for Phase 0. There are no supporting phase files for Phase 0 — Phase 0 has no upstream
phase dependency and no sibling phase file needs to be read alongside it during EXECUTE.

---

## Phase Loop Progress

- [ ] 1. RESEARCH
- [ ] 2. INNOVATE
- [ ] 3. PLAN-SUPPLEMENT
- [ ] 4. PVL
- [ ] 5. EXECUTE
- [ ] 6. EVL
- [ ] 7. UPDATE-PROCESS

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-00-scaffold_PLAN_14-07-26.md`
2. **Last completed phase or step:** none — this plan was just written; Phase Loop Progress Step 1 (RESEARCH) has not started.
3. **Validate-contract status:** pending (placeholder below; `generated-by` field will be set by vc-validate-agent when it runs V1-V7 for this phase).
4. **Supporting context files loaded during this PLAN pass:**
   - `process/features/admin-dashboard/active/admin-dashboard_14-07-26/admin-dashboard_UMBRELLA_PLAN_14-07-26.md`
   - `process/context/all-context.md`
   - `package.json` (root), `pnpm-workspace.yaml`, `turbo.json`
   - `packages/config/package.json`, `packages/config/typescript/tsconfig.base.json` (read for extends target — not itself read in full here but its export path confirmed via package.json)
   - `apps/mobile/package.json`, `apps/mobile/eslint.config.js`, `apps/mobile/tsconfig.json`
   - `packages/ui/src/theme.ts` (full token source)
5. **Next step for a fresh agent picking up mid-execution:**
   - If Phase Loop Progress Step 1 unchecked → spawn vc-research-agent for this phase (re-read this plan + umbrella + confirm TanStack Start current scaffolding specifics via `vc-docs-seeker`, since framework APIs may have moved since this plan was written).
   - If Steps 1-4 checked but Step 5 (EXECUTE) not started → spawn vc-execute-agent with this exact plan path; no other phase plan should be passed alongside it (Phase 0 has no upstream phase dependency).
   - Do NOT spawn vc-execute-agent while validate-contract below is still the placeholder text.

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE. generated-by: TBD — set to
`outer-pvl` if this contract is written before Phase 0's own RESEARCH/INNOVATE steps have run for
this phase, or `inner-pvl: phase-0` if written after an inner-loop RESEARCH/INNOVATE pass for this
specific phase.)
