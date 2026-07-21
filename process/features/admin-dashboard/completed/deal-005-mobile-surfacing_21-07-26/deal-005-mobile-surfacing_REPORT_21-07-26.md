---
phase: deal-005-mobile-surfacing
date: 2026-07-21
status: COMPLETE
feature: admin-dashboard
plan: process/features/admin-dashboard/completed/deal-005-mobile-surfacing_21-07-26/deal-005-mobile-surfacing_PLAN_21-07-26.md
---

# DEAL-005 Phase 3 — Mobile Surfacing of Live Deal Schedules — UPDATE PROCESS Report

**Final closeout addendum (21-07-26, same day):** the AC5 nav-entry blocker was fixed (a "See all"
entry added to the Home tab's "Deals & offers" header, commit `ab3d916`, linking to
`/(tabs)/deals`), and the user performed and PASSED the full AC5-AC7 Agent-Probe walkthrough this
session. Plan is now ✅ VERIFIED; task folder archived to `completed/`. The AC status table and
closeout packet below are updated to reflect this; the "What Was Done" / "Test Gate Outcomes"
sections below describe the original doc-reconciliation pass and remain accurate as historical
record.

Doc-reconciliation pass (original). Source and SPEC+PLAN were already committed by the user before
this UPDATE PROCESS session began (`f0685f9` source, `83fc7f4` docs, branch `adm-deal-005-p2`).

## What Was Done

- Added an additive optional `schedule?: ApiDealScheduleWindow[]` field to the `?isDeal=true` menu
  wire response (`packages/api/src/routes/lib/serializers.ts`), key omitted entirely for
  always-live/zero-row deals and the regular (non-deal) menu.
- New sibling `resolveLiveDealSchedules()` in `packages/api/src/routes/lib/deal-schedule.ts`,
  reusing the existing row-fetch via a shared private helper; `resolveLiveDealProductIds()`
  (the write-path function `orders.ts` calls) is byte-unchanged — `branches.ts` (read path) is the
  only call-site switched.
- New pure formatter `packages/utils/src/deal-schedule-display.ts`
  (`formatDealScheduleSummary`), importing the shared `DealScheduleWindow` type from
  `@jojopotato/types` (Plan Update P1, applied during VALIDATE — corrected an inaccurate
  zero-inbound-dependency premise). Does zero Manila timezone math on
  `recurDays`/`recurStartTime`/`recurEndTime` (already Manila wall-clock from Phase 2); applies the
  fixed `+08:00` shift technique only to `endsAt` for the absolute-window display branch.
- New `DealCard.scheduleSummary?: string` prop (`packages/ui`) — deliberately NOT the existing
  `validUntil` prop, which is load-bearing for the legacy `offers`-model deals section on
  `(tabs)/branch/index.tsx` (Decision 6; reuse would have produced a double-labeled string).
- Wired 3 mobile render sites: Deals tab list (`(tabs)/deals/index.tsx`), Home strip
  (`(tabs)/index.tsx`), Deal Details (`(tabs)/deals/deal/[dealId].tsx`).
- Server menu-visibility filter and `orders.ts` write path are untouched — confirmed by direct
  read during VALIDATE, not assumed.

## What Was Skipped/Deferred

- Upcoming/"Starts Friday" teaser for not-yet-live deals — explicitly out of scope (Decision 1,
  SPEC Out of Scope).
- Auto-drop / `refetchInterval` when a schedule window closes mid-session — fetch-on-focus stays
  as-is; tracked separately in the existing
  `deal-005-mobile-expiry-refetch_NOTE_21-07-26.md` backlog note (filed during PLAN, unaffected by
  this phase).
- Multi-row admin authoring UX (admin still authors only one recurrence row per deal) — tracked in
  the existing `deal-005-one-window-per-deal_NOTE_20-07-26.md` backlog note.
- The Agent-Probe on-device walkthrough (AC5-AC7) — owed, not performed this session (see Test
  Gate Outcomes).

## Test Gate Outcomes

All gates independently re-confirmed by a spawned vc-tester during EXECUTE/EVL (execute-agent's own
report, taken at face value for this doc-only UPDATE PROCESS pass — no source changes made here):

| Gate | Result |
|---|---|
| `pnpm --filter @jojopotato/utils test deal-schedule-display` | 12/12 new, green |
| `pnpm --filter @jojopotato/ui test deal-card` | 4/4 new render assertions, green |
| `pnpm --filter @jojopotato/api test` (full regression incl. `branches.test.ts`, `orders.test.ts`, `deal-schedule.test.ts`) | 604/604, +3 new wire-shape assertions, 0 regressions |
| `pnpm typecheck` (api, utils, ui, mobile, admin — 5 packages) | clean |
| `pnpm format:check` | clean |

## Plan Deviations

None. Plan Update P1 (import shared `DealScheduleWindow` from `@jojopotato/types` instead of
duplicating it) was applied during VALIDATE, before EXECUTE started — not a mid-execution deviation.
Execute-Agent Instructions E1 (optional weekend-grouping test case) and E2 (defense-in-depth ternary
gate at the `branches.ts` call site) were both informational/non-blocking; no evidence either way
was surfaced to this UPDATE PROCESS pass, and neither affects gate outcomes.

## Test Infra Gaps Found

None new. AC5-AC7's Agent-Probe requirement is the same standing, already-tracked, project-wide
"no RN component/E2E runner" gap documented in `process/context/tests/all-tests.md` — not new debt
introduced by this phase.

## SPEC Achievement

