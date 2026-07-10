---
name: spec:brn-001-branch-locator
description: "Branch locator list view with search and distance — BRN-001 product requirements"
date: 10-07-26
feature: pickup-branches
---

# BRN-001: Branch Locator List View — SPEC

**Date:** 2026-07-10
**Issue:** BRN-001 (P0)
**PRD reference:** §6.3 Branch Locator

---

## Summary

Users need a way to find and choose a Jojo Potato pickup branch before placing an order. Right now the Branches tab is a placeholder — tapping it shows nothing useful. This screen gives users a scrollable list of all active branches, lets them search by name, and shows each branch's distance, hours, status, and a "Order from this branch" button. When the app has location permission it sorts closest-first; without it, branches appear in an admin-defined priority order. Branches that are closed or not accepting pickup have a visually disabled button so users can see what exists without being able to accidentally start an order they cannot complete.

---

## User Stories / Jobs To Be Done

**US-1 — Browse branches**
As a customer, I want to see all open Jojo Potato branches in a list, so that I can decide where to pick up my order.

**US-2 — Know how far away each branch is**
As a customer, I want to see each branch's distance from my current location, so that I can choose the most convenient one without guessing.

**US-3 — Search when I already know where I want to go**
As a customer, I want to filter the list by typing a branch name or area keyword, so that I can find a specific branch quickly without scrolling.

**US-4 — Know whether a branch is accepting orders right now**
As a customer, I want to see at a glance whether each branch is open and accepting pickup, so that I do not start an order only to discover the branch is closed.

**US-5 — Start an order from the branch I chose**
As a customer, I want to tap "Order from this branch" and be taken into the ordering flow for that branch, so that my order is correctly tied to the right location.

**US-6 — Graceful experience when location is denied**
As a customer who has denied location access, I want to still see all branches in a meaningful order (admin priority), so that I can still find and choose a branch.

---

## What The User Wants (Behavioral Outcomes)

**List display.** Every branch with `is_active = true` appears in the list. Inactive branches never appear, regardless of any other flag.

**Branch row content.** Each row in the list shows: branch name, address, distance from the user (or hidden if location is denied/unavailable), opening hours, open/closed status, pickup availability, estimated prep time, and an "Order from this branch" button.

**Distance sort.** When location permission is granted on iOS or Android, branches are ordered closest-first by straight-line distance. On web, distance sort is applied when the browser provides geolocation; if the browser cannot provide it, the priority-sort path is used instead.

**Priority sort (location denied or unavailable).** When the user has denied location access, or when geolocation is not available (web fallback), branches are sorted ascending by an admin-set priority number. The distance field is hidden entirely from each row in this state — users never see a blank or "unknown" distance value.

**Open/closed status.** A branch's open or closed status is derived from its stored opening hours relative to the current time. A branch that is within opening hours shows as open; outside those hours shows as closed.

**Disabled branches.** Any branch that is closed (outside opening hours) or has `is_accepting_pickup = false` is visually distinguished — greyed out or otherwise de-emphasized — and its "Order from this branch" button is disabled. The user can see the branch but cannot initiate an order from it.

**Search.** A search field at the top of the screen filters the visible list to branches whose names match what the user typed. Clearing the search restores the full sorted list.

**Starting an order.** Tapping an enabled "Order from this branch" button records which branch the user chose (as the selected ordering branch for the current session) and navigates to the Branch Details screen (`[branchId]` route, currently a placeholder) or the menu, where ordering continues.

**Web behavior.** The list renders and all non-distance features work on web (react-native-web). Distance is displayed only when the browser can provide geolocation; otherwise the priority sort and hidden-distance path are used.

---

## Flow / State Diagram

```
User opens Branches tab
         |
         v
  Request location permission
  (iOS/Android only; web uses browser geolocation API)
         |
    +----+----+
    |         |
 GRANTED    DENIED / UNAVAILABLE
    |         |
    v         v
Sort by     Sort by
distance    admin priority
(asc)       (asc)
Show dist   Hide distance
    |         |
    +----+----+
         |
         v
  Render branch list
  [for each branch with is_active = true]
  ┌─────────────────────────────────────┐
  │ Branch Name                         │
  │ Address · Distance (if available)   │
  │ Opening Hours · Open / Closed badge │
  │ Pickup: Available / Unavailable     │
  │ Prep time: ~N min                   │
  │ [Order from this branch] (CTA)      │
  └─────────────────────────────────────┘
  CTA state:
    is_accepting_pickup AND within hours → ENABLED
    is_accepting_pickup = false OR outside hours → DISABLED + greyed
         |
         v
  User types in search bar
         |
         v
  List filters to matching branches
  (same sort order maintained)
         |
         v
  User taps enabled CTA
         |
         v
  Selected branch stored (session)
  Navigate → Branch Details [branchId]
  (or Menu, per INNOVATE decision)
```

---

## Acceptance Criteria (Testable Outcomes)

