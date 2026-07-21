---
name: spec:dev-temp-login-button
description: "Product-discovery SPEC for a dev-only 'Temp Login' button on the mobile login screen that signs in with a hardcoded, seeded test account via the real email/password auth flow"
date: 13-07-26
feature: auth-accounts
---

# SPEC: Dev Temp Login Button

## Summary

Right now, exercising any screen that requires being signed in means going through a real
sign-in flow every single time during local development — email a magic link to yourself and
click it, or wait for Google OAuth. That's slow and annoying when you just want to poke at the
Home tab or the order flow for the tenth time today. This feature adds a small, clearly-marked
"[DEV] Temp Login" button to the login screen that instantly signs the developer in as a fixed,
pre-created test account, using the same real authentication system as every other user (nothing
fake or mocked). The button and the account it uses are both built so they can never appear or
work in a real, deployed production app.

## User Stories / Jobs To Be Done

- As a developer running the app locally, I want to tap a single dev-only button on the login
  screen and be signed in immediately, so that I can get to authenticated screens without
  repeating the real sign-in flow every time I reload the app.
- As a developer, I want the dev sign-in to use a real, working test account (not a fake/mocked
  session), so that what I'm testing behaves exactly like a real logged-in user would.
- As anyone reviewing or shipping this app, I want it to be structurally impossible for this
  button or its test account credentials to work in production, so that this convenience feature
  can never become a security hole.

## What The User Wants (Behavioral Outcomes)

- On the login screen, in a local development build only, there is an additional button labeled
  to make clear it's a developer/debug affordance (e.g. "[DEV] Temp Login") — separate from the
  normal "Email me a magic link" and "Continue with Google" options.
- Tapping it immediately starts a sign-in attempt using a fixed, known test account's email and
  password. No typing, no extra screen, no email/SMS round trip.
- While the sign-in attempt is in flight, the button shows a loading state and other sign-in
  controls are disabled, consistent with how the existing magic-link and Google buttons already
  behave.
- On success, the developer lands in the authenticated app exactly as any other successfully
  signed-in user would (same session, same navigation behavior).
