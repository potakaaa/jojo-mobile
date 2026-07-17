---
name: plan:nav-001-tab-clearance-back-stack
description: "PLAN — GitHub issue #96 (NAV-001, P0): split tab-bar clearance from device safe-area inset on nested screens; fix cross-tab push back-stack trap into Order Tracking. apps/mobile only, SIMPLE complexity."
date: 17-07-26
feature: none
---

# NAV-001: Tab Bar Clearance + Back-Stack Trap — PLAN

**TL;DR:** Two independent fixes, one plan, SIMPLE complexity, ~13-14 files, zero new deps, zero
schema/auth/API surface. (1) Add a pure `resolveTabBarClearance` helper and refactor 6 nested-screen
call sites + 1 already-wrong Product-Details site to stop reserving dead tab-bar height while
keeping the device safe-area inset. (2) Add a centralized `navigateToOrderTracking()` helper that
`reset`s the Order tab's nested stack from all 3 push sites, fixing the cross-tab back-stack trap.
Everything is Fully-Automated-tested at the pure-function layer; all visual/nav-state behavior stays
Agent-Probe (no RN E2E runner exists — project-wide gap). Exit state is honestly **CODE DONE, not
VERIFIED** until a user-run simulator walkthrough, mirroring the predecessor plan's own outcome.

Date: 17-07-26
Status: EXECUTED 17-07-26 — automated gates green; CODE DONE, not VERIFIED (device
walkthrough owed). See the companion `_REPORT_17-07-26.md` for what actually shipped,
including the Step 3.1 gate rejecting this plan's primary `reset` mechanism in favour
of the documented contingency.
Complexity: SIMPLE

## Overview

Issue #96 (NAV-001, P0) has two independent bugs in apps/mobile.s navigation shell: dead tab-bar
space reserved on nested screens, and a cross-tab back-stack trap into Order Tracking. This plan
implements the INNOVATE-locked fix for both. Full context, decisions, and rationale: see the Locked
Inputs section below and the SPEC file. No schema/auth/API/billing surface; no new dependencies.

---

## Locked Inputs (do not re-open)

