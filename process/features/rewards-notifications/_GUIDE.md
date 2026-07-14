# rewards-notifications

<!-- Part of Jojo Potato -->

## Scope

Loyalty/rewards program and push notifications for the Jojo Potato mobile app. Covers rewards
accrual/redemption, the Deals feature, and push notification delivery (order status, promotions).
No notifications provider is decided yet (see `process/context/all-context.md`).

**Status as of 14-07-26: Deals feature real-API COMPLETE; push notifications UI-only (backend not
wired); rewards/stars accrual not started.** See `process/context/all-context.md`
§"Deals feature (backend wiring COMPLETE, 14-07-26)" for the full delivery narrative (DEAL-001/002/003,
#22/#23/#24). The original screens-only, mock-data Deals plan
(`completed/deals-screens_13-07-26/`, PR #68) shipped first, then was entirely superseded by
`completed/deals-api-integration_13-07-26/`, a 3-phase program that replaced the mock deal source
with real backend wiring end-to-end. Push notifications UI (`active/push-notifications-ui_14-07-26/`)
is in progress — see that task folder for status.

## Key Source Files

- `apps/mobile/src/app/(tabs)/deals/` -- Deals list + details screens (real API, not a tab)
- `apps/mobile/src/features/deals/` -- `useDeals()`/`useDeal()` hooks, deal-apply logic
- `packages/api/src/routes/deals.ts` -- public `GET /deals` / `GET /deals/:id` routes
- `packages/api/src/routes/lib/serializers.ts` -- `serializeDeal` boundary serializer
- `packages/types/src/deals.ts` -- `Deal` type (cents-native, see VALUE-UNIT NOTE)

## Related Context

- `process/context/all-context.md` -- overall repo structure and tech stack, §Current Implementation
  State (Deals feature bullet)
- `process/features/rewards-notifications/completed/deals-api-integration_13-07-26/` -- the 3-phase
  program that delivered the real Deals backend wiring; current canonical Deals implementation
- `process/features/rewards-notifications/completed/deals-screens_13-07-26/` -- the earlier
  screens-only mock-data Deals plan (PR #68), archived as superseded by the program above

## Current Status

Status: partially-implemented (Deals real-API done; push notifications UI-only; rewards/stars accrual not started)

## Folder Contents

```
process/features/rewards-notifications/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
