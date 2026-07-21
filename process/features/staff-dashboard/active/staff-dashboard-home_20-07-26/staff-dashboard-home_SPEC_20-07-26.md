---
name: spec:staff-dashboard-home
description: Product-discovery SPEC for STAFF-005 (GitHub #106) — real staff dashboard home screen + prep-time autofill bug fix
date: 20-07-26
feature: staff-dashboard
---

# SPEC — Staff Dashboard Home + Prep-Time Autofill Fix

GitHub issue: #106 (STAFF-005, P1)
Task folder slug: `staff-dashboard-home_20-07-26` (deliberately NOT `staff-005`/`staff-005-pickup-code`
— that slug is already taken by the unrelated, already-shipped "Enter Pickup Code" feature at
`process/features/staff-dashboard/active/staff-005-pickup-code_15-07-26/`. Confirmed collision from
RESEARCH; this SPEC uses a distinct slug on purpose.)

## Summary

Today the staff landing screen is just a menu — five nav cards and nothing else. A staff member has
to tap into a separate screen to find out anything about what's happening at their branch right now.
This work turns that landing screen into a real dashboard: at a glance, staff see how many orders
need attention, whether the branch is currently accepting pickups, and what prep-time estimate
customers are being quoted. Separately, this work fixes a real bug: the prep-time field in Branch
Pickup Settings sometimes shows up blank instead of showing the branch's actual saved value, which
is confusing and risks a staff member overwriting a real setting with a guess.

## User Stories / Jobs To Be Done

1. **As a branch staff member**, I want to see live order counts and branch status the moment I open
   the app, so that I know whether I need to act right now without navigating anywhere.
2. **As a branch staff member**, I want the dashboard to only ever show my own branch's data, so that
   I never see or act on information that belongs to a different branch.
3. **As a branch staff member**, I want the 5 existing menu options (Active Orders, Completed Orders,
   Product Availability, Branch Pickup Settings, Enter Pickup Code) to keep working exactly as they do
   today, so that this change is additive, not a navigation regression.
4. **As a branch staff member**, I want the numbers on the dashboard to reflect reality — not stale
   numbers from before an order changed status — so that I can trust what I'm looking at.
5. **As a branch staff member**, when I open Branch Pickup Settings, I want to see the actual current
   prep-time estimate already filled in, so that I can trust the field and only change it when I
   actually want to.
6. **As a branch staff member**, I want an edit to prep time to reliably save and to actually affect
   the ETA shown to customers on their next accepted order, so that the number I set means something.
7. **As a branch staff member using either the dashboard or pickup settings in dark mode**, I want the
   screen to look and read correctly, so that it isn't a jarring or unreadable experience at night.

## What The User Wants (Behavioral Outcomes)

**Dashboard home screen:**
- On load, the staff landing screen shows, for the signed-in staff member's assigned branch only:
  - How many orders are currently active, broken out in a way that lets staff tell "needs my
    attention now" (awaiting acceptance) apart from "already in progress" (accepted/preparing/
    flavoring/ready).
  - Whether the branch is currently accepting pickup orders (on/off state).
  - The branch's current prep-time estimate (the number customers' ETAs are based on).
- These numbers update on their own on a reasonable cadence, and also refresh naturally when the
  user returns to the screen (e.g. backgrounds the app and comes back, or navigates back from another
  staff screen) — a staff member should not have to force-quit the app to see a status change.
- The 5 existing nav cards remain, unchanged in behavior, below/alongside the new status information.
- A staff member assigned to Branch A can never see Branch B's counts or state, under any
  circumstance, including by manipulating the request.

**Prep-time bug fix:**
- Opening Branch Pickup Settings always shows the branch's real, currently-saved prep-time value in
  the field — never blank, never a stale/wrong value — regardless of whether this is the first time
  the screen has been opened this session or a repeat visit.
- The value shown does not flicker to empty and back, or disappear, at any point during or after the
  screen finishes loading.
- Editing the value and saving persists it; leaving and reopening the screen shows the saved value.
- Leaving the screen without saving never clears, zeroes, or otherwise mutates the stored value.
- After a prep-time change is saved, the next order a staff member accepts derives its customer-
  facing ETA from the new value (this is an existing, correct backend behavior — this work must not
  break it, and must prove it still holds).

