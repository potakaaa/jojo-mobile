---
name: plan:dev-temp-login-button
description: "SIMPLE plan — dev-only [DEV] Temp Login button + seeded better-auth test account (jojo@test.com/jojo123) wired through useAuth().signIn"
date: 13-07-26
feature: auth-accounts
---

# PLAN: Dev Temp Login Button

**Date**: 13-07-26
**Status**: Active — validate-contract written (CONDITIONAL, PVL cycle 2)
**Complexity**: SIMPLE
**Feature:** auth-accounts
**SPEC:** `process/features/auth-accounts/active/dev-temp-login-button_13-07-26/dev-temp-login-button_SPEC_13-07-26.md`
**Context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md`

**TL;DR** — Add a seeded better-auth test account (`jojo@test.com` / `jojo123`) via `auth.api.signUpEmail` in the seed script (idempotent, fail-closed on `NODE_ENV=production`), then expose a `__DEV__`-only `[DEV] Temp Login` button on the login screen that signs in with those hardcoded credentials through the existing `useAuth().signIn` seam. 4 source files + 1 new server test. Server behavior is Fully-Automated tested; the mobile button is Agent-Probe (no RN test runner exists).

## Overview

This plan implements the locked `dev-temp-login-button` SPEC (10 acceptance criteria). It is classified **SIMPLE** — single-surface, 4-file change, one obvious approach following existing repo patterns (deal-seed idempotency in `seed.ts`, `dev-auto-login.ts` fail-closed gate, the `run()` pending helper and `SignInInput` dispatcher in the login/auth code). INNOVATE was skipped (mechanical: no competing architectural approaches). Reference context: `process/context/all-context.md` (repo architecture, auth seam), `process/context/tests/all-tests.md` (runner reality — `packages/api` vitest live, no mobile runner), `process/context/planning/all-planning.md` (SIMPLE calibration).

## Goals

- Seed a real, working email/password test account in non-prod environments via better-auth's own sign-up API.
- One-tap dev sign-in on the login screen using the seeded account, via the real auth flow.
- Both halves fail-closed by construction: seed refuses under `NODE_ENV=production`; button compiled out by `__DEV__`.
- Zero change to existing `dev:bypass` / `/dev/session` mechanism or any existing sign-in path.

## Scope

In scope: seed test-user step, `SignInInput` email/password case, dev-login button + pending state, one server test. Out of scope: everything in the SPEC's Out Of Scope section (env-var creds, elevated roles, mobile test runner, `dev-auto-login.ts` files, login visual redesign).

## Touchpoints

| File | Change |
|---|---|
| `packages/api/src/db/seed/seed.ts` | Add `TEST_USER` hardcoded creds constant (`jojo@test.com` / `jojo123`), a `seedTestUser()` step, and a fail-closed `NODE_ENV=production` guard at the top of that step. Call `seedTestUser()` from `runSeed()` and log the result. Creation via `auth.api.signUpEmail` (import `auth` from `../../lib/auth`); idempotency via find-by-`email` first (mirror `seedDealsTable` lines 144-155), skip create when found. |
| `apps/mobile/src/features/auth/hooks/use-auth.ts` | Add `{ method: 'email-password'; email: string; password: string }` to the `SignInInput` union (line ~27-31); add a `case 'email-password'` to the dispatcher (line ~74-104) calling `authClient.signIn.email({ email, password })` and returning `toResult(error)`. |
| `apps/mobile/src/app/(auth)/login.tsx` | Widen `pending` union to `'magic-link' \| 'google' \| 'dev-temp-login' \| null` (line 47) and the `run()` action param type (line 53); add a `__DEV__`-guarded `[DEV] Temp Login` `Button` inside the `alt` `View` block (below `GoogleButton`, ~line 164) calling `run('dev-temp-login', { method: 'email-password', email: 'jojo@test.com', password: 'jojo123' })`, with `loading={pending === 'dev-temp-login'}` and `disabled={busy}`. |
| `packages/api/src/db/seed/__tests__/seed-test-user.test.ts` (NEW) | Vitest coverage for the seed test-user step (see Verification Evidence). Mirror the env-preamble + dynamic-import pattern of `auth.integration.test.ts`. |

**Placement justification (button):** the `alt` block already groups non-primary sign-in affordances (`GoogleButton`) and is styled with `gap: Spacing.two`, so a debug affordance sits there naturally and stays visually separate from the primary magic-link `Button` inside the `Card`. Rendering under `__DEV__` inside `alt` keeps the production tree (Card + Google) unchanged when the branch is stripped.

## Public Contracts

- `SignInInput` (exported type in `use-auth.ts`) gains one union member — additive, no existing caller breaks. New behavior visible to any screen calling `signIn`.
- No new API route, no schema change, no migration. `auth.api.signUpEmail` and `authClient.signIn.email` are existing better-auth surfaces (email/password already enabled server-side, `packages/api/src/lib/auth.ts` ~51-53).
- Seed script gains one more seeded row type (a `users` row) — visible to anyone running `pnpm --filter @jojopotato/api db:seed` (or the seed entry). `role` stays server-owned default `customer`.

## Blast Radius

- **Files:** 3 source + 1 new test = 4. **Packages:** `packages/api` (seed + test), `apps/mobile` (hook + screen). **Risk class:** auth/identity surface (seeded credential + real sign-in path) — but no schema/migration, no new public route, no privilege change (role stays `customer`), and both halves are fail-closed. Non-prod-only by construction.
- **Regression surface:** existing `auth.integration.test.ts` (5 cases) must keep passing — the seed change adds a new `users` row type but does not alter auth config. Existing magic-link/Google/phone-OTP dispatcher cases in `use-auth.ts` are untouched (new case is additive).

## Implementation Checklist

1. In `packages/api/src/db/seed/seed.ts`, add a module-level constant `const TEST_USER = { email: 'jojo@test.com', password: 'jojo123', name: 'Jojo Test' } as const;` with a comment marking it a hardcoded dev-only credential (per locked decision, not env-driven).
2. Add `import { auth } from '../../lib/auth';` and the `users` table to the schema import in `seed.ts`.
3. Write and `export` `async function seedTestUser(): Promise<void>` (declare it `export async function seedTestUser()` -- existing seed helpers like `seedDealsTable` are NOT exported, but the isolated test `seed-test-user.test.ts` must import `seedTestUser` directly, so this one is exported) that: (a) fail-closed guard — `if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed a known test credential under NODE_ENV=production.')` (mirror `dev-auto-login.ts` throw-and-refuse style, lines 25-30); (b) find-first — `select` from `users` where `eq(users.email, TEST_USER.email)`; (c) if a row exists, `return` (idempotent no-op, mirror `seedDealsTable` find-first at lines 144-155); (d) else create via `await auth.api.signUpEmail({ body: { email, password, name } })` — NOT a raw `users`/`account` insert (better-auth must own the scrypt hash).
4. Call `await seedTestUser();` inside `runSeed()` (after the existing seed steps) and add a `console.log` line to the seed summary (e.g. `test user: ${TEST_USER.email}`).
5. In `apps/mobile/src/features/auth/hooks/use-auth.ts`, add `| { method: 'email-password'; email: string; password: string }` to the `SignInInput` union and update the union's doc comment (lines 24-26) to note email/password now has a dev-only client entry point.
6. Add `case 'email-password': { const { error } = await authClient.signIn.email({ email: input.email, password: input.password }); return toResult(error); }` to the `signIn` dispatcher.
7. In `apps/mobile/src/app/(auth)/login.tsx`, widen the `pending` state union (line 47) and the `run()` `action` parameter type (line 53) to include `'dev-temp-login'`.
8. Add the `__DEV__`-guarded button inside the `alt` `View` (after `GoogleButton`): `{__DEV__ ? (<Button mode={mode} variant="outline" label="[DEV] Temp Login" onPress={() => run('dev-temp-login', { method: 'email-password', email: 'jojo@test.com', password: 'jojo123' })} disabled={busy} loading={pending === 'dev-temp-login'} />) : null}` — reusing the existing `error` inline area for failures (no new error path needed; `run()` already sets `error` on `!result.ok`).
9. Create `packages/api/src/db/seed/__tests__/seed-test-user.test.ts` with the four Fully-Automated cases in Verification Evidence, using the env-preamble + dynamic-import pattern from `auth.integration.test.ts` (lines 17-48).
10. Run the verification gates (see Verification Evidence) and fix any failure inline.

