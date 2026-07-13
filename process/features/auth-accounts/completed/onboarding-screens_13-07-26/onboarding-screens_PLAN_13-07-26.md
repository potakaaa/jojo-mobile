---
name: plan:onboarding-screens
description: "Add a 3-step post-auth onboarding (feature previews → promo previews → required info form) shown once per account, gated by a new per-account onboardedAt field, without touching the existing pre-auth welcome flow"
date: 13-07-26
feature: auth-accounts
metadata:
  node_type: plan
  type: plan
  status: completed
---

# Post-Auth Onboarding Screens — Plan (COMPLEX)

**Date**: 13-07-26
**Status**: ✅ ARCHIVED (13-07-26) — EXECUTE done, EVL all-green (automated + hybrid gates), a
post-EVL birthday-UX refinement applied (MM/DD/YYYY auto-tab, gates re-confirmed green), the user's
manual Agent-Probe walkthrough (AC1–AC7) confirmed working, and this plan folder was archived to
`process/features/auth-accounts/completed/onboarding-screens_13-07-26/`. Mobile hook/screen runtime
behavior remains covered by manual Agent-Probe only — no automated RN-runner coverage exists yet;
tracked as a Known-Gap backlog stub (see `process/features/auth-accounts/backlog/wire-better-auth-hook-test-coverage_NOTE_09-07-26.md`
§Extension). The execution commit is being made immediately after this UPDATE PROCESS pass.
**Complexity**: COMPLEX (multi-package: `packages/api` schema + auth config, `packages/types` contract, `apps/mobile` hook + nav gate + new route group; high-risk classes: auth/identity, schema/migration, public API contract)
**Feature:** auth-accounts
**Design status:** LOCKED — this plan transcribes an already-approved design (`~/.claude/plans/summary-build-the-snappy-quiche.md`). No approach re-exploration; render-only.

> **TL;DR:** Add per-account `address` + `onboardedAt` columns to `users`, expose them (plus existing `birthday`) as writable better-auth `additionalFields`, mirror them in shared types + the mobile auth client, add a **separately-named** `hasCompletedProfile`/`completeProfile` accessor to `useAuth()` (leaving the pre-auth `hasOnboarded`/`completeOnboarding` untouched), add a third nav gate, and build a new `(onboarding)` route group with a 3-step flow (2 skippable previews → 1 required info form). EXECUTE splits into **Unit A (backend)** then **Unit B (mobile)**. VALIDATE is required before EXECUTE (high-risk auth/schema surface).

---

## Overview / Context

### Why
New users must be introduced to the app and provide core profile details before reaching Home (PRD §6.1 + user clarifications). This adds a **3-step, post-authentication** onboarding shown **once per account** — *in addition to* the existing pre-auth welcome screen, which is **kept** (not retired). This closes the "Full PRD §6.1 onboarding profile collection" follow-up deferred by the completed `wire-better-auth` plan (see `process/features/auth-accounts/backlog/wire-better-auth-followups_NOTE_09-07-26.md`).

### Two independent onboarding layers (must stay independent)
| Layer | State source | Status in this plan |
|---|---|---|
| **Pre-auth welcome** — Splash → `(auth)/onboarding.tsx` ("Get Started") → Login | local/device `hasOnboarded` (`useState`) + `completeOnboarding()` | **UNCHANGED — do not modify** |
| **Post-auth account onboarding** — shown after login/signup for first-timers | new per-account `onboardedAt` field (server) | **NEW** — this plan builds it |

### The three post-auth steps (single screen, internal step state `0=features · 1=promos · 2=info`)
1. **Feature previews** — advisory. Has **Skip**.
2. **Promo previews** — advisory. Has **Skip**.
3. **User info collection** — **required** form: **Full name, birthday, address (all mandatory)**. No Skip. Submitting saves the fields and completes account onboarding.

**Skip semantics:** Skip on either preview jumps to the info form (step 2 index) — **never Home**, because the form is not skippable. Account onboarding completes **only** on form submit (which stamps `onboardedAt`).

### What exists today (verified against source)
- `packages/api/src/db/schema/users.ts` has `name`, `email`, `phoneNumber`, `birthday` (`date`), `favoriteBranchId`, `role` — but **no `address`** and **no `onboardedAt`** column.
- `packages/api/src/lib/auth.ts` exposes exactly one `additionalFields` entry: `role` (`input: false`, server-owned). This is the established pattern to follow.
- `apps/mobile/src/features/auth/lib/auth-client.ts` mirrors `role` via `inferAdditionalFields` (`input: false`).
- `apps/mobile/src/features/auth/hooks/use-auth.ts` derives `AuthUser` from `authClient.useSession()`, exposes `{ user, role, isLoading, hasOnboarded, signIn, signOut, completeOnboarding }`. `hasOnboarded` is a local `useState(false)`.
- `apps/mobile/src/app/_layout.tsx` `RootNavigator` has **two** `Stack.Protected` gates: `isAuthenticated → (tabs)`, `!isAuthenticated → (auth)`. `isLoading` keeps the user in the public stack.
- `packages/types/src/auth.ts` `AuthUser` has `id, name, email, phoneNumber?, role`.
- Migrations output to **`packages/api/drizzle/`** (per `drizzle.config.ts` `out: './drizzle'`), NOT `src/db/migrations/`. Existing files: `0000_puzzling_lightspeed.sql`, `0001_daily_carnage.sql`. Next generated file will be `packages/api/drizzle/0002_*.sql`. *(The approved summary said `src/db/migrations/0002_*.sql`; this is the same decision, path-corrected to repo reality.)*
- `packages/api` has a Vitest suite (`src/lib/__tests__/auth.integration.test.ts`, `src/db/schema/__tests__/smoke.test.ts`) run against real local Postgres. `apps/mobile` has **no** test runner (project-wide RN runner gap — `process/context/tests/all-tests.md`).

