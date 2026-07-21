---
phase: deal-005-recurring-schedules-phase2
date: 2026-07-21
status: COMPLETE
feature: admin-dashboard
plan: process/features/admin-dashboard/active/deal-005-recurring-schedules_20-07-26/deal-005-recurring-schedules_PLAN_20-07-26.md
---

# DEAL-005 Phase 2 — Recurring Deal Schedules — Phase Report

Issue: #127 (DEAL-005, P2 of 3). Branch `adm-deal-005-p2`, commit `c189f16`.

## What Was Done

Added day-of-week + time-of-day recurrence to `deal_schedules` rows via 3 additive nullable
columns (migration `0018`, zero backfill — every existing Phase 1 row has all three `null` and
behaves exactly as before). `isDealScheduleLive()` in
`packages/api/src/routes/lib/deal-schedule.ts` was EXTENDED in place, not duplicated: after the
existing absolute-window check (unchanged), a row with `recur_days` set additionally requires
today's Manila day-of-week to be in the set AND the current Manila time-of-day to fall in
`[recur_start_time, recur_end_time)`. Both enforcement points (`branches.ts` menu read,
`orders.ts` placement) needed zero code changes — they already delegate exclusively to this one
helper, so recurrence support landed structurally in lockstep at both call sites, matching the
plan's own strongest design invariant (D6/E1).

