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
**Status:** ✅ VERIFIED

Date: 14-07-26
Status: VERIFIED (14-07-26)
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
   is edited ONLY if the build-output-dir investigation (Step 5 below) proves the default build-output
   glob assumption wrong for TanStack Start; if so, the edit is scoped to adding a per-app
   `build.outputs` override, never removing the existing entry mobile/other apps rely on.

4. **Security** — no auth surface exists yet (Phase 1 adds `requireAdmin` + the browser-cookie
   session flow). Nothing in this phase talks to `packages/api` at all. No secrets, no env vars beyond
   a placeholder `.env.example` mirroring `apps/mobile/.env.example`'s shape for forward-compat.

5. **UI component modularity & reusability** — this phase lays the reusable-UI foundation but builds
   NO cross-domain composites yet (no second consumer exists — `ponytail:` YAGNI). Concretely: scaffold
   the shadcn/ui primitives into `apps/admin/src/components/ui/` (Button, Input, Dialog, Table, Select
   as the initial set) and port `theme.ts` design tokens into Tailwind `@theme` as the single styling
   source of truth. `packages/ui` (React Native) is explicitly NOT reused. The cross-domain CRUD
   composites (data-table, form-dialog, confirm-dialog, page-header, query-states) are first extracted
   in P2, not here — P0 only proves the primitives + tokens render.

---

## Touchpoints

New files/dirs (all under `apps/admin/`, created fresh):

- `apps/admin/package.json` — new, `@jojopotato/admin`. Must include `"type": "module"` at
  top level (required by TanStack Start's Vite-based build/dev setup — confirmed via research).
- `apps/admin/tsconfig.json` — extends `@jojopotato/config/typescript/base`
- `apps/admin/eslint.config.js` — flat config, per ADR below
- `apps/admin/vite.config.ts` — TanStack Start config lives here ONLY. Confirmed via research:
  TanStack Start migrated off Vinxi to plain Vite — there is NO separate `app.config.ts`/Vinxi
  config file for current versions. Register `tanstackStart()` from
  `@tanstack/react-start/plugin/vite` in the Vite plugins array BEFORE `@vitejs/plugin-react`.
  **Live-reconfirm at EXECUTE:** re-verify this is still true for the pinned version (this surface
  shipped changes as recently as Feb/Mar 2026) — do not trust this research snapshot blindly.
- `apps/admin/src/router.tsx` — the router-instance factory file TanStack Start requires
  (creates and exports the `Router` instance consumed by the entry/root files) — confirmed
  required alongside `src/routes/__root.tsx`/`src/routes/index.tsx`/`routeTree.gen.ts`, not
  optional scaffolding.
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
  build-output investigation (Implementation Step 5) proves the default build-output glob wrong for
  TanStack Start's plain-Vite build, in which case `turbo.json` gets one additive, scoped change (a
  per-app `outputs` override — never a removal of the existing entry other apps rely on).
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

2. **TanStack Start scaffolding specifics — confirmed via research, RECONFIRM live at EXECUTE**
   (this surface shipped changes as recently as Feb/Mar 2026 — do not trust this snapshot without a
   live check):
   - Framework package is `@tanstack/react-start` (NOT `@tanstack/start` — that name is stale).
   - Scaffold command: `npx @tanstack/cli create <dir> --template file-router` (the older
     `create-tsrouter-app` package still exists only as a deprecated forwarding wrapper — do not
     use it directly).
   - Config lives in `vite.config.ts` only — no separate `app.config.ts`/Vinxi file (see Touchpoints).
   - File-based routing root file is `src/routes/__root.tsx`; router instance factory is
     `src/router.tsx` (both now in Touchpoints).
   - **EXECUTE-time action:** run `npm view @tanstack/react-start versions` to pin the exact version
     compatible with React 19.2.3 and the Vite plugin, since research cannot guarantee current
     latest at execution time.

