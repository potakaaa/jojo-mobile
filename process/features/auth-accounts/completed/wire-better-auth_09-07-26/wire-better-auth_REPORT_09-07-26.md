---
phase: wire-better-auth
date: 2026-07-09
status: COMPLETE_WITH_GAPS
feature: auth-accounts
plan: process/features/auth-accounts/completed/wire-better-auth_09-07-26/wire-better-auth_PLAN_09-07-26.md
---

# Wire better-auth — UPDATE PROCESS Closeout Report

## What Was Done

- better-auth wired into `packages/api` (Express + Drizzle + Postgres): `src/lib/auth.ts`
  (email/password, phone-OTP-stub, Google OAuth, magic link via Resend, `role`
  `additionalField` with `input: false`), mounted at `app.all('/api/auth/*splat',
  toNodeHandler(auth))` in `src/index.ts`.
- `users` table migrated (`0001_daily_carnage.sql`): `full_name`→`name`, `phone`→`phone_number`,
  added `email_verified` / `phone_number_verified` / `image`. New `session` / `account` /
  `verification` tables added, hand-keyed as `uuid` with `generateId: false`.
- `apps/mobile`: new `AuthProvider`/`useAuth()` (`src/features/auth/hooks/use-auth.ts`) backed by
  `src/features/auth/lib/auth-client.ts` (better-auth React client + `expoClient` + secure-store
  persistence), replacing the deleted in-memory `use-auth-session.ts`. 6 consumers updated.
  Rebuilt `login.tsx` / `signup.tsx` + new `phone-otp.tsx`, all on `@jojopotato/ui` only.
  `app.json` gained `expo-secure-store` / `expo-web-browser` plugins.
- `packages/types/src/auth.ts` corrected: `UserRole` type, `AuthUser.role`, `AuthSession` ->
  `{token, expiresAt, userId}` (zero prior consumers — free correction).
- `packages/ui/src/components/input.tsx`: additive `keyboardType` / `secureTextEntry` /
  `autoCapitalize` props.
- 5 Vitest integration tests added in `packages/api/src/lib/__tests__/auth.integration.test.ts`
  (email/password, phone-OTP-stub, magic-link, Google-OAuth config-level, role-guard).
- `process/context/all-context.md` updated during EXECUTE (Open Questions, auth-state-seam
  paragraph, Current Implementation State, repo structure diagram) — **verified accurate against
  the actual diff during this UPDATE PROCESS pass**, plus two additional accuracy fixes made now
  (see Plan Deviations).
- This UPDATE PROCESS pass: created this in-repo completed-plan record (the original plan was a
  native Claude Code plan-mode file outside `process/`), filed 5 backlog notes, refined
  `process/context/tests/all-tests.md` (Vitest now live in `packages/api`), and refined the
  Context Group Detection Result section in `all-context.md`.

## What Was Skipped/Deferred

- Role elevation / staff-admin path — no admin surface exists yet. Backlog:
  `process/features/auth-accounts/backlog/wire-better-auth-followups_NOTE_09-07-26.md`.
- PRD §6.1 onboarding profile collection (birthday/favorite branch UI) — same backlog note.
- `hasOnboarded` persistence across restarts — same backlog note.
- Real SMS vendor for phone OTP (currently a server-side stub) — backlog:
  `process/features/auth-accounts/backlog/wire-better-auth-sms-vendor_NOTE_09-07-26.md`.
- Live Google OAuth / Resend provisioning (accounts, keys, secrets) — backlog:
  `process/features/auth-accounts/backlog/wire-better-auth-manual-prereqs_NOTE_09-07-26.md`.
- Mobile-side (`useAuth()` hook) automated test coverage — backlog:
  `process/features/auth-accounts/backlog/wire-better-auth-hook-test-coverage_NOTE_09-07-26.md`.
- A pre-existing, unrelated lint error in `floating-tab-bar.tsx` was surfaced by the EVL lint gate
  but is outside this plan's blast radius — backlog:
  `process/general-plans/backlog/floating-tab-bar-hook-lint-error_NOTE_09-07-26.md`.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Server typecheck | `pnpm --filter @jojopotato/api typecheck` | green (per EVL) |