| AC | Criterion | Status |
|---|---|---|
| AC1 | Recurring-schedule live deal shows correctly-grouped days+hours | **met** — Fully-Automated, `packages/utils` suite |
| AC2 | Absolute-only-window live deal shows "Available until …" | **met** — Fully-Automated |
| AC3 | Zero-row deal shows no annotation; wire field ABSENT not falsy | **met** — Fully-Automated (utils + api wire-shape) |
| AC4 | Manila wall-clock correctness across a UTC day-boundary crossing | **met** — Fully-Automated (boundary-crossing regression test) |
| AC5 | Deals tab list shows the annotation, light+dark | **met** — Agent-Probe, PASSED by the user (21-07-26). Nav-entry blocker fixed by commit `ab3d916` ("See all" entry on the Home header). |
| AC6 | Home strip shows the annotation, light+dark | **met** — Agent-Probe, PASSED by the user (21-07-26) |
| AC7 | Deal Details shows the annotation, light+dark | **met** — Agent-Probe, PASSED by the user (21-07-26) |
| AC8 | Multi-row union'd schedule produces sensible, non-throwing output | **met** — Fully-Automated |
| AC9 | No regression to regular menu / always-live deals (byte-identical) | **met** — Fully-Automated, full `packages/api` suite green |

**9/9 ACs met.** The NEW finding (AC5's list-screen entry point being missing) was fixed same-day
and its backlog note is now RESOLVED:
`process/features/admin-dashboard/backlog/deals-list-screen-no-nav-entry_NOTE_21-07-26.md`.

## Closeout Packet

1. **Selected plan path:** `process/features/admin-dashboard/completed/deal-005-mobile-surfacing_21-07-26/deal-005-mobile-surfacing_PLAN_21-07-26.md`
2. **Closeout classification:** Ready for UPDATE PROCESS archival — ✅ VERIFIED. CODE DONE + EVL-confirmed green + committed, AND the AC5-AC7 Agent-Probe walkthrough was performed and passed by the user this session (nav-entry blocker fixed by commit `ab3d916`).
3. **What was finished:** see What Was Done above, plus the "See all" nav-entry fix (`ab3d916`).
4. **Verified vs unverified:** All 9 ACs verified — 6 Fully-Automated (independently re-confirmed) + 3 Agent-Probe (AC5-AC7, user-performed and passed this session).
4b. **Validate-contract compliance:** Present, inline in the plan (`## Validate Contract`), Gate: PASS, `generated-by: outer-pvl`, dated 21-07-26.
5. **Cleanup done vs still needed:** Done this pass — phase report finalized, plan status stamped ✅ VERIFIED, `all-context.md` updated, backlog note marked RESOLVED, task folder archived to `completed/`, `vc-audit-context` run. Nothing outstanding for this plan.
6. **Single best next valid state:** DEAL-005 / issue #127 is now fully delivered (Phases 1, 2, 3 all ✅ VERIFIED). No immediate next phase for this feature; future work (multi-row admin authoring, mobile expiry refetch) is already tracked in backlog notes.
7. **Commit checkpoint:** Process commit belongs after this UPDATE PROCESS pass — plan/report/context/backlog doc changes plus the archival `git mv`; source (`f0685f9`) and the nav-entry fix (`ab3d916`) are already committed. Left uncommitted per the task instructions, for the user to commit.
8. **Regression status:** N/A — not a phase-program inter-phase step; the full `packages/api` regression suite (604/604) already re-confirms no regression to Phase 1/2's `deal_schedules` behavior or the write path.
9. **SPEC achievement:** see table above — 9/9 met.

Drift score: LOW (0-1 signals — doc-only reconciliation + archival pass touching 1 context file, 1
plan status line, 1 backlog note, 1 folder move; no `.claude/`/`.codex`/protocol files touched, no
harness change). `"UPDATE PROCESS available if you want."` — already running it now; no further
action beyond this session required.

## Forward Preview

### Test Infra Found

No new test infra this phase. Confirmed the standing "no RN component/E2E runner" gap remains the
correct explanation for AC5-AC7's Agent-Probe tier.

### Blast Radius Changes

Matches the plan's declared blast radius exactly (~10 files, `packages/api`/`packages/utils`/
`packages/types`/`packages/ui`/`apps/mobile`, no schema/migration). No expansion.

### Commands to Stay Green

```
pnpm --filter @jojopotato/utils test deal-schedule-display
pnpm --filter @jojopotato/api test branches
pnpm --filter @jojopotato/api test
pnpm --filter @jojopotato/ui test deal-card
pnpm typecheck && pnpm format:check
```

### Dependency Changes

None.

### New Finding — Orphaned Deals-Tab List Screen (Not Introduced By This Phase) — RESOLVED SAME DAY

While scoping the AC5 walkthrough, confirmed by grep that `apps/mobile/src/app/(tabs)/deals/index.tsx`
(the standalone Deals-tab list screen) has **no reachable navigation entry point** anywhere in the
app — `router.push('/(tabs)/deals')` appears only in code comments
(`deals/index.tsx:19`, `deals/_layout.tsx:4`), never in an actual call site. The Home tab's
"Deals & offers" strip (`(tabs)/index.tsx:191`) navigates directly to
`/(tabs)/deals/deal/[dealId]` (Deal Details), bypassing the list screen entirely. This is a
pre-existing navigation gap, not introduced by Phase 3 — filed as a backlog note (see SPEC
Achievement above). **Fixed same session** by commit `ab3d916` ("See all" entry added to the Home
tab's "Deals & offers" header, linking to `/(tabs)/deals`), which unblocked AC5 and allowed the
full walkthrough to be performed and passed. Backlog note marked RESOLVED.
