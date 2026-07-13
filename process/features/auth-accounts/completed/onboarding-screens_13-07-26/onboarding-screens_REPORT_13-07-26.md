---
phase: onboarding-screens
date: 2026-07-13
status: COMPLETE_WITH_GAPS
feature: auth-accounts
plan: process/features/auth-accounts/active/onboarding-screens_13-07-26/onboarding-screens_PLAN_13-07-26.md
---

# EXECUTE Report — Post-Auth Onboarding Screens

**TL;DR:** All checklist items (A1–A5, B0, B1–B6, C1–C3) implemented and all automated + hybrid gates green: migration `0002` (exactly two nullable columns), `db:migrate` applied, 27/27 api vitest tests pass (incl. B0 self-write + role-rejection + read-back-shape), workspace typecheck + lint clean, AC7 UI-only styling verified, AC1 zero `(auth)/` changes. High-risk evidence pack written + validator-clean. Remaining: mobile runtime behavior (nav-gate flip, form/skip UX) is an accepted named Known-Gap (no RN test runner) needing Agent-Probe manual confirmation before whole-plan VERIFIED.

## What Was Done

Unit A (backend) — code was ALREADY PRESENT on disk (uncommitted, from a prior partial run); each item verified to match the plan/validate-contract exactly, not re-written:
- **A1** `packages/api/src/db/schema/users.ts` — `address: varchar('address')`, `onboardedAt: timestamp('onboarded_at')` (both nullable). ✓
- **A2/A3** `packages/api/drizzle/0002_bored_captain_flint.sql` adds ONLY those two nullable columns; `db:generate` re-confirmed in-sync ("No schema changes"); `db:migrate` applied clean. ✓ (hard constraint held)
- **A4** `packages/api/src/lib/auth.ts` — `birthday`/`address`/`onboardedAt` added as `additionalFields` (`input:true`); `role` unchanged (`input:false`). ✓
- **A5** `packages/types/src/auth.ts` — `AuthUser` gains `birthday?`/`address?`/`onboardedAt?` (`string | null`). ✓
- **B0** `packages/api/src/lib/__tests__/auth.integration.test.ts` — new case proves updateUser self-write + read-back (E4 shape assertions) AND role-write-ignored elevation guard (E3). Passing. ✓

Unit B (mobile) — implemented this session:
- **B1** `auth-client.ts` — mirrored the 3 fields in `inferAdditionalFields.user` (`birthday`/`address` string, `onboardedAt` date, `input:true`); `role` unchanged. ✓
- **B2** `use-auth.ts` (additive) — kept `hasOnboarded`/`completeOnboarding`; widened session-user mapping to `birthday`/`address`/`onboardedAt`; added `hasCompletedProfile = user?.onboardedAt != null`; added `completeProfile()` calling `authClient.updateUser({name,birthday,address,onboardedAt:new Date()})` then **awaiting `refetch()`** destructured from the existing `useSession()` (E2). ✓
- **B3** `_layout.tsx` — three mutually-exclusive gates; `(tabs)` guard is `isAuthenticated && hasCompletedProfile`, new `(onboarding)` guard is `isAuthenticated && !hasCompletedProfile`, `(auth)` guard unchanged; `isLoading`→public preserved (E1). ✓
- **B4** `(onboarding)/_layout.tsx` — `Stack`, `headerShown:false`, single `index`. ✓
- **B5** `(onboarding)/index.tsx` — single screen, internal step `0=features · 1=promos · 2=info`; previews have Back/Next + a Skip that jumps to step 2 (never Home); info form requires Full name (prefilled from `user?.name`) + birthday (`YYYY-MM-DD` validated, real-date check) + address, submit blocked until all valid, calls `completeProfile`, surfaces errors inline, no Skip, Back→previews. `@jojopotato/ui` + theme tokens only, no hex. ✓
- **B6** Ran Expo once to regenerate typed routes — `(onboarding)` group hrefs now in `.expo/types/router.d.ts`. ✓
- **E5** High-risk evidence pack written to `harness/` (risk-gate, context-snippets, verification, review-decision, adversarial-validation); validator returns 0 failures / 0 warnings. ✓

## What Was Skipped or Deferred