## Acceptance Criteria

Maps 1:1 to the SPEC's 10 acceptance criteria (AC-1..AC-10). Each is proven by the matching row in Verification Evidence below. Server-side criteria (AC-1, AC-2, AC-3, AC-4, AC-10 regression) are Fully-Automated; mobile UI criteria (AC-5..AC-9) are Agent-Probe / Known-Gap per the project-wide no-mobile-runner gap. Plan is done when all Fully-Automated gates are green and all Agent-Probe gates have a recorded manual-QA judgment.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/api test` — new test: after `seedTestUser()`, a `users` row for `jojo@test.com` exists and `signInEmail` with `jojo123` returns a truthy token, role `customer` | Fully-Automated | AC-1, AC-4 |
| Same suite — calling `seedTestUser()` twice does not throw and leaves exactly one `users` row for that email | Fully-Automated | AC-2 |
| Same suite — with `NODE_ENV` set to `production` (restored after), `seedTestUser()` rejects/throws and creates no row | Fully-Automated | AC-3 |
| Existing `auth.integration.test.ts` (5 cases) continues to pass unmodified | Fully-Automated (regression) | AC-10 |
| `pnpm --filter @jojopotato/api typecheck` + `pnpm --filter @jojopotato/mobile typecheck` + `pnpm lint` green | Fully-Automated | AC-1..AC-10 (compile integrity of union + dispatcher + button) |
| Agent-Probe QA on local dev build: `[DEV] Temp Login` visible & marked as debug affordance, distinct from magic-link/Google | Agent-Probe | AC-5 |
| Agent-Probe: tap button → land on authenticated tab bar with no extra input | Agent-Probe | AC-6 |
| Agent-Probe: during sign-in, button shows loading + other controls disabled | Agent-Probe | AC-7 |
| Agent-Probe: against unseeded env, tapping shows inline error in the existing error area, no crash, retry works | Agent-Probe | AC-8 |
| Code review at EXECUTE/VALIDATE: button + handler gated behind `__DEV__` (Metro strips dead branch) — recorded Known-Gap for automated build-artifact inspection | Agent-Probe | AC-9 |
| Agent-Probe one-liner: magic-link & Google buttons still present/unchanged; `dev:bypass` untouched | Hybrid (test regression + probe) | AC-10 |

