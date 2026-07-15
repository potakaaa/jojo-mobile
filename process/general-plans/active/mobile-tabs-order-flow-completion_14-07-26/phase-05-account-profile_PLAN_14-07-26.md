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

TL;DR: Replace the `<ComingSoon>` Account shell (`(tabs)/account/index.tsx`, 65 ln — only `signOut` real) with a real profile screen: view name/email/birthday/address, edit name/birthday/address via better-auth `updateUser`, and a settings/section list. No new backend route needed — profile edits go through the existing `authClient.updateUser` seam (`birthday`/`address` are client-writable `additionalFields`; `role` is server-owned, never editable). Read `process/context/all-context.md` first. Prioritize friendliness — reuse the MM/DD/YYYY auto-tabbing birthday input pattern from onboarding, inline validation, save feedback.

## Phase Completion Rules

This phase is VERIFIED only when: all checklist items checked; the phase validate-contract exists with green gates; regression checks against overlapping earlier phases pass; and the phase report is written. Code-only completion is CODE DONE, never VERIFIED. Mobile-screen behavior with no automated runner is proven by Agent-Probe and recorded as Known-Gap. Post-phase testing uses the Exit Gate test gates (see process/context/tests/all-tests.md).

## Acceptance Criteria

- AC1: Account shows real profile; edit name/birthday/address persists across restart (Agent-Probe).
- AC2: role is never client-writable (Fully-Automated grep, scoped to the new edit-profile file).
- AC3: birthday validation unit-tested (Fully-Automated); typecheck+lint green.

## Entry Gate

- Phase 0 (umbrella) complete. No backend dependency — can run in parallel with Phase 3.

## Blast Radius

- `apps/mobile/src/app/(tabs)/account/index.tsx` — real Account screen (replace ComingSoon).
- `apps/mobile/src/app/(tabs)/account/edit-profile.tsx` (or similar) — NEW edit screen/route.
- `apps/mobile/src/app/(tabs)/account/_layout.tsx` — register the new `edit-profile` route as a `Stack.Screen` (with a `title`, e.g. "Edit Profile") alongside the existing `index`/`notifications`/`help` entries so it gets a proper native header, consistent with sibling screens.
- `apps/mobile/src/features/auth/hooks/use-auth.ts` — reuse `user`/`completeProfile`/`updateUser` seam; extend only if an edit-specific helper is genuinely needed (additive).
- Reuse shared `@jojopotato/ui` `Input` (with MM/DD/YYYY passthrough props), `Button`, `Card`.

## Implementation Checklist

### Step A — Profile view

- [ ] A1. Render real user profile from `useAuth().user` (name, email, birthday, address). Friendly placeholders for unset optional fields.
- [ ] A2. Section/settings list (edit profile, sign out, and links to existing surfaces). Keep `signOut` behavior unchanged.

### Step B — Profile edit

- [ ] B1. Edit screen: name (text), birthday (reuse the 3-field MM/DD/YYYY auto-tabbing input from onboarding, assembled to `YYYY-MM-DD`), address (text). Inline validation.
- [ ] B2. Save via `authClient.updateUser` (through the `useAuth` seam), then `refetch()` the session so the view updates without restart. Never send `role`.
- [ ] B3. Loading/disabled state while saving; success + error feedback; cancel discards changes.
- [ ] B4. Register `edit-profile` as a `Stack.Screen` in `account/_layout.tsx` (e.g. `<Stack.Screen name="edit-profile" options={{ title: 'Edit Profile' }} />`) alongside the existing `index`/`notifications`/`help` entries.

### Step C — Guards

- [ ] C1. Confirm `role` is not in the editable field set (server-owned, `input:false`). Grep the NEW edit-profile file only (see Exit Gate) — do not grep `use-auth.ts` broadly, since it legitimately reads `sessionUser.role` (read-only) and a broad grep produces false positives.
- [ ] C2. Extract any pure validation (birthday assembly/validation) to a vitest-coverable helper (e.g. `apps/mobile/src/features/auth/lib/birthday.ts` + `birthday.test.ts`), matching the `src/**/*.test.ts` glob already wired in `apps/mobile/vitest.config.ts`.

## Exit Gate

```bash
pnpm --filter @jojopotato/mobile typecheck && pnpm lint
# Expected: exit 0

pnpm --filter @jojopotato/mobile test
# Expected: exit 0 — proves the C2 birthday-validation unit test (Verification Evidence row 1)

grep -n "role" apps/mobile/src/app/\(tabs\)/account/edit-profile.tsx && echo "FAIL: role referenced in edit-profile.tsx" || echo "PASS: no role reference in edit-profile.tsx"
# Expected: "PASS: no role reference in edit-profile.tsx" — scoped to the new file only,
# so it cannot false-positive on use-auth.ts's legitimate read-only `sessionUser.role` usage.
```

- All checklist items checked.
- Agent-Probe: view shows real profile; edit name/birthday/address persists across app restart; role not editable.
- Phase report written to report destination above.

