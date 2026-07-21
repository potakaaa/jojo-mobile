---
name: plan:wire-better-auth
description: "Wire better-auth (email/password, phone OTP, Google OAuth, magic link) into packages/api and consume it from apps/mobile via a real AuthProvider/useAuth() hook, replacing the in-memory mock auth seam"
date: 09-07-26
feature: auth-accounts
metadata:
  node_type: plan
  type: plan
  status: complete
---

# Wire better-auth — Plan (archival record)

> **Provenance note:** This plan was originally authored and executed as a Claude Code native
> plan-mode file at `~/.claude/plans/summary-wire-an-agile-manatee.md` (outside `process/`), not
> as an in-repo plan artifact. This file is a durable in-repo record created at UPDATE PROCESS
> time (09-07-26) so the work is discoverable via the repo's normal plan-lifecycle conventions.
> Full original plan text is preserved verbatim below; only this provenance note and the closing
> `## Execution Outcome` section were added post-hoc.

**Complexity:** COMPLEX (multi-package: `packages/api` + `apps/mobile` + `packages/types` +
`packages/ui`; new external services: Postgres-backed auth tables, SMS-stub OTP, Resend email;
high-risk class: auth/identity).

## Context

`process/context/all-context.md`'s Open Questions listed the auth provider as undecided; it is now
decided (better-auth). Separately, a `feat/db-schema` branch already landed **`packages/api`** — a
real Express + Drizzle + PostgreSQL backend with the full 16-table PRD §9 schema, including a
`users` table with the exact `role` enum (`customer`/`staff`/`admin`/`super_admin`) from PRD §9.1.

Today's (pre-this-plan) `apps/mobile` auth was a pure in-memory mock (`use-auth-session.ts`):
`signIn()`/`signOut()` just flipped a `useState`, with fake buttons and no persistence. This plan
replaces that mock with a real better-auth-backed session covering phone OTP, email/password,
Google OAuth, and magic link, per PRD §6.1 plus explicit task requirements (Google + magic link go
beyond PRD MVP — accepted as an explicit scope expansion).

**Resolved provider choices (locked before EXECUTE):**
- SMS (phone OTP): **stub for now** — log the OTP code server-side instead of sending a real SMS;
  defer a live vendor (e.g. Twilio) to a follow-up.
- Email (magic link): **Resend** — real integration.

## Locked Decisions

1. Backend: better-auth wired **into the existing `packages/api`** — no new server app created.
2. Existing `users` table becomes better-auth's user table (rename `full_name`→`name`,
   `phone`→`phone_number`, add `email_verified`/`phone_number_verified`/`image`) via a new Drizzle
   migration — not a field-mapping shim.
3. `role` exposed via `user.additionalFields`, `input: false` — clients can never set their own
   role; defaults to `customer` at the DB level. Role elevation is out of scope (needs an
   admin-only path — backlog follow-up).