- SPEC: `nav-001-tab-clearance-back-stack_SPEC_17-07-26.md` (10 ACs, hard safe-area requirement).
- INNOVATE Decision Summary (verbatim, reproduced here for EXECUTE's benefit):
  - **Clearance mechanism:** static per-screen fact (`isNested: boolean`), reusing the
    `coming-soon.tsx` `isNestedScreen` convention. Rejected: `useNavigationState` hook (RN
    bottom-tabs pnpm type-resolution gotcha — the exact reason `floating-tab-bar.tsx` locally
    re-declares its own `TabBarRoute`/`BottomTabBarProps` types instead of importing them) and
    React Context at the `(tabs)` layout (doubles wiring across `_layout.ios.tsx` +
    `_layout.android.tsx`).
  - **New pure function** in `floating-tab-bar.helpers.ts` (must stay ZERO-RN-import):
    `resolveTabBarClearance(isNested: boolean, footprint: number, insetsBottom: number): number`
    → `isNested ? insetsBottom : footprint + insetsBottom`.
  - **`getFloatingTabBarClearance`'s exported signature is UNCHANGED** — only its internals are
    refactored to derive from a named `TAB_BAR_FOOTPRINT` constant. All 7 tab-root call sites +
    `coming-soon.tsx` + `test-utils/jest-setup.ts` keep compiling untouched.
  - **Nested sites:** drop the bar-height term, flip `SafeAreaView edges` to include `'bottom'`
    where it is currently excluded, in the SAME atomic edit (never split across two commits/steps —
    a half-applied edit is a live safe-area regression).
  - **Correction found in INNOVATE (overrides SPEC's ground truth on this one point):**
    `add-to-cart-bar.tsx`'s style array is `[styles.bar /* static paddingBottom: Spacing.four */,
    Platform.OS !== 'web' && { paddingBottom: getFloatingTabBarClearance(insets.bottom) }]` — RN
    style arrays merge left-to-right, so the dynamic entry WINS on iOS/Android, meaning this file is
    reserving full dead bar height on Product Details **today**. It is a 6th real edit site, not a
    confirmation-only site. Fix: replace with `insets.bottom + Spacing.four` directly (no
    `SafeAreaView` present here, so no `edges` flip applies).
  - **Back-stack:** ONE centralized helper,
    `apps/mobile/src/features/orders/lib/navigate-to-tracking.ts`, exporting
    `navigateToOrderTracking(orderId: string)`, called from all 3 push sites. Internally targets the
    Order tab's nested Stack and resets it to exactly
    `[{ name: 'index' }, { name: 'tracking/[orderId]', params: { orderId } }]`. Rejected:
    `router.replace` (only swaps the current top, leaves deeper stack members — reproduces the bug);
    `dismissTo`/`popTo` (require the target already be in history — fails for the Home banner,
    which has never visited Tracking in that stack); per-site inline fixes (drift risk, AC4 requires
    identical behavior). Split for testability: a PURE `buildTrackingResetAction(orderId)` returning
    the plain `{ index, routes }` object (zero RN import, unit-testable) + a thin impure dispatcher.
  - **Coverage:** `resolveTabBarClearance` + `buildTrackingResetAction` → Fully-Automated vitest,
    following the `floating-tab-bar.helpers.ts` precedent (node env). No new jest/RN-component
    runner. No RN E2E runner is being built (out of scope per SPEC).
  - **Deals:** because "nested" is a static per-screen fact, `deals/deal/[dealId].tsx` is a
    small, last, discrete step — see Step 4.

- **UNVERIFIED MECHANISM — Step-1 gate (mandatory first) for the back-stack work group:**
  `navigation.reset({ index: 1, routes: [{ name: 'index' }, { name: 'tracking/[orderId]', params }] })`,
  dispatched via the Order tab's nested navigator ref (`useNavigation()` re-exported by
  `expo-router`, then `.getParent()` / a route-scoped handle) from a CROSS-TAB caller (Home) must be
  confirmed to overwrite that tab's stack the same way it does from a same-tab caller (History/
  Confirmation), under expo-router 57. **Grep-confirmed: zero existing `reset`/`dismissTo`/`popTo`
  usage anywhere in `apps/mobile/src`** — no in-repo precedent to pattern-match, and no direct
  `@react-navigation/*` dependency exists (`apps/mobile/package.json` — only `expo-router` and
  `react-native`, confirmed via `grep` this session). The ONE precedent that does exist — the
  predecessor plan's `navigation.navigate(route.name, { screen: 'index' })` reset-to-root call in
  `floating-tab-bar.tsx:316` — was itself verified EMPIRICALLY during that plan's EXECUTE (see its
  report's "Step-1 gate" section), not assumed. This plan requires the same discipline.
  **Contingency:** if `reset` cannot be scoped cross-tab from Home, fall back to the verified
  `navigate(name, { screen })` precedent (call `navigation.navigate('order', { screen: 'tracking/[orderId]', params: { orderId } })` after first forcing the stack to root via the SAME
  reset-to-root pattern Fix B already uses, or an equivalent 2-step navigate sequence) — EXECUTE
  must record which path was taken in the phase report; do not silently improvise a third mechanism.

  > **SUPERSEDED — VALIDATE's VIABLE verdict was WRONG. Do not implement the `reset` path.**
  > EXECUTE's Step 3.1 gate REFUTED it on 17-07-26: `useNavigation(parent)` resolves its argument
  > via `navigation.getParent(parent)`, which walks **ancestors only** and throws otherwise. The
  > JSDoc example VALIDATE relied on (`useNavigation('/orders/menu')` called from
  > `app/orders/menu/index.tsx`) reaches a **parent of the caller**. From Home, the Order tab's
  > Stack is a **sibling** — never an ancestor — so the cross-tab case that motivated this fix
  > cannot obtain that handle at all. **The shipped mechanism is the documented contingency**, the
  > `navigate(name, { screen })` pattern already verified on-device by the predecessor plan; see
  > `features/orders/lib/navigate-to-tracking.ts` and the companion `_REPORT_17-07-26.md`.
  >
  > Kept below as a worked example of a plausible-but-wrong probe: the vendored-fork evidence was
  > correct, but the conclusion drawn from a JSDoc example was not. Only the empirical gate caught
  > it. Verify mechanisms against installed source, not documentation examples.

  **VALIDATE addendum (17-07-26 — HISTORICAL, REFUTED; see the note above):** the mechanism
  was resolved **VIABLE** with static evidence (installed package source read,
  not a guess). `expo-router` 57.0.4 has NO separate `@react-navigation/*` npm dependency — it
  VENDORS a full internal fork of `@react-navigation/core` + `@react-navigation/bottom-tabs`
  (confirmed: `apps/mobile`'s `Tabs` = `createBottomTabNavigator()` from expo-router's own
  `build/react-navigation/bottom-tabs`) — **this part is true and still holds.**
  `useNavigation(parent?: string | Href)` was read as expo-router's
  own **officially documented** convenience for exactly this cross-navigator case (JSDoc example:
  `useNavigation('/orders/menu')` from anywhere in the tree) — **this inference was WRONG; the
  example reaches an ancestor, not a sibling.** `.reset(state)` is indeed an unconditional
  method on the returned `NavigationProp`, not focus-gated — but that is moot when the handle
  itself is unobtainable cross-tab. A genuinely NEW risk was found and must
  be added to Step 3.1's empirical check: default `lazy: true` tab semantics mean the Order tab's
  nested Stack navigator only mounts/registers once the Order tab is first focused in the session —
  a cold app start where the user taps the Home banner without ever having visited the Order tab
  this session may hit a different failure mode than the "already visited" case the original gate
  wording implied. See Validate Contract → Execute-agent instructions (E1).

---

## Blast Radius

| Area | File | Exact site(s) | Edit type |
|---|---|---|---|
| Bar/helpers | `apps/mobile/src/components/floating-tab-bar.helpers.ts` | new export | ADD |
| Bar/helpers | `apps/mobile/src/components/floating-tab-bar.tsx` | `:148,161-162` (`BAR_CONTENT_HEIGHT`/`getFloatingTabBarClearance`) | REFACTOR (signature unchanged) |
| Bar/helpers test | `apps/mobile/src/components/__tests__/floating-tab-bar.helpers.test.ts` | append cases | ADD |
| Nested clearance | `apps/mobile/src/app/(tabs)/order/cart.tsx` | `:301` (footer clearance), `:414` (VALIDATE-confirmed live via grep 17-07-26 — both sites real and current, not stale) | EDIT (atomic w/ edges) |
| Nested clearance | `apps/mobile/src/app/(tabs)/order/checkout.tsx` | `:273` (scroll content), `:355` (footer, inside `countdown===null` conditional) | EDIT (atomic w/ edges) |
| Nested clearance | `apps/mobile/src/app/(tabs)/branches/[branchId].tsx` | `:134` scroll content clearance; SafeAreaView already `edges={['top']}` at same line | EDIT (edges gains `'bottom'`) |
| Nested clearance | `apps/mobile/src/app/(tabs)/account/notifications.tsx` | `:80` scroll content clearance | EDIT (atomic w/ edges) |
| Nested clearance (correction) | `apps/mobile/src/features/menu/components/add-to-cart-bar.tsx` | `:48` | EDIT (no SafeAreaView present — no edges flip) |
| Deals (conditional) | `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` | `:73`-area clearance call | EDIT (Step 4, discrete) |
| Back-stack helper | `apps/mobile/src/features/orders/lib/navigate-to-tracking.ts` | new file | ADD |
| Back-stack helper test | `apps/mobile/src/features/orders/lib/__tests__/navigate-to-tracking.test.ts` | new file | ADD |
| Back-stack call site | `apps/mobile/src/app/(tabs)/order/history.tsx` | `:60` (`openOrder`) | EDIT |
| Back-stack call site | `apps/mobile/src/app/(tabs)/order/confirmation/[orderId].tsx` | `:138-144` ("Track your order" button) | EDIT |
| Back-stack call site | `apps/mobile/src/app/(tabs)/index.tsx` | `:186-193` (`ActiveOrderBanner onPress`) | EDIT |

**Explicitly NOT to touch (verify only, do not edit):**
7 tab-root clearance call sites — `(tabs)/index.tsx:177` (its OWN clearance call — distinct from the
`:186-193` back-stack push in the SAME file; do not conflate the two), `order/index.tsx:48`,
`branches/index.tsx:283`, `rewards/index.tsx:115`, `account/index.tsx:44`, `deals/index.tsx:47`,
plus the second `deal/[dealId].tsx:73` reference IF Step 4's Agent-Probe judges the screen a true
tab-root shape (see Step 4). Also not to touch: `coming-soon.tsx` (already correct,
`isNestedScreen`-gated), `test-utils/jest-setup.ts`, `_layout.web.tsx` (web out of scope), any route
path string, `useHideTabBarWhile` / the checkout-countdown overlay mechanism itself (only consumed,
never modified), `notification-factory.test.ts`.

## Public Contracts

- `getFloatingTabBarClearance(insetsBottom: number): number` — **signature and external behavior for
  all 7 tab-root callers UNCHANGED.** Internal computation refactored to route through the new
  `TAB_BAR_FOOTPRINT` constant; return value for a given `insetsBottom` is byte-identical to today.
- New export `resolveTabBarClearance(isNested: boolean, footprint: number, insetsBottom: number): number`
  from `floating-tab-bar.helpers.ts` (zero-RN-import file, vitest node-env testable).
- New export `navigateToOrderTracking(orderId: string): void` from
  `features/orders/lib/navigate-to-tracking.ts` — the ONLY approved way any screen pushes into Order
  Tracking going forward. New export `buildTrackingResetAction(orderId: string): { index: number; routes: { name: string; params?: Record<string, unknown> }[] }` (pure, zero-RN-import, colocated or in the same file — EXECUTE decides file layout, but the pure builder MUST be independently importable by the vitest test without pulling in `expo-router`/`react-native`).
- No new npm dependencies. No changes to `packages/types`, `packages/api`, or any other workspace
  package. No changes to route file structure or any route path string.

## Touchpoints

Same as Blast Radius table above — 14 files total (2 new source + 2 new test + 10 edited).

---

## Implementation Checklist (Steps)

### Step 1 — Bar/helpers refactor + pure tests (Fully-Automated, no dependencies)

1.1. In `apps/mobile/src/components/floating-tab-bar.helpers.ts`, add:
```ts
export function resolveTabBarClearance(
  isNested: boolean,
  footprint: number,
  insetsBottom: number,
): number {
  return isNested ? insetsBottom : footprint + insetsBottom;
}
```
Keep the file's zero-RN-import contract intact (already documented in the file's header comment —
do not violate it).

1.2. In `apps/mobile/src/components/floating-tab-bar.tsx`, refactor lines ~148/161-162:
```ts
const TAB_BAR_FOOTPRINT = BAR_CONTENT_HEIGHT + Spacing.two + Spacing.four;

export const getFloatingTabBarClearance = (insetsBottom: number): number =>
  TAB_BAR_FOOTPRINT + insetsBottom;
```
Export `TAB_BAR_FOOTPRINT` alongside `getFloatingTabBarClearance` (nested-site edits in Step 2 need
the raw footprint number to pass into `resolveTabBarClearance`). Do not change
`getFloatingTabBarClearance`'s exported signature or numeric output for any given `insetsBottom` —
this is a pure internal refactor. Update the doc comment above it to explain the new split (footprint
vs safe-area) so a future reader doesn't reintroduce the conflation bug.

1.3. In `apps/mobile/src/components/__tests__/floating-tab-bar.helpers.test.ts`, append a
`describe('resolveTabBarClearance', ...)` block with at minimum:
- `isNested=true` → returns `insetsBottom` only, footprint term ignored (assert with a nonzero
  footprint to prove it's actually ignored, not coincidentally zero).
- `isNested=false` → returns `footprint + insetsBottom`.
- `insetsBottom=0` (no home-indicator device) → correct for both branches.

**Edge cases to fold in (from risk review):** negative/zero footprint is not a real input (never
pass one) — no defensive clamping needed, this is an internal trusted call. Do assert the function is
a pure equality-style calculation (no rounding surprises) since callers will add this to layout
`paddingBottom` values directly.

**Gate for this step:** `pnpm --filter @jojopotato/mobile test` (vitest portion) green,
`pnpm --filter @jojopotato/mobile typecheck` green (all 7 tab-root + `coming-soon.tsx` + jest-setup
callers of `getFloatingTabBarClearance` must still compile with zero signature change).

**Traces:** SPEC AC5, AC6.

---

### Step 2 — 6 nested-site clearance edits (parallel-safe across files; depends only on Step 1's `TAB_BAR_FOOTPRINT` export)

Each site gets its style computation changed from
`getFloatingTabBarClearance(insets.bottom) [+ extra terms]` to
`resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom) [+ same extra terms]` (extra terms
like `Spacing.six + Spacing.two` for breathing room are UNCHANGED — only the bar-height/safe-area
term itself changes). **`isNested` is hardcoded `true` at every one of these 6 call sites** — they
are all confirmed-nested screens per SPEC Constraints, not derived from a runtime predicate (matches
the locked "static per-screen fact" decision).

> **SUPERSEDED — do NOT replay sub-steps 2.1–2.5 verbatim. They author a real bug.**
>
> Each sub-step below prescribes BOTH inset sources at the same site: the
> `resolveTabBarClearance(true, …)` padding **and** `edges={['bottom']}`. Since
> `resolveTabBarClearance(true, …)` returns `insets.bottom`, that counts the device inset
> **twice** — the double-count the EXECUTE report flagged and NAV-003 later removed.
>
> **The rule, as shipped:** exactly ONE bottom-inset source per element.
> - Screen has a `resolveTabBarClearance(...)` padding → **drop `'bottom'`** from its
>   `SafeAreaView edges` (that call is the sole source). Add back only the element's own
>   baseline breathing room from its stylesheet (e.g. `+ Spacing.four`, `+ Spacing.two`) —
>   `paddingBottom` overrides the stylesheet shorthand, so omitting it leaves content flush
>   at the home-indicator boundary.
> - Screen has NO such padding → **keep `'bottom'`** (the SafeAreaView is its sole source).
>
> Also stale: **2.4 (`account/notifications.tsx`) was superseded by NAV-002**, which moved
> that screen to a top-level `(tabs)/notifications/` route with `edges={['top']}`.
>
> Ground truth is the code plus the companion `_REPORT_17-07-26.md`, not the text below.
> Retained as the record of what was planned.

2.1. **`cart.tsx`** — footer clearance at `:301` becomes
`resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom) + Spacing.two`. **VALIDATE-confirmed
17-07-26 via fresh `grep -n getFloatingTabBarClearance`: BOTH `:301` and `:414` are real, current
call sites — the second site is not stale.** Apply the identical treatment at `:414`.
`SafeAreaView edges={[]}` at `:268` → `edges={['bottom']}`. **Atomic: both the padding change and
the edges change land in the same edit.**

2.2. **`checkout.tsx`** — TWO real call sites, both under the SAME `SafeAreaView edges={[]}` at
`:267`: the scroll-content padding at `:273` and the footer padding at `:355` (the latter sits
INSIDE the `countdown === null` conditional branch of the footer's `Animated.View` — do not touch
the sibling `countdown !== null` branch, which is the confirm-drawer overlay path and is unrelated).
Both become `resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom)` (+ the same
`Spacing.six + Spacing.two` extra term at `:273` only — `:355` has no extra term today, keep it
that way). Flip `edges={[]}` → `edges={['bottom']}` at `:267`. Leave the file's OTHER two
`SafeAreaView edges={['bottom']}` blocks (`:234`, `:251` — the "no branch" / error states) alone —
they already have the correct edges and do not call `getFloatingTabBarClearance` at all per this
session's read.

2.3. **`branches/[branchId].tsx`** — scroll-content clearance at `:134` becomes
`resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom)`. `SafeAreaView edges={['top']}` at
`:130` → `edges={['top', 'bottom']}` (additive — keep `'top'`, this screen still needs the header
inset).

2.4. **`account/notifications.tsx`** — scroll-content clearance at `:80` becomes
`resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom) + Spacing.four` (the `Spacing.four`
extra term is preserved unchanged). `SafeAreaView edges={[]}` at `:74` → `edges={['bottom']}`.

2.5. **`features/menu/components/add-to-cart-bar.tsx`** (the INNOVATE-discovered 6th real site —
NOT a mere confirmation) — replace the style array's dynamic `paddingBottom: getFloatingTabBarClearance(insets.bottom)`
entry at `:48` with `paddingBottom: insets.bottom + Spacing.four` directly. **Do not add a
`SafeAreaView`** — this file has none today and already reads `useSafeAreaInsets()` directly; adding
one would be a scope-widening structural change not required to fix the bug. (Note:
`resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom)` would ALSO be correct here since it
reduces to `insets.bottom`, but writing `insets.bottom + Spacing.four` directly is clearer and
avoids importing the footprint constant into a file that has zero other use for it — EXECUTE may use
either form as long as the numeric result is identical; prefer the explicit form for readability.)
**VALIDATE-confirmed 17-07-26 via source read: the style-array left-to-right merge claim is TRUE —
the dynamic entry (`~61 + insets.bottom + 24`dp) currently overrides `styles.bar`'s static
`paddingBottom: Spacing.four` on non-web. This file IS reserving full dead bar height today; INNOVATE's
correction is validated, not speculative.**

**Verify (do not edit) per Constraints:** the static `paddingBottom: Spacing.four` on `styles.bar`
stays untouched — it is the OTHER, always-applied padding term, unrelated to this bug.

**Execute-agent instruction (E2 — see Validate Contract):** at each of the 6 hardcoded `isNested=true`
call sites in this step, add a one-line doc comment naming the structural invariant this hardcoding
relies on (see Validate Contract → Execute-agent instructions for exact wording).

**Gate for this step:** `pnpm --filter @jojopotato/mobile typecheck`,
`pnpm --filter @jojopotato/mobile lint` green on all 5 touched files. No automated visual gate exists
(see Verification Evidence) — Agent-Probe covers the rest.

**Traces:** SPEC AC1 (indirectly, unaffected), AC2 (hard safe-area requirement), AC3 (no dead
space), AC9 (`useHideTabBarWhile` / countdown overlay regression guard — checkout.tsx footer edit
must not touch the `countdown !== null` sibling branch).

---

### Step 3 — Back-stack helper + 3 call sites (gated on the Step-1 mechanism check; independent of Steps 1-2, may run in parallel with them)

3.1. **Mechanism check (mandatory first, before writing the helper body):** using a disposable
throwaway screen or the existing dev tooling, or by direct code-reading of `expo-router`'s
`useNavigation()` re-export and its underlying `@react-navigation/native` `reset` action contract
(cost-class: cheap-local, no live provider), confirm the exact mechanism described in "UNVERIFIED
MECHANISM" above. Record the confirmed mechanism (or the contingency path taken) in the phase report
under a "Step-1 gate" section, mirroring the predecessor plan's report format exactly.

**Execute-agent instruction (E1 — see Validate Contract, mandatory addition to this check):**
explicitly test the cross-tab reset from Home in BOTH (a) after having visited the Order tab earlier
in the same session, and (b) a cold start where the Order tab has never been visited this session
(simulating re-opening the app with a pre-existing active order and tapping the Home banner
immediately). Case (b) is a genuinely different code path — expo-router's `Tabs` (confirmed backed by
`createBottomTabNavigator()`, expo-router's internally vendored `@react-navigation/bottom-tabs`
fork) defaults to `lazy: true`, meaning the Order tab's nested Stack navigator does not mount/
register until the Order tab is first focused. If `useNavigation('/order')` / `.getParent(...)`
fails to resolve the target navigator in case (b), fall back to the already-documented
`navigate(name, { screen })` contingency, which mounts-on-navigate by design and should handle the
cold-start case correctly without further design changes.

3.2. Create `apps/mobile/src/features/orders/lib/navigate-to-tracking.ts`:
- Export a PURE `buildTrackingResetAction(orderId: string)` returning
  `{ index: 1, routes: [{ name: 'index' }, { name: 'tracking/[orderId]', params: { orderId } }] }`
  (or the exact shape the confirmed mechanism requires — adjust field names to match the real
  React Navigation `reset` action contract discovered in 3.1, but keep the function pure/zero-RN-import).
- Export the impure `navigateToOrderTracking(orderId: string): void` that obtains a handle to the
  Order tab's nested navigator (via `useNavigation()` is a HOOK and cannot be called from a plain
  function — EXECUTE must decide whether this becomes a hook itself, e.g.
  `useNavigateToOrderTracking()` returning a callback, OR whether it takes a `navigation` handle as
  a parameter passed in by each call site. **This is an EXECUTE-time implementation decision within
  the locked contract** — the locked contract is the FUNCTION NAME and BEHAVIOR
  (`navigateToOrderTracking`, resets Order's stack to `[index, tracking/[orderId]]`), not necessarily
  its exact calling convention. Prefer the hook form if it keeps all 3 call sites simplest, since all
  3 are React component render bodies.), then dispatches the reset built by
  `buildTrackingResetAction`.
- If the Step-1 gate's contingency path is needed (reset cannot be scoped cross-tab), implement the
  fallback sequence instead and document which path was taken directly in this file's header comment
  (future readers need to know without re-deriving it).

3.3. Create `apps/mobile/src/features/orders/lib/__tests__/navigate-to-tracking.test.ts` — vitest,
node env, importing ONLY `buildTrackingResetAction` (never the impure dispatcher, never any RN/expo
import). Cases: given an `orderId`, returns the exact expected `{ index, routes }` shape; routes
array has exactly 2 entries in the correct order; the `tracking/[orderId]` entry's `params.orderId`
matches the input. **Edge case:** empty-string `orderId` still produces a syntactically valid action
object (the function does not validate `orderId` content — that's the caller's job, e.g. `history.tsx`
already only calls this with a real `order.id`).

3.4. Update the 3 call sites to use `navigateToOrderTracking` (or its hook form) in place of their
current `router.push({ pathname: '/(tabs)/order/tracking/[orderId]', params: { orderId } })` call:
- `apps/mobile/src/app/(tabs)/order/history.tsx:60` (`openOrder`)
- `apps/mobile/src/app/(tabs)/order/confirmation/[orderId].tsx:138-144` ("Track your order" button
  `onPress`)
- `apps/mobile/src/app/(tabs)/index.tsx:186-193` (`ActiveOrderBanner onPress`) — this is the
  CROSS-TAB case the Step-1 gate specifically exists to verify; if this call site behaves
  differently than the other two under the chosen mechanism, that is a plan-blocking discovery, not
  a normal implementation variance — surface it in the phase report rather than papering over it.

**Do not change** `history.tsx`'s or `confirmation/[orderId].tsx`'s or `index.tsx`'s OTHER
navigation calls (e.g. `router.replace('/(tabs)/order')`, `router.push('/(tabs)/order/cart')`) — only
the specific push-into-Tracking call at each of the 3 named sites.

**Gate for this step:** `pnpm --filter @jojopotato/mobile test` (new vitest cases green),
`pnpm --filter @jojopotato/mobile typecheck`, `pnpm --filter @jojopotato/mobile lint`.

**Traces:** SPEC AC4 (primary), AC10 (repeated tab-switching correctness — indirectly, since a
correctly-reset stack cannot desync visibility state the way an accumulating stack could).

---

### Step 4 — Deals one-line flip (last, discrete, both outcomes written out)

4.1. Before touching code: during Agent-Probe (VALIDATE/EXECUTE on-device walkthrough), determine
current on-device behavior of `deal/[dealId].tsx` — is the floating tab bar currently shown or
hidden there? (This is a `state.index > 0` structural fact on the `deals` sibling stack inside the
`Tabs` navigator — `isNestedTabRoute` almost certainly already evaluates `true` for it today, i.e.
the bar is likely ALREADY hidden, independent of anything this plan changes to visibility logic.)

4.2. **Regardless of the visibility-question outcome, the clearance term at `deal/[dealId].tsx`'s
`getFloatingTabBarClearance(insets.bottom)` call (`:73`-area) is currently reserving FULL dead bar
footprint on a screen that is a pushed/nested screen by file-tree shape** (`deal/[dealId]` is pushed
inside the `deals` stack) — this is the same class of bug as the 6 Step-2 sites, and is NOT
contingent on the Open Question 1 judgment call. Change it to
`resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom)` unconditionally. No `SafeAreaView`
exists in this file today (confirmed this session) — no edges flip needed, matching
`add-to-cart-bar.tsx`'s situation.

4.3. **Two outcomes for the VISIBILITY question (write both out, execute-agent picks based on the
Agent-Probe finding in 4.1 — do not guess ahead of time):**
- **Outcome A — bar is already hidden on `deal/[dealId]` today, AND that is judged correct/intentional:**
  no further change needed beyond 4.2. `deals/index.tsx` remains a genuine tab-root (already
  correctly excluded from this plan's Blast Radius).
  **Outcome B — bar is already hidden today, AND that is judged a defect (issue #96 wants it
  visible):** this requires a genuine carve-out mechanism (a per-screen exemption from the generic
  `isNestedTabRoute` structural check) — this is new scope beyond a "one-line flip" and should be
  split into a follow-up plan/backlog note rather than absorbed into this plan's checklist, per the
  Hybrid Failure Resolution / new-phase-plan pattern. Do NOT attempt to build a bar-visibility
  carve-out mechanism inside this plan's Step 4 — flag it and stop at the boundary.
- (Outcome "bar currently shown, clearance already correct" is not expected per the structural
  analysis above, but if Agent-Probe finds it: skip 4.2 entirely, treat `deal/[dealId].tsx` as
  identical to a tab-root site, and note the discrepancy with this plan's structural prediction in
  the phase report.)

4.4. Update `## Constraints`-equivalent notes in the phase report either way — SPEC's Open Question
1 gets its final answer recorded there, not left open past this plan's closeout.

**Gate for this step:** typecheck/lint green on the touched file; Agent-Probe walkthrough (AC7).

**Traces:** SPEC AC7 (primary), AC3 (dead-space, via 4.2).

---

## Acceptance Criteria

This plan.s Acceptance Criteria are the SPEC.s 10 ACs verbatim (see SPEC file, Acceptance Criteria
section) -- not restated here to avoid drift. The Verification Evidence table below maps every plan
gate/scenario to the SPEC AC it proves.

## Phase Completion Rules

- **CODE DONE**: all Fully-Automated gates (typecheck, lint, vitest) green; all 4 implementation
  steps.' file edits complete per the checklist above.
- **VERIFIED**: CODE DONE, AND every Agent-Probe row in Verification Evidence has been walked
  through on a real device/simulator and explicitly confirmed by the user. Do not mark this plan
  VERIFIED on Fully-Automated gates alone -- the majority of this plan.s ACs (1,2,3,4,7,8,9-visual,10)
  are Agent-Probe by necessity (no RN E2E runner exists).
- Until Agent-Probe confirmation happens, the honest state is **CODE DONE, not VERIFIED** -- keep
  the plan in active/, do not archive to completed/.

## Test Infra Improvement Notes

(none identified yet — both new pure functions fit the existing `floating-tab-bar.helpers.ts` vitest
node-env precedent with zero new runner/infra needed)

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `resolveTabBarClearance` unit cases (isNested true/false, zero-inset) | Fully-Automated — `pnpm --filter @jojopotato/mobile test` (vitest) | AC5, AC6 |
| `buildTrackingResetAction` unit cases (shape, route order, params passthrough, empty-orderId) | Fully-Automated — `pnpm --filter @jojopotato/mobile test` (vitest) | AC4 (mechanism correctness, pure layer) |
| `pnpm --filter @jojopotato/mobile typecheck` — all 14 touched/new files, zero net-new errors | Fully-Automated | Regression guard (no `getFloatingTabBarClearance` signature break at 7 untouched tab-root callers) |
| `pnpm --filter @jojopotato/mobile lint` — zero new errors | Fully-Automated | Code-quality regression guard |
| `pnpm --filter @jojopotato/mobile test` — existing suite stays green (vitest + jest, no regressions) | Fully-Automated | AC9 (pinned-route `notification-factory.test.ts` regression guard) |
| On-device walkthrough: tab bar visible only on 5 tab-root screens, pushing one nested screen per tab | Agent-Probe | AC1 |
| On-device walkthrough: no bottom content flush against safe-area inset on Cart/Checkout/Product Details/Branch Details/Notifications (device or simulator with nonzero home-indicator inset) | Agent-Probe | AC2 (hard requirement) |
| On-device visual before/after comparison: no dead bar-height gap on the 6 nested + 1 Product-Details site | Agent-Probe | AC3 |
| On-device walkthrough: back press from Order Tracking lands on Order root from all 3 entry points (Home banner, History, Confirmation) — INCLUDING the Home-banner cold-start case (Order tab never visited this session) | Agent-Probe | AC4 |
| On-device walkthrough: Deals list + Deal Details tab-bar behavior, cross-checked against Step 4's recorded outcome | Agent-Probe | AC7 |
| On-device walkthrough: native header/back-button unaffected on ≥1 nested screen per tab | Agent-Probe | AC8 |
| On-device walkthrough: checkout countdown-drawer bar-hide still works | Agent-Probe | AC9 (visual half) |
| On-device walkthrough: repeated tab-switching, including switching away while a nested screen is pushed | Agent-Probe | AC10 |

**No automated coverage is claimed for any visual or navigation-stack-state behavior** — no RN E2E
runner exists (`process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`). This
plan's honest exit state after EXECUTE is **CODE DONE**, not VERIFIED, until the Agent-Probe rows
above are walked through and confirmed by the user — same shape as the predecessor plan
(`fix-tab-bar-visibility-nav-trap_15-07-26`).

## Exact Gate Commands

```
pnpm --filter @jojopotato/mobile typecheck
pnpm --filter @jojopotato/mobile lint
pnpm --filter @jojopotato/mobile test        # vitest run --passWithNoTests && jest
```
(Sourced from `process/context/tests/all-tests.md` §Commands — no invented commands.)

---

## Risks

| Risk | Mitigation |
|---|---|
| Cross-tab `reset` mechanism does not behave as expected from Home (the ONE genuinely novel navigation call in this plan) | **RISK MATERIALIZED — the gate did its job.** VALIDATE called the mechanism VIABLE, but EXECUTE's Step-1 gate (3.1) REFUTED it: `useNavigation(parent)` walks ancestors only, so Home cannot reach the sibling Order stack. The documented contingency — the already-verified `navigate(name, {screen})` pattern — shipped instead, and it also covers the cold-start/lazy-mount sub-case (E1). |
| Half-applied edit: padding term changed but `SafeAreaView edges` not flipped (or vice versa) → live safe-area regression | Explicit "atomic, same edit" instruction per site in Step 2; Agent-Probe AC2 is a hard gate, not optional |
| `checkout.tsx`'s footer edit accidentally touches the `countdown !== null` sibling branch (confirm-drawer overlay) | Step 2.2 explicitly calls out the conditional boundary; AC9 regression guard |
| `cart.tsx`'s second cited call site (`:414`) is stale/renamed since SPEC's research pass | RESOLVED by VALIDATE (17-07-26) — grep-confirmed both `:301` and `:414` are real, current call sites |
| Deals Step 4 scope-creeps into building a visibility carve-out mechanism | Step 4.3 explicitly draws the boundary and routes Outcome B to a follow-up plan instead |
| Order tab's nested Stack navigator is lazy-mounted (`lazy: true` default) and may not be registered when Home dispatches a cross-tab reset before the Order tab has ever been visited this session | New finding, VALIDATE 17-07-26 — added as an explicit sub-case to Step 3.1's mechanism check (E1); existing `navigate()`-based contingency already handles this by design (navigate mounts-on-demand) |

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/general-plans/active/nav-001-tab-clearance-back-stack_17-07-26/nav-001-tab-clearance-back-stack_PLAN_17-07-26.md`
2. **Last completed phase or step:** VALIDATE run 17-07-26 — Gate: CONDITIONAL (first pass),
   followed by a PVL-supplement cycle (cycle 1, 17-07-26) that re-verified both CONCERN gaps against
   the checklist body. Result: both were already durably folded into the checklist text by
   vc-validate-agent's own inline annotations (not just the Validate Contract) — E1 (warm/cold-start
   sub-case) is already the full text of Step 3.1's "Execute-agent instruction (E1)" block, and E2
   (doc-comment invariant) is already the full text of Step 2's "Execute-agent instruction (E2)"
   block. No checklist edits were needed this cycle (n/a — already covered); the plan-supplement
   step exists in the record but changed no checklist content.
3. **Validate-contract status:** written 17-07-26, Gate: CONDITIONAL (see below). Unchanged by the
   supplement cycle — the contract itself is out of scope for plan-agent edits.
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, this task's SPEC, `fix-tab-bar-visibility-nav-trap_15-07-26` PLAN + REPORT (predecessor), installed `expo-router@57.0.4` package source (`node_modules/.pnpm/expo-router@57.0.4_.../expo-router/build/`).
5. **Next step for a fresh agent: do NOT re-run EXECUTE — it is already complete.**
   EXECUTE ran 17-07-26; see the companion `_REPORT_17-07-26.md`. All automated gates are green
   (mobile typecheck exit 0, vitest 51, jest 27, `packages/ui` 68, lint 0 errors) and the code is
   committed on `feat/nav-shell-screenheader` (PR #110). The only outstanding work is the
   **Agent-Probe device walkthrough** — no automated runner can prove the visual/nav-state ACs.

   Two things this plan's body still describes as *intended* that EXECUTE changed — trust the
   REPORT over the checklist where they disagree:
   - The primary `reset`-based back-stack mechanism was **rejected** at the Step 3.1 gate
     (`useNavigation(parent)` resolves via `getParent()` and walks ancestors only, so the Order
     stack is unreachable from Home). The documented `navigate(name, { screen })` contingency
     shipped instead.
   - Step 2.4's `notifications` guidance was **superseded** by NAV-002, which moved that screen to
     a top-level `(tabs)/notifications/` route.

   The historical checklist below is retained as the record of what was planned, not as
   instructions to replay.

---

## Validate Contract

Status: CONDITIONAL
Date: 17-07-26
date: 2026-07-17
generated-by: outer-pvl

Parallel strategy: parallel-subagents (2 groups) — VALIDATE fan-out itself was run single-agent
(sequential investigation appropriate for SIMPLE complexity); this recommendation is for EXECUTE.
Rationale: 2/7 signals present (S5: user explicitly requested deep feasibility investigation; S7:
14 files in blast radius). Dominant signal: S7. Group A = Step 1 + Step 2 (tightly coupled — Step 2
depends on Step 1's `TAB_BAR_FOOTPRINT` export). Group B = Step 3 (back-stack helper — plan itself
declares this "independent of Steps 1-2, may run in parallel"). Step 4 runs sequentially after both
groups (small, discrete, gated on Agent-Probe judgment, touches a file neither group touches).
Sequential (1 agent, all steps in order) is an equally defensible fallback given the plan's overall
SIMPLE complexity and low signal score — recommend parallel-subagents primarily for wall-clock
efficiency, not because coordination risk requires it.

Agent count: 2 (Group A, Group B) + 1 sequential tail (Step 4) = 3 total EXECUTE-leg spawns, all
opus (code-execution leg per Model Selection Policy). No cost-guard trigger (well under 30).

### Test gates (C3 5-column table)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC5 | `resolveTabBarClearance` isNested branch ignores footprint term | Fully-Automated | `pnpm --filter @jojopotato/mobile test` — new `floating-tab-bar.helpers.test.ts` cases (isNested=true/false, insetsBottom=0) | A |
| AC6 | safe-area-inset term computed correctly, independent of bar-height term | Fully-Automated | same suite as above | A |
| AC4 (pure layer) | `buildTrackingResetAction` produces correct `{index, routes}` shape, route order, params passthrough | Fully-Automated | `pnpm --filter @jojopotato/mobile test` — new `navigate-to-tracking.test.ts` | A |
| Regression | `getFloatingTabBarClearance` signature/output unchanged for all 7 untouched tab-root callers | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` | A |
| Regression | zero new lint errors across 14 touched/new files | Fully-Automated | `pnpm --filter @jojopotato/mobile lint` | A |
| AC9 (pinned route) | `notification-factory.test.ts` pinned route `/(tabs)/order/tracking/[orderId]` stays green | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (existing suite regression) | A |
| AC1 | tab bar visible only on 5 tab-root screens, hidden on every pushed nested screen | Agent-Probe | on-device walkthrough, one nested screen per tab | A |
| AC2 | no screen — nested or root — places bottom content flush against device safe-area inset | Agent-Probe | on-device walkthrough on nonzero-inset device/simulator: Cart, Checkout, Product Details, Branch Details, Notifications | A |
| AC3 | no dead bar-height space reserved on nested screens | Agent-Probe | on-device before/after visual comparison, 6 nested + 1 Product-Details site | A |
| AC4 (nav-state) | back press from Order Tracking lands on Order root from all 3 entry points, incl. cold-start Home banner | Agent-Probe | on-device walkthrough — Home banner (both warm and cold-start sub-cases), Order History, Order Confirmation | A |
| AC7 | Deals list + Deal Details tab-bar behavior verified, not assumed | Agent-Probe | on-device walkthrough, cross-checked against Step 4's recorded outcome | A |
| AC8 | native header/back-button unaffected on nested screens | Agent-Probe | on-device walkthrough, ≥1 nested screen per tab | A |
| AC9 (visual) | checkout countdown-drawer bar-hide still works | Agent-Probe | on-device walkthrough during checkout countdown | A |
| AC10 | repeated tab switching never leaves bar in wrong visibility state | Agent-Probe | on-device walkthrough, multiple tab switches incl. while a nested screen is pushed | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: all rows above use one of the 3 proving strategies (Fully-Automated / Agent-Probe).
No row is Known-Gap — every developed behavior in this plan's blast radius has at least one proving
gate. (Outcome B of Step 4.3, if triggered during Agent-Probe, becomes a genuine C — deferred to a
named follow-up plan — but that is a contingent future state, not a fact of this contract today.)

Legacy line form (retained so existing validate-contract consumers still parse):
- Bar/helpers pure logic: Fully-automated: `pnpm --filter @jojopotato/mobile test` (vitest, new `resolveTabBarClearance` + `buildTrackingResetAction` cases)
- Regression guard: Fully-automated: `pnpm --filter @jojopotato/mobile typecheck` + `pnpm --filter @jojopotato/mobile lint`
- Existing suite regression: Fully-automated: `pnpm --filter @jojopotato/mobile test` (full suite, incl. `notification-factory.test.ts`)
- Visual/nav-state behavior (AC1,2,3,4,7,8,9-visual,10): Agent-probe: on-device/simulator walkthrough per Verification Evidence table — no RN E2E runner exists project-wide

### Dimension findings

- Infra fit: PASS — apps/mobile only, zero new deps, zero container/infra/runtime surface. All 14
  blast-radius file paths confirmed to exist on disk via direct grep/read this session.
- Test coverage: PASS — honest tier assignment confirmed: 6 Fully-Automated gates (all real,
  runnable now, sourced verbatim from `process/context/tests/all-tests.md`), 8 Agent-Probe rows
  (correctly not laundered as automated — no RN E2E/navigation runner exists, project-wide,
  documented gap). Zero Known-Gap rows; the vacuous-green ban does not apply.
- Breaking changes: PASS — `getFloatingTabBarClearance`'s exported signature and numeric output
  confirmed byte-identical under the refactor (verified by reading the actual current
  `BAR_CONTENT_HEIGHT`/`Spacing` math at `floating-tab-bar.tsx:148,161-162`). No schema/API/auth
  surface. No new npm dependencies. No workspace package other than `apps/mobile` touched.
- Security surface: PASS — pure UI/navigation logic; no auth, billing, secrets, PII, or trust
  boundary touched. STRIDE scan: no applicable threat surface introduced.
- Section: Step 1 (bar/helpers refactor + tests) — PASS. Mechanical feasibility confirmed exact:
  lines 148/161-162 in `floating-tab-bar.tsx` match the plan's citation verbatim. No gaps, no
  conflicts. Highest-risk edit: none material — pure internal refactor with an explicit
  byte-identical-output constraint.
- Section: Step 2 (6 nested-site clearance edits) — CONCERN. Mechanical feasibility PASS (every
  `SafeAreaView edges=` line number confirmed exact: `cart.tsx:268`, `checkout.tsx:267/234/251`,
  `branches/[branchId].tsx:130`, `notifications.tsx:74`; `cart.tsx`'s two call sites at `:301` and
  `:414` both confirmed real and current via fresh grep — resolves the plan-agent's earlier
  uncertainty in the plan-agent's favor, no stale line numbers found anywhere in this section).
  Gap found: SPEC AC5 requires the visibility predicate and clearance predicate to derive from "the
  same single source of truth," proven by a test asserting the two never disagree. The locked design
  (hardcoded `isNested=true` per call site) satisfies this only via file-tree structural guarantee
  (these 6 screens can structurally never be tab roots), not via a runtime-coupled test against
  `isNestedTabRoute()`'s actual output — Step 1.3's unit tests exercise `resolveTabBarClearance` in
  isolation only. Not a design flaw (INNOVATE's rejection of a runtime hook/context was reasoned and
  is locked), but the AC5 proof is weaker than literally stated. Resolved via execute-agent
  instruction E2 (see below) rather than reopening the design. No conflicts found. Highest-risk edit:
  `checkout.tsx`'s footer conditional-branch boundary (`countdown === null` vs `!== null`) —
  already well mitigated by Step 2.2's explicit callout.
  Also confirmed TRUE via source read: `add-to-cart-bar.tsx`'s style-array left-to-right merge means
  the file IS reserving full dead bar height today (INNOVATE's correction to the SPEC's Background
  is validated, not speculative) — this is the 6th real edit site, not a confirmation-only site.
- Section: Step 3 (back-stack helper + 3 call sites, incl. Step-1 mechanism gate) — CONCERN. Mechanical
  feasibility PASS: `buildTrackingResetAction` pure-function contract is clean; all 3 call site line
  numbers confirmed close/exact (`history.tsx:60` exact; `confirmation/[orderId].tsx:140-141`, plan
  cited 138-144, immaterial drift; `index.tsx:185-193`, plan cited 186-193, immaterial drift — no
  action needed, EXECUTE's own re-grep instruction already covers this). The core feasibility
  question (VC-FEASIBILITY-PROBE-NEEDED candidate) was resolved **VIABLE** with high-confidence static
  evidence — **and that verdict was later REFUTED by EXECUTE's Step 3.1 gate; see "Feasibility Probe
  Resolution" below for the correction.** Gap found (NEW, not anticipated by INNOVATE's
  Step-1 gate wording): default `lazy: true` tab-mount semantics mean the Order tab's nested Stack
  navigator only registers once the Order tab has been focused at least once in the session; a
  cold-start Home-banner tap (Order tab never visited this session) is a distinct code path from the
  "already visited" case the gate implicitly assumed. Resolved via execute-agent instruction E1
  (below); the plan's existing `navigate()`-based contingency already covers this case by design
  (navigate mounts lazily-loaded tabs on demand), so no new mechanism is required — only an explicit
  test-scope addition. No conflicts found. Highest-risk edit: the Home-banner cross-tab dispatch
  itself — already flagged in the plan's own Risk table; this finding refines its exact shape.
- Section: Step 4 (Deals one-line flip) — PASS. Confirmed no `SafeAreaView` in `deal/[dealId].tsx`
  (matches plan claim exactly). Step 4.2's unconditional clearance fix is well-reasoned given the
  file-tree-nested position regardless of the visibility-question outcome. Step 4.3's two-outcome
  branching correctly scopes any potential Outcome-B carve-out to a follow-up plan (proper
  application of the Hybrid Failure Resolution pattern) — no gaps or conflicts found.

### Feasibility Probe Resolution (mandatory Layer 2 item — INNOVATE's deferred VC-FEASIBILITY-PROBE-NEEDED)

**Hypothesis:** does `navigation.reset(...)`, dispatched via the Order tab's nested navigator ref
obtained from a CROSS-TAB caller (Home), correctly overwrite that tab's stack the same way it does
from a same-tab caller, under expo-router 57?

**Method:** cheap-local, no live provider — read the actual installed `expo-router@57.0.4` package
source and type declarations under `node_modules/.pnpm/expo-router@57.0.4_.../expo-router/build/`
(not training-data assumption).

**Findings (concrete, source-grounded):**
1. `apps/mobile/package.json` and the full pnpm store confirm ZERO separate `@react-navigation/*`
   npm dependency anywhere in the monorepo — but this does NOT mean expo-router lacks
   React-Navigation-equivalent behavior. `expo-router` 57.0.4 VENDORS a complete internal fork:
   `build/react-navigation/core/` (file-for-file matches `@react-navigation/core`'s real source
   tree — `useNavigationBuilder.js`, `BaseNavigationContainer.js`, `getActionFromState.js`, etc.)
   and `build/react-navigation/bottom-tabs/` (confirmed: `apps/mobile`'s `Tabs` component, imported
   as `import { Tabs } from 'expo-router'` in `_layout.ios.tsx`/`_layout.android.tsx`, resolves to
   `TabsClient.js`, which literally calls `createBottomTabNavigator()` from
   `../react-navigation/bottom-tabs`). This is real React-Navigation-equivalent code, internally
   packaged rather than externally depended on.
2. `expo-router`'s public `useNavigation(parent?: string | Href)` (`build/useNavigation.js`) is an
   OFFICIALLY DOCUMENTED convenience specifically for cross-navigator/cross-tab access from ANY
   component — its own JSDoc gives the exact matching scenario: `useNavigation('/orders/menu')`
   called from an arbitrary route to reach a DIFFERENT layout's navigator, regardless of current
   focus. Internally it resolves via `navigation.getParent(parentId)`, walking the navigation tree
   by ID — not by "what's currently focused."
3. `.reset(state)` (`build/react-navigation/core/types.d.ts:250`) is an UNCONDITIONAL method on the
   returned `NavigationHelpersCommon`/`NavigationProp` — no focus-gating in its type signature or
   the CommonActions `RESET` action contract (`build/react-navigation/routers/CommonActions.d.ts`).
   Resetting a specific navigator's state, once you hold its handle, does not depend on which
   screen currently has visual focus — this is the core mechanic nested/cross-tree action dispatch
   in React Navigation (and this fork) has always relied on.

**Verdict: ~~VIABLE (high confidence, static evidence — not a guess)~~ → REFUTED by EXECUTE
(17-07-26).** This verdict was wrong and the Step 3.1 empirical gate overturned it.

The error: `useNavigation(parent)` resolves its argument through `navigation.getParent(parent)` —
it walks **ancestors only**, and throws `Could not find parent navigation with route ...` otherwise.
The JSDoc example this verdict leaned on (`useNavigation('/orders/menu')`) is called from
*within* `app/orders/menu/`, so it reaches a **parent of the caller**. Home is a **sibling** of the
Order tab, not a descendant of it, so `useNavigation('/order')` from Home cannot obtain that handle
at all — the exact cross-tab case the fix exists for.

**Shipped mechanism (the plan's documented contingency):** a 2-step
`navigate(ORDER_TAB_NAME, { screen })` sequence realizing `[index, tracking/[orderId]]` — the
pattern the predecessor plan already verified on-device, which also mounts a lazy tab and so covers
the cold-start sub-case. See `features/orders/lib/navigate-to-tracking.ts`.

**Standing lesson (this is why the gate exists):** the vendored-fork evidence here was accurate;
the failure was inferring an API capability from a *documentation example* rather than from the
resolution code. A probe that reads examples can return a confident VIABLE on a structurally
impossible mechanism. Verify against installed source, and never let a probe verdict retire an
empirical gate.

**NEW finding beyond the original hypothesis (genuine value-add, not previously anticipated):**
default `lazy: true` bottom-tabs semantics (confirmed: no `lazy`/`unmountOnBlur` override anywhere
in `apps/mobile/src/app/(tabs)/_layout.*.tsx`) mean the Order tab's nested Stack navigator does not
mount/register in the navigation tree until the Order tab has been focused at least once in the
current session. A cold-start scenario (app freshly opened with a pre-existing active order, user
taps the Home banner without ever having visited the Order tab this session) is a materially
different code path from "Order tab already visited" — `useNavigation('/order')` could fail to
resolve the target navigator in that specific case. This is NOT a blocker: the plan's own documented
contingency (`navigate(name, { screen })`, dispatched via the always-available, unscoped Tabs-level
navigation handle) is exactly the tool designed to mount a not-yet-visited tab on demand, so it is
expected to already cover this case correctly. See execute-agent instruction E1.

**Residual uncertainty (small, honestly named, not fabricated away):** the exact resolved path-string
format for `useNavigation(parent)` when the target layout sits under a pathless route group (is it
`/order` or `/(tabs)/order`?) cannot be confirmed without a running instance — this is exactly what
the plan's own Step 3.1 "mandatory first" empirical check already exists to confirm, and needs no
new mechanism, only the explicit sub-case addition in E1.

### Open gaps

- None left unresolved. Both CONCERNs found (Step 2 / AC5 runtime-coupling; Step 3 / lazy-mount
  cold-start case) are fully specified via execute-agent instructions E1/E2 below — no design
  change, no new implementation mechanism, no known-gap. A plan-supplement cycle is recommended
  (not required to unblock EXECUTE) so this text lands durably in the plan's own Implementation
  Checklist rather than only in this contract; see Resume and Execution Handoff §5.
- Carried forward, pre-existing, project-wide, unrelated to this plan's own scope: no RN navigation
  E2E/simulator runner exists (`process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`).
  This is why 8 of the 14 test-gate rows above are honestly Agent-Probe.

### What This Coverage Does NOT Prove

- The 6 Fully-Automated gates prove: pure-function correctness of `resolveTabBarClearance` and
  `buildTrackingResetAction` in isolation; that `getFloatingTabBarClearance`'s public signature and
  numeric output are unchanged; that typecheck/lint/existing-suite stay green. They do NOT prove:
  real on-device visual correctness (no dead space, no flush-against-inset), real navigation-stack
  runtime behavior (does the reset actually execute correctly when dispatched from Home at runtime),
  or that the Step-1 mechanism check's chosen path (primary `reset()` vs `navigate()` contingency)
  was actually exercised correctly by EXECUTE.
- The 8 Agent-Probe gates prove exactly what the walkthrough covers on the specific device/simulator
  used, at the specific moment it is run. They do NOT provide CI-enforced regression protection for
  future changes — a later unrelated edit could silently reintroduce any of these bugs with no
  automated gate catching it. They also do NOT prove exhaustive OS/device coverage — only whatever
  device(s) the human walkthrough actually uses.
- Neither tier proves the cold-start lazy-mount sub-case (E1) has been exercised UNLESS the
  Agent-Probe walkthrough for AC4 explicitly includes it, per the updated Verification Evidence row
  and execute-agent instruction E1.

### Execute-agent instructions

- **E1** (Section: Step 3, trigger: before writing `navigate-to-tracking.ts`'s body, i.e. during
  Step 3.1's mechanism check): explicitly test the cross-tab reset from Home in BOTH (a) after
  having visited the Order tab earlier in the same session, and (b) a cold app start where the Order
  tab has never been visited this session. If (b) fails via `useNavigation('/order')`/`.getParent()`,
  fall back to the documented `navigate(name, { screen })` contingency for that path — do not
  silently assume warm-start behavior generalizes to cold-start. Record which mechanism was
  confirmed for EACH sub-case in the phase report's "Step-1 gate" section (not just one combined
  verdict).
- **E2** (Section: Step 2 / Step 1.3, trigger: at each of the 6 hardcoded `isNested=true` call sites
  in Step 2, plus the Step 4 Deals site): add a one-line doc comment stating the structural invariant
  the hardcoding relies on, e.g. `// This screen is always pushed inside a tab's Stack — never a tab
  root — so isNestedTabRoute() would also evaluate true here; hardcoded per INNOVATE's
  static-per-screen-fact decision (see PLAN "Locked Inputs").` This does not change behavior; it
  gives a future reader (or a future test) the coupling AC5 asks for, without reopening the locked
  design.

### Backlog artifacts to create during durable capture

- None new. The pre-existing `mobile-e2e-navigation-harness_NOTE_09-07-26.md` backlog note already
  covers the underlying test-infra gap this plan's Agent-Probe tier relies on.

### Known gaps on record

- None beyond the pre-existing, project-wide RN navigation E2E/simulator runner gap (documented
  above, not new to this plan).

### High-risk pack

Required: no. None of the 6 high-risk classes (auth/identity, billing/credits, schema/migration,
public API, deploy/container/gateway, secrets/trust-boundary) apply — this is pure UI/navigation
logic confined to `apps/mobile`.

### Accepted by:

session (autonomous, /goal execution) — both CONCERNs above (Step 2/AC5 runtime-coupling gap; Step
3/lazy-mount cold-start sub-case) are accepted as fully resolved via the execute-agent instructions
E1/E2 embedded in this contract, per the explicit autonomy grant through VALIDATE ("Autonomy is
ACTIVE through VALIDATE... The user has said they want to be consulted at EXECUTE time, not
before"). Gate is recorded CONDITIONAL (not PASS) per the net-gate convention that any CONCERN found
during V2/V3 — even one fully resolved in-contract — keeps the gate CONDITIONAL rather than PASS;
a plan-supplement cycle is recommended so E1/E2 land in the plan's own Implementation Checklist text
durably (see Resume and Execution Handoff §5), but is not a hard blocker to EXECUTE given both
concerns are already fully specified with no open design question remaining.

Note: per this task's explicit delegation constraint ("Do NOT modify source files. Your only write
is the ## Validate Contract section"), no `## Autonomous Goal Block` section was written to this
plan file and no other plan section was edited beyond this Validate Contract and the inline
"VALIDATE-confirmed"/"VALIDATE addendum" annotations added at the exact points they correct (Locked
Inputs, Blast Radius, Step 2.1/2.5, Step 3.1, Risks table) — these are minimal, load-bearing
corrections co-located with the claims they correct, not new sections. Per CLAUDE.md's "/goal Block
(Mandatory After VALIDATE)", the orchestrator is responsible for emitting the /goal copy-paste block
in chat after this VALIDATE pass completes; that responsibility is not delegated to this agent.
