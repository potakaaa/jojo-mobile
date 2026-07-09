# auth-accounts

<!-- Part of Jojo Potato -->

## Scope

Authentication and account management for the Jojo Potato mobile app. Covers sign up/login and
profile management. Auth provider is decided and wired: **better-auth** (email/password, phone
OTP, Google OAuth, magic link), hosted in `packages/api` (Express + Drizzle + Postgres). See
`process/context/all-context.md` §Current Implementation State / §Open Questions.

**Status as of 09-07-26: core auth foundation implemented** (`wire-better-auth`, see
`completed/wire-better-auth_09-07-26/`). Not yet built: role elevation / admin path, PRD §6.1
onboarding profile collection, real SMS vendor (phone OTP is currently a stub), and live
Google/Resend credential provisioning — see `backlog/` for the filed follow-ups.

## Key Source Files

- `packages/api/src/lib/auth.ts` -- better-auth server config (plugins, social providers, role field)
- `packages/api/src/db/schema/{users,session,account,verification}.ts` -- auth-related Drizzle schema
- `apps/mobile/src/features/auth/hooks/use-auth.ts` -- `AuthProvider` + `useAuth()`, the seam every screen uses
- `apps/mobile/src/features/auth/lib/auth-client.ts` -- better-auth mobile client (expoClient + secure-store)
- `apps/mobile/src/app/(auth)/` -- login/signup/phone-otp/onboarding/splash/terms screens
- `packages/types/src/auth.ts` -- shared `AuthUser`/`AuthSession`/`UserRole` types

## Related Context

- `process/context/all-context.md` -- overall repo structure, tech stack, and auth-state-seam pattern
- `process/context/tests/all-tests.md` -- `packages/api`'s Vitest auth integration tests

## Current Status

Status: in-progress (core auth foundation done; role/admin, onboarding-profile, and real-SMS
follow-ups remain in `backlog/`)

## Folder Contents

```
process/features/auth-accounts/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