### Locked design decisions (transcribed, do not revisit)
1. **Persistence = server-side per-account.** New nullable columns on `users`: `address: varchar('address')`, `onboardedAt: timestamp('onboarded_at')`. `birthday` (`date`) already exists — reuse. DB-nullable for back-compat; the *form* enforces required.
2. **Expose via `additionalFields`** in `auth.ts` alongside read-only `role`: `birthday {type:'string',required:false,input:true}`, `address {type:'string',required:false,input:true}`, `onboardedAt {type:'date',required:false,input:true}`. `input:true` so the client can write its **own** profile fields via `updateUser` (self-data only — accepted low risk, see Security).
3. **Shared types**: extend `AuthUser` with `birthday?`, `address?`, `onboardedAt?` (all `string | null`).
4. **Mobile client**: mirror the 3 fields in `inferAdditionalFields` (`birthday`/`address` as `string`, `onboardedAt` as `date`, all `input:true`).
5. **`use-auth.ts` (ADDITIVE — remove nothing)**: keep `hasOnboarded` + `completeOnboarding()` exactly as-is; map `onboardedAt`/`birthday`/`address` into derived `AuthUser`; add `hasCompletedProfile = user?.onboardedAt != null`; add `completeProfile(info)` → `authClient.updateUser({...})` + session refresh. Reuse existing `toResult` helper.
6. **`_layout.tsx`**: add a THIRD gate mounting `(onboarding)`; leave `(auth)`/`(tabs)` intact; preserve `isLoading` → stay-in-public.
7. **New `(onboarding)/` group** mirroring `(auth)`/`(tabs)` conventions.
8. **Pre-auth welcome LEFT UNCHANGED**: no edits to `(auth)/onboarding.tsx`, `(auth)/_layout.tsx`, `(auth)/splash.tsx` (or any `(auth)/` file).

### Out of scope
- Real preview illustrations / final marketing copy (placeholders fine — reuse `MASCOT_IMAGE` / `PRODUCT_TRIO_IMAGE`).
- Native date-picker dependency for birthday (validated `YYYY-MM-DD` text `Input` is the default).
- Favorite-branch field (PRD §6.1 optional) and analytics events.
- SMS/OAuth live provisioning (existing stubs; auth-accounts backlog).
- Introducing a mobile-side (RN) test runner (mobile hook/screen coverage stays a documented known-gap).

Context routing used: `process/context/all-context.md` (root router), `process/context/tests/all-tests.md` (test runner selection), `process/features/auth-accounts/completed/wire-better-auth_09-07-26/` (established `additionalFields`/users-table pattern).

---

## Touchpoints

Files changed or read during EXECUTE:

**Unit A — backend (`packages/api`)**
- `packages/api/src/db/schema/users.ts` — MODIFY: add `address` + `onboardedAt` columns.
- `packages/api/drizzle/0002_*.sql` — GENERATED by `db:generate` (review, do not hand-edit).
- `packages/api/src/lib/auth.ts` — MODIFY: add 3 `additionalFields` entries.
- `packages/api/src/lib/__tests__/auth.integration.test.ts` — MODIFY (recommended): add a self-write coverage case (see checklist B0 / test gates).

**Unit A — shared contract (`packages/types`)**
- `packages/types/src/auth.ts` — MODIFY: extend `AuthUser`.

**Unit B — mobile (`apps/mobile`)**
- `apps/mobile/src/features/auth/lib/auth-client.ts` — MODIFY: mirror 3 fields in `inferAdditionalFields`.
- `apps/mobile/src/features/auth/hooks/use-auth.ts` — MODIFY (additive): map new fields, add `hasCompletedProfile` + `completeProfile`.
- `apps/mobile/src/app/_layout.tsx` — MODIFY: add third nav gate.
- `apps/mobile/src/app/(onboarding)/_layout.tsx` — NEW: `Stack`, `headerShown:false`.
- `apps/mobile/src/app/(onboarding)/index.tsx` — NEW: 3-step screen.

**Read-only references (patterns to mirror, not to modify)**
- `apps/mobile/src/app/(auth)/onboarding.tsx`, `(auth)/login.tsx` — compact-height/layout patterns, `SafeAreaView` + `@jojopotato/ui` + `@/constants/theme` tokens.
- `apps/mobile/src/app/(auth)/_layout.tsx`, `(tabs)/_layout.tsx` — `Stack` group convention.
- `apps/mobile/src/constants/images.ts` — `MASCOT_IMAGE`, `PRODUCT_TRIO_IMAGE`.

**Explicitly NOT touched:** any `apps/mobile/src/app/(auth)/*` file.

---

## Public Contracts

Interfaces/behaviors visible to other packages or callers after this change:

1. **DB schema (`users` table)** — two new nullable columns `address` (varchar), `onboarded_at` (timestamp). Additive; existing rows get `NULL`. No rename, no drop, no NOT NULL. Back-compatible.
2. **better-auth API contract** — `additionalFields` gains `birthday`, `address`, `onboardedAt` with `input:true`. This makes them **client-writable** via `authClient.updateUser(...)` for the authenticated user's own record. `role` remains `input:false` (unchanged). Session `user` payload now carries these fields.
3. **`@jojopotato/types` `AuthUser`** — gains optional `birthday?`, `address?`, `onboardedAt?` (`string | null`). Additive optional fields; existing consumers (`use-auth.ts` is the only one) unaffected unless they opt in.
4. **`useAuth()` context value** — gains `hasCompletedProfile: boolean` and `completeProfile(info: { name; birthday; address }): Promise<SignInResult>`. Additive; existing `hasOnboarded`/`completeOnboarding`/`signIn`/`signOut` signatures unchanged.
5. **Navigation contract** — a new authenticated-but-incomplete state routes to `(onboarding)` instead of `(tabs)`. Existing unauth → `(auth)` and complete-auth → `(tabs)` paths unchanged.

