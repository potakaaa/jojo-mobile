# pickup-branches

<!-- Part of Jojo Potato -->

## Scope

Store/branch selection and pickup scheduling for the Jojo Potato mobile app. Covers browsing
available pickup branches/locations, selecting a branch for an order, and scheduling a pickup
time window. No backend/location service is decided yet (see `process/context/all-context.md`).

**Status as of 13-07-26: partially implemented.** Branch browsing and branch selection for an
order are real and working, delivered by
`process/general-plans/completed/pickup-order-flow_10-07-26/` (this plan lived in
`general-plans/` rather than this feature folder because it spanned both `pickup-branches` and
`ordering-cart` as one continuous flow — see that plan's Scope section).

**Done:** branch list (`GET /branches`, optional `lat`/`lng` distance sort), branch detail + menu
(`GET /branches/:branchId`, `GET /branches/:branchId/menu`), branch selection tied to cart state
(`SET_BRANCH` clears cart on branch change — pickup is single-branch per order),
`estimated_ready_at` derived from the branch's `estimated_prep_minutes`.

**Deferred / not yet done (future work, not a gap in what shipped):**
- Explicit pickup *time-window scheduling* (choosing a slot ahead of time) — this pass only
  derives an estimated-ready timestamp from prep time at order placement; no scheduling UI exists.
- A real location/distance service — `lat`/`lng` sort is a query param the API accepts, no
  geolocation-permission UI was built this pass.

## Key Source Files

- `apps/mobile/src/app/(tabs)/branches/` -- branch list + branch detail/menu screens
- `apps/mobile/src/features/branches/` -- branches api-client + hooks
- `packages/api/src/routes/branches.ts` -- branch list/detail/menu API
- `packages/types/src/pickup.ts` -- `PickupBranch` shape (`estimatedPrepMinutes`, `isAcceptingPickup`, client-computed `isOpen`)
- `packages/ui/src/components/{branch-card,pickup-time-badge}.tsx` -- shared UI

## Related Context

- `process/context/all-context.md` -- overall repo structure and tech stack, §Current Implementation State
- `process/general-plans/completed/pickup-order-flow_10-07-26/` -- the plan, validate journey, and closeout report that delivered this

## Current Status

Status: partially-implemented (branch browsing/selection done; scheduling UI and a real location service deferred)

## Folder Contents

```
process/features/pickup-branches/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
