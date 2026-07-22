---
phase: adm-012-web-staff-setup
date: 2026-07-21
status: COMPLETE_WITH_GAPS
feature: admin-dashboard
plan: process/features/admin-dashboard/active/adm-012-web-staff-setup_21-07-26/adm-012-web-staff-setup_PLAN_21-07-26.md
---

# ADM-012 — Web-First Staff Account Setup — EXECUTE + EVL Closeout Report

**TL;DR:** ADM-012 shipped and is committed (`81974a9`, stacks on ADM-011 `0bf8365`). EVL
independently confirmed ALL GREEN (API 716/716, admin 181/181, 3 typechecks, admin build,
format:check). Byte-frozen routes and the mobile route de-registration verified by direct diff.
Status is **CODE DONE + committed + NOT VERIFIED** — AC12 (real-browser walkthrough) and the
5-artifact high-risk evidence pack are still owed (both user-run). Task folder stays in `active/`.

## What Was Done

- New session-gated `POST /staff-invite/set-password` (`packages/api/src/routes/staff-invite.ts`)
  — `auth.api.setPassword` reused verbatim; 8–128 char Zod re-assertion; `PASSWORD_ALREADY_SET`
  treated as success (`200 { ok: true }`), no credential mutation, not logged as an error.
- `sendStaffInvite` (`packages/api/src/routes/admin/staff.ts`) repointed `acceptUrl` from the
  mobile deep-link path (`/staff-invite/native`) to the web accept page
  (`${ADMIN_WEB_ORIGIN}/staff-invite-accept?token=...`); doc-comment updated to match.
- `apps/admin/src/features/auth/lib/auth-client.ts` gained `birthday`/`address`/`onboardedAt`
  field registration (mirrors the mobile client) — required for `authClient.updateUser(...)` to
  type-check on the new profile step.
- `apps/admin/src/routes/staff-invite-accept.tsx` rewritten: verify → consume → **Profile step**
  (name/birthday/address, parity with mobile customer onboarding, via `authClient.updateUser` +
  `onboardedAt`) → **Password step** (confirm-match + inline strength meter, no new dependency) →
  role-based routing (`admin`/`super_admin` → dashboard; `staff` → terminal "sign in on the app"
  card, no dashboard nav attempted). "Open in the app" deep-link block removed.
- `apps/mobile/src/app/(auth)/_layout.tsx`: exactly 1 line removed
  (`<Stack.Screen name="invite-accept" />`). `invite-accept.tsx` itself is byte-unmodified
  (confirmed by `git diff 81974a9~1 81974a9` — zero diff for that file) — preserved intentionally
  for potential future mobile-onboarding reuse.
- Backlog note filed: `staff-mobile-onboarding-parity_NOTE_21-07-26.md`.

## What Was Skipped/Deferred

- **AC12** (full real-browser walkthrough — staff-role AND admin-role invite, strength meter,
  confirm-mismatch error) — Agent-Probe, user deferred to "tomorrow." Owed before VERIFIED.
- **5-artifact high-risk evidence pack** (auth/identity-adjacent class, `mustStopBeforeFinalize:
  true`, same precedent as ADM-011) — not yet generated or reviewed. Owed before finalize/PR, not
  before EXECUTE (already correctly not blocking EXECUTE per the validate-contract).
- Mobile-native staff onboarding parity — deferred to the existing backlog note (unchanged this
  pass, already filed by EXECUTE).
- ADM-013 shared-file sequencing on `staff-invite.ts` — ADM-012 landed first (now committed).
  ADM-013's plan explicitly notes "VALIDATE MUST RE-RUN" pending, and must re-scan
  `staff-invite.ts` + its integration test file before its own EXECUTE, per the re-scan-before-edit
  rule both plans carried. This is not this UPDATE PROCESS pass's job to resolve — recorded here so
  the next session doesn't lose it.

## Test Gate Outcomes

Independently re-confirmed by a separately-spawned vc-tester (not execute-agent self-report):

| Gate | Command | Result |
|---|---|---|
| API suite | `pnpm --filter @jojopotato/api test` | 716/716 green |
| Admin suite | `pnpm --filter @jojopotato/admin test` | 181/181 green |
| API typecheck | `pnpm --filter @jojopotato/api typecheck` | clean |
| Admin typecheck | `pnpm --filter @jojopotato/admin typecheck` | clean |
| Mobile typecheck | `pnpm --filter @jojopotato/mobile typecheck` | clean |
| Admin build | `pnpm --filter @jojopotato/admin build` | clean |
| Format | `pnpm format:check` | clean |
| Byte-frozen route diff | `git diff` on `POST /users/:id/role`, `PATCH /staff/:id/branch` | 0 lines changed |
| `invite-accept.tsx` diff | `git diff 81974a9~1 81974a9 -- .../invite-accept.tsx` | 0 lines changed |
| `_layout.tsx` diff | same | exactly 1 line removed |

All 12 Fully-Automated ACs (AC1–AC11, AC13) are proven green. AC12 (Agent-Probe) remains owed.

## Plan Deviations

5 in-scope EXECUTE deviations, all within the plan's own blast radius, none touching the hard
safety constraints:

1. **Routing state resolved synchronously in the submit handler, not via a transient `'routing'`
   phase state.** The plan's checklist step 15 described a `phase: 'routing'` intermediate state
   that resolves from the captured consume response. This branch's `react-hooks/set-state-in-effect`
   ESLint rule forbids calling `setState` inside a `useEffect` purely to react to another state
   change — the natural implementation of a `'routing'` phase would need exactly that. Execute-agent
   collapsed the role check into the password-step submit handler instead: on password success, the
   role check runs synchronously and either calls `onSignedIn()` or sets `phase: 'staff-done'`
   directly — no intermediate render, behavior is identical, one fewer state value in the union.
