---
name: plan:mobile-dark-mode-audit
description: "Required-prop mode tightening across ~26 @jojopotato/ui components + StatusBar legibility fix, driven by a tsc-enumerated call-site sweep"
date: 17-07-26
feature: general-plans
---

# Mobile Dark-Mode Bug-Class Fix + StatusBar Legibility — PLAN

**Date**: 17-07-26
**Status**: Draft — pending VALIDATE
**Complexity**: COMPLEX (touches ~26 shared components across `packages/ui` + an unknown-until-discovered
number of `apps/mobile` call sites + a new durable CI guard + a StatusBar behavior change — a cross-cutting
required-prop signature change, not a single-file fix).

## Overview

SPEC found the dark-mode bug is a **prop-default bug**: every `mode`-taking `@jojopotato/ui` component
defaults `mode = 'light'`, so a screen that forgets to pass `mode` silently renders the wrong theme instead
of erroring. INNOVATE locked the fix: make `mode` a **required prop** (drop the `= 'light'` default) on
every themed component, then let `tsc --noEmit` do the exhaustive audit for us — every call site missing
`mode` becomes a compile error. This plan turns that decision into an ordered, verifiable sequence: tighten
signatures → run tsc → enumerate every reported error → fix each site → extract + fix the StatusBar
derivation → write real tests → correct the stale test-context doc.

