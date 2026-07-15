---
name: plan:mobile-tabs-order-flow-completion-phase-05-account-profile
description: "Mobile Tabs + Order-Flow Completion — Phase 05: real Account/profile screen (view + edit name/birthday/address via better-auth) + settings"
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: mobile-tabs-order-flow-completion
  phase: phase-05
---

# Phase 05 — Account / Profile Screen

**Program:** mobile-tabs-order-flow-completion
**Umbrella plan:** process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/mobile-tabs-order-flow-completion-umbrella_PLAN_14-07-26.md
**Date**: 14-07-26
**Status**: ⏳ PLANNED
**Complexity**: COMPLEX (phase of a COMPLEX phase program)
**Report destination:** process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-05-account-profile_REPORT_14-07-26.md

## Overview / Context

TL;DR: Replace the `<ComingSoon>` Account shell (`(tabs)/account/index.tsx`, 65 ln — only `signOut` real) with a real profile screen: view name/email/birthday/address, edit name/birthday/address via better-auth `updateUser`, and a settings/section list. No new backend route needed — profile edits go through a NEW, additive `updateProfile()` seam on `useAuth()` (deliberately separate from the existing onboarding `completeProfile()`, which also re-stamps `onboardedAt` and would corrupt it if reused for edits). `role` is server-owned, never editable. Read `process/context/all-context.md` first. Prioritize friendliness — reuse the MM/DD/YYYY auto-tabbing birthday input pattern (logic only, not JSX) from onboarding, inline validation, save feedback.

## Phase Completion Rules

