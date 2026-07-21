---
name: plan:fix-tab-bar-visibility-nav-trap
description: "Hide floating tab bar on nested screens (show only on 5 tab roots) + tap-active-tab resets stack to root (fixes Home Active-Order banner trap). apps/mobile only."
date: 15-07-26
feature: none
---

# Fix Tab Bar Visibility + Active-Order Nav Trap — SIMPLE Plan

**Date**: 15-07-26
**Status**: Active — VALIDATE PASS (cycle 2), ready for EXECUTE
**Complexity**: SIMPLE

**TL;DR:** Two behavior fixes, both centered on `apps/mobile/src/components/floating-tab-bar.tsx`.
Fix A: hide the entire floating bar whenever the focused tab's nested stack is not at its root
(`state.index > 0`), so the bar shows only on the 5 tab-root screens. Fix B: when a user taps the
already-active tab, reset that tab's stack to root — this also frees the user from the Home
"Active Order" banner trap (cross-tab push into `order/tracking`). The nested-route classifier is
extracted into a new pure `floating-tab-bar.helpers.ts` (zero RN imports) so it is unit-testable
under vitest node-env. No route restructuring, no schema/auth/API/billing surface, no new
dependencies. Web (`_layout.web.tsx`) is out of scope (backlog note). Verification is Agent-Probe
for the visual/nav-state behaviors plus one Fully-Automated unit test on the extracted pure
`isNestedTabRoute()` helper.