## Blockers That Would Justify BLOCKED Status

- `authClient.updateUser` cannot persist `birthday`/`address` (would indicate the additionalFields are not actually client-writable — verify in RESEARCH; the onboarding flow already proves this works).

## Phase Loop Progress

- [ ] 1. RESEARCH — research-agent: prior phase reports read; test context loaded; onboarding birthday-input reuse mapped; plan drift checked
- [ ] 2. INNOVATE — innovate-agent: profile edit UX approach decided; Decision Summary written
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: phase plan updated (or "n/a — research clean")
- [ ] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per example-validate-output.md
- [ ] 5. EXECUTE — all checklist items done; per-section test gates green
- [ ] 6. EVL — all EVL gates green; follow-up stubs registered; EVL HANDOFF SUMMARY written
- [ ] 7. UPDATE PROCESS — phase report written, umbrella state updated, commit done

**Validate-contract required before execute.**

## Touchpoints

- `apps/mobile/src/app/(tabs)/account/index.tsx`, `.../account/edit-profile.tsx`, `.../account/_layout.tsx`
- `apps/mobile/src/features/auth/hooks/use-auth.ts`
- `packages/ui/src/components/{input,button,card}.tsx`
- Reference: `process/features/auth-accounts/completed/onboarding-screens_13-07-26/` (birthday input + updateUser + refetch pattern)

## Public Contracts

- No new API — uses existing better-auth `updateUser`. `role` stays server-owned (input:false).
- `signOut` behavior unchanged.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Birthday assembly/validation pure helper (unit test) | Fully-Automated | AC-6 (edit validation) |
| No client-side `role` write in edit path (grep, scoped to edit-profile.tsx) | Fully-Automated | Safety (role server-owned) |
| typecheck + lint green | Fully-Automated | AC-6 |
| Account shows real profile; edit name/birthday/address persists across restart (walkthrough) | Agent-Probe (Known-Gap for automation) | AC-6, AC-7 |
| Server-side self-write of birthday/address + role-write-rejection + read-back shape | Fully-Automated (reused, not new) | Safety (role server-owned) — already covered by `packages/api/src/lib/__tests__/auth.integration.test.ts` ("profile fields" describe block); this phase does not need a new backend test |

```bash
pnpm --filter @jojopotato/mobile typecheck
# Expected: exit 0
```

## Test Infra Improvement Notes

- Profile screen render + persistence round-trip is Agent-Probe (no RN runner). Birthday validation extracted to pure TS for Fully-Automated coverage.

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-05-account-profile_PLAN_14-07-26.md`
- Last completed step: not started
- Validate-contract status: PASS (see below)
- Supporting context: onboarding-screens completed plan (birthday input + updateUser + refetch), `use-auth.ts` seam.
- Next step: Spawn vc-research-agent for RESEARCH (Step 1) — confirm updateUser field set + reuse onboarding birthday input.

## Validate Contract

Status: PASS
Date: 14-07-26
date: 2026-07-14
generated-by: outer-pvl

Parallel strategy: parallel-subagents
Rationale: score 2/7 (S4 phase-program classification, S6 high-risk class named [auth-surface profile edit]) — MEDIUM tier. 4 Layer 1 dimension checks + 3 Layer 2 section checks (~7 total) run independently with no cross-agent coordination needed; fire-and-forget parallel subagents fit. (Executed here as a direct sequential dimension-by-dimension synthesis by the single validate agent, since this scope is small and well-bounded — no material quality loss vs. spawning separate agents.)

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC3 | Birthday MM/DD/YYYY assembly + validation (leap years, invalid month/day, blank) | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (new `birthday.test.ts`, matches `apps/mobile/vitest.config.ts` glob `src/**/*.test.ts`) | B |
| AC2 | `role` never referenced/written in the new edit-profile screen | Fully-Automated | `grep -n "role" apps/mobile/src/app/(tabs)/account/edit-profile.tsx` (expect no match) | B |
| AC6 (safety) | Server-side: signed-in user can self-write birthday/address/onboardedAt and read them back; a `role` write attempt is silently ignored (stays `customer`) | Fully-Automated | `pnpm --filter @jojopotato/api test` — `packages/api/src/lib/__tests__/auth.integration.test.ts`, "profile fields (updateUser self-write, additionalFields input:true)" describe block (already exists, reused, not new) | A |
| — | typecheck + lint clean on `apps/mobile` | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck && pnpm lint` | A (verified green this session: typecheck exit 0, lint 0 errors/3 unrelated warnings) |
| AC1, AC7 | Account shows real profile; edit name/birthday/address persists across app restart; save/error/loading feedback is friendly | Agent-Probe | Manual walkthrough: open Account → verify displayed profile matches session → edit each field → save → force-close and reopen app → confirm persisted values | D |

