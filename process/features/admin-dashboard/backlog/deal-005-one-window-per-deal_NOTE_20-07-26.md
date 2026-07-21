---
name: note:deal-005-one-window-per-deal
description: "Admin can author only one recurring schedule rule per deal — the write path is single-row replace-only even though the engine supports multiple union'd rows"
date: 20-07-26
feature: admin-dashboard
---

# Admin can author only one recurring schedule per deal (DEAL-005 Phase 2 scope gap)

**Status:** accepted gap, filed by DEAL-005 Phase 2 (issue #127). Not a defect — a deliberate
scope narrowing applied during VALIDATE (binding Execute-Agent Instruction E3).

## TL;DR

`isDealScheduleLive()` correctly evaluates MANY `deal_schedules` rows per deal and unions their
results — proven at the pure-function level with two directly-constructed rows. But the admin
write path (`writeDealSchedule` in `packages/api/src/routes/admin/deals.ts`) still replaces a
SINGLE row per deal (delete-then-insert, no unique constraint, no `.onConflictDoUpdate()` — the
same mechanism Phase 1 established and Phase 2 kept unchanged). So an admin can author "Mon–Fri
2–5pm" but **cannot** author "lunch AND dinner" (e.g. 11am–1pm AND 5pm–7pm) on the same deal
through the admin UI — even though the underlying engine would union them correctly if two rows
existed.

## Why this happened

The plan's own Decisions section (D4) used "lunch AND dinner happy hour = two rows" as an
illustrative example of the table shape's composability. VALIDATE found this created an internal
contradiction: the Touchpoints table and Implementation Checklist only ever extended Phase 1's
existing single-row write path — there was no repeatable-row admin UI/API anywhere in the plan's
actual scope. Rather than silently growing the blast radius mid-VALIDATE to build a real
multi-row authoring flow, the plan was corrected (E3) to explicitly narrow D4's "two rows" claim
to a table-shape/pure-function property, and AC5 ("overlapping recurring rows produce one
continuous live period") was re-scoped to prove that property by calling
`isDealScheduleLive()` directly with two manually-constructed rows, not through the admin CRUD
surface.

## What would be needed to close this

- A repeatable schedule-row editor in the admin UI (add/remove rows, not a single toggle+picker).
- A set-based write path (`writeDealSchedule` → something like `writeDealSchedules(rows[])`) that
  replaces the whole set atomically per deal, still with no unique constraint blocking legitimate
  multiple rows.
- Per-row validation (each row independently valid per `validateWindow`/`validateRecurrence`) plus
  cross-row validation if any is desired (e.g. warn on identical/overlapping day+time ranges,
  though this is not strictly required — overlap is harmless, just redundant).

## References

- Plan: `process/features/admin-dashboard/active/deal-005-recurring-schedules_20-07-26/deal-005-recurring-schedules_PLAN_20-07-26.md`
  — Decisions (D4), Execute-Agent Instruction E3, Verification Evidence (AC5 row)
- Issue: #127 (DEAL-005, Phase 2 AC — "overlapping schedule rows produce one continuous live
  period" — satisfied at the engine level, not yet at the authoring level)
- Engine proof: `packages/api/src/routes/lib/__tests__/deal-schedule.test.ts` — 2-row union case
