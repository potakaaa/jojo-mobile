---
name: spec:brn-002-branch-details
description: "Branch Details screen with deals list, directions, and Order CTA — BRN-002 product requirements"
date: 10-07-26
feature: pickup-branches
---

# BRN-002: Branch Details Screen — SPEC

**Date:** 2026-07-10
**Issue:** BRN-002 (P0) — absorbs BRN-004 (Directions)
**PRD reference:** §6.3 Branch Locator, §6.8 In-App Exclusive Deals, §7 Navigation

---

## Summary

After a user picks a branch from the locator list (BRN-001), they land on a Branch Details screen. This screen shows everything they need to decide whether to order from that branch: full address, phone, opening hours with today's open/closed status, distance from their location, estimated prep time, pickup availability, and a live list of deals active at that branch. A directions link opens the native maps app so the user can navigate there. An "Order from this branch" button — disabled when the branch is closed or not accepting pickup — lets them commit to ordering and carries them into the ordering flow.

This issue also delivers the directions feature previously tracked as BRN-004: a working platform-aware deep link to Apple Maps (iOS), Google Maps via geo URI (Android), and Google Maps web URL (web).

---

## User Stories / Jobs To Be Done

**US-1 — See full branch information**
As a customer who has selected a branch from the list, I want to see its complete details (name, address, phone, hours, status, distance, prep time, pickup availability) in one place, so that I can confirm it is the right branch before committing to an order.

**US-2 — Know whether the branch is open right now**
As a customer, I want to see the current open/closed status and the branch's opening hours displayed in a readable format, so that I am not surprised when I arrive or try to place an order.

**US-3 — See deals available at this branch**
As a customer, I want to see the deals I can use at this specific branch, so that I can factor savings into my decision before ordering.

**US-4 — Get directions to the branch**
As a customer, I want to tap a directions link and have my native maps app open with the branch's location ready to navigate, so that I can find the branch without manually copying an address.

**US-5 — Order from this branch (or see why I cannot)**
As a customer who is ready to order, I want to tap "Order from this branch" to set this as my active ordering branch, so that my order is tied to the correct location. If the branch is closed or not accepting pickup, I want the button to be visibly disabled so I understand why I cannot order from it right now.

---

## What The User Wants (Behavioral Outcomes)

**Screen entry.** The screen is reached by tapping a branch in the BRN-001 locator list. Only the branch's ID is passed via navigation; the screen fetches all detail data itself using that ID. The header shows "Branch Details" (already set by the branches stack layout).

**Full branch fields.** The screen displays: branch name, address, phone number, current open/closed status, opening hours in a human-readable format (e.g. "Mon–Thu 9:00 AM – 9:00 PM"), distance from the user's location (when available), estimated pickup prep time, and pickup availability status (accepting orders or not).

**Opening hours display.** Opening hours are stored as a per-day JSON structure. The screen shows them in a format a customer can read at a glance — not raw JSON. The exact presentation (grouped days, collapsible, etc.) is an INNOVATE/design decision; the SPEC requires only that the hours are legible and correct.

**Open/closed status.** The current status (Open or Closed) is computed from the stored opening hours relative to the current time, consistent with how BRN-001 derives status. The same shared `getIsOpenNow` utility is reused.

**Deals list.** A section of the screen lists the deals a customer can use at this branch. The deals shown are those that are:
- active (`is_active = true`)
- within their time window (`start_at <= now <= end_at`)
- AND either explicitly mapped to this branch via the `deal_branches` join table, OR are global deals (no `deal_branches` rows at all, meaning they apply to every branch)

Deals mapped to OTHER branches only are excluded. Each deal is shown using the `DealCard` component from `@jojopotato/ui`. The deal card shows the deal title, a human-readable discount label (e.g. "20% off", "Buy 1 Get 1", "Free upgrade"), and a valid-until date derived from the deal's `end_at` field. Where the discount label is computed (server or client) and how validUntil is formatted are INNOVATE decisions.

**No 0-deal expectation.** Under current seed data, every active branch inherits the global deals, so the deals list is never empty for an active branch. The SPEC does not require handling a 0-deal visual state for launch.

**Directions link.** A tappable "Get Directions" element opens the native maps app with the branch coordinates pre-loaded:
- iOS: Apple Maps (`maps://` URL with `ll` parameter for the branch lat/lng and `q` for the name)
- Android: Google Maps via `geo:` URI
- Web: Google Maps URL opened in a new browser tab