**AC-1 — Active branches appear; inactive branches do not**
When the screen loads, every branch with `is_active = true` is shown in the list. No branch with `is_active = false` appears under any condition.
- proven by: manual verification — seed has jojo-mabolo marked inactive; it must not appear in any rendered list
- strategy: Hybrid (typecheck confirms type correctness; manual verification of rendered output against seed data)

**AC-2 — Distance sort when location is granted**
When the user grants location permission, branches are ordered ascending by distance from the user's position. Each row displays a distance value.
- proven by: manual verification on iOS/Android simulator with a mocked or real device location; confirm sort order matches haversine calculation from device coords to branch coords
- strategy: Hybrid

**AC-3 — Priority sort when location is denied; distance hidden**
When location permission is denied (or geolocation is unavailable on web), branches appear ordered by the admin priority field (ascending). No distance value is shown on any row.
- proven by: manual verification — deny location permission on iOS simulator; confirm branches are reordered by priority (jojo-poblacion priority vs jojo-it-park priority) and no distance text is visible
- strategy: Hybrid

**AC-4 — Admin priority field exists on active branches**
Each active branch has a non-null `priority` integer stored in the database. The seed data has priority values assigned for all three seeded branches. The API returns `priority` as part of the branch payload.
- proven by: `pnpm --filter @jojopotato/api test` (API smoke test confirms schema column exists); manual API call confirms priority is returned in the response
- strategy: Hybrid

**AC-5 — Open/closed status is correct relative to current time**
Each branch row shows "Open" when the current time falls within that branch's opening hours and "Closed" otherwise. The status matches what a person reading the stored hours would expect.
- proven by: manual verification — note the stored hours for a seeded branch; test at a time inside hours (expect Open) and outside hours (expect Closed); or mock the current time in the rendering logic
- strategy: Hybrid

**AC-6 — Disabled CTA for closed or pickup-unavailable branches**
A branch that is outside opening hours OR has `is_accepting_pickup = false` renders its "Order from this branch" button in a disabled/greyed state. Tapping that button does nothing — it does not navigate and does not set a selected branch.
- proven by: manual verification — jojo-it-park has `is_accepting_pickup = false`; confirm its CTA is disabled and non-navigable; also test a branch outside its opening hours window
- strategy: Hybrid

**AC-7 — Enabled CTA sets selected branch and navigates**
Tapping "Order from this branch" on an enabled row sets the selected ordering branch in app state and navigates to the Branch Details screen for that branch (`/branches/[branchId]`) without errors.
- proven by: manual verification — tap the CTA for jojo-poblacion (active, pickup on, within hours); confirm navigation to the correct route and that the selected branch ID is recorded
- strategy: Hybrid

**AC-8 — Search filters by branch name**
Typing in the search field reduces the visible list to branches whose names include the search text (case-insensitive). Clearing the field restores the full sorted list.
- proven by: manual verification — type "IT" into the search field; confirm only jojo-it-park appears (when it would otherwise be in the list). Type "xyz" and confirm empty results. Clear and confirm full list returns.
- strategy: Hybrid

**AC-9 — Branch row shows all required fields**
Each branch row displays: name, address, distance (when available), opening hours, open/closed badge, pickup availability indicator, estimated prep time, and the CTA button. No required field is missing or unlabelled.
- proven by: `pnpm typecheck` — the branch row component's props type must include all fields; manual visual inspection confirms all are rendered
- strategy: Hybrid

**AC-10 — Web renders the list without crashes; distance degrades gracefully**
Opening the Branches screen on web (via `pnpm web`) renders the branch list. When the browser cannot provide geolocation, no crash occurs and no distance value is shown; the priority sort is applied instead.
- proven by: manual verification in a browser where geolocation is blocked; confirm the list renders, priority sort is applied, and no distance text appears
- strategy: Hybrid

**AC-11 — TypeScript types compile cleanly**
Running `pnpm typecheck` across the whole monorepo after implementation produces zero type errors. The updated `PickupBranch` type and any new component props are type-safe.
- proven by: `pnpm typecheck` (must exit 0)
- strategy: Fully-Automated

**AC-12 — ESLint passes**
Running `pnpm lint` after implementation produces zero ESLint errors.
- proven by: `pnpm lint` (must exit 0)
- strategy: Fully-Automated

---

## Out Of Scope

- **Map view (BRN-003):** a map-based branch locator is explicitly deferred. This screen is list-only. No map component, map SDK dependency, or map-toggle UI.
- **Directions deep-link (BRN-004):** the "Directions" link mentioned in PRD §6.3 is deferred. The branch row has no directions button in this issue.
- **Full Branch Details screen content (BRN-002):** the CTA may navigate to the existing `[branchId]` placeholder route. Filling in that screen's content is BRN-002's scope, not this one.
- **Per-branch deals display:** showing available deals on each branch row or on the branch details screen is deferred to a separate issue.
- **Pickup scheduling / time slot selection:** choosing a pickup time window is not part of this screen.
- **Order cart and checkout flow:** this screen's only job is branch selection. Nothing about cart, payment, or order confirmation is in scope.
- **Push notifications for branch status changes:** real-time updates to open/closed status via websocket or push are out of scope; the status reflects data at load time (or on manual refresh).
- **Admin interface for branch management:** managing branch data (adding, editing, toggling active state, setting priority) is a backend/admin concern, not part of this mobile screen.