| Server lint | `pnpm --filter @jojopotato/api lint` | green (per EVL) |
| Server migration | `pnpm --filter @jojopotato/api db:generate` / `db:migrate` | applied — `0001_daily_carnage.sql` confirmed on disk |
| Server tests | `pnpm --filter @jojopotato/api test` (vitest) | green — 5/5 auth integration tests + existing smoke test (confirmed: `auth.integration.test.ts` has exactly 5 `it(`/`test(` blocks) |
| Mobile typecheck | `pnpm --filter @jojopotato/mobile typecheck` | green (per EVL) |
| Mobile lint | `pnpm --filter @jojopotato/mobile lint` | green EXCEPT 1 pre-existing, out-of-blast-radius error in `floating-tab-bar.tsx:151` (confirmed unrelated to this diff — not touched by `git diff --stat`) |
| Root typecheck/lint | `pnpm typecheck` / `pnpm lint` | green (per EVL), same caveat as above |
| Secret-leak gate | `grep` `.env.example` + `expo export` bundle scan | green (per EVL) |
| Manual/agent-probe flows | sign-up/login, phone OTP, Google button, magic-link deep link, session persistence, logout | **known-gap** — no simulator available in this environment; code-path verified by inspection (mount point, plugin wiring, schema, `additionalFields.input:false`) but not run end-to-end |

## Plan Deviations

- None in the implementation itself — deviations here are all in this UPDATE PROCESS pass's
  context accuracy pass, not EXECUTE:
  - `all-context.md`'s top-level "No backend/external services decided yet" line was stale even
    before this plan (a `db-schema` plan had already landed `packages/api` with Drizzle+Postgres,
    still sitting in `active/` unarchived) — corrected here to reflect the real backend state.
  - The Context Group Detection Result section's "no auth dependency" bullet was stale post-EXECUTE
    (better-auth is now a real dependency) — corrected here with an explicit "group not yet
    warranted" decision and rationale (only 1 durable narrative doc exists so far — the
    §Current Implementation State paragraph — below the 3+-doc group-creation threshold).
  - `process/context/tests/all-tests.md` had not been updated for the `db-schema` plan's earlier
    introduction of Vitest in `packages/api` — corrected here (was stale before this session, not
    introduced by it) since this session's own new tests made the staleness directly visible.
- **Provenance deviation (structural, expected):** the plan itself was authored/executed as a
  native Claude Code plan-mode file (`~/.claude/plans/summary-wire-an-agile-manatee.md`), not an
  in-repo `process/` plan artifact — so there was no `active/` plan file to move to `completed/`.
  This UPDATE PROCESS pass created the in-repo record from scratch instead of moving an existing
  file. Full original plan text preserved in `wire-better-auth_PLAN_09-07-26.md` in this folder.

## Test Infra Gaps Found

- `apps/mobile` and `packages/{types,ui,utils}` still have no test runner (pre-existing,
  project-wide gap, not introduced by this session) — now sharper because `packages/api` DOES have
  Vitest, making the asymmetry more visible. See updated `process/context/tests/all-tests.md`.
- No CI pipeline enforcing any of the above gates on PRs (pre-existing gap).
- No E2E/simulator harness for auth flows specifically (rolls into the existing
  `mobile-e2e-navigation-harness` backlog note as additional future scenarios).

## SPEC Achievement

No locked `*_SPEC_*.md` exists for this plan (it ran as a native plan-mode file, not through the
in-repo RIPER-5 SPEC phase). Scoring against the plan's own stated Verification section and Locked
Decisions instead:

| Criterion (from plan) | Status |
|---|---|
| Email/password sign-up + login works | met — server integration test green; `emailAndPassword: {enabled:true}` confirmed in `src/lib/auth.ts` |
| Phone OTP (stub) send + verify works | met — server integration test green; `phoneNumber` plugin confirmed wired |
| Google OAuth config present | met (config-level only) — `socialProviders.google` confirmed; **unmet** for a true live round-trip (needs real Google account — known-gap, backlog: manual-prereqs note) |
| Magic link (Resend) works | met (config-level + local send path) — `magicLink` plugin + Resend call confirmed; **unmet** for real-inbox delivery until Resend account/key provisioned (backlog: manual-prereqs note) |
| `role` cannot be client-set | met — integration test explicitly asserts the `input:false` guard holds |
| No secrets in `EXPO_PUBLIC_*` / mobile bundle | met — secret-leak grep gate green |
| Consumer screens use only `@jojopotato/ui` | met — verified by reading `login.tsx`/`signup.tsx`/`phone-otp.tsx` imports |
| Mobile-side hook test coverage | **unmet** — documented known-gap, backlog note filed |
| Manual end-to-end flows (simulator) | **unmet** — documented known-gap (no simulator in this environment), backlog note filed |

