---
name: spec:nav-005-shared-routes-top-level
description: "SPEC — NAV-005: kill the cross-tab-push residue bug CLASS by moving every shared screen out of tab-owned stacks to top-level (tabs)/ routes. Establishes the durable route-ownership rule. apps/mobile only."
date: 17-07-26
feature: none
---

# NAV-005 — Shared screens become top-level routes — SPEC

**Date**: 17-07-26
**Status**: LOCKED (design chosen by user; mechanics settled in INNOVATE)
**Feature**: none (general-plans)

## TL;DR

Seven screens live inside a tab's nested Stack but are pushed from outside that tab. Each one
strands its owning tab on a screen the user already left. Move all seven above the tabs. The
user has reported this bug three times (Notifications, Tracking, now Cart); patching instances
has failed twice. This SPEC locks the **rule**, not the instance.

---

## The bug class (one paragraph, plainly)

A screen that lives inside tab A's stack but is opened from tab B leaves tab A stuck. Pushing
`/(tabs)/order/cart` from Deals focuses the Order tab and leaves its stack `[index, cart]`. The
back control calls `router.back()`, which pops the **router history** (the tab switch) — not the
Order tab's stack. The user lands back on Home; Cart stays mounted. Tapping Order then shows
Cart. This is structural: while Cart belongs to the Order tab's stack, *being on Cart* **is**
*being in the Order tab*. No back-handler patch fixes it. `deals` never had the bug precisely
because it is a top-level route owned by no tab.

---

## User goals

| # | Goal |
|---|---|
| G1 | Opening a shared screen from any tab and pressing back returns to the **calling** tab. |
| G2 | No tab is ever left mounted on a screen the user has navigated away from. |
| G3 | The fix is applied to the **whole class**, not just the reported Cart instance. |
| G4 | The order flow (cart → checkout → payment → confirmation) keeps its natural back chain. |
| G5 | Nothing visually regresses: headers, safe-area insets, and bottom clearance stay as they are today. |

---

## The durable rule (the actual deliverable)

> **A tab's nested Stack owns ONLY its root plus screens reachable exclusively from that root.
> Any screen reachable from two or more places lives above the tabs, as a top-level `(tabs)/`
> route owned by no tab.**

A corollary that drives the cascade: **once a screen moves above the tabs, anything it pushes
into a tab is itself a cross-tab push.** So a moved screen's downstream chain must move with it.

---

## Key use cases

| # | Use case | Expected |
|---|---|---|
| U1 | Deals → Apply → Cart → back | Returns to Deals. Order tab still shows Order root. |
| U2 | Home → product card → Product Details → back | Returns to Home. Order tab unaffected. |
| U3 | Home → branch card → Branch Details → back | Returns to Home. Branches tab unaffected. |
| U4 | Account → Order History → back | Returns to Account. Order tab unaffected. |
| U5 | Cart → Checkout → Payment Method → back → back → back | Payment → Checkout → Cart → the tab that opened Cart. |
| U6 | Order History → Reorder → Cart → back | Returns to Order History. |
| U7 | Any moved screen while focused | Floating tab bar stays hidden, exactly as today. |
| U8 | Checkout with the countdown drawer open | Tab bar hidden (unchanged); footer conditional unchanged. |

---

## Scope

### In scope — 7 screens move above the tabs

`order/cart`, `order/checkout`, `order/payment-method`, `order/confirmation/[orderId]`,
`order/product/[productId]`, `order/history`, `branches/[branchId]`.

Plus: every push call site repointed; affected tab `_layout.tsx` files trimmed; tab-bar
visibility preserved per moved screen; three test files repointed.

### Explicitly out of scope — do not touch