- No RN test runner introduced (explicitly out of scope). Mobile hook + screen runtime behavior remains Agent-Probe/Known-Gap.
- **E6 (dev-bypass):** `packages/api/src/lib/dev-auto-login.ts` sessions start `onboarded_at = NULL`, so the dev auto-login user WILL hit post-auth onboarding until completed once. Left as-is per plan (optional to seed). Flagged for awareness.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Migration sync | `pnpm --filter @jojopotato/api db:generate` | PASS — "No schema changes"; 0002 = two nullable cols only |
| Migration apply | `pnpm --filter @jojopotato/api db:migrate` | PASS |
| API vitest (incl. B0) | `pnpm --filter @jojopotato/api test` | PASS — 27/27 |
| Typecheck | `pnpm typecheck` | PASS — 5/5 packages |
| Lint | `pnpm lint` | PASS — 6/6, 0 errors |
| AC7 styling | grep `@jojopotato/ui` + grep hex on `(onboarding)/index.tsx` | PASS — ui present, no hex |
| AC1 regression | `git diff --stat -- 'apps/mobile/src/app/(auth)'` | PASS — empty |
| Evidence pack | `validate-risk-artifacts.mjs harness/` | PASS — 0 failures |

Agent-Probe (manual, PENDING user confirmation on simulator): AC2 (previews→form→submit→Home), AC3 (Skip→form not Home), AC4 (submit-blocked validation), AC6 (relaunch/sign-out-in lands on Home).

## Plan Deviations

All within-blast-radius / implementation-detail (no hard-stop class; auth/schema/API surfaces match the plan exactly):
- **Unit A pre-existing on disk.** A1–A5 + B0 + migration were already applied (uncommitted) before this session — verified line-by-line against the plan and E3/E4 rather than re-authored. No content deviation.
- **`use-auth.ts` onboardedAt normalization.** Mapped session `onboardedAt` (which arrives as a `Date` for `type:'date'`, or ISO string) to `string | null` via `new Date(x).toISOString()` to satisfy the `AuthUser` contract and Risk #2 (date round-trip). `hasCompletedProfile` uses `!= null`, unaffected by shape. Plan said "map undefined/missing → null"; this is that plus the required Date→string coercion.
- **B5 minor UI details** (plan left unspecified): birthday `Input` uses `keyboardType="numbers-and-punctuation"`; Skip rendered as a themed `Pressable`+`Text` (matching the `(auth)` Link-styled-text convention) rather than a `Button`. Preview copy is placeholder (allowed).

## Test Infra Gaps Found

- **Mobile RN test-runner gap persists.** `use-auth.ts` (`hasCompletedProfile` derivation, `completeProfile` dispatch + refetch) and `(onboarding)/index.tsx` (step/skip/validation logic) have NO automated coverage. Named Known-Gap. **Backlog test-building stub REQUIRED at UPDATE PROCESS** — append this surface to `process/features/auth-accounts/backlog/wire-better-auth-hook-test-coverage_NOTE_09-07-26.md` or file `onboarding-screens-mobile-test-coverage_NOTE_13-07-26.md`.
- Server side is NOT vacuously green: B0 vitest gives real automated/hybrid proof of the high-risk API-contract + persistence change.

## Closeout Packet