## Flow / State Diagram

```
Staff app launch / return to foreground
         │
         ▼
 (staff)/index.tsx  [Dashboard Home]
         │
         ├── fetch branch name (existing, one-shot)
         ├── fetch active-branch orders (existing 10s poll)
         │     └── derive: awaiting-acceptance count, active-by-status counts
         ├── fetch branch settings (existing, near-immediate refetch)
         │     └── derive: isAcceptingPickup, estimatedPrepMinutes
         │
         ▼
 [Dashboard renders: branch name + live counts + accepting state + prep time]
         │
         ├──tap──► Active Orders        (existing screen, unchanged)
         ├──tap──► Completed Orders     (existing screen, unchanged)
         ├──tap──► Product Availability (existing screen, unchanged)
         ├──tap──► Branch Pickup Settings ──────────────┐
         ├──tap──► Enter Pickup Code    (existing screen, unchanged)
         │                                               ▼
         │                                    [Branch Pickup Settings]
         │                                       On mount:
         │                                       - show REAL saved prep time
         │                                         (never blank on revisit)
         │                                       - show REAL accepting-pickup state
         │                                               │
         │                              edit + save ─────┤
         │                                               ▼
         │                                  PATCH persists → screen shows
         │                                  saved value on next open
         │                                               │
         │                              leave w/o save ──┤
         │                                               ▼
         │                                  stored value UNCHANGED
         │
         ▼ (back)
 [Dashboard reflects any changed state within the agreed refresh cadence]

Cross-branch guard (always-on, every request):
  staff session → requireStaff → resolveBranchScope(userId) → assertBranchScope(assigned, requested)
  mismatch ──► 403, no data returned, regardless of screen
```

## Acceptance Criteria (Testable Outcomes)

1. **Dashboard shows live, branch-scoped state on load.**
   The staff landing screen displays, for the signed-in staff member's own assigned branch: an
   awaiting-acceptance order count, a count of other active (non-terminal) orders, the branch's
   accepting-pickup state, and its current prep-time estimate — all visible without any additional
   navigation.
   `proven by:` staff-dashboard-home count-derivation unit tests (pure function) + Agent-Probe visual
   walkthrough (dashboard render).
   `strategy:` Hybrid.

2. **Branch isolation is never violated.**
   A staff member assigned to Branch A cannot see Branch B's counts or state, and any request for
   another branch's data is rejected (403), whether triggered through normal UI navigation or a
   direct/tampered request.
   `proven by:` existing `require-staff` branch-scope integration test suite pattern, extended if any
   new endpoint is introduced; regression assertion that all dashboard data flows through the existing
   `requireStaff` → `resolveBranchScope` → `assertBranchScope` chain with zero bypass.
   `strategy:` Fully-Automated.

3. **Dashboard counts match the Active Orders screen for the same branch at the same moment.**
   The numbers shown on the dashboard are computed from the same underlying order data the Active
   Orders screen uses — they are never a separately-sourced or differently-filtered count that could
   disagree.
   `proven by:` unit test asserting the dashboard's count-derivation function and the Active Orders
   screen consume the same status taxonomy (`STAFF_STATUS_CONFIG`) and the same data source
   (`useStaffOrders`), so they cannot structurally diverge.
   `strategy:` Fully-Automated.

4. **All 5 existing nav cards still work.**
   Active Orders, Completed Orders, Product Availability, Branch Pickup Settings, and Enter Pickup
   Code all navigate to their existing destinations exactly as before this change.
   `proven by:` Agent-Probe navigation walkthrough (no automated RN screen/navigation runner exists in
   this repo — documented, standing project-wide gap, not new to this SPEC).
   `strategy:` Agent-Probe.