**Known-Gap note (AC-9):** No mobile build-artifact inspection tooling exists in this repo. AC-9's structural production-exclusion is verified by manual code review confirming the `__DEV__` gate, recorded as a Known-Gap for automated verification. Backlog stub: this reuses the existing project-wide "no mobile test runner / no build-artifact inspection" gap (`mobile-e2e-navigation-harness_NOTE_09-07-26.md` + `wire-better-auth-hook-test-coverage_NOTE_09-07-26.md`); no new stub required — AC-9's gate stays CONDITIONAL pending manual code-review confirmation at VALIDATE.

## Test Infra Improvement Notes

(none identified yet — mobile-side Agent-Probe reliance is the pre-existing project-wide runner gap, inherited as-is per SPEC Out Of Scope; not introduced by this plan.)

## Phase Completion Rules

- This is a single-phase SIMPLE plan; "done" means: all Fully-Automated gates green (server test + typecheck + lint + existing suite regression), and all Agent-Probe gates carry a recorded manual-QA judgment.
- Code-only completion is `CODE DONE`, not `VERIFIED`. The plan reaches `VERIFIED` only after the Agent-Probe manual QA script has been run and confirmed on a local dev build (AC-5..AC-9) and the server suite is green.
- AC-9's `__DEV__` production-exclusion gate stays CONDITIONAL (manual code review) — do not mark the plan fully VERIFIED on automated evidence alone.
- Do not use `✅ VERIFIED` without explicit user-confirmed manual QA.

## Dependencies & Risks

