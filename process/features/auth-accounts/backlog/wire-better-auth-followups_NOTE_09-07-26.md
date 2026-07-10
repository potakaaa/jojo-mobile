---
name: plan:wire-better-auth-followups
description: "Design-scoped follow-ups deferred out of wire-better-auth's Out of Scope section: role elevation, PRD onboarding profile collection, hasOnboarded persistence"
date: 09-07-26
feature: auth-accounts
---

# Backlog: better-auth Follow-Ups (Deferred by Design)

## What

Three items were explicitly deferred in `wire-better-auth`'s "Out of Scope" section
(`process/features/auth-accounts/completed/wire-better-auth_09-07-26/`), not accidentally missed:

1. **Role elevation / staff-admin path.** `role` defaults to `customer` and is server-owned
   (`input: false` on the better-auth `additionalFields` config) — no client can set it, and no
   admin/internal surface exists yet to elevate a user to `staff` / `admin` / `super_admin`. Needs
   a new admin-only path (likely a separate internal tool or a protected API route), not a mobile
   app screen.
2. **PRD §6.1 onboarding profile collection.** Only the four auth methods + session foundation
   were built. Collecting `birthday` / `favorite_branch_id` (both already columns on `users`,
   carried over from `db-schema`) during onboarding is still unbuilt UI.
3. **`hasOnboarded` persistence across restarts.** `useAuth()` keeps `hasOnboarded`/
   `completeOnboarding` as local, non-auth state (an onboarding-seen flag, deliberately independent
   of the better-auth session) — it does not currently persist across app restarts. Cheap follow-up
   (e.g. `expo-secure-store` or `AsyncStorage`) once onboarding UI itself is built.

## Why this matters

None of these block the four auth methods from working today; they're the next layer once
role-based features and full onboarding are prioritized.

## Status

Deferred by design (see plan's "Out of Scope"). Pick up individually as each becomes the next
priority — likely 3 separate small plans rather than one, since they touch different surfaces
(admin tooling / onboarding UI / local persistence).