`(tabs)/notifications/**`, `(tabs)/tracking/**`, `(tabs)/deals/**` (already top-level);
`(tabs)/_layout.{ios,android,web}.tsx` (`backBehavior="history"` already done);
`floating-tab-bar.tsx` / `floating-tab-bar.helpers.ts` (**FROZEN** — `resolveTabBarClearance`'s
signature and `isNested` param name must not change); `packages/ui/**` (`ScreenHeader` is final);
`(staff)/**`, `(auth)/**`, `(onboarding)/**`; the 5 tab roots; web.

**Screens that legitimately stay in their tab** (source-verified: reachable only from their own
tab root): `account/edit-profile`, `account/help`, `rewards/coupons`.

No new dependencies. No schema/auth/API surface. No visual redesign.

---

## Constraints surfaced during RESEARCH

| # | Constraint |
|---|---|
| C1 | **Naming collision.** `(tabs)/order` and `(tabs)/branches` are tab names. Moved screens cannot keep those folder paths — new top-level folder names are mandatory. |
| C2 | **Tab bar reappears by default.** A top-level route at its own stack root makes `isNestedTabRoute` false, so the bar shows. Every moved screen needs `useHideTabBarWhile(useIsFocused())`, placed above any early return (Rules of Hooks). |
| C3 | **`useHideTabBarWhile` is single-valued.** It writes one module-level boolean. A component may call it exactly **once**; `checkout.tsx`'s existing `useHideTabBarWhile(countdown !== null)` must be *replaced*, never supplemented. |
| C4 | **Clearance math does not change.** With the bar hidden, `resolveTabBarClearance(true, …)` stays correct verbatim. Comments only. |
| C5 | **Typed-routes codegen.** Paths change; `expo start` must regenerate the route tree before `tsc --noEmit`. `as Href` casting is banned. `expo start` on an occupied port prints "Skipping dev server" and regenerates nothing — use a free port and verify the tree actually changed. |
| C6 | **Deep-link consequence.** Every moved path changes. Any external deep link or stored push payload targeting an old path will 404. |
| C7 | **Branch state.** Repo is on `feat/menu-004-category-filter-polish` with an unrelated dirty `apps/admin` tree — not the `feat/nav-shell-screenheader` the brief assumed. Must be resolved before EXECUTE. |

---

## Acceptance criteria

| # | Criterion | Verifiable by |
|---|---|---|
| AC1 | U1 holds — Deals → Cart → back lands on Deals; Order tab shows its root. | Agent-Probe |
| AC2 | U2/U3/U4 hold — no tab is stranded from any cross-tab entry. | Agent-Probe |
| AC3 | U5 holds — the order flow back chain pops in order. | Agent-Probe |
| AC4 | U6 holds — reorder → Cart → back returns to Order History. | Agent-Probe |
| AC5 | U7/U8 hold — tab bar hidden on every moved screen; checkout countdown behavior unchanged. | Agent-Probe |
| AC6 | No moved screen loses its `ScreenHeader` or top inset in any return branch (incl. loading/error). | Source review + typecheck |
| AC7 | No old `/(tabs)/order/...` or `/(tabs)/branches/[branchId]` push path remains. | `grep` (Fully-Automated) |
| AC8 | `resolveTabBarClearance` signature and `isNested` param name unchanged. | `git diff` (Fully-Automated) |
| AC9 | All gates green at real baselines: mobile typecheck exit 0; vitest 43; jest 27; ui 71; lint 0 errors. | Fully-Automated |

**Honest position on proof:** AC1–AC5 — the entire point of this change — are **Agent-Probe
only**. `apps/mobile` has a jest/jest-expo component runner but **no E2E/navigation runner**.
Navigator back-stack residue cannot be asserted by any gate in this repo. This bug class has
been found by the user on-device three times and by automated gates zero times. The honest exit
state after EXECUTE is **CODE DONE, not VERIFIED.**

---

## Out-of-scope observations (noted, not fixed)

- Back from Order Confirmation pops to Cart (because `checkout.tsx:156` is `router.replace`).
  Pre-existing today; this move does not change it.
