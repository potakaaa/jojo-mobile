---
name: plan:wire-better-auth-hook-test-coverage
description: "No automated test coverage exists yet for apps/mobile's useAuth() hook / auth-client seam"
date: 09-07-26
feature: auth-accounts
---

# Backlog: Automated Test Coverage for `useAuth()` (Mobile)

## What

The `wire-better-auth` plan
(`process/features/auth-accounts/completed/wire-better-auth_09-07-26/`) added real server-side
integration test coverage in `packages/api` (5 vitest cases covering email/password, phone-OTP-stub,
magic-link, Google-OAuth config, and the `role` `input:false` guard), but the mobile-side consumption
seam — `apps/mobile/src/features/auth/hooks/use-auth.ts` and
`apps/mobile/src/features/auth/lib/auth-client.ts` — has no automated test.

## Why this matters

This is consistent with the project-wide gap that no mobile-side (RN) test runner exists yet (see
`process/context/tests/all-tests.md` §Known Gaps) — it is not specific to auth. But `useAuth()` is
now the single seam every screen in the app depends on for auth state, so it's the highest-value
candidate once a mobile runner is introduced.

## Cross-reference

Related to (but distinct from) `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`,
which covers navigation-flow E2E coverage (auth gating between `(auth)`/`(tabs)` stacks, tab
switching, back-nav) — that note already lists "cold-launch auth gating" and "logout gate-flip" as
flows to cover. This note is narrower: unit/component-level coverage of the `useAuth()` hook itself
(sign-in dispatch logic, session derivation, error handling), independent of navigation.

## Status

Deferred — pick up once a mobile-side test runner (Jest via `jest-expo`, or similar) is introduced,
per the existing project-wide gap. Manual/simulator verification of the auth flows (sign-up/login,
phone OTP, Google button, magic-link deep link, session persistence across restart, logout) remains
the interim verification path.

## Extension (13-07-26) — post-auth onboarding surface added

The `onboarding-screens` plan
(`process/features/auth-accounts/active/onboarding-screens_13-07-26/`) added a second seam with the
same no-RN-runner gap. Untested behaviors, all Agent-Probe/Known-Gap in that plan's validate-contract:

- `use-auth.ts`: `hasCompletedProfile` derivation (`user?.onboardedAt != null`) and the
  `completeProfile()` dispatch — `authClient.updateUser({...})` + the explicit `refetch()` call added
  to force the nav-gate flip without an app restart (execute-agent instruction E2).
- `apps/mobile/src/app/(onboarding)/index.tsx`: internal step state (`0=features · 1=promos ·
  2=info`), Skip-jumps-to-form-not-Home semantics (AC3), and required-field submit-gating
  (`canSubmit` + `isValidBirthday`, AC4).
- The third `Stack.Protected` nav gate in `_layout.tsx` (`isAuthenticated && hasCompletedProfile` →
  `(tabs)`; `isAuthenticated && !hasCompletedProfile` → `(onboarding)`) — untested end-to-end
  (AC2/AC5/AC6 route-flip behavior).

Server-side persistence for this surface (`updateUser` self-write + `role` rejection + read-back
shape) IS covered — see `packages/api/src/lib/__tests__/auth.integration.test.ts` (B0 case). Only
the mobile-side consumption/UI logic above is the gap.

Manual/simulator verification path for this surface (interim, until a mobile runner exists): fresh
`onboarded_at = NULL` account → previews → Skip on each preview lands on the info form (not Home) →
submit blocked until name+birthday(`YYYY-MM-DD`)+address valid → submit → lands on Home without app
restart → relaunch/sign-out-in does not re-show onboarding.

Related open (non-code) decision, not yet made: `packages/api/src/lib/dev-auto-login.ts` sessions
start with `onboarded_at = NULL`, so the dev auto-login user hits post-auth onboarding once per reset
DB. User has not decided whether to seed `onboarded_at` there to skip it in dev. No code change made;
tracked here as an optional follow-up.
