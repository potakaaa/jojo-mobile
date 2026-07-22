---
phase: adm-013-invite-management
date: 2026-07-22
status: COMPLETE_WITH_GAPS
feature: admin-dashboard
plan: process/features/admin-dashboard/active/adm-013-invite-management_21-07-26/adm-013-invite-management_PLAN_21-07-26.md
---

# ADM-013 — Staff Invite Management + Staff Removal (UPDATE PROCESS Report)

## What Was Done

- **Part A — Pending invite management** (`packages/api`): migration `0021_thick_shotgun.sql`
  (renumbered to `0022_nostalgic_lightspeed.sql` on merge with `development`'s
  `0021_add_notifications_user_created_idx.sql`) — additive nullable `staff_invites.revoked_at`,
  zero backfill. The `revoked_at IS NULL` liveness invariant was added at every "is this invite
  live" predicate: `/staff-invite/start`'s guard, `/staff-invite/consume`'s atomic WHERE (5th
  condition, preserving ADM-012's session-email-match 4th condition), and the invite-create
  supersede predicate in `staff.ts`. Three new super_admin-only routes on `admin/staff.ts`:
  `GET /invites` (pending-only list), `POST /invites/:id/revoke` (atomic compare-and-swap),
  `POST /invites/:id/resend` (send-before-commit ordering, compare-and-swap keyed on the exact
  captured `tokenHash` — closes the double-resend race). New `serializeAdminPendingStaffInvite`
  (never serializes `tokenHash`).
- **Part B — Staff removal/demotion** (`apps/admin`-only, zero backend change): "Remove from
  staff" action on `StaffList` reusing the existing `POST /api/admin/users/:id/role` route
  unmodified (`role: 'customer'`), confirm-gated, hidden on the signed-in user's own row.
- New `apps/admin` UI: `pending-invites-list.tsx` (list + revoke confirm-dialog + resend button),
  wired into `staff.index.tsx` below `StaffList`, both super_admin-gated.
- 4 new/extended backend integration test files (`admin-staff-invites-list`,
  `admin-staff-invite-revoke`, `admin-staff-invite-resend`, plus append to
  `staff-invite.integration.test.ts` and `admin-staff.integration.test.ts`) proving AC1–AC8,
  AC14, AC15.
- CodeRabbit review addressed on the PR (commit `6d42992`).

## What Was Skipped/Deferred

- AC9 (Pending Invites UI real-browser walkthrough) and AC13 (Remove-from-staff UI real-browser
  walkthrough) — both Agent-Probe only, standing project-wide no-`apps/admin`-E2E-runner gap.
  Not new debt — same residual class as every prior admin-dashboard phase with a UI-layer
  Agent-Probe gate (ADM-005 G10, ADM-006, ADM-007 AC9, ADM-010 AC8). Owed before this plan can be
  stamped VERIFIED.

## Test Gate Outcomes

All gates independently EVL-confirmed green this pass (re-derived from plan/commit evidence, not
re-run this UPDATE PROCESS session per the orchestrator's constraint against running the shared
test DB):

| Gate | Result |
|---|---|
| `pnpm --filter @jojopotato/api typecheck` | clean |
| `pnpm --filter @jojopotato/api test` | 770/770 |
| `pnpm --filter @jojopotato/admin typecheck` | clean |
| `pnpm --filter @jojopotato/admin test` | 190/190 |
| `pnpm --filter @jojopotato/admin build` | clean |
| `pnpm format:check` | clean |

## Plan Deviations

None substantive — the plan's third VALIDATE pass (`Gate: PASS`) already folded in the two
post-approval evidence-pack follow-ups (Fix 1: dangling-authority-after-demotion regression test,
now AC14; Fix 2: double-resend-race exact-token compare-and-swap, now AC15) before EXECUTE began,
so EXECUTE itself tracked the locked plan without further material deviation.

## Test Infra Gaps Found

None new. The standing `apps/admin` no-E2E-runner gap (already tracked repo-wide) is the sole
reason AC9/AC13 remain Agent-Probe-only.

## SPEC Achievement

| AC | Status |
|---|---|
| AC1–AC8 (list/revoke/resend backend behavior + role matrix) | met — Fully-Automated |
| AC9 (Pending Invites UI walkthrough) | unmet — Agent-Probe owed |
| AC10–AC12 (staff removal server + client-gate behavior) | met — Fully-Automated |
| AC13 (Remove-from-staff UI walkthrough) | unmet — Agent-Probe owed |
| AC14 (dangling authority after demotion) | met — Fully-Automated, HARD gate |
| AC15 (double-resend race compare-and-swap) | met — Fully-Automated, HARD gate |

AC9 and AC13 unmet → tracked as owed Agent-Probe walkthroughs in the plan's own Phase Completion
Rules (not filed as separate backlog notes — this is the plan's own standing gate, already
documented in the plan and this report).

## Closeout Packet

1. **Selected plan path:**
   `process/features/admin-dashboard/active/adm-013-invite-management_21-07-26/adm-013-invite-management_PLAN_21-07-26.md`
2. **Closeout classification:** Keep in active/testing (CODE DONE + EVL-green + committed, AC9/
   AC13 walkthroughs owed).
3. **What was finished:** see "What Was Done" above.
4. **Verified vs unverified:** all automated gates + HARD regression tests verified; AC9/AC13
   UI-layer walkthroughs unverified.
4b. **Validate-contract compliance:** present, `Gate: PASS`, `generated-by: outer-pvl`, third
   pass, dated 2026-07-22.
5. **Cleanup done vs needed:** this UPDATE PROCESS pass adds this report, stamps the plan Status
   line, and reconciles `process/context/all-context.md`. Still needed: AC9/AC13 walkthroughs,
   then PR #154 merge.
6. **Next valid state:** keep the plan active; perform AC9/AC13 walkthroughs, merge PR #154, then
   a follow-up UPDATE PROCESS pass can archive the task folder.
7. **Commit-checkpoint recommendation:** process commit belongs after this UPDATE PROCESS pass —
   left uncommitted per the orchestrator's explicit instruction (user will commit).
8. **Regression status:** not applicable (single-plan, not a phase program).
9. **SPEC achievement:** see table above — 13/15 ACs met, 2 unmet (both Agent-Probe, owed).

## Forward Preview

### Test Infra Found

None new this pass.

### Blast Radius Changes

None vs. plan — ~16 files across `packages/api` + `apps/admin`, matching the plan's own Blast
Radius section.

### Commands to Stay Green

`pnpm --filter @jojopotato/api test`, `pnpm --filter @jojopotato/admin test`, both typechecks,
admin build, `pnpm format:check`.

### Dependency Changes

None.