5. **Dashboard reflects order-status changes without a stale read.**
   After an order's status changes (e.g. staff accepts a pending order), the dashboard's counts
   reflect that change within the agreed refresh cadence (on-poll and on-focus/return-to-screen) —
   a staff member is never staring at counts stale enough to be actively wrong once they've spent a
   normal amount of time on the screen.
   `proven by:` Agent-Probe walkthrough (accept an order, observe dashboard count decrement within the
   polling window); refresh-cadence choice itself documented as a decision for INNOVATE/PLAN (see Open
   Questions).
   `strategy:` Agent-Probe.

6. **Branch Pickup Settings shows the real, currently-saved prep-time value on open — never blank.**
   This holds on first-ever visit AND on every subsequent revisit within the same app session,
   including when the screen's data was already cached from a prior visit.
   `proven by:` a real regression test that reproduces the cache-revisit path (mount the settings
   screen with pre-populated cache data simulating a revisit, assert the prep-time field is non-empty
   and matches the cached value on the very first render) — this is the primary, must-fix bug; a
   Known-Gap is NOT acceptable here since the bug is deterministically reproducible and root-caused.
   `strategy:` Fully-Automated.

7. **The prefilled prep-time value does not disappear after render or hydration.**
   Once shown, the value stays visible and correct through any background refetch that may occur
   while the user is on the screen (unless the user is actively mid-edit — see AC9).
   `proven by:` the same regression test family as AC6, plus an explicit case for a background refetch
   resolving after initial mount.
   `strategy:` Fully-Automated.

8. **Editing and saving prep time persists it correctly.**
   After changing the value and saving, reopening Branch Pickup Settings (fresh navigation) shows the
   saved value, not the old one and not empty.
   `proven by:` existing `PATCH /api/staff/branch` integration test coverage (already validates
   persistence) + a client-side test asserting the screen re-seeds from the server response after a
   successful save.
   `strategy:` Fully-Automated.

9. **Navigating away without saving never clears or zeroes the stored value.**
   Leaving the settings screen mid-edit, without tapping save, leaves the branch's stored
   `estimated_prep_minutes` exactly as it was before the screen was opened.
   `proven by:` regression test asserting no mutation request is ever sent except on explicit save
   (i.e. no auto-save-on-unmount / no implicit PATCH); this also requires an explicit decision on the
   secondary mid-edit-refetch-stomp risk identified in RESEARCH (see Open Questions / Constraints) —
   the plan must state whether it fixes or explicitly accepts that risk as a documented known-gap.
   `strategy:` Fully-Automated.

10. **A prep-time change correctly changes the customer ETA on the next accepted order.**
    This is an existing, already-correct backend behavior (STAFF-003 AC-6: ETA is derived from
    `branches.estimated_prep_minutes` at accept-time). This work must not regress it.
    `proven by:` re-run of the existing STAFF-003 ETA-derivation integration test as a regression
    guard; no new backend logic is expected, but the test must be confirmed still green.
    `strategy:` Fully-Automated.

11. **Dashboard and Pickup Settings render correctly in light and dark mode.**
    All new/changed UI reads theme tokens via `mode: ThemeMode` from `useColorScheme()` (or an
    already-mode-aware parent), never hardcodes colors, and passes the repo's `guard:theme-mode`
    check.
    `proven by:` `pnpm --filter @jojopotato/mobile guard:theme-mode` (already covers all
    `@jojopotato/ui` component call sites) + Agent-Probe visual check in both modes.
    `strategy:` Hybrid.

## Out Of Scope

- Any change to how `is_accepting_pickup` or `estimated_prep_minutes` are edited from the **admin**
  side (`apps/admin`) — this SPEC covers the staff mobile surface only.
- Adding a new staff-writable toggle for accepting-pickup state on the dashboard itself — the
  dashboard in this SPEC is read/display only for that state; toggling it (if desired) is a
  separate, future decision.
- Building a general pull-to-refresh mechanism (UX-004) — reusing existing poll/refetch behavior is
  in scope; a new pull-to-refresh gesture is explicitly NOT required by this issue and is only a
  candidate to flag for INNOVATE if it turns out to be trivial to add opportunistically.
- Reconciling the STAFF-004 (product availability) task folder's stale documentation/report gap —
  noted as a known pre-existing issue, not touched here.