3. **Create `apps/admin/package.json`** with `name: "@jojopotato/admin"`, `private: true`,
   **`"type": "module"`** (required — TanStack Start's Vite-based dev/build tooling needs the
   package treated as ESM), and scripts
   `dev`/`build`/`lint`/`typecheck`/`test` matching the exact script command shapes used elsewhere
   (`"lint": "eslint ."`, `"typecheck": "tsc --noEmit"`, `"test": "vitest run --passWithNoTests"` —
   copy verbatim from `apps/mobile/package.json:11-13` pattern; `"build"` runs the TanStack
   Start build command per Step 2's confirmed CLI). Add `@jojopotato/config` as a devDependency
   (workspace:*), plus TanStack Start, Tailwind, shadcn/ui deps, `@tanstack/react-query`, Vitest,
   `@testing-library/react`, `jsdom` as confirmed by Step 2.

4. **Create `apps/admin/tsconfig.json`** extending `@jojopotato/config/typescript/base`
   (`packages/config/package.json:12` export → `packages/config/typescript/tsconfig.base.json`) — NOT
   the `expo` variant. Add any TanStack Start-required `compilerOptions`/`include` per Step 2's
   findings (e.g. path aliases for `src/*`, matching the `@/*` convention `apps/mobile/tsconfig.json:4`
   already establishes for consistency, though the exact alias target differs per app).

5. **Verify turbo build-output directory — EXECUTE-time empirical check, not a research guess.**
   `turbo.json`'s `build` task hardcodes a build-output glob. Research could NOT confirm whether
   TanStack Start's post-Vinxi plain-Vite build outputs to that same directory already or still
   defaults to a different directory for this package/version combo — this must be verified
   empirically once scaffolded: run the confirmed build command (Step 2) locally in `apps/admin`,
   inspect the actual output directory. If the output dir differs from the existing `turbo.json` glob:
   - Preferred fix: configure Vite's build output path to match the existing glob (keeps `turbo.json`
     untouched, lowest blast radius).
   - Fallback: add a per-app override under `turbo.json`'s `build` task (e.g. Turbo's per-package task
     config via `apps/admin/turbo.json` extension file, or a root `build` task output-glob widening
     that also covers the alternate output dir — confirm Turbo's supported mechanism for per-package
     output overrides via `vc-docs-seeker` before writing this file).
   - Document whichever path was taken in the phase report — this affects whether `pnpm build` /
     CI's build step actually caches/finds admin's build output.
   - **Automatable check (PVL addition — not manual "inspection"):** make the AC5 gate scriptable,
     e.g. after running the confirmed build command: assert the expected output directory exists
     AND is non-empty (`test -d apps/admin/<confirmed-output-dir>` plus an `ls -A` non-empty check;
     substitute `<confirmed-output-dir>` with whatever this step's empirical check confirms — the
     existing turbo-glob target directory or otherwise) and surface a clear failure marker if not.
     This replaces a human eyeballing the output with a real exit-code-driven gate, matching AC5's
     Fully-Automated classification.
   - **Gitignore contingency (PVL addition):** if the confirmed output directory differs from the
     existing turbo-glob target (root `.gitignore` already ignores that directory name repo-wide),
     add one matching entry to root `.gitignore` for the actual directory name — same scoped,
     additive-only profile as the `turbo.json` override above.
   - **Scope reminder:** if `turbo.json` needs a change, it must be a SCOPED, ADDITIVE change only
     (a per-app `outputs` override) — never remove or narrow the existing entry other apps rely on.
     If empirical output matches the existing glob, no `turbo.json` change is needed at all.

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
     block so the brand's `34px`/`40px` values win outright — resolved and confirmed in Step 7 below
     (redeclaring a key in `@theme` replaces the default; no separate unset step is needed).
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
   - `Colors.light`/`Colors.dark` (`theme.ts:73-94`) full dual light/dark semantic set is OUT OF SCOPE
     for this phase — the admin dashboard is not required to support dark mode in P0-P7 per the umbrella
     (no dark-mode requirement stated in the Program Goal Charter); port the raw `Palette`/`Spacing`/
     `Radii`/`Shadows`/`FontFamily`/`TypeScale` primitives only. If a later phase needs a dark theme,
     that phase adds it — do not speculatively build it now (YAGNI). **The single light-mode semantic
     mapping IS in scope — see step 6b (it is what makes shadcn primitives render on-brand).**

