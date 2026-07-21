---
phase: adm-011-add-staff
date: 2026-07-21
status: COMPLETE_WITH_GAPS
feature: admin-dashboard
plan: process/features/admin-dashboard/active/adm-011-add-staff_21-07-26/adm-011-add-staff_PLAN_21-07-26.md
---

# ADM-011 — Add Staff: Promote + Invite Flow — UPDATE PROCESS Closeout Report

## What Was Done

Shipped issue #141 — a super_admin-only "+ Add staff" flow with two paths, both composing
already-locked routes rather than rebuilding role/branch logic:

- **Path 1 (promote):** `GET /api/admin/users/lookup?email=` (new, exact-match) → existing
  `POST /api/admin/users/:id/role` → existing `PATCH /api/admin/staff/:id/branch` (staff targets
  only). Both reused routes are byte-unmodified. `apps/admin` gained `AddStaffDialog`
  (step-state flow) wired into `staff.index.tsx`.
- **Path 2 (invite):** new `staff_invites` table (migration `0020_minor_scarecrow.sql`, additive,
  hashed-token-at-rest), `POST /api/admin/staff/invite` (create, super_admin-gated), and a new
  unmounted-from-`/api/admin` router `staff-invite.ts` (`POST /start`, `POST /consume`) that
  reuses better-auth's magic-link mint/verify primitive with zero new signup form. Accept surfaces
  built on BOTH platforms: `apps/mobile/src/app/(auth)/invite-accept.tsx` (original scope) AND
  `apps/admin/src/routes/staff-invite-accept.tsx` (scope reopened mid-session by explicit user
  directive — Section H).
- **New IP-keyed rate limiter** (`packages/api/src/middleware/rate-limit.ts`, hand-rolled, no new
  dependency) applied only to `/staff-invite/start`, added during the PVL supplement cycle at the
  user's request (upgrading an initially-accepted residual to a fixed gap).
- **CORS extension:** `/staff-invite` mount gained the existing `adminCors` object (same instance
  already on `/api/admin` and `/api/auth` — no new policy), required to let the new
  `apps/admin` web accept page call `/start`/`/consume` cross-origin with credentials.

## What Was Skipped/Deferred

- **AC14 (real inbox delivery)** — Known-Gap, blocked on external Resend account provisioning
  (standing prerequisite, not new debt). Tracked in
  `process/features/auth-accounts/backlog/wire-better-auth-manual-prereqs_NOTE_09-07-26.md`.