**Context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`.

---

## Overview

Two related navigation defects in the Expo Router mobile app:

1. **Bar over-shows.** `FloatingTabBar` (custom `tabBar` render prop for `Tabs` on iOS/Android)
   sits above each tab's nested `Stack` and paints on every pushed screen (product details, cart,
   checkout, tracking, branch details, etc.). It should appear only on the 5 tab-root screens
   (Home / Order / Rewards / Branches / Account).
2. **Active-Order banner trap.** Home's "Active Order" banner does a cross-tab
   `router.push('/(tabs)/order/tracking/[orderId]')`, switching to the Order tab with stack
   `[index, tracking]`. The bar's `onPress` is a no-op when the tapped tab is already active, so
   re-tapping Order cannot return the user to the Order menu — they are stuck on tracking.

Chosen approach (INNOVATE-locked): Fix A reads the focused tab's nested navigation state; Fix B
extends the tap handler to reset-to-root on active-tab tap. The pure route classifier is extracted
to `floating-tab-bar.helpers.ts` and re-imported by the component. Fixing B via the standard
"tap tab icon → pop to top" pattern also neutralizes the latent identical risk in `openProduct` /
`openBranch` cross-tab pushes for free.

## Goals

- Tab bar visible ONLY on the 5 tab-root screens; hidden on every nested/pushed screen in each tab.
- Tapping an already-active tab resets that tab's stack to its root (`index`) — consistent for all 5 tabs.
- Home "Active Order" banner → tracking still works, and the user can return to the Order menu by tapping the Order tab.
- Preserve the existing `useHideTabBarWhile` checkout countdown-hide behavior unchanged.
- Preserve the `notification-factory.test.ts` pinned route path unchanged.
- No regressions to native header/back button on nested screens (unchanged behavior — confirm only).

## Scope

- **In scope:** `apps/mobile/src/components/floating-tab-bar.tsx` (source change) + new pure
  `apps/mobile/src/components/floating-tab-bar.helpers.ts` (extracted classifier). Read-only audit
  of `getFloatingTabBarClearance` call sites for stale bottom-padding on nested-only screens
  (verify; change only if the audit proves a nested-only screen reserves now-dead clearance).
- **Out of scope (backlog note, do not implement):** web native tab bar `_layout.web.tsx`. Web
  uses the platform-native `Tabs` bar and does not pick up this file (Metro platform-extension
  resolution); iOS-first / Android-ready priority.
- **Do not touch:** route paths, `deals` ICONS allowlist filter (button filtering, unrelated),
  `useHideTabBarWhile` external store (orthogonal overlay case — keep as-is), `_layout.ios.tsx` /
  `_layout.android.tsx` wiring.

---

## Touchpoints

| File | What changes |
|---|---|
| `apps/mobile/src/components/floating-tab-bar.helpers.ts` (NEW — pure, ZERO RN/reanimated/expo imports) | Holds the extracted `TabBarRoute` state-shape type (or a minimal local `NestedRouteLike` interface with optional `state?: { index: number }`) and the exported pure helper `isNestedTabRoute(route)` returning `route.state != null && route.state.index > 0`. This module MUST NOT import `react-native`, `react-native-reanimated`, `@expo/vector-icons`, or any RN runtime — it is imported by a vitest node-env unit test, which crashes if reanimated is transitively pulled in. |
| `apps/mobile/src/components/floating-tab-bar.tsx` | (1) Import `isNestedTabRoute` (and the shared route-shape type) from `./floating-tab-bar.helpers` instead of declaring the classifier locally. (2) Extend local `TabBarRoute` type (lines 53-56) with optional `state?: { index: number }` (or reuse the helper's type). (3) In `FloatingTabBar` (line 233+), compose bar-hidden condition: `isHidden = tabBarHidden || isFocusedTabNested`, where `isFocusedTabNested = isNestedTabRoute(state.routes[state.index])`. Drive the existing `barOpacity` fade + `pointerEvents`/accessibility off this composed `isHidden` instead of the store flag alone. (4) Extend the local `navigation.navigate` type signature from `(name: string) => void` to `(name: string, params?: { screen: string }) => void` (optional 2nd arg, additive) so Fix B's reset call typechecks. (5) Extend `onPress` (lines 279-289): when `isActive` (currently a no-op), reset that tab's stack to root via the confirmed reset call. |
| `apps/mobile/src/components/__tests__/floating-tab-bar.helpers.test.ts` (NEW) | Unit test importing `isNestedTabRoute` from `../floating-tab-bar.helpers` (NOT from `floating-tab-bar.tsx` — that path crashes under vitest node-env). Cases: root (`state: { index: 0 }`), nested (`state: { index: 1 }`), missing-state. |
| `getFloatingTabBarClearance` call sites (`index.tsx`, `order/index.tsx`, `checkout.tsx`, cart, `[branchId]`, `deal/[dealId]`, `account/notifications`, others) | READ-ONLY audit only. Change a call site ONLY if it is a nested (non-tab-root) screen that reserves bar clearance that is now always hidden. Tab-root screens keep their clearance. Verify, do not blindly edit. |

## Public Contracts

- `FloatingTabBar` default export: signature unchanged (still `({ state, descriptors, navigation }: BottomTabBarProps)`). Internal behavior only changes.
- `useHideTabBarWhile(active)` export: unchanged, still honored (composed via OR with the new nested check).
- `getFloatingTabBarClearance(insetsBottom)` export: unchanged signature/return.
- NEW export: `isNestedTabRoute(route)` pure helper, now living in `floating-tab-bar.helpers.ts` (for unit testability without RN imports). Additive; no caller impact.
- Local `TabBarRoute` interface gains an OPTIONAL `state?: { index: number }` field — additive, backward-compatible with existing usage.
- Local `navigation.navigate` type signature is widened from `(name: string) => void` to `(name: string, params?: { screen: string }) => void` — additive optional 2nd param, needed so Fix B's `navigate(name, { screen: 'index' })` reset call typechecks. This is a file-internal locally-declared type; it is NOT a downstream consumer break (the real React Navigation `navigate` already accepts params). Adjust the exact params shape to match whatever reset call is chosen in checklist step 1/6.
- No route path strings change. No API/schema/auth surface.

## Blast Radius

- **Source files changed:** 1 (`floating-tab-bar.tsx`).
- **New files:** 2 (`floating-tab-bar.helpers.ts` pure module + `floating-tab-bar.helpers.test.ts` unit test).
- **Possible incidental touch-ups:** clearance dead-space audit. Corrected expectation: **several
  (~5-6) nested-screen `getFloatingTabBarClearance` call sites become dead padding after Fix A hides
  the bar on those screens** (cart, checkout, `[branchId]`, `deal/[dealId]`, `account/notifications`,
  and similar nested screens). The step-11 audit should identify and optionally clean these up.
  Cosmetic-only (extra bottom padding on already-scrolling nested screens), low risk, **not required
  for any AC to pass** — remove reservations only on confirmed nested-only screens, leave tab-root
  screens untouched.
- **Packages:** `apps/mobile` only.
- **Risk class:** LOW. No schema/auth/API/billing/migration surface. No new dependencies. Navigation-behavior-only change in a single presentational component plus one pure helper. Primary risk is the runtime shape of `state.routes[i].state` (see Dependencies / Risks).

---

## Implementation Checklist

1. **Confirm nested-state availability (contingency gate — do FIRST in EXECUTE).** Verify via
   `vc-docs-seeker` (or direct type/source inspection of the installed `expo-router ~57.0.4` /
   underlying `@react-navigation/bottom-tabs`) that the `tabBar` render prop's
   `state.routes[state.index].state?.index` reliably exposes the focused tab's nested-stack index
   at runtime, AND confirm the exact active-tab reset call (`navigate(name, { screen: 'index' })`
   React Navigation nested shape vs an Expo Router `router` equivalent). If confirmed → proceed with
   steps 2-9 (primary path). If NOT reliably exposed → switch to the contingency path (step 10)
   before writing code.
2. **Extract the pure classifier (do BEFORE the unit test — resolves the vitest-crash gap).** Create
   `apps/mobile/src/components/floating-tab-bar.helpers.ts` with ZERO react-native / reanimated /
   expo imports. It holds a minimal route-shape type (optional `state?: { index: number }`) and the
   exported pure helper `isNestedTabRoute(route): boolean` returning
   `route.state != null && route.state.index > 0`. This is the module the vitest node-env unit test
   imports — the classifier must NOT live in `floating-tab-bar.tsx` (that module imports
   `react-native` + `react-native-reanimated` at top level and crashes under vitest node-env).
3. In `floating-tab-bar.tsx`, `import { isNestedTabRoute } from './floating-tab-bar.helpers';`
   (and the route-shape type if shared). Remove any local duplicate of the classifier.
4. Extend the local `TabBarRoute` interface (lines 53-56) with `state?: { index: number }`
   (optional, additive) — or reuse the helpers module's type. Keep the existing doc comment about
   the locally-declared type; extend it carefully rather than importing the real `BottomTabBarProps`.
5. In `FloatingTabBar`, compute `const focusedTab = state.routes[state.index];` and
   `const isFocusedTabNested = isNestedTabRoute(focusedTab);`. Compose
   `const isHidden = hidden || isFocusedTabNested;` (where `hidden` is the existing
   `useSyncExternalStore` store value). Drive the `barOpacity` `withTiming` effect (lines 243-245),
   `pointerEvents`, `accessibilityElementsHidden`, and `importantForAccessibility` (lines 250-252)
   off `isHidden` instead of `hidden`.
6. Verify the checkout overlay case still works: `useHideTabBarWhile(true)` (checkout countdown)
   must still hide the bar even when the focused tab is at root — the OR composition guarantees this.
7. **Extend the local `navigation.navigate` type signature** from `(name: string) => void` to
   `(name: string, params?: { screen: string }) => void` (optional 2nd param, additive) so Fix B's
   reset call typechecks. Match the exact params shape to the reset call confirmed in step 1.
8. Extend the `onPress` handler (lines 279-289). Current logic:
   `if (!isActive && !event.defaultPrevented) navigation.navigate(route.name);`. New logic: when
   `isActive` (and not prevented), reset that tab's stack to its root screen (`index`) using the
   exact reset call confirmed in step 1. Keep the existing `!isActive` branch unchanged (still
   `navigate(route.name)` to switch tabs). Do NOT `emit` a second event or change the `tabPress` emit.
9. Confirm the `deals` ICONS allowlist filter (`if (!(route.name in ICONS)) return null;`) and the
   `state.routes.map` render remain untouched — Fix A/B are independent of button filtering. Then add
   the helper unit test file (`__tests__/floating-tab-bar.helpers.test.ts`): import `isNestedTabRoute`
   from `../floating-tab-bar.helpers` and assert it returns `false` for a root route
   (`state: { index: 0 }`), `false` for a route with no `state`, and `true` for a nested route
   (`state: { index: 1 }`). Pure TS → vitest (`*.test.ts`) is the runner per `all-tests.md`.
10. **Contingency path (only if step 1 fails).** Do not rely on `state.routes[i].state`. Instead
    read nav depth via `useNavigationState` inside each tab Stack's root screen (or a shared hook)
    and sync a per-tab "is at root" flag into the SAME external store pattern `useHideTabBarWhile`
    already uses. This widens the blast radius to each tab `_layout.tsx`/root screen; if reached,
    note the scope change in the phase report and re-confirm with VALIDATE before proceeding. Primary
    path (steps 2-9) is strongly preferred.
11. Run regression gates (typecheck [net-new-errors only] + existing `apps/mobile` suites) — see Verification Evidence.
12. Audit `getFloatingTabBarClearance` call sites (read-only). Expect ~5-6 nested screens with now-dead
    clearance; remove the reservation on confirmed nested-only screens ONLY; leave tab-root call sites
    unchanged; note findings in the report.
13. Agent-Probe walkthrough of all 6 acceptance behaviors (see Acceptance Criteria).

---

## Acceptance Criteria

| # | Criterion | proven by | strategy |
|---|---|---|---|
| AC1 | Tab bar visible ONLY on the 5 tab-root screens (Home/Order/Rewards/Branches/Account); hidden on every nested/pushed screen in each tab (product details, cart, checkout, tracking, branch details, order history). | Agent-Probe: navigate into a pushed screen in each of the 5 tabs, confirm bar hidden; return to root, confirm bar visible. | Agent-Probe |
| AC2 | Native header + back button still work correctly on nested screens (no regression — unchanged behavior). | Agent-Probe: on a pushed screen, confirm native header renders and back button pops correctly. | Agent-Probe |
| AC3 | Tapping Home "Active Order" banner navigates to tracking AND the user can return to the Order tab menu afterward by tapping the Order tab (which resets Order stack to root). | Agent-Probe: tap banner → land on tracking (bar hidden per AC1) → tap Order tab → land on Order menu root. | Agent-Probe |
| AC4 | Tapping an already-active tab (Rewards/Account/Branches, and Home/Order) with a pushed screen resets that tab to its root — consistent for all 5 tabs. | Agent-Probe: push a screen in each tab via its own UI, then tap that tab's icon → returns to that tab's root. | Agent-Probe |
| AC5 | Checkout's existing `useHideTabBarWhile` countdown-hide behavior still works unchanged. | Agent-Probe: trigger checkout countdown → confirm bar fades out as before. | Agent-Probe |
| AC6 | `notification-factory.test.ts` pinned route path `/(tabs)/order/tracking/[orderId]` still passes unchanged. | Fully-Automated: existing `apps/mobile` test suite passes; route path untouched. | Fully-Automated |
| AC7 | Pure `isNestedTabRoute()` helper (in `floating-tab-bar.helpers.ts`) correctly classifies root / nested / missing-state routes. | Fully-Automated: new helper unit test (importing the pure helpers module) passes. | Fully-Automated |

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/mobile typecheck` — **net-new-errors-only** (see gate note below) | Fully-Automated | Regression gate; type-safety of Fix A `TabBarRoute.state` field + Fix B `navigate` signature extension (guards all ACs) |
| `pnpm --filter @jojopotato/mobile test` (vitest + jest) exits 0 | Fully-Automated | AC6 (pinned route path), AC7 (helper unit test), general regression |
| New `isNestedTabRoute` unit test (root / nested / no-state cases), importing `floating-tab-bar.helpers.ts` | Fully-Automated | AC7 |
| Existing `notification-factory.test.ts` unchanged and green | Fully-Automated | AC6 |
| Agent-Probe: bar visibility across depth in all 5 tabs | Agent-Probe | AC1 |
| Agent-Probe: native header + back on nested screens | Agent-Probe | AC2 |
| Agent-Probe: Home Active-Order banner → tracking → back to Order menu | Agent-Probe | AC3 |
| Agent-Probe: tap-active-tab-resets-to-root for all 5 tabs | Agent-Probe | AC4 |
| Agent-Probe: checkout countdown bar-hide unchanged | Agent-Probe | AC5 |

