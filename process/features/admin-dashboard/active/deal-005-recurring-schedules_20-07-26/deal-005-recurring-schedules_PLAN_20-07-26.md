---
name: plan:deal-005-recurring-schedules-phase2
description: "DEAL-005 Phase 2 — day-of-week + time-of-day recurrence on deal_schedules rows, Manila-wall-clock-correct, additive on top of Phase 1's absolute window"
date: 20-07-26
feature: admin-dashboard
---

# DEAL-005 Phase 2 — Recurring Deal Schedules

Issue: [#127](https://github.com) (DEAL-005, P2). This plan covers **Phase 2 only** — day-of-week +
time-of-day recurrence on `deal_schedules` rows. Phase 3 (mobile surfacing) is explicitly out of
scope. Phase 1 (absolute `[starts_at, ends_at)` window, `deal_schedules` table, both enforcement
points) is DONE — see
`process/features/admin-dashboard/completed/deal-005-scheduled-deals_20-07-26/` — and is treated as
locked ground truth throughout this plan.

Branch: `adm-deal-005-p2` (already checked out — same branch Phase 1 landed on).

Date: 20-07-26
Status: **CODE DONE + EVL-green — NOT VERIFIED.** EXECUTE complete (commit `c189f16`), all 12 ACs
Fully-Automated and EVL-confirmed green by an independently spawned tester: API 547→601 (+54),
admin 127→157 (+30), both typechecks/build/format clean, migration `0018` applies cleanly. The
TZ-pin control experiment confirmed the `TZ:'UTC'` pin (E2) is a real, load-bearing gate (16 tests
fail against a deliberately-broken host-local implementation with the pin on; 0 fail with it off).
**No manual browser walkthrough has been performed** (day-of-week picker, time inputs, recurring
badge, manage-page edit/clear flow are all unexercised in a real browser) — per Phase Completion
Rules below, this phase stays in `active/`, not archived, until that walkthrough is done. See the
co-located `deal-005-recurring-schedules_REPORT_20-07-26.md` for full EXECUTE/EVL evidence.
Original VALIDATE status (unchanged, kept for history): VALIDATE complete (V1–V7, single pass) —
**Gate: PASS**. All findings resolved directly in this plan text (4 corrections + 5 binding
Execute-Agent Instructions — see `## Validate Contract` below).
Complexity: COMPLEX (additive schema change + a genuinely dangerous timezone bug class + two
server-authoritative enforcement points that must stay in lockstep + admin CRUD/UI/badge; money-adjacent surface)

## Overview

Add day-of-week + time-of-day recurrence to `deal_schedules` rows so an admin can express "Mon–Fri
2–5pm" (happy hour) or "weekends" without needing to hand-author a row per calendar occurrence.
Recurrence is **additive** on the existing table — no new table, no data migration for Phase 1's
existing (zero-or-one, non-recurring) rows. The single shared helper
(`isDealScheduleLive()`/`resolveLiveDealProductIds()` in `routes/lib/deal-schedule.ts`) that both
enforcement points already call is **extended in place**, not duplicated — this is the one property
that must survive this plan intact: the menu-read path and the order-placement path can never
independently re-derive recurrence logic.

## Decisions (locked with the user — do not re-litigate)

**D4 — Recurrence granularity: day-of-week + time-of-day only.**
Enough to express "Mon–Fri 2–5pm" and "weekends." No full calendar recurrence (RRULE), no
every-other-week, no nth-weekday-of-month. A row is either non-recurring (Phase 1 shape, absolute
window only) or recurring (day-of-week set + a single time-of-day range), never both — see the
schema shape below for how "single time-of-day range per row" composes with "multiple rows for
multiple time-ranges" (e.g. lunch AND dinner happy hour = two rows).

**VALIDATE correction (E3, binding — narrows scope, does not change any AC's underlying pass/fail
logic):** the "multiple rows for multiple time-ranges (e.g. lunch AND dinner happy hour = two
rows)" composition described above is a property of the TABLE SHAPE and of `isDealScheduleLive`'s
union-of-rows logic (already proven generically by Phase 1's own multi-row union tests) — it is
**NOT** a capability this plan's admin CRUD surface actually builds. The Implementation Checklist's
admin write path (step 3) extends Phase 1's existing single-row replace-only write
(`writeDealSchedule` — delete-then-insert ONE row per deal, never append), so there is no admin
UI/API mechanism in THIS plan to create a second independent recurring window for the same deal.
Building a real "lunch AND dinner" admin authoring flow (a repeatable schedule-row list, add/remove
UI, per-row validation across the set) is explicitly OUT OF SCOPE for this plan and is deferred to a
future phase — see AC5's corrected proving strategy in Verification Evidence below.

**D5 — Overnight spans are REJECTED at the API boundary.**
A recurring row's `recur_end_time` must be strictly after `recur_start_time` (string-compared as
zero-padded `"HH:mm"`, which sorts correctly). An admin wanting 22:00–02:00 creates two rows
(22:00–23:59 and 00:00–02:00, each on the appropriate day-of-week set). This keeps the live-check a
plain same-day comparison with no wrap case, and avoids "which calendar day does Saturday 01:00
belong to" ambiguity entirely. Enforced by `validateRecurrence()` in `deal-schedule.ts`, called from
both create and update, mirroring `validateWindow()`'s existing shape and call sites.

