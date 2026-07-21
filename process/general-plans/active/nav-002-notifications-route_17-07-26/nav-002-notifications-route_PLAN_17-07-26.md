---
name: plan:nav-002-notifications-route
description: "PLAN — NAV-002: move the Notifications screen out of the Account tab's stack to a top-level (tabs)/notifications/ route so back returns to the caller (Home stays Home). apps/mobile only, SIMPLE."
date: 17-07-26
feature: none
---

# NAV-002 — Notifications cross-tab navigation fix — PLAN

**TL;DR** — Notifications physically lives inside the Account tab's stack, so opening it from Home focuses the Account tab and back strands the user there. Move the screen to its own top-level `(tabs)/notifications/` stack (mirroring the existing `deals/` precedent), give it a header with an explicit `router.back()` affordance, flip its clearance from nested to root, and repoint both push call sites. 5 files, `apps/mobile` only, no shared/API surface.

Date: 17-07-26
Status: DRAFT -- awaiting EXECUTE approval (VALIDATE complete)
Complexity: SIMPLE

## Overview

The Notifications screen physically lives inside the Account tab's stack, so opening it from the
Home bell is a cross-tab push: Account gets focused, its root flashes underneath, and back strands
the user on Account. This plan moves the screen to its own top-level `(tabs)/notifications/` route —
the same shape the existing `deals/` stack already uses — so back returns to whichever tab the user
came from. Scope is `apps/mobile` only: 5 files, no new dependencies, no schema/auth/API/billing
surface, web out of scope. Full rationale and evidence in Locked Inputs and Decision below.

- **Feature:** none (general-plans)
- **Branch:** `development` — no commit, no branch creation in this plan's scope.

---

## Problem

Tapping the Home bell (`home-header.tsx:44` → `router.push('/(tabs)/account/notifications')`) is a CROSS-TAB push: it focuses the Account tab and sets its stack to `[index, notifications]`. The Account root paints underneath (the visible flash), and back pops to Account — the wrong tab.

