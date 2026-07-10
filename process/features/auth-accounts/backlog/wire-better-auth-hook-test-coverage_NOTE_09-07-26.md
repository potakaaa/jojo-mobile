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