This phase is VERIFIED only when: all checklist items checked; the phase validate-contract exists with green gates; regression checks against overlapping earlier phases pass; and the phase report is written. Code-only completion is CODE DONE, never VERIFIED. Post-phase testing uses the Exit Gate test gates (see process/context/tests/all-tests.md). Screen-level behavior is now covered by Fully-Automated jest component tests (Phase 4's jest-expo runner is live) — only the true native-restart persistence round-trip remains Agent-Probe/Known-Gap (irreducible: no process-restart harness exists).

## Acceptance Criteria

- AC1: Account shows real profile (name, read-only email, links, sign-out) — Fully-Automated (jest component test).
- AC2: role is never client-writable (Fully-Automated grep, scoped to the new edit-profile file, PLUS a Fully-Automated jest assertion that the save payload never includes `role`/`onboardedAt`).
- AC3: birthday validation unit-tested (Fully-Automated, vitest).
- AC7: true native-restart persistence round-trip — Agent-Probe / Known-Gap (irreducible; no process-restart test harness in this repo).

## Entry Gate

- Phase 0 (umbrella) complete. No backend dependency — can run in parallel with Phase 3.
- Phase 4's jest-expo runner (`test-utils/render.tsx`, `jest.config.js`, `jest-setup.ts` global mocks for `expo-router` + `@/features/auth/lib/auth-client`) is live and reused here.
- The pre-existing `use-auth.ts` `toResult` change is committed SEPARATELY, ahead of this phase's `updateProfile()` addition, so `use-auth.ts` is clean when this phase edits it.

## Blast Radius

- `apps/mobile/src/app/(tabs)/account/index.tsx` — real Account screen (replace ComingSoon; remove dev showcase link if present).
- `apps/mobile/src/app/(tabs)/account/edit-profile.tsx` — NEW edit screen/route.
- `apps/mobile/src/app/(tabs)/account/_layout.tsx` — register the new `edit-profile` route as a `Stack.Screen` (with a `title`, e.g. "Edit Profile") alongside the existing `index`/`notifications`/`help` entries.
- `apps/mobile/src/features/auth/hooks/use-auth.ts` — ADD additive `updateProfile({name, birthday, address})` to `AuthContextValue` + provider. Calls `authClient.updateUser({name, birthday, address})` (deliberately WITHOUT `onboardedAt`) then `refetch()`. Distinct from `completeProfile()` — never share implementation, since `completeProfile()` intentionally re-stamps `onboardedAt` for the onboarding flow.
- `apps/mobile/src/features/auth/lib/birthday.ts` — NEW pure helper: `isValidBirthday`, assemble `{mm,dd,yyyy} → YYYY-MM-DD`, and split `YYYY-MM-DD → {mm,dd,yyyy}` (for pre-filling the edit form; onboarding only ever assembles, never splits).
- `apps/mobile/src/features/auth/lib/birthday.test.ts` — NEW vitest unit tests.
- `apps/mobile/src/app/(tabs)/account/index.test.tsx` — NEW jest component test.
- `apps/mobile/src/app/(tabs)/account/edit-profile.test.tsx` — NEW jest component test.
- Reuse shared `@jojopotato/ui` `Input` (already supports `forwardRef`/`maxLength`/`onKeyPress`/`textAlign`/`returnKeyType` — no change needed), `Button`, `Card`.
- Reuse `apps/mobile/src/test-utils/render.tsx` (async `renderWithProviders` + `spyOnAlert`) and `jest-setup.ts`'s global `auth-client` mock from Phase 4 — do not duplicate mock plumbing.

## Implementation Checklist

### Step A — Profile view

- [x] A1. Render real user profile from `useAuth().user` (name, read-only email, birthday, address). Friendly placeholders for unset optional fields.
- [x] A2. Section/settings list (edit profile, sign out, and links to Notifications/Help/Order History). Keep `signOut` behavior unchanged. Remove the dev showcase link if still present.

### Step B — Profile edit

- [x] B1. New `apps/mobile/src/features/auth/lib/birthday.ts`: `isValidBirthday` (valid/invalid month/day/year, leap years, out-of-range) + assemble (`{mm,dd,yyyy} → YYYY-MM-DD`) + split (`YYYY-MM-DD → {mm,dd,yyyy}`, for pre-filling the edit form). Add `birthday.test.ts` (vitest, matches `apps/mobile/vitest.config.ts`'s `src/**/*.test.ts` glob).
- [x] B2. Edit screen (`edit-profile.tsx`): name (text), birthday (3-field MM/DD/YYYY auto-tabbing `Input` row — duplicate the small markup pattern from onboarding, but call the shared `birthday.ts` logic, not onboarding's inline logic), address (text), pre-filled from `useAuth().user` via `birthday.ts`'s split helper. Inline validation via `isValidBirthday`.
- [x] B3. Add `updateProfile({name, birthday, address})` to `use-auth.ts`'s `AuthContextValue` + provider — calls `authClient.updateUser({name, birthday, address})` (never `role`, never `onboardedAt`), then `refetch()`. Screens call `useAuth().updateProfile(...)`, never `authClient` directly (repo convention).
- [x] B4. Wire Save in `edit-profile.tsx` to `updateProfile()`. Loading/disabled state while saving; success + error feedback; cancel discards changes; invalid birthday blocks Save (no `updateProfile` call).
- [x] B5. Register `edit-profile` as a `Stack.Screen` in `account/_layout.tsx` (e.g. `<Stack.Screen name="edit-profile" options={{ title: 'Edit Profile' }} />`) alongside the existing `index`/`notifications`/`help` entries.

### Step C — Guards

- [x] C1. Confirm `role` is not in the editable field set (server-owned, `input:false`). Grep the NEW `edit-profile.tsx` file only — do not grep `use-auth.ts` broadly, since it legitimately reads `sessionUser.role` (read-only) and a broad grep produces false positives.

### Step D — Automated screen coverage (jest, reusing Phase 4 runner)

- [x] D1. `account/index.test.tsx` — `jest.mock('@/features/auth/hooks/use-auth')` to stub `useAuth()` directly per-test (NOT the global `auth-client` mock alone — `renderWithProviders` does not wrap `AuthProvider`, and the default `authClient.useSession()` stub in `jest-setup.ts` returns an unauthenticated `{data: null}`, which cannot supply a signed-in profile on its own); assert name/email render from the mocked user; "Edit profile" nav + Notifications/Help/Order History links present; sign-out button fires `signOut`. Uses `renderWithProviders` (async) from `test-utils/render.tsx`.
- [x] D2. `edit-profile.test.tsx` — `jest.mock('@/features/auth/hooks/use-auth')` to stub `useAuth()` directly (same mechanism as D1); assert current name/birthday/address prefilled (via split helper); invalid birthday blocks Save (`updateProfile` NOT called); valid Save calls `updateProfile` with EXACTLY `{name, birthday, address}` and never `role`/`onboardedAt`; assert no `role` input is rendered in the form at all.

## Exit Gate

```bash
pnpm --filter @jojopotato/mobile typecheck && pnpm lint
# Expected: exit 0

pnpm --filter @jojopotato/mobile test
# Expected: exit 0 — vitest run (birthday.test.ts) THEN jest (account/index.test.tsx, edit-profile.test.tsx)
# per apps/mobile package.json test script: `vitest run --passWithNoTests && jest`

grep -n "role" apps/mobile/src/app/\(tabs\)/account/edit-profile.tsx && echo "FAIL: role referenced in edit-profile.tsx" || echo "PASS: no role reference in edit-profile.tsx"
# Expected: "PASS: no role reference in edit-profile.tsx" — scoped to the new file only,
# so it cannot false-positive on use-auth.ts's legitimate read-only `sessionUser.role` usage.

pnpm format:check
# Expected: exit 0
```

- All checklist items checked.
- Fully-Automated: profile view render, edit-profile prefill/validation/save-payload/role-exclusion all jest/vitest-covered.
- Agent-Probe/Known-Gap: true native-restart persistence round-trip only (AC7) — irreducible, no process-restart harness exists in this repo.
- Phase report written to report destination above.

## Blockers That Would Justify BLOCKED Status

- `authClient.updateUser` cannot persist `birthday`/`address` (would indicate the additionalFields are not actually client-writable — the onboarding flow already proves this works; backend coverage in `auth.integration.test.ts` reused, not re-verified this phase).

## Inner Loop Refresh Note

**Date:** 2026-07-15
**Trigger:** Inner R+I ran (RESEARCH confirmed Phase 4's jest-expo runner is live; INNOVATE locked the `updateProfile()` save-path design).

Changes folded into this plan:
1. **Save path decided:** new, additive `updateProfile({name, birthday, address})` on `useAuth()` — deliberately SEPARATE from `completeProfile()` (which re-stamps `onboardedAt` and would corrupt it if reused for post-onboarding edits).
2. **Test strategy upgraded:** Phase 4 delivered a live jest-expo runner (`test-utils/render.tsx`, `jest.config.js`, `jest-setup.ts` global mocks) after this plan was originally written under Agent-Probe-only assumptions. Per the standing mandate to prefer Fully-Automated coverage whenever a runner exists, AC1 (profile view render) and the save-payload/role-exclusion assertions (AC2) are upgraded from Agent-Probe to Fully-Automated jest component tests (Step D, new). Only AC7 (true native-restart persistence round-trip) remains Agent-Probe/Known-Gap — this is irreducible since no process-restart test harness exists project-wide.
3. **`use-auth.ts` dependency note:** the pre-existing `toResult` change in `use-auth.ts` is committed SEPARATELY and first, so this phase's `updateProfile()` addition lands on a clean file.
4. Blast Radius / Touchpoints extended: `features/auth/lib/birthday.ts` (+ `birthday.test.ts`), `account/index.test.tsx` (new), `account/edit-profile.test.tsx` (new).

**Prior outer-pvl validate-contract below is now STALE — inner PVL re-run required before EXECUTE.**

## Phase Loop Progress

- [x] 1. RESEARCH — research-agent: prior phase reports read; test context loaded; onboarding birthday-input reuse mapped; plan drift checked (jest-expo runner now live)
- [x] 2. INNOVATE — innovate-agent: profile edit UX + save-path approach decided; Decision Summary written
- [x] 3. PLAN-SUPPLEMENT — plan-agent: phase plan updated (this pass) — test tiers upgraded, save-path folded in
- [x] 4. PVL — vc-validate-agent: full V1-V7 RE-RUN complete (inner-pvl: phase-5, 15-07-26); Gate: PASS; validate-contract written per example-validate-output.md
- [x] 5. EXECUTE — all checklist items done; per-section test gates green (15-07-26: vitest 44 + jest 19 green, typecheck/lint/format/grep all pass)
- [x] 6. EVL — all EVL gates green (typecheck, vitest 44 + jest 19, ui 47/47, lint, format, role-grep — all confirmed independently; jest tests confirmed to assert real behavior incl. explicit role/onboardedAt exclusion); no follow-up stubs required
- [x] 7. UPDATE PROCESS — phase report written; umbrella `## Current Execution State` updated (inter-phase closeout — plan stays in `active/` per phase-program convention until program end; context/commit deferred to program-end per umbrella task scope)

**Phase 5 — ✅ VERIFIED (15-07-26). EVL-confirmed. See umbrella `## Current Execution State` for Phase 6 handoff.**

## Touchpoints

- `apps/mobile/src/app/(tabs)/account/index.tsx`, `.../account/edit-profile.tsx` (new), `.../account/_layout.tsx`
- `apps/mobile/src/app/(tabs)/account/index.test.tsx` (new), `.../account/edit-profile.test.tsx` (new)
- `apps/mobile/src/features/auth/hooks/use-auth.ts` (add `updateProfile`)
- `apps/mobile/src/features/auth/lib/birthday.ts` (new), `birthday.test.ts` (new)
- `apps/mobile/src/test-utils/render.tsx`, `jest-setup.ts`, `jest.config.js` (Phase 4, reused unchanged)
- `packages/ui/src/components/{input,button,card}.tsx`
- Reference: `process/features/auth-accounts/completed/onboarding-screens_13-07-26/` (birthday input logic + updateUser + refetch pattern)

## Public Contracts

- No new API — uses existing better-auth `updateUser`. `role` stays server-owned (input:false), never sent by `updateProfile()`.
- `updateProfile()` never sends `onboardedAt` (distinguishes it from `completeProfile()`).
- `signOut` behavior unchanged.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Birthday assembly/split/validation pure helper (unit test) | Fully-Automated | AC3 |
| Account profile view renders name/email/links from mocked `useAuth()`; sign-out fires `signOut` | Fully-Automated (jest, upgraded from Agent-Probe) | AC1 |
| Edit-profile prefill from split helper; invalid birthday blocks Save; valid Save calls `updateProfile` with exactly `{name,birthday,address}`; no `role` input rendered | Fully-Automated (jest, upgraded from Agent-Probe) | AC2 |
| No client-side `role` write in edit path (grep, scoped to edit-profile.tsx) | Fully-Automated | Safety (role server-owned) |
| typecheck + lint + format:check green | Fully-Automated | AC1-AC3 |
| Server-side self-write of birthday/address + role-write-rejection + read-back shape | Fully-Automated (reused, not new) | Safety (role server-owned) — already covered by `packages/api/src/lib/__tests__/auth.integration.test.ts` ("profile fields" describe block); this phase does not need a new backend test |
| True native-restart persistence round-trip (force-close app, reopen, confirm saved values survive) | Agent-Probe / Known-Gap | AC7 — irreducible: no process-restart test harness exists in this repo (project-wide gap) |

```bash
pnpm --filter @jojopotato/mobile typecheck
# Expected: exit 0
```

## Test Infra Improvement Notes

- Screen-level render + save-payload + role-exclusion coverage is now Fully-Automated via Phase 4's jest-expo runner (upgraded from Agent-Probe this pass). Birthday validation is pure-TS vitest coverage.
- Only the true native-restart persistence round-trip (AC7) remains Agent-Probe/Known-Gap — this is an irreducible gap (no process-restart harness exists project-wide), not a scoping shortcut.

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-05-account-profile_PLAN_14-07-26.md`
- Last completed step: Step 3 PLAN-SUPPLEMENT (this pass) — inner R+I folded in, test tiers upgraded, save-path decided.
- Validate-contract status: CURRENT — Gate: PASS (inner-pvl: phase-5, 15-07-26). All 5 user-directed re-confirmation points verified against live code; 1 mechanical gap (D1/D2 test-mocking mechanism) found and fixed directly in plan text.
- Supporting context: onboarding-screens completed plan (birthday input logic + updateUser + refetch), `use-auth.ts` seam, Phase 4 jest-expo runner (`test-utils/render.tsx`, `jest-setup.ts`, `jest.config.js`).
- Next step: Spawn vc-execute-agent for Step 5 EXECUTE against this plan (validate-contract PASS).

## Validate Contract

Status: PASS
Date: 15-07-26
date: 2026-07-15
generated-by: inner-pvl: phase-5
supersedes: 2026-07-14 (outer-pvl) — inner PVL has current evidence (Inner Loop Refresh Note dated 2026-07-15: save-path decided, test tiers upgraded to Fully-Automated via live jest-expo runner)

Parallel strategy: sequential
Rationale: score 2/7 (S4 phase-program classification, S6 high-risk class named [auth-adjacent profile edit]) — MEDIUM tier per the scoring table, but this is a focused RE-CONFIRMATION of a prior contract's decisions against current code (5 point-checks + 4 Layer-1 dimensions + 3 Layer-2 sections, all read-only verification against a small, already-scoped blast radius) — a single sequential pass caught and fixed the one real gap (D1/D2 mocking mechanism) without needing agent coordination or fan-out overhead.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC3 | Birthday MM/DD/YYYY assembly + split + validation (leap years, invalid month/day, blank) | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (new `birthday.test.ts`, matches `apps/mobile/vitest.config.ts` glob `src/**/*.test.ts` — confirmed) | B |
| AC1 | Account shows real profile (name, read-only email, birthday, address, links, sign-out) | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (new `account/index.test.tsx`, jest — matches `jest.config.js` `testMatch: ['**/*.test.tsx']`, confirmed live runner) | B |
| AC2 | `role` never referenced/written in the new edit-profile screen, AND the actual save payload never includes `role`/`onboardedAt` | Fully-Automated | `grep -n "role" apps/mobile/src/app/(tabs)/account/edit-profile.tsx` (expect no match) PLUS `pnpm --filter @jojopotato/mobile test` (new `edit-profile.test.tsx` D2 payload assertion — asserts `updateProfile` called with exactly `{name,birthday,address}`) | B |
| AC6 (safety) | Server-side: signed-in user can self-write birthday/address and read them back; `role`/`onboardedAt`-via-updateProfile write attempts are never sent by the client, and any role write attempt is server-rejected regardless | Fully-Automated | `pnpm --filter @jojopotato/api test` — `packages/api/src/lib/__tests__/auth.integration.test.ts`, "profile fields" describe block (confirmed existing, reused, not new); `role: {input:false}` confirmed at `packages/api/src/lib/auth.ts:80` | A |
| — | typecheck + lint + format:check clean on `apps/mobile` | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck && pnpm lint` + `pnpm format:check` (both confirmed present as root scripts) | A |
| AC7 | True native-restart persistence round-trip (force-close app, reopen, confirm saved values survive) | Agent-Probe / Known-Gap | Manual walkthrough: edit each field → save → force-close and reopen app → confirm persisted values | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). AC7's Known-Gap classification is a named residual row via gap-resolution D, never a strategy that proves a behavior — it is irreducible (no process-restart test harness exists project-wide) and does not gate this phase's PASS.

Legacy line form (retained so existing validate-contract consumers still parse):
- `apps/mobile` profile/edit logic: Fully-automated: `pnpm --filter @jojopotato/mobile typecheck && pnpm lint && pnpm --filter @jojopotato/mobile test` (vitest run birthday.test.ts THEN jest account/index.test.tsx + edit-profile.test.tsx) | Fully-automated: `grep` role-scope check (scoped to `edit-profile.tsx`) | Fully-automated: `pnpm format:check` | agent-probe: true native-restart persistence round-trip (AC7) | known-gap: no RN E2E/process-restart harness exists project-wide (documented, unchanged by this phase)

Dimension findings:
- Infra fit: PASS — mobile screen-only change; no container/infra/API/runtime surface touched; confirmed live: `@jojopotato/ui` `Input`/`Button`/`Card` all exist with needed passthrough props; Phase 4's jest-expo runner (`jest.config.js`, `src/test-utils/{render.tsx,jest-setup.ts}`) confirmed live and reusable unchanged.
- Test coverage: PASS (after fix) — Exit Gate test command matches the real `apps/mobile` `package.json` `"test"` script (`vitest run --passWithNoTests && jest`) exactly; vitest glob (`src/**/*.test.ts`) matches the planned `birthday.test.ts` path; jest `testMatch` (`**/*.test.tsx`) matches the planned `account/index.test.tsx`/`edit-profile.test.tsx` paths. One mechanical gap found and fixed directly in plan text: D1/D2 said "mock `useAuth()`" and cited "the global `auth-client` mock from `jest-setup.ts`" as the mechanism, but that global mock only stubs `authClient.useSession()` to an unauthenticated `{data: null}` default and `renderWithProviders` does not wrap `AuthProvider` — so as originally worded, `useAuth()` would either throw (no `AuthProvider` in the tree) or never expose a signed-in user. Fixed: D1/D2 now specify `jest.mock('@/features/auth/hooks/use-auth')` to stub the hook directly per-test (no `AuthProvider` needed, no dependency on the global `authClient` mock's default state). No test file exists yet for this pattern in the repo (this phase is the first `useAuth()`-mocking jest test) — the fix follows this repo's existing convention of screens calling `useAuth()` never `authClient` directly, so mocking the hook module is the correct, idiomatic mechanism.
- Breaking changes: PASS — no schema/API/public-contract change; `signOut` code path unchanged (still `useAuth().signOut`); `role` stays server-owned (`input:false`, confirmed unchanged at `packages/api/src/lib/auth.ts:80`).
- Security surface: PASS — `role` confirmed `input:false` at the better-auth config layer (server-authoritative, independently proven by the reused `auth.integration.test.ts` role-write-rejection case). Save-path design re-verified against actual code: `completeProfile()` (existing, `use-auth.ts:152-170`) calls `authClient.updateUser({name,birthday,address,onboardedAt:new Date()})` — confirms it DOES re-stamp `onboardedAt`. The plan's new `updateProfile()` correctly omits `onboardedAt` entirely (and `role`, which was never itself a field to begin with) — this is the right design: editing a profile after onboarding must never reset `onboardedAt`/re-trigger the onboarding nav gate. `updateProfile` is confirmed additive — not currently present in `AuthContextValue` (verified by reading the live file). The C1 grep guard (scoped to `edit-profile.tsx` only, not `use-auth.ts`) is correctly designed: `use-auth.ts:191` has a legitimate read-only `role: (sessionUser.role as UserRole) ?? 'customer'` line that a broad grep would false-positive on; scoping avoids this. `edit-profile.tsx` does not exist yet, so today the grep target is simply absent (trivially passes) — the gate is meaningful once EXECUTE creates the file.
- Section A feasibility (Profile view): PASS — current `account/index.tsx` (65 ln) confirmed to be exactly as described: `ComingSoon`-wrapped, only `signOut` used from `useAuth()`, dev showcase link still present (confirmed via `grep`, needs removal per A2). `AuthUser` type (`packages/types/src/auth.ts`) confirmed to already carry `name`/`email`/`birthday`/`address`/`role`/`onboardedAt` — no new type field needed for the view. `AccountLink` pattern directly reusable for the settings list. No gaps, no conflicts.
- Section B feasibility (Profile edit): PASS (after fix, see Test coverage above) — `authClient.updateUser` + `refetch()` pattern confirmed proven working in `completeProfile()`. Onboarding's inline `isValidBirthday` + MM/DD/YYYY assembly logic confirmed present at `apps/mobile/src/app/(onboarding)/index.tsx:42-95` — directly extractable into the planned `birthday.ts` (assemble direction already implemented there; split direction is new but mechanically trivial, symmetric to assemble). `account/_layout.tsx` confirmed to have the exact `Stack.Screen` pattern (`index`/`notifications`/`help`) the plan's B5 checklist item extends for `edit-profile`. Highest-risk edit: the `updateUser` call itself — mitigation (build the payload explicitly field-by-field, never spread a generic form-state object) is sound and is now doubly enforced by the D2 jest payload assertion in addition to the grep.
- Section C feasibility (Guards): PASS — C1's grep (`grep -n "role" apps/mobile/src/app/(tabs)/account/edit-profile.tsx`) is correctly scoped to the new file only; confirmed `use-auth.ts:191`'s legitimate `role:` usage would false-positive a broader grep, validating why C1 was rescoped in the prior PVL cycle. `role: {input:false}` re-confirmed live at `packages/api/src/lib/auth.ts:80` (auth-adjacent safety re-verified, not just re-asserted).

Open gaps: none blocking. Known project-wide gap carried forward (not new to this phase, not new to this cycle): no native-process-restart test harness exists — AC7 (true persistence round-trip) is Agent-Probe/Known-Gap, consistent with every other UI phase in this program; it is a named residual with written justification (irreducibility — no such harness exists repo-wide), not a silent pass.

What this coverage does NOT prove:
- The birthday unit test (AC3) proves pure MM/DD/YYYY assemble/split/validation logic only — it does NOT prove the RN input fields actually auto-tab correctly, render the right keyboard, or wire correctly to that logic on-device (jest with RN mocks approximates but does not fully replace on-device behavior).
- The jest component tests (AC1, AC2) prove render output and save-payload shape against a MOCKED `useAuth()` — they do NOT prove the real `authClient.updateUser` → `refetch()` round-trip against a live better-auth session, and do NOT prove the mocked-hook module wiring matches production wiring at every future call site (a regression that changes how `useAuth()` is imported elsewhere would not be caught by this mock).
- The role-scope grep (AC2) proves the string `role` does not appear in the new file's source text at test time — it does NOT prove no future edit to that file could reintroduce a role write without re-running the grep (a snapshot check, not a standing type-level guarantee). The D2 jest payload assertion strengthens this by proving the actual runtime payload shape at test time, but is subject to the same "must keep re-running" caveat.
- The reused backend test (`auth.integration.test.ts`) proves the SERVER rejects a role write — it does NOT prove the MOBILE client never attempts to send one at every future call site (client discipline is enforced by the grep + D2 payload assertion, both snapshot checks, not compiler-enforced).
- typecheck/lint/format:check prove structural/type/style correctness only — they do NOT prove `refetch()` actually updates the visible UI without a restart in a real device runtime, and do NOT prove any accessibility or visual-layout correctness.
- The Agent-Probe/Known-Gap AC7 (true native-restart persistence) is irreducible — it does NOT prove behavior across all real devices, OS versions, or slow-network conditions, and no automated substitute exists project-wide for verifying state survives an actual process restart.

Gate: PASS (no FAILs, no unresolved CONCERNs — 1 mechanical gap found this cycle [D1/D2 test-mocking mechanism underspecified] and fixed directly in plan text before this contract was written; all 5 user-directed verification points confirmed against live code: save-path design correct and additive, role stays server-owned with correctly-scoped guard, birthday.ts extraction target confirmed present, jest test plan reuses Phase 4 infra correctly (with the one fix), blast radius/touchpoints/exit-gate are coherent)
Accepted by: N/A — Gate: PASS, no unresolved CONCERNs require acceptance