Same structural defect family as NAV-001 (issue #96), **different desired outcome**: NAV-001 wanted back to land on a fixed root (Order). Here the user wants back to return to the **caller** (Home if opened from Home, Account if opened from Account). NAV-001's `navigate`-reset pattern would reliably land back on Account — explicitly NOT what was asked. Do not reuse it here.

---

## Locked Inputs (verified this session — re-verify before editing)

| Fact | Evidence |
|---|---|
| Only 3 references to `account/notifications` exist | `grep -rn "account/notifications" apps/mobile/src` → `account/index.tsx:81` (push), `home-header.tsx:44` (push), `account/notifications.tsx:86` (a code comment) |
| `notification-factory.ts` route pin is UNAFFECTED | `TYPE_TARGET` is `Record<NotificationType, NotificationTargetScreen>` resolving only to `order_tracking \| deal_details \| coupon_wallet \| rewards`; `resolveRoute` returns only `/(tabs)/order/tracking/[orderId]`, `/(tabs)/deals/deal/[dealId]`, `/(tabs)/rewards/coupons`, `/(tabs)/rewards`. **No notifications target exists** → `notification-factory.test.ts`'s pinned paths are untouched. |
| No test file references the notifications route | `grep -rn "notifications" apps/mobile/src --include=*.test.ts* -l` → empty |
| `deals/` is the in-repo top-level-route precedent | `app/(tabs)/deals/_layout.tsx` = a `Stack` with `screenOptions={{headerShown:true}}`, `index` overridden to `headerShown:false`, detail gets the native header. Not declared in `_layout.ios.tsx`/`.android.tsx` → auto-appended to `state.routes` as a top-level route. |
| `FloatingTabBar` filters non-tab routes by allowlist | `floating-tab-bar.tsx:305` `if (!(route.name in ICONS)) return null;` — `ICONS` keys are exactly `index, order, rewards, branches, account`. A `notifications` route renders **no** tab button. |
| Tab bar VISIBILITY flips at a top-level route root | `floating-tab-bar.tsx:277-279`: `isHidden = hidden \|\| isNestedTabRoute(state.routes[state.index])`. At `/(tabs)/notifications` (its own stack index 0) → `isNestedTabRoute` is **false** → **bar VISIBLE**. Confirmed by `deals/index.tsx:47`, which correspondingly uses root-style clearance. |
| The Account stack currently supplies the header | `account/_layout.tsx:9` `<Stack.Screen name="notifications" options={{title:'Notifications'}} />`. Moving out LOSES this — the Tabs navigator sets `headerShown:false`. |
| A top-level stack root gets NO free back button | React Navigation renders a header back button only for a screen at index > 0 **within its own stack**. `notifications/index` is at index 0 of its stack → an explicit `headerLeft` is REQUIRED. (`deals/index` sidesteps this by being headerless + relying on the tab bar; Notifications must not, per SPEC AC2.) |
| `resolveTabBarClearance(false, footprint, inset)` === `getFloatingTabBarClearance(inset)` | `floating-tab-bar.helpers.ts:51-57` → `isNested ? insetsBottom : footprint + insetsBottom`. Use the `resolveTabBarClearance` form — NAV-001 marked `getFloatingTabBarClearance` legacy (`floating-tab-bar.tsx:173`). |

### Uncommitted-work guard (CRITICAL)

`app/(tabs)/account/notifications.tsx` is **modified and uncommitted** by NAV-001 this session (`git status --short` confirms). Its NAV-001 content that MUST be carried into the moved file, not clobbered:

- imports of `TAB_BAR_FOOTPRINT` (`@/components/floating-tab-bar`) and `resolveTabBarClearance` (`@/components/floating-tab-bar.helpers`)
- the clearance call at `:90-91` and the explanatory comment at `:86-89`
- `SafeAreaView edges={['bottom']}` at `:80` + the note at `:75-79`

**NAV-001's intent = the device safe-area inset is always present on this screen.** This plan preserves that intent while adapting to the new structural truth (the screen is no longer nested), which necessarily changes the `isNested` argument from `true` → `false`.

### The double-count, stated plainly

NAV-001 has a **known, accepted, still-open** defect on this file: the bottom inset is counted twice (`SafeAreaView edges={['bottom']}` **and** `resolveTabBarClearance(true, …)`, which returns `insets.bottom`). Wastes ~34dp; safe (additive-only).

- **This plan does NOT fix that defect** and does not touch it on the other NAV-001 files (`order/cart.tsx`, `order/checkout.tsx`, `branches/[branchId].tsx`, `deals/deal/[dealId].tsx`, `add-to-cart-bar.tsx`). It remains a separate pending user decision.
- On **this one file only**, the double-count disappears as an unavoidable **side effect** of the restructure, not as a scope expansion: once the screen is top-level, clearance becomes `resolveTabBarClearance(false, TAB_BAR_FOOTPRINT, insets.bottom)` = `TAB_BAR_FOOTPRINT + insets.bottom`, which already contains the inset exactly once. Keeping `SafeAreaView edges={['bottom']}` on top would count it a **third** time. So the `SafeAreaView` is replaced by a plain `View` (same styles), and the inset arrives once, via the clearance call. NAV-001's intent (inset always present) is preserved.
- **Resulting math, explicitly:** `paddingBottom = TAB_BAR_FOOTPRINT + insets.bottom + Spacing.four`. Identical in form to `deals/index.tsx:47` (`getFloatingTabBarClearance(insets.bottom)`), which is the correct root-screen precedent. Was previously `insets.bottom + insets.bottom + Spacing.four`.

---

## Decision (from INNOVATE)

**Chosen: move to a top-level `(tabs)/notifications/` stack (deals mirror).**

Back works because pushing a *tab-sibling* route adds an entry to the Tabs navigator's own history — `router.back()` / Android hardware back pops that entry and restores the **previously focused tab**, i.e. the caller. No reset action, no per-caller branching, no duplicated screen.

| Alternative | Why rejected |
|---|---|
| Keep in `account/`, add a NAV-001-style `useNavigateToNotifications` reset hook | Reset lands back on a **fixed** root (Account). The requirement is "return to the caller". Wrong outcome by construction. |
| Keep in `account/`, pass a `from` param and branch on it in a custom back handler | Reimplements navigation history by hand; every new caller must remember to pass `from`; the Account-root flash still happens on the way in. |
| Duplicate the screen into each tab's stack | 5× duplication of one screen + its state. Violates DRY and the shared-component convention. |

**Risk predictions (vc-predict brief):**
- *Architect:* Adding a 2nd non-tab top-level route makes "undeclared child of `(tabs)/` = top-level route" load-bearing implicit knowledge. Mitigation: a doc comment in `notifications/_layout.tsx` mirroring `deals/_layout.tsx`'s.
- *Integrator:* A stale push path = a broken route at runtime, invisible to `tsc` if typed-routes codegen is stale. Mitigation: both call sites updated in the same step + typed-route regeneration gate (Step 5).
- *Tester:* The actual outcome (back → caller) is Agent-Probe only. No RN navigation runner exists. Mitigation: stated honestly, not claimed as automated.
- *UX:* Tab bar becomes visible on Notifications where it previously was not. Mitigation: **deliberate decision — accepted**; matches `deals/index` (the only other top-level route) and gives the user a second, tap-a-tab exit. No tab renders as active (allowlist filter), same as today's deals behavior.
- *Reviewer:* Touching an uncommitted NAV-001 file risks silently reverting it. Mitigation: the guard section above + Step 2's explicit carry-over list.

**Constraints accepted:** tab bar visible on Notifications; no automated proof of the back behavior; the NAV-001 double-count survives on all other files.

---

## Acceptance Criteria

| # | Criterion | Tier |
|---|---|---|
| AC1 | Opening Notifications from Home and pressing back (header chevron OR Android hardware back) returns to **Home** — not Account — with no Account-root flash on the way in. Opening it from Account and pressing back returns to **Account**. Back returns to the CALLER. | Agent-Probe |
| AC2 | The Notifications screen has a header showing the title "Notifications" and a working back affordance. | Agent-Probe |
| AC3 | `/(tabs)/notifications` exists as a resolvable typed route; the screen renders its list, marketing toggle, and empty state exactly as before the move. | Fully-Automated (typed route) + Agent-Probe (render) |
| AC4 | Zero references to the old `account/notifications` path remain anywhere in `apps/mobile/src`. Both push call sites point at the new path. | Fully-Automated |
| AC5 | No regressions: lint clean, `apps/mobile` tests ≥ baseline (vitest 51 + jest 27), `packages/ui` tests ≥ baseline (62), Prettier clean on touched files, and no NEW typecheck errors versus the pre-edit baseline. | Fully-Automated |
| AC6 | The floating tab bar is VISIBLE on Notifications (accepted, deliberate — matches `deals/index`), renders no 6th tab button, and shows no tab as active. | Agent-Probe |
| AC7 | Bottom-most content clears both the floating bar and the home indicator, with no excessive gap. Clearance = `TAB_BAR_FOOTPRINT + insets.bottom + Spacing.four`, inset counted exactly once. | Agent-Probe |
| AC8 | Tapping a notification row still marks it read and navigates to its target screen (order tracking / deal details / rewards / coupons) — `resolveRoute` behavior unchanged. | Agent-Probe |
| AC9 | NAV-001's uncommitted changes to the moved file are carried forward, not reverted: the `resolveTabBarClearance` + `TAB_BAR_FOOTPRINT` usage survives (with `isNested` correctly flipped to `false`) and the device inset is still present. | Fully-Automated (grep/diff review) |

## Touchpoints

| # | File | Action |
|---|---|---|
| 1 | `apps/mobile/src/app/(tabs)/notifications/_layout.tsx` | **CREATE** — Stack, header + explicit back |
| 2 | `apps/mobile/src/app/(tabs)/account/notifications.tsx` → `apps/mobile/src/app/(tabs)/notifications/index.tsx` | **MOVE + EDIT** (carry NAV-001's uncommitted work) |
| 3 | `apps/mobile/src/app/(tabs)/account/_layout.tsx:9` | **EDIT** — drop the `notifications` `Stack.Screen` |
| 4 | `apps/mobile/src/app/(tabs)/account/index.tsx:81` | **EDIT** — repoint push path |
| 5 | `apps/mobile/src/features/home/components/home-header.tsx:44` | **EDIT** — repoint push path |

Read-only for context: `app/(tabs)/deals/_layout.tsx`, `app/(tabs)/deals/index.tsx`, `app/(tabs)/_layout.ios.tsx`, `components/floating-tab-bar.tsx`, `components/floating-tab-bar.helpers.ts`.

## Public Contracts

- **Route path changes** `/(tabs)/account/notifications` → `/(tabs)/notifications`. Internal to `apps/mobile`; no deep link, no API, no shared package consumes it.
- `floating-tab-bar.helpers.ts` — **unchanged** (stays zero-RN-import; only called differently).
- `packages/*` — **zero changes**. No schema/auth/API/billing surface. No new dependencies.

## Blast Radius

5 files, 1 package (`apps/mobile`), UI/navigation only. **Risk class: LOW** — no high-risk class touched. Web (`_layout.web.tsx`) out of scope. Reversible by moving one file back.

---

## Implementation Checklist

### Step 1 — Create `app/(tabs)/notifications/_layout.tsx`

Mirror `deals/_layout.tsx`'s shape and doc-comment style. The root screen **needs an explicit `headerLeft`** — it sits at index 0 of its own stack, so no back button is rendered for free.

- `<Stack>` with `<Stack.Screen name="index" options={{ title: 'Notifications', headerLeft: … }} />`.
- `headerLeft` renders an `Ionicons` chevron in a `Pressable` with `accessibilityRole="button"`, `accessibilityLabel="Back"`, `hitSlop`, calling `router.back()`.
  - Rationale for a local affordance rather than a `@jojopotato/ui` export: this is navigator chrome consumed by React Navigation's `headerLeft` render prop, not reusable business UI. No existing `@jojopotato/ui` export covers it (checked `packages/ui/src/index.ts`). Re-verify at EXECUTE; if a suitable export exists, use it.
- Doc comment must state: reached via `router.push('/(tabs)/notifications')`; NOT a tab (absent from every `_layout.{ios,android,web}.tsx` `Tabs` list, hidden from `FloatingTabBar` by its `ICONS` allowlist); back returns to the calling tab via root nav history.

### Step 2 — Move the screen to `app/(tabs)/notifications/index.tsx`

Use `git mv` so history follows. Then edit — **carrying NAV-001's uncommitted changes, not reverting them**:

- 2.1 Keep the `TAB_BAR_FOOTPRINT` + `resolveTabBarClearance` imports (NAV-001).
- 2.2 Flip the clearance branch to the new structural truth:
  `resolveTabBarClearance(false, TAB_BAR_FOOTPRINT, insets.bottom) + Spacing.four`.
- 2.3 Rewrite the `:86-89` comment. It currently asserts `isNested` is true because the screen "is always pushed inside the Account tab's Stack" — **now false**. New comment: the screen is the ROOT of its own top-level `notifications` stack, so `isNestedTabRoute()` evaluates false for it and the floating bar is VISIBLE here (same as `deals/index`); `false` is hardcoded per NAV-001's static-per-screen-fact convention.
- 2.4 Replace `<SafeAreaView style={styles.safeArea} edges={['bottom']}>` with `<View style={styles.safeArea}>` (styles unchanged) and drop the now-unused `SafeAreaView` import; keep `useSafeAreaInsets`. Rewrite the `:75-79` note to state: bottom inset arrives exactly once via `resolveTabBarClearance(false, …)`; top inset is unnecessary because the stack header covers it. Cross-reference `deals/index.tsx`.
- 2.5 Everything else (`TYPE_ICON`, `formatRelativeTime`, `onPressItem`, `onToggleMarketing`, JSX body, `styles`) moves **verbatim**. Update the screen's top doc comment's stale "Notifications screen (push-notifications-ui)" location wording only if it names the old path.
- 2.6 Do **not** touch `resolveRoute`/`notification-factory` — verified unaffected (Locked Inputs).

### Step 3 — `app/(tabs)/account/_layout.tsx`

Delete line 9 (`<Stack.Screen name="notifications" options={{ title: 'Notifications' }} />`). Leave `index`, `edit-profile`, `help` untouched.

### Step 4 — Repoint both push call sites (same step — a stale path is a broken route)

- 4.1 `app/(tabs)/account/index.tsx:81` → `router.push('/(tabs)/notifications')`
- 4.2 `features/home/components/home-header.tsx:44` → `router.push('/(tabs)/notifications')`
- 4.3 Gate: `grep -rn "account/notifications" apps/mobile/src` returns **zero** hits.

### Step 5 — Typed-routes regeneration (documented repo gotcha)

`experiments.typedRoutes: true` means `/(tabs)/notifications` does not exist as a typed `Href` until `.expo/types/router.d.ts` regenerates; codegen does **not** run on `tsc --noEmit` alone (`all-context.md` §Navigation shell pattern).

- Run `pnpm --filter @jojopotato/mobile start` once, wait for the router types to be written, then stop it. **Then** run typecheck.
- If typecheck still reports an unresolved href for the new route, that is stale codegen — re-run the above; do **not** cast to silence it.

### Step 6 — Gates (Verification Evidence table below)

Run in order; all must be green before reporting done.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/mobile typecheck` — clean **for the touched files**; new `/(tabs)/notifications` href resolves | Fully-Automated | AC3 (route exists & is typed), AC4 (no stale path) |
| `grep -rn "account/notifications" apps/mobile/src` → 0 hits | Fully-Automated | AC4 |
| `pnpm --filter @jojopotato/mobile lint` | Fully-Automated | AC5 (no unused `SafeAreaView` import etc.) |
| `pnpm --filter @jojopotato/mobile test` (vitest 51 + jest 27 baseline, expect ≥ baseline, 0 failures) | Fully-Automated | AC5 (no regression) |
| `pnpm --filter @jojopotato/ui test` (jest, 62 baseline) | Fully-Automated | AC5 (no regression) |
| `pnpm format:check` on touched files | Fully-Automated | AC5 |
| Open Notifications from **Home** bell → press back → land on **Home**, no Account flash | **Agent-Probe** | **AC1 (the actual bug)** |
| Open Notifications from **Account** row → press back → land on **Account** | Agent-Probe | AC1 |
| Android hardware back from Notifications → returns to caller | Agent-Probe | AC1 |
| Notifications header shows title + working back chevron | Agent-Probe | AC2 |
| Floating tab bar visible on Notifications; no 6th tab button; no tab shown active | Agent-Probe | AC6 (accepted decision) |
| Bottom-most list row clears the bar + home indicator; no excess gap | Agent-Probe | AC7 (clearance math) |
| Tapping a notification row still navigates to its target (order tracking / deal / rewards) | Agent-Probe | AC8 (no `resolveRoute` regression) |

**Honest test reality:** the primary fix — back returns to the caller — is **Agent-Probe only**. There is no RN navigation/E2E runner (project-wide gap: `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`). Automated gates prove the route compiles, no path is stale, and nothing regressed — they do **not** prove the fix works.

### Pre-existing red, do NOT treat as this plan's regression

Root `pnpm typecheck` is RED on `apps/mobile` (pre-existing typed-route errors in staff order-detail / deals routes; `all-tests.md` §Known Gaps; also noted in STAFF-003 for `@gorhom/bottom-sheet` / `expo-maps` / `expo-location` stubs). Judge the typecheck gate on **the touched files only** — capture the error list before and after and diff it.

## Phase Completion Rules

- **CODE DONE:** Steps 1–5 complete and every Fully-Automated gate green (typecheck diff clean on
  touched files, lint, `apps/mobile` tests, `packages/ui` tests, `format:check`, grep-zero) — i.e.
  AC3 (typed route), AC4, AC5, AC9 satisfied.
- **VERIFIED:** CODE DONE **AND** every Agent-Probe row in Verification Evidence walked through on a
  real device/simulator and explicitly confirmed by the user — AC1, AC2, AC6, AC7, AC8.
- **Do not mark this plan VERIFIED on automated gates alone.** The primary bug being fixed (AC1) has
  no automated gate at all; automated gates only prove the route compiles and nothing regressed.
- Until Agent-Probe confirmation happens, the honest state is **CODE DONE, not VERIFIED** — keep the
  plan in `active/`, do not archive to `completed/`.
- This plan does not commit. Committing is a separate, explicit user request.

## Test Infra Improvement Notes

- The `isNested` value is a hand-maintained per-screen literal that must be kept in sync with each screen's structural position. This plan is the second time it has had to be reasoned about manually. A future note: derive it from `isNestedTabRoute` at runtime, or add a lint rule / unit-testable route-classification map. **Not in scope here** — recorded for backlog.
- A navigation-level E2E runner (Detox/Maestro) would have made AC1 a real gate. Existing backlog note above; nothing new to file.

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/nav-002-notifications-route_17-07-26/nav-002-notifications-route_PLAN_17-07-26.md`
2. **Last completed step:** VALIDATE — contract written. Awaiting explicit `ENTER EXECUTE MODE`.
3. **Validate-contract status:** written (see below), `Gate: CONDITIONAL`.
4. **Context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, NAV-001 task folder (`process/general-plans/active/nav-001-tab-clearance-back-stack_17-07-26/` — read-only), `deals/_layout.tsx`, `deals/index.tsx`, `_layout.ios.tsx`, `account/_layout.tsx`, `account/notifications.tsx`, `home-header.tsx`, `floating-tab-bar.tsx`, `floating-tab-bar.helpers.ts`, `notification-factory.ts`.
5. **Next step for a fresh agent:** re-run the Locked-Inputs greps (line numbers drift), confirm `account/notifications.tsx` is still uncommitted with NAV-001's changes intact, then execute Steps 1→6 in order. Do **not** commit. Do **not** touch NAV-001's other files or its double-count.

---

## Validate Contract

```yaml
generated-by: outer-pvl
date: 2026-07-17
plan: process/general-plans/active/nav-002-notifications-route_17-07-26/nav-002-notifications-route_PLAN_17-07-26.md
gate: CONDITIONAL
mode: simple
```

**Gate: CONDITIONAL** — 0 FAILs, 2 CONCERNs, both accepted with mitigations recorded in-plan.

### Layer 1 dimensions

| Dimension | Status |
|---|---|
| Infra fit | PASS — `deals/` proves the top-level-route mechanism in this exact repo/expo-router version; `FloatingTabBar`'s `ICONS` allowlist already filters non-tab routes. |
| Test coverage | CONCERN — the primary AC is Agent-Probe only (no RN navigation runner). Accepted: pre-existing project-wide gap, honestly declared, not introduced here. |
| Breaking changes | PASS — route path is `apps/mobile`-internal; all 3 references enumerated; `notification-factory`'s `TYPE_TARGET` has no notifications target, so the pinned-route test is unaffected. |
| Security surface | PASS — no auth/schema/API/billing/secrets/trust-boundary. UI navigation only. |

### Layer 2 sections

| Section | Status |
|---|---|
| Step 1 — create `notifications/_layout.tsx` | CONCERN — a top-level stack root gets **no free back button**; the `headerLeft` is load-bearing for AC2. Covered explicitly in Step 1; if the chevron is omitted the screen has no back affordance at all. |
| Step 2 — move + edit screen | PASS — edit targets uniquely matchable; NAV-001 carry-over enumerated line-by-line; `isNested` flip and its clearance math stated explicitly. |
| Step 3 — `account/_layout.tsx` | PASS — single unique line deletion. |
| Step 4 — repoint call sites | PASS — both sites named; grep-zero gate closes the stale-path risk. |
| Step 5 — typed-routes codegen | PASS — documented repo gotcha correctly sequenced before typecheck. |
| Step 6 — gates | PASS — commands verbatim from `all-tests.md`; pre-existing red explicitly carved out. |

**Totals: 0 FAILs / 2 CONCERNs / 8 PASSes → Net Gate: CONDITIONAL**

### Execute-agent instructions

| # | Instruction | Trigger |
|---|---|---|
| E1 | `account/notifications.tsx` is UNCOMMITTED NAV-001 work. Read it from disk first. Carry every item in Step 2's list. If any NAV-001 element is missing after the move, stop and report — do not silently drop it. | Step 2 entry |
| E2 | Use `git mv` for the move so history follows. Do not create-then-delete. | Step 2 entry |
| E3 | Do NOT `git commit`, do NOT create a branch. Leave changes in the working tree on `development`. | Always |
| E4 | Do NOT fix the NAV-001 inset double-count on `order/cart.tsx`, `order/checkout.tsx`, `branches/[branchId].tsx`, `deals/deal/[dealId].tsx`, or `add-to-cart-bar.tsx`. Out of scope; pending a separate user decision. | Always |
| E5 | Capture `pnpm --filter @jojopotato/mobile typecheck` output BEFORE any edit. Diff after. Only newly-introduced errors count as this plan's regressions. | Step 6 entry |
| E6 | If typed-route codegen does not produce `/(tabs)/notifications`, re-run `expo start` once. Never `as Href`-cast to silence it. | Step 5 |
| E7 | Before writing a local back chevron, re-check `packages/ui/src/index.ts` for a suitable export (repo convention: prefer shared UI). Use it if one exists; otherwise the local `headerLeft` is approved. | Step 1 |
| E8 | AC1/AC2/AC6/AC7/AC8 are Agent-Probe. Report them as owed manual walkthroughs — never claim them as automated coverage. | Step 6 exit |

### Test gates (verbatim, from `process/context/tests/all-tests.md`)

```bash
pnpm --filter @jojopotato/mobile typecheck       # judge touched files only (pre-existing red)
pnpm --filter @jojopotato/mobile lint
pnpm --filter @jojopotato/mobile test            # vitest run --passWithNoTests && jest — baseline 51 + 27
pnpm --filter @jojopotato/ui test                # jest-expo — baseline 62
pnpm format:check
grep -rn "account/notifications" apps/mobile/src # must return zero hits
```

### Open gaps (accepted, on record)

1. AC1 (back returns to caller) has no automated gate — RN navigation E2E runner absent project-wide. Backlog: `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`.
2. NAV-001's inset double-count survives on 5 other files — separate pending user decision, deliberately untouched.
3. `isNested` remains a hand-maintained per-screen literal — recorded under Test Infra Improvement Notes for a future backlog note.