6b. **Map the brand palette onto shadcn/ui's semantic token slots** (same `globals.css` file — this is
    what integrates the existing brand look into the admin, per umbrella Cross-Cutting Principle #5
    "Brand/visual-identity fidelity"). shadcn primitives read a fixed set of semantic CSS variables:
    `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`,
    `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`,
    `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`,
    `--border`, `--input`, `--ring`, `--destructive`, `--radius`, plus `--chart-1` through
    `--chart-5` (the full v4 semantic slot list — confirmed via research; the earlier draft of this
    step named only a subset).

    **Structure — confirmed two-layer pattern, not a single merged block.** shadcn v4 + Tailwind v4
    generates CSS in TWO separate blocks, and EXECUTE must work WITH that generated scaffold, not
    against it:
    1. A `:root` block holding RAW brand values (e.g. `--background: var(--color-cream);
       --foreground: var(--color-ink); --primary: var(--color-jyellow); --primary-foreground:
       var(--color-ink); --card: var(--color-cream); --card-foreground: var(--color-ink);
       --popover: var(--color-cream); --popover-foreground: var(--color-ink); --secondary-foreground:
       var(--color-ink); --accent: var(--color-jorange); --accent-foreground: var(--color-ink);
       --destructive: var(--color-jred); --radius: var(--radius-md);` — all semantic slots above get
       a value here).
    2. A separate `@theme inline` block that REMAPS `--color-background: var(--background);
       --color-foreground: var(--foreground);` (repeat for every semantic slot) so Tailwind
       utility classes (`bg-background`, `text-foreground`, etc.) actually resolve to the `:root`
       values. Without this second block, `bg-background`-style utilities silently fail to pick up
       the brand override.

    Light-mode only this phase (single `:root`; no `.dark` block — no dark-mode requirement per
    umbrella charter). Goal unchanged: NO screen in P1-P7 should need to override a primitive's
    color inline — if one does, the mapping here is wrong and gets fixed here, not per-screen.
    **Live-reconfirm at EXECUTE:** confirm the exact two-block generated shape against the actual
    `shadcn init` output for the pinned version before finalizing — research confirms the pattern,
    not the byte-for-byte generated file.

7. **Install Tailwind v4 first, then shadcn/ui primitives.**
   - Tailwind v4: install `tailwindcss` + `@tailwindcss/vite`, add `tailwindcss()` to the Vite
     plugins array — NO PostCSS config, NO `tailwind.config.*` file (v4 convention, confirmed via
     research). Single `@import "tailwindcss";` line at the top of the CSS entry
     (`apps/admin/src/styles/globals.css`).
   - shadcn/ui primitives into `apps/admin/src/components/ui/` via the shadcn CLI
     (`npx shadcn@latest init` then `add` for the specific primitives Phase 1+ will need first — for
     Phase 0 itself, only what's needed to prove the placeholder route renders styled content, e.g.
     `button`, `card`).
   - **Open question, live-reconfirm at EXECUTE:** shadcn `init` template choice —
     `--template start` (TanStack-Start-specific, if it exists for the pinned CLI version) vs
     `--template vite` (generic). Check `shadcn@latest init --help` live and pick the more specific
     match. `init` will prompt for a base color; pick any — the prompted `:root` gets fully
     overwritten with the ported brand tokens per Step 6/6b regardless of the prompted choice.
   - **Radii clash resolution — confirmed, not just flagged.** Redeclaring `--radius-2xl`/
     `--radius-3xl` in the app's `@theme` block OVERRIDES Tailwind's built-in defaults for those
     keys (Tailwind v4 `@theme` semantics: redeclaring a key replaces the default, it does not
     merge/extend). This is sufficient to resolve the clash noted in Step 6 — no separate
     "unset the default" step is needed.

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

12. **Run `pnpm install` at the repo root first (PVL addition)** — links the new
    `@jojopotato/admin` workspace member now that its `package.json` exists; required before any
    `pnpm --filter @jojopotato/admin ...` command will resolve. **Then run the full local
    verification loop** (see Verification Evidence) — `pnpm --filter @jojopotato/admin typecheck`,
    `lint`, `test`, `build`, then `pnpm build`/`pnpm typecheck`/`pnpm lint`/`pnpm test` from root to
    confirm turbo's pipeline picks up the new package automatically.

---

## Acceptance Criteria

