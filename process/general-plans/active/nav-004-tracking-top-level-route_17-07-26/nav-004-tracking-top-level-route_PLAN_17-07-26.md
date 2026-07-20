---
name: plan:nav-004-tracking-top-level-route
description: "SIMPLE plan — NAV-004: move Order Tracking from the Order tab's stack to a top-level (tabs)/tracking/ route (mirroring NAV-002), hide the tab bar on focus, delete the now-obsolete stack-reset helper, and repoint the pinned push deep-link path."
date: 17-07-26
feature: none
---

# NAV-004 — Order Tracking as a top-level route — PLAN (SIMPLE)

**Date**: 17-07-26
**Status**: VALIDATED — awaiting EXECUTE approval (no source file touched)
**Complexity**: SIMPLE
**Branch**: `feat/nav-shell-screenheader` (open PR #110 — do NOT commit)
**Feature**: none (general-plans)

## Overview / Context

Order Tracking currently lives inside the Order tab's nested stack. Entering it from Home's
Active-Order banner and pressing back returns to Home (desired) but leaves Tracking **mounted inside
the Order tab** — so tapping the Order tab shows Tracking and the user is stuck. This is structural,
not a back-handler bug: while Tracking belongs to the Order tab's stack, "being on Tracking" *is*
"being in the Order tab", so returning to Home while it stays mounted leaves residue by definition.

The user has **locked the design**: move Tracking to a top-level `(tabs)/tracking/` route, mirroring
the NAV-002 Notifications fix which solved the identical defect class. This plan works out the
mechanics of that choice only — the alternatives (pop-to-Order-root; reset-on-exit) were presented and
rejected by the user and are not reconsidered here.

Scope is one package (`apps/mobile`), one route move with a shipped precedent, no new surface, and no
schema/auth/API/billing change — hence SIMPLE.

**TL;DR** — `git mv` Tracking to `(tabs)/tracking/[orderId].tsx`, add a `_layout.tsx` mirroring
`notifications/`, hide the tab bar via `useHideTabBarWhile(useIsFocused())`, delete the obsolete
`buildTrackingResetAction` machinery + its 9 tests (vitest 51→42, expected), keep a thin
signature-preserving `useNavigateToOrderTracking` wrapper (zero call-site edits), and repoint the
pinned deep-link path in `notification-factory.ts` + its test. **No clearance change** — the brief's
premise there was stale (see §Stale Premises). 8 files, `apps/mobile` only, no schema/auth/API.

**Complexity: SIMPLE.** One package, one mechanical route move with a proven precedent (NAV-002),
no new surface, no design ambiguity (user-locked).

SPEC: `./nav-004-tracking-top-level-route_SPEC_17-07-26.md`

---

## Stale Premises Found in the Task Brief (corrected, not worked around)

| Brief claim | Source truth (verified 17-07-26) |
|---|---|
| §7 — "the screen currently uses `resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom)`" | **False.** `(tabs)/order/tracking/[orderId].tsx` has **zero** `resolveTabBarClearance` calls. It uses `SafeAreaView edges={['top','bottom']}` (`:113`) + static `paddingBottom: Spacing.six` (`:143`). ⇒ **No clearance edit is needed at all.** With the bar hidden, `edges` supplies the inset exactly once and no footprint is reserved. `Spacing.six` is breathing room, documented at `:104-111` as not a double-count. |
| §3 — test at `.../lib/__tests__/notification-factory.test.ts` | Actual path: `apps/mobile/src/features/notifications/lib/notification-factory.test.ts` (no `__tests__/`). Line 78 is correct. |
| `all-tests.md` §Known Gaps — "root typecheck is RED" | **Stale/wrong.** Verified green this session (exit 0, zero errors), matching the NAV-002 report's resolution. The typecheck gate here is **absolute**, not a before/after diff. |

## Mechanism (verified against installed source — not docs, not memory)

- `(tabs)/_layout.ios.tsx` declares exactly **5** `Tabs.Screen`. Undeclared `(tabs)/` children
  auto-register as top-level routes.
- `floating-tab-bar.tsx:314` — `if (!(route.name in ICONS)) return null;` filters non-allowlisted
  routes from rendering a tab button. `deals` and `notifications` already depend on this.
- `floating-tab-bar.tsx:278` — `isFocusedTabNested = focusedTab != null && isNestedTabRoute(focusedTab)`.
  A top-level route **at its own stack root** ⇒ `false` ⇒ the bar would paint. `useHideTabBarWhile`
  (`:40`) is OR-composed with that check and is the correct seam.
- `backBehavior="history"` is already set on the native tab navigators (out of scope) — this is what
  makes `router.back()` from a tab-sibling return to the calling tab.

## Touchpoints

| # | File | Change |
|---|---|---|
| 1 | `apps/mobile/src/app/(tabs)/order/tracking/[orderId].tsx` | `git mv` → `(tabs)/tracking/[orderId].tsx` |
| 2 | `apps/mobile/src/app/(tabs)/tracking/_layout.tsx` | **NEW** — mirrors `notifications/_layout.tsx` |
| 3 | `apps/mobile/src/app/(tabs)/tracking/[orderId].tsx` | Add `useHideTabBarWhile(useIsFocused())` (all 3 branches share one hook at top) |
| 4 | `apps/mobile/src/app/(tabs)/order/_layout.tsx:30` | Remove the `tracking/[orderId]` `Stack.Screen` line |
| 5 | `apps/mobile/src/features/orders/lib/navigate-to-tracking.ts` | Rewrite as a thin `router.push` wrapper; drop `useNavigation`/helpers import |
| 6 | `apps/mobile/src/features/orders/lib/navigate-to-tracking.helpers.ts` | **DELETE** (obsolete) |
| 7 | `apps/mobile/src/features/orders/lib/__tests__/navigate-to-tracking.test.ts` | **DELETE** (tests deleted code) |
| 8 | `apps/mobile/src/features/notifications/lib/notification-factory.ts:75` | Repoint pinned path |
| 9 | `apps/mobile/src/features/notifications/lib/notification-factory.test.ts:78` | Repoint pinned assertion |

**Read-only (verify, expect no edit):** `(tabs)/index.tsx:37,123,195`; `(tabs)/order/history.tsx:12,32,85`;
`(tabs)/order/confirmation/[orderId].tsx:15,41,136` — all call `const f = useNavigateToOrderTracking(); f(order.id)`.
The wrapper's signature is unchanged ⇒ **zero edits expected**. If any edit turns out to be needed,
STOP and report — that means the signature drifted.

## Public Contracts

| Contract | Change | Consumer impact |
|---|---|---|
| Route path `/(tabs)/order/tracking/[orderId]` → `/(tabs)/tracking/[orderId]` | **BREAKING (intentional)** | Push deep links; typed-routes `Href` union |
| `useNavigateToOrderTracking(): (orderId: string) => void` | **Unchanged** (deliberately) | 3 call sites unaffected |
| `buildTrackingResetAction` / `TrackingResetAction` / `ORDER_TAB_NAME` / `ORDER_ROOT_SCREEN` / `ORDER_TRACKING_SCREEN` | **REMOVED** | Only consumers were the wrapper + the deleted test |
| `resolveTabBarClearance(isNested, footprint, insetsBottom)` | **UNCHANGED — frozen** | Do not touch signature or `isNested` param name |

### ⚠️ Deliberate pin break — user-visible consequence

`notification-factory.ts:75` returns `{ pathname: '/(tabs)/order/tracking/[orderId]', … }` and
`notification-factory.test.ts:78` locks that exact string. **This pin was an explicit NAV-001
regression guard.** Changing it here is **deliberate, not accidental** — the guard is doing its job by
forcing this to be a conscious decision.

**Consequence:** push-notification deep links move to the new path. **Already-delivered notifications
carrying the old path will no longer resolve.** Accepted: notification data is mock/local today
(`useNotifications()`), and no server-side notification currently embeds this pathname.

## Blast Radius

- **Packages:** `apps/mobile` only. `packages/ui` untouched (ui test count must stay **68**).
- **Files:** 7 modified/created, 2 deleted. ~9 total.
- **Risk class:** navigation/UX only. **No** schema, auth, API, billing, migration, or secret surface.
- **Not to touch:** `(tabs)/notifications/**`; `(tabs)/_layout.{ios,android,web}.tsx`;
  `floating-tab-bar.tsx` / `floating-tab-bar.helpers.ts` (frozen); `packages/ui/**`; `(staff)/**`,
  `(auth)/**`, `(onboarding)/**`; the 5 tab roots. No new dependencies. Web out of scope.

## Acceptance Criteria

Mirrors the SPEC (`./nav-004-tracking-top-level-route_SPEC_17-07-26.md`). Tier is the honest
provability tier, not an aspiration.

| AC | Criterion | Tier |
|---|---|---|
| AC1 | Back from Tracking returns to the calling screen (Home / Order History / Order Confirmation) | **Agent-Probe — unprovable by the execute agent** |
| AC2 | After returning, tapping the Order tab shows the Order tab's own screen — **never Tracking** | **Agent-Probe — unprovable by the execute agent** |
| AC3 | Tracking renders no tab button and no tab appears active while on it | **Agent-Probe** |
| AC4 | The floating tab bar is hidden on Tracking and restored after navigating away | **Agent-Probe** |
| AC5 | Behavior is identical from all 3 entry points | Hybrid — by construction (single wrapper) + source read |
| AC6 | Push deep-link `order_tracking` resolves to `/(tabs)/tracking/[orderId]` | Fully-automated (`notification-factory.test.ts`) |
| AC7 | Loading / error / loaded branches all keep `SafeAreaView edges={['top','bottom']}` + `ScreenHeader` | Fully-automated (typecheck) + source read |
| AC8 | No dead exported code, no orphaned tests, no stray reference to the old path | Fully-automated (lint + grep + test) |
| AC9 | Bottom device inset counted exactly once; no visual regression | Source-verified |

## Phase Completion Rules

This plan is **CODE DONE** when:

1. All 12 checklist steps are applied as written.
2. Every Fully-automated gate in §Verification Evidence is green with **real reported numbers**:
   typecheck **0 errors**, vitest **42**, jest **27**, ui **68**, lint **0 errors**, grep-zero, and
   `git status` showing Touchpoint 1 as a rename.
3. An EXECUTE report is written to this task folder documenting any deviation from the checklist.
4. Nothing is committed (E3).

This plan is **VERIFIED** — and only then eligible for archival to `completed/` — when:

5. The **user** performs the on-device Agent-Probe walkthrough and confirms **AC1, AC2, AC3, AC4**.

**The execute agent MUST NOT self-declare VERIFIED.** AC1/AC2 are the actual bug; no automated gate
in this repo can prove them (no RN navigation E2E runner exists). The correct exit is **CODE DONE,
not VERIFIED**, with the plan left in `active/` pending the user's walkthrough.

## Implementation Checklist

1. **Move the route.** `git mv "apps/mobile/src/app/(tabs)/order/tracking/[orderId].tsx" "apps/mobile/src/app/(tabs)/tracking/[orderId].tsx"` (mkdir the target dir first if git requires it). Verify with `git status` that it registers as a rename, not delete+add. Remove the now-empty `order/tracking/` dir.
2. **Add `(tabs)/tracking/_layout.tsx`** — `<Stack screenOptions={{ headerShown: false }} />`, with a doc comment mirroring `notifications/_layout.tsx`: not a tab (not in any `Tabs.Screen` list; filtered from `FloatingTabBar` by the `ICONS` allowlist); lives here so back returns to the CALLING tab (the NAV-004 fix); `headerShown:false` because the screen renders the shared in-content `<ScreenHeader>` and owns its own top inset.
3. **`order/_layout.tsx`** — delete line 30 (`<Stack.Screen name="tracking/[orderId]" … />`). Leave every other line alone.
4. **`tracking/[orderId].tsx` — hide the tab bar.** Add imports `useIsFocused` (from `expo-router`), `useHideTabBarWhile` (from `@/components/floating-tab-bar`). Call `useHideTabBarWhile(useIsFocused());` once near the top of the component, **above** the loading/error early returns (hooks must run on every render path). Comment it, mirroring `notifications/index.tsx`: the bar would otherwise paint because `isNestedTabRoute()` is false at a top-level stack root; `useIsFocused()` gating is **load-bearing** — a constant `true` leaves the bar hidden on the destination after navigating away, since the screen stays mounted.
5. **Do NOT change clearance.** No `resolveTabBarClearance` call exists here. Leave `SafeAreaView edges={['top','bottom']}` (`:113`, `:74`, `:85`) and `paddingBottom: Spacing.six` (`:143`) exactly as-is — the inset arrives exactly once. Update the `:104-111` comment only to reflect that the tab bar is now explicitly hidden here (a top-level route), not implicitly absent.
6. **Preserve all 3 branches.** Loading (`:71-80`), error (`:82-96`), loaded (`:101-136`) each keep their `SafeAreaView edges={['top','bottom']}` + `<ScreenHeader title="Order Tracking" onBack={() => router.back()} mode={mode} />`. Do not collapse or restructure them.
7. **Rewrite `navigate-to-tracking.ts`** as a thin wrapper (Option B — see SPEC/Decision):
   - Drop the `useNavigation` import, the `NestedTabNavigate` interface, and the `./navigate-to-tracking.helpers` import.
   - Export a single path constant and `useNavigateToOrderTracking(): (orderId: string) => void`, whose body is `router.push({ pathname: '/(tabs)/tracking/[orderId]', params: { orderId } })` inside a `useCallback`.
   - **Signature must not change** — 3 call sites depend on it.
   - Rewrite the doc comment: keep the "this is the ONLY approved way to navigate into Tracking / do not re-add a direct push at any call site" rule (it preserves SPEC AC5 by construction and keeps one place to change the path), and **replace** the NAV-001 reset/2-step-navigate mechanism narrative — it is obsolete. State the new reason: Tracking is a top-level route, so a plain push is correct and no stack reset exists to perform.
8. **Delete `navigate-to-tracking.helpers.ts`** and **`__tests__/navigate-to-tracking.test.ts`** (`git rm`). Leave no dead exports and no orphaned tests.
9. **Repoint the pinned path** — `notification-factory.ts:75` → `'/(tabs)/tracking/[orderId]'`; `notification-factory.test.ts:78` → the same string. Change nothing else in either file.
10. **Verify call sites** — read all 3; confirm zero edits needed. If an edit is needed, STOP and report.
11. **Grep-zero** — `grep -rn "order/tracking" apps/mobile/src` must return **only** `floating-tab-bar.tsx:334` (a frozen historical comment, out of scope — do not edit). Any other hit is unfinished work.
12. **Regenerate typed routes** — run `expo start`, wait for the route tree, stop it. Then run the gates. **Never `as Href`-cast to force a green typecheck** — a cast here would hide a real broken route.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/mobile typecheck` → exit 0, **zero** errors (absolute gate; baseline verified green) | Fully-Automated | AC7 (all branches compile), AC8 (no dangling refs), route path valid in the typed-routes union |
| `pnpm --filter @jojopotato/mobile test` → vitest **42** (51 − 9 deleted), jest **27** | Fully-Automated | AC6 (deep link resolves to new path), AC8 (no orphaned tests) |
| `pnpm --filter @jojopotato/ui test` → **68** (unchanged) | Fully-Automated | Blast radius contained — `packages/ui` untouched |
| `pnpm --filter @jojopotato/mobile lint` → 0 errors | Fully-Automated | No unused imports/dead code after the helper deletion |
| `grep -rn "order/tracking" apps/mobile/src` → only `floating-tab-bar.tsx:334` | Fully-Automated | AC8 |
| `git status` shows Touchpoint 1 as a **rename** | Fully-Automated | History preserved |
| Prettier on touched files only, LF-normalized | Fully-Automated | Format hygiene |
| Source read of all 3 branches + all 3 call sites | Hybrid (source-verified) | AC5, AC7, AC9 |
| **Back from Tracking returns to the caller** | **Agent-Probe — CANNOT be proven by this agent** | **AC1** |
| **Order tab is not stuck on Tracking afterwards** | **Agent-Probe — CANNOT be proven by this agent** | **AC2** |
| Tracking shows no tab button / no active tab | **Agent-Probe** | AC3 |
| Tab bar hidden on Tracking, restored after leaving | **Agent-Probe** | AC4 |

### Honest testing tiers

`apps/mobile` **has** a jest/jest-expo component runner and a vitest node-env runner. What does **not**
exist is an **E2E / navigation runner** or visual-regression tooling (project-wide gap — see
`process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`).

**The actual fix — back returns to the caller AND the Order tab is no longer stuck — is Agent-Probe
only. I cannot prove it.** Every automated gate above proves the code compiles, the deep link points
at the right path, and nothing regressed. None of them proves the bug is fixed.

**Honest exit condition: CODE DONE, not VERIFIED.** The plan stays in `active/` pending the user's
on-device walkthrough of AC1–AC4.

#### Expected vitest count drop (not a regression)

Baseline vitest is **51**, including **9** `buildTrackingResetAction` cases. Those 9 test a pure
builder describing a stack reset that **no longer exists** — a top-level route needs no reset. Deleting
the code without deleting its tests would leave orphaned tests; deleting both is correct. **Expected
post-change: 42.** A count of 51 after this change means the deletion did not happen; a count below
42 means something else broke.

## Test Infra Improvement Notes

The recurring root cause across NAV-001→004 is the same: **no RN navigation E2E runner**, so every
navigation fix in this series exits CODE DONE and relies on a manual walkthrough. NAV-004 is the
fourth consecutive plan to hit it. A Maestro/Detox harness covering "enter screen → back → assert
tab state" would convert AC1–AC4 here (and the equivalents in NAV-001/002/003) from Agent-Probe to
Fully-Automated. Backlog note already exists; this plan adds a fourth data point rather than a new note.

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/nav-004-tracking-top-level-route_17-07-26/nav-004-tracking-top-level-route_PLAN_17-07-26.md`
2. **Last completed step:** VALIDATE complete — validate-contract written below. EXECUTE not started; no source file touched.
3. **Validate-contract status:** written (2026-07-17, `generated-by: outer-pvl`).
4. **Supporting context loaded:** `process/context/all-context.md`; `process/context/tests/all-tests.md` (its §Known Gaps typecheck-RED claim is **stale** — verified green); `(tabs)/notifications/{_layout,index}.tsx` (the template); `process/general-plans/active/nav-002-notifications-route_17-07-26/` (PLAN + REPORT); `process/general-plans/active/nav-001-tab-clearance-back-stack_17-07-26/` (its `reset()` VIABLE verdict was **REFUTED** by EXECUTE — `useNavigation(parent)` walks ancestors only; **do not resurrect the reset path**).
5. **Next step for a fresh agent:** start at Checklist step 1. Stay on `feat/nav-shell-screenheader` (open PR #110). **Do not commit.** Run step 12 (codegen) before any typecheck. Expect vitest **42**, jest **27**, ui **68**, typecheck **0 errors**. Exit **CODE DONE, not VERIFIED**; leave the plan in `active/`.

---

## Validate Contract

```yaml
generated-by: outer-pvl
date: 2026-07-17
plan: process/general-plans/active/nav-004-tracking-top-level-route_17-07-26/nav-004-tracking-top-level-route_PLAN_17-07-26.md
gate: PASS
risk-class: none (navigation/UX only — no auth/schema/API/billing/secret surface)
blast-radius: apps/mobile (7 modified/created, 2 deleted)
```

**Gate: PASS**

### Dimension results

| Layer 1 dimension | Status | Note |
|---|---|---|
| Infra fit | PASS | Top-level-route mechanism verified in installed source (`_layout.ios.tsx` 5 tabs; `floating-tab-bar.tsx:314` ICONS filter; `:278` isNestedTabRoute). Precedent shipped in NAV-002. |
| Test coverage | PASS | Runners real and named. Automated gates cover AC5–AC8. AC1–AC4 correctly declared Agent-Probe, not fabricated as automated. |
| Breaking changes | PASS | One intentional break (pinned deep-link path), consumers enumerated, consequence documented and accepted. Wrapper signature preserved ⇒ 3 call sites safe. |
| Security surface | PASS | No auth/secret/trust boundary touched. |

| Layer 2 section | Status | Note |
|---|---|---|
| Route move + `_layout` (steps 1–3) | PASS | Edit targets uniquely matchable; `order/_layout.tsx:30` verified exact. |
| Tab-bar visibility (step 4) | PASS | Hook placement above early returns is called out — correct Rules-of-Hooks handling. |
| Clearance (step 5) | PASS | Brief premise refuted from source; no-op is the correct action. Frozen helper untouched. |
| Helper deletion + wrapper (steps 7–8) | PASS | No dead exports; test deletion justified; expected count drop pre-declared. |
| Pinned path (step 9) | PASS | Both sites named with exact lines; break is deliberate. |

**Totals: 0 FAILs / 0 CONCERNs / 9 PASSes → Net Gate: PASS**

### Test gates (run in this order)

```bash
# 0. Typed-routes codegen FIRST — the route path changes.
#    Run `expo start` in apps/mobile, wait for the route tree, then stop it.
pnpm --filter @jojopotato/mobile typecheck   # exit 0, ZERO errors — absolute gate
pnpm --filter @jojopotato/mobile test        # vitest 42 (51-9, expected), jest 27
pnpm --filter @jojopotato/ui test            # 68 — must be unchanged
pnpm --filter @jojopotato/mobile lint        # 0 errors (3 pre-existing warnings in scripts/dev-with-tunnel.mjs are NOT ours)
grep -rn "order/tracking" apps/mobile/src    # only floating-tab-bar.tsx:334 (frozen comment)
git status                                   # Touchpoint 1 must show as a RENAME
```

Prettier: touched files **only**, LF-normalized. Repo-wide `format:check` is structurally RED
(~138 files, pre-existing CRLF) — **not ours, do not fix**.

### Execute-agent instructions

| # | Instruction | Trigger |
|---|---|---|
| E1 | Run the typed-routes codegen (`expo start`, then stop) **before** any `tsc --noEmit`. **Never `as Href`-cast** to force green — a cast hides a genuinely broken route. | Before gates |
| E2 | Use `git mv` (step 1) and confirm `git status` shows a rename. | Step 1 |
| E3 | **Do NOT commit.** Stay on `feat/nav-shell-screenheader` (open PR #110). | Throughout |
| E4 | Do not touch `floating-tab-bar.tsx` / `.helpers.ts` — including `resolveTabBarClearance`'s signature and its `isNested` param name. `floating-tab-bar.tsx:334`'s stale comment is out of scope. | Steps 5, 11 |
| E5 | vitest dropping 51→42 is **expected and correct**. Do not re-add the deleted tests to restore the count. State the new number and why in the report. | Gate run |
| E6 | `all-tests.md` §Known Gaps claims root typecheck is RED — **stale**. Verify by running; the gate is absolute (0 errors), not a before/after diff. | Gate run |
| E7 | If any of the 3 call sites needs an edit, the wrapper signature drifted — **STOP and report**, do not silently patch. | Step 10 |
| E8 | Exit **CODE DONE, not VERIFIED**. AC1–AC4 are Agent-Probe; do not claim them. Leave the plan in `active/`. | Exit |

### Known gaps (accepted)

1. **AC1–AC4 unprovable** — no RN navigation E2E runner (project-wide gap). The actual fix is
   Agent-Probe only.
2. **Old-path push deep links break** — accepted; notification data is mock/local today.
3. **`floating-tab-bar.tsx:334`** retains a comment referencing the old `order/tracking` path. Frozen
   file, out of scope; cosmetic only.