**Two things this plan does NOT do** (locked by SPEC/INNOVATE, do not re-litigate): rebuild the
theme-preference store/resolver/toggle, or make `packages/ui` scheme-aware (it stays a stateless View
library — CLAUDE.md §Theming forbids `packages/ui` importing RN's `useColorScheme`).

## Goals

1. Every `mode`-taking component in `packages/ui` requires `mode: ThemeMode` (no default). This makes a
   missing `mode` a compile error everywhere, not just at the 2 known-bad sites.
2. Every call site broken by step 1 (in `apps/mobile`, in `packages/ui`'s own consumers/showcase, and in
   `packages/ui`'s own jest-expo suite fixtures if any pass no `mode`) is fixed by threading the screen's
   already-resolved `mode`/`theme` through.
3. Android/iOS StatusBar always reflects the resolved **app** theme, never the raw OS scheme.
4. Real automated tests exist proving (a) `Card` respects the passed mode, (b) the two known-bad screens
   render correct tokens in dark mode, (c) the StatusBar derivation function is correct, and (d) no new
   raw `useColorScheme` import or forgotten `mode` prop can land silently in the future.
5. The stale "no RN component runner" claim in `process/context/tests/all-tests.md` is corrected.

## Scope

In scope: `packages/ui/src/components/*.tsx` (26 components below), every consumer of those components
under `apps/mobile/src/**` and `packages/ui`'s own dev/test files, `apps/mobile/src/app/_layout.tsx`
(StatusBar line only), one new pure derivation module, new test files.

Out of scope: `apps/admin`, `theme-preference.ts`/`use-color-scheme.ts`/`use-theme.ts`/the Account toggle,
`theme.ts` token values themselves, any new branding.

## Sequencing (from INNOVATE, locked)

1. Signature tightening (Section A)
2. tsc sweep + enumerate every broken call site (Section B) — **atomic discovery step, not pre-counted**
3. Fix each flagged site (Section C)
4. StatusBar extraction + fix (Section D — independent of 1–3, can run in parallel)
5. Tests (Section E)
6. `all-tests.md` correction (Section F)

---

## Touchpoints

**`packages/ui/src/components/` — 26 files, `mode?: ThemeMode = 'light'` → `mode: ThemeMode` (drop default,
keep prop otherwise unchanged unless a component has zero internal use of `mode` — check case-by-case):**

`card.tsx` (packages/ui/src/components/card.tsx:8,17 — confirmed default site), `badge.tsx`, `button.tsx`,
`google-button.tsx`, `confirm-dialog.tsx`, `input.tsx`, `product-card.tsx`, `deal-card.tsx`,
`branch-card.tsx`, `branch-list-item.tsx`, `reward-progress-card.tsx`, `star-progress-bar.tsx`,
`rewards-terms.tsx`, `order-status-badge.tsx`, `order-status-timeline.tsx`, `payment-method-selector.tsx`,
`coupon-card.tsx`, `cart-item.tsx`, `cart-summary.tsx`, `empty-state.tsx`, `flavor-selector.tsx`,
`size-selector.tsx`, `addon-selector.tsx`, `pickup-time-badge.tsx`, `toggle.tsx`, `notification-row.tsx`,
`brand-wordmark.tsx` (exported from `packages/ui/src/index.ts:2-28` — verify each file actually has a
`mode` prop with a default before editing; `brand-wordmark.tsx` was mentioned as taking `mode` in
CLAUDE.md's own example — confirm signature during Section A step 1, do not assume every listed file has
the exact same shape).

**`apps/mobile/src/app/_layout.tsx`** — line 149 `<StatusBar style="auto" />` only. Do not touch
`:96,116-126,143` (already correct per SPEC Finding).

**Known-bad call sites (confirmed, will need explicit fixes regardless of the tsc sweep result):**
- `apps/mobile/src/app/(tabs)/order/history.tsx:74` (`<Card>` no `mode`, text at `:76-91`)
- `apps/mobile/src/app/(tabs)/order/cart.tsx:239` (`<Card>` no `mode`, text at `:240-241,247`)

**New files:**
- `apps/mobile/src/lib/status-bar.ts` (pure `resolveStatusBarStyle` function)
- `apps/mobile/src/lib/status-bar.test.ts` (vitest, pure-TS)
- `packages/ui/src/components/card.test.tsx` (jest-expo, packages/ui has zero Card coverage today)
- `apps/mobile/src/features/orders/__tests__/history-screen-dark-mode.test.tsx` (or colocated near
  existing order/history feature test dir — confirm actual test dir convention during Section A; the repo
  convention seen in `branches-screen.test.tsx`, `account-screen.test.tsx` is
  `src/features/{domain}/__tests__/*.test.tsx`, not colocated with the route file)
- `apps/mobile/src/features/cart/__tests__/cart-dark-mode.test.tsx` (cart.tsx already has an existing
  test at `src/features/cart/__tests__/cart-branch-switch.test.tsx` — check whether the dark-mode
  assertion belongs there instead of a new file, to avoid duplicate render-harness boilerplate)
- a new grep/AST guard script (mechanism per INNOVATE — confirm exact tool choice at Section E step 1
  since INNOVATE's Decision Summary for the guard mechanism was not included in this handoff verbatim;
  default to a Node script under `apps/mobile/scripts/` or a `.claude/skills`-style validator pattern,
  invoked as a `pnpm` script and wired into CI, following the grep-backed-test lean noted in SPEC Open
  Question 2)

## Public Contracts

- **Breaking internal contract change:** `mode` becomes a required prop on 26 `packages/ui` exports. Any
  consumer (inside this monorepo only — `packages/ui` has no external consumers) that omits `mode` moves
  from "silently defaults to light" to "TypeScript compile error." This is the intended behavior change;
  it is a source-compatible-until-tsc-runs, not a runtime API break (no exported function signature or
  JSON shape changes — pure prop-optionality tightening).
- No public API (`packages/api`), schema, or cross-app contract is touched.
- `resolveStatusBarStyle(appScheme: 'light' | 'dark'): 'light' | 'dark'` — new pure export, no external
  consumers yet other than `_layout.tsx`.

## Blast Radius

- **Occurrence count (from INNOVATE grep, NOT a defect count):** 140 `mode=`-passing occurrences across 27
  files already exist and are presumably correct — these must keep compiling clean after the signature
  change (regression risk, not fix work).
  RESEARCH's independent estimate was ~80 unswept sites; the real number of **broken** sites is unknown
  until Section B's tsc sweep runs. **Do not pre-count a fix-site list — Section B IS the enumeration.**
- Packages touched: `packages/ui` (26 component files + new test + index unaffected), `apps/mobile` (every
  screen/component that renders a themed `@jojopotato/ui` component — breadth unknown until Section B; likely
  spans all 5 tabs, `(auth)`, `(onboarding)`, `(staff)`), `apps/mobile/src/app/_layout.tsx` (1 line).
  `component-showcase.tsx` (dev-only screen) is a known consumer needing a check per SPEC background.
- Risk class: none of auth/billing/schema/migration/public-API/secrets — this is a pure rendering-layer
  fix. Risk is **volume**, not danger: an unknown, possibly large number of small mechanical edits, each
  individually low-risk, but with real regression risk if a site is missed (tsc catches missing `mode`
  entirely — there is no way to "miss" a site once Section A lands, by construction).
- No DB migration, no new dependency, no new runtime surface.

## Section A — Signature Tightening (Step 1)

1. For each of the 26 files listed in Touchpoints, read the file first to confirm its actual current
   signature (`mode?: ThemeMode = 'light'` or equivalent destructured default) — do not assume uniformity;
   `card.tsx:8,17` is the confirmed pattern, others must be verified individually (some may already have no
   default, some may use a different prop name — treat any deviation as a note in the phase report, not a
   silent skip).
2. Change `mode?: ThemeMode` (prop interface) → `mode: ThemeMode` (drop `?`).
3. Change the destructuring default `mode = 'light'` → plain `mode` (drop the default value).
4. Do not change any other behavior in these files (no token remapping, no new props, no renamed exports).
5. Commit checkpoint recommendation: this step alone is a clean, revertible unit — consider a standalone
   commit before Section B's sweep begins, so a bad fix in Section C never needs re-doing Section A.

## Section B — tsc Sweep + Enumeration (Step 2, atomic discovery)

1. Run `pnpm --filter @jojopotato/ui typecheck` first — this catches breakage inside `packages/ui` itself
   (its own showcase/dev files if any pass a component with no `mode`, and any internal cross-component
   usage).
2. Run `pnpm --filter @jojopotato/mobile typecheck` — this is the primary enumeration surface. Every
   reported error of the shape "Property 'mode' is missing" (or equivalent "not assignable" error citing a
   component's props type) is one call site to fix.
3. Collect the full list of `file:line` + component name from both typecheck runs into a table in the
   phase report (not in this plan file — this list is EXECUTE-phase discovery output, not a PLAN-time
   prediction). Do not stop at the first error — `tsc --noEmit` reports all errors in one pass; capture the
   complete list before starting Section C.
4. Cross-check the two known-bad sites (`history.tsx:74`, `cart.tsx:239`) appear in this list — if they do
   NOT appear as compile errors, that is a signal the signature change in Section A was incomplete for
   `Card` specifically; stop and re-verify Section A step 2-3 for `card.tsx` before proceeding.
5. Also run `packages/ui`'s own test suite (`pnpm --filter @jojopotato/ui test`) — if `Card` or any other
   component is rendered in an existing jest-expo test fixture without `mode`, that surfaces as a
   **runtime** test failure, not a tsc error; add any such failures to the same enumeration list.

## Section C — Fix Each Flagged Site (Step 3)

1. For each `file:line` in the Section B enumeration list, thread `mode={mode}` (or the screen's local
   equivalent — some screens resolve `const { mode } = useTheme()` per CLAUDE.md §Theming convention,
   others may compute `const mode = scheme === 'dark' ? 'dark' : 'light'` inline; match whichever pattern
   the surrounding file already uses — do not introduce a third pattern).
2. For a component whose surface is deliberately pinned to a fixed mode by design (e.g. a light-mode-only
   promotional card) — SPEC's existing convention already requires that fixed-mode's OWN text tokens
   (`Colors.light.*`), never the device-scheme `theme`. If Section B's sweep finds a site that appears to
   want a fixed mode rather than the screen's resolved scheme, do NOT guess — flag it explicitly in the
   phase report as "intentional fixed-mode candidate" and confirm with the reviewed allow-list mechanism
   from Section E step 1 (SPEC's audit-completeness sub-requirement requires every site classified as
   correct / needs-fix / intentionally-fixed-mode — this is where that classification happens).
3. After each batch of fixes in one screen/feature area, immediately re-run
   `pnpm --filter @jojopotato/mobile typecheck` (per-section test-gate discipline) — do not batch all ~N
   fixes and check once at the end.
4. `component-showcase.tsx` (dev-only) gets fixed the same way if it appears in the enumeration — do not
   skip dev-only files; they still block `tsc --noEmit`.
5. When the full enumeration list is green (`pnpm --filter @jojopotato/mobile typecheck` exits 0 AND
   `pnpm --filter @jojopotato/ui typecheck` exits 0), Section C is complete.

## Section D — StatusBar Extraction + Fix (independent, parallelizable with A–C)

1. Create `apps/mobile/src/lib/status-bar.ts`:
   ```
   export function resolveStatusBarStyle(appScheme: 'light' | 'dark'): 'light' | 'dark' {
     return appScheme === 'dark' ? 'light' : 'dark';
   }
   ```
   **LOCKED by feasibility probe (`mobile-dark-mode-audit_FEASIBILITY_17-07-26.md`, verdict: VIABLE) —
   do not re-derive or re-invert this mapping.** `expo-status-bar`'s `style` prop names the status-bar
   CONTENT color, not the surface color: `appScheme === 'dark'` → pass `style="light"` (light content,
   readable over a dark surface); `appScheme === 'light'` → pass `style="dark"` (dark content, readable
   over a light surface). This is confirmed by three independent sources read directly from the installed
   package + React Native's own type declarations (not training-data memory) — see the VERDICT file for
   the full evidence chain. **Forbidden: an identity mapping (`scheme === 'dark' ? 'dark' : 'light'`)** —
   that is the inverted bug the probe was run to rule out; it would produce dark-on-dark / light-on-light
   status-bar content (invisible icons in BOTH themes).
2. In `apps/mobile/src/app/_layout.tsx:149`, replace `<StatusBar style="auto" />` with
   `<StatusBar style={resolveStatusBarStyle(colorScheme === 'dark' ? 'dark' : 'light')} />` — `colorScheme`
   is already resolved at `:96` (same value driving `SystemUI.setBackgroundColorAsync` at `:122-126` and
   the nav `ThemeProvider` at `:143` — reuse it, do not add a second resolution call).
3. Do not touch any other line in `_layout.tsx`.

## Section E — Tests (Step 5)

1. **Guard mechanism confirmation (do this first):** SPEC Open Question 2 left the exact prevention
   mechanism to INNOVATE; this handoff's INNOVATE summary did not specify the final tool choice verbatim.
   Default to a **grep-backed Node script** (matches the repo's existing validator-script convention under
   `.claude/skills/*/scripts/*.mjs`) over a custom ESLint rule, per SPEC's own stated orchestrator lean and
   proportionality (2 known sites today does not justify a bespoke lint rule). If a different mechanism was
   actually locked in INNOVATE's Decision Summary, EXECUTE must use that one instead and note the deviation
   in the phase report — do not silently pick the default without checking first.
2. Guard script requirements (proves SPEC criterion 9 + the audit-completeness sub-requirement):
   - fails if any file outside `apps/mobile/src/hooks/use-color-scheme.ts` and
     `apps/mobile/src/hooks/use-color-scheme.web.ts` contains a raw `import { useColorScheme } from
     'react-native'` (or equivalent named import).
   - enumerates every JSX call site of each of the 26 `@jojopotato/ui` component names across
     `apps/mobile/src/app/**` (and other consuming dirs found in Section B) and asserts each either passes
     a `mode=` prop or appears on an explicit allow-list array inside the script (for the
     intentionally-fixed-mode sites flagged in Section C step 2). Fails if a new unlisted site with no
     `mode` appears.
   - **[PLAN-SUPPLEMENT — Gap 1, added at VALIDATE]** the script MUST treat ANY spread attribute
     (`{...props}`, `{...someObject}`, etc.) on a tracked component's JSX call as an automatic hard-fail
     requiring a manual allow-list entry — never a silent pass. Rationale: a spread source can widen to
     `any` and bypass both TypeScript's required-prop check and a literal-attribute grep scan the same way;
     VALIDATE confirmed today's enumeration is exhaustive (zero spread-prop occurrences on any of the 26
     tracked components across `apps/mobile/src`, verified 17-07-26), but the script itself must close this
     blind spot going forward rather than rely on today's absence of spreads.
   - wired as a `pnpm` script (e.g. `pnpm --filter @jojopotato/mobile guard:theme-mode` or similar — confirm
     naming against existing script conventions in `apps/mobile/package.json`) and referenced from
     `all-tests.md` (Section F) plus (recommended, note as a follow-up if out of EXECUTE's immediate scope)
     `.github/workflows/ci.yml`.
   - because `tsc --noEmit` already makes a missing required `mode` a hard compile error going forward
     (Section A), this guard script's marginal, durable value is specifically: (a) catching the raw
     `useColorScheme` import class, and (b) serving as the audit's own completeness evidence artifact per
     SPEC — it is not redundant with tsc, it is the second, distinct check SPEC's criterion 9 requires.
   - **[PLAN-SUPPLEMENT — Gap 3, added at VALIDATE]** `packages/ui`'s existing hex-guard
     (`packages/ui/scripts/check-raw-tokens.mjs`, run via `pnpm --filter @jojopotato/ui check-tokens`)
     only scans `packages/ui/src/components/**` — confirmed zero reach into `apps/mobile` (17-07-26). This
     is exactly where Section C's hand-threaded `mode={mode}` fixes could introduce a stray hex instead of
     a `theme.*` token read, and AC9's "no hardcoded colours" clause is only half-covered by existing infra.
     EXECUTE must either (a) extend the new guard script (this step) to also scan
     `apps/mobile/src/app/**` and `apps/mobile/src/features/**` for raw hex literals in touched files, or
     (b) explicitly record this as an accepted Known-Gap in the phase report with rationale if extending
     scope is judged disproportionate — do not silently leave apps/mobile hex-unguarded without a recorded
     decision either way.
3. **`packages/ui/src/components/card.test.tsx` (new, jest-expo):** render `<Card mode="dark">` and
   `<Card mode="light">`; assert the rendered `View`'s style resolves `Colors.dark.backgroundElement` /
   `Colors.light.backgroundElement` respectively (match `theme.ts` token names read in `card.tsx:18,24`).
   Follows `packages/ui`'s own existing jest-expo component-test conventions (see e.g.
   `order-status-badge`/`order-status-timeline` tests referenced in `all-tests.md`).
4. **History screen dark-mode test** — mock `useColorScheme` → `'dark'` (pattern: `jest.mock('@/hooks/
   use-color-scheme', () => ({ useColorScheme: () => 'dark' }))`, matching the existing
   `jest.mock('@/features/branches/components/branch-map', ...)`-style module mock convention seen in
   `branches-screen.test.tsx`), render the history screen via `renderWithProviders` (async, must `await`
   per `all-tests.md`), and assert the rendered `Card`'s resolved surface color and the sibling text's
   resolved color are from the SAME (`dark`) mode's token set — a test that only asserts `mode` was passed
   would pass on the pre-fix buggy code too (the prop existed, it just wasn't threaded to `Card`); assert
   the actual resolved style output, not just prop-presence.
5. **Cart screen dark-mode test** — same pattern for `cart.tsx:239`'s reorder-conflict `Card`. Check
   whether this belongs in the existing `cart-branch-switch.test.tsx` file (same describe block, one more
   `test(...)`) or a new co-located file — prefer extending the existing file if its existing mocks/fixtures
   already cover the reorder-conflict provider; create a new file only if the existing fixture setup does
   not reach the reorder-conflict UI path.
6. **`apps/mobile/src/lib/status-bar.test.ts` (new, vitest — pure-TS, node env, matches `vitest.config.ts`
   scope):** table-test `resolveStatusBarStyle('light')` → dark content, `resolveStatusBarStyle('dark')` →
   light content. Assert this is independent of any OS-scheme input (the function takes no OS parameter by
   design — this IS the fix: OS scheme never enters the derivation). **Locked mapping per feasibility
   VERDICT (see Section D step 1) — the test must assert `resolveStatusBarStyle('dark') === 'light'` and
   `resolveStatusBarStyle('light') === 'dark'`; a test asserting the identity mapping is itself wrong and
   must not be written.**
7. Every new/changed test file must pass `pnpm --filter @jojopotato/mobile test` (vitest + jest sequential)
   and, for the `packages/ui` test, `pnpm --filter @jojopotato/ui test`.
8. **[PLAN-SUPPLEMENT — Gap 2, added at VALIDATE] AC8 listener test is a REAL step, not a soft
   conditional.** VALIDATE confirmed (17-07-26) that no existing test in `apps/mobile/src/**` mocks
   `Appearance` (zero matches). Write a real test mocking `react-native`'s
   `Appearance.addChangeListener`/`Appearance.getColorScheme` and asserting `useColorScheme()`'s returned
   value updates when a simulated `'system'`-preference change event fires. If this proves infeasible
   within scope after a genuine attempt, explicitly downgrade AC8's listener-wiring half to Known-Gap with
   a stated reason in the phase report — do not leave it as an unwritten "if an existing test covers this"
   conditional; that is the exact silent-Agent-Probe-inflation pattern the user has flagged as a standing
   concern.
9. **Explicitly tiered as Agent-Probe / Known-Gap, not claimed automated (per SPEC AC 5-8):** on-device
   StatusBar pixel legibility across all 4 OS/app combinations on both Android and iOS hardware; actual
   app-restart persistence of the theme preference; actual OS-background-resume behavior change pickup.
   These residuals must be listed in the phase report's "Test Infra Gaps Found" / known-gaps section, not
   silently omitted. Schedule the iOS Agent-Probe as a SEPARATE walkthrough from Android — SPEC explicitly
   warns iOS StatusBar behavior may differ mechanically even though the derivation function is shared; do
   not assume an Android confirmation transfers to iOS.

## Section F — `all-tests.md` Correction (Step 6, UPDATE PROCESS)

1. `process/context/tests/all-tests.md`'s "Known Gaps" section still contains a stale reference implying
   no RN component runner exists for `apps/mobile` — the SPEC Background already identifies this is
   outdated (the jest runner landed 15-07-26). This plan's own new tests are further proof the runner is
   real and usable; UPDATE PROCESS must:
   - confirm the "RESOLVED (component-level only)" bullet in Known Gaps already reflects this — **VALIDATE
     confirmed (17-07-26, line 179 of the current file) this bullet is already accurate; no drift found**.
     Re-verify at UPDATE PROCESS time only in case it drifted between VALIDATE and EXECUTE.
   - add a line noting `packages/ui`'s `Card` component now has coverage (`card.test.tsx`) — **VALIDATE
     confirmed `all-tests.md` currently makes no claim about `Card` coverage either way (no match found for
     "Card" in the file), so this is a net-new addition, not a correction of a stale claim.**
   - add the new guard-script command to the Commands table if it was wired as a `pnpm` script, and
     reference the existing `pnpm --filter @jojopotato/ui check-tokens` command too if it is not already
     listed (VALIDATE confirmed this script exists and works today but was not spot-checked against the
     Commands table's completeness).
2. This is a durable-knowledge update, not optional cleanup — do not defer it past this program's UPDATE
   PROCESS pass.

---

## Acceptance Criteria

Restated from SPEC (this plan's job is to satisfy these, tiered exactly as SPEC tiered them):

1. Order History (`order/history.tsx:74`) renders correctly in dark mode — proven by
   `card.test.tsx` + the history-screen dark-mode RTL test. Fully-Automated.
2. Every tab root renders correctly in both themes — prop-wiring/no-crash Fully-Automated via RTL
   smoke tests; full visual confirmation Hybrid/Agent-Probe.
3. Every pushed screen (incl. `cart.tsx:239`) renders correctly in both themes — same split as #2.
4. `(auth)` stack and `(staff)` shell render correctly in both themes — same split as #2.
5. Android StatusBar legible in all 4 OS/app combinations — derivation logic Fully-Automated
   (`status-bar.test.ts`, mapping direction locked by feasibility probe); on-device pixel legibility
   Agent-Probe/Known-Gap.
6. Same 4 combinations verified on iOS — same split as #5, separate walkthrough (not assumed to
   transfer from Android).
7. Theme toggle updates every visible surface without restart, persists across restart — existing
   substrate unchanged (Hybrid: reactivity unit-testable, visual/persistence claim is Agent-Probe).
8. "System" preference picks up OS theme change on resume from background — listener wiring
   Fully-Automated-testable via mocked event (now a REQUIRED Section E step, see Gap 2 supplement); actual
   OS-level resume is Agent-Probe/Known-Gap.
9. No new raw `useColorScheme` import outside the two allowed hook files, and no `mode`-taking
   component call site is missing `mode` without being on a reviewed fixed-mode allow-list —
   proven by `tsc --noEmit` (Section B) plus the new guard script (Section E, now spread-prop-safe per
   Gap 1 supplement). Fully-Automated.

Exit criterion for this plan: all 9 criteria's Fully-Automated/Hybrid-automatable portions are
green; Agent-Probe/Known-Gap residuals are explicitly recorded in the phase report, never silently
claimed as passing.

## Implementation Checklist

1. Read and confirm the actual current `mode` prop signature of each of the 26 `packages/ui`
   components listed in Touchpoints (Section A step 1).
2. Tighten `mode?: ThemeMode = 'light'` → `mode: ThemeMode` on each confirmed component (Section A
   steps 2-3); commit checkpoint after this step.
3. Run `pnpm --filter @jojopotato/ui typecheck`, `pnpm --filter @jojopotato/mobile typecheck`, and
   `pnpm --filter @jojopotato/ui test`; capture every reported error/failure as a `file:line` +
   component-name enumeration table in the phase report (Section B).
4. Verify the two known-bad sites (`history.tsx:74`, `cart.tsx:239`) appear in the enumeration; if
   not, stop and re-check Section A for `card.tsx`.
5. Fix each enumerated site by threading `mode={mode}` (or the screen's existing local pattern),
   re-running typecheck after each screen/feature-area batch (Section C).
6. Classify any site that looks like it wants a fixed mode rather than the screen's resolved scheme
   as an "intentional fixed-mode candidate" in the phase report, per Section C step 2.
7. Extract `resolveStatusBarStyle` into `apps/mobile/src/lib/status-bar.ts`, using the LOCKED mapping
   from the feasibility VERDICT (`appScheme === 'dark' ? 'light' : 'dark'` — do NOT re-derive; see
   Section D step 1).
8. Replace `<StatusBar style="auto" />` at `_layout.tsx:149` with the derived style, reusing the
   already-resolved `colorScheme` from `:96` (Section D step 2).
9. Confirm the guard-script mechanism (grep-backed Node script, default; deviate only if INNOVATE's
   Decision Summary locked something else) and implement it per Section E steps 1-2, INCLUDING the
   spread-prop hard-fail rule (Gap 1) and the apps/mobile hex-guard decision (Gap 3).
10. Write `packages/ui/src/components/card.test.tsx`, the history-screen dark-mode test, the
    cart-screen dark-mode test (or extension), `apps/mobile/src/lib/status-bar.test.ts`, and the
    real `Appearance`-mock listener test (Gap 2 — Section E steps 3-6, 8).
11. Run the full `pnpm --filter @jojopotato/mobile test` and `pnpm --filter @jojopotato/ui test`
    suites; confirm green.
12. Record Agent-Probe/Known-Gap residuals (on-device StatusBar legibility on Android and iOS
    separately, restart persistence, OS-resume behavior, and the apps/mobile hex-guard decision if
    deferred) explicitly in the phase report.
13. Correct `process/context/tests/all-tests.md` per Section F (Card coverage note, guard-script
    command, check-tokens command, re-verify the "RESOLVED (component-level only)" bullet is still
    accurate).
14. Recommend a commit checkpoint via `vc-git-manager` once all in-blast-radius gates are green.

## Phase Completion Rules

- This is a single-phase (non-program) COMPLEX plan — no phase split, no umbrella plan.
- **Code-complete** (`CODE DONE`, not `VERIFIED`): all 26 components tightened, `tsc --noEmit` green
  in both `packages/ui` and `apps/mobile`, StatusBar line replaced, guard script passing (incl. the
  spread-prop hard-fail rule), and all new Fully-Automated tests green (incl. the `Appearance`-mock test).
- **VERIFIED**: the above, plus the Android Agent-Probe StatusBar walkthrough AND the separate iOS
  Agent-Probe StatusBar walkthrough have both been performed (even if their outcome is recorded as a
  tracked Known-Gap for any sub-case that cannot be observed) — do not mark VERIFIED while either
  on-device walkthrough is simply unattempted.
- Do not advance to UPDATE PROCESS archival until `all-tests.md` (Section F) has actually been edited,
  not merely planned.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/ui typecheck` exits 0 after Section A+C | Fully-Automated | Criterion 9 (required-prop enforcement, packages/ui side) |
| `pnpm --filter @jojopotato/mobile typecheck` exits 0 after Section A+C | Fully-Automated | Criterion 9 + audit-completeness sub-requirement (enumeration is exhaustive by construction — a missed site cannot compile) |
| `card.test.tsx` — `mode="dark"`/`mode="light"` resolve correct tokens | Fully-Automated | Criterion 1 (Card-level), criterion 2/3 partial (component-prop-wiring layer) |
| History screen dark-mode RTL test — `history.tsx:74` resolves dark tokens | Fully-Automated | Criterion 1 (Order History renders correctly in dark mode) |
| Cart screen dark-mode RTL test — `cart.tsx:239` resolves dark tokens | Fully-Automated | Criterion 3 (pushed screen — cart) |
| Tab-root + pushed-screen RTL smoke tests (mode-prop wiring, no crash) for any NEW sites found in Section B beyond the 2 known-bad | Fully-Automated (prop-wiring/no-crash) | Criteria 2, 3, 4 (Fully-Automated tier) |
| Full visual legibility across all discovered screens | Agent-Probe | Criteria 2, 3, 4 (Hybrid tier — visual confirmation residual) |
| `status-bar.test.ts` — derivation function correctness, both inputs, mapping direction locked by feasibility VERDICT | Fully-Automated | Criterion 5 (Android derivation logic), criterion 6 (iOS shares derivation) |
| On-device StatusBar legibility, Android, 4 OS/app combinations | Agent-Probe / Known-Gap | Criterion 5 (physical-pixel residual) |
| On-device StatusBar legibility, iOS, 4 OS/app combinations (separate walkthrough from Android) | Agent-Probe / Known-Gap | Criterion 6 (physical-pixel residual, iOS-specific per SPEC warning) |
| Existing `useThemePreference`/`use-color-scheme` behavior unchanged (no new test needed — regression only) | Hybrid | Criterion 7 (toggle updates + persistence — unchanged substrate, re-confirm no regression via full test suite green) |
| Mocked `Appearance` change event → `useColorScheme()` updates — now a REQUIRED test (Gap 2 supplement), not a soft conditional | Fully-Automated (listener-wiring) | Criterion 8 (system-preference resume) — Agent-Probe for actual OS-level resume |
| Guard script — no raw `useColorScheme` import outside 2 allowed files | Fully-Automated | Criterion 9 (import-guard half) |
| Guard script — every themed-component call site passes `mode` or is on the reviewed allow-list, INCLUDING spread-prop attributes treated as automatic hard-fail (Gap 1 supplement) | Fully-Automated | Criterion 9 (call-site-guard half) + audit-completeness sub-requirement (this script's clean run IS the completed audit's evidence artifact per SPEC) |
| `pnpm --filter @jojopotato/ui check-tokens` (existing script — packages/ui components only) | Fully-Automated | Criterion 9 (hex half, packages/ui scope only — free win, already exists) |
| apps/mobile hex-guard extension OR recorded Known-Gap decision (Gap 3 supplement) | Fully-Automated (if extended) / Known-Gap (if deferred) | Criterion 9 (hex half, apps/mobile scope — currently unguarded) |

## Test Infra Improvement Notes

(none identified yet)

---

## Risks (carried from INNOVATE, unchanged)

| Risk | Severity | Mitigation |
|---|---|---|
| Real broken-site count unknown until tsc runs | Medium | Section B is one atomic discover-then-fix step; the plan does not pre-count |
| `packages/ui`'s own jest-expo suite + `component-showcase.tsx` also break | Medium | Section B step 1 + step 5 explicitly include packages/ui typecheck + its own test suite, not just apps/mobile |
| StatusBar fix could regress Android edge-to-edge / SystemUI interplay | Low | Only the `<StatusBar>` line changes (Section D step 2); flagged as a VALIDATE regression item — re-run full mobile test suite + a manual Android smoke check after the change |
| iOS StatusBar differs from Android under the hood | Low-Med | Shared derivation function (Section D), confirmed no `Platform.OS` branch exists in `expo-status-bar`'s own mapping function per feasibility VERDICT; still schedule the iOS Agent-Probe walkthrough as its own separate check (Section E step 9) — do not assume Android verification transfers |
| On-device legibility / restart persistence / OS-resume are permanently Agent-Probe | Inherent | Already tiered Known-Gap in SPEC (Section E step 9); tracked in phase report, never silently claimed automated |
| Guard script spread-prop blind spot could let a future silent mode-omission bug back in | Low (closed by supplement) | Gap 1 supplement adds an explicit hard-fail rule for spread attributes on tracked components |
| apps/mobile has no hex-guard equivalent to packages/ui's check-tokens | Low-Med (tracked) | Gap 3 supplement requires EXECUTE to either extend coverage or explicitly record the gap, not leave it silently unaddressed |

## Resume and Execution Handoff

1. **Selected plan file path:** `process/general-plans/active/mobile-dark-mode-audit_17-07-26/mobile-dark-mode-audit_PLAN_17-07-26.md`
2. **Last completed phase or step:** VALIDATE (V1-V7) complete. Gate: CONDITIONAL, first pass — a
   plan-supplement cycle is required before EXECUTE (see Validate Contract below). The 3 supplement gaps
   have already been folded into Sections E/F and the Implementation Checklist inline above (marked
   `[PLAN-SUPPLEMENT — Gap N, added at VALIDATE]`) — a plan-agent supplement pass should confirm these
   inline edits satisfy the SUPPLEMENT REQUEST and re-validate.
3. **Validate-contract status:** written below — Gate: CONDITIONAL (first pass, not yet terminal).
4. **Supporting context files loaded:** SPEC (co-located in this task folder), FEASIBILITY VERDICT
   (co-located in this task folder — StatusBar mapping direction is LOCKED, do not re-probe), `CLAUDE.md`
   §Theming, `packages/ui/src/components/card.tsx`, `packages/ui/src/theme.ts`, `packages/ui/src/index.ts`,
   `packages/ui/scripts/check-raw-tokens.mjs`, `apps/mobile/src/hooks/use-color-scheme.ts`,
   `apps/mobile/src/app/_layout.tsx`, `apps/mobile/jest.config.js`,
   `apps/mobile/src/features/branches/__tests__/branches-screen.test.tsx` (test-convention reference),
   `process/context/all-context.md`, `process/context/tests/all-tests.md`.
5. **Next step for a fresh agent picking up mid-execution:** the plan-supplement gaps are already reflected
   inline in this plan file (Sections E/F, Implementation Checklist, Verification Evidence, Risks). Since
   the supplement content is already present, a re-validate pass (V1-V7) should confirm the gaps are
   resolved and can reasonably re-derive Gate: PASS. If EXECUTE has already started, check the phase report
   (not yet created) for the Section B enumeration table before touching any files — do not re-run Section
   A if Section B's enumeration already exists on disk.

## Validate Contract

Status: PASS
Date: 17-07-26
date: 2026-07-17
generated-by: outer-pvl
supersedes: 2026-07-17 (outer-pvl) — re-validate after plan-supplement cycle 1; same-day contract
overwrite, no cross-type supersession (outer-pvl → outer-pvl)

Parallel strategy: sequential
Rationale: Score 1/7 (S7 — blast radius plausibly touches 5+ files once Section B's sweep completes,
exact count still unknown-by-design). This is the re-validate pass after PVL cycle 1 (a
confirmation-only supplement — 0 net-new plan edits, per `mobile-dark-mode-audit-pvl-iteration-001_
REPORT_17-07-26.md`). Re-examined the 3 supplement gaps adversarially against the plan text itself
(not the report's summary) rather than rubber-stamping the prior verdict, and re-confirmed Layer 1
infra findings (test scripts, package strictness) directly against `package.json`/source. A single
sequential validator was sufficient — the plan is self-contained, this is a targeted re-check, not a
fresh multi-direction investigation, so no fan-out is warranted. Real defect count from Section B's
tsc sweep is still unknown until EXECUTE runs it — **the EXECUTE strategy recommendation is
provisional; re-run `vc-agent-strategy-compare` once that count exists** rather than committing to a
fan-out topology on a guess now (see Execute-Agent Instruction E2 below). The host boot disk is at
~100% capacity (~133 MB free) as of this pass — flagged as an EXECUTE pre-condition/risk, not a
plan or validate defect (see Execute-Agent Instruction E3).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Order History (`history.tsx:74`) renders correct dark-mode tokens | Fully-Automated | `packages/ui/src/components/card.test.tsx` + history-screen dark-mode RTL test, run via `pnpm --filter @jojopotato/ui test` and `pnpm --filter @jojopotato/mobile test` | B |
| AC2/AC3/AC4 | Tab roots, pushed screens, (auth)/(staff) shell — mode-prop wiring, no crash | Fully-Automated | RTL smoke tests per Section B's enumeration, `pnpm --filter @jojopotato/mobile test` | B |
| AC2/AC3/AC4 (visual) | Full visual legibility across all discovered screens, both themes | Agent-Probe | Manual walkthrough across all 5 tabs, pushed screens, (auth), (staff) | D |
| AC5 | Android StatusBar derivation logic correct (scheme→content-color mapping) | Fully-Automated | `apps/mobile/src/lib/status-bar.test.ts`, run via `pnpm --filter @jojopotato/mobile test` — mapping direction LOCKED by feasibility VERDICT | A |
| AC5 (device) | On-device Android StatusBar legibility, 4 OS/app combinations | Agent-Probe | Manual on-device walkthrough, Android | D |
| AC6 | Same derivation applies to iOS (no `Platform.OS` branch in `expo-status-bar`'s own mapping, confirmed by VERDICT) | Fully-Automated | Same `status-bar.test.ts` | A |
| AC6 (device) | On-device iOS StatusBar legibility, 4 OS/app combinations — SEPARATE walkthrough from Android | Agent-Probe | Manual on-device walkthrough, iOS | D |
| AC7 | Theme toggle updates all surfaces without restart, persists across restart | Hybrid | `pnpm --filter @jojopotato/mobile test` green as regression guard on unchanged substrate; visual multi-surface update + restart-persistence claim | D |
| AC8 | System-preference resume via `Appearance` listener | Fully-Automated (listener-wiring) | Real test mocking `Appearance` (Gap 2 supplement — required Section E step; confirmed technically feasible this pass: `use-color-scheme.ts:2,14` calls RN's `useColorScheme` which is `Appearance`-backed) | B |
| AC9 | No new raw `useColorScheme` import outside 2 allowed files; every tracked-component call site passes `mode` or is on reviewed allow-list, INCLUDING spread-prop attributes (Gap 1 supplement) | Fully-Automated | Guard script (Section E steps 1-2), naming TBD by execute-agent against `apps/mobile/package.json` conventions | B |
| AC9 (hex, packages/ui) | No hardcoded colors in packages/ui components | Fully-Automated | `pnpm --filter @jojopotato/ui check-tokens` (existing script — re-confirmed working this pass, scope re-confirmed `packages/ui/src/components/**` only) | A |
| AC9 (hex, apps/mobile) | No hardcoded colors introduced in apps/mobile call-site fixes | Fully-Automated (if extended) / Known-Gap (if deferred, per Execute-Agent Instruction E1) | apps/mobile hex-guard extension OR explicit recorded Known-Gap decision (Gap 3 supplement) | C |

gap-resolution legend:
- A — proven now (gate passes in this cycle, already-existing infra)
- B — fixed in this plan (gate added by this plan's checklist; content confirmed genuinely closed this
  re-validate pass, execution itself still pending EXECUTE)
- C — deferred to a named later phase/plan (apps/mobile hex-guard extension, if EXECUTE judges it
  disproportionate to this plan's bounded scope — must be recorded as a Known-Gap with rationale, not
  silently dropped; see Execute-Agent Instruction E1 for the rationale bar)
- D — backlog test-building stub (named residual; keep-active; continue) — all Agent-Probe on-device
  legibility, restart-persistence, and OS-resume-behavior residuals

Legacy line form (retained so existing validate-contract consumers still parse):
- StatusBar derivation: Fully-automated: `pnpm --filter @jojopotato/mobile test` (status-bar.test.ts, mapping locked by feasibility VERDICT) | Agent-probe: on-device legibility, Android + iOS separately (Known-Gap tracked)
- Card/theme mode-prop enforcement: Fully-automated: `pnpm --filter @jojopotato/{ui,mobile} typecheck` + new guard script (`pnpm` script name TBD) | Agent-probe: full visual legibility sweep
- Existing theme substrate (toggle/persistence/OS-resume): Hybrid: full `pnpm --filter @jojopotato/mobile test` green as regression guard + new required `Appearance`-mock listener test | Agent-probe: visual multi-surface update, restart persistence, actual OS-resume (Known-Gap)

Dimension findings:
- Infra fit: PASS — re-confirmed this pass directly against `package.json`: `apps/mobile` `test` =
  `vitest run --passWithNoTests && jest`, `typecheck` = `tsc --noEmit`; `packages/ui` `test` = `jest`,
  `typecheck` = `tsc --noEmit`, `check-tokens` = `node scripts/check-raw-tokens.mjs`. All cited commands
  real and confirmed present; both packages `strict: true` (unchanged from baseline).
- Test coverage: PASS (upgraded from CONCERN) — all 3 gaps adversarially re-examined this pass, not
  rubber-stamped: Gap 1 (spread-prop hard-fail, plan `:225-231`) is concrete and actionable, ties to the
  existing reviewed allow-list mechanism (Section E step 2 bullet 2 / Section C step 2), no loophole
  found. Gap 2 (`Appearance`-mock listener test, plan `:279-280`) is technically feasible — confirmed
  `apps/mobile/src/hooks/use-color-scheme.ts:2,14` calls RN's `useColorScheme`, which is `Appearance`-
  backed, so the mock/assert approach described is buildable, not vague. Gap 3 (apps/mobile hex-guard,
  plan `:241-249`) is substantively closed — requires an explicit decision + written rationale, not a
  silent drop — but the "if extending scope is judged disproportionate" clause has no objective bar,
  leaving EXECUTE free to pick the easy branch with a thin rationale. This residual is real but minor
  (Low-Med risk per the plan's own Risk table, tier C — an acceptable EXECUTE-time judgment call by
  design) and is tightened via Execute-Agent Instruction E1 below rather than blocking PASS.
- Breaking changes: PASS — unchanged from baseline. Internal-only breaking change (26 components' `mode`
  prop becomes required); no public API/schema/cross-app contract touched; confirmed against Public
  Contracts section.
- Security surface: PASS — unchanged from baseline. No auth, billing, schema, secrets, or trust-boundary
  surface touched; pure rendering-layer fix.
- Section A (signature tightening): PASS — unchanged; all 26 named files re-confirmed present on disk
  this pass (`find` re-run, all 26 OK).
- Section B (tsc sweep + enumeration): PASS — unchanged; atomic discovery step mechanically sound, both
  typecheck commands and the `packages/ui test` command re-confirmed real this pass.
- Section C (fix each flagged site): PASS — unchanged; per-batch typecheck discipline sound, no conflicts
  against current file state.
- Section D (StatusBar): PASS — unchanged; mapping direction fully resolved by feasibility probe (VIABLE
  verdict), anti-inversion lock re-confirmed present and unambiguous at plan `:188-200`.
- Section E (Tests): PASS (upgraded from CONCERN) — supplement cycle 1's confirmation-only pass (0
  net-new edits) was independently re-verified this pass by reading the plan text directly rather than
  trusting the iteration report's summary: Gap 1 and Gap 2 close the blind spot they were meant to close
  with no residual ambiguity; Gap 3 closes the "silently unaddressed" problem but leaves a minor
  discretion-softness residual, addressed via Execute-Agent Instruction E1 (not severe enough to block
  PASS — see rationale above).
- Section F (all-tests.md correction): PASS — unchanged; minor note, no CONCERN.

Open gaps: none. All 3 first-pass CONCERNs (spread-prop blind spot, AC8 soft conditional, apps/mobile
hex-guard silence) are confirmed resolved in plan text as of this re-validate pass. One minor residual
(Gap 3's discretion bar) is carried forward as Execute-Agent Instruction E1, not as an open gap — it
does not block PASS.

What this coverage does NOT prove:
- `pnpm --filter @jojopotato/{ui,mobile} typecheck` proves no call site is missing a required `mode`
  prop at compile time — it does NOT prove the resolved token/color is visually correct or legible, only
  that a value was passed.
- `card.test.tsx` and the history/cart dark-mode RTL tests prove the SPECIFIC screens/components tested
  resolve correct tokens — they do NOT prove every one of the ~140 existing correct call sites, nor any
  newly-discovered Section B site beyond history/cart, resolves correctly; those rely on the RTL
  smoke-test tier (prop-wiring/no-crash only) or Agent-Probe visual confirmation.
- `status-bar.test.ts` proves the pure derivation function's input→output mapping is correct — it does
  NOT prove the physical status bar pixels are legible on a real device, nor that `SystemUI.
  setBackgroundColorAsync`/the nav `ThemeProvider` stay synchronized with it at runtime (though the
  feasibility probe confirmed these are independent, non-interacting concerns).
- The new `Appearance`-mock listener test proves the hook reacts to a simulated change event — it does
  NOT prove actual OS-level backgrounding/resume behavior on a real device.
- The guard script (even with the spread-prop fix) proves no CURRENT unlisted call site is missing
  `mode` and no CURRENT raw `useColorScheme` import exists outside the two allowed files — it does NOT
  prevent a future developer from adding a new component to the allow-list incorrectly, nor does it
  catch a `mode` prop passed with the WRONG value (e.g. hardcoding `mode="light"` on a screen that should
  be dynamic) — only presence/absence of the prop is checked, not correctness of its value.
- `pnpm --filter @jojopotato/ui check-tokens` proves no raw hex literal exists in `packages/ui/src/
  components/**` — it does NOT extend to `apps/mobile`, where Section C's fixes are actually applied
  (Gap 3, tracked via Execute-Agent Instruction E1).
(Required until C3 is implemented — temporary C3 mitigation)

Execute-Agent Instructions:

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | Gap 3 (apps/mobile hex-guard) — if you choose branch (b) "record as Known-Gap" instead of extending the guard script, the phase-report rationale must be concrete, not a bare restatement of "judged disproportionate." State at minimum: (i) how many touched `apps/mobile` files from Section C actually introduced new inline color literals (a count, not a guess), and (ii) why extending the existing `check-raw-tokens.mjs` glob to also cover `apps/mobile/src/app/**` + `apps/mobile/src/features/**` was infeasible or disproportionate given that count. A rationale that does not name a concrete count is insufficient. | Section E step 2, Gap 3 decision point |
| E2 | Once Section B's tsc sweep produces the real broken-site count, re-invoke `vc-agent-strategy-compare` before starting Section C's fix loop — this pass's `sequential` recommendation was scored on an unknown count (S7 signal is a plausibility guess, not a measurement) and may need to become `parallel subagents` if the real count is large and spans independent screen/feature areas with no cross-talk needed. | Immediately after Section B completes, before Section C begins |
| E3 | The host boot disk was at ~100% capacity (~133 MB free) as of this VALIDATE pass. `tsc --noEmit` and the jest/vitest suites are disk-sensitive (temp files, watch caches). If a gate command fails with an I/O or `ENOSPC`-shaped error, treat it as an environment precondition failure, not a code defect — report it rather than retrying the identical command, and flag disk state to the orchestrator before continuing. | Any Section B/C/E gate-command failure with a disk/IO error signature |
| E4 | Process note (non-blocking, for UPDATE PROCESS): the prior validate pass (cycle 0) applied the 3 supplement fixes directly to this plan's body during its own V6 contract write, outside its `## Validate Contract` write scope. Cycle 1's plan-supplement pass and this re-validate pass both independently re-verified the fixes were correct, so no defect resulted — but flag this scope overstep at UPDATE PROCESS so future VALIDATE passes route plan-body fixes through a SUPPLEMENT REQUEST instead of self-editing. | UPDATE PROCESS phase report |

Gate: PASS (0 FAILs, 0 unresolved CONCERNs — all 3 first-pass CONCERNs adversarially re-examined this
cycle and confirmed genuinely resolved in plan text, not just described; one minor residual (Gap 3
discretion bar) closed via Execute-Agent Instruction E1 rather than left open. 1 plan-supplement cycle
completed per `results.tsv` — EXECUTE is legal per protocol: `Gate: PASS` present.)
Accepted by: N/A — no unresolved CONCERNs requiring acceptance; PASS is unconditional. (Cycle history:
cycle 0 CONDITIONAL 3 gaps → cycle 1 SUPPLEMENT_APPLIED confirmation-only, 0 net-new edits → this
re-validate pass confirms PASS.)

## Autonomous Goal Block

SESSION GOAL: Fix the mobile dark-mode rendering bug class (silent mode-default on 26 shared
`@jojopotato/ui` components) + Android/iOS StatusBar legibility, with a durable automated guard
against recurrence.
Charter + umbrella plan: N/A — single plan, not a phase program.
Autonomy: Autonomous /goal execution — CONDITIONAL findings apply fixes and proceed without pausing;
BLOCKED items go to backlog and continue; irreversible/outward-facing actions without explicit
contract instruction are a hard stop. See `process/development-protocols/orchestration.md`
§Autonomous /goal Phase Program Execution.
Hard stop conditions / safety constraints:
- Do not rebuild, replace, or materially change `theme-preference.ts`, `use-color-scheme.ts` (or its
  `.web.ts` sibling), `use-theme.ts`, or the Account-tab System/Light/Dark toggle — confirmed sound,
  explicitly out of scope.
- Do not touch `apps/admin`, `theme.ts` token values, or introduce any new branding.
- Do not implement `resolveStatusBarStyle` as an identity mapping (`scheme === 'dark' ? 'dark' :
  'light'`) — LOCKED wrong by the feasibility probe; must be `scheme === 'dark' ? 'light' : 'dark'`.
- Do not claim VERIFIED status until both the Android AND the separate iOS Agent-Probe StatusBar
  walkthroughs have actually been performed (CODE DONE is not VERIFIED).
- Do not silently drop the apps/mobile hex-guard gap (Gap 3) — either extend coverage or record an
  explicit Known-Gap with rationale in the phase report (see Validate Contract Execute-Agent
  Instruction E1 for the required rationale bar).
Next phase: EXECUTE — validate-contract Gate: PASS (17-07-26, cycle 1 confirmed):
`process/general-plans/active/mobile-dark-mode-audit_17-07-26/
mobile-dark-mode-audit_PLAN_17-07-26.md`
Validate contract: inline in plan (above).
Execute start: `pnpm --filter @jojopotato/ui typecheck` (Section A confirmation) → `pnpm --filter
@jojopotato/mobile typecheck` (Section B enumeration) → fix loop (Section C) → StatusBar (Section D,
parallelizable) → tests (Section E, incl. the required `Appearance`-mock test) → `all-tests.md`
(Section F). High-risk pack: no (no auth/billing/schema/migration/public-API/secrets surface touched).