---

## Constraints

1. **Platform targets:** iOS and Android are primary. Web (react-native-web) must render the list and work without distance when geolocation is unavailable. Web is not excluded.
2. **Geolocation dependency:** `expo-location` must be added as a dependency and the location permission must be declared in `apps/mobile/app.json` for iOS/Android. Real device/simulator permission flow applies.
3. **Schema addition:** a `priority integer` column must be added to the `branches` table (Drizzle migration + seed values for all three seeded branches). This is a locked product decision.
4. **Existing `PickupBranch` type:** the shared type in `packages/types/src/pickup.ts` must be extended to include all fields returned by the API (`isAcceptingPickup`, `estimatedPrepMinutes`, `openingHours`, `phone`, `priority`, `distanceKm`). No existing consumer should break.
5. **Branch row fields (from DB):** `is_active`, `is_accepting_pickup`, `estimated_prep_minutes`, `latitude`, `longitude`, `opening_hours` (JSON string per-day), `name`, `slug`, `address`, `phone`, `priority`.
6. **Inactive branches never shown:** `is_active = false` is a hard filter — these branches must not be fetched or rendered.
7. **No shared fetch client yet:** the mobile app calls plain `fetch` against `env.apiUrl`. A shared non-auth fetch client may be introduced but is an INNOVATE-phase decision.
8. **No existing branch API endpoint:** a new API route for listing branches must be added. The mobile app has no branch data source today.
9. **Shared UI component library:** all UI must use `@jojopotato/ui` components and `theme.ts` tokens. One-off inline styles that duplicate theme values are not allowed. Whether to extend `BranchCard` or build a new list-row component is an INNOVATE decision.
10. **Disabled CTA must not navigate:** a disabled "Order from this branch" button must not trigger navigation or state changes. Expo Router navigation must not be reachable from that tap.
11. **TypeScript strict mode:** all new code must pass `pnpm typecheck` with zero errors.

---

## Open Questions

None. All product decisions and research facts provided in the task prompt are treated as resolved. Deferred implementation choices (BranchCard vs new component, state mechanism, is-open-now computation location, fetch client) are intentionally left to INNOVATE and are not open questions blocking this SPEC.

---

## Background / Research Findings

**From confirmed RESEARCH (provided in task prompt):**

- Real DB column for pickup flag is `is_accepting_pickup` (not `is_active_pickup`).
- Additional DB columns present and relevant: `estimated_prep_minutes` (int, default 15), `latitude` / `longitude` (numeric 9,6), `opening_hours` (text, JSON string per-day with `open` and `close` keys), `name`, `slug`, `address`, `phone`.
- Seed data: 3 branches — `jojo-poblacion` (active, pickup on, 15m prep, Cebu coords), `jojo-mabolo` (INACTIVE), `jojo-it-park` (active, pickup OFF, 20m prep, Cebu coords). No priority values exist yet — will be added via migration.
- No branch API endpoint exists in `packages/api/src/index.ts`. Mobile uses plain `fetch` against `EXPO_PUBLIC_API_URL`.
- `PickupBranch` type (`packages/types/src/pickup.ts`) currently only has: `id`, `name`, `address`, `latitude`, `longitude`, `isOpen` — missing `isAcceptingPickup`, `estimatedPrepMinutes`, `openingHours`, `phone`, `priority`, `distanceKm`.
- `BranchCard` in `packages/ui` is a compact chip rendering only name + isOpen. It is insufficient for the full branch row required by this screen.
- No "selected ordering branch" state seam exists in the app. One must be introduced.
- No haversine/distance utility exists in `packages/utils`. One must be added.
- Branches tab root (`apps/mobile/src/app/(tabs)/branches/index.tsx`) is currently a `<ComingSoon>` placeholder.

**Locked product decisions (user-approved, treated as fixed requirements):**
1. Admin-priority sort: add `priority integer` column to the branches schema, Drizzle migration, seed values for the 3 seeded branches.
2. Geolocation: add `expo-location` dependency and declare the location permission in `apps/mobile/app.json`. Real distance sort on iOS/Android when permission granted.
3. Web: distance degrades gracefully — if browser geolocation is unavailable, use the priority-sort path and hide distance. Web list rendering is required.

**Deferred to INNOVATE (not decided here):**
- Whether to extend `BranchCard` or create a new list-row component in `@jojopotato/ui`.
- Mechanism for "selected ordering branch" state (React Context, a store, or router param).
- Whether open/closed status is computed server-side or client-side.
- Whether to introduce a shared non-auth fetch client.

**PRD §6.3 excerpt (source of truth for product intent):**
- Display per branch: name, address, distance, opening hours, open/closed status, pickup availability, estimated prep time, directions link (deferred BRN-004), available deals (deferred), "Order from this branch" CTA.
- Default to list view. Map view is a stretch (BRN-003).
- Searchable by location text or branch name. Location denied → admin priority sort.
- User cannot place pickup orders from closed or unavailable branches.