- Building a new aggregate backend endpoint as a hard requirement — whether to add one is an
  INNOVATE-level implementation decision, not a requirement of this SPEC (see Open Questions).
- Any change to the pickup-code feature (`staff-005-pickup-code_15-07-26`) — unrelated, already
  shipped, and not to be confused with this task despite adjacent issue numbering.
- Adding automated RN screen/navigation/E2E test coverage as a general capability — this SPEC uses
  Agent-Probe for screen-render/navigation ACs per existing project-wide precedent, and does not
  attempt to close that infrastructure gap.

## Constraints

- All staff data access MUST continue to flow through the existing `requireStaff` →
  `resolveBranchScope` → `assertBranchScope` middleware chain, applied once at the `/api/staff/*`
  router level. No new route may bypass it.
- All new/changed UI in `apps/mobile` MUST follow the mandatory `mode: ThemeMode` convention — no
  component may default or hardcode a theme, and the `guard:theme-mode` CI-adjacent script must stay
  green.
- Must reuse existing staff hooks (`useStaffOrders`, `useStaffBranchSettings`, `useStaffMe`) rather
  than inventing parallel data-fetching paths, unless INNOVATE determines an aggregate endpoint is the
  better tradeoff — either way, branch-scoping and existing polling/staleTime behavior must be
  respected, not silently changed for unrelated screens.
- The prep-time bug fix must address the primary root cause identified in RESEARCH (stale react-query
  cache object aliasing the local `seededSettings` state on revisit, `branch-pickup-settings.tsx:29-43`)
  at minimum. The secondary risk (a background refetch stomping a mid-edit, unsaved value) must be
  explicitly decided — fixed, or consciously accepted and documented as a known-gap — not silently
  ignored.
- No automated RN screen/E2E test runner exists in this repo (project-wide, pre-existing gap). Any
  acceptance criterion whose proof requires actually rendering and interacting with a screen is
  Agent-Probe by necessity, not a shortcut taken by this SPEC.
- Backend changes, if any, must not alter the `PATCH /api/staff/branch` validation contract
  (`z.number().int().min(1).max(120)`) or `orders.ts`'s existing ETA-derivation-at-accept-time
  behavior without an explicit, separately-justified reason.

## Open Questions

All of the following were investigated during RESEARCH and are being explicitly deferred to
INNOVATE as implementation-approach decisions, not left unresolved as blocking intent gaps — this
SPEC locks the *requirement*, INNOVATE locks the *how*.

1. **Exact dashboard metrics shown** — Owner: INNOVATE. Recommendation carried forward from RESEARCH:
   show all four of (awaiting-acceptance count, other-active-by-status counts, accepting-pickup
   state, current prep-time), since all four are already derivable from existing hooks at zero
   additional backend cost.
2. **Refresh model** — Owner: INNOVATE. Recommendation carried forward: reuse `useStaffOrders`'s
   existing 10s poll for order counts and `useStaffBranchSettings`'s existing `staleTime: 0` /
   refetch-on-focus for pickup state and prep time; do not build new pull-to-refresh infrastructure
   for this issue.
3. **Aggregate `GET /api/staff/summary` endpoint vs. client-side composition from existing hooks** —
   Owner: INNOVATE. Recommendation carried forward: default to client-side composition (zero backend
   work, all data already available) unless INNOVATE finds a concrete reason (payload size, request
   count, consistency-in-a-single-read) to justify a new endpoint.