4. New tables `session`, `account`, `verification` added via better-auth's schema shape, hand-keyed
   as `uuid` (not the CLI generator's default `text` ids) to match the existing `uuid` `users.id`,
   with `advanced.database.generateId: false` so Postgres `defaultRandom()` fills ids.
5. Mobile hook rename: `use-auth-session.ts` (`AuthSessionProvider`/`useAuthSession()`) replaced by
   `AuthProvider`/`useAuth()`, backed by `authClient.useSession()`. `hasOnboarded`/
   `completeOnboarding` stay local/independent of the better-auth session (not persisted — backlog
   follow-up).
6. `packages/types/src/auth.ts` stays the stable cross-package contract: `AuthUser` gains
   `role: UserRole`; `AuthSession` corrected to `{ token, expiresAt, userId }` (zero existing
   consumers of either type — free, safe correction).
7. Integration tests live in `packages/api` (Vitest, already wired by `db-schema`'s
   `smoke.test.ts`) — one test per auth method against real local Postgres. Mobile-side hook
   coverage is a documented known-gap (backlog follow-up), consistent with the project-wide
   "no RN test runner" gap.

## Server-side changes (`packages/api`)

New deps: `better-auth`, `@better-auth/expo`, `resend`, `zod` (direct dep, TS portability),
`drizzle-orm` bumped to `^0.45.2`.

- Schema migration (`0001_daily_carnage.sql`): `users` renamed/extended per Locked Decision 2; new
  `session.ts` / `account.ts` / `verification.ts` schema files (hand-written, uuid-keyed).
- `src/lib/auth.ts` (new): `betterAuth({...})` — Drizzle adapter (`provider: 'pg'`,
  `generateId: false`), `emailAndPassword`, `plugins: [expo(), phoneNumber({sendOTP: stub}),
  magicLink({sendMagicLink: via Resend})]`, `socialProviders.google`, `additionalFields.role`
  (`input: false`, default `customer`), sliding session config, `trustedOrigins`, `baseURL` from
  `BETTER_AUTH_URL`.
- `src/index.ts`: mount at `app.all('/api/auth/*splat', toNodeHandler(auth))` (Express 5 requires
  a named wildcard segment — bare `*` throws), before JSON body-parsing middleware.
- New env var names added to `packages/api/.env.example`: `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY` (+ optional
  `RESEND_FROM`).
- 5 Vitest integration tests in `src/lib/__tests__/auth.integration.test.ts`: email/password,
  phone-OTP-stub, magic-link, Google-OAuth config-level, `role` `input:false` guard.

## Mobile-side changes (`apps/mobile`)

New deps: `better-auth`, `@better-auth/expo`, `expo-secure-store`, `expo-web-browser`.

- `src/features/auth/lib/auth-client.ts` (new): `createAuthClient` (better-auth/react),
  `expoClient` plugin (secure-store persisted, `jojopotato` scheme).
- `src/features/auth/hooks/use-auth.ts` (new, replaces deleted `use-auth-session.ts`):
  `AuthProvider` + `useAuth()` exposing `{user, role, isLoading, signIn, signOut, hasOnboarded,
  completeOnboarding}`.
- 6 consumers updated: `_layout.tsx`, `splash.tsx`, `login.tsx`, `signup.tsx`, `onboarding.tsx`,
  `account/index.tsx`.
- Screens rebuilt on `@jojopotato/ui` only: `login.tsx` / `signup.tsx` (email+password, Google
  button, magic-link path), new `phone-otp.tsx` (two-step OTP flow).
- `packages/ui/src/components/input.tsx`: additive `keyboardType` / `secureTextEntry` /
  `autoCapitalize` props (backward-compatible).
- `packages/types/src/auth.ts`: `UserRole` type added; `AuthUser.role`; `AuthSession` corrected.
- `apps/mobile/app.json`: `expo-secure-store` / `expo-web-browser` plugins added.

## Context doc update

`process/context/all-context.md` §Open Questions marked **Auth provider: decided — better-auth**;
auth-state-seam paragraph and Current Implementation State updated to describe the real
`AuthProvider`/`useAuth()` seam (done as part of EXECUTE; re-verified and lightly refined at this
UPDATE PROCESS pass — see the `wire-better-auth_REPORT_09-07-26.md` closeout for what changed).

## Out of Scope

- Full PRD §6.1 onboarding profile collection (birthday, favorite branch) — follow-up.
- Elevating a user to `staff`/`admin`/`super_admin` (no admin path exists yet) — follow-up.
- A live Twilio (or other) SMS integration — explicitly stubbed — follow-up.
- A live end-to-end Google OAuth round-trip test (needs a real Google account) — config-level
  coverage only; manual/agent-probe known-gap.
- Any staff/admin-facing app or screen.
- Introducing a mobile-side (RN) test runner.

## Verification (as specified)

**Server (`packages/api`):** `typecheck`, `lint`, `db:generate`, `db:migrate`, `test` (vitest,
needs local Postgres via `docker compose up -d`).
**Mobile (`apps/mobile`):** `typecheck`, `lint`.
**Root:** `typecheck`, `lint`.
**Secret-leak gate (automated):** grep `.env.example` + `expo export` bundle for secret leakage —
expect no match.
**Manual/agent-probe (known-gap, no simulator in this environment):** email/password sign-up+login,
phone OTP send+verify, Google button opens browser flow, magic-link email → tap → redirects into
app, session survives an app restart, logout returns to `(auth)`.

## Execution Outcome (added at UPDATE PROCESS, 09-07-26)

EXECUTE completed; an independent EVL confirmation run was performed; all runnable gates
(typecheck, lint except one pre-existing unrelated error, vitest integration suite, secret-leak
grep) came back green. See `wire-better-auth_REPORT_09-07-26.md` in this same folder for the full
closeout packet, SPEC/gate results, deviations, and backlog follow-ups filed.