---

## Blast Radius

| Dimension | Value |
|---|---|
| Files modified | 7 (`users.ts`, `auth.ts`, `auth.integration.test.ts`, `types/auth.ts`, `auth-client.ts`, `use-auth.ts`, `_layout.tsx`) |
| Files generated | 1 (`drizzle/0002_*.sql`) |
| Files created | 2 (`(onboarding)/_layout.tsx`, `(onboarding)/index.tsx`) |
| Packages touched | 3 (`packages/api`, `packages/types`, `apps/mobile`) |
| Risk classes | **auth/identity**, **schema/data migration**, **public API contract** (three high-risk classes → VALIDATE mandatory, hybrid test minimum) |
| Reversibility | Schema change is additive-nullable (low rollback cost — drop columns / revert migration). Auth-config + mobile changes are code-reversible. Migration requires a running Postgres to apply. |

---

## Implementation Checklist (atomic, ordered)

Execution splits into **Unit A (backend, first)** then **Unit B (mobile)**. Do not start Unit B until Unit A typecheck + migration + vitest gates are green — the mobile client's `inferAdditionalFields` and `AuthUser` shape depend on the server contract being final.

### Unit A — Backend field + migration + auth config

**A1.** In `packages/api/src/db/schema/users.ts`, add two nullable columns to the `users` `pgTable` (place near `birthday`, keep camelCase JS keys / snake_case column names to match the adapter convention):
```ts
address: varchar('address'),
onboardedAt: timestamp('onboarded_at'),
```
`varchar` and `timestamp` are already imported at the top of the file. `birthday` stays as-is (reused).

**A2.** Generate the migration:
```bash
pnpm --filter @jojopotato/api db:generate
```
Confirm it produces exactly **one** new file `packages/api/drizzle/0002_*.sql` whose only changes are `ALTER TABLE "users" ADD COLUMN "address" ...` and `ADD COLUMN "onboarded_at" ...` — both **nullable** (no `NOT NULL`, no default backfill, no other table touched). **Review the SQL before applying.** If it contains anything else, STOP and surface — do not hand-edit generated SQL.

**A3.** Apply the migration against dev Postgres (precondition: `docker compose up -d` running):
```bash
pnpm --filter @jojopotato/api db:migrate
```

**A4.** In `packages/api/src/lib/auth.ts`, extend `user.additionalFields` (currently only `role`) to add three writable fields alongside it:
```ts
birthday:    { type: 'string', required: false, input: true }, // 'YYYY-MM-DD'
address:     { type: 'string', required: false, input: true },
onboardedAt: { type: 'date',   required: false, input: true },
```
Leave `role` exactly as-is (`input: false`). Do not change any other `betterAuth({...})` option.

**A5.** In `packages/types/src/auth.ts`, extend the `AuthUser` interface with the three optional fields (keep the "provider-agnostic, no better-auth import" property of this file):
```ts
birthday?: string | null;
address?: string | null;
onboardedAt?: string | null;
```

**B0 (test coverage — recommended, in Unit A).** Extend `packages/api/src/lib/__tests__/auth.integration.test.ts` with one case proving the new API contract: a signed-in user can `updateUser({ birthday, address, onboardedAt })` and read those values back on the session, AND a client attempt to set `role` is still ignored (server-owned). This gives an automated/hybrid proof for the high-risk auth API-contract change (AC5/AC6 server side). If the existing test harness cannot express `updateUser` self-write, record the gap in Test Infra Improvement Notes and fall back to typecheck-only for the config change.

### Unit B — Mobile hook + gating + screens

**B1.** In `apps/mobile/src/features/auth/lib/auth-client.ts`, mirror the three fields in `inferAdditionalFields.user` (next to `role`):
```ts
birthday:    { type: 'string', input: true },
address:     { type: 'string', input: true },
onboardedAt: { type: 'date',   input: true },
```
Leave `role: { type: 'string', input: false }` as-is.

**B2.** In `apps/mobile/src/features/auth/hooks/use-auth.ts` (ADDITIVE — remove nothing):
- Keep `hasOnboarded` (`useState`) + `completeOnboarding()` exactly as-is.
- Widen the `sessionUser` cast + `AuthUser` mapping to include `birthday`, `address`, `onboardedAt` (map `undefined`/missing → `null`).
- Add to `AuthContextValue` and the memoized `value`: `hasCompletedProfile: boolean` = `user?.onboardedAt != null`.
- Add `completeProfile(info: { name: string; birthday: string; address: string }): Promise<SignInResult>`:
  - call `authClient.updateUser({ name: info.name, birthday: info.birthday, address: info.address, onboardedAt: new Date() })`
  - on success, refresh the session so the nav gate flips without an app restart — refetch via `authClient.useSession()`'s refetch or `authClient.getSession()` if `useSession()` is stale (use whichever the installed better-auth client exposes; confirm the exact method name against the installed `better-auth/react` client during EXECUTE).
  - return via the existing `toResult(error)` helper.
- Add `hasCompletedProfile` and `completeProfile` to the `useMemo` dependency array / returned object.

**B3.** In `apps/mobile/src/app/_layout.tsx` `RootNavigator`, read `hasCompletedProfile` from `useAuth()` and add a THIRD gate. Final gate logic (preserve `isLoading` → stay-in-public):
```
isAuthenticated && hasCompletedProfile   → (tabs)
isAuthenticated && !hasCompletedProfile  → (onboarding)
!isAuthenticated                         → (auth)
```
Implement with three `Stack.Protected` blocks (mirroring the existing two-gate pattern) so exactly one group mounts. `isAuthenticated` stays `!isLoading && user !== null`. Add `<Stack.Screen name="(onboarding)" />`. Do not alter the `(auth)`/`(tabs)` screens.