4. **Secondary prep-time bug (mid-edit background-refetch stomp)** — Owner: PLAN (following
   INNOVATE's decision). Must be explicitly fixed or explicitly accepted as a documented known-gap;
   silently doing neither is not acceptable per this SPEC's Constraints.

None of these are open *intent* questions — the user-facing requirement is locked in this SPEC. They
are implementation-approach decisions appropriately deferred to INNOVATE/PLAN.

## Background / Research Findings

**Prep-time bug root cause (high confidence, from RESEARCH):** in
`apps/mobile/src/app/(staff)/branch-pickup-settings.tsx:29-43`, `useStaffBranchSettings()` uses
`staleTime: 0`, but react-query's cache entry survives across mounts (~5 min `gcTime`). The screen
seeds local state via `useState(settings)` at line 34, capturing whatever `settings` object is
already in cache on that very first render. Its subsequent seed-effect only fires
`if (settings !== seededSettings)` (line 38) — but on a cached revisit, `settings` and the
`useState` initializer's captured value are the SAME object reference from the first render, so the
seed effect never fires and `prepTimeText` stays at its initial `''`. This is a purely client-side
display/hydration bug — the backend round-trip (`PATCH /api/staff/branch`, `staff.ts:574-613`,
validated via `z.number().int().min(1).max(120)`) is confirmed correct, and STAFF-003's ETA
derivation at order-accept time (`staff.ts:330-336`, defaults to 15 if null) already correctly reads
whatever value is persisted.

**Secondary risk (documented, not yet decided):** the same `staleTime: 0` setting means a background
refetch can resolve while a user is mid-edit (before tapping save), and the re-seed effect could
stomp an unsaved, in-progress edit. This is a real but distinct risk from the primary bug — it must
be explicitly decided (fix vs. accept) rather than silently left alone.

**Everything needed for the dashboard already exists — no backend work is strictly required:**
- `useStaffOrders()` → `StaffOrderSummary[]`, already polling every 10s (paused when backgrounded),
  query key `['staff','orders']`. Active-by-status and awaiting-acceptance (status === 'pending')
  counts are derivable client-side using `STAFF_STATUS_CONFIG`'s 5 non-terminal statuses.
- `useStaffBranchSettings()` → `{ isAcceptingPickup, estimatedPrepMinutes }`, `staleTime: 0`, query
  key `['staff','branch']`.
- `useStaffMe()` → branch name, one-shot, already used by `(staff)/index.tsx` today.
- All `/api/staff/*` routes already inherit `requireStaff` + `resolveBranchScope` once at router
  mount (`staff.ts:85-90`) — branch isolation is structurally guaranteed already; nothing in this
  work may bypass that.

**Refresh-model precedent:** Active Orders already polls every 10s (established by STAFF-002).
Branch settings already uses `staleTime: 0` (near-immediate refetch on mount/focus). Completed
Orders and `me` do not poll. No pull-to-refresh gesture exists anywhere in the staff surface today
(UX-004 not yet implemented) — would be genuinely new infrastructure if chosen.

**Dark-mode constraint (hard, non-negotiable, from repo-wide convention):** every `@jojopotato/ui`
component requires an explicit `mode: ThemeMode` prop with no default, enforced by
`apps/mobile/scripts/check-theme-mode.mjs` (27 components / 184 call sites, CI-adjacent guard). Both
target screens already comply (`index.tsx:50-51` and `branch-pickup-settings.tsx:26` both derive
`mode` from `useColorScheme()`). New dashboard UI must follow the same pattern.

**Existing nav cards to preserve** (`index.tsx:15-41`, rendered at `index.tsx:84-99`): Active
Orders, Completed Orders, Product Availability, Branch Pickup Settings, Enter Pickup Code.

**Test-runner reality:** no RN screen/E2E runner exists in this repo (project-wide gap, tracked at
`staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`). Pure-logic helpers (e.g. a count-derivation
function extracted from the order list) ARE testable via the existing `apps/mobile` node-env vitest
runner. `packages/api` has vitest+supertest for any backend changes. UI hydration/render behavior for
the ACs that require it is Agent-Probe, consistent with every other staff screen precedent in this
repo.

**Naming-collision note:** `staff-005` and `staff-005-pickup-code` are already used by
`process/features/staff-dashboard/active/staff-005-pickup-code_15-07-26/`, an unrelated, already-
shipped "Enter Pickup Code" feature. This SPEC's task folder deliberately uses the
`staff-dashboard-home_20-07-26` slug to avoid collision, confirmed during RESEARCH.

**Doc-drift note (informational only, out of scope for this SPEC):** the STAFF-004 task folder
(`staff-004-product-availability_14-07-26/`) has no REPORT file and its plan still says "pending
VALIDATE" despite the code being fully shipped. Flagged as a known pre-existing gap; not to be fixed
as part of this work.