2–5. Four further deviations (E1/E2/E3/E5/E6/E7/E8-class mechanical corrections already anticipated
   and pre-resolved at VALIDATE — auth-client field registration, test filename, Input/Button
   wording, exact test-file targets for AC5/AC10/AC13) were applied exactly as VALIDATE resolved
   them; no further ad-hoc deviation beyond the routing-state collapse above. (Full deviation
   detail was captured live during EXECUTE; this report summarizes rather than re-derives it, per
   the ground truth supplied for this UPDATE PROCESS pass.)

None of the deviations touched: `POST /api/admin/users/:id/role`, `PATCH /api/admin/staff/:id/branch`,
role inclusion in any `updateUser`/`setPassword` call, or `invite-accept.tsx` deletion. All hard
stop conditions from the plan's Autonomous Goal Block were honored.

## Test Infra Gaps Found

None new. The standing project-wide gap (no `apps/admin`/`apps/mobile` browser/E2E runner, so
visual/UX/real-cross-origin-cookie behavior is Agent-Probe only) is unchanged and already tracked
across the admin-dashboard program.

## SPEC Achievement

Per the locked SPEC's 13 ACs (see plan's Verification Evidence + Validate Contract test-gate
table):

| AC | Criterion | Status |
|---|---|---|
| AC1 | set-password persists durable credential; fresh sign-in succeeds | **Met** (Fully-Automated) |
| AC2 | session-gated; only mutates password | **Met** (Fully-Automated) |
| AC3 | 8–128 char boundary enforced | **Met** (Fully-Automated) |
| AC4 | existing-password account → graceful no-op | **Met** (Fully-Automated) |
| AC5 | profile persists and reads back | **Met** (Fully-Automated) |
| AC6 | profile step blocks on missing/invalid fields | **Met** (Fully-Automated) |
| AC7 | profile update never mutates role/branch | **Met** (Fully-Automated) |
| AC8 | admin/super_admin → dashboard nav | **Met** (Fully-Automated, component-level) |
| AC9 | staff → terminal confirmation, no dashboard nav | **Met** (Fully-Automated, component-level) |
| AC10 | invite-send URL targets web path | **Met** (Fully-Automated) |
| AC11 | mobile route unreachable, file preserved | **Met** (Fully-Automated) |
| AC12 | full browser walkthrough (staff + admin) | **Unmet** — Agent-Probe, owed |
| AC13 | role/branch routes byte-unmodified | **Met** (Fully-Automated) |

**## SPEC Gaps:** AC12 only. Backlog stub: the plan's own Phase Completion Rules already gate
`VERIFIED` status on AC12 — no separate backlog note needed since the plan itself remains in
`active/` as the tracking artifact until AC12 passes. Vacuous-green ban honored: AC12 is not
claimed met by any automated substitute (component tests explicitly do NOT prove real
cross-origin cookie behavior or visual/UX correctness — stated verbatim in the plan's "What this
coverage does NOT prove" section).

## Closeout Packet

1. **Selected plan path:** `process/features/admin-dashboard/active/adm-012-web-staff-setup_21-07-26/adm-012-web-staff-setup_PLAN_21-07-26.md`
2. **Closeout classification:** Keep in active/testing — AC12 + evidence pack still pending.
3. **What was finished:** see "What Was Done" above.
4. **Verified vs unverified:** 12/13 ACs Fully-Automated-verified and EVL-reconfirmed; AC12
   real-browser walkthrough unverified.
4b. **Validate-contract compliance:** present, inline in plan, `generated-by: outer-pvl`,
   `Gate: CONDITIONAL` explicitly accepted by the user in-session 21-07-26 (0 FAILs, no unresolved
   CONCERNs) — EXECUTE-legal per orchestration.md §PVL routing.
5. **Cleanup done vs still needed:** source committed (`81974a9`); this UPDATE PROCESS pass writes
   the phase report, reconciles `all-context.md`, stamps the plan status, files 1 new backlog note
   (pre-existing ADM-011 lint debt), and updates the multitrack resume memory. Still needed: AC12
   walkthrough + evidence pack before VERIFIED/finalize; ADM-013 re-scan-before-edit + VALIDATE
   re-run before its own EXECUTE.
6. **Next valid state:** Keep the plan active and continue validation (AC12 walkthrough) on the
   same selected plan — do not archive.
7. **Commit checkpoint:** N/A — source already committed by the user (`81974a9`) before this pass
   began. This UPDATE PROCESS pass's own edits (report, context, plan-status stamp, backlog note,
   memory) are process-only and left for the user to stage/commit separately.
8. **Regression status:** `pnpm --filter @jojopotato/api test -- admin-staff` (role/branch routes)
   re-run with zero new failures — confirmed byte-frozen. No other phase-program regression surface
   applies (ADM-012 is a standalone plan, not part of the completed 8-phase program).
9. **SPEC achievement:** see table above — 12/13 met, AC12 unmet (Agent-Probe, owed, tracked by
   the plan itself staying active).

## Forward Preview

### Test Infra Found

None new this pass.

### Blast Radius Changes

Matches the plan's declared blast radius exactly: 4 packages, 9 touched files (as predicted at
VALIDATE, incl. the E1 addition), 0 schema/migration changes, 1 new route. No expansion beyond plan.

### Commands to Stay Green

```
pnpm --filter @jojopotato/api test
pnpm --filter @jojopotato/admin test
pnpm --filter @jojopotato/api typecheck
pnpm --filter @jojopotato/admin typecheck
pnpm --filter @jojopotato/mobile typecheck
pnpm --filter @jojopotato/admin build
pnpm format:check
```

### Dependency Changes

None. Strength meter is a local pure function, no new npm package (per SPEC constraint).