- **Selected plan:** `process/features/auth-accounts/active/onboarding-screens_13-07-26/onboarding-screens_PLAN_13-07-26.md`
- **Finished:** all A/B/C checklist items; all automated + hybrid gates green; evidence pack validator-clean.
- **Verified vs unverified:** VERIFIED — schema/migration, server persistence + role guard (B0), typecheck, lint, styling, pre-auth regression. UNVERIFIED — the 4 Agent-Probe mobile runtime flows (need simulator + user confirmation) and the session-refresh-flip (Risk #1, mitigated by explicit `refetch`).
- **Cleanup remaining:** at UPDATE PROCESS — file the mobile-coverage backlog stub; append onboarding surface to `all-context.md` implementation state; archive plan; commit (user has NOT authorized commit this session).
- **Closeout classification:** `Keep in active/testing` — code-complete + automated-verified, but Agent-Probe manual mobile walkthrough (AC1–AC7) still needs user confirmation before whole-plan ✅ VERIFIED.
- **No commit performed. No UPDATE PROCESS performed.** (per instructions)

## Forward Preview

- **Test Infra Found:** api = vitest against local Postgres (27 tests). mobile = still typecheck+lint only (no runner).
- **Blast Radius Changes:** modified `auth-client.ts`, `use-auth.ts`, `_layout.tsx`; created `(onboarding)/_layout.tsx` + `(onboarding)/index.tsx`; Unit A files (users.ts, auth.ts, types/auth.ts, auth.integration.test.ts, 0002 migration) already staged-on-disk. `harness/` evidence pack added.
- **Commands to Stay Green:** `docker compose up -d` (Postgres) → `pnpm --filter @jojopotato/api db:migrate` → `pnpm --filter @jojopotato/api test` → (Expo start once for typed routes) → `pnpm typecheck` → `pnpm lint`.
- **Dependency Changes:** none (no new npm deps; no date-picker lib).

---

## UPDATE PROCESS Closeout Packet (13-07-26)

EVL HANDOFF SUMMARY consumed (from vc-tester, ALL-GREEN): `gates_green` = api-vitest 27/27 incl. B0,
typecheck 5/5, lint 6/6 (0 err), `db:generate` in-sync (2 nullable cols only), `git diff --stat` on
`(auth)/` empty, `git diff --check` clean. `known_gaps` = mobile hook/screen runtime behavior (no RN
runner) — Agent-Probe AC2/AC3/AC4/AC6; session-refresh nav-flip — Agent-Probe. `follow_up_stubs` =
mobile-test-coverage backlog stub (filed, see below).

1. **Selected plan path:** `process/features/auth-accounts/active/onboarding-screens_13-07-26/onboarding-screens_PLAN_13-07-26.md`
2. **Closeout classification:** **Keep in active/testing** — code-complete, all automated + hybrid
   gates green (both at EXECUTE and independently re-confirmed at EVL), but the 4 Agent-Probe mobile
   runtime behaviors (AC2/AC3/AC4/AC6) plus the pre-auth manual walkthrough (AC1) are not yet
   user-confirmed on a simulator. Commit is explicitly held by the user pending that walkthrough.
3. **What was finished:** Unit A (backend: `users` schema + migration 0002, `additionalFields`,
   shared `AuthUser` type, B0 vitest self-write/role-rejection/read-back-shape case) and Unit B
   (mobile: `auth-client.ts` mirror, `use-auth.ts` `hasCompletedProfile`/`completeProfile` +
   explicit `refetch()`, three-way nav gate in `_layout.tsx`, new `(onboarding)` route group with
   the 3-step screen). High-risk evidence pack written and validator-clean.
4. **What was verified vs still unverified:**
   - Verified (automated/hybrid, EVL-confirmed): schema/migration shape, server-side persistence +
     role-write rejection + read-back shape (B0), workspace typecheck, lint, AC7 styling grep, AC1
     pre-auth-regression git-diff.
   - Unverified (Agent-Probe, pending): AC2 (previews→form→submit→Home, no restart), AC3
     (Skip→form not Home), AC4 (submit-blocked validation), AC6 (relaunch/sign-out-in→Home, no
     re-show), plus a manual AC1 walkthrough (git-diff already proves zero file changes, but the
     actual pre-auth flow itself hasn't been re-walked this session).
5. **Validate-contract compliance:** VALIDATE ran; `## Validate Contract` is present inline in the
   plan (`Gate: CONDITIONAL` — 0 FAILs, 3 CONCERNs, named Known-Gap residual for mobile RN coverage
   with a required backlog stub, per the vacuous-green ban). Execute-agent instructions E1–E7 were
   followed (confirmed against the report's "What Was Done").
6. **Cleanup done vs still needed:**
   - Done this UPDATE PROCESS pass: backlog stub extended (Task 1), `all-context.md` §Current
     Implementation State updated (Task 2), dev-auto-login open decision recorded (Task 3), this
     closeout packet written, plan Resume/Handoff section updated (Task 5).
   - Still needed: user's manual Agent-Probe walkthrough (AC1–AC7 checklist below), then commit,
     then archive the plan to `completed/` in a follow-up UPDATE PROCESS pass.
7. **Single best next valid state:** Keep the plan active and continue validation on the same
   selected plan — i.e. `Keep the plan active and continue validation on the same selected plan`.
   Do NOT archive or commit yet.
8. **Commit-checkpoint recommendation:** **Held per explicit user instruction.** Once the manual
   walkthrough passes, the recommended sequence is: invoke `vc-git-manager` for the execution commit
   (Unit A + Unit B changes), THEN a follow-up `ENTER UPDATE PROCESS MODE` pass to archive the plan
   to `process/features/auth-accounts/completed/` and do the process-artifact commit.
9. **SPEC achievement:** No standalone `*_SPEC_*.md` exists for this plan — the design was
   pre-locked via an external approved plan (`~/.claude/plans/summary-build-the-snappy-quiche.md`,
   see plan §Design status) and this plan file's own Acceptance Criteria (AC1–AC7) function as the
   SPEC surface. Scoring against AC1–AC7: AC1 (met — automated proof, PASS), AC5/AC6 server half
   (met — B0 vitest), AC7 (met — grep proof), AC2/AC3/AC4/AC6 client-route-flip half (**unmet** —
   Known-Gap, Agent-Probe only, no passing automated/E2E gate → per the vacuous-green ban these stay
   unmet until the manual walkthrough; backlog stub already filed, see Task 1 extension to
   `wire-better-auth-hook-test-coverage_NOTE_09-07-26.md`).

Drift score: **MEDIUM** (2 signals: (a) 8 files touched across 3 packages +1 for ≥1-file threshold
only, not ≥10; (d) new task folder + backlog NOTE extension). No `.claude/`/`.codex/`/protocol files
touched (no harness signal). Recommend UPDATE PROCESS -- significant changes detected. (This pass
IS the UPDATE PROCESS response to that signal — partial closeout, plan stays active per hard
constraint.)

### Manual verification checklist for the user (AC1–AC7)

Run on iOS simulator with a fresh/`onboarded_at = NULL` account (or reset the dev DB):

- [ ] **AC1** — Splash → welcome → Login pre-auth flow behaves exactly as before (no visible change).
- [ ] **AC2** — Sign up / first login → feature previews → promo previews → required info form →
      submit → lands on Home, no app restart needed.
- [ ] **AC3** — Tap Skip on the feature-previews step → jumps straight to the info form (not Home).
      Tap Skip on the promo-previews step → also jumps to the info form (not Home).
- [ ] **AC4** — On the info form, Submit stays disabled/blocked until Full name, birthday
      (`YYYY-MM-DD`, real date), and address are all filled/valid; try leaving each one empty or an
      invalid birthday and confirm submit is blocked.
- [ ] **AC5** — Submitting the form saves the fields and routes to Home automatically.
- [ ] **AC6** — Relaunch the app, or sign out and sign back in with the same account → lands on
      Home directly; onboarding is NOT shown again; the saved name/birthday/address are present.
- [ ] **AC7** — Visual spot-check: onboarding screens look consistent with the rest of the app's
      `@jojopotato/ui` styling (no obviously off/unstyled elements).

Report back pass/fail per item; any fail routes back to PLAN/EXECUTE reconciliation, not archival.

---

## Post-EVL refinement (13-07-26): birthday 3-field auto-tab

**What changed:** Replaced the single free-text birthday `Input` ("Birthday (YYYY-MM-DD)") on the
step-2 info form with three separate free-form numeric inputs laid out in a row — **MM / DD / YYYY**
— with auto-tabbing (focus advances to the next field when the current one fills; Backspace on an
empty field steps focus back). The assembled value is still a `YYYY-MM-DD` string validated by the
unchanged `isValidBirthday` helper and submitted via the same `completeProfile({ birthday })` call.

**Why:** UX refinement — three constrained numeric fields with auto-tab are faster and less
error-prone on mobile than one free-text field, without changing the stored value or validation
contract.

**Files (2):**
- `packages/ui/src/components/input.tsx` — made shared `Input` a `forwardRef<TextInput, InputProps>`
  (ref forwarded to the inner `TextInput`; `Input.displayName = 'Input'`), and added four OPTIONAL,
  backward-compatible passthrough props: `maxLength`, `onKeyPress`, `textAlign`, `returnKeyType`.
  No existing prop/style/behavior changed; existing callers (e.g. `login.tsx`) unaffected —
  confirmed green by the whole-workspace typecheck + lint.
- `apps/mobile/src/app/(onboarding)/index.tsx` — replaced `birthday` state with `bMonth`/`bDay`/
  `bYear`; derived `birthday` (`bYear.length===4 && bMonth && bDay ? \`${bYear}-${MM}-${DD}\` : ''`)
  feeds `canSubmit`/`onSubmit` unchanged. New "Birthday" label + `dateRow` (three `Input`s, flex
  1 / 1 / 1.6, `keyboardType="number-pad"`, `textAlign="center"`, `maxLength` 2/2/4). Each field
  strips non-digits, auto-tabs forward via `monthRef`/`dayRef`/`yearRef`, and steps focus back on
  Backspace-when-empty. Only `@jojopotato/ui` `Input` used; new styles use `Spacing` tokens (no
  magic numbers). Name/Address/Finish untouched.

**Deviation note (supersedes input method only):** the validate-contract specified a plain
`YYYY-MM-DD` `Input`; this refinement supersedes the **input method** only. The stored value
(`YYYY-MM-DD` string), the `isValidBirthday` single-source validation, and the
`completeProfile({ birthday })` contract are all UNCHANGED. UI-only — no schema/auth/API/migration
surface touched. Within-blast-radius, no hard-stop class.

**Gates (green):**
- `pnpm typecheck` — PASS, 5/5 tasks (`ui` + `mobile` re-executed clean).
- `pnpm lint` — PASS, 6/6 tasks, 0 errors (3 pre-existing warnings in `scripts/dev-with-tunnel.mjs`,
  unrelated).
- No DB/vitest/expo-start needed (no routes or schema changed).

**Known-gap carried forward (unchanged):** the three-field birthday UX, like the rest of the mobile
screen, has no automated RN-runner coverage — it remains Agent-Probe (AC4 birthday-validation
walkthrough now covers the MM/DD/YYYY entry + auto-tab). The mobile-test-coverage backlog stub
already filed still applies.