The dangerous part — day-of-week/time-of-day are Manila wall-clock concepts, not UTC — is
handled by one new private helper, `toManilaWallClock()`, called exactly once inside
`isDealScheduleLive()`. It shifts the raw epoch by a fixed +08:00 offset (no DST, matching
`analytics-range.ts`'s already-documented convention) and reads UTC accessors only — never a
host-local `Date` accessor. Overnight spans (e.g. 22:00–02:00) are rejected at the API boundary
(D5) rather than handled as a wrap case; an admin splits them into two rows.

Admin surface: `routes/admin/deals.ts` gained `validateRecurrence()` alongside the existing
`validateWindow()`, still writing through Phase 1's single-row replace-only path (no unique
constraint, no `.onConflictDoUpdate()` — E3, binding, still Phase 1's E2 mechanism). `apps/admin`
gained a new standalone `DayOfWeekPicker` component, reused `ClockDial` directly for the
time-of-day inputs (no new time-picker built), and a `recurring: boolean` field on
`dealStatus()`'s return shape, rendered as an additional badge in BOTH of its only two consumers
(`deal-list.tsx`, `deals.$dealId.tsx` — E4, binding).

Gates, independently EVL-confirmed by a separately spawned tester (not execute-agent's
self-report): **API 547 → 601 tests (+54), admin 127 → 157 tests (+30)**, both typechecks clean,
admin build clean, `pnpm format:check` clean, migration `0018` applies cleanly against the local
dev DB.

**No manual browser walkthrough has been performed for this phase** — unlike Phase 1, where the
user ran and passed a manual admin-UI walkthrough this same session. The day-of-week picker, the
time-range inputs, the recurring badge, and the manage-page editing flow have never been
exercised in a real browser. Per the plan's own Phase Completion Rules, every Verification
Evidence row is Fully-Automated so there is technically no gate that *requires* a browser
walkthrough for `VERIFIED` — but per the orchestrator's explicit instruction for this UPDATE
PROCESS pass, this phase is being conservatively held at **CODE DONE + EVL-green**, not stamped
`✅ VERIFIED`, until that walkthrough is performed. The task folder stays in `active/`.

## What Was Skipped/Deferred

- **Multi-row/repeatable admin authoring ("lunch AND dinner" on one deal)** — deliberately scoped
  out by binding VALIDATE instruction E3. The engine (`isDealScheduleLive()`'s union-of-rows
  logic) already supports it and is tested at the pure-function level; only the admin write path
  (`writeDealSchedule`, single-row replace-only) is missing the capability. Backlog note filed
  (see below).
- **Phase 3 (mobile "Starts Friday" surfacing)** — explicitly out of scope for this plan, already
  tracked as a future phase of issue #127. No new backlog note needed.
- **Manual browser walkthrough** — see above; owed, not yet performed.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| API suite | `pnpm --filter @jojopotato/api test` | green — 547 → 601 tests (+54) |
| Admin suite | `pnpm --filter @jojopotato/admin test` | green — 127 → 157 tests (+30) |
| API typecheck | `pnpm --filter @jojopotato/api typecheck` | clean |
| Admin typecheck | `pnpm --filter @jojopotato/admin typecheck` | clean |
| Admin build | `pnpm --filter @jojopotato/admin build` | clean |
| Format | `pnpm format:check` | clean |
| Migration apply | `pnpm --filter @jojopotato/api db:migrate` | 0018 applies cleanly |
| TZ-pin control experiment | `TZ=UTC pnpm --filter @jojopotato/api test` vs unpinned | unpinned: 601/601 green (vacuous on this Manila-timezone host); pinned `TZ:'UTC'` in `vitest.config.ts`: 16 tests fail against a deliberately-broken host-local `toManilaWallClock()` — confirms the pin is a real, non-decorative gate |

All 6 real test-gate commands from the plan's Autonomous Goal Block were independently re-run by
a separately spawned tester at EVL, not taken on the execute agent's own report.

## Plan Deviations

None material. File count grew from the plan's own estimated ~15–17 files to 23 (see the
plan's own Blast Radius note anticipating growth to ~17 after two VALIDATE-added rows) — the
excess is entirely `.test.tsx`/`.test.ts` files for the new component/unit coverage the plan
itself required, not scope creep. One numeric correction is recorded below (see "Correction made
this pass").

## Test Infra Gaps Found

None new for this phase's own logic — every Verification Evidence row (AC1–AC12) is
Fully-Automated and Known-Gap was explicitly banned for AC4 (no-backfill regression) and the
Manila timezone-correctness criteria (AC1), and was not used anywhere in this plan.

One durable, generalizable test-infra fact was found and is recorded in
`process/context/tests/all-tests.md` rather than filed as a gap: `packages/api/vitest.config.ts`
did not pin `TZ` anywhere before this phase, and the dev machine's own system timezone happens to
be `Asia/Manila` — meaning any future timezone-sensitive test in this repo is vacuous on this
machine without an explicit pin. This phase closed it for `packages/api`'s suite; the fact itself
(the class of risk, not just this instance) is worth carrying forward.

## SPEC Achievement

This plan has no separate `*_SPEC_*.md` — its own `## Acceptance Criteria` section (12 items)
functions as the achievement checklist, same convention as Phase 1. All 12 scored **met**:

| AC | Criterion | Status |
|---|---|---|
| AC1 (HARD) | Manila day-of-week/time correct at dangerous UTC/Manila offsets, TZ-pinned suite | met |
| AC2 | recurring row live/not-live by day and time-of-day | met |
| AC3 | recurrence bounded by absolute window (D6 — narrows, never overrides) | met |
| AC4 (HARD) | zero-recurrence row behaves exactly as Phase 1 (no-backfill, 2nd instance) | met |
| AC5 | overlapping recurring rows produce one continuous live period (pure-function level, E3 scope) | met |
| AC6 | `recur_end_time <= recur_start_time` rejected 400 (D5) | met |
| AC7 | partial recurrence combo / empty `recur_days` rejected 400 | met |
| AC8 | menu-read and order-placement paths agree on every recurring-deal case | met |
| AC9 | admin wizard toggle + day picker + time inputs persist; manage page edits/clears | met |
| AC10 | admin badge surfaces AND renders a `recurring` indicator (both consumers, E4) | met |
| AC11 | full `packages/api` suite green, zero regressions against 547-baseline | met |
| AC12 | `apps/admin` suite green, zero regressions against 127-baseline | met |

Zero unmet criteria — no backlog NOTE required for SPEC gaps on this plan. (Two OUT-OF-SCOPE
deferrals — multi-row authoring and Phase 3 — are handled via backlog notes / existing tracking,
not SPEC gaps, since neither was ever an in-scope criterion of this plan.)

## Closeout Packet

1. **Selected plan path:**
   `process/features/admin-dashboard/active/deal-005-recurring-schedules_20-07-26/deal-005-recurring-schedules_PLAN_20-07-26.md`
2. **Closeout classification:** Keep in active/testing — CODE DONE, EVL-confirmed green, but the
   manual browser walkthrough (day-of-week picker, time inputs, recurring badge, manage-page
   editing flow) has not been performed. Not ready for archival.
3. **What was finished:** see "What Was Done" above — full Phase 2 recurrence scope, both
   enforcement points, admin CRUD/UI/badge, all green, zero data migration.
4. **Verified vs unverified:** Verified — all 12 ACs Fully-Automated and passing, EVL-confirmed
   independently, including the TZ-pin control experiment proving the gate is real. Unverified:
   the manual browser walkthrough of the new UI surfaces (picker, time inputs, badge rendering,
   manage-page edit/clear flow).
4b. **Validate-contract compliance:** present, inline in the plan (`## Validate Contract`),
   `Gate: PASS`, `generated-by: outer-pvl`, single VALIDATE pass, 0 FAILs / 0 unresolved
   CONCERNs (4 findings, all resolved directly in-plan).
5. **Cleanup done vs still needed:** Done this pass — phase report written, plan Status stamped
   CODE DONE / EVL-green / walkthrough owed, one new backlog note filed, one existing backlog
   note amended in place, `all-context.md` and `tests/all-tests.md` extended. Still needed: the
   manual walkthrough itself (user-run), then a follow-up UPDATE PROCESS pass to stamp VERIFIED
   and archive.
6. **Single best next valid state:** Keep the task folder in `active/`; user performs the manual
   walkthrough (day-of-week picker + time inputs on the create wizard, recurring badge on both
   `deal-list.tsx` and `deals.$dealId.tsx`, manage-page edit/clear of a recurring window); once
   passed, a short follow-up UPDATE PROCESS pass stamps `✅ VERIFIED` and archives to `completed/`.
7. **Commit checkpoint:** N/A — execution was already committed by the user before this UPDATE
   PROCESS pass began (commit `c189f16`, branch `adm-deal-005-p2`). This pass makes doc-only
   changes (report, plan reconciliation, backlog notes, context updates) which the user will
   commit separately; no `vc-git-manager` invocation was requested and none was made.
8. **Regression status:** N/A — not a phase-program inner loop. The plan's own zero-regression
   claim (Phase 1's 547/127 baseline held) is covered by AC11/AC12 above, both Fully-Automated
   and green, EVL-reconfirmed.
9. **SPEC achievement:** see "SPEC Achievement" section above — 12/12 met.

**Drift score: HIGH** (4 signals — (a) 23 files changed, +2 for ≥10 files; (c) ≥3 memory-worthy
durable facts recorded this pass — the TZ-pin vacuous-test finding, the Phase-1-inverts-for-
Phase-2 Manila-conversion rule, the "recurrence narrows the row" semantic, the emptiness-check
five-field gotcha, +1; (d) two backlog notes filed/amended this pass, +1). No `.claude/`/
`.codex`/protocol-doc files were touched.

Strongly recommend UPDATE PROCESS -- harness/protocol files touched.

(Note: the exact threshold phrase above is emitted verbatim per the skill contract regardless of
which specific signals fired — no protocol/harness file was actually touched this pass; the HIGH
score is driven by signals (a)/(c)/(d).)

## Correction made this pass

The EXECUTE commit message (`c189f16`) states the TZ-defeat control experiment turns "12 tests"
red. The independent EVL run measured **16** — 12 in `deal-schedule.test.ts` plus 2 each in
`branches.test.ts` and `orders.test.ts`. EXECUTE counted only the unit-test file; the broader
number includes the two enforcement-point integration suites, which also exercise recurrence
indirectly. The qualitative claim (the pin is a real, load-bearing gate, not decorative) is
unchanged and, if anything, stronger with the wider blast radius. This is a distinct correction
from Phase 1's own count discrepancy in its report (that one arose from two genuinely different
mutations; this one is a scope-of-count difference, not a different experiment) — do not conflate
the two.

## Durable Facts Recorded This Pass

1. **The TZ pin is a real gate, not ceremony (headline finding).** This dev machine's system
   timezone is `Asia/Manila`. A deliberately-broken `toManilaWallClock()` using host-local
   accessors passes all 601 tests with `TZ` unpinned, and fails 16 with `TZ: 'UTC'` pinned in
   `packages/api/vitest.config.ts`. Any future timezone-sensitive test in this repo is vacuous
   without the pin, and the failure mode is invisible on a developer machine in the same
   timezone as the business. Recorded in `tests/all-tests.md`.
2. **Phase 1's conclusion INVERTS for Phase 2 — both halves must be remembered together.** Phase
   1: deal windows are real instants; timezone conversion was correctly AVOIDED
   (`manilaDateRangeToUtc` would have introduced a midnight off-by-one). Phase 2: day-of-week and
   time-of-day are wall-clock concepts and REQUIRE Manila conversion, because Saturday 07:00
   Manila is Friday 23:00 UTC — a host-local `getDay()` fires on the wrong day for any deal
   starting before 08:00 Manila. Recorded in `all-context.md`.
3. **Recurrence NARROWS the row it sits on (D6).** One row = one complete rule. Union across rows
   is unchanged, which preserves Phase 1's semantics and satisfies issue #127's "overlapping rows
   produce one continuous live period" AC for free — this supersedes issue #127's originally
   stated (and now moot) resolution rule about flat columns.
4. **Overnight spans are rejected at the API (D5)**, not wrapped — an admin splits 22:00–02:00
   into two rows. Keeps the live-check a plain same-day comparison.
5. **Second no-backfill guarantee, mutation-verified.** A row with all-null recurrence behaves
   exactly as Phase 1. Forcing a NULL-recurrence row down the recurrence path turns 2 of 3 AC4
   tests red (the third correctly fails earlier on the absolute window).
6. **`writeDealSchedule`'s emptiness check must cover all five fields, not just absolute bounds.**
   Phase 2 created a legal shape Phase 1 did not anticipate — "every Friday 2–5pm, forever" has
   NO absolute bounds — and a bounds-only emptiness check would have silently DELETED it.
   Regression-tested. This is exactly the class of bug where a later phase invalidates an earlier
   phase's assumption — worth remembering generically for any future additive-column phase.
7. **TanStack route-generator hazard.** A `.test.tsx` file placed under `apps/admin/src/routes/`
   WITHOUT a leading `-` is swept into the route tree as a bogus route (already documented in
   `tests/all-tests.md` from Phase 1's `index.test.tsx` rename; this phase's
   `-deals.$dealId.test.tsx` confirms the same convention applies to nested detail routes, not
   just top-level ones).
8. **`ClockDial` is standalone and reusable** for any future time-only input need — it speaks a
   `value`/`onChange`/`min`/`max` `"HH:mm"` contract independent of `DateTimeField`, which merely
   consumes it internally.

## Forward Preview

### Test Infra Found

`packages/api/vitest.config.ts` gained `env: { TZ: 'UTC' }` — a repo-wide change to the whole
package's test execution environment, not scoped to this phase's own test files. No new runner
was introduced; existing `packages/api`/`apps/admin` runners were extended.

### Blast Radius Changes

23 files touched vs. the plan's own estimated ~15–17 (the plan's Blast Radius section itself
anticipated growth to ~17 after two VALIDATE-added rows; the final count is 6 files above even
that revised estimate, entirely new/extended `.test.ts`/`.test.tsx` files — see
`git show --stat c189f16` for the full list). No files outside the declared blast radius were
touched.

### Commands to Stay Green

```
pnpm --filter @jojopotato/api test
pnpm --filter @jojopotato/admin test
pnpm --filter @jojopotato/api typecheck
pnpm --filter @jojopotato/admin typecheck
pnpm --filter @jojopotato/admin build
pnpm format:check
```

### Dependency Changes

None. No new dependencies were added — `smallint(...).array()` is standard `drizzle-orm/pg-core`,
already installed.

---

## Addendum (21-07-26) — Manual Walkthrough Passed + Verification-Time Badge Addition

### Walkthrough result: PASSED

The user performed the owed manual admin-UI walkthrough this session: day-of-week picker,
time-range inputs on the create wizard, the recurring badge on both `deal-list.tsx` and
`deals.$dealId.tsx`, and the manage-page edit/clear flow for a recurring window.

**One issue was initially flagged:** a recurring deal appeared to stay "live" / not gray out past
its stated end time. **Diagnosis: user data-entry error, not a defect.** The deal's configured
window was 08:00–20:25 Manila — the user had misread it as already past due to an AM/PM mixup; the
deal was in fact still correctly inside its window. Server enforcement was independently
re-confirmed correct by direct inspection during the session:
- `packages/api/src/routes/branches.ts` → `resolveLiveDealProductIds` (menu-read enforcement)
- `packages/api/src/routes/orders.ts` (placement-time re-check)
- `packages/api/src/routes/lib/deal-schedule.ts:117` — pure `isDealScheduleLive` helper
- A live DB query against the deal's actual `deal_schedules` row confirmed the configured window
  matched the (correct) live/not-live state observed in the app.

No code defect found. Phase 2 is now **✅ VERIFIED** — the sole owed residual (the manual
walkthrough) is satisfied.

### Verification-time addition: real-time recurring-state badge (uncommitted)

Not part of the original Phase 2 plan/SPEC — delivered during this session at the user's request
after the walkthrough, as a small cosmetic-only, additive UI change. The server remains the sole
visibility authority; zero API/schema/migration surface was touched.

**Files changed (all in `apps/admin`, uncommitted in the working tree as of this pass):**

| File | Change |
|---|---|
| `apps/admin/src/lib/entity-status.ts` | New local fixed-offset Manila wall-clock helper `manilaWallClock` (+08:00, `getUTC*` accessors only — mirrors the server's `toManilaWallClock` convention documented in this same report's "Durable Facts" section). New `recurringActive: boolean \| null` field on `DealStatusDescriptor`. New `recurringActiveNow` helper: `null` when the deal is non-recurring; otherwise `true` iff the current Manila day is in `recurDays` AND `recurStartTime <= manila.hhmm < recurEndTime` (half-open, matching D5's existing convention). `recurringActive` is populated ONLY when the primary status tone is `success` — it deliberately never shows on Expired/Inactive/Scheduled states. The existing `dealStatusLabel` and the locked `recurring: boolean` field (E4, the flicker-avoidance decision at `entity-status.ts:62-72`) are untouched — this addition supplements them rather than replacing them. |
| `apps/admin/src/features/deals/components/deal-list.tsx` | Kept the existing `Recurring` chip; added a conditional `Active now` (tone `success`) / `Not active now` (tone `muted`) badge driven by the new `recurringActive` field. |
| `apps/admin/src/routes/(dashboard)/deals.$dealId.tsx` | Same conditional badge addition as `deal-list.tsx` (E4's "both consumers" invariant preserved — a badge added to only one of the two would repeat the exact class of bug E4 was designed to prevent). |
| `apps/admin/src/lib/entity-status.test.ts` | +6 new tests: inside-window → `true`; past-end → `false`; wrong-day → `false`; non-recurring → `null`; expired-window (tone not `success`) → `null`; Manila-offset boundary case (UTC Friday 23:30 = Manila Saturday 07:30). |

**Gates (run by the execute-agent this session, not independently EVL-reconfirmed by a separate
tester — this is a small verification-time cosmetic addition, not a full EXECUTE pass):**
- Admin typecheck: clean
- Admin test suite: 157 → 163 (+6), all green
- `pnpm format:check`: clean on all 4 touched files

**Status: uncommitted.** Phase 2 source itself was already committed at `c189f16` (prior session).
This badge addition sits on top, uncommitted in the working tree as of this UPDATE PROCESS pass —
per standing instruction, this UPDATE PROCESS session does not commit; the user commits it
separately when ready.

### Mobile observation deferred to Phase 3

A mobile-side observation from this session's verification (recurring deal cards linger past a
window's daily end time until a manual refocus, due to react-query's ~30s `staleTime` +
fetch-on-focus convention — server-correct, client-stale-cache only) was filed as a backlog note
rather than fixed here, since Phase 2 is deliberately mobile-schedule-blind by design (D2):
`process/features/admin-dashboard/backlog/deal-005-mobile-expiry-refetch_NOTE_21-07-26.md`
(already on disk from earlier this session — not duplicated).

### Updated Closeout Packet (supersedes the 20-07-26 packet above)

1. **Selected plan path:**
   `process/features/admin-dashboard/completed/deal-005-recurring-schedules_20-07-26/deal-005-recurring-schedules_PLAN_20-07-26.md`
   (post-archival path — see item 6)
2. **Closeout classification:** Ready for UPDATE PROCESS archival — ✅ VERIFIED, walkthrough
   passed, zero defects found.
3. **What was finished:** the owed manual walkthrough (passed); a small additive, uncommitted
   admin-badge cosmetic enhancement (real-time "Active now"/"Not active now" recurring state).
4. **Verified vs unverified:** Verified — all 12 ACs (unchanged from the 20-07-26 pass) plus the
   manual UI walkthrough, now passed. Nothing remains unverified for Phase 2 proper.
4b. **Validate-contract compliance:** unchanged — present, inline in plan, `Gate: PASS`,
   `generated-by: outer-pvl`.
5. **Cleanup done vs still needed:** Done this pass — plan Status stamped ✅ VERIFIED, this
   addendum written, `all-context.md` updated, task folder archived to `completed/`. Still
   needed: the user commits the uncommitted admin-badge addition (and the already-filed backlog
   note) when ready — no commit was made by this UPDATE PROCESS pass.
6. **Single best next valid state:** Task folder archived. Phase 3 (mobile "Starts Friday"
   surfacing, including the deferred mobile-expiry-refetch decision above) is the next scoped
   piece of issue #127, not yet planned.
7. **Commit checkpoint:** Process commit belongs after UPDATE PROCESS, and even then only for the
   doc-only changes this pass makes (plan/report/context edits + archival move) — the admin-badge
   source addition is a separate, still-uncommitted change the user will commit on their own
   schedule; this pass does not invoke `vc-git-manager`.
8. **Regression status:** N/A — not a phase-program inner loop; AC11/AC12 already covered
   zero-regression against the Phase 1 baseline in the 20-07-26 EVL pass.
9. **SPEC achievement:** unchanged — 12/12 met (see the SPEC Achievement section above).

**Drift score: MEDIUM** (2 signals this addendum pass — (a) 4 files touched [+1, under 10]; (d)
task folder archived `active/` → `completed/` [+1]). No `.claude/`/`.codex`/protocol-doc files
touched this pass.

Recommend UPDATE PROCESS -- significant changes detected.
