---
name: plan:nav-001-tab-clearance-back-stack
description: "SPEC — GitHub issue #96 (NAV-001, P0): separate tab-bar clearance from device safe-area inset on nested screens; fix the cross-tab push back-stack trap into order tracking. apps/mobile only."
date: 17-07-26
feature: none
---

# NAV-001: Tab Bar Clearance + Back-Stack Trap — SPEC

## Summary

**TL;DR:** Issue #96 asks for two things: (1) stop reserving ~65-70dp of dead tab-bar space on
screens where the bar is hidden, and (2) fix a back-stack trap where pressing back from Order
Tracking can land on a stale Product Details screen instead of the Order root. Research shows #1
as literally stated ("delete the clearance call") would cause a real regression — 5 of the 6 named
nested screens rely on that SAME call as their ONLY source of the device's bottom safe-area inset
(their `SafeAreaView` explicitly excludes `bottom`). The fix must **split "dead bar height" from
"safe-area inset"**, not delete the call. This SPEC also flags one issue-authored assumption
(Deals screens "must keep the bar") that a static read of the current code contradicts, and defers
that judgment to Agent-Probe rather than guessing. This is a P0 navigation-polish item, building on
top of the already-executed `fix-tab-bar-visibility-nav-trap_15-07-26` plan (referenced below) — it
does not redo that work, it fixes what that work explicitly declined to touch.

---

## User Stories / Jobs To Be Done

- **As a customer viewing my Cart, Checkout, a product's details, a branch's details, or my
  notification settings**, I want the "Place order" / checkout / add-to-cart buttons to sit close to
  the bottom of the screen (not floating in a large empty gap left over from a hidden tab bar), so
  the screen feels intentional rather than broken.
- **As a customer using a phone with a home-indicator gesture bar** (iPhone X-style, or any Android
  gesture-nav device), I want every screen's bottom-most button to stay clear of that system gesture
  area, so I never accidentally trigger a system gesture instead of tapping "Place order" — on
  EVERY screen, nested or root, not just the 5 tab roots.
- **As a customer who taps the "Active Order" banner on Home to check my order status**, I want to
  be able to press back (or the Order tab) and land back on a normal screen — not get stuck looking
  at a product I was browsing before I ever opened the order, and not have to press back multiple
  times through screens I don't remember visiting.
- **As a customer who opens Order History or an Order Confirmation screen and taps through to Order
  Tracking**, I want back to behave the same predictable way regardless of which of those three
  entry points (Home banner, Order History, Order Confirmation) I came from.
- **As a customer switching between tabs repeatedly**, I want the tab bar to always be in the
  correct visible/hidden state for wherever I currently am — never stuck showing/hiding based on
  where I used to be.

---

## What The User Wants (Behavioral Outcomes)

1. On each of the 5 tab-root screens (Home, Order, Rewards, Branches, Account), the floating tab
   bar is visible and sits above a small amount of intentional breathing room — unchanged from
   today.
2. On every screen pushed inside a tab's nested stack (Cart, Checkout, Product Details, Branch
   Details, Order History, Order Tracking, Notification Settings, and any other pushed screen), the
   tab bar is hidden, and any UI at the bottom of that screen sits close to the device edge —
   **but never flush against it.** The device's own safe-area inset (home indicator / gesture bar)
   is always respected, on every screen, whether or not the tab bar happens to be visible there.
3. The Product Details "Add to Cart" bar sits flush at the very bottom of its available space —
   no dead gap below it, but still clear of the device home indicator.
4. Opening an order from any of the three entry points — Home's Active-Order banner, Order History,
   or Order Confirmation — and then pressing back (hardware/gesture back, not just the tab icon)
   from Order Tracking lands the user on a sensible screen: the Order tab's root/menu, not a stale
   Product Details screen left over from earlier browsing.
5. Repeated tab switching never leaves the tab bar showing when it shouldn't, or hidden when it
   shouldn't.