**B4.** Create `apps/mobile/src/app/(onboarding)/_layout.tsx` — a `Stack` with `screenOptions={{ headerShown: false }}` (mirror `(auth)/_layout.tsx` shape; only needs the single `index` screen).

**B5.** Create `apps/mobile/src/app/(onboarding)/index.tsx` — single screen with internal `useState` step (`0=features · 1=promos · 2=info`). Build entirely from `@jojopotato/ui` (`Button`, `Input`, `Card`) + `@/constants/theme` tokens (`Spacing`, `TypeScale`, `FontFamily`, `Palette`) + `useTheme`/`useColorScheme` + `SafeAreaView`. Reuse the compact-height pattern (`COMPACT_HEIGHT = 700`, mascot flex) from `(auth)/onboarding.tsx`.
- **Steps 0 & 1 (previews):** title + subtitle + brand visual (`MASCOT_IMAGE` for step 0, `PRODUCT_TRIO_IMAGE` for step 1, from `@/constants/images`); `Back`/`Next` buttons; a **Skip** link that sets step to `2` (jumps to the info form — NOT Home). Placeholder copy is acceptable.
  - Step 0: `Back` hidden/disabled (first step); `Next` → step 1.
  - Step 1: `Back` → step 0; `Next` → step 2.
- **Step 2 (info form):** `@jojopotato/ui` `Input`s inside a `Card` for **Full name** (prefill from `user?.name`), **birthday** (`YYYY-MM-DD` text `Input` — validate format, no new date-picker dep), **address**. **All three required** — disable/block submit until all three are non-empty and birthday matches `YYYY-MM-DD`. On submit call `completeProfile({ name, birthday, address })`; on `ok` the nav gate flips to Home automatically (no manual navigation needed); on error surface `result.error` inline. **No Skip** on this step; `Back` → previews (step 1).

**B6.** Regenerate typed routes so the new `(onboarding)` hrefs exist before typecheck:
```bash
# from apps/mobile: start Expo once to trigger typed-route codegen, then stop it
pnpm --filter @jojopotato/mobile start   # (or `expo start`) — stop after ".expo/types/router.d.ts" regenerates
```
This is required because Expo Router's typed-routes codegen does not run on `tsc --noEmit` alone (see `all-context.md` "Navigation shell pattern").

### Static gates (both units, run after each unit)
**C1.** `pnpm typecheck` clean.
**C2.** `pnpm lint` clean.
**C3.** `pnpm --filter @jojopotato/api test` (vitest) green (needs Postgres up + migrated).

---

## Acceptance Criteria (testable, each mapped to proof in Verification Evidence)