**Typecheck gate = net-new-errors-only (NOT `exits 0`).** `pnpm --filter @jojopotato/mobile typecheck`
is RED at baseline: 3 pre-existing BRN-001/002/003 typed-route errors exist from missing type stubs
for `@gorhom/bottom-sheet`, `expo-maps`, and `expo-location` (documented in `all-context.md` as
pre-existing and unrelated to this plan's blast radius). The gate PASSES if and only if those same 3
BRN errors are the ONLY typecheck errors present — i.e. `floating-tab-bar.tsx` /
`floating-tab-bar.helpers.ts` introduce ZERO new errors. Any NEW error beyond those 3 (e.g. from the
extended `TabBarRoute.state` field or the widened `navigate` signature) FAILS the gate. Execute-agent
must diff against the known 3-error baseline, not require a clean exit-0.

**Tier rationale (via vc-test-coverage-plan waterfall):** No RN navigation E2E runner exists
(project-wide gap per `all-context.md` / `tests/all-tests.md`), so the visual/nav-state behaviors
(AC1–AC5) are correctly **Agent-Probe** — they require judgment of on-screen bar visibility and
navigation stack state that cannot be mechanically asserted without a Detox/Maestro harness (not in
scope to introduce for this fix). The only **Fully-Automated** opportunity is the extracted pure
`isNestedTabRoute()` helper (AC7) plus the existing pinned-route regression test (AC6). This is not
a vacuous-green situation: AC6/AC7 have real passing automated tests; AC1–AC5 are Agent-Probe
(a genuine proving strategy), not Known-Gap. No developed behavior is left on Known-Gap.

**Regression gates (do not directly assert new nav behavior, but must stay green):**
- `pnpm --filter @jojopotato/mobile typecheck` (net-new-errors-only — exclude the 3 pre-existing BRN errors)
- `pnpm --filter @jojopotato/mobile test` (vitest `*.test.ts` + jest `*.test.tsx`)

---

## Test Infra Improvement Notes

- The RN navigation E2E gap (no Detox/Maestro/Playwright for `apps/mobile`) forces AC1–AC5 to
  Agent-Probe. If a navigation E2E runner is introduced later, these five behaviors are prime
  candidates to promote to Fully-Automated (bar-visibility-by-depth and tap-to-reset are
  deterministic given a driver). Tracked as the existing project-wide backlog gap
  (`process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`) — no new note
  needed; reference it in the closeout.
- The `isNestedTabRoute` extraction to a pure `floating-tab-bar.helpers.ts` module is the reusable
  pattern for making RN-component logic unit-testable under vitest node-env: keep pure classifiers
  out of any module that transitively imports `react-native-reanimated` (which crashes even under
  jest, and has no mock in the vitest node environment).

---

## Phase Completion Rules

This is a SIMPLE single-session plan (one phase). Completion criteria:

- **CODE DONE** when checklist steps 1-12 are implemented and both regression gates
  (`typecheck` net-new-errors-only + `test`) are green, including the new `isNestedTabRoute` unit
  test (AC6, AC7).
- **✅ VERIFIED** only after CODE DONE AND the Agent-Probe walkthrough (step 13) confirms AC1–AC5
  on a running device/simulator AND the user confirms the observed behavior. Code-only completion
  is CODE DONE, never VERIFIED — the nav/visual behaviors have no automated proof and require the
  user-confirmed manual walkthrough.
- Do not mark the plan VERIFIED on typecheck/unit-test green alone.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/fix-tab-bar-visibility-nav-trap_15-07-26/fix-tab-bar-visibility-nav-trap_PLAN_15-07-26.md`
2. **Last completed step:** PLAN written + PVL-supplement applied (E1/E2/E3/E4 folded into plan body) → VALIDATE re-run cycle 2 → **Gate PASS**. Not yet executed.
3. **Validate-contract status:** written (PASS, 15-07-26, cycle 2 — supersedes the cycle-1 CONDITIONAL) — see `## Validate Contract`.
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `apps/mobile/src/components/floating-tab-bar.tsx` (full), `apps/mobile/vitest.config.ts` (node-env + `src/**/*.test.ts` include confirmed), `notification-factory.test.ts` (pinned route confirmed).
5. **Next step for a fresh agent:** EXECUTE starting at checklist step 1 (the nested-state + reset-call confirmation gate) before writing any code. Then step 2 (extract `isNestedTabRoute` to the pure `floating-tab-bar.helpers.ts` — resolves E1) BEFORE writing the unit test. Apply E2 (widen local `navigate` signature) before Fix B. Treat the typecheck gate as net-new-errors-only (E3 — exclude the 3 pre-existing BRN errors). If step 1 forces the contingency path (step 10), re-confirm with VALIDATE (blast radius widens to per-tab `_layout.tsx`).

---

## Next Step

Plan complete, PVL-supplemented, and VALIDATE-passed (cycle 2). Proceed to EXECUTE.

---

## Validate Contract

Status: PASS
Date: 15-07-26
date: 2026-07-15
generated-by: outer-pvl
supersedes: 15-07-26 (outer-pvl) — cycle-2 outer PVL has current evidence; all 4 cycle-1 CONCERNs verified resolved in plan body

Parallel strategy: sequential
Rationale: 7-signal score 0/7 — single package (apps/mobile), 1 source + 1 helper + 1 test file, no schema/API/auth surface, not a phase program, no high-risk class. Sequential single vc-execute-agent (opus) for EXECUTE.

Cycle-2 supplement verification (all 4 cycle-1 CONCERNs confirmed CLOSED against plan text + real source, not merely RESOLVED-marked):
- E1 (helper purity / vitest node-env crash) — CLOSED. Checklist step 2 + Touchpoints create a pure `floating-tab-bar.helpers.ts` (ZERO react-native/reanimated/expo imports); the unit test (step 9 / Touchpoints) imports from `../floating-tab-bar.helpers`, NOT `floating-tab-bar.tsx`. Verified real against source: `apps/mobile/vitest.config.ts` is `environment: 'node'` with `include: ['src/**/*.test.ts']` — importing the reanimated-laden `.tsx` under node-env would crash; the pure extraction is the correct fix and the new test path matches the include glob.
- E2 (navigate signature too narrow) — CLOSED. Checklist step 7 + Public Contracts widen the local `navigation.navigate` to `(name: string, params?: { screen: string }) => void`. Verified real against source: `floating-tab-bar.tsx:75` declares `navigate: (name: string) => void` — the single-arg type genuinely blocks Fix B's `navigate(name, { screen: 'index' })`; the additive optional 2nd param is the correct, backward-compatible fix (file-internal type, not a downstream break).
- E3 (typecheck baseline not net-new-errors) — CLOSED. Verification Evidence "Typecheck gate = net-new-errors-only (NOT exits 0)" note + checklist step 11 frame the gate against the 3 pre-existing BRN-001/002/003 typed-route errors; pass iff those 3 remain the ONLY errors and the two touched files add zero new ones.
- E4 (clearance blast-radius understated) — CLOSED. Blast Radius corrected from "expectation: 0" to "several (~5-6) nested-screen `getFloatingTabBarClearance` call sites become dead padding"; checklist step 12 audits them (cosmetic-only, not required for any AC to pass).

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC7 | `isNestedTabRoute` classifies root / nested / missing-state routes | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (new unit test) — helper extracted to pure `floating-tab-bar.helpers.ts` first (E1, checklist step 2) | B |
| AC6 | pinned route path `/(tabs)/order/tracking/[orderId]` unchanged | Fully-Automated | existing `notification-factory.test.ts` stays green in same suite | A |
| type-safety | extended `TabBarRoute.state` + `navigation.navigate` 2nd-arg signature typecheck | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` — net-NEW errors only (3 pre-existing BRN typed-route errors excluded, see E3) | B |
| AC1 | bar visible ONLY on 5 tab roots; hidden on every nested screen | Agent-Probe | simulator walkthrough: push a screen in each of 5 tabs → bar hidden; return to root → bar visible | A |
| AC2 | native header + back button unchanged on nested screens | Agent-Probe | on a pushed screen confirm native header renders + back pops | A |
| AC3 | Home Active-Order banner → tracking, then Order-tab tap returns to Order menu | Agent-Probe | tap banner → tracking (bar hidden) → tap Order tab → Order menu root | A |
| AC4 | tap already-active tab resets that tab to root — all 5 tabs | Agent-Probe | push a screen in each tab, tap that tab icon → returns to root | A |
| AC5 | checkout `useHideTabBarWhile` countdown-hide unchanged | Agent-Probe | trigger checkout countdown → bar fades out as before | A |

gap-resolution legend: A — proven now (gate/probe passes this cycle); B — fixed by this plan's checklist; C — deferred to a named later phase/plan; D — backlog test-building stub.

C-4 reconciliation: the `strategy` column carries ONLY the 3 proving strategies (Fully-Automated / Agent-Probe here; no Hybrid). Known-Gap is NOT used — no developed behavior rests on Known-Gap. AC1–AC5 are Agent-Probe (a real proving strategy), justified by the project-wide absence of an RN navigation E2E runner.

Failing stub (Fully-Automated AC7 row only):
```
test("isNestedTabRoute returns false for a root route (state.index 0), false for missing state, true for nested (state.index 1)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: isNestedTabRoute root/nested/missing-state classification")
})
```

Legacy line form (retained so existing validate-contract consumers still parse):
- floating-tab-bar helper (AC7): Fully-automated: `pnpm --filter @jojopotato/mobile test` (after extracting `isNestedTabRoute` to a pure `floating-tab-bar.helpers.ts` module — see E1 / checklist step 2)
- pinned route (AC6): Fully-automated: `pnpm --filter @jojopotato/mobile test` (existing `notification-factory.test.ts` green)
- type-safety: Fully-automated: `pnpm --filter @jojopotato/mobile typecheck` (net-new-errors gate; exclude 3 pre-existing BRN errors)
- bar visibility + nav state (AC1–AC5): agent-probe: iOS/Android simulator walkthrough

Dimension findings:
- Infra fit: PASS — single-file presentational change plus one pure helper in `apps/mobile`; `apps/mobile/vitest.config.ts` (node-env) exists and the new test path (`src/components/__tests__/floating-tab-bar.helpers.test.ts`) matches the `src/**/*.test.ts` include glob; no infra/runtime/port surface touched.
- Test coverage: PASS — the E1 vitest-node-env-crash concern is resolved by the verified pure-helper extraction; tiering is honest and non-vacuous (AC6/AC7 real Fully-Automated tests; AC1–AC5 genuine Agent-Probe; no developed behavior on Known-Gap).
- Breaking changes: PASS — additive public contract (new pure `isNestedTabRoute` export in helpers module; optional `TabBarRoute.state` field). The local `navigation.navigate` widening (E2, checklist step 7) is verified file-internal (`floating-tab-bar.tsx:75`), not a downstream consumer break.
- Security surface: PASS — no auth/identity/billing/credits/schema/secret/trust-boundary surface; not a high-risk class; no risk evidence pack required.
- Section A feasibility (Fix A — bar visibility): PASS — mechanically feasible (plan line refs verified accurate against the real file: `TabBarRoute` at 53-56, `hidden`/`barOpacity` at 238-252, ICONS filter at 273, `state.routes.map` at 272). Runtime dependency on `state.routes[state.index].state?.index` is mitigated by the mandatory step-1 EXECUTE gate + step-10 contingency + safe degradation (undefined → false → bar shown at root, the correct default). E4 clearance blast-radius corrected (~5-6 nested call sites), cosmetic-only, not AC-blocking.
- Section B feasibility (Fix B — tap-active reset): PASS — highest-risk edit, now unblocked. The local `navigation.navigate` single-arg signature (verified line 75) is widened by E2/step 7; reset semantics share the step-1 runtime confirmation gate (execute-agent instruction, not a plan gap).

Open gaps: none blocking. Carried forward as execute-agent instructions (below), not validation blockers:
- Step-1 runtime confirmation gate (`state.routes[i].state.index` availability + exact reset call) is mandatory FIRST in EXECUTE; step-10 contingency + safe-default degradation cover the negative case.
- Clearance dead-space audit (checklist step 12): ~5-6 nested screens, cosmetic-only.
- Web `_layout.web.tsx` intentionally out of scope (iOS-first priority) — acknowledged, correct.
- No RN navigation E2E runner (project-wide gap, `mobile-e2e-navigation-harness_NOTE_09-07-26.md`) → AC1–AC5 stay Agent-Probe; not a new gap.

Execute-agent instructions:
- E1: Before writing the unit test, extract `isNestedTabRoute` to `floating-tab-bar.helpers.ts` (pure, no RN imports). Test imports the helpers file. Do NOT import from `floating-tab-bar.tsx` in a vitest (node-env) test.
- E2: Add the optional 2nd param to the local `navigation.navigate` signature before implementing Fix B.
- E3: Treat the typecheck gate as net-new-errors-only; confirm the 3 pre-existing BRN errors are the only remaining ones and that `floating-tab-bar.tsx`/`floating-tab-bar.helpers.ts` introduce zero new type errors.
- Step-1 gate is mandatory FIRST: confirm `state.routes[i].state.index` availability + the exact reset call before choosing primary path (steps 2–9) vs contingency (step 10). If contingency is reached, re-confirm with VALIDATE (blast radius widens to per-tab `_layout.tsx`).

What this coverage does NOT prove:
- `pnpm --filter @jojopotato/mobile typecheck`: proves type-safety of the extended types only; does NOT prove any runtime navigation behavior, and passes on the net-new-errors basis (3 pre-existing BRN errors tolerated).
- `pnpm --filter @jojopotato/mobile test` (AC6/AC7): proves the route string is unchanged and the pure `isNestedTabRoute` helper classifies correctly; does NOT prove the bar actually hides/shows at runtime, that tap-reset pops the stack, or that checkout countdown-hide still works.
- Agent-Probe AC1–AC5: proves the observed on-screen behavior in one manual simulator session; provides NO automated regression protection (no Detox/Maestro/Playwright), so these behaviors can silently regress in future changes.

Gate: PASS (0 FAILs, 0 unresolved CONCERNs; all 4 cycle-1 CONCERNs — E1 helper extraction, E2 navigate-signature widening, E3 net-new-errors typecheck gate, E4 clearance blast-radius — verified closed in the plan body against real source this cycle; residual runtime dependency carried as a mandatory step-1 execute-agent instruction with contingency + safe default; no schema/auth/API surface)
Accepted by: session (autonomous, /goal execution) — cycle-2 PASS reached after 1 supplement cycle; no unresolved concerns remain to accept.

## Autonomous Goal Block

```
SESSION GOAL: Fix floating tab bar over-showing on nested screens + Active-Order nav trap (apps/mobile/src/components/floating-tab-bar.tsx)
Charter + umbrella plan: N/A — single standalone general plan
Autonomy: reversible single-file client nav change; auto-proceed on all edits per feedback_autonomous_phase_execution.md. No irreversible/outward-facing actions in scope.
Hard stop conditions / safety constraints:
- If EXECUTE step-1 gate shows `state.routes[i].state.index` is NOT reliably exposed at runtime → switch to contingency path (step 10), which widens blast radius to each tab `_layout.tsx`; re-run VALIDATE before proceeding.
- Do NOT change any route path string (AC6 pinned route must stay green).
- Do NOT touch `_layout.web.tsx`, the `deals` ICONS allowlist filter, or the `useHideTabBarWhile` external store contract.
Next phase: EXECUTE: process/general-plans/active/fix-tab-bar-visibility-nav-trap_15-07-26/fix-tab-bar-visibility-nav-trap_PLAN_15-07-26.md
Validate contract: inline in plan (## Validate Contract, gate PASS — cycle 2, supersedes cycle-1 CONDITIONAL)
Execute start: (1) resolve step-1 nested-state + reset-call confirmation; (2) E1 extract isNestedTabRoute to pure floating-tab-bar.helpers.ts; (3) E2 widen navigate signature + implement Fix A + Fix B; fully-auto: `pnpm --filter @jojopotato/mobile typecheck` (net-new-errors) + `pnpm --filter @jojopotato/mobile test`; agent-probe: 5-tab bar-visibility + nav walkthrough (AC1–AC5); high-risk pack: no
```