1. `apps/admin/` exists as a workspace member; `pnpm install` at root recognizes `@jojopotato/admin`
   with zero manual `pnpm-workspace.yaml` edits (glob already covers it).
2. `pnpm --filter @jojopotato/admin typecheck` exits 0.
3. `pnpm --filter @jojopotato/admin lint` exits 0.
4. `pnpm --filter @jojopotato/admin test` exits 0 and runs the one placeholder test green (not
   `--passWithNoTests` skip — an actual test executes and passes).
5. `pnpm --filter @jojopotato/admin build` exits 0 and produces a build output directory; the
   directory is confirmed to be either the existing `turbo.json` glob OR a documented,
   deliberately-added override is in place so `turbo run build` at root does not silently
   skip/miscache admin's output. Confirmed via the automatable directory-existence/non-empty check
   added to Implementation Step 5 (PVL addition) — not manual inspection alone.
6. `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (root turbo commands) all include
   `@jojopotato/admin` in their run and all pass.
7. Running the app's dev server (per Step 2's confirmed command) and visiting the placeholder route
   in a browser shows: cream background, ink text, a button styled with the 4px/4px hard ink shadow,
   Fredoka/Plus Jakarta Sans fonts loaded (visually distinct from system default) — confirmed via
   Agent-Probe (see Verification Evidence).
8. Tailwind's default `2xl`/`3xl` radius key clash is confirmed resolved (brand's 34px/40px values
   win, not Tailwind's defaults) — confirmed via a rendered element using `rounded-2xl` or `rounded-3xl`
   showing the brand radius value, not Tailwind's default.
9. **Brand semantic mapping works (step 6b):** a stock, unmodified shadcn `Button` and `Card` (no
   inline color/className overrides) render in brand colors — primary in jyellow with ink text, card on
   cream, brand radius — proving shadcn's semantic tokens resolve to the brand palette. Confirmed via
   Agent-Probe on the placeholder route. (This is the acceptance test for "integrate the existing UI
   theme" — primitives are on-brand by default, not per-screen re-skinned.)
10. No existing package/app (`apps/mobile`, `packages/*`) has any file modified by this phase, UNLESS
   `turbo.json` needed the scoped build-output override (Acceptance Criterion 5) — in which case the
   diff to `turbo.json` is additive-only and does not alter the existing entry for other apps.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/admin typecheck` exits 0 | Fully-Automated | AC2 |
| `pnpm --filter @jojopotato/admin lint` exits 0 | Fully-Automated | AC3 |
| `pnpm --filter @jojopotato/admin test` — placeholder Vitest test renders index route, asserts brand wordmark text present | Fully-Automated | AC4 |
| `pnpm --filter @jojopotato/admin build` exits 0, output dir asserted to exist and be non-empty via scripted check (Step 5 PVL addition) | Fully-Automated | AC5 |
| Root `pnpm build`/`pnpm lint`/`pnpm typecheck`/`pnpm test` include and pass `@jojopotato/admin` | Fully-Automated | AC1, AC6 |
| CI workflow (`.github/workflows/ci.yml`) run including the new app — confirm no config change needed there (turbo auto-discovers) | Hybrid — precondition: CI run or local `act`/dry-run equivalent; if neither available, verify by reading `ci.yml`'s turbo invocation and confirming it uses root `pnpm build`/`test`/etc. without a hardcoded package list | AC6 |
| Agent-Probe: load the dev server placeholder route in a browser, visually confirm cream bg / ink text / Fredoka+Jakarta fonts / 4px hard ink-shadow button / brand-radius `rounded-2xl`/`rounded-3xl` (not Tailwind default) AND that a stock shadcn `Button`/`Card` (no inline overrides) renders on-brand | Agent-Probe | AC7, AC8, AC9 |
| Manual diff review: `git diff --stat` shows only `apps/admin/**` (+ optionally a scoped `turbo.json` hunk) touched — no `apps/mobile/**` or `packages/*` files modified | Fully-Automated (`git diff --stat` + grep check) | AC10 |

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

**Closeout (14-07-26): ✅ VERIFIED.** EVL independently re-ran all 6 automated gates → PASS.
AC7-9 (visual/on-brand Agent-Probe judgments) explicitly reviewed and ACCEPTED by the user this
session — recorded as user-accepted, not pending. No open gaps remain for this phase.

**Execute anchor:** this file (`phase-00-scaffold_PLAN_14-07-26.md`) is the single primary execute
anchor for Phase 0. There are no supporting phase files for Phase 0 — Phase 0 has no upstream
phase dependency and no sibling phase file needs to be read alongside it during EXECUTE.

---

## Phase Loop Progress

- [x] 1. RESEARCH
- [x] 2. INNOVATE — n/a, mechanical (research produced determinate answers for all confirmed items above; no design fork remained after research)
- [x] 3. PLAN-SUPPLEMENT
- [x] 4. PVL
- [x] 5. EXECUTE — completed 14-07-26; all automated gates green (admin typecheck/lint/test/build + dist non-empty + root turbo inclusion). Report: phase-00-scaffold_REPORT_14-07-26.md. AC7-9 Agent-Probe visual pass pending (dev-server browser walkthrough).
- [x] 6. EVL — EVL independently re-ran all 6 automated gates (admin typecheck/lint/test/build, root-turbo inclusion, diff-scope) → PASS. Root `pnpm typecheck` red is PRE-EXISTING `apps/mobile` typed-route debt (commit 6e160fe) — not an admin issue, zero apps/mobile diff this session. AC7-9 (visual/on-brand) explicitly USER-ACCEPTED this session (Agent-Probe tier, no automated visual runner exists — by design).
- [x] 7. UPDATE-PROCESS — archived learnings, updated context docs, wrote apps/admin/README.md; see closeout packet below

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-00-scaffold_PLAN_14-07-26.md`
2. **Last completed phase or step:** Phase Loop Progress Step 4 (PVL) — validate-contract below is written (Gate: PASS). Step 3 (PLAN-SUPPLEMENT) folded research findings in; this PVL pass additionally folded in 3 small mechanical clarifications (explicit `pnpm install` step, a scriptable AC5 build-output-dir check, and a gitignore contingency note) surfaced by the Layer 1/Layer 2 fan-out — see validate-contract "Plan updates applied" below.
3. **Validate-contract status:** written — `Gate: PASS`, `generated-by: inner-pvl: phase-0` (see `## Validate Contract` below).
4. **Supporting context files loaded during this PLAN pass:**
   - `process/features/admin-dashboard/active/admin-dashboard_14-07-26/admin-dashboard_UMBRELLA_PLAN_14-07-26.md`
   - `process/context/all-context.md`
   - `package.json` (root), `pnpm-workspace.yaml`, `turbo.json`
   - `packages/config/package.json`, `packages/config/typescript/tsconfig.base.json` (read for extends target — not itself read in full here but its export path confirmed via package.json)
   - `apps/mobile/package.json`, `apps/mobile/eslint.config.js`, `apps/mobile/tsconfig.json`
   - `packages/ui/src/theme.ts` (full token source)
5. **Next step for a fresh agent picking up mid-execution:**
   - Phase Loop Progress Steps 1-4 are complete. Next: spawn vc-execute-agent with this exact plan path; no other phase plan should be passed alongside it (Phase 0 has no upstream phase dependency).
   - EXECUTE must still perform the explicit live-reconfirm checks called out inline in Implementation Steps 2, 5, 6b, and 7 (package versions, build output dir, generated shadcn CSS shape, shadcn init template choice) — this plan's confirmed findings are a research snapshot, not a substitute for verifying against the live toolchain at execution time.

---

## Validate Contract

Status: PASS
Date: 14-07-26
date: 2026-07-14
generated-by: inner-pvl: phase-0

Parallel strategy: sequential (within-agent analysis; see rationale)
Rationale: 7-signal score 2/7 (S4 phase-program classification, S7 5+ files in blast radius) →
threshold recommends parallel subagents for the fan-out, but this VALIDATE pass was executed by a
single vc-validate-agent instance with no Agent-tool spawn access in this session — Layer 1 (4
dimensions) and Layer 2 (1 section: the whole Phase 0 checklist is one cohesive unit, no sub-phases)
were each analyzed in sequence within this agent's own context instead. No quality loss expected:
total scope is small (12-15 files, one package, zero auth/schema/API surface) and each dimension's
analysis was independently completed against real on-disk evidence (file existence checks, turbo.json
content, CI workflow content, packages/config exports) rather than inference. Recommended strategy
for the NEXT phase step (EXECUTE): sequential (single vc-execute-agent) — Phase 0 has no parallel
sub-workstreams; splitting EXECUTE across agents here would only add coordination overhead for a
12-15 file scaffold with strict internal ordering (package.json before tsconfig before vite.config
before tokens before shadcn init before routes).

Test gates (5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC2 | `apps/admin` typechecks clean | Fully-Automated | `pnpm --filter @jojopotato/admin typecheck` (after `pnpm install` at root) | A |
| AC3 | `apps/admin` lints clean | Fully-Automated | `pnpm --filter @jojopotato/admin lint` | A |
| AC4 | Placeholder route test runs and passes (not `--passWithNoTests` skip) | Fully-Automated | `pnpm --filter @jojopotato/admin test` — `apps/admin/src/routes/index.test.tsx` renders index route, asserts brand wordmark text present | B |
| AC5 | Build produces a real, non-empty output directory turbo can find/cache | Fully-Automated | `pnpm --filter @jojopotato/admin build` then `test -d apps/admin/<confirmed-output-dir> && [ -n "$(ls -A apps/admin/<confirmed-output-dir>)" ]` (dir name confirmed empirically at EXECUTE per Step 5) | B |
| AC1, AC6 | Root turbo pipeline auto-discovers and passes `@jojopotato/admin` in build/lint/typecheck/test | Fully-Automated | `pnpm build && pnpm lint && pnpm typecheck && pnpm test` from repo root; grep each command's turbo summary output for `@jojopotato/admin` | A |
| AC6 (CI) | CI's `pnpm turbo run <task>` invocations require no hardcoded package list to pick up the new app | Hybrid — precondition: either a live CI run on the branch, or (fallback, always available) re-reading `.github/workflows/ci.yml` to confirm each job step runs `pnpm turbo run <task>` / `pnpm install` with no package allowlist | `.github/workflows/ci.yml` lint/typecheck/test/build jobs (confirmed during this PVL pass: no hardcoded package list present — turbo auto-discovers) | A |
| AC10 | No existing package (`apps/mobile`, `packages/*`) is modified, except an optionally scoped, additive `turbo.json` hunk | Fully-Automated | `git diff --stat` (post-EXECUTE) confirms only `apps/admin/**` (+ optional additive `turbo.json` hunk) changed; `git diff turbo.json` (if present) shows only an added `outputs` override line, no removed/narrowed lines | A |
| AC7, AC8, AC9 | Dev server placeholder route visually renders on-brand (cream bg/ink text/Fredoka+Jakarta fonts/4px hard shadow/brand radius/stock shadcn Button+Card on-brand) | Agent-Probe | Load `apps/admin` dev server in a browser; visual walkthrough per Verification Evidence table | C (Agent-Probe-by-design — this repo has no visual-regression runner; documented, not a Known-Gap substitute) |

Failing stub (AC4 — Fully-Automated tier row):
```
test("should render the placeholder index route and show the brand wordmark text", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: placeholder index route renders brand wordmark")
})
```

Failing stub (AC5 — Fully-Automated tier row):
```
test("should produce a non-empty build output directory turbo can find", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: build output directory exists and is non-empty at the confirmed path")
})
```

gap-resolution legend:
- A — proven now (gate passes in this cycle; the underlying command is deterministic and already
  runnable once `apps/admin` is scaffolded)
- B — fixed in this plan (gate command added/concretized by this PVL pass's plan updates — AC4/AC5
  now have exact, scriptable assertions rather than "runs a test"/"inspect the directory")
- C — Agent-Probe, not a proving-strategy gap: AC7-9 are visual/on-brand judgments this repo's stack
  cannot automate (no visual-regression runner exists — project-wide known gap, see
  `process/context/tests/all-tests.md`); recorded here as the correct, honest tier, not a Known-Gap
  standing in for a missing automated test.

Legacy line form (retained so existing validate-contract consumers still parse):
- `apps/admin` typecheck/lint/test/build: Fully-automated: `pnpm --filter @jojopotato/admin
  {typecheck,lint,test,build}` (after root `pnpm install`)
- Root turbo pipeline inclusion: Fully-automated: `pnpm {build,lint,typecheck,test}` from repo root,
  grep for `@jojopotato/admin` in turbo's run summary
- CI auto-discovery: Hybrid: precondition — live CI run, or re-read `.github/workflows/ci.yml` (already
  confirmed clean during this PVL pass)
- Diff-scope check: Fully-automated: `git diff --stat` + `git diff turbo.json` (if touched)
- Visual/on-brand rendering (AC7-9): Agent-probe: dev-server browser walkthrough — documented
  Agent-Probe-by-design, not a Known-Gap

C-4 reconciliation: the `strategy:` column above carries only the 3 proving strategies
(Fully-Automated / Hybrid / Agent-Probe). No row uses Known-Gap as a strategy — every developed
behavior in this phase's blast radius has a real proving gate (see Net-Gate Vacuous-Green Check
below).

Net-Gate Vacuous-Green Check: scanned the full blast radius (app boot, tokens render, typecheck,
lint, test runner precedent, build output, turbo/CI auto-discovery, brand semantic mapping, no
existing-package modification). Every one of these has a Fully-Automated, Hybrid, or Agent-Probe
gate above — none rests on Known-Gap alone. Net gate is a legitimate PASS, not vacuously green.

Dimension findings:
- Infra fit: CONCERN → RESOLVED — `turbo.json`'s `build` task hardcodes `outputs: ["dist/**"]`; TanStack
  Start's post-Vinxi plain-Vite build output directory for this exact version/config combo was NOT
  independently confirmable during PVL (this is explicitly an EXECUTE-time empirical question per the
  plan's own Step 5). Resolved by folding a concrete, scriptable assertion + a gitignore-contingency
  note into Implementation Step 5/AC5 (see Plan updates applied below) so the risk is caught by a real
  gate instead of manual "inspection." Everything else checked clean: `pnpm-workspace.yaml` glob
  already covers `apps/*` (confirmed on disk), `packages/config` exports both `./eslint-base` and
  `./typescript/base` the plan relies on (confirmed via `packages/config/package.json`), and
  `apps/admin/` already exists on disk as an EMPTY directory (no file collision risk for EXECUTE).
- Test coverage: CONCERN → RESOLVED — AC5's original "output dir inspected" language was a manual
  judgment call for a Fully-Automated-classified gate; concretized into a real scripted assertion
  (Plan update P2 below). AC4 already correctly requires an executing (not skipped) test. Tier
  assignments otherwise match the waterfall correctly: Fully-Automated for typecheck/lint/test/build/
  root-turbo/diff-scope, Hybrid for the CI precondition, Agent-Probe (correctly, not Known-Gap) for
  AC7-9 visual judgments — this repo has no visual-regression runner (project-wide gap, see
  `process/context/tests/all-tests.md`), so Agent-Probe is the honest, not the degraded, tier here.
- Breaking changes: PASS — zero existing package/app is modified except an optional, explicitly
  scoped-additive `turbo.json` hunk; no downstream consumer of `apps/admin` exists yet (Phase 1+ are
  the first consumers, and they come after this phase completes). No API/schema/auth surface touched.
- Security surface: PASS — no auth, no secrets, no network calls to `packages/api`, no user input
  handling in this phase; `.env.example` is a placeholder mirroring `apps/mobile/.env.example`'s shape
  with no real values. Quick STRIDE scan found no applicable surface at this phase's scope.
- Section feasibility (Phase 0 — Scaffold, single section): CONCERN → RESOLVED — mechanically
  feasible (all referenced existing files verified present and readable: `pnpm-workspace.yaml`,
  `turbo.json`, `packages/config/{package.json,typescript/tsconfig.base.json,eslint-base.js,
  eslint.js}`, `packages/ui/src/theme.ts`, `apps/mobile/{package.json,eslint.config.js,tsconfig.json,
  .env.example,src/lib/query-client.ts}`, `.github/workflows/ci.yml`; `apps/admin/` exists but is
  empty, no collision). Gap found: Implementation Step 12's verification loop implicitly assumed
  `pnpm install` had already run for the new workspace member — made explicit (Plan update P1). No
  conflicts found — no other active phase plan touches `apps/admin/` or `turbo.json` at this time.
  Highest-risk edit: the conditional `turbo.json` build-output override (Step 5) — the plan already
  mitigates this correctly (scoped, additive-only, empirical-check-gated); execute-agent instruction
  E1 below adds one more safeguard (confirm `apps/mobile`'s build still passes after any `turbo.json`
  edit, since it's a shared root config file).

Open gaps: none unresolved — all 3 CONCERNs found were fixed directly in the plan (see Plan updates
applied). AC7-9 Agent-Probe-only status is a documented, by-design tier, not an open gap.

Plan updates applied:

| # | What changed | Where in plan | Why |
|---|---|---|---|
| P1 | Implementation Step 12 now explicitly opens with "Run `pnpm install` at the repo root first" before the verification loop | Implementation Checklist, Step 12 | Section-feasibility gap: the original step assumed the new workspace member was already linked; execute-agent following the checklist literally could hit a `pnpm --filter @jojopotato/admin ...` resolution failure without this explicit prerequisite |
| P2 | Implementation Step 5 gained an "Automatable check" bullet (scriptable `test -d ... && ls -A ...` assertion) and a "Gitignore contingency" bullet; AC5 and the Verification Evidence table's AC5 row were reworded to reference the scripted check instead of manual "inspection" | Implementation Checklist Step 5; Acceptance Criteria 5; Verification Evidence table | Test-coverage CONCERN: a Fully-Automated-classified gate cannot rest on a human "inspect the directory" step — this closes that gap with a real, exit-code-driven assertion |

Execute-agent instructions:

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | If Step 5's empirical check finds the build output directory differs from the existing `turbo.json` glob and the fallback (per-app `outputs` override) path is taken: after making the scoped `turbo.json` edit, also run `pnpm --filter @jojopotato/mobile build` once to confirm the shared root config change did not regress the existing app's build/cache behavior. Document the result in the phase report. | `turbo.json` is touched in Step 5 |
| E2 | Re-verify Implementation Steps 2, 5, 6b, and 7's explicit "live-reconfirm at EXECUTE" checkpoints (TanStack Start package/CLI/config-file shape, shadcn `init` template flag, generated two-block CSS shape) against the actually-installed package versions before treating any of those steps' plan text as ground truth — this plan's confirmed findings are a research snapshot only. | Always, before Steps 2/5/6b/7 |
| E3 | Confirm `apps/admin/` is empty before writing into it (it already exists on disk as an empty directory as of this PVL pass) — if it is not empty at EXECUTE start, stop and report before overwriting anything. | Start of EXECUTE |

Backlog artifacts: none — no gap in this phase's scope required deferral.

What this coverage does NOT prove:
- The Fully-Automated typecheck/lint/test/build gates prove the code compiles, lints clean, and the
  one placeholder test passes — they do NOT prove the app is visually on-brand (that's AC7-9,
  Agent-Probe only) or that a real user can navigate it (no navigation exists yet in this phase).
- The root-turbo-inclusion gate proves `@jojopotato/admin` is picked up by `turbo run <task>` — it
  does NOT prove CI will actually pass end-to-end on a clean runner (the Hybrid CI gate is a
  config-read confirmation, not a live CI execution, unless a live run is also performed).
- The AC5 build-output-directory check proves the directory exists and is non-empty — it does NOT
  prove the *contents* of that directory are a correct, deployable TanStack Start build (no
  deploy/serve-and-smoke-test step exists in this phase's scope, consistent with the umbrella's
  explicit "EAS/deploy wiring for apps/admin is out of scope").
- The diff-scope check (`git diff --stat`) proves no *existing* file was modified — it does not by
  itself prove the *new* files under `apps/admin/` are individually correct (that's covered by the
  typecheck/lint/test/Agent-Probe gates above, not the diff-scope check).
- Known-Gap-by-design: no visual-regression/E2E browser runner exists in this repo for any app
  (project-wide gap, see `process/context/tests/all-tests.md`) — AC7-9 rely on a one-time Agent-Probe
  judgment, consistent with how prior phases (e.g. `pickup-order-flow`) have handled the same
  repo-wide gap. This is a named residual, not a silent pass.

Gate: PASS (no FAILs; 3 CONCERNs found were all fixed directly in the plan text during this PVL pass,
not deferred or accepted as-is)