6. The Deals list and Deal Details screens behave consistently and predictably with respect to the
   tab bar — whatever that correct behavior turns out to be once verified on-device (see Open
   Question #1).

---

## Flow / State Diagram

**A. Tab-bar visibility + clearance (per-screen, unaffected by which entry point was used):**

```
                     ┌────────────────────────┐
                     │   Any (tabs)/* screen   │
                     └───────────┬─────────────┘
                                 │
                    is this the tab's ROOT screen?
                    (Home / Order / Rewards / Branches / Account
                     — the un-pushed, index screen of that tab)
                       │                        │
                      YES                       NO (pushed/nested screen:
                       │                          cart, checkout, product
                       │                          details, branch details,
                       │                          history, tracking,
                       │                          notifications, ...)
                       ▼                        ▼
          ┌─────────────────────┐   ┌───────────────────────────┐
          │ Tab bar: VISIBLE     │   │ Tab bar: HIDDEN            │
          │ Bottom clearance =   │   │ Bottom clearance =         │
          │  bar height          │   │  device safe-area inset    │
          │  + safe-area inset   │   │  ONLY (never the bar       │
          │  + breathing room    │   │  height — the bar isn't    │
          │                      │   │  there)                    │
          └─────────────────────┘   └───────────────────────────┘
                                                 │
                              ALWAYS TRUE, regardless of branch:
                              content/buttons never sit flush against
                              the device home indicator / gesture bar
```

**B. Order Tracking back-stack (the trap issue #96 reports):**

```
Entry point A: Home "Active Order" banner
Entry point B: Order tab -> Order History -> tap a past order
Entry point C: Order tab -> place an order -> Order Confirmation -> "Track order"

     A / B / C
        │
        ▼
┌─────────────────────┐
│  Order Tracking      │
│  [orderId]            │
└──────────┬────────────┘
           │  user presses back
           │  (hardware/gesture back — NOT the tab icon)
           ▼
┌─────────────────────────────┐
│  BEFORE (defect):             │
│  From entry A, lands on        │
│  Product Details — a screen    │
│  the user was on BEFORE ever   │
│  touching the order flow.      │
│  From B/C, may behave           │
│  differently than from A.       │
├─────────────────────────────┤
│  AFTER (required):             │
│  From A, B, and C alike,        │
│  lands on the Order tab's       │
│  root/menu screen — same        │
│  outcome regardless of entry.   │
└─────────────────────────────┘
```

---

## Acceptance Criteria (Testable Outcomes)

Traced to issue #96's ACs (labeled `issue-AC#`). Tier is stated honestly — most of this surface has
no automated navigation/visual runner (see `## Constraints`), so most criteria are Agent-Probe. Two
criteria (5 and 6) are genuinely new Fully-Automated opportunities this SPEC unlocks that the prior
plan did not have available.

1. **Tab bar visible only on the 5 tab-root screens.** On each of Home / Order / Rewards / Branches
   / Account, with the nested stack at its root, the tab bar renders. On every pushed screen inside
   any of those 5 stacks, the tab bar does not render.
   `proven by:` on-device walkthrough across all 5 tabs, pushing at least one nested screen in each
   `strategy:` Agent-Probe
   *(traces: issue-AC1, issue-AC2 first half)*

2. **No screen — nested or root — ever places bottom content flush against the device's safe-area
   inset.** This is a hard, non-negotiable requirement, not a nice-to-have. It applies independent
   of tab-bar visibility.
   `proven by:` on-device walkthrough on a device/simulator with a non-zero bottom safe-area inset
   (home-indicator style), checking Cart's checkout bar, Checkout's "Place order" button, Product
   Details' add-to-cart bar, Branch Details, and Notification Settings
   `strategy:` Agent-Probe
   *(traces: issue's stated intent — the "no empty bottom gap" AC, inverted into its safety
   counterpart; this is the correction to the issue's framing described below)*

3. **No dead space is reserved on nested screens for a tab bar that is not rendered there.** The
   bottom clearance on a nested screen matches only what device safe-area + screen-local UI actually
   need — not the additional ~65-70dp the tab bar itself would have occupied.
   `proven by:` on-device visual comparison, before/after, on Cart, Checkout, Product Details,
   Branch Details, Notification Settings
   `strategy:` Agent-Probe
   *(traces: issue-AC2 second half, issue-AC4)*

4. **Back-stack trap fixed for all three entry points into Order Tracking.** From Home's
   Active-Order banner, from Order History, and from Order Confirmation, pressing back (hardware or
   gesture back, not the tab icon) from Order Tracking lands the user on the Order tab's root/menu
   screen — not on a stale screen from before the order flow was entered, and identically regardless
   of entry point.
   `proven by:` on-device walkthrough of all 3 entry points followed by a back press from Tracking
   `strategy:` Agent-Probe
   *(traces: issue's repro steps + "identical from Order History and Order Confirmation" AC)*

5. **The predicate deciding tab-bar visibility and the predicate computing bottom clearance derive
   from the same single source of truth** — a screen cannot end up in a state where it reserves
   clearance for a bar that visibility logic says is hidden, or vice versa.
   `proven by:` a unit/logic-level test asserting that, for a representative set of nested-state
   inputs, the visibility decision and the clearance-height decision never disagree
   `strategy:` Fully-Automated
   *(traces: issue's explicit requirement — "clearance should be derived from the same predicate
   that decides visibility")*

6. **The safe-area-inset component of clearance is computed correctly on both tab-root and nested
   screens**, independent of whatever the tab-bar-height component evaluates to.
   `proven by:` a unit/logic-level test on the clearance calculation, isolating the safe-area term
   `strategy:` Fully-Automated
   *(traces: the corrected "dead padding" framing — see below)*

7. **Deals list and Deal Details tab-bar behavior is verified, not assumed.** Whatever the correct
   on-device behavior is determined to be (see Open Question #1), it must be consistent and
   intentional — not an accidental side effect of `isNestedTabRoute`'s generic nested-route
   detection.
   `proven by:` on-device walkthrough of Deals list and Deal Details, cross-checked against
   whatever answer Open Question #1 resolves to
   `strategy:` Agent-Probe
   *(traces: issue-AC3 — stated as a regression guard, but see the correction below)*

8. **No regression to native header/back-button behavior on any nested screen.**
   `proven by:` on-device walkthrough confirming native header renders and back button pops
   correctly on at least one nested screen per tab
   `strategy:` Agent-Probe
   *(carried forward unchanged from the prior plan's AC2 — must still hold)*

9. **Existing regression guards continue to hold** (see `## Constraints` — these are not new
   behavior, they are non-negotiable "must not break"):
   - The checkout countdown-drawer bar-hide behavior (`useHideTabBarWhile`) still works.
   - `notification-factory.test.ts`'s pinned route path stays green and unchanged.
   `proven by:` `pnpm --filter @jojopotato/mobile test` (existing suite) stays green; on-device
   checkout-countdown walkthrough
   `strategy:` Fully-Automated (pinned-route regression) + Agent-Probe (checkout countdown visual)

10. **Repeated tab switching leaves the tab bar in the correct state every time** — no state drift
    across N switches.
    `proven by:` on-device walkthrough switching between all 5 tabs multiple times in sequence,
    including switches that occur while a nested screen is pushed in the tab being left
    `strategy:` Agent-Probe
    *(traces: issue's "does not leave the tab bar in a wrong visibility state" AC)*

---

## Out Of Scope

- **Web** (`_layout.web.tsx` / the platform-native web tab bar). Carried forward unchanged from the
  prior plan — iOS-first / Android-ready priority; web does not load `floating-tab-bar.tsx` at all
  (Metro platform-extension resolution), so this surface is structurally unaffected either way.
- **Building an RN navigation E2E/simulator runner** (Detox/Maestro/Playwright). This SPEC's
  Agent-Probe tier assignments are a consequence of that gap, not a decision this SPEC is allowed to
  make. Introducing such a runner is a separate, larger initiative — see
  `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`.
- **Re-implementing or reverting** the already-executed `fix-tab-bar-visibility-nav-trap_15-07-26`
  work (the `isNestedTabRoute` predicate, the tap-active-tab-resets-to-root behavior, the
  `floating-tab-bar.helpers.ts` extraction). This SPEC builds on top of it and fixes what it
  explicitly declined to touch (clearance) plus a gap it did not cover (cross-tab push back-stack).
- **Coupons, rewards, star accrual, or any non-navigation behavior** on any of the touched screens.
- **Redesigning the visual appearance of the tab bar itself** (colors, icons, animation timing) —
  only its visibility/clearance logic and the back-stack behavior are in scope.
- **Changing route file structure or route path strings.** The pinned route
  `/(tabs)/order/tracking/[orderId]` (guarded by `notification-factory.test.ts`) must not change.
- **A general safe-area-inset audit of every screen in the app.** Only the screens named in issue
  #96 plus the ones this SPEC's research identified as sharing the same clearance-call pattern are
  in scope (see Constraints for the full list).

---

## Constraints

- **Hard safety constraint (corrects the issue's framing):** the device's bottom safe-area inset
  must be respected on EVERY screen, nested or root, regardless of tab-bar visibility. The issue's
  "no empty bottom gap" framing, taken literally, would delete the ONLY source of that inset on 5 of
  the 6 named nested screens (their `SafeAreaView` explicitly sets `edges` to exclude `bottom`):
  `cart.tsx` (scroll content + footer Checkout button), `checkout.tsx` (scroll content + footer
  "Place order" button), `branches/[branchId].tsx` (top-only edges), `account/notifications.tsx`.
  The one exception is `features/menu/components/add-to-cart-bar.tsx`, which has no `SafeAreaView`
  at all today and already hand-rolls its own fixed bottom padding — it needs no new safe-area
  wiring, only confirmation its existing padding is adequate.
- **Must not remove or weaken the tab-root clearance.** The 5 tab-root screens (`(tabs)/index.tsx`,
  `order/index.tsx`, `branches/index.tsx`, `rewards/index.tsx`, `account/index.tsx`) plus `deals/*`
  (pending Open Question #1) continue reserving whatever clearance is correct for a visible bar.
- **Must not change any route path string.** `notification-factory.test.ts`'s pinned route
  `/(tabs)/order/tracking/[orderId]` must stay unchanged and green.
- **Must not break the checkout countdown-drawer bar-hide behavior** (`useHideTabBarWhile`), an
  orthogonal overlay mechanism unrelated to nested-route detection.
- **Must not reintroduce the tap-active-tab-does-nothing defect** the prior plan fixed — that
  behavior stays as-is.
- **No RN navigation E2E/simulator runner exists** (project-wide gap, documented in
  `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`). Every criterion
  above that concerns on-screen visual state or navigation-stack state is Agent-Probe by necessity,
  not by choice — do not claim automated coverage for it.
- **Always use `@jojopotato/ui` shared components** for any new UI touched by this work — no
  one-off screen markup (per repo-wide convention in `all-context.md`).
- **iOS-first, Android-ready** — `apps/mobile`'s stated platform priority; this SPEC does not extend
  scope to web.

---

## Open Questions

1. **Should the Deals list (`deals/index.tsx`) and Deal Details (`deals/deal/[dealId].tsx`) show
   the tab bar or hide it?** — **Owner: Agent-Probe verification during EXECUTE/VALIDATE, not this
   SPEC.** The issue states, as a regression guard, that both screens "still show the tab bar with
   correct clearance." But `deals` is registered as a sibling top-level route inside the `(tabs)`
   `Tabs` navigator (filtered from rendering as a tab BUTTON only by the `ICONS` allowlist in
   `floating-tab-bar.tsx`), and `deal/[dealId]` is a screen PUSHED inside that `deals` stack — the
   same structural shape (`state.index > 0` on a nested stack) that `isNestedTabRoute` uses to hide
   the bar everywhere else. A static read cannot determine whether the CURRENT app actually shows
   the bar on `deal/[dealId]` today or not — research could not resolve this headlessly.
   **Assumption recorded for downstream phases:** treat the issue's stated requirement (bar visible
   on both Deals screens) as the target outcome UNLESS on-device verification shows the current
   `isNestedTabRoute` behavior already hides the bar on `deal/[dealId]`, in which case: (a) if that
   already-hidden behavior is judged correct/intentional by the user during Agent-Probe, update this
   requirement rather than force a mismatch; (b) if it is judged a defect, `deals/index.tsx` is a
   genuine tab root (unaffected) and only `deal/[dealId]` needs an explicit carve-out from the
   generic nested-route predicate. Acceptance Criterion 7 above is written to cover both outcomes.
   INNOVATE should evaluate carve-out mechanisms (a per-screen exemption list, a route-name check,
   etc.) as implementation options — not decided here.
2. **Mechanism to unify the visibility and clearance predicates (Acceptance Criterion 5).** Multiple
   shapes are plausible — a shared hook, a shared context value, a static per-route lookup, or
   converging every remaining hand-rolled site onto the existing `SafeAreaView edges={['bottom']}`
   pattern already used by `coming-soon.tsx`. This SPEC deliberately does not choose between them —
   that decision belongs to INNOVATE.
3. **Whether the two Fully-Automated criteria (5 and 6) are achievable with the currently available
   `apps/mobile` vitest (pure-TS, no RN rendering) or require the newer jest/jest-expo RN
   component-test runner** (added 15-07-26, not available when the prior plan's validate-contract
   was written). Both runners now exist for `apps/mobile`; INNOVATE/PLAN should pick whichever fits
   the chosen implementation shape — a pure-logic predicate favors vitest (matching the prior plan's
   `floating-tab-bar.helpers.ts` precedent), while a hook/context-based unification may need the
   jest RN-component runner instead.

---

## Background / Research Findings

**Clearance conflation (root cause of issue #96's "dead padding" complaint):**
`getFloatingTabBarClearance(insetsBottom)` (`apps/mobile/src/components/floating-tab-bar.tsx:161-162`)
returns `BAR_CONTENT_HEIGHT (~65-70dp) + insetsBottom + Spacing.two + Spacing.four` — a single
number that conflates two genuinely different things: the tab bar's own dead visual height (only
relevant when the bar is actually rendered) and the raw device safe-area bottom inset (always
relevant, bar or no bar). All 5 of the issue's named nested screens set `SafeAreaView edges` to
exclude `bottom`, making this one call their ONLY source of bottom safe-area inset — so the issue's
literal ask ("delete the call") would cause a real regression (buttons flush against the home
indicator). The correct fix separates the two terms; it does not delete the call.

**Confirmed per-site detail (13 total `getFloatingTabBarClearance` call sites in the codebase):**
nested/non-root sites — `cart.tsx:301,414` (`edges={[]}`), `checkout.tsx:273,355`
(`edges={[]}`), `branches/[branchId].tsx:134` (`edges={['top']}`),
`account/notifications.tsx:80` (`edges={[]}`), `features/menu/components/add-to-cart-bar.tsx:48`
(no `SafeAreaView` at all — already self-contained fixed padding). Tab-root sites (correctly
unaffected) — `(tabs)/index.tsx:177`, `order/index.tsx:48`, `branches/index.tsx:283`,
`rewards/index.tsx:115`, `account/index.tsx:44`, `deals/index.tsx:47`,
`deals/deal/[dealId].tsx:73` (last two pending Open Question #1).

**Divergent existing patterns in the codebase:** `components/coming-soon.tsx:42` gates padding on
`!isNestedScreen` and lets `SafeAreaView edges={['bottom']}` supply the inset natively — this is
the pattern the issue implicitly wants generalized. The 5 real nested sites instead hand-roll the
inset via `getFloatingTabBarClearance`. Converging these two approaches is a candidate direction for
INNOVATE, not decided here.

**Visibility mechanism (already implemented, unchanged by this SPEC):**
`isNestedTabRoute(route)` (`floating-tab-bar.helpers.ts`, pure, zero RN imports, unit-tested) =
`route.state != null && route.state.index != null && route.state.index > 0`. `FloatingTabBar`
composes `isHidden = hidden (checkout countdown store) || isFocusedTabNested`. This predicate is a
single source of truth for the BAR's own visibility, but is NOT currently exposed to screens for
clearance purposes — screens compute clearance independently via the conflated
`getFloatingTabBarClearance` call. Criterion 5 requires these two decisions to share one source of
truth going forward.

**Back-stack trap — confirmed at 3 sites, all `router.push` (never `replace`), all landing inside
Order's nested `Stack`:** `order/history.tsx:60`, `order/confirmation/[orderId].tsx:140-143`, and
`(tabs)/index.tsx:188-192` (Home's `ActiveOrderBanner`, a CROSS-TAB push into Order's stack while
Order is not the focused tab). The already-executed prior plan's "tap-active-tab-resets-to-root"
fix (`floating-tab-bar.tsx` `onPress` handler) does NOT cover this case — it only fires when the
user taps the already-focused tab's own icon. It misses: (a) the cross-tab push itself (the stack
silently accumulates `product/[productId] → tracking/[orderId]` while the user is on Home), and (b)
a plain hardware/gesture back press from Tracking (no tab-icon tap involved at all). Available React
Navigation / Expo Router primitives for the fix (INNOVATE to choose among, not this SPEC):
`router.replace` (swaps only the current top screen, does not clear deeper stack members),
`router.dismissTo` / `navigation.popTo` (pops to a specific named route, clearing everything pushed
above it), `navigation.reset`.

**Predecessor work (do not re-litigate):**
`process/general-plans/active/fix-tab-bar-visibility-nav-trap_15-07-26/` (plan + report, both
read in full for this SPEC) already delivered: the `isNestedTabRoute` bar-visibility predicate, its
extraction into a pure `floating-tab-bar.helpers.ts` module (unit-tested under vitest node-env), and
the tap-active-tab-resets-to-root fix for the SAME-tab re-tap case. That EXECUTE report explicitly
declined the clearance cleanup as a NO-EDIT decision ("all ~13 call sites audited... NOT confirmed
dead padding... removing them risks content/buttons flush to the device home indicator... left
untouched") — this SPEC exists specifically to resolve that declined item correctly (split the two
terms) rather than reopen the same wrong solution (delete the call). It also did not cover the
cross-tab-push / plain-back-press cases now confirmed in issue #96's repro steps.

**Test-runner landscape (as of this SPEC, newer than the prior plan's validate-contract):**
`apps/mobile` now has BOTH a pure-TS vitest runner (`*.test.ts`, node env, no RN rendering — the
runner the prior plan's `isNestedTabRoute` unit test used) AND, added 15-07-26 (after the prior
plan's validate-contract was written), a real RN component-test runner (`jest`/`jest-expo`,
`*.test.tsx`, via `test-utils/render.tsx` + `jest-setup.ts`). No RN navigation/E2E runner
(Detox/Maestro/Playwright) exists for either. See Open Question 3 for how this affects Criteria 5/6.

**Communication-standards note:** this SPEC deliberately states the safe-area hard constraint as
its own Acceptance Criterion (2) rather than only a Constraint, because the issue's literal request
would violate it if implemented naively — this is the single most important correction this SPEC
makes to the issue as filed.