**D6 — Recurrence NARROWS the row it sits on; this supersedes issue #127's stated resolution rule.**
Issue #127 assumed flat recurrence columns would eventually be reconciled against flat window
columns on `products` — that assumption is moot because Phase 1 never shipped flat columns; it
shipped the `deal_schedules` table (D3, Phase 1's own locked decision). There is no flat window to
intersect with. Instead: recurrence columns are additive **on the same `deal_schedules` row** as the
absolute window, so one row means "within this absolute `[starts_at, ends_at)`, live only on these
days, only during this time-of-day range." A row's absolute bounds gate its recurrence, never the
reverse. Union-across-rows (Phase 1's existing semantic) is unchanged — this is also how issue
#127's own Phase 2 AC ("overlapping schedule rows produce one continuous live period") is satisfied:
two rows with adjacent day-of-week/time-of-day ranges simply both contribute to the union, exactly
as two non-recurring rows already do today (proven at the `isDealScheduleLive()` pure-function
level per the E3 scope note above, not through the admin CRUD surface).

## THE PRIMARY RISK — Manila wall-clock vs UTC instants (read before writing any code)

Phase 1 correctly concluded "store and compare real instants, never bucket by calendar day" — and
that conclusion **does not change** for the absolute `starts_at`/`ends_at` bounds, which stay
untouched by this plan. But day-of-week and time-of-day are inherently **wall-clock concepts in
Asia/Manila**, and the stored instant (`now = new Date()`) is UTC. Naively calling
`now.getDay()`/`now.getHours()` reads the **host machine's local timezone**, which is neither UTC
nor Manila — this would be wrong on every machine, not just some.

Concretely, from the issue's own framing: **Manila Saturday 07:00 is Friday 23:00 UTC.** A
day-of-week check computed carelessly from the raw UTC instant (or from host-local time on a
non-Manila host) fires on the wrong calendar day for every deal whose recurring window starts before
08:00 Manila. No error — the deal is simply live (or hidden) on the wrong day, silently.

**Fix, mandatory, lives in exactly one place:**

```ts
/** Manila is a fixed +08:00 offset, no DST (matches analytics-range.ts's own documented fact —
 *  the CONVENTION is reused here, the date-bucketing helper itself is NOT). */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Convert a UTC instant to its Manila wall-clock day-of-week (0=Sun..6=Sat, same convention
 *  as JS Date#getDay()) and "HH:mm" time-of-day. Pure arithmetic on the epoch + a fixed offset —
 *  never touches the host machine's local timezone, so this is correct on any host. */
function toManilaWallClock(instant: Date): { dayOfWeek: number; hhmm: string } {
  const shifted = new Date(instant.getTime() + MANILA_OFFSET_MS);
  const dayOfWeek = shifted.getUTCDay();
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  return { dayOfWeek, hhmm: `${hh}:${mm}` };
}
```

This lives in `packages/api/src/routes/lib/deal-schedule.ts` — the same file that already owns the
one place the absolute-window boundary is expressed (Phase 1's own documented rule) — and is called
exactly once, inside `isDealScheduleLive()`, before either enforcement point sees a result. Neither
`branches.ts` nor `orders.ts` may compute day-of-week or time-of-day themselves.
**VALIDATE independently re-derived and confirmed this arithmetic is correct** (verified from
scratch via `Date.UTC`/`getUTCDay`/`getUTCHours`/`getUTCMinutes` against the real 2026 calendar —
see the corrected offset table and the vacuous-test finding immediately below).

**`recur_start_time`/`recur_end_time` inclusivity, pinned to match D5 and Phase 1's own
convention:** half-open, `recur_start_time <= hhmm < recur_end_time`. Zero-padded `"HH:mm"` strings
compare correctly with plain `<`/`>=` (same trick `date-time-field.tsx` already documents and relies
on for its own bounds), so no `Date` construction is needed for the time-of-day comparison at all.
**VALIDATE confirmed this string-comparison claim directly**: 2-digit zero-padded `"HH:mm"` strings
sort lexicographically identically to numeric time-of-day ordering (`:` = char code 58, digits =
48–57, both fields fixed-width), so plain `<`/`>=` on the strings is correct with no edge case.

**Required test cases at the dangerous offsets (all Fully-Automated, in
`packages/api/src/routes/lib/__tests__/deal-schedule.test.ts`):**

| Case | UTC instant | Manila wall-clock | Asserts |
|---|---|---|---|
| Saturday-morning Manila / Friday-night UTC | `2026-07-24T23:00:00Z` | Sat 07:00 | `toManilaWallClock` returns `dayOfWeek: 6` (Sat), not 5 (Fri) |
| Sunday-just-after-midnight Manila / Saturday-afternoon UTC | `2026-07-25T16:30:00Z` | Sun 00:30 | `dayOfWeek: 0` (Sun), not 6 (Sat) |
| Exact Manila midnight rollover | `2026-07-18T15:59:59.999Z` vs `2026-07-18T16:00:00.000Z` | Sat 23:59:59.999 vs Sun 00:00:00.000 | day flips from 6→0 exactly at `16:00:00.000Z`, not one instant earlier or later |
| A recurring row using the Sat-07:00-Manila case above, with `recur_days:[6]`, `recur_start_time:"06:00"`, `recur_end_time:"09:00"` | `2026-07-24T23:00:00Z` | — | `isDealScheduleLive` returns `true` — this is the end-to-end regression that would silently fail if day-of-week were computed from the raw UTC instant instead of the Manila-shifted one |

**VALIDATE correction (P1/P2/P3, binding — the table above originally cited the WRONG literal ISO
instants for the first and third rows; independently re-derived from scratch against the real 2026
calendar via `Date.UTC(2026, 6, d)` day-of-week enumeration, and corrected in place above. The
second row was already correct and is unchanged.)** July 25, 2026 is a **Saturday** (not a Friday)
and July 19, 2026 is a **Sunday** (not a Saturday). The plan's ORIGINAL instants
(`2026-07-25T23:00:00Z` for row 1, `2026-07-19T15:59:59.999Z`/`2026-07-19T16:00:00.000Z` for row 3)
each land one calendar day off from their own stated labels: `2026-07-25T23:00:00Z` actually
Manila-shifts to **Sunday** 07:00 (not Saturday) — the SAME real-world Sat-UTC→Sun-Manila
transition as the (already-correct) second row, not the independent Fri→Sat transition the label
claimed — and the original row-3 instants actually flip **Sun→Mon**, not Sat→Sun. Concretely, row 4
as originally drafted (`recur_days:[6]` against the wrong `2026-07-25T23:00:00Z`) would have
asserted `true` for a computed `dayOfWeek` of `0` (Sun), not `6` (Sat) — the literal test as
originally drafted would FAIL against a CORRECT implementation, or worse, get "fixed" by miscoding
the day arithmetic to match the wrong expectation, silently reintroducing the exact
host-local-timezone bug this plan exists to prevent. Now corrected: row 1 uses `2026-07-24T23:00:00Z`
(a real Friday), row 3 uses `2026-07-18T15:59:59.999Z`/`2026-07-18T16:00:00.000Z` (a real Saturday),
row 4 uses the corrected row-1 instant. All four rows re-verified end-to-end against the exact
`toManilaWallClock` snippet above before this contract was written.

**VALIDATE finding (E2, binding — vacuous-test risk):** the local dev machine this VALIDATE pass ran
on has its SYSTEM timezone set to `Asia/Manila` (`timedatectl` confirms `Time zone: Asia/Manila
(PST, +0800)`), and no test infra anywhere in this repo pins `TZ` (`packages/api/vitest.config.ts`,
`test/setup-env.ts`, and `.github/workflows/ci.yml` were all checked directly — none set it). This
means a REGRESSION to a host-local implementation (`now.getDay()`/`now.getHours()` instead of the
fixed-offset `toManilaWallClock`) would ALSO pass every Manila-offset assertion above when run
locally on this exact machine — a false-positive green, because host-local time already equals
Manila time here. CI (`ubuntu-latest`, defaults to UTC) would likely still catch such a regression,
but the immediate local dev feedback loop would not, which is precisely the failure mode this
plan's own "Primary Risk" section warns about. Binding fix (E2 below): `packages/api/vitest.config.ts`'s
`test` block must set `env: { TZ: 'UTC' }` so the whole suite is pinned off the dev host's timezone —
see the new Touchpoints row and Execute-Agent Instruction E2.

## Schema shape

Extend `deal_schedules` (migration, `drizzle-kit generate` — expected `0018`, confirm the actual next
slot at EXECUTE time against `packages/api/drizzle/meta/_journal.json`, which shows `0017` as latest
as of this plan's writing). **VALIDATE confirmed live**: `_journal.json`'s last entry is
`{"idx": 17, "tag": "0017_curvy_baron_strucker"}` — `0018` is the correct next slot as of this
VALIDATE pass (20-07-26); re-confirm at EXECUTE in case of drift from other in-flight work.

```ts
// added to packages/api/src/db/schema/deal_schedules.ts, same table, additive columns:
recur_days: smallint('recur_days').array(),        // 0=Sun..6=Sat (JS Date#getDay() convention), nullable
recur_start_time: varchar('recur_start_time', { length: 5 }), // "HH:mm", nullable
recur_end_time: varchar('recur_end_time', { length: 5 }),     // "HH:mm", nullable, exclusive bound
```

**Legal combinations (enforced at the API boundary, not a DB CHECK — matches Phase 1's own
precedent of API-layer enforcement over DB constraints for this table):**
- All three `null` → non-recurring row, Phase 1 shape, absolute window only. Unchanged behavior.
- All three set → recurring row. `recur_days` must be a non-empty array of integers in `0..6`.
  `recur_start_time < recur_end_time` (D5, string-compared).
- Any partial combination (e.g. days set but no times, or one time but not the other) → rejected
  400 at the API boundary. This is a genuine new validation branch, not reused from Phase 1.

**Why array-typed `recur_days` is a new pattern in this schema (flagged, not silently introduced):**
no existing table in `packages/api/src/db/schema/` uses a native Postgres array column
(`grep -rn '\.array()' packages/api/src/db/schema/*.ts` returns nothing as of this plan —
**VALIDATE independently re-ran this exact grep and confirmed zero matches**). `smallint`
`.array()` is standard `drizzle-orm/pg-core` and needs no new dependency (**VALIDATE confirmed
`drizzle-orm`'s `pg-core/columns/smallint` module exists in the installed `drizzle-orm@0.45.2`**),
but this is the first use in this codebase — call this out explicitly in the schema file's doc
comment so a future reader does not assume it is an established convention being followed. Fallback
considered and rejected: a comma-separated `varchar` column would avoid the array type but would
push parsing/validation logic into every reader instead of letting Postgres and Drizzle type it
natively — array wins.

**Doc-comment requirement (binding, mirrors Phase 1's own load-bearing schema comment style):** the
`deal_schedules.ts` file's existing doc comment must be extended (not replaced) to document: the
Manila-wall-clock rule (with a pointer to `toManilaWallClock()` in `deal-schedule.ts`), the
half-open `recur_start_time <= t < recur_end_time` inclusivity, the legal-combination rule above,
and D5's overnight-span rejection.

## Enforcement points (same two as Phase 1 — no third path, no new call site)

Both enforcement points are **structurally unchanged** — they already call
`resolveLiveDealProductIds()` / `isDealScheduleLive()` and require zero edits, because the extension
happens entirely inside the shared helper's per-row live-check. This is the single strongest reason
D6 chose "recurrence narrows the row" over any design that would have needed a second, separate
recurrence check at either call site.

1. **Menu read path** — `packages/api/src/routes/branches.ts`, unchanged call site
   (`resolveLiveDealProductIds(db, productIds, new Date())`). **VALIDATE confirmed by direct read**:
   this call is inside the `if (isDealMenu && productIds.length)` block, immediately after the
   existing `resolveAvailableDealProductIds` MENU-003 check — structurally impossible to run on the
   regular-catalog path.
2. **Order-placement path** — `packages/api/src/routes/orders.ts`, unchanged call site
   (`resolveLiveDealProductIds(tx, ..., new Date())`). **VALIDATE confirmed by direct read**: this
   call runs on `tx`, immediately after the existing `resolveAvailableDealProductIds` component
   check and BEFORE any discount math or insert, so a rejection here rolls back the whole placement.

The only code that changes is inside `deal-schedule.ts`'s `isDealScheduleLive()` row-level check
function — see "Primary Risk" above for its exact shape. **VALIDATE re-confirmed via `grep` that
NEITHER `branches.ts` NOR `orders.ts` contains any independent day-of-week/time-of-day comparison
logic today** — both call sites exclusively delegate to `resolveLiveDealProductIds`, so the
"one shared helper" invariant this plan depends on is intact as of this VALIDATE pass and there is
no third comparison to find and remove.

## Touchpoints

| File | Change |
|---|---|
| `packages/api/src/db/schema/deal_schedules.ts` | Additive columns `recur_days`/`recur_start_time`/`recur_end_time` + doc-comment extension (see "Doc-comment requirement") |
| `packages/api/drizzle/0018_*.sql` (generated) | `drizzle-kit generate` output — do not hand-author; confirm actual next slot number at EXECUTE (confirmed `0018` as of this VALIDATE pass) |
| `packages/api/src/routes/lib/deal-schedule.ts` | `toManilaWallClock()` (new, private); extend `isDealScheduleLive()`'s per-row check to also test recurrence when present (see Primary Risk); add `validateRecurrence(days, startTime, endTime): string \| null` (new export, mirrors `validateWindow()`'s shape/rejection style) |
| `packages/api/src/routes/lib/__tests__/deal-schedule.test.ts` (existing, extend) | Manila-offset boundary cases (see CORRECTED table above), `isDealScheduleLive` recurrence cases, `validateRecurrence` cases |
| `packages/api/vitest.config.ts` (VALIDATE-added row — see E2) | Add `env: { TZ: 'UTC' }` to the `test` block — pins the whole `packages/api` vitest process off the dev host's `Asia/Manila` system timezone, so a host-local-Date regression in `toManilaWallClock` fails loudly regardless of which machine runs the suite (see "Primary Risk" vacuous-test finding) |
| `packages/api/src/routes/admin/deals.ts` | `createDealSchema`/`updateDealSchema` gain optional `recurDays: number[] \| null`, `recurStartTime: string \| null`, `recurEndTime: string \| null`; call `validateRecurrence` alongside the existing `validateWindow` call; the single-row write path (transactional select-then-branch/delete-then-insert, per Phase 1's Execute-Agent Instruction E2, still binding — no unique constraint, no `.onConflictDoUpdate()`) now also writes/replaces the recurrence columns on that same row. **Stays single-row-per-deal for this plan — see D4's VALIDATE correction (E3) and Execute-Agent Instruction E3: do not build a multi-row/repeatable admin write path here.** |
| `packages/api/src/lib/__tests__/admin-deals.integration.test.ts` (existing, extend) | New AC cases (see Verification Evidence) |
| `packages/api/src/routes/__tests__/branches.test.ts` (existing, extend) | Recurring-row live/not-live-by-day, live/not-live-by-time, absolute-window-still-gates-recurrence cases |
| `packages/api/src/routes/__tests__/orders.test.ts` (existing, extend) | Same recurrence cases at order placement (mirrors branches.test.ts, since both call the identical helper — confirms lockstep) |
| `packages/api/src/routes/lib/serializers.ts` | `AdminDealProduct`'s window sub-shape gains `recurDays: number[] \| null`, `recurStartTime: string \| null`, `recurEndTime: string \| null` — admin-only, same non-touch of `AdminProduct`/public `ApiDeal` as Phase 1 |
| `apps/admin/src/components/day-of-week-picker.tsx` (new) | Small toggle-button group, Sun–Sat, `value: number[]` / `onChange`, brutalist styling matching the existing `aria-pressed` toggle pattern already used by `date-time-field.tsx`'s stage toggle and time-preset chips. **VALIDATE confirmed no existing precedent** (`find apps/admin/src/components -iname "*day*"` returns nothing) — this is genuinely new, not a rename/extension of an existing component. |
| `apps/admin/src/features/deals/components/deal-create-wizard.tsx` | Step 1's existing "Schedule (optional)" fieldset gains a recurrence sub-section: `DayOfWeekPicker` + two `ClockDial` time-of-day inputs (reused directly — see "Time-of-day input" decision below), gated behind a toggle/checkbox ("Repeats weekly") so the common non-recurring case stays uncluttered |
| `apps/admin/src/routes/(dashboard)/deals.$dealId.tsx` | Manage page gains the same recurrence sub-section, wired to the existing `updateMutation.mutate({id, input:{...}})` shape. **VALIDATE-added scope (E4): also render the additive `recurring` badge/tag next to the existing status badge — see the new `deal-list.tsx` row below and Execute-Agent Instruction E4.** |
| `apps/admin/src/features/deals/lib/admin-deals-api.ts` | `DealCreateInput` gains `recurDays: number[] \| null`, `recurStartTime: string \| null`, `recurEndTime: string \| null` (flows into `DealUpdateInput` automatically, same `Partial<DealCreateInput>` mechanism as Phase 1) |
| `apps/admin/src/features/deals/components/deal-create-wizard.test.tsx` (existing, extend) | Recurrence toggle + day-picker + time inputs persist correctly, submit payload shape |
| `apps/admin/src/lib/entity-status.ts` | `dealStatus`'s `Scheduled`/`Live`/`Expired` badge — see "Badge" decision below |
| `apps/admin/src/features/deals/components/deal-list.tsx` (VALIDATE-added row — see E4) | Render an additional small badge (e.g. a second `<StatusBadge tone="neutral">Recurring</StatusBadge>`) alongside the existing status badge in the `status` column when `dealStatus(d).recurring` is `true`. **Without this, `recurring: boolean` is computed correctly by the pure function and passes its own unit test, but is never visible anywhere in the running admin UI — AC10 would be proven at the unit level while being false in practice.** `deal-list.tsx` and `deals.$dealId.tsx` are the ONLY two places `dealStatus()` is currently consumed (`grep -rln "dealStatus" apps/admin/src` — confirmed exhaustive), so both must be updated together. |
| `apps/admin/src/components/day-of-week-picker.test.tsx` (new) | Toggle rendering + value contract |

## Time-of-day input — recommendation, not left open

`DateTimeField` is date-and-time coupled (its value contract is a single `"YYYY-MM-DDTHH:mm"`
string) — it is the wrong component for a bare time-of-day input and should NOT be extended to
support a "time-only" mode; that would widen an already load-bearing, heavily-documented value
contract for a use case it was never designed around. **Recommendation: reuse `ClockDial` directly**
(`apps/admin/src/components/clock-dial.tsx`) — it already speaks the exact `"HH:mm"` value contract
this plan needs, already supports `min`/`max` bounds (usable to enforce "end time after start time"
interactively, on top of the hard server-side D5 rejection), and is the same component
`DateTimeField` uses internally for its own time stage. No new time-picker component is needed; only
a new `DayOfWeekPicker` for the day-of-week multi-select, which has no existing precedent.
**VALIDATE independently confirmed** this recommendation by direct read of `clock-dial.tsx`: its
documented VALUE CONTRACT is "`value`/`onChange` speak a 24-hour `"HH:mm"` string," and `min`/`max`
are both accepted as `"HH:mm"` — an exact match, no adapter needed. This finding is treated as
already-verified per the orchestrator's brief and is not re-litigated here.

## Admin badge — recommendation, not left open

`windowPhase()`/`dealStatus()` in `entity-status.ts` currently derive `Scheduled`/`Live`/`Expired`
purely from the absolute `[startAt, endAt]` bounds. **Recommendation: do NOT attempt to make the
badge recurrence-accurate to the minute.** A deal that is in its absolute window but outside today's
recurring hours (e.g. it's Tuesday and the deal only runs Fri–Sun) should still read `Live` on the
badge — recomputing `Scheduled`/`Expired` per-minute against the recurrence would be misleading (the
deal isn't "Scheduled" in the traditional sense, it's just currently outside its recurring hours,
and will be live again in a few hours without any admin action). Instead: add a new, distinct fourth
label — `Recurring` — shown whenever a deal's window has `recur_days` set, layered as an ADDITIONAL
badge/tag next to (not replacing) the existing absolute-window-derived `Scheduled`/`Live`/`Expired`
label. This is additive to `dealStatus()`'s return shape (an optional `recurring: boolean` alongside
the existing `label`/`tone`), not a new branch in the existing phase derivation — `windowPhase()`
itself needs zero changes. **VALIDATE confirmed by direct read of `entity-status.ts`** that
`dealStatus()` currently returns exactly `{ label, tone }` (the `StatusDescriptor` interface) with no
other fields, so adding an optional `recurring?: boolean` is a genuinely additive, non-breaking
change to that return shape. **See Touchpoints and Execute-Agent Instruction E4 for the mandatory
UI-rendering wiring this recommendation requires but the original Touchpoints table omitted.**

## Public Contracts

- **`GET /branches/:id/menu?isDeal=true`** — response shape UNCHANGED (D2 from Phase 1, still in
  force: hidden, not annotated). Only the row *set* changes further (a recurring deal's visibility
  now also depends on day-of-week/time-of-day, on top of Phase 1's absolute-window filtering).
- **`POST /orders`** — no request-shape change. The existing window-closed rejection message now
  also fires for a recurring deal outside its current occurrence — same `OrderError(400, ...)`
  shape, no new error code needed (message text may be reused verbatim; this plan does not require
  distinguishing "absolute window closed" from "outside today's recurring hours" in the error text,
  since both mean the same thing to the customer: this deal isn't orderable right now).
- **`POST /api/admin/deals`, `PATCH /api/admin/deals/:id`** — additive optional
  `recurDays`/`recurStartTime`/`recurEndTime` in both request body and response. Same
  optionality/nullability convention as Phase 1's `startsAt`/`endsAt`.
- **Customer-facing wire contracts stay frozen** — `GET /deals`, `GET /deals/:id`,
  `GET /api/branches/:id` remain untouched and out of scope, same as Phase 1 (still legacy `offers`
  table reads, confirmed unrelated to deal-products).

## Blast Radius

- **Packages touched:** `packages/api` (schema, 1 lib file extended, 1 route file, serializers, 1
  vitest config), `apps/admin` (3 feature files, 1 new shared component + test, 1 shared lib file).
- **Risk class:** additive, non-destructive schema migration (new nullable columns) on a
  money-adjacent surface (deal visibility/orderability gating, same class as Phase 1) — medium risk,
  same classification as Phase 1. No auth/billing/secrets/public-API-breaking surface.
- **File count:** ~17 files (7 modified/new in `packages/api` incl. tests and the vitest config fix,
  3 new + 4 modified/new in `apps/admin` incl. tests — see Touchpoints table for the authoritative
  list; grew from the plan's original ~15-file estimate by 2 files after VALIDATE added the
  `vitest.config.ts` TZ fix and the `deal-list.tsx` badge-rendering row).
- **Zero behavior change for every existing (Phase 1, non-recurring) `deal_schedules` row** — the
  three new columns are `null` on every row that predates this plan, and the schema shape's "all
  three null → non-recurring, absolute-window-only" rule is a strict superset of Phase 1's existing
  behavior, verified via explicit regression tests (see Verification Evidence).

## Implementation Checklist

Ordered so the migration lands before anything reads the new columns.

1. **Schema first.** Extend `packages/api/src/db/schema/deal_schedules.ts` with the three additive
   nullable columns + the doc-comment extension (Manila rule, half-open recurrence inclusivity,
   legal-combination rule, D5 overnight rejection, the "first array column in this schema" note).
   Run `pnpm --filter @jojopotato/api db:generate` to produce migration `0018_*` (confirm actual next
   slot against `_journal.json` at execution time — `0018` confirmed correct as of this VALIDATE
   pass; do NOT hardcode if drift occurred). Do NOT hand-author the SQL. Run
   `pnpm --filter @jojopotato/api db:migrate` locally.
   - Verify: migration file exists, `_journal.json` has the new entry, local migrate succeeds with
     zero errors, existing Phase 1 rows unaffected (all three new columns `null`).
2. **Pin the test-suite timezone (E2, new step — VALIDATE finding).** Add `env: { TZ: 'UTC' }` to
   `packages/api/vitest.config.ts`'s `test` block, BEFORE writing any Manila-offset test — this
   neutralizes the fact that the dev host's own system timezone is `Asia/Manila`, which would
   otherwise let a host-local-Date regression pass silently on this exact machine.
   - Verify: `pnpm --filter @jojopotato/api test` still passes for the pre-existing suite after this
     config change (a TZ pin must not break any unrelated test that assumed the default TZ).
3. **Manila wall-clock helper + recurrence validation.** In `deal-schedule.ts`, add
   `toManilaWallClock()` (private) and `validateRecurrence(days, startTime, endTime): string | null`
   (exported, mirrors `validateWindow`'s shape). Extend `isDealScheduleLive()`'s per-row check: after
   the existing absolute-window check (unchanged), if the row has `recur_days` set, additionally
   require `toManilaWallClock(now).dayOfWeek` is in `recur_days` AND
   `recur_start_time <= hhmm < recur_end_time`. Rows with all-three-null recurrence columns skip this
   branch entirely (existing Phase 1 behavior, byte-identical).
   - Verify: all cases in the CORRECTED "Required test cases at the dangerous offsets" table above
     pass (use the corrected ISO instants — `2026-07-24T23:00:00Z` for row 1,
     `2026-07-18T...` for row 3/4, NOT the plan's originally-drafted values);
     `validateRecurrence` rejects partial combos, empty `recur_days`, and `start >= end`; existing
     Phase 1 `isDealScheduleLive` tests (absolute-window-only rows) remain green unmodified — explicit
     regression assertion, not just "still passes."
4. **Admin API — create/update.** Extend `createDealSchema`/`updateDealSchema` with the three
   optional recurrence fields, call `validateRecurrence` (in addition to the existing `validateWindow`
   call, both must pass), and extend the existing single-row transactional select-then-branch write
   (Phase 1's binding E2 mechanism — do not add a unique constraint, do not use
   `.onConflictDoUpdate()`) to also persist/clear the recurrence columns on that same row. Clearing a
   window (setting recurrence + absolute bounds all to `null`/omitted) continues to delete the row
   entirely, same as Phase 1. **Stays single-row (E3, binding) — do not build a multi-row admin
   write path in this step.**
   - Verify: create-with-recurrence persists all 5 window-related columns; update replaces
     recurrence independently of absolute bounds and vice versa (each is independently
     settable/clearable on the merged-state read-then-write, mirroring Phase 1's existing
     `startsAt`/`endsAt` merge logic); partial recurrence combo → 400; `recurStartTime >=
     recurEndTime` → 400.
5. **Menu + order-placement enforcement — confirm zero code change needed.** No route-file edits are
   required (see "Enforcement points" above, VALIDATE-confirmed by direct read) — this step is a
   verification-only checklist item: run the full existing `branches.test.ts`/`orders.test.ts`
   Phase 1 suites unmodified and confirm 0 regressions, THEN add the new recurring-row test cases
   (day-not-listed → hidden/rejected, time-outside-range → hidden/rejected, day-and-time-match →
   visible/orderable, absolute-window-still-gates-recurrence → a recurring row outside its absolute
   `[starts_at, ends_at)` stays hidden even during its recurring hours).
   - Verify: all new cases pass in both `branches.test.ts` and `orders.test.ts` (both must agree —
     this proves the "same shared helper, both call sites" invariant holds).
6. **Serializer.** Add `recurDays`/`recurStartTime`/`recurEndTime` to the admin deal-product window
   sub-shape in `serializers.ts`, resolved alongside the existing `startsAt`/`endsAt` fields.
   - Verify: response shape assertion test, all three `null` when no recurrence set.
7. **Admin badge.** Extend `dealStatus()`'s return shape with an additive `recurring: boolean` field
   (per "Admin badge" recommendation above) — no change to `windowPhase()` or the existing
   `Scheduled`/`Live`/`Expired` label derivation. **Then wire the UI (E4, binding, new sub-step):**
   render an additional small badge/tag in BOTH `deal-list.tsx`'s `status` column AND
   `deals.$dealId.tsx`'s detail-page badge area when `recurring` is `true` — this sub-step did not
   exist in the plan's original Implementation Checklist and is required for AC10 to be true in the
   running app, not just in a unit test.
   - Verify: new unit test asserting `recurring: true` when `recurDays` is present, `false`
     otherwise, layered against each existing `dealStatus` branch (inactive, no-branches, active);
     new component-test assertions in `deal-list.tsx`'s and `deals.$dealId.tsx`'s test files
     confirming the second badge renders/doesn't render based on `recurring`.
8. **`DayOfWeekPicker` component.** New `apps/admin/src/components/day-of-week-picker.tsx` —
   Sun–Sat toggle buttons, `value: number[]`/`onChange`, brutalist `aria-pressed` styling matching
   the existing toggle pattern in `date-time-field.tsx`.
   - Verify: new component test — renders 7 toggles, click toggles membership in `value`, controlled
     component (no internal state divergence from `value` prop).
9. **Admin UI — wizard Step 1.** Add a "Repeats weekly" toggle to the existing Schedule fieldset in
   `deal-create-wizard.tsx`; when on, reveal `DayOfWeekPicker` + two `ClockDial` time-of-day inputs
   (Starts/Ends time-of-day), submitting `recurDays`/`recurStartTime`/`recurEndTime` only when the
   toggle is on and all three are filled.
   - Verify: component test — toggle off omits all 3 recurrence fields from the POST payload; toggle
     on with all 3 filled includes them; inline validation message for `endTime <= startTime` before
     submit (client-side UX affordance on top of the hard server-side D5 rejection).
10. **Admin UI — manage page.** Mirror step 9 in `deals.$dealId.tsx`, wired to the existing
    `updateMutation.mutate({id, input:{...}})` shape, pre-filling the toggle/picker/times from an
    existing recurring row (grandfathering — an existing recurring row's days/times always populate
    correctly even if edited later against different bounds, same grandfathering spirit as
    `DateTimeField`'s own documented rule, though enforced here by simply reading the stored values
    rather than needing a bounds-exemption mechanism).
    - Verify: component test — existing recurrence pre-fills the toggle/picker/times; edits PATCH
      correctly; clearing recurrence (toggle off + save) sends `recurDays: null` etc.
11. **Full regression pass.** Run the complete `packages/api` and `apps/admin` suites, both
    typechecks, `pnpm format:check`.
    - Verify: all green, zero regressions in either suite (Phase 1's 547/127 baseline must not drop),
      no new lint/format issues.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `toManilaWallClock` correct at Manila-Saturday-07:00 (Friday UTC) instant — CORRECTED instant `2026-07-24T23:00:00Z` | Fully-Automated | AC1 (Manila day-of-week correctness) |
| `toManilaWallClock` correct at Manila-Sunday-00:30 (Saturday-afternoon UTC) instant | Fully-Automated | AC1 |
| `toManilaWallClock` day flips exactly at 16:00:00.000Z, not one instant off — CORRECTED instants `2026-07-18T15:59:59.999Z` / `2026-07-18T16:00:00.000Z` | Fully-Automated | AC1 |
| End-to-end `isDealScheduleLive` correct using the CORRECTED Manila-Saturday-07:00 case (`2026-07-24T23:00:00Z`) as a full row | Fully-Automated | AC1 (regression proof, not just the unit helper) |
| Test suite is TZ-pinned to `UTC` in `vitest.config.ts` (not the dev host's `Asia/Manila`), so a host-local-Date regression cannot pass vacuously | Fully-Automated | AC1 (vacuous-test-risk mitigation, VALIDATE finding E2) |
| Recurring row live inside its hours on a listed day | Fully-Automated | AC2 |
| Recurring row NOT live outside its hours on a listed day | Fully-Automated | AC2 |
| Recurring row NOT live on an unlisted day (even during its hours) | Fully-Automated | AC2 |
| Recurring row bounded by its absolute window — outside `[starts_at, ends_at)`, dead even during its recurring hours | Fully-Automated | AC3 (D6 — recurrence narrows, never overrides) |
| Zero-recurrence row (all 3 columns null) behaves exactly as Phase 1 — explicit non-vacuous regression | Fully-Automated | AC4 (no-backfill guarantee, second instance) |
| Overlapping recurring rows produce one continuous live period, proven via `isDealScheduleLive()` called directly with 2 manually-constructed recurring `DealScheduleWindow` rows — NOT via the admin CRUD surface, which this plan intentionally limits to one recurrence rule per deal (see D4 VALIDATE correction E3) | Fully-Automated | AC5 (issue #127 Phase 2 AC) |
| `recur_end_time <= recur_start_time` rejected 400 at admin API boundary | Fully-Automated | AC6 (D5 overnight-span rejection) |
| Partial recurrence combo (days without times, or times without days) rejected 400 | Fully-Automated | AC7 |
| Empty `recur_days` array rejected 400 | Fully-Automated | AC7 |
| Menu-read path and order-placement path agree on a recurring deal (both hide/reject the same case) | Fully-Automated | AC8 (both enforcement points share one helper) |
| Admin wizard "Repeats weekly" toggle + day picker + time inputs persist correctly; manage page edits/clears them | Fully-Automated (component test) | AC9 |
| Admin badge surfaces a `recurring` indicator, rendered in BOTH `deal-list.tsx` and `deals.$dealId.tsx` (VALIDATE-added rendering requirement, E4) — without corrupting existing Scheduled/Live/Expired derivation | Fully-Automated (unit + component test) | AC10 |
| Full `packages/api` suite green, zero regressions (547-baseline holds) | Fully-Automated | AC11 |
| `apps/admin` suite green, zero regressions (127-baseline holds) | Fully-Automated | AC12 |

Known-Gap is BANNED for every row above — this is the correctness core (Manila timezone
correctness + visibility/orderability gating on a money-adjacent surface) and every criterion is
achievable as a real Fully-Automated test against the shared helper and the two existing enforcement
points, none of which require a running browser or live provider.

## Test commands

- `pnpm --filter @jojopotato/api test` (needs local Postgres migrated to the new slot — confirm via
  `pnpm --filter @jojopotato/api db:migrate`; native Postgres per project memory, not docker, unless
  `docker compose up -d` is confirmed necessary at EXECUTE time)
- `pnpm --filter @jojopotato/admin test`
- `pnpm --filter @jojopotato/api typecheck`
- `pnpm --filter @jojopotato/admin typecheck`
- `pnpm format:check`

## Test Infra Improvement Notes

- **New this VALIDATE pass:** `packages/api/vitest.config.ts` gains `env: { TZ: 'UTC' }` (see E2).
  This is a repo-wide test-infra change (applies to every `packages/api` vitest suite, not only
  `deal-schedule.test.ts`) — worth a one-line mention in a future `all-tests.md` update during
  UPDATE PROCESS, since it changes the baseline execution environment for the whole package's test
  suite going forward (all existing tests use explicit `Z`-suffixed ISO instants, so this is not
  expected to break anything, but it is a real environment change worth recording).

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/features/admin-dashboard/active/deal-005-recurring-schedules_20-07-26/deal-005-recurring-schedules_PLAN_20-07-26.md`
2. **Last completed phase or step:** VALIDATE complete (V1–V7, single pass). All Manila-offset test
   instants, the write-path/AC5 scope question, and the admin-badge rendering gap were independently
   verified and resolved directly in this plan file. Gate: PASS.
3. **Validate-contract status:** written — **PASS** (20-07-26).
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`,
   Phase 1's plan + report
   (`process/features/admin-dashboard/completed/deal-005-scheduled-deals_20-07-26/`), plus this
   VALIDATE pass's direct reads of every touched/reused source file: `packages/api/src/routes/lib/deal-schedule.ts`,
   `packages/api/src/db/schema/deal_schedules.ts`, `packages/api/src/routes/admin/deals.ts`,
   `packages/api/src/routes/{branches,orders}.ts` (call sites), `packages/api/src/routes/lib/serializers.ts`,
   `packages/api/src/routes/lib/__tests__/deal-schedule.test.ts`, `packages/api/vitest.config.ts`,
   `packages/api/test/setup-env.ts`, `packages/api/drizzle/meta/_journal.json`,
   `packages/api/src/routes/admin/lib/analytics-range.ts`, `apps/admin/src/lib/entity-status.ts`,
   `apps/admin/src/components/clock-dial.tsx`, `apps/admin/src/components/date-time-field.tsx`,
   `apps/admin/src/features/deals/components/{deal-create-wizard,deal-list}.tsx`,
   `apps/admin/src/routes/(dashboard)/deals.$dealId.tsx`, `apps/admin/src/features/deals/lib/admin-deals-api.ts`,
   plus a full `Date.UTC`-based re-derivation of the plan's own "dangerous offset" test instants
   against the real July 2026 calendar (`node -e` runs, not taken on trust) and a host `timedatectl`
   check confirming the dev machine's own system timezone is `Asia/Manila`. Confirmed live: latest
   drizzle migration on disk is `0017`, so `0018` is correct; no existing `.array()` column
   precedent; no existing `DayOfWeekPicker`-shaped component; `dealStatus()` is consumed in exactly
   two places (`deal-list.tsx`, `deals.$dealId.tsx`).
5. **Next step for a fresh agent:** the mechanical EXECUTE gate is satisfied (`Gate: PASS` present in
   this file). Orchestrator may route to EXECUTE on explicit "ENTER EXECUTE MODE". EXECUTE starts at
   Implementation Checklist step 1 (schema) and MUST follow Execute-Agent Instructions E1–E5 below —
   they are binding, not optional guidance. In particular: use the CORRECTED test instants in the
   "Required test cases at the dangerous offsets" table (not any earlier/cached version of this
   plan), and complete step 2 (TZ pin) before writing any Manila-offset assertion.

## Acceptance Criteria

Mirrors the Phase-2 subset of issue #127's checklist plus this plan's own explicit dangerous-offset
requirement:

1. Day-of-week/time-of-day recurrence is computed correctly against Asia/Manila wall-clock time,
   proven at the dangerous UTC/Manila-day-boundary offsets (Saturday-morning-Manila/Friday-night-UTC,
   Sunday-just-after-midnight-Manila/Saturday-afternoon-UTC, and the exact 16:00:00.000Z rollover
   instant) — not just at safe midday offsets. **Proven using the VALIDATE-corrected literal
   instants, and pinned against a non-Manila test-runner TZ so a host-local implementation bug
   cannot pass vacuously (see E2).**
2. A recurring row is live inside its hours on a listed day; not live outside its hours on a listed
   day; not live on an unlisted day.
3. Recurrence is bounded by the row's absolute `[starts_at, ends_at)` window — outside that window, a
   recurring row is dead even during its recurring hours.
4. A row with no recurrence set (all 3 new columns null) behaves exactly as Phase 1 — explicit
   non-vacuous regression test.
5. Overlapping recurring rows produce one continuous live period (issue #127 Phase 2 AC), proven at
   the `isDealScheduleLive()` pure-function level with two directly-constructed rows — the admin CRUD
   surface in this plan supports only ONE recurrence rule per deal (see D4/E3).
6. `recur_end_time <= recur_start_time` is rejected at the admin API boundary (D5).
7. A partially-specified recurrence (days without times, times without days, or an empty day set) is
   rejected at the admin API boundary.
8. Both enforcement points (menu query, order placement) agree on every recurring-deal case tested —
   proven by mirrored test cases in both suites, not asserted by code inspection alone.
9. Admin wizard "Repeats weekly" toggle + day picker + time inputs persist correctly; the deal manage
   page edits and clears them.
10. Admin list badge surfaces a `recurring` indicator without corrupting the existing
    Scheduled/Live/Expired derivation, AND that indicator is actually rendered in both the deal list
    and the deal manage page (see E4) — not merely computed by the pure derivation function.
11. Full `packages/api` suite green, zero regressions against the Phase 1 baseline (547 tests).
12. `apps/admin` suite green, zero regressions against the Phase 1 baseline (127 tests).

## Phase Completion Rules

- **CODE DONE**: all Implementation Checklist steps complete, all automated gates green (see Test
  commands), zero regressions in either suite.
- **VERIFIED**: CODE DONE, plus every Verification Evidence row's Fully-Automated test is real and
  passing (Known-Gap banned per this plan's own gate table — no row may be silently downgraded to
  Known-Gap during EXECUTE). Since every Phase-2 gate is Fully-Automated, there is no separate
  Agent-Probe walkthrough gating VERIFIED for this plan (same posture as Phase 1) — VERIFIED is
  reached purely by EVL-confirmed automated evidence.
- Do not mark this plan `✅ VERIFIED` without EVL-confirmed (independently re-run, not
  execute-agent's own report) green gates.

**UPDATE PROCESS pass (20-07-26): CODE DONE + EVL-green confirmed, holding at that status —
NOT stamped ✅ VERIFIED.** All EVL evidence above is real and independently confirmed. The plan
stays deliberately conservative here: even though every Verification Evidence row is
Fully-Automated (so no gate technically *requires* a browser pass), the new admin UI surfaces
(day-of-week picker, time inputs, recurring badge, manage-page edit/clear) have never been
exercised in a real browser. Task folder remains in `active/`. Next step: user performs the
manual walkthrough, then a short follow-up UPDATE PROCESS pass stamps `✅ VERIFIED` and archives
to `completed/`. See `deal-005-recurring-schedules_REPORT_20-07-26.md` for full detail.

## Validate Contract

Status: PASS
Date: 20-07-26
date: 2026-07-20
generated-by: outer-pvl

Parallel strategy: sequential (single structured pass)
Rationale: signal score 3/7 (S2 admin API + additive schema surface touched; S5 orchestrator
explicitly requested a focused, evidence-based fan-out across 7 named risk areas — read as a depth
request; S7 ~17-file blast radius) — MEDIUM by count, which would normally recommend parallel
subagents. This VALIDATE session has no Agent/Task tool available (Read/Bash/Write only, same
constraint as Phase 1's own VALIDATE pass), so the Layer 1 (4 dimensions) and Layer 2 (per-section
feasibility) roles were executed as a single structured pass backed entirely by direct source reads,
`find`/`grep` verification, and independent `node -e` arithmetic re-derivation of the plan's own
Manila-offset test instants — not inference, and not a rubber-stamp of the plan's own claims. Every
enforcement-point, file-path, timezone-arithmetic, and write-path-scope claim below was
independently re-checked against the live tree or recomputed from scratch.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | `toManilaWallClock`/`isDealScheduleLive` correct at the dangerous Manila/UTC day-boundary offsets, using CORRECTED instants, TZ-pinned suite | Fully-Automated | `packages/api/src/routes/lib/__tests__/deal-schedule.test.ts` — new cases (corrected table) | B |
| AC2 | recurring row live/not-live by day and time-of-day | Fully-Automated | `deal-schedule.test.ts` + `branches.test.ts` + `orders.test.ts` — new cases | B |
| AC3 | recurrence bounded by absolute window (D6) | Fully-Automated | `deal-schedule.test.ts` — new case | B |
| AC4 (HARD, Known-Gap banned) | zero-recurrence row behaves exactly as Phase 1 (no-backfill, 2nd instance) | Fully-Automated | `deal-schedule.test.ts` — new explicit regression case | B |
| AC5 | overlapping recurring rows produce one continuous live period, proven at the pure-function level (admin CRUD stays single-row per E3) | Fully-Automated | `deal-schedule.test.ts` — new 2-row union case | B |
| AC6 | `recur_end_time <= recur_start_time` rejected 400 | Fully-Automated | `admin-deals.integration.test.ts` — new case | B |
| AC7 | partial recurrence combo / empty `recur_days` rejected 400 | Fully-Automated | `admin-deals.integration.test.ts` — new cases | B |
| AC8 | menu-read and order-placement paths agree on every recurring-deal case | Fully-Automated | `branches.test.ts` + `orders.test.ts` — mirrored new cases | B |
| AC9 | admin wizard toggle + day picker + time inputs persist; manage page edits/clears | Fully-Automated (component test) | `deal-create-wizard.test.tsx` + a manage-page edit case (co-located with `deals.$dealId.tsx`) | B |
| AC10 | admin badge surfaces + RENDERS a `recurring` indicator (derivation AND UI, per E4) | Fully-Automated (unit + component test) | `apps/admin/src/lib/entity-status.test.ts` + `deal-list.tsx`/`deals.$dealId.tsx` component-test assertions | B |
| — | test suite TZ-pinned off the Asia/Manila dev host (vacuous-test-risk mitigation) | Fully-Automated | `packages/api/vitest.config.ts` `env: { TZ: 'UTC' }` + `pnpm --filter @jojopotato/api test` passing under that pin | B |
| AC11 | full `packages/api` suite green, zero regressions against 547-baseline | Fully-Automated | `pnpm --filter @jojopotato/api test` | A |
| AC12 | `apps/admin` suite green, zero regressions against 127-baseline | Fully-Automated | `pnpm --filter @jojopotato/admin test` | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle, pre-existing suite)
- B — fixed in this plan (gate added by this plan's Implementation Checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: every `strategy` value above is `Fully-Automated`. Known-Gap is never used — AC4
and the timezone-correctness criteria (both explicitly banned from Known-Gap by this plan's own
Verification Evidence section) are honored as real Fully-Automated gates, and every other AC follows
the same standard.

Failing stubs (Fully-Automated rows, new-test rows only — B-resolution):
```
test("should return the correct Manila day-of-week/time at the corrected Fri-23:00Z-to-Sat-07:00-Manila boundary", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC1 (corrected instant 2026-07-24T23:00:00Z)") })
test("should return the correct Manila day-of-week/time at the Sat-16:30Z-to-Sun-00:30-Manila boundary", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC1") })
test("should flip Manila day-of-week from 6 to 0 exactly at 2026-07-18T16:00:00.000Z, not one instant off", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC1 (corrected instants)") })
test("should return true for isDealScheduleLive on a Sat-only recurring row at the corrected Sat-07:00-Manila instant (2026-07-24T23:00:00Z)", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC1 end-to-end regression") })
test("should be live inside its hours on a listed day and not live outside its hours or on an unlisted day", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC2") })
test("should stay dead outside the absolute window even during recurring hours", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC3") })
test("should behave exactly as Phase 1 when all 3 recurrence columns are null", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC4 no-backfill regression") })
test("should treat two overlapping recurring rows as one continuous live period", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC5") })
test("should reject recurEndTime <= recurStartTime with 400", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC6") })
test("should reject a partial recurrence combo or an empty recurDays array with 400", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC7") })
test("should agree between the menu-read path and order-placement path on every recurring-deal case", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC8") })
test("should persist the Repeats-weekly toggle, day picker, and time inputs from wizard Step 1 and the manage-page edit form", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC9") })
test("should compute recurring:true/false correctly and render a Recurring badge in both deal-list and deal-manage screens", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC10") })
```

Legacy line form (retained so existing validate-contract consumers still parse):
- `packages/api` deal-schedule recurrence read/write/enforcement paths: Fully-automated: `pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test`
- `apps/admin` wizard/manage/badge UI: Fully-automated: `pnpm --filter @jojopotato/admin test`
- Typechecks: Fully-automated: `pnpm --filter @jojopotato/api typecheck && pnpm --filter @jojopotato/admin typecheck`
- Formatting: Fully-automated: `pnpm format:check`

Dimension findings:
- Infra fit: PASS — no container/infra/runtime/port surface touched; additive nullable-column
  migration via the standard `drizzle-kit generate` flow (confirmed `0018` is the correct next
  migration slot, latest on disk is `0017`); standard Express route + admin React form edits, no
  new service.
- Test coverage: CONCERN found and RESOLVED directly in this plan — the "Required test cases at the
  dangerous offsets" table's literal ISO instants for rows 1 and 3 did NOT match their own stated
  calendar-day labels for July 2026 (independently re-derived via `Date.UTC` day-of-week
  enumeration and `toManilaWallClock` arithmetic — see the inline correction in "THE PRIMARY RISK"
  section). As originally drafted, this is the single highest-value defect this VALIDATE pass could
  have found: it is the plan's own primary-risk mitigation, Known-Gap-banned, and would either fail
  against a correct implementation or (worse) get "fixed" by miscoding the day arithmetic to match
  the wrong expectation — silently reintroducing the exact host-local-timezone bug the plan exists
  to prevent. Corrected in place. Additionally found: the dev host's own system timezone is
  `Asia/Manila` with no `TZ` pin anywhere in the test infra, which would let a host-local-Date
  regression pass vacuously on local runs even with correctly-labeled test instants — resolved via
  a new binding `TZ: 'UTC'` pin (E2). All 12 ACs correctly tiered Fully-Automated, Known-Gap
  explicitly banned for AC4 and the timezone-correctness criteria and honored (no Known-Gap used
  anywhere in this plan).
- Breaking changes: PASS — `GET /branches/:id/menu?isDeal=true` response shape unchanged (only the
  row-set filtering narrows further); admin API changes are additive-optional fields only,
  mirroring Phase 1's exact optionality convention; `GET /deals`/`GET /deals/:id`/
  `GET /api/branches/:id` remain untouched (unrelated legacy `offers`-table routes, confirmed again
  by Phase 1's own already-verified finding, not re-litigated).
- Security surface: PASS — no auth/billing/secrets/trust-boundary surface touched. Admin routes
  inherit `requireAdmin` via the existing append-only `/api/admin` aggregator (unchanged pattern).
  The recurrence check is server-side and unconditional inside the existing enforcement points —
  nothing client-supplied can bypass it.
- Schema feasibility (`deal_schedules` additive columns + migration): PASS — `smallint(...).array()`
  confirmed available in the installed `drizzle-orm@0.45.2`; confirmed zero existing `.array()`
  column precedent in this schema (re-ran the plan's own cited `grep` and got the same zero-match
  result); migration slot `0018` confirmed correct against the live `_journal.json`.
- Enforcement-points feasibility (branches.ts + orders.ts): PASS — independently re-confirmed via
  `grep` that neither file contains any independent day-of-week/time-of-day comparison logic today;
  both call sites exclusively delegate to `resolveLiveDealProductIds`/`isDealScheduleLive`, so the
  "one shared helper, both call sites" invariant this plan depends on is intact and there is no
  hidden third comparison to find.
- Admin API / write-path feasibility (create/update): CONCERN found and RESOLVED via a binding
  scope-narrowing correction (E3) — the plan's own Decisions section (D4) illustrates "lunch AND
  dinner happy hour = two rows" as a supported authoring pattern, and Verification Evidence's
  original AC5 row ("overlapping recurring rows produce one continuous live period") implied this
  is provable through real admin use. But the Touchpoints table and Implementation Checklist
  explicitly extend Phase 1's SINGLE-ROW replace-only write path (`writeDealSchedule` — delete-then-
  insert one row per deal, never append) with no repeatable-row admin UI anywhere in scope — so
  there is no way for a real admin user to actually create a second independent recurring window
  for the same deal via this plan's build. This was an internal contradiction between the plan's
  illustrative prose and its actual specified implementation, not a subtle judgment call. Resolved
  by explicitly narrowing D4's "two rows" example to a table-shape/pure-function property (already
  proven generically by Phase 1's own multi-row union test) rather than an admin-buildable
  capability in this plan, and by re-scoping AC5's proving mechanism to `isDealScheduleLive()`
  called directly with 2 constructed rows. A real "lunch AND dinner" admin authoring flow (repeatable
  schedule-row list UI) remains a legitimate future capability but is out of scope here — this keeps
  the plan's own ~15–17 file blast-radius estimate honest rather than silently growing it.
- Admin badge feasibility (`entity-status.ts` + rendering): CONCERN found and RESOLVED via a binding
  Touchpoints addition (E4) — the plan's "Admin badge" section correctly proposes an additive
  `recurring: boolean` field on `dealStatus()`'s return shape, and the Implementation Checklist
  correctly adds a unit test for the derivation function. But the ORIGINAL Touchpoints table never
  listed `deal-list.tsx` or `deals.$dealId.tsx` — the only two consumers of `dealStatus()` in the
  entire `apps/admin` tree (`grep -rln "dealStatus" apps/admin/src` confirms exactly these two files
  and nothing else) — as needing any change. As originally scoped, `recurring: true` would be
  correctly COMPUTED and pass its own unit test while being INVISIBLE in the actual running admin
  UI, which would make AC10 ("admin list badge surfaces a recurring indicator") true at the unit
  level and false in practice. Resolved by adding both consumer files to Touchpoints with an
  explicit second-badge rendering requirement.
- Admin UI feasibility (`ClockDial` reuse, `DayOfWeekPicker` new component): PASS — `ClockDial`'s
  documented value contract (`"HH:mm"` string, `min`/`max` in the same format) is an exact match for
  this plan's time-of-day input need, independently re-confirmed by direct read (matches the
  orchestrator's brief, which flagged this as already-verified — not re-litigated further). No
  existing `DayOfWeekPicker`-shaped component exists (`find apps/admin/src/components -iname
  "*day*"` returns nothing), so this is genuinely new, correctly flagged as such in the plan.

Open gaps: none unresolved. Four findings surfaced during this VALIDATE pass — all four were
resolved directly in this plan text (corrected test-case table + TZ pin + write-path scope
narrowing + admin-badge Touchpoints addition) with 5 binding Execute-Agent Instructions (E1–E5)
below. No Known-Gap rows exist in this contract; no FAIL was found in any dimension.

What this coverage does NOT prove:
- AC1–AC10 gates prove the DB-level recurrence logic (window/day/time filtering, admin CRUD, badge
  derivation) is correct against a real Postgres instance with the exact schema shape described,
  and against the exact corrected UTC instants in this plan. They do not prove the mobile app
  surfaces any recurrence-related messaging — Phase 3 (out of scope) owns that.
- This VALIDATE pass independently recomputed the plan's own Manila-offset test literals from
  scratch and confirmed the corrected values are internally consistent with the `toManilaWallClock`
  arithmetic. It does NOT (and cannot, since the new code does not exist yet) prove the new AC1–AC12
  test cases themselves pass once written — that proof happens at EXECUTE/EVL, against the real new
  code. In particular, VALIDATE has confirmed the ARITHMETIC and the TEST FIXTURE VALUES are correct
  together; it has not run the eventual `toManilaWallClock`/`isDealScheduleLive` implementation.
- No adversarial/concurrency probe was run against the new recurrence check (e.g. a recurring window
  closing in the exact instant between the targeted lookup and the order insert, inside the same
  transaction) — this mirrors Phase 1's own accepted precedent (unlocked, non-`FOR UPDATE` reads)
  and is not treated as a new gap.
- E3's scope-narrowing means this plan does NOT prove (and does not attempt to prove) that a real
  admin can configure two independent recurring windows for one deal through the actual admin UI —
  only that the underlying union-of-rows logic is correct when constructed directly in a test. A
  future phase would need its own plan/AC set to build and prove the multi-row admin authoring flow.

Gate: PASS (0 FAILs, 0 unresolved CONCERNs — 4 findings identified during this VALIDATE pass, all
resolved directly in this plan text: 3 objective test-instant/config corrections applied directly
[test-case table, TZ pin] and 2 design ambiguities/contradictions converted into binding
Execute-Agent Instructions with matching Touchpoints/Implementation-Checklist edits [E3 write-path
scope, E4 badge rendering]. No FAIL was found in any dimension or enforcement-point check.)

## Execute-Agent Instructions

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | `toManilaWallClock()` must be defined ONCE, inside `deal-schedule.ts`, and called EXACTLY ONCE — inside `isDealScheduleLive()`'s per-row recurrence check. Neither `branches.ts` nor `orders.ts` may compute day-of-week or time-of-day themselves, and no second Manila-offset helper may be added anywhere else. This mirrors Phase 1's own E1 (never re-derive a boundary check at a call site) and is re-stated here as binding for the recurrence extension specifically, since it is the plan's single highest-value invariant. | Implementation Checklist step 3 |
| E2 | `packages/api/vitest.config.ts`'s `test` block MUST set `env: { TZ: 'UTC' }` (or any non-`+08:00` zone) BEFORE any Manila-offset assertion is written or considered complete. The dev host this VALIDATE pass ran on has its system timezone set to `Asia/Manila`; without this pin, a regression to a host-local-Date implementation (`now.getDay()`/`now.getHours()`) would pass every Manila-offset test vacuously on that machine, because host-local time already equals Manila time there. Confirm the full existing `packages/api` suite still passes after adding this pin (it should — every existing test uses explicit `Z`-suffixed ISO instants). | Implementation Checklist step 2 (new step, run before step 3) |
| E3 | The admin write path for `deal_schedules` recurrence (`admin/deals.ts` create/update) MUST remain single-row replace-only (delete-then-insert one row per deal, per Phase 1's still-binding E2 — no unique constraint, no `.onConflictDoUpdate()`). Do NOT build a multi-row/repeatable-schedule-row admin UI or API in this plan, even though D4's illustrative prose mentions "lunch AND dinner = two rows" — that composition is a property of the table shape and the `isDealScheduleLive()` union logic, not a capability this plan's admin surface builds. AC5 (overlapping recurring rows) is proven by calling `isDealScheduleLive()` directly with 2 manually-constructed rows in `deal-schedule.test.ts`, never through the admin CRUD surface. A real multi-row admin authoring flow is a legitimate future phase, not this one. | Implementation Checklist step 4 |
| E4 | When adding the `recurring: boolean` field to `dealStatus()`'s return shape (`entity-status.ts`), BOTH `apps/admin/src/features/deals/components/deal-list.tsx` and `apps/admin/src/routes/(dashboard)/deals.$dealId.tsx` MUST render an additional small badge/tag (e.g. a second `<StatusBadge tone="neutral">Recurring</StatusBadge>` alongside the existing status badge) when `recurring` is `true`. These are the ONLY two consumers of `dealStatus()` in `apps/admin` (confirmed exhaustively via `grep -rln "dealStatus" apps/admin/src`) — the pure-function unit test alone does not satisfy AC10 if neither UI consumer is updated to read the new field. | Implementation Checklist step 7 |
| E5 (informational, non-blocking, carried from Phase 1's E3) | `windowPhase()` in `entity-status.ts` still uses a closed-at-`endAt` boundary (`t === endAt` reads "active"), one instant different from the half-open `[starts_at, ends_at)` semantics this plan's recurrence check enforces at the server. This divergence is unchanged from Phase 1, is cosmetic-only (admin badge display, not enforcement), and no AC in this plan tests the badge at the exact boundary instant. No code change required. | Implementation Checklist step 7, awareness only |

## Plan Updates Applied

| # | What changed | Where in plan | Why |
|---|---|---|---|
| P1 | Corrected the "Saturday-morning Manila / Friday-night UTC" dangerous-offset test instant: `2026-07-25T23:00:00Z` → `2026-07-24T23:00:00Z` | "THE PRIMARY RISK" section, required test cases table | Independently re-derived: July 25, 2026 is a Saturday (not a Friday) in the UTC calendar; the original instant actually Manila-shifts to Sunday 07:00, not Saturday 07:00 as labeled |
| P2 | Corrected the "exact Manila midnight rollover" instants: `2026-07-19T15:59:59.999Z`/`2026-07-19T16:00:00.000Z` → `2026-07-18T15:59:59.999Z`/`2026-07-18T16:00:00.000Z` | "THE PRIMARY RISK" section, required test cases table | Independently re-derived: July 19, 2026 is a Sunday (not a Saturday); the original instants actually flip Sunday→Monday, not Saturday→Sunday as labeled |
| P3 | Corrected the end-to-end regression case's instant to match P1's correction (`2026-07-24T23:00:00Z`) so `recur_days:[6]` genuinely asserts `true` | "THE PRIMARY RISK" section, required test cases table (row 4) | As originally drafted, this row would have asserted `true` for a `dayOfWeek` that actually computes to `0` (Sun), not `6` (Sat) — a self-contradictory, load-bearing test literal |
| P4 | Added a new Touchpoints row: `packages/api/vitest.config.ts` — `env: { TZ: 'UTC' }` | Touchpoints table, Implementation Checklist (new step 2), Verification Evidence | The dev host's own system timezone is `Asia/Manila` and no test infra pins `TZ` anywhere — a host-local-Date regression would pass vacuously on local runs without this pin |
| P5 | Added D4 scope-narrowing annotation + re-scoped AC5's proving mechanism to the pure-function level; added Execute-Agent Instruction E3 | Decisions (D4), Verification Evidence (AC5 row), Acceptance Criteria (item 5), Touchpoints (`admin/deals.ts` row), Implementation Checklist (step 4) | The plan's D4 prose ("lunch AND dinner = two rows") and original AC5 wording implied a real admin-buildable multi-row capability, but the actual specified write path is single-row replace-only — an internal contradiction, not a subtle open question |
| P6 | Added Touchpoints rows for `deal-list.tsx` and amended `deals.$dealId.tsx`'s row; added Execute-Agent Instruction E4; added a UI-rendering sub-step to Implementation Checklist step 7 | Touchpoints table, Implementation Checklist (step 7), Verification Evidence (AC10 row), Acceptance Criteria (item 10) | The original plan added `recurring: boolean` to `dealStatus()`'s return shape but never listed either of its two real UI consumers as needing a change — as scoped, the flag would compute correctly and pass its unit test while never being visible in the running app |

## Autonomous Goal Block

SESSION GOAL: Ship DEAL-005 Phase 2 — day-of-week + time-of-day recurrence on `deal_schedules` rows,
computed against Asia/Manila wall-clock time via a single shared, fixed-offset helper
(`toManilaWallClock()`), extending Phase 1's absolute `[starts_at, ends_at)` window additively with
zero data migration and zero behavior change for every existing non-recurring row. Both enforcement
points (menu read, order placement) must stay in lockstep via the one shared `isDealScheduleLive()`
helper. Admin CRUD/UI/badge support included; the admin write path stays single-recurrence-rule-
per-deal in this plan (E3) — a real multi-row "lunch AND dinner" authoring flow is deferred.
Charter + umbrella plan: N/A — single COMPLEX plan, not part of a formal phase program (the
`admin-dashboard_14-07-26` 8-phase program is separately COMPLETE and does not govern this work;
this is Phase 2 of a small, informally-sequenced DEAL-005 issue thread, not a `vc-generate-phase-program` umbrella).
Autonomy: standard RIPER-5 autonomy rules — all 4 CONCERNs from this VALIDATE pass were already
resolved in-plan (corrected test instants, TZ pin, write-path scope narrowing via E3, admin-badge
rendering via E4); EXECUTE requires explicit "ENTER EXECUTE MODE" per plan-lifecycle.md;
irreversible/outward-facing actions (migration apply against a shared dev DB, any
production-adjacent step) require explicit confirmation before running.
Hard stop conditions / safety constraints:
- AC4 (zero-recurrence row behaves exactly as Phase 1) and the Manila-offset timezone-correctness
  criteria (AC1) must be proven by real, passing Fully-Automated tests using the CORRECTED literal
  instants in this plan — Known-Gap is explicitly banned for both.
- `packages/api/vitest.config.ts` MUST pin `TZ: 'UTC'` (Execute-Agent Instruction E2) before any
  Manila-offset test is considered complete — the dev host's own system timezone is Asia/Manila.
- Both enforcement points (menu query, order placement) MUST call the same shared
  `isDealScheduleLive()` helper (Execute-Agent Instruction E1) — never two independently
  re-derived boundary checks, and `toManilaWallClock()` must be called exactly once.
- Do NOT build a multi-row/repeatable admin write path for `deal_schedules` recurrence in this plan
  (Execute-Agent Instruction E3) — stays single-row replace-only, matching Phase 1's E2.
- When adding `recurring: boolean` to `dealStatus()`, BOTH `deal-list.tsx` and `deals.$dealId.tsx`
  MUST render the new badge (Execute-Agent Instruction E4) — they are the only two consumers.
- Do NOT add a unique constraint on `deal_schedules.deal_product_id` (Phase 1's E2, still binding).
- Do NOT add window/recurrence fields to any public/customer-facing wire contract (`GET /deals`,
  `GET /deals/:id`, `GET /branches/:id/menu`'s deal-product shape, `GET /api/branches/:id`) — D2 is
  locked; Phase 3 owns the customer-facing contract change if it ever happens.
- No schema change to `products`; recurrence lives exclusively on the existing `deal_schedules` table.
- Work lands on `adm-deal-005-p2` (already checked out) — do not create a new branch.
Test gates: `pnpm --filter @jojopotato/api test` (needs local Postgres migrated to `0018`),
`pnpm --filter @jojopotato/admin test`, `pnpm --filter @jojopotato/api typecheck`,
`pnpm --filter @jojopotato/admin typecheck`, `pnpm format:check` — all must be green before EXECUTE
reports done; EVL independently re-runs all five before UPDATE PROCESS.
Validate contract: inline in this plan file (see `## Validate Contract` above). Gate: PASS.
Next phase: EXECUTE — Gate: PASS confirmed (VALIDATE, single pass, 20-07-26). Awaiting explicit
"ENTER EXECUTE MODE". EXECUTE starts at Implementation Checklist step 1 (schema) and must honor
Execute-Agent Instructions E1–E5 above as binding, not advisory — in particular, use the CORRECTED
test-case table in "THE PRIMARY RISK" section, not any earlier cached version of this plan.

## Codebase-vs-issue corrections found during PLAN

1. **Issue #127's Phase 2 text does not mention the `deal_schedules` table at all** — it was written
   before Phase 1's D3 decision (build the table now, not flat columns). Phase 2 as scoped by the
   issue ("A recurring-window table for deals that repeat... Phase 1's columns become the 'one
   non-recurring window' case; decide at Phase 2 planning whether they are absorbed into the table or
   kept as a fast path") is **already resolved by Phase 1 having built the table from the start** —
   there is no absorption decision left to make; this plan only adds recurrence columns to the
   already-existing table. Recorded as D6 above.
2. **The issue's "reuse the Asia/Manila analytics timezone convention" instruction is directly
   dangerous if followed literally a second time.** Phase 1 already found and documented that
   `manilaDateRangeToUtc` is a date-only calendar-day bucketing helper and must not be reused for
   real-instant comparisons. Phase 2 inverts the risk in the OTHER direction: here, wall-clock
   day-of-week/time-of-day genuinely IS the concept needed (unlike Phase 1's absolute window, which
   correctly avoided any Manila-specific handling) — so this plan reuses only the fixed-+08:00-offset
   FACT documented in `analytics-range.ts`, via a new, narrowly-scoped `toManilaWallClock()` helper,
   never `manilaDateRangeToUtc` itself (which buckets to whole days and would be actively wrong here).
   **VALIDATE independently confirmed `analytics-range.ts`'s own doc comment states the fixed +08:00,
   no-DST fact verbatim, and confirmed this plan never imports `manilaDateRangeToUtc`.**