- **Dependency:** the new server test needs a running local Postgres + migrations applied (`docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate`), same as the existing `auth.integration.test.ts`.
- **Risk (low):** `auth.api.signUpEmail` may require request headers/context in some better-auth versions — the existing integration test (lines 59-61) calls it with only `{ body: {...} }` successfully, so the same call shape is proven to work in this repo. Mitigation: mirror that exact call.
- **Risk (low):** if the seed runs before migrations, the `users` table won't exist — same pre-existing constraint as all other seed steps; no new handling needed.
- **Backwards compatibility:** `SignInInput` change is additive; no existing caller passes `email-password` today, so no reconciliation needed.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/auth-accounts/active/dev-temp-login-button_13-07-26/dev-temp-login-button_PLAN_13-07-26.md`
2. **Last completed step:** plan written + PVL cycle 2 complete (validate-contract CONDITIONAL); no code changed yet.
3. **Validate-contract status:** written (CONDITIONAL, PVL cycle 2, 13-07-26) — supersedes the cycle-1 contract; ready for EXECUTE.
4. **Context files loaded:** SPEC (above), `process/context/all-context.md`, `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md`, `seed.ts`, `data.ts`, `login.tsx`, `use-auth.ts`, `auth.integration.test.ts`, `dev-auto-login.ts` (server).
5. **Next step for a fresh agent:** start at checklist item 1 (server seed step + test) which is fully unit-testable and de-risks the auth path, then items 5-8 (mobile hook + button), then run all gates. Do NOT touch either `dev-auto-login.ts` file.

## Next Step

Plan complete and validated (PVL cycle 2, Gate: CONDITIONAL — terminal, accepted known-gaps). Proceed to EXECUTE — say **ENTER EXECUTE MODE**.

## Deviations

- **Dev password `jojo123` → `jojo1234` (within blast radius).** better-auth enforces a default
  8-character minimum password; the SPEC-locked `jojo123` (7 chars) is rejected at
  `auth.api.signUpEmail` with `PASSWORD_TOO_SHORT`. Discovered during EXECUTE when the create/
  idempotent server tests failed. Resolved by lengthening the dev credential by one char in all
  three sites (`seed.ts` `TEST_USER`, `login.tsx` button, `seed-test-user.test.ts`), keeping the
  email and everything else identical. Rejected alternative: lowering
  `emailAndPassword.minPasswordLength` in `packages/api/src/lib/auth.ts` — that weakens password
  policy for all real email/password users (auth-surface, hard-stop-class regression) and is out
  of scope. Impact: none beyond the dev credential value; fail-closed guards, `__DEV__` gate, and
  `role=customer` are all unchanged.

## Validate Contract

Status: CONDITIONAL
Date: 13-07-26
date: 2026-07-13
generated-by: outer-pvl
supersedes: 2026-07-13 (outer-pvl) — outer PVL re-run after SUPPLEMENT_APPLIED; checklist item 3 now mandates `export async function seedTestUser()`, closing the mechanical test-coverage concern (the isolated seed test can now import the function directly)

Parallel strategy: sequential
Rationale: 1/7 signals present (S2 — auth/identity surface). 4-file single-surface SIMPLE change; no multi-package fan-out benefit. Validate fan-out ran inline (sequential); EXECUTE runs as one vc-execute-agent (opus).

Test gates (C3 5-column table — ADDITIVE; legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 / AC-4 | `seedTestUser()` creates a `jojo@test.com` users row; sign-in with `jojo123` returns a truthy token, role `customer` | Fully-Automated | `pnpm --filter @jojopotato/api test` (new `seed-test-user.test.ts` create case) exits 0 | A |
| AC-2 | Calling `seedTestUser()` twice leaves exactly one row, no throw (idempotent) | Fully-Automated | Same suite, double-call case | A |
| AC-3 | Under `NODE_ENV=production`, `seedTestUser()` throws and creates no row (fail-closed) | Fully-Automated | Same suite, prod-guard case (env restored in `afterEach`) | A |
| AC-10 | Existing `auth.integration.test.ts` (5 cases) still passes (auth config unchanged) | Fully-Automated | `pnpm --filter @jojopotato/api test` (whole suite green) | A |
| AC-1..AC-10 | Union + dispatcher + button compile; lint clean | Fully-Automated | `pnpm --filter @jojopotato/api typecheck` + `pnpm --filter @jojopotato/mobile typecheck` + `pnpm lint` | A |
| AC-5 | `[DEV] Temp Login` visible, marked debug, distinct from magic-link/Google | Agent-Probe | Manual QA on local dev build | C |
| AC-6 | Tap → land on authenticated tab bar, no extra input | Agent-Probe | Manual QA on local dev build | C |
| AC-7 | During sign-in, button shows loading + other controls disabled | Agent-Probe | Manual QA on local dev build | C |
| AC-8 | Against unseeded env, tap shows inline error, no crash, retry works | Agent-Probe | Manual QA on local dev build | C |
| AC-9 | Button + handler stripped from production build via `__DEV__` (Metro dead-branch elimination) | Agent-Probe (Known-Gap for automated build-artifact inspection) | Manual code review confirms `__DEV__` gate | D |

gap-resolution legend: A — proven now · B — fixed in this plan · C — deferred (manual QA at EXECUTE/VERIFIED) · D — backlog test-building stub (named residual; keep-active)

C-4 reconciliation: `strategy` column carries ONLY the 3 proving strategies (Fully-Automated / Agent-Probe here; no Hybrid rows). Known-Gap is a named residual (AC-9, gap-resolution D), never a proving strategy.

Legacy line form (retained for existing consumers):
- Server seed (create/idempotent/prod-guard/regression): Fully-automated: `pnpm --filter @jojopotato/api test`
- Compile integrity: Fully-automated: `pnpm --filter @jojopotato/api typecheck && pnpm --filter @jojopotato/mobile typecheck && pnpm lint`
- Mobile button (AC-5..AC-8): agent-probe: manual QA on local dev build
- Mobile production-exclusion (AC-9): known-gap: documented — manual code review of `__DEV__` gate (no RN build-artifact inspection tooling in repo)

Failing stub (AC-1/AC-4, Fully-Automated):
```
test("should create a jojo@test.com users row with role customer and allow sign-in with jojo123", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: seedTestUser creates account + sign-in returns token, role customer")
})
```
Failing stub (AC-2, Fully-Automated):
```
test("should leave exactly one row and not throw when seedTestUser is called twice", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: seedTestUser idempotent double-call")
})
```
Failing stub (AC-3, Fully-Automated):
```
test("should throw and create no row when NODE_ENV is production", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: seedTestUser fail-closed under NODE_ENV=production")
})
```

Dimension findings:
- Infra fit: PASS — vitest `include: ['src/**/__tests__/**/*.test.ts']` (confirmed in `packages/api/vitest.config.ts:6`) matches the new `src/db/seed/__tests__/seed-test-user.test.ts`; relative import `../../lib/auth` resolves; `runSeed()` call site (seed.ts:206) and `seedDealsTable` find-first idempotency (seed.ts:129) exist as cited; `signUpEmail({ body })` shape proven working (auth.integration.test.ts:59-60). No change from cycle 1.
- Test coverage: CONCERN (mechanical sub-concern RESOLVED this cycle) — cycle-1's one fixable concern (the isolated seed test could not import an unexported helper) is CLOSED: checklist item 3 now mandates `export async function seedTestUser()`, so the AC-1..AC-4 Fully-Automated rows can import it directly rather than depending on an execute-instruction. Remaining CONCERN is solely the inherited project-wide no-RN-runner gap: mobile UI (AC-5..AC-9) rests on Agent-Probe/Known-Gap only; AC-9 rests on Known-Gap (manual review) alone → forces CONDITIONAL per the vacuous-green ban. Accepted, already-backlogged known-gap.
- Breaking changes: PASS — `SignInInput` gains one union member (additive; the union is still the original 4 members in source — no existing caller passes `email-password`); no schema/migration/new route; server rejects a client-supplied `role` (proven at auth.integration.test.ts:78-79, `role: 'admin'` signup rejected) so role stays `customer`; regression covered by the 5-case auth suite.
- Security surface: CONCERN — auth/identity class: seeds a known weak credential (`jojo@test.com`/`jojo123`) with a real sign-in path. Server gate is `NODE_ENV==='production'` refusal ONLY; any non-`production` NODE_ENV (staging/preview) WILL seed the account and it persists even when the `__DEV__` button is stripped. Role stays `customer` (no privilege escalation). Matches the locked SPEC decision (hardcoded dev creds accepted). Full 5-artifact risk-evidence pack judged disproportionate for a non-prod customer-role dev credential; accepted as documented concern.
- Section feasibility (single SIMPLE section): PASS (was CONCERN in cycle 1) — the one mechanical gap flagged in cycle 1 (internal seed helpers not exported, so `seedTestUser` could not be imported by the isolated test) is CLOSED by checklist item 3's `export` mandate. All edit targets confirmed present in source: `runSeed()` (seed.ts:206), `seedDealsTable` idempotency (seed.ts:129), `SignInInput` union (use-auth.ts:27-31), `signIn` dispatcher with `toResult(error)` pattern (use-auth.ts:74-101), login `pending` union (login.tsx:47), `alt` block placement. Highest-risk edit is the `auth.api.signUpEmail` seed call, which requires a live local Postgres + applied migrations (same precondition as the existing integration suite — see E3); mechanically feasible.

Open gaps:
- Mobile UI automated coverage (AC-5..AC-9): known-gap: documented — reuses the existing project-wide no-RN-test-runner residual; backlog stubs already exist (`process/features/*/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`, `wire-better-auth-hook-test-coverage_NOTE_09-07-26.md`). No new stub required.
- AC-9 `__DEV__` production-exclusion: known-gap: documented — no mobile build-artifact inspection tooling; verified by manual code review only.

Execute-Agent Instructions:
- E1: The new `seedTestUser` function is now exported per checklist item 3 (mandated, not just advised). The isolated test at `packages/api/src/db/seed/__tests__/seed-test-user.test.ts` MUST import and exercise `seedTestUser` directly — do NOT test it only through `runSeed()` (that would require full seed data + running every other step).
- E2: Mirror the test pattern from `packages/api/src/lib/__tests__/auth.integration.test.ts` (env-preamble lines 17-24 + dynamic-import lines 41-48). Note the real path is `src/lib/__tests__/`, not `src/routes/`. Set/restore `process.env.NODE_ENV` around the prod-guard case so it does not leak into other cases.
- E3: The seed call needs a live local Postgres with migrations applied (`docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate`) before the server test suite will pass — same precondition as the existing integration suite.
- E4: AC-9 stays CONDITIONAL — do not mark the plan `VERIFIED` on automated evidence alone; require the recorded manual-QA judgment for AC-5..AC-9 and the `__DEV__`-gate code-review confirmation.

What this coverage does NOT prove:
- `pnpm --filter @jojopotato/api test` proves the seed create/idempotency/prod-guard server behavior and auth-config regression — it does NOT prove any mobile rendering, navigation, loading-state, or error-surface behavior (AC-5..AC-8), nor that the `__DEV__` branch is actually stripped from a production Metro bundle (AC-9).
- The typecheck+lint gate proves the union member, dispatcher case, and button compile and pass lint — it does NOT prove runtime behavior of the button or the sign-in round-trip.
- No gate proves the seeded account is absent from a non-`production` deployed environment (staging/preview) — the fail-closed guard only fires on `NODE_ENV=production`.

Gate: CONDITIONAL (0 FAILs; the one fixable concern from cycle 1 — the unexported seed helper — is RESOLVED by the supplement (checklist item 3 now mandates the export), and the Layer 2 section verdict rose from CONCERN to PASS. The two remaining CONCERNs are documented, accepted known-gaps: mobile-UI automated coverage is the inherited project-wide no-RN-runner residual (already backlogged), and the seeded-credential surface matches the locked SPEC decision. This CONDITIONAL is terminal — post-supplement cycle with 0 FAILs and explicitly-accepted gaps — proceed to EXECUTE.)
Accepted by: session (autonomous, /goal execution) — accepted concerns: (1) mobile-UI automated coverage gap (inherited no-RN-runner residual, already backlogged); (2) auth/identity seeded-credential surface gated only by NODE_ENV=production (locked SPEC decision); (3) AC-9 `__DEV__` production-exclusion verified by manual code review only. Reaffirms the cycle-1 acceptance.

## Autonomous Goal Block

```
SESSION GOAL: Add a dev-only [DEV] Temp Login button + seeded better-auth test account (jojo@test.com/jojo123) wired through useAuth().signIn
Charter + umbrella plan: N/A — single plan
Autonomy: standard interactive RIPER-5; ENTER EXECUTE MODE gate applies. Per implementation-standards.md commit hygiene (commit on main).
Hard stop conditions / safety constraints:
- Never weaken the fail-closed guards: seed must throw under NODE_ENV=production; button must stay behind __DEV__.
- Do not touch either dev-auto-login.ts file, the /dev/session route, or dev:bypass.
- role must stay server-owned default 'customer' — no elevated role for the seeded account.
- Do not raw-insert users/account rows — creation goes through auth.api.signUpEmail so better-auth owns the scrypt hash.
Next phase: EXECUTE: process/features/auth-accounts/active/dev-temp-login-button_13-07-26/dev-temp-login-button_PLAN_13-07-26.md
Validate contract: inline in plan (Gate: CONDITIONAL — E1–E4 carried to EXECUTE)
Execute start: fully-auto: pnpm --filter @jojopotato/api test | pnpm --filter @jojopotato/api typecheck | pnpm --filter @jojopotato/mobile typecheck | pnpm lint || agent-probe: manual QA of [DEV] Temp Login on local dev build (AC-5..AC-9) | high-risk pack: no (non-prod customer-role dev credential; disproportionate)
```