## Closeout Packet

1. **Selected plan path:** `process/features/auth-accounts/completed/wire-better-auth_09-07-26/wire-better-auth_PLAN_09-07-26.md` (newly created in-repo record; original was a native plan-mode file outside `process/`)
2. **Closeout classification:** Ready for UPDATE PROCESS archival (created directly in `completed/` since there was no `active/` in-repo file to move — see Plan Deviations)
3. **What was finished:** see "What Was Done" above
4. **Verified vs unverified:** typecheck/lint/vitest/secret-leak gates all independently re-confirmed green (one pre-existing, unrelated lint error noted); manual/simulator flows and live Google/Resend delivery remain unverified (known-gaps, backlog-tracked)
4b. **Validate-contract:** not written as an in-repo validate-contract (plan ran as a native plan-mode file outside the in-repo RIPER-5 artifact chain) — the plan's own "Verification" section served the same role and was independently re-run at EVL
5. **Cleanup done:** in-repo plan/report record created; 5 backlog notes filed; `all-context.md` and `tests/all-tests.md` refined for accuracy | **Still needed:** the commit itself (deferred to the user by explicit request), and eventually closing out the still-`active/` `db-schema` plan (out of scope for this session — flagged only)
6. **Single best next valid state:** user provisions Google OAuth client + Resend account + `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`, runs the manual simulator walkthrough, then commits (all deferred to the user per this session's explicit instructions)
7. **Commit-checkpoint recommendation:** Process commit belongs after UPDATE PROCESS — but per this session's explicit instruction, **no commit is made now**; the user will commit directly (source changes + this UPDATE PROCESS's doc/backlog changes together, or split — user's call)
8. **Regression status:** N/A — single-plan session, not a phase program
9. **SPEC achievement:** see table above (no locked SPEC; scored against plan verification criteria instead)

## Forward Preview

#### Test Infra Found
`packages/api` Vitest suite extended (auth integration tests); no new runner introduced elsewhere.

#### Blast Radius Changes
Matches the plan's stated blast radius (`packages/api`, `apps/mobile`, `packages/types`,
`packages/ui`) — no scope creep detected via `git diff --stat`.

#### Commands to Stay Green
`pnpm typecheck`, `pnpm lint`, `pnpm --filter @jojopotato/api test` (needs local Postgres via
`docker compose up -d` + `db:migrate` first).

#### Dependency Changes
Added: `better-auth`, `@better-auth/expo`, `resend`, `zod` (direct, `packages/api`),
`expo-secure-store`, `expo-web-browser` (`apps/mobile`). Bumped: `drizzle-orm` to `^0.45.2`.

## Magic-link Expo caveat (added post-report, 09-07-26)

This report predates a follow-up fix: better-auth's default magic-link flow does not log the user
in on Expo/React Native (the emailed link verifies in an external browser, not in the app — no
in-app cold-start deep-link listener; upstream issue
[better-auth/better-auth#6936](https://github.com/better-auth/better-auth/issues/6936)). The
implementation now ships a token-relay workaround instead of the flow implied above:

- `packages/api/src/lib/auth.ts` `sendMagicLink` emails a link to a new plain Express route,
  `GET /magic-link/native?token=...` (`packages/api/src/index.ts`, outside `/api/auth`), which
  302-redirects into `jojopotato:///magic-link?token=...` without server-side verification.
- `apps/mobile/src/app/(auth)/magic-link.tsx` reads the token and calls
  `authClient.magicLink.verify({ query: { token } })` itself, so the `@better-auth/expo` client's
  own SecureStore persistence stores the resulting session.
- New server env var: `APP_SCHEME` (default `jojopotato`).
- **Requires a dev build** (`expo-dev-client`) — custom schemes do not resolve in Expo Go.
- **Known-gap unchanged:** the full on-device round trip is still only verifiable on a real
  device/dev build, not headlessly or in Expo Go.

Full detail, rationale, and follow-up trigger:
`process/features/auth-accounts/backlog/wire-better-auth-magic-link-expo-caveat_NOTE_09-07-26.md`.