- On failure (e.g., the test account doesn't exist yet in this environment because seeding
  hasn't run), the screen shows a clear, actionable error message in the same place other
  sign-in errors show up today — not a crash, not a silent no-op.
- The button and the underlying test-account credentials never appear, and never work, in a
  production build/environment — this must be true by construction (the code path is compiled
  out / refused to start), not just by convention or a comment telling people not to use it.
- This feature does not change or replace any existing sign-in method (magic link, Google, phone
  OTP) and does not change the separate `pnpm dev:bypass` auto-boot mechanism already in the
  codebase — those keep working exactly as they do today.

## Flow / State Diagram

```
Login screen (dev build, __DEV__ === true)
│
├── existing controls: [Email input] [Email me a magic link] [Continue with Google]
│
└── NEW: [DEV] Temp Login  ← only rendered when __DEV__ is true
        │
        │ tap
        ▼
   pending = 'dev-temp-login'
   (other buttons disabled, this button shows loading)
        │
        ▼
   sign in with fixed test account (email/password)
   via the same real auth backend every other method uses
        │
   ┌────┴─────────────────────────┐
   │                               │
   success                       failure
   │                               │
   ▼                               ▼
session established          error shown inline
→ auth gate flips app         (same error area as
   to authenticated (tabs)     magic-link/Google errors)
                                pending cleared,
                                buttons re-enabled,
                                user may retry or use
                                another sign-in method


Production build (NODE_ENV=production)
│
├── Button: never rendered (dev-only UI branch compiled out)
└── Test account: seed script refuses to create it
                   (fail-closed NODE_ENV guard, same
                   pattern as the existing dev-auto-login
                   server gate)
```

## Acceptance Criteria (Testable Outcomes)

1. **A seeded test account exists in non-production environments after running the seed
   script**, using a fixed, hardcoded email/password, created via the real sign-up API (not a
   raw database insert), defaulting to the standard `customer` role with no elevated privileges.
   - proven by: server-side integration test (new/extended `packages/api` vitest case,
     mirroring the existing `auth.integration.test.ts` pattern) asserting the seeded account
     exists and can sign in via the real email/password endpoint.
   - strategy: Fully-Automated

2. **Re-running the seed script does not fail or duplicate the test account** (idempotent —
   running seed twice leaves exactly one account with that email).
   - proven by: server-side integration test asserting a second seed run does not error and the
     account count for that email stays at one.
   - strategy: Fully-Automated

3. **The seed script refuses to create the test account when `NODE_ENV=production`**, failing
   loudly (not silently skipping) so a misconfigured production run cannot accidentally end up
   with a known test credential in a live database.
   - proven by: server-side integration test asserting the seeding function throws/refuses under
     a simulated `NODE_ENV=production` guard, mirroring the existing
     `packages/api/src/lib/dev-auto-login.ts` fail-closed pattern.
   - strategy: Fully-Automated

4. **A developer can sign in as the seeded test account through the real email/password auth
   flow** (the same backend path every other sign-in method ultimately relies on), and receives a
   real, working session identical in shape to any other user's session.
   - proven by: server-side integration test hitting the real `signInEmail` API with the seeded
     credentials and asserting a valid session is returned.
   - strategy: Fully-Automated

5. **The login screen shows a dev-only "Temp Login" button that is visibly and unambiguously
   marked as a developer/debug affordance**, distinct from the normal sign-in options.
   - proven by: manual Agent-Probe QA script on a local dev build (consistent with how
     `pickup-order-flow` covered mobile UI behavior, since no mobile component/e2e test runner
     exists yet — see project Known Gap in `process/context/tests/all-tests.md`).
   - strategy: Agent-Probe

6. **Tapping the button signs the developer in without any additional input**, and the app
   transitions to the authenticated experience exactly as it does for any other successful
   sign-in.
   - proven by: manual Agent-Probe QA script (tap button → observe authenticated tab bar
     appears, same as after magic-link/Google success).
   - strategy: Agent-Probe

7. **While the sign-in attempt is in flight, the button and the rest of the login form show a
   loading/disabled state**, consistent with the existing magic-link and Google button behavior.
   - proven by: manual Agent-Probe QA script (observe loading spinner on the tapped button, other
     controls disabled, consistent with existing `pending` state pattern in `login.tsx`).
   - strategy: Agent-Probe

8. **If the sign-in attempt fails (e.g. the seeded account doesn't exist in this environment),
   the screen shows a clear inline error** in the same error area used by the other sign-in
   methods, and the user can retry or use a different method — no crash, no silent failure.
   - proven by: manual Agent-Probe QA script simulating a failed sign-in (e.g. against an
     unseeded environment) and observing the inline error message.
   - strategy: Agent-Probe

9. **The button never renders, and the underlying sign-in path is not reachable, in a production
   build** — verified structurally (compiled-out dev branch), not just by a warning comment.
   - proven by: code-level assertion that the button/handler is gated behind the same `__DEV__`
     compile-time check pattern already used by `apps/mobile/src/features/auth/lib/dev-auto-login.ts`
     (Metro strips the dead branch from production bundles) — confirmed via manual code review at
     EXECUTE/VALIDATE time, recorded as a Known-Gap for automated verification since no mobile
     build-artifact inspection tooling exists in this repo.
   - strategy: Agent-Probe

10. **This feature does not alter the behavior of the existing `pnpm dev:bypass` / `/dev/session`
    auto-boot mechanism, or any of the existing magic-link/Google/phone-OTP sign-in paths.**
    - proven by: existing `auth.integration.test.ts` server suite continuing to pass unmodified
      (regression check), plus a one-line Agent-Probe confirmation that the magic-link and Google
      buttons on the login screen are still present and unchanged.
    - strategy: Hybrid

## Out Of Scope

- Changing or removing the existing `pnpm dev:bypass` / `/dev/session` auto-boot magic-link
  mechanism — that stays exactly as-is; this is a separate, additional convenience.
- Any elevated or staff-level role for the seeded test account — it stays a plain `customer`,
  matching the server-owned `role` default (no client can self-assign a role).
- Making the test account's credentials configurable via environment variable — they are
  intentionally hardcoded in the seed script per the locked user decision (not sourced from
  `.env`).
- Any reachability of this button or account in a production build/environment — this must be
  structurally impossible, not merely discouraged.
- Adding a new mobile-side (React Native) test runner to close the pre-existing "no automated
  mobile UI test coverage" gap — that gap is inherited as-is from the rest of the codebase and is
  handled the same way `pickup-order-flow` handled it (Agent-Probe manual QA), not solved here.
- Changing the login screen's visual design, layout, or the existing magic-link/Google button
  behavior beyond adding the one new dev-only button.

## Constraints

- Must use the real `emailAndPassword` auth flow already enabled server-side
  (`packages/api/src/lib/auth.ts`) — no mocked or fake session.
- The seeded account must be created via better-auth's own sign-up API (`auth.api.signUpEmail`),
  not a raw database/`account`-table insert, because better-auth's password hash format must come
  from its own API.
- `role` is server-owned (`input: false`) — the test account cannot be created with, or later
  escalated to, a non-default role as part of this feature.
- Credentials are hardcoded directly in the seed script (`jojo@test.com` / `jojo123`), not
  environment-variable-driven — this was an explicit user decision, not an oversight.
- The dev-only server-side seeding step and the dev-only client-side button must each be
  fail-closed on their own: the seed step must refuse under `NODE_ENV=production`; the button
  must be compiled out of production bundles by `__DEV__`, matching the two existing dev-only
  gating patterns already in this codebase (`packages/api/src/lib/dev-auto-login.ts` and
  `apps/mobile/src/features/auth/lib/dev-auto-login.ts`).
- Must not touch, rename, or change behavior of the existing `dev-auto-login.ts` files on either
  side — those implement a different (already-shipped) dev convenience and are explicitly out of
  scope.
- No mobile-side automated test runner exists yet (project-wide known gap) — mobile UI/behavioral
  acceptance criteria rely on Agent-Probe manual QA, consistent with how `pickup-order-flow`
  handled the same gap.

## Open Questions

None. Both decisions that would otherwise be open (test account role, credential source) were
resolved in the pre-SPEC clarification round: role stays default `customer`; credentials are
hardcoded in the seed script guarded by a `NODE_ENV !== 'production'` check.

## Background / Research Findings

- Server: `emailAndPassword` is already enabled in `packages/api/src/lib/auth.ts` (lines ~51-53);
  `auth.api.signInEmail` / `auth.api.signUpEmail` already work end-to-end with existing test
  coverage in `packages/api/src/lib/__tests__/auth.integration.test.ts` (lines ~54-72).
- Client: `authClient.signIn.email` is a core better-auth client method requiring no new plugin,
  but `useAuth().signIn` (`apps/mobile/src/features/auth/hooks/use-auth.ts`, `SignInInput` union
  at lines ~24-31, dispatcher at lines ~74-104) has no email/password case yet — the union
  currently deliberately omits it (see comment at lines 24-26: "Email/password remains enabled
  server-side (better-auth) but has no client entry point today").
- Seeding: `packages/api/src/db/seed/seed.ts` creates zero users today (`runSeed()` only seeds
  branches/categories/products/deals). A new seeded-user step is needed, following the existing
  idempotency pattern used for `deals` (find-by-unique-field, then update-or-insert — `seed.ts`
  lines ~126-161), adapted for the `users` table's unique `email` constraint and routed through
  `auth.api.signUpEmail` rather than a direct table insert.
- `role` is server-owned (`input: false` in `auth.ts`'s betterAuth config) and cannot be set at
  signup — new users always default to `customer`.
- Two existing dev-only fail-closed patterns to mirror (do not modify either file):
  - Server: `packages/api/src/lib/dev-auto-login.ts` — evaluates a gate once at module load,
    throws (refuses to start) if `DEV_AUTO_LOGIN=true` is requested under `NODE_ENV=production`.
  - Client: `apps/mobile/src/features/auth/lib/dev-auto-login.ts` (referenced via
    `apps/mobile/src/features/auth/hooks/use-auth.ts` line 15, `tryDevAutoLogin()`) — gated by
    `__DEV__` so Metro strips the dead branch from production bundles.
- Login screen: `apps/mobile/src/app/(auth)/login.tsx` currently has a `pending` state union
  typed `'magic-link' | 'google' | null` (line ~47) that will need widening to add a third
  pending value for this button's own loading state, following the same `run()` helper pattern
  already used for the other two methods (lines 53-62). Candidate placement: inside the `alt`
  `View` block (lines 158-184) alongside the existing `GoogleButton`, gated by `__DEV__`.
- This feature is independent of, and does not touch, the existing `pnpm dev:bypass` /
  `/dev/session` auto-boot mechanism documented in `docs/dev-auto-login.md` — that mechanism
  automatically signs a developer in on app boot via a magic-link token relay; this feature adds
  a manual, on-demand button using a completely different (email/password) auth path and a
  separate, persistently-seeded account rather than a runtime-only token.
- Test coverage reality check (from `process/context/tests/all-tests.md`): `packages/api` has a
  live vitest suite (`pnpm --filter @jojopotato/api test`) suitable for testing the seed/sign-in
  server-side behavior. `apps/mobile` has no test runner at all — this is a pre-existing,
  project-wide known gap (also flagged for the `useAuth()` hook specifically in backlog note
  `wire-better-auth-hook-test-coverage_NOTE_09-07-26.md`), which is why mobile-side acceptance
  criteria here rely on Agent-Probe manual QA, matching the precedent set by
  `pickup-order-flow_10-07-26`.
