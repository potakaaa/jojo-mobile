# auth-accounts

<!-- Part of Jojo Potato -->

## Scope

Authentication and account management for the Jojo Potato mobile app. Covers sign up/login and
profile management. Auth provider is not yet decided (see `process/context/all-context.md`) --
options like Supabase or Firebase were discussed at setup time but nothing is committed.

**Status as of setup: not started.** No source files exist yet for this feature.

## Key Source Files

None yet. Expected future locations based on current repo conventions:
- `apps/mobile/src/app/` -- Expo Router routes for auth screens (login, signup, profile)
- `apps/mobile/src/config/env.ts` -- typed access to `EXPO_PUBLIC_*` vars, likely where auth
  provider keys would be wired
- `packages/types/src/` -- shared auth/user domain types (placeholders exist)

## Related Context

- `process/context/all-context.md` -- overall repo structure and tech stack

## Current Status

Status: not-started

## Folder Contents

```
process/features/auth-accounts/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
