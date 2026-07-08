# pickup-branches

<!-- Part of Jojo Potato -->

## Scope

Store/branch selection and pickup scheduling for the Jojo Potato mobile app. Covers browsing
available pickup branches/locations, selecting a branch for an order, and scheduling a pickup
time window. No backend/location service is decided yet (see `process/context/all-context.md`).

**Status as of setup: not started.** No source files exist yet for this feature.

## Key Source Files

None yet. Expected future locations based on current repo conventions:
- `apps/mobile/src/app/` -- Expo Router routes for branch selection / pickup scheduling screens
- `packages/types/src/` -- shared pickup/branch domain types (placeholders exist)

## Related Context

- `process/context/all-context.md` -- overall repo structure and tech stack

## Current Status

Status: not-started

## Folder Contents

```
process/features/pickup-branches/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