The coordinates used are the branch's stored `latitude` and `longitude` values (not geocoded from the address). This satisfies BRN-004's directions requirement. The directions behavior is implemented as a utility function (`openDirections(lat, lng, name)`) using `expo-linking`, which is already available in the project.

**"Order from this branch" CTA.** A prominent button at the bottom (or a fixed position) of the screen. When the branch is open AND `is_accepting_pickup = true`, the button is active: tapping it records the branch as the selected ordering branch (via the `useBranch` hook from BRN-001) and navigates to the ordering flow (menu or similar — consistent with whatever target BRN-001 established). When the branch is closed OR `is_accepting_pickup = false`, the button is visually disabled and non-interactive — tapping it does nothing and does not navigate.

**Distance display.** When user location is available (granted in BRN-001's location flow), the distance to this branch is shown. If location is unavailable, the distance field is hidden rather than showing a blank or "unknown" value.

**Data fetching.** The screen fetches branch data (info + applicable deals) from a new API endpoint. The data is fetched by branch ID. Whether this is one combined endpoint or two separate calls (branch + deals) is an INNOVATE decision; from the screen's perspective, both pieces of data arrive via `apiFetch<T>`.

**Loading and error states.** The screen shows a loading indicator while data is being fetched. If the fetch fails or the branch ID is not found, an error message is displayed with the option to go back. These are UX-completeness requirements; exact visual design is an INNOVATE/design call.

---

## Flow / State Diagram

```
User taps branch row in BRN-001 locator
         |
         v
Navigate to /branches/[branchId]
  (passes branchId only — no data inline)
         |
         v
Screen mounts → fetch branch detail + deals
  (by branchId, from new API endpoint)
         |
    +----+----+
    |         |
  LOADING   ERROR
    |         |
    v         v
  Show     Show error
  spinner  + Back button
    |
    v
Render branch detail
┌────────────────────────────────────────────┐
│ Branch Name                                │
│ Address · Phone                            │
│ Distance (if available)                    │
│ Open/Closed badge  ·  Prep time: ~N min    │
│ Pickup: Accepting / Not Accepting          │
│ Opening Hours (human-readable, all days)   │
│ [Get Directions]  (opens maps)             │
├────────────────────────────────────────────┤
│ Deals Available at This Branch             │
│ ┌──────────────────────────────────────┐   │
│ │ DealCard: title · discountLabel      │   │
│ │           valid until: date          │   │
│ └──────────────────────────────────────┘   │
│ (one DealCard per applicable deal)         │
├────────────────────────────────────────────┤
│ [Order from this branch]  ← CTA button     │
│   ENABLED: isOpen AND isAcceptingPickup    │
│   DISABLED: isClosed OR !isAcceptingPickup │
└────────────────────────────────────────────┘
         |
  +------+------+
  |             |
CTA           Directions
ENABLED       tapped
  |             |
  v             v
Record       iOS: maps://...
selected     Android: geo:...
branch       Web: https://maps.google.com/...
  |
Navigate
to ordering flow
(per BRN-001 CTA target)
```

---

## Acceptance Criteria (Testable Outcomes)

**AC-1 — All required branch fields are displayed with real values**
When the screen loads for a seeded branch (e.g. jojo-it-park), every required field appears with a real value: branch name, address, phone, current open/closed status, opening hours in a human-readable format, estimated prep time, pickup availability indicator, and the CTA button. No field shows a placeholder, "N/A", or raw database value (e.g. no raw JSON string for opening_hours).
- proven by: manual verification on dev build — load the branch details screen for jojo-it-park; confirm all seven fields are present and populated with correct values matching the seed data
- strategy: Hybrid

**AC-2 — Deals list shows branch-applicable deals (explicit + global); excludes other-branch-only deals**
For jojo-it-park: the deals list shows the 4 global deals (branchSlugs=[]) plus the 1 branch-exclusive deal mapped to jojo-it-park, totaling 5 deals. For jojo-poblacion: the deals list shows the 4 global deals only (the IT Park exclusive is not shown). Deals outside their time window or marked inactive are not shown.
- proven by: `pnpm --filter @jojopotato/api test` — a new vitest test for the branch-deals API endpoint asserts: (a) jojo-it-park returns 5 applicable deals; (b) jojo-poblacion returns 4 applicable deals; (c) the IT Park exclusive deal does not appear in jojo-poblacion's response
- strategy: Hybrid (Fully-Automated for the API assertion; Hybrid for the visual DealCard rendering)

**AC-3 — "Order from this branch" is disabled when branch is closed or not accepting pickup**
For jojo-it-park (`is_accepting_pickup = false`): the CTA button is visually disabled and tapping it does not navigate and does not update the selected branch state. For a branch outside its opening-hours window, the same disabled behavior applies.
- proven by: manual verification — open jojo-it-park detail screen; confirm CTA is disabled (greyed, non-tappable); also test any branch at a time outside its stored opening hours
- strategy: Hybrid (matches the disabled-CTA contract established in BRN-001 AC-6)

**AC-4 — "Order from this branch" is enabled when branch is open and accepting pickup**
For jojo-poblacion (active, `is_accepting_pickup = true`, within opening hours): tapping the CTA records jojo-poblacion as the selected branch and navigates to the ordering flow without errors.
- proven by: manual verification — open jojo-poblacion detail screen within opening hours; tap CTA; confirm navigation succeeds and the selected branch state reflects jojo-poblacion's ID
- strategy: Hybrid

**AC-5 — Directions link opens the correct maps app with branch coordinates**
Tapping "Get Directions" on a branch detail screen triggers the platform-appropriate maps intent: Apple Maps on iOS, Google Maps geo URI on Android, Google Maps web URL in a browser tab on web. The coordinates pre-filled in the maps app match the branch's stored latitude and longitude from the seed data.
- proven by: manual verification on each platform — tap Get Directions for jojo-poblacion (lat: 10.315700, lng: 123.891500); confirm the maps app opens with a pin at or near those coordinates and the branch name as the label
- strategy: Hybrid (Expo Linking behavior is not automatable without a device/simulator; manual-tier)

**AC-6 — Distance is shown when location is available; hidden when unavailable**
When the user has granted location permission (carried over from BRN-001's permission flow), the detail screen shows the calculated distance to the branch. When location is unavailable (denied or web without geolocation), the distance field is not shown — no blank or "unknown" text appears.
- proven by: manual verification — grant location on simulator and confirm distance shown on detail screen; deny location and confirm distance field is absent
- strategy: Hybrid

**AC-7 — Opening hours are displayed in a human-readable format (not raw JSON)**
The opening hours section of the detail screen renders the per-day hours in a format a user can read, not as a raw JSON string or JavaScript object representation. The displayed values match the stored seed data.
- proven by: manual verification — compare the rendered hours for jojo-poblacion against the seed data (e.g. Mon–Thu 9:00 AM–9:00 PM, Fri–Sat 9:00 AM–10:00 PM, Sun 10:00 AM–8:00 PM)
- strategy: Hybrid

**AC-8 — Loading state is shown during fetch; error state is shown on failure**
While the API fetch is in progress, the screen shows a loading indicator (spinner or skeleton). If the fetch fails (network error or branch not found), an error message is shown and the user can navigate back. The screen does not crash or show an empty/blank state on failure.
- proven by: manual verification — use a dev build with the API server stopped to trigger an error state; confirm error UI is shown and the back action works; also confirm loading spinner is visible before data resolves
- strategy: Hybrid

**AC-9 — New API endpoint returns branch data and applicable deals in a single response (or two clean calls)**
The new API endpoint (or pair of endpoints) returns all fields needed by the detail screen: branch info fields (id, name, address, phone, latitude, longitude, openingHours, isAcceptingPickup, estimatedPrepMinutes, priority) and the list of applicable deals (title, dealType, discountValue, startAt, endAt, isActive). All fields are correctly typed on both server and client.
- proven by: `pnpm --filter @jojopotato/api test` — the new vitest endpoint test verifies the response shape for a known branch ID includes both branch fields and the deals array with correct filtering; `pnpm typecheck` exits 0 confirming client-side types align
- strategy: Hybrid (API assertion is Fully-Automated via vitest; response-shape type safety via typecheck)

**AC-10 — TypeScript types compile cleanly across all packages**
Running `pnpm typecheck` after implementation produces zero type errors. The new Deal type fields (`discountLabel`, `validUntil` or `endAt`), any new API response types, updated `PickupBranch` type if extended, and the detail screen component props are all type-safe.
- proven by: `pnpm typecheck` (must exit 0)
- strategy: Fully-Automated

**AC-11 — ESLint produces no new errors**
Running `pnpm lint` after implementation produces no new ESLint errors across any touched package.
- proven by: `pnpm lint` (must exit 0)
- strategy: Fully-Automated

---

## Out Of Scope

- **Map view (BRN-003).** No embedded map or map toggle on the Branch Details screen. The directions link opens an external maps app — no in-screen map component.
- **Deal redemption / apply-to-cart flow.** The deals list is read-only for BRN-002. Users can see available deals but cannot apply or redeem them from this screen; that belongs to the cart/checkout flow.
- **Full menu display.** The "Order from this branch" CTA navigates to the menu or ordering flow — it does not render a menu on the detail screen.
- **Pickup time slot selection.** Choosing a pickup window is not part of this screen.
- **Cart and checkout.** Nothing about cart state, payment, or order confirmation is in scope.
- **Real-time branch status updates.** Open/closed status and pickup availability are fetched at load time. Live websocket or push-based status updates are out of scope.
- **Admin branch management.** Creating, editing, or toggling branch data is a backend/admin concern.
- **BRN-003 (Map view).** Explicitly deferred to a separate issue.
- **"Order from this branch" post-selection target beyond branch selection.** The CTA sets the selected ordering branch using the same `useBranch` hook from BRN-001 and navigates to the same ordering target BRN-001 established. Defining a new or different navigation target is not in scope here.

---

## Constraints

1. **Navigation input — branchId only.** The screen receives only the branch's UUID via the Expo Router route parameter (`[branchId]`). It cannot rely on any data being passed inline from the list. All display data is fetched from the API using that ID.
2. **Reuse locked-in utilities.** The following are established by BRN-001 and must be reused, not re-implemented: `apiFetch<T>` (`apps/mobile/src/lib/api-fetch.ts`), `useUserLocation` (`hooks/use-user-location.ts` and `.web.ts`), `distanceKm` (`packages/utils/src/geo.ts`), `getIsOpenNow` (`packages/utils/src/hours.ts`), `useBranch` (`features/branches/hooks`), `Button` (`@jojopotato/ui`) for the CTA, `DealCard` (`@jojopotato/ui`) for each deal row.
3. **Deals semantics are locked.** Applicable deals = (deals with a `deal_branches` row for this branch) UNION (deals with no `deal_branches` rows at all), filtered to `is_active = true AND start_at <= now <= end_at`. Deals with `deal_branches` rows pointing to OTHER branches are excluded. This is a fixed product decision, not an INNOVATE choice.
4. **Directions uses stored coordinates.** The `openDirections(lat, lng, name)` utility uses `latitude` and `longitude` from the DB — never a geocoded or user-typed address. `expo-linking` is already available; no new dependency is required for directions.
5. **No existing branch-by-id endpoint.** A new API endpoint must be added to `packages/api`. Whether it is one combined endpoint (branch + deals) or two separate endpoints is an INNOVATE decision, but at least one new route is required.
6. **Deal type additions to `packages/types/src/deals.ts`.** The `Deal` type (or a new `ApiBranchDeal` response type) must carry `discountLabel` and a `validUntil` (or `endAt`) field for the DealCard to render. Where `discountLabel` is computed (server vs. client) is an INNOVATE decision.
7. **`@jojopotato/ui` components only.** All rendered UI must use components from `packages/ui` and tokens from `theme.ts`. One-off inline styles that duplicate theme values are not allowed. Whether a new component is added to `packages/ui` for the hours display is an INNOVATE/design call.
8. **CTA disabled state must not navigate.** A disabled "Order from this branch" button must not trigger Expo Router navigation or update `useBranch` state under any tap.
9. **TypeScript strict mode.** All new code must pass `pnpm typecheck` with zero errors.
10. **No mobile-side automated test runner.** Mobile screen behavior (rendering, CTA state, directions tap) is verified via manual dev-build testing. The API surface (endpoint response, deals filtering) is verified via `pnpm --filter @jojopotato/api test` (vitest, already live). A new vitest test for the branch-details endpoint is required by AC-2 and AC-9.
11. **BRN-004 absorbed.** This SPEC delivers the directions feature previously scoped to BRN-004. BRN-004 should be closed or linked as resolved by BRN-002.

---

## Open Questions

None. All product decisions are locked (provided in the task prompt as user-approved). Implementation choices (single vs. two endpoints, discountLabel computation location, hours display format, ApiBranch extraction) are intentionally deferred to INNOVATE and are not blocking questions for this SPEC.

---

## Background / Research Findings

**Deals data structure (from seed/data.ts):**
- 5 total seed deals. 4 are global (branchSlugs=[]): "First app order: Free lemonade upgrade", "Snack break deal: Fries + Lemonade bundle", "Buy 1 Take 1 lemonade", "Weekend combo deal". 1 is IT Park exclusive (branchSlugs=['jojo-it-park']): "Branch-exclusive opening promo (20% off)".
- The DB `deals` table has: `id`, `title`, `description`, `image_url`, `deal_type` (enum), `discount_value` (numeric), `minimum_order_amount`, `start_at`, `end_at`, `usage_limit_per_user`, `total_usage_limit`, `is_active`.
- The `deal_branches` join table links deals to branches. No row = global deal.
- Consequence for ACs: jojo-it-park should show 5 deals (4 global + 1 exclusive); jojo-poblacion should show 4 deals (4 global only, no exclusive); jojo-mabolo is inactive and not accessible from BRN-001.

**Branch data (from seed/data.ts, confirmed active branches):**
- `jojo-poblacion`: active, pickup on, prep 15 min, priority 1, coords 10.3157/123.8915
- `jojo-it-park`: active, pickup OFF (`is_accepting_pickup: false`), prep 20 min, priority 2, coords 10.3305/123.9058
- `jojo-mabolo`: inactive (`is_active: false`) — not reachable from BRN-001, not tested here

**Reusable from BRN-001 (confirmed by BRN-001 SPEC and plan):**
- `apiFetch<T>` is the established fetch pattern for API calls
- `useUserLocation` (and `.web.ts`) provides location with platform-correct degradation
- `distanceKm` in `packages/utils/src/geo.ts` — haversine already added for BRN-001
- `getIsOpenNow` in `packages/utils/src/hours.ts` — open/closed boolean
- `useBranch` hook — already tracks the selected ordering branch
- `Button` from `@jojopotato/ui` — the canonical CTA component
- `DealCard` from `@jojopotato/ui` — confirmed existing component for deal display

**New surfaces required (not yet implemented):**
- GET /api/branches/:id (or equivalent) — no branch-by-id endpoint exists in `packages/api/src/index.ts`
- `deals.ts` type additions (`discountLabel`, `validUntil`/`endAt`) — where these are computed is an INNOVATE decision
- `openDirections(lat, lng, name)` utility — using `expo-linking` (already available); location in `packages/utils/src/maps.ts` or inline is an INNOVATE decision
- Opening-hours display formatting — `getIsOpenNow` returns boolean only; human-readable formatting is new

**Test surface:**
- `pnpm --filter @jojopotato/api test` (vitest) is live in `packages/api` — a new test file for the branch-details endpoint is the primary automated gate
- Mobile screen behavior is manual-tier (no RN test runner configured; consistent with BRN-001 strategy)
- `pnpm typecheck` and `pnpm lint` are fully automated gates

**PRD references:**
- §6.3 Branch Locator: per-branch display fields include "available deals for that branch" and a directions link — both delivered here
- §6.8 In-App Exclusive Deals: deals can be limited to specific branches; this screen surfaces branch-applicable deals as a read-only preview
- §7 Navigation: Branch Details is the [branchId] nested route under the Branches tab stack, already defined in `branches/_layout.tsx`

**Deferred to INNOVATE (not decided here):**
- Single combined endpoint vs. two endpoints (branch + deals)
- `discountLabel` computed server-side (formatted string in API response) vs. client-side (from `deal_type` + `discount_value`)
- Opening-hours display format (grouped days, collapsible, always-expanded)
- Whether `ApiBranch`/`mapApiBranch` is extracted from `branches/index.tsx` to a shared `features/branches/api.ts`
- Location of the `openDirections` utility (`packages/utils/src/maps.ts` or inline in the screen)