- **AC1** — Pre-auth welcome flow (Splash → welcome → Login) still works unchanged. *(proven by: manual pre-auth walkthrough + git-diff showing zero `(auth)/` file changes; strategy: Agent-Probe)*
- **AC2** — First-time user, post-signup, flows feature previews → promo previews → info form before Home. *(proven by: manual dev flow with `onboarded_at = NULL` user; strategy: Agent-Probe)*
- **AC3** — Skip on either preview jumps to the info form (not Home); form must still be completed. *(proven by: manual dev flow — tap Skip on step 0 and step 1; strategy: Agent-Probe)*
- **AC4** — Info form requires Full name, birthday, and address — submit blocked until all valid. *(proven by: manual dev flow — attempt submit with each field empty / bad birthday format; strategy: Agent-Probe)*
- **AC5** — Submitting saves the fields to the account and routes to Home. *(proven by: vitest `updateUser` persistence case (B0) for the save + manual dev flow for the route; strategy: Hybrid + Agent-Probe)*
- **AC6** — A user who completed post-auth onboarding does not see it again on later launches/logins (per-account, cross-device). *(proven by: vitest confirms `onboarded_at` persisted per-account in Postgres (cross-device implied by server-side storage) + manual relaunch/sign-out-in lands on Home; strategy: Hybrid + Agent-Probe)*
- **AC7** — All new screens use `@jojopotato/ui` components/tokens (no ad hoc styling). *(proven by: grep of `(onboarding)/index.tsx` for `@jojopotato/ui` imports + absence of hardcoded hex colors + Agent-Probe visual check; strategy: Fully-Automated + Agent-Probe)*

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/api db:generate` yields ONE `drizzle/0002_*.sql` adding nullable `address` + `onboarded_at` only (SQL reviewed); `db:migrate` applies clean against Postgres | Hybrid (precondition: Postgres up) | Schema half of AC5/AC6 (persistence columns exist) |
| `pnpm --filter @jojopotato/api test` (vitest) incl. new `updateUser` self-write case (B0): user can write birthday/address/onboardedAt and read back; `role` write still ignored | Hybrid (precondition: Postgres up) | AC5, AC6 (server persistence + per-account), auth API-contract safety |
| `pnpm typecheck` clean across workspace | Fully-Automated | Type-safety of `AuthUser` contract change, `additionalFields`, `useAuth()` additions, new routes |
| `pnpm lint` clean | Fully-Automated | Code-standard compliance across all touched files |
| Expo typed-routes codegen (`start` once) then `tsc --noEmit` resolves `(onboarding)` hrefs | Hybrid (manual start step) | Nav gate + route group wiring compiles (AC2 routing) |
| grep `(onboarding)/index.tsx`: imports from `@jojopotato/ui`, no hardcoded hex/color literals | Fully-Automated | AC7 |
| Manual dev flow: fresh/`onboarded_at=NULL` user → previews → form → submit → Home | Agent-Probe | AC2, AC5 (route) |
| Manual: Skip on step 0 and step 1 → jumps to info form, not Home | Agent-Probe | AC3 |
| Manual: submit blocked until name+birthday(YYYY-MM-DD)+address all valid | Agent-Probe | AC4 |
| Manual: relaunch / sign-out-in → lands on Home, onboarding not re-shown; saved fields present | Agent-Probe | AC6 |
| Manual: Splash → welcome → Login pre-auth flow unchanged; `git diff` shows no `(auth)/` changes | Agent-Probe + Fully-Automated (git diff) | AC1 |

**Dev-bypass note:** `packages/api/src/lib/dev-auto-login.ts` sessions start with `onboarded_at = NULL`, so the dev auto-login user WILL hit post-auth onboarding until completed once. If that is undesirable for the bypass, seed `onboarded_at` there. Call this out in the EVL/report.

---

## Security (STRIDE-lite, folded in per PLAN protocol for auth surface)

- **Tampering / Elevation of Privilege:** The only new client-writable surface is `birthday`/`address`/`onboardedAt` via `additionalFields input:true`. better-auth's `updateUser` scopes writes to the **authenticated caller's own record** — a user cannot write another user's fields. `role` stays `input:false` (server-owned), so this change does NOT open any privilege-elevation path. **Accepted low risk:** a user can set their own `onboardedAt` / `address` / `birthday` to arbitrary values (self-data only, no cross-user or privilege impact). Documented and accepted.
- **Information disclosure:** New fields ride the existing authenticated session payload; no new unauthenticated endpoint. No secrets involved.
- **Data integrity:** Columns are nullable/additive; the *form* (client) enforces required-ness, not the DB — acceptable because the gate (`onboardedAt != null`) only flips on a real submit. A malformed birthday string is a UX/validation concern, not a security one (mitigated by client `YYYY-MM-DD` validation).

**Validate-agent, please confirm:** the `input:true` self-write acceptance and that no `role`/privilege field becomes client-writable.

---

## Risk Predictions (pre-implementation, folded in for COMPLEX)

1. **Session-refresh staleness (highest risk):** after `completeProfile` writes `onboardedAt`, `authClient.useSession()` may not immediately reflect the change, so the nav gate might not flip → user stuck on the form. Mitigation: explicitly refetch/`getSession()` after `updateUser` (checklist B2). Confirm the exact refresh method on the installed better-auth client during EXECUTE.
2. **`additionalFields` date type round-trip:** `onboardedAt` is `type:'date'` server-side but `string | null` in `AuthUser`; birthday is DB `date` but exposed as `string`. Risk of a serialization mismatch (Date vs ISO string) when reading back. Mitigation: the B0 vitest case must assert the read-back shape; map to `null`/string defensively in `use-auth.ts`.
3. **Typed-route codegen ordering:** forgetting the Expo `start` step (B6) makes `tsc` report the new `(onboarding)` href as invalid — a false failure. Mitigation: B6 is an explicit ordered step before C1.
4. **Accidental `(auth)` regression:** editing `_layout.tsx` could disturb the existing gates. Mitigation: additive third gate only; AC1 git-diff check catches any stray `(auth)/` change.
5. **Migration drift:** `db:generate` could pick up unrelated schema drift if the local schema differs from the last migration. Mitigation: A2 requires reviewing that the SQL touches ONLY the two new columns; STOP if not.

---

## Dependencies & Sequencing

- **Postgres running** (`docker compose up -d` + `db:migrate`) is a hard precondition for A3 and C3. Without it, migration + vitest gates are BLOCKED (record as known-gap, do not fake green).
- **Unit A before Unit B** — the mobile client contract (`inferAdditionalFields`, `AuthUser`) must match the finalized server contract. Do not parallelize A and B.
- **B6 (typed-route codegen) before C1 (typecheck)** within Unit B.
- No new npm dependencies (explicitly: no date-picker lib).
- Related backlog (do not action here, just aware): `wire-better-auth-followups_NOTE` (this plan fulfills its onboarding-profile item), `wire-better-auth-hook-test-coverage_NOTE` (mobile hook runner gap persists).

---

## Test Infra Improvement Notes

- **Mobile-side (RN) test runner gap persists.** `apps/mobile` has no Jest/Vitest/Detox — so `use-auth.ts` (`hasCompletedProfile` derivation, `completeProfile` dispatch) and the `(onboarding)/index.tsx` form-validation/step logic have **no automated coverage** and are proven only by Agent-Probe (manual). This is a **Known-Gap** for those behaviors; per the vacuous-green ban their gates stay **CONDITIONAL** and a backlog stub is required. Existing note to extend/reference: `process/features/auth-accounts/backlog/wire-better-auth-hook-test-coverage_NOTE_09-07-26.md` — at UPDATE PROCESS, append the onboarding hook/screen surface to it (or file a new `onboarding-screens-mobile-test-coverage_NOTE`).
- **Server side is covered** — the high-risk auth API-contract + persistence change (AC5/AC6 server half) gets a real automated/hybrid proof via the B0 vitest `updateUser` case against Postgres, so the high-risk classes are NOT left vacuously green.
- If B0's `updateUser` self-write cannot be expressed in the current vitest harness, record the specific limitation here at EXECUTE time and keep AC5/AC6 CONDITIONAL pending manual proof.

---

## Phase Completion Rules

This is a single COMPLEX plan (not a phase program), executed in two units. Status vocabulary:
- **CODE DONE** — all checklist items implemented and static gates (typecheck/lint) green. NOT the same as verified.
- **UNIT A VERIFIED** — A1–A5 + B0 done AND migration reviewed/applied AND `pnpm --filter @jojopotato/api test` green against Postgres.
- **UNIT B CODE DONE** — B1–B6 done AND workspace typecheck/lint green AND typed-route codegen ran.
- **✅ VERIFIED (whole plan)** — requires all automated/hybrid gates green PLUS the Agent-Probe manual dev flow walked and **user-confirmed working** (AC1–AC7). Do not mark VERIFIED on code-completion alone; the mobile behaviors are Agent-Probe/Known-Gap and need explicit user confirmation.
- Any BLOCKED gate (e.g. no Postgres) → record as known-gap, keep the affected criterion CONDITIONAL, continue; never fake green.

---

## Validate Contract

Status: CONDITIONAL
Date: 13-07-26
date: 2026-07-13
generated-by: outer-pvl

Parallel strategy: sequential (single self-contained plan; read-only validation over already-loaded source — parallel subagents would only re-read the same 8 files)
Rationale: signal score 4/7 (S1 multi-package, S2 schema/API/auth, S6 three high-risk classes, S7 10 files). HIGH band, but single-plan read-only fan-out → executed in-session.

Net gate: CONDITIONAL — 0 FAILs, 3 CONCERNs, 3 PASS. NON-VACUOUS: the high-risk auth API-contract + schema persistence (AC5/AC6 server half) has a real automated/hybrid proof (B0 vitest against Postgres). The mobile hook + onboarding-screen behaviors have NO automated runner (project-wide RN gap) → named Known-Gap residual (Agent-Probe + required backlog stub); by the vacuous-green ban this keeps the terminal gate CONDITIONAL, never PASS.

### Test gates (C3 5-column table — ADDITIVE; legacy line form below still parses)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC5/AC6 (schema) | migration 0002 adds exactly TWO nullable columns (address, onboarded_at), nothing else | Hybrid | `pnpm --filter @jojopotato/api db:generate` → review `packages/api/drizzle/0002_*.sql` (only `ALTER TABLE "users" ADD COLUMN "address"` + `ADD COLUMN "onboarded_at"`, both nullable, no other table) → `pnpm --filter @jojopotato/api db:migrate` (precondition: `docker compose up -d`) | A |
| AC5/AC6 (server persist) + elevation guard | signed-in user can updateUser({birthday,address,onboardedAt}) and read back; role write via updateUser still ignored | Hybrid | `pnpm --filter @jojopotato/api test` — new B0 case in `packages/api/src/lib/__tests__/auth.integration.test.ts` (precondition: Postgres up + migrated) | B |
| AC1–AC7 (compile) | AuthUser contract, additionalFields, useAuth additions, `(onboarding)` routes typecheck | Fully-Automated | run B6 Expo typed-route codegen first, then `pnpm typecheck` exits 0 | A |
| AC7 (standards) | code-standard clean; `(onboarding)/index.tsx` imports `@jojopotato/ui`, no hardcoded hex | Fully-Automated | `pnpm lint` exits 0 AND `grep -nE "#[0-9a-fA-F]{3,6}" "apps/mobile/src/app/(onboarding)/index.tsx"` returns nothing AND `grep -n "@jojopotato/ui" "apps/mobile/src/app/(onboarding)/index.tsx"` matches | A |
| AC2/AC5 (route flip) | fresh onboarded_at=NULL user → previews → form → submit → Home WITHOUT app restart | Agent-Probe | manual dev flow on simulator | D |
| AC3 | Skip on step 0/1 → jumps to info form, not Home | Agent-Probe | manual dev flow | D |
| AC4 | submit blocked until name + birthday(YYYY-MM-DD) + address all valid | Agent-Probe | manual dev flow | D |
| AC6 | relaunch / sign-out-in → lands on Home, onboarding not re-shown | Agent-Probe | manual dev flow | D |
| AC1 | pre-auth welcome flow unchanged | Agent-Probe + Fully-Automated | manual walkthrough + `git diff --stat -- 'apps/mobile/src/app/(auth)'` shows zero changes | A |
| mobile hook/form logic | use-auth completeProfile dispatch + hasCompletedProfile derivation + `(onboarding)` step/skip/validation logic (unit) | Known-Gap (residual) | — no RN test runner (out of scope) | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist — the B0 case)
- C — deferred to a named later phase/plan
- D — backlog test-building stub / named residual (keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is a named residual row (gap-resolution D), never a strategy that proves a behavior.

Legacy line form (retained so existing validate-contract consumers still parse):
- packages/api (schema + auth config): Hybrid: `pnpm --filter @jojopotato/api db:generate` + review `drizzle/0002_*.sql` + `db:migrate` + `pnpm --filter @jojopotato/api test` (precondition: `docker compose up -d`, migrated)
- workspace (types + compile): Fully-automated: `pnpm typecheck` (after B6 Expo typed-route codegen)
- standards: Fully-automated: `pnpm lint` + grep on `(onboarding)/index.tsx` (@jojopotato/ui present, no hex)
- pre-auth regression: Fully-automated: `git diff --stat -- 'apps/mobile/src/app/(auth)'` (must be empty)
- mobile hook/screen behaviors: agent-probe: manual dev flow (AC2/AC3/AC4/AC6); known-gap: no RN runner (documented, backlog stub required)

Advisory failing stub (B0 Hybrid proof — advisory only, not an on-disk red gate; hybrid tiers do not get mandatory stubs):
```
it("lets a signed-in user write birthday/address/onboardedAt and read them back, but ignores a role write", async () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: updateUser self-write persistence + role-rejection (B0)")
})
```

Dimension findings:
- Infra fit: PASS — migration output dir `packages/api/drizzle/` and next file `0002_*.sql` confirmed (drizzle.config `out: './drizzle'`; existing 0000/0001); `db:generate`/`db:migrate` scripts present. Postgres (`docker compose up -d` + `db:migrate`) is a hybrid precondition for migrate + vitest — correctly flagged as a gate, not a fail.
- Test coverage: CONCERN — B0 (updateUser self-write) is the ONLY automated proof of the high-risk API-contract change but the plan marks it "recommended" with a typecheck-only fallback. It must be REQUIRED (fall back only if genuinely inexpressible in the vitest harness, with the exact limitation documented). Mobile hook/screen = Known-Gap (no RN runner) → Agent-Probe + required backlog stub.
- Breaking changes: PASS — DB columns additive-nullable (no rename/drop/NOT NULL); additionalFields/AuthUser/useAuth additions all additive; `role` stays `input:false`; nav gate is an additive third state. Only AuthProvider constructs AuthContextValue, so the two new required context fields break no external consumer.
- Security surface: PASS (conditional on B0) — better-auth `updateUser` scopes writes to the authenticated caller's OWN record; `input:true` on birthday/address/onboardedAt exposes self-data only; `role` stays server-owned (`input:false`). The "role not settable via updateUser" guard MUST be an actual B0 assertion, not prose (mirror the existing signup role-rejection test at lines 74–86). Self-set onboardedAt is accepted low risk (self-data, no cross-user or privilege impact).
- Section A feasibility (backend): PASS — edit targets unique and matchable (`varchar`/`timestamp` already imported in users.ts; additionalFields object holds only `role` today; AuthUser interface clean). Highest-risk edit: additionalFields date round-trip (`onboardedAt` `type:'date'` server ↔ `string | null` in AuthUser; `birthday` DB `date` ↔ `type:'string'`) — B0 must assert the read-back shape.
- Section B feasibility (mobile): CONCERN — two execute-agent instructions required (E1 tabs-guard expression, E2 refetch wiring). All create/modify targets verified present (`(onboarding)/` is a clean create target; `@jojopotato/ui` Button/Card/Input, `MASCOT_IMAGE`/`PRODUCT_TRIO_IMAGE`, `FontFamily`/`Spacing`/`TypeScale` all exist and are used by the `(auth)/onboarding.tsx` mirror). Mobile behaviors are Agent-Probe/Known-Gap → CONDITIONAL.

Execute-agent instructions:
- E1 (`_layout.tsx`, Section B): the `(tabs)` `Stack.Protected` GUARD expression MUST become `isAuthenticated && hasCompletedProfile` — NOT bare `isAuthenticated`. Onboarding guard = `isAuthenticated && !hasCompletedProfile`; auth guard = `!isAuthenticated`. Three mutually-exclusive blocks so exactly one group mounts. Leaving the tabs guard as bare `isAuthenticated` makes an incomplete user mount BOTH `(tabs)` and `(onboarding)`. ("Leave `(tabs)` intact" means the SCREENS, not the guard.)
- E2 (`use-auth.ts`, Section B): in `completeProfile`, destructure `refetch` from the EXISTING `authClient.useSession()` call (currently `const { data, isPending } = authClient.useSession()` at line 60) and `await` it after `authClient.updateUser(...)` succeeds, before `toResult`. This forces a server round-trip so the nav gate flips without an app restart regardless of whether `useSession()` auto-refreshes. Confirm the exact name (`refetch`) against the installed better-auth/react 1.6.23 client; if named differently use its equivalent session refetch / `authClient.getSession()` — do NOT skip the refresh. (Robust-by-design: this sidesteps the uncertain useSession auto-refresh behavior; it is NOT a blocking feasibility probe.)
- E3 (B0, Section A): B0 is REQUIRED for the high-risk API-contract classes — implement BOTH the updateUser self-write persistence case AND the "role not settable via updateUser" rejection assertion (mirror the signup role-rejection test, lines 74–86). Only fall back to typecheck-only if updateUser self-write genuinely cannot be expressed in the vitest harness, and record the exact limitation in Test Infra Improvement Notes.
- E4 (B0, Section A): assert the read-back SHAPE of `onboardedAt`/`birthday` on the session (Date vs ISO string) so the `use-auth.ts` null/string mapping is correct (Risk #2 — date round-trip).
- E5 (high-risk evidence pack): before reporting the auth/schema/API work complete, produce the manual-first evidence pack in this task folder's `harness/` (min: `risk-gate.json`, `verification.json` capturing the B0 result, `adversarial-validation.json` for the role-elevation-via-updateUser path). Manual-first per vc-risk-evidence-pack — three high-risk classes touched.
- E6 (dev-bypass): `packages/api/src/lib/dev-auto-login.ts` sessions start `onboarded_at = NULL`, so the dev auto-login user hits post-auth onboarding until completed once; if undesirable, seed `onboarded_at` there. Call out in EVL/report.
- E7 (migration safety): if `db:generate` emits anything beyond the two nullable columns, STOP and surface — do not hand-edit generated SQL (A2). Unit A gates (typecheck + migration reviewed/applied + vitest) must be green before starting Unit B.

Open gaps:
- Mobile hook (`hasCompletedProfile`/`completeProfile`) + `(onboarding)/index.tsx` form/step/skip logic: known-gap: documented as NEW backlog stub REQUIRED — RN test runner is out of scope for this plan. At UPDATE PROCESS, append this surface to `process/features/auth-accounts/backlog/wire-better-auth-hook-test-coverage_NOTE_09-07-26.md` (or file a new `onboarding-screens-mobile-test-coverage_NOTE_13-07-26.md`).
- Session-refresh-after-updateUser (Risk #1): provable only by Agent-Probe (no RN runner). Mitigated by explicit server `refetch` (E2) — robust regardless of useSession auto-refresh behavior. NOT a blocking feasibility probe (design decided; both outcomes handled).

What this coverage does NOT prove:
- `pnpm typecheck` / `pnpm lint`: compile + style only — NOT runtime nav behavior, NOT session refresh, NOT persistence.
- `db:generate`/`db:migrate` (Hybrid): the schema columns exist and apply — NOT that the client can write them and NOT that the session reflects them.
- B0 vitest (Hybrid): server-side updateUser persistence + role rejection + read-back shape — NOT the mobile client's `useSession()` refresh, NOT the nav-gate flip, NOT any UI/form behavior.
- grep / `git diff` checks: presence/absence of strings only — NOT visual correctness and NOT that Skip / required-field UX actually behaves.
- Agent-Probe manual flows: judged once by a human — NOT an automated regression guard (no RN runner).
- Nothing automated covers: `use-auth` `completeProfile` dispatch, `hasCompletedProfile` derivation, `(onboarding)` step/skip/validation logic (Known-Gap).

Gate: CONDITIONAL (0 FAILs; concerns documented; execute-agent instructions E1–E7 recorded; mobile RN coverage is an accepted named Known-Gap with a required backlog stub).
Accepted by: PENDING — first-pass CONDITIONAL, not yet accepted in this session. Concerns requiring acceptance (or one PVL supplement cycle folding E3/E4 into the plan checklist): (C1) B0 required-not-optional + role-via-updateUser assertion [E3/E4]; (C2) mobile hook/screen Known-Gap (no RN runner, out of scope) [accept as named residual]; (C3) Section B guard/refetch execute-agent instructions [E1/E2]. Not terminal for EXECUTE until the user accepts these gaps in-session OR a supplement cycle records them.

## Autonomous Goal Block

SESSION GOAL: Post-auth onboarding — add `address` + `onboardedAt` nullable columns to `users`; expose birthday/address/onboardedAt as writable better-auth `additionalFields` (role stays input:false); mirror in `@jojopotato/types` AuthUser + the mobile auth client; add `hasCompletedProfile`/`completeProfile` to `useAuth()` (leave pre-auth `hasOnboarded`/`completeOnboarding` untouched); add a third `(onboarding)` nav gate; build the 3-step onboarding screen (2 skippable previews → 1 required info form).
Charter + umbrella plan: N/A — single plan (`process/features/auth-accounts/active/onboarding-screens_13-07-26/onboarding-screens_PLAN_13-07-26.md`)
Autonomy: standard RIPER-5 — EXECUTE requires explicit "ENTER EXECUTE MODE"; spawn `vc-execute-agent` (plan + validate-contract exist → no inline edits, any size). Execute Unit A (backend) fully green before Unit B (mobile). EVL confirmation run (vc-tester) required after EXECUTE.
Hard stop conditions / safety constraints:
- If `db:generate` emits anything beyond the two nullable columns (`address`, `onboarded_at`), STOP — do not hand-edit generated SQL.
- Never make `role` (or any privilege field) client-writable — `role` stays `input:false`; B0 must assert role is rejected via `updateUser`.
- Do not modify any `apps/mobile/src/app/(auth)/*` file — pre-auth welcome must stay unchanged (AC1).
- Postgres must be running (`docker compose up -d` + `db:migrate`) before A3/C3; if unavailable, record known-gap, never fake green.
Next phase: EXECUTE — Unit A first (A1–A5 + B0), gated on Postgres, then Unit B (B1–B6).
Validate contract: inline in this plan (`## Validate Contract`) — Gate: CONDITIONAL.
Execute start: Unit A → edit `users.ts` + `auth.ts` + `types/auth.ts`; `pnpm --filter @jojopotato/api db:generate` (review `0002_*.sql`) + `db:migrate`; add B0 case (E3/E4); `pnpm --filter @jojopotato/api test`. Then Unit B → `auth-client.ts`, `use-auth.ts` (E1/E2), `_layout.tsx` third gate, `(onboarding)/_layout.tsx` + `index.tsx`, B6 typed-route codegen, `pnpm typecheck` + `pnpm lint`. Agent-Probe manual flow for AC1–AC7. High-risk evidence pack: yes (E5).

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/auth-accounts/completed/onboarding-screens_13-07-26/onboarding-screens_PLAN_13-07-26.md` (archived 13-07-26; formerly under `active/`)
2. **Last completed phase/step:** EXECUTE (13-07-26) → EVL confirmation run (13-07-26, vc-tester, ALL-GREEN) → post-EVL birthday-UX refinement (13-07-26, MM/DD/YYYY auto-tab, gates re-confirmed green — see REPORT §Post-EVL refinement) → user manual Agent-Probe walkthrough (AC1–AC7) confirmed working → final UPDATE PROCESS archival (13-07-26). See `onboarding-screens_REPORT_13-07-26.md` (EXECUTE report + `## UPDATE PROCESS Closeout Packet` + `## Post-EVL refinement` sections) and `harness/verification.json` for full evidence.
3. **Validate-contract status:** DONE — `## Validate Contract` above is `Gate: CONDITIONAL` (0 FAILs, 3 CONCERNs, named Known-Gap for mobile RN coverage). Execute-agent instructions E1–E7 were followed; confirmed against the EXECUTE report. The CONDITIONAL gate's mobile-behavior gaps (AC2/AC3/AC4/AC6) were closed out via the user's Agent-Probe manual confirmation, not by new automated coverage — the Known-Gap classification and backlog stub remain accurate and unresolved for future automated coverage.
4. **Supporting context files loaded:** `process/context/all-context.md` (§Current Implementation State documents this feature as DELIVERED), `process/context/tests/all-tests.md`, `process/features/auth-accounts/completed/wire-better-auth_09-07-26/` (+ REPORT), `process/features/auth-accounts/backlog/wire-better-auth-hook-test-coverage_NOTE_09-07-26.md` (extended 13-07-26 with the onboarding-screens surface — still open, unresolved).
5. **Status:** DONE. This plan is archived and closed. The execution commit (Unit A + Unit B + post-EVL refinement) is made in the vc-git-manager pass immediately following this UPDATE PROCESS session. No further action needed on this plan unless the mobile-test-coverage backlog stub is picked up in a future session.

---

**Archived 13-07-26.** Manual mobile verification (AC1–AC7) passed. Plan moved to `completed/`. Execution commit follows this UPDATE PROCESS pass.