gap-resolution legend: A — proven now (gate passes in this cycle). B — fixed in this plan (gate added by this plan's checklist, C2/C1). C — deferred to a named later phase/plan. D — backlog test-building stub (named residual; keep-active; continue).

Legacy line form (retained so existing validate-contract consumers still parse):
- `apps/mobile` profile/edit logic: Fully-automated: `pnpm --filter @jojopotato/mobile typecheck && pnpm lint && pnpm --filter @jojopotato/mobile test` | Fully-automated: `grep` role-scope check (scoped to `edit-profile.tsx`) | agent-probe: full profile view+edit+persistence walkthrough | known-gap: no RN component/E2E runner exists project-wide (documented, unchanged by this phase)

Dimension findings:
- Infra fit: PASS — mobile screen-only change; no container/infra/API/runtime surface touched; reuses existing `authClient.updateUser` seam and `@jojopotato/ui` `Input`/`Button`/`Card` (all confirmed present with the needed passthrough props: `maxLength`/`onKeyPress`/`textAlign`/`returnKeyType`).
- Test coverage: PASS (after fix) — original plan's Exit Gate omitted `pnpm --filter @jojopotato/mobile test` despite C2 committing to a Fully-Automated birthday helper unit test; fixed by adding the test command to Exit Gate and this contract's test-gates table.
- Breaking changes: PASS — no schema/API/public-contract change; `signOut` behavior explicitly preserved; `role` stays server-owned (`input:false`, unchanged).
- Security surface: PASS — `role` is enforced server-owned at the better-auth config layer (`input:false`), independently proven by the existing `auth.integration.test.ts` role-write-rejection case (Hybrid-equivalent, already green); this phase adds no new secret/permission/trust-boundary surface. The plan's own C1 grep-based safety check was mechanically broken (false-positived on `use-auth.ts`'s legitimate read-only `role:` usage) — fixed by rescoping the grep to the new `edit-profile.tsx` file only.
- Section A feasibility (Profile view): PASS — `useAuth().user` (packages/types `AuthUser`) already exposes `name`/`email`/`birthday`/`address`; existing `AccountLink` pattern in `index.tsx` is directly reusable for the settings list. No gaps, no conflicts.
- Section B feasibility (Profile edit): PASS (after fix) — `authClient.updateUser` + `refetch()` pattern is already proven working in `use-auth.ts`'s `completeProfile()` (onboarding). Gap found: the original plan did not list `account/_layout.tsx` in Blast Radius/Touchpoints even though the new `edit-profile` route needs a `Stack.Screen` registration for a proper header — fixed by adding it to Blast Radius, Touchpoints, and a new checklist item B4. Highest-risk edit: the `updateUser` call itself — mitigation is to build the payload explicitly field-by-field (name/birthday/address only) rather than spreading a generic form-state object, so `role` can never leak in even if the form state object is later extended.
- Section C feasibility (Guards): PASS (after fix) — C1's originally-specified Exit Gate grep (`grep -rn "role" apps/mobile/src/app/(tabs)/account apps/mobile/src/features/auth/hooks/use-auth.ts | grep -i "updateUser\|role:"`) was verified this session to produce false-positive matches against the CURRENT codebase (it matches `use-auth.ts`'s legitimate read-only `role: (sessionUser.role as UserRole) ?? 'customer'` line), so it could never mechanically prove "no client role write" as originally written. Fixed by rescoping to the new file only (`grep -n "role" .../edit-profile.tsx`).

Open gaps: none blocking. Known project-wide gap carried forward (not new to this phase): no RN component/E2E test runner for `apps/mobile` — AC1/AC7 (profile view + edit + persistence) is Agent-Probe only, recorded as Known-Gap for automation, consistent with every other UI phase in this program.

What this coverage does NOT prove:
- The birthday unit test (AC3) proves pure MM/DD/YYYY assembly/validation logic only — it does NOT prove the RN input fields actually auto-tab correctly, render the right keyboard, or wire correctly to that logic on-device.
- The role-scope grep (AC2) proves the string `role` does not appear in the new file's source text — it does NOT prove no other future edit to that file could reintroduce a role write without triggering the grep again (grep is a snapshot check, not a standing type-level guarantee).
- The reused backend test (`auth.integration.test.ts`) proves the SERVER rejects a role write — it does NOT prove the MOBILE client never attempts to send one (client discipline is enforced by code review + the grep above, not by this backend test).
- typecheck/lint prove structural/type correctness — they do NOT prove the screen renders correctly, that navigation to/from `edit-profile` works, or that `refetch()` actually updates the visible UI without a restart.
- The Agent-Probe walkthrough (AC1/AC7) is a single manual pass by one operator — it does NOT prove behavior across all real devices, OS versions, or slow-network conditions.

Gate: PASS (no FAILs, plan updated — 3 mechanical gaps found and fixed directly in the plan text before this contract was written: missing Exit Gate test command, missing `_layout.tsx` touchpoint/checklist item, and a false-positive-prone C1 grep rescoped to the new file only)
