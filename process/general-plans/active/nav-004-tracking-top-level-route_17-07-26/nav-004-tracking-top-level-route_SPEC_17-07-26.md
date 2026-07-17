---
name: spec:nav-004-tracking-top-level-route
description: "SPEC — NAV-004: move Order Tracking out of the Order tab's stack to a top-level (tabs)/tracking/ route so back returns to the caller and the Order tab is never left stuck on Tracking."
date: 2026-07-17
feature: none
---

# NAV-004 — Order Tracking as a top-level route — SPEC

**TL;DR** — Tracking currently lives inside the Order tab's stack, so entering it from Home and
pressing back leaves the Order tab stuck on Tracking. Move it to `(tabs)/tracking/`, mirroring the
NAV-002 Notifications fix. Design is user-locked; this SPEC records the requirements only.

---

## Goal

From any entry point, opening Order Tracking and pressing back returns the user to the **calling
screen**, and the **Order tab is left exactly as the user left it** — never showing Tracking.

## Problem (user-reported on device, orchestrator root-caused, source-confirmed)

Home's Active-Order banner → Order Tracking → back → lands on Home (**desired**). But tapping the
**Order tab then shows Tracking** — the user is stuck.

`useNavigateToOrderTracking` fires two `navigate` calls leaving the Order stack `[index, tracking]`.
`router.back()` pops the *router history* (whose top entry is the Home→Order tab switch), undoing the
tab switch without ever popping the Order stack. Tracking remains mounted inside the Order tab.

**Structural insight:** while Tracking lives inside the Order tab's stack, "being on Tracking" *is*
"being in the Order tab". Returning to Home while it stays mounted leaves residue **by definition**.
No back-handler patch can fix this. The route must stop belonging to a tab.

## Locked design decision (user's choice — NOT open for re-litigation)

Move Tracking to a **top-level route**, mirroring NAV-002 (Notifications). Rejected by the user:

| Rejected option | — |
|---|---|
| (b) Keep Tracking in the Order stack; make back pop to the Order root | Rejected |
| (c) Keep back→Home; reset the Order stack on exit | Rejected |

## Use cases

| # | Case |
|---|---|
| UC1 | Home Active-Order banner → Tracking → back → Home; Order tab unchanged |
| UC2 | Order History row → Tracking → back → Order History |
| UC3 | Order Confirmation "Track order" → Tracking → back → Confirmation |
| UC4 | Push notification deep link (`order_tracking`) opens Tracking at its new path |
| UC5 | Tracking's loading and error branches remain reachable, headed, and back-able |

## Acceptance criteria

| AC | Criterion | Tier |
|---|---|---|
| AC1 | Back from Tracking returns to the calling screen (Home / History / Confirmation) | Agent-Probe |
| AC2 | After returning, tapping the Order tab shows the Order tab's own screen — **never Tracking** | Agent-Probe |
| AC3 | Tracking renders no tab button and no tab appears active while on it | Agent-Probe |
| AC4 | The floating tab bar is **hidden** on Tracking, and **restored** after navigating away | Agent-Probe |
| AC5 | Behavior is identical from all 3 entry points | Hybrid (by construction + source) |
| AC6 | Push deep-link `order_tracking` resolves to the new path | Fully-automated |
| AC7 | Loading / error / loaded branches all keep `SafeAreaView edges={['top']}` + `ScreenHeader` | Fully-automated (typecheck) + source |
| AC8 | No dead exported code, no orphaned tests, no reference to the old path | Fully-automated (grep) |
| AC9 | Bottom device inset counted exactly once; no visual regression | Source-verified |

## Out of scope

`(tabs)/notifications/**`; `(tabs)/_layout.{ios,android,web}.tsx`; `floating-tab-bar.tsx` /
`.helpers.ts` (frozen — incl. `resolveTabBarClearance`'s signature and `isNested` param name);
`packages/ui/**` (`ScreenHeader` final); `(staff)/**`, `(auth)/**`, `(onboarding)/**`; the 5 tab
roots. The `(staff)` header double-padding is a separate known item. No new deps. No
schema/auth/API surface. Web out of scope.

## Constraints

- Stay on `feat/nav-shell-screenheader` (open PR #110). **Do not commit.**
- Use `git mv` to preserve history.
- Typed-routes codegen must be regenerated (`expo start`, then stop) before `tsc --noEmit`.
  **Never `as Href`-cast** to force a green typecheck.
- Known user-visible consequence: **already-delivered push notifications carrying the old
  `/(tabs)/order/tracking/[orderId]` path will no longer resolve.** Accepted (mock/local
  notification data only today).