- **Admin/super_admin invite → no web-console access** — deferred to a NEW follow-up plan
  (issue #142), tracked in
  `process/features/admin-dashboard/backlog/adm-011-admin-invite-no-web-access_NOTE_21-07-26.md`.
  User explicitly accepted shipping ADM-011 as-is during the re-validate pass; `staff`-target
  invites/promotes are unaffected (mobile `(staff)` shell fully provisions them).
- **AC7 (admin UI walkthrough)**, **mobile `invite-accept.tsx` on-device walkthrough** (incl. the
  flagged root `Stack.Protected` navigation-race observation), and **AC15 web accept page
  real-browser walkthrough** — all Agent-Probe, all owed by the user, NONE performed yet. This is
  why the plan does not carry `✅ VERIFIED`.
- **5-artifact high-risk evidence-pack user sign-off review** — the pack exists
  (`harness/{risk-gate,context-snippets,verification,adversarial-validation}.json` +ambiguous the
  Section-H delta files) and Gate: PASS / delta Gate: PASS were both recorded with genuine
  `harness/review-decision.json` + `harness/review-decision-delta.json` APPROVE records — but the
  plan's own Phase Completion Rules require VERIFIED to also include the Agent-Probe items above,
  which remain outstanding.

## Test Gate Outcomes

Independently confirmed green before commit (EVL, not execute-agent self-report):
- `packages/api` full suite: 709 passing (staff-invite 14/14, incl. +7 CORS cases for the Section H
  delta — E-H1/E-H2 both satisfied, 6 CORS cases + 1 no-Origin-regression case).
- `apps/admin`: 177 passing, typecheck clean, build clean.
- `apps/mobile`: typecheck clean (no RN runner covers screen-level flows — standing gap).
- Root `pnpm typecheck` + `pnpm format:check`: clean.
- Zero regressions on `require-admin.integration.test.ts` or existing staff/users suites.

Commands: `pnpm --filter @jojopotato/api test` (after `docker compose up -d` + `db:migrate`),
`pnpm --filter @jojopotato/admin test`, `pnpm --filter @jojopotato/mobile typecheck`, root
`pnpm typecheck` + `pnpm format:check`.

## Plan Deviations

- **Section D token-capture mechanism** — the plan's original Innovate Note (`WHERE identifier =
  email` query against `verification`) was factually wrong (matches zero rows always). Corrected
  in-place during the first VALIDATE pass via direct source read of better-auth's mint-side
  `signInMagicLink` handler: read the 10 most-recent `verification` rows, parse `value` in
  application code, match on `.email`, use `row.identifier` directly as the token (already plain,
  not hashed, given this repo's `storeToken` default). EXECUTE implemented the corrected mechanism
  as written — no further fallback was needed.
- **Rate limiting added mid-PVL** — the plan's first VALIDATE pass listed "no rate limit on
  `/staff-invite/start`" as an accepted residual; the user then directed a fix instead of
  acceptance, adding Section D item 9 (the rate limiter) as a PVL supplement. A test-isolation gap
  in that supplement (shared in-memory Map not reset between test cases) was caught by the
  re-validate pass and fixed via `__resetRateLimitStoreForTests()`.
- **Scope reopened mid-session (Section H)** — the user reversed the plan's original "mobile-only,
  no web accept" lock and added the `apps/admin` web accept page + CORS extension. This required
  its own scoped VALIDATE delta pass (Section H only), which produced its own genuine
  `harness/review-decision-delta.json` APPROVE (distinct from the Sections A–G approval) before
  Section H's EXECUTE began.

## Test Infra Gaps Found

None new. The plan's Test Infra Improvement Notes (standing `apps/mobile` no-RN-runner gap; the
`/staff-invite/start` 10-row-scan approach's potential flakiness under concurrent test-suite load)
were carried as pre-existing/named, not discovered fresh by EXECUTE — no EVL/EXECUTE report noted
the 10-row scan approach misbehaving in practice.

## SPEC Achievement

## SPEC Gaps

All 16 acceptance criteria (14 original + AC15/AC16 added by the Section H supplement) map to a
concrete gate per the plan's C-3 Verification Evidence table.

| AC | Status | Note |
|---|---|---|
| AC1–AC6, AC8–AC13, unnumbered re-check-at-consume, unnumbered write-shape-parity, VALIDATE-added superseded-invite case | **met** | Fully-Automated, `packages/api` 709/709 green |
| AC7 (admin UI walkthrough) | **unmet** | Agent-Probe not yet performed — owed by user |
| AC14 (real inbox delivery) | **unmet (accepted Known-Gap)** | blocked on external Resend provisioning, tracked separately, not new debt |
| AC15 (web accept page start→verify→consume) | **partially met** | component-level Fully-Automated proof green; real-browser Agent-Probe half not yet performed |
| AC16 (CORS headers correct/absent) | **met** | Fully-Automated, 7 new CORS cases green |
| Mobile `invite-accept.tsx` on-device walkthrough (navigation-race) | **unmet** | Agent-Probe not yet performed — owed by user |

Backlog stubs for unmet items: AC7/AC15-probe/mobile-walkthrough are Agent-Probe residuals already
named in the plan's own Verification Evidence table (gap-resolution `D`) — no new backlog note
required, they are tracked inline in the plan and this report. AC14 already has its own backlog
note (see above).

## Closeout Packet

1. **Selected plan path:** `process/features/admin-dashboard/active/adm-011-add-staff_21-07-26/adm-011-add-staff_PLAN_21-07-26.md`
2. **Closeout classification:** Keep in active/testing
3. **What was finished:** Sections A–H, all committed in `0bf8365` (Sections A–G plus the
   Section H web-accept delta, both human-approved separately). See "What Was Done" above.
4. **Verified vs unverified:** Verified — all Fully-Automated gates (709 API / 177 admin /
   typecheck/build/format, incl. 7 new CORS cases). Unverified — AC7, AC15's real-browser half, and
   the mobile on-device walkthrough (all Agent-Probe, all owed by the user).
   4b. **Validate-contract compliance:** Present — two-part contract in the plan file: the base
   `## Validate Contract` (Sections A–G, Gate: PASS, `generated-by: outer-pvl`, genuine
   `harness/review-decision.json` APPROVE) plus `## Validate Contract Delta` (Section H, Delta
   Gate: PASS, genuine `harness/review-decision-delta.json` APPROVE). Both were human-reviewed
   before their respective EXECUTE passes — no fabricated approvals.
5. **Cleanup done vs still needed:** Done this pass — phase report written, `all-context.md`
   updated with implementation-state bullet + routing row + Scan Metadata delta, plan Status/Phase
   Completion Rules stamped. Still needed — the 3 Agent-Probe walkthroughs above, then a final
   VERIFIED stamp + archival in a later UPDATE PROCESS pass.
6. **Single best next valid state:** Keep the plan active; either the user performs the 3 owed
   Agent-Probe walkthroughs (after which a follow-up UPDATE PROCESS pass can stamp VERIFIED and
   archive), or work proceeds on ADM-012 (issue #142 — set-password / web-access fix, already
   scoped in the deferred backlog note) as the next planning target.
7. **Commit-checkpoint recommendation:** N/A — already committed (`0bf8365`) before this UPDATE
   PROCESS pass began; this pass makes doc-only changes (context/plan/memory), which the user will
   stage/commit separately per their own stated workflow.
8. **Regression status:** N/A — standalone plan, not a phase-program phase; no cross-phase
   regression surface to check.
9. **SPEC achievement:** see `## SPEC Gaps` above.

## Forward Preview

### Test Infra Found

No new test infra. Confirmed the standing `apps/mobile` no-RN-runner-for-screen-flows gap remains
the correct classification (not new debt from this plan).

### Blast Radius Changes

Matches the plan's own final claim: ~17 files across 3 packages (13 for Sections A–G + 4 for
Section H) — confirmed via `git show --stat 0bf8365` (36 files changed incl. plan/SPEC/harness/
backlog-note docs; ~25 real source/test files).

### Commands to Stay Green

```
docker compose up -d
pnpm --filter @jojopotato/api db:migrate
pnpm --filter @jojopotato/api test
pnpm --filter @jojopotato/api typecheck
pnpm --filter @jojopotato/admin test
pnpm --filter @jojopotato/admin typecheck
pnpm --filter @jojopotato/admin build
pnpm --filter @jojopotato/mobile typecheck
pnpm typecheck
pnpm format:check
```

### Dependency Changes

None — the rate limiter is hand-rolled (no `express-rate-limit` added); no new packages introduced
anywhere in this plan.
