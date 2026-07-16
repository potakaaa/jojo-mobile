---
phase: staff-005-pickup-code
date: 2026-07-15
status: COMPLETE_WITH_GAPS
feature: staff-dashboard
plan: process/features/staff-dashboard/active/staff-005-pickup-code_15-07-26/staff-005-pickup-code_PLAN_15-07-26.md
---

# STAFF-005 (PUP-002) Pickup Code Lookup — EXECUTE Report

## What Was Done

All 8 checklist items implemented exactly per plan (2 files added, 4 modified):

1. **`packages/api/src/routes/staff.ts`** — added `GET /orders/lookup` handler, registered
   immediately AFTER `/orders/completed` and BEFORE `/orders/:orderId` (E2). Uses the single
   combined WHERE filter `and(eq(orders.branch_id, branchId), eq(orders.order_number, code))`
   with ONE `!order → 404` branch (E1 — security crux). Normalizes `code` via
   `trim().toUpperCase()`; empty → 400; unassigned staff → 403; 404 body byte-identical for
   wrong-branch and nonexistent codes. Did NOT mirror the adjacent `:orderId` load-then-403
   pattern.
2. **`packages/api/src/routes/__tests__/staff-order-lookup.integration.test.ts`** (NEW) —
   hermetic/self-seeding, mirrors `staff-order-status.integration.test.ts`. `insertOrder`
   extended to RETURN `{ id, orderNumber }` (E3). 8 tests: (a) own-branch 200, (b) cross-branch
   404, (c) nonexistent 404 with `expect(cRes.body).toEqual(bRes.body)` byte-identical assertion,
   (d) unassigned 403, (e) completed → 200 status=completed, (f) normalization match + empty-code
   400, (g) terminal-guard 409 re-assert in lookup context.
3. **`apps/mobile/src/features/staff/lib/staff-api.ts`** — added `fetchStaffOrderByCode(code)` →
   `StaffOrderDetail | null` (null on 404, throws otherwise), mirroring `fetchStaffOrderDetail`.
4. **`apps/mobile/src/app/(staff)/pickup-lookup.tsx`** (NEW) — shared `@jojopotato/ui`
   `Input` + `Button` (E5); local `code`/`isLoading`/`errorMessage` state; found actionable →
   `router.push('/(staff)/order-detail/<id>')`; terminal status → inline message, no nav;
   null → "No matching order found for your branch."
5. **`apps/mobile/src/app/(staff)/index.tsx`** — appended 5th `NAV_CARDS` entry "Enter Pickup Code".
6. **`apps/mobile/src/app/(staff)/_layout.tsx`** — registered `<Stack.Screen name="pickup-lookup" />`.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm --filter @jojopotato/api test` | PASS — 191/191 (18 files); new `staff-order-lookup` 8/8 green; full regression intact |
| `pnpm --filter @jojopotato/api typecheck` | PASS — clean |
| `pnpm --filter @jojopotato/mobile typecheck` | PASS — 0 errors (no new errors; baseline BRN errors not observed this run) |
| `pnpm --filter @jojopotato/mobile lint` | PASS — 0 errors (3 warnings in unrelated `scripts/dev-with-tunnel.mjs`) |
| E4 confirmation/tracking recheck | PASS — both render `order.orderNumber` prominently, unchanged (no rework) |
| Agent-Probe staff + customer walkthrough (AC1/AC2 + AC3–AC6 UI) | NOT RUN — requires user device/simulator; mobile has no RN runner |

Prereqs used: local Postgres (native `postgresql.service`) live + `db:migrate`. New Expo route
required a one-time `expo start` to regenerate `.expo/types/router.d.ts` typed hrefs before mobile
typecheck resolved `/(staff)/pickup-lookup` (documented repo codegen convention).

## What Was Skipped or Deferred

- **Agent-Probe mobile walkthrough** (staff lookup flow + customer confirmation/tracking code
  visibility) — deferred to user confirmation. Mobile UI has no automated coverage (project-wide
  RN-runner gap). Backend AC3–AC7 fully proven by automated gates.

## Plan Deviations

- **Within-blast-radius additive test:** added one extra assertion — `(f)` includes a
  "400 for empty/whitespace-only code" case. This proves the plan's own Public-Contract 400 branch
  (checklist 1b); additive coverage of a specified behavior in the same new test file, no scope
  change. No hard-stop-class deviation.
- **Positive baseline deviation:** mobile typecheck reported 0 errors, not the 3 pre-existing BRN
  baseline errors the plan anticipated. Gate ("no NEW errors") satisfied regardless; baseline
  likely resolved on the development branch since the plan was written.

## Test Infra Gaps Found

None new. The mobile RN component/E2E runner absence is the standing project-wide gap already
tracked at `process/features/staff-dashboard/backlog/staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`.
This plan adds no new untested backend surface.

## Adversarial Note (advisory, per contract High-risk pack)

Branch isolation is safe-by-construction: lookup test (b) (cross-branch code) and (c) (nonexistent
code) both return 404 and the test asserts their response bodies are byte-identical
(`expect(cRes.body).toEqual(bRes.body)`). A wrong-branch code fails the `branch_id` filter and
takes the identical not-found path as a nonexistent code — staff can never infer that a code
belongs to another branch. No 5-artifact `harness/` pack was required (read-only trust-boundary,
lower stakes than STAFF-003's write path).

## Closeout Packet

- **Selected plan:** `process/features/staff-dashboard/active/staff-005-pickup-code_15-07-26/staff-005-pickup-code_PLAN_15-07-26.md`
- **Finished:** all backend + mobile touchpoints; new integration suite; all automated gates green.
- **Verified:** AC3–AC7 (backend) via automated gates. **Unverified:** AC1/AC2 + AC3–AC6 UI layer
  (Agent-Probe, pending user walkthrough).
- **Remaining:** user-confirmed Agent-Probe walkthrough before `✅ VERIFIED`; then UPDATE PROCESS.
- **Best next state:** Keep plan in `active/` until the Agent-Probe walkthrough is confirmed.
- **Follow-up plan stubs created:** none.
- **CONTEXT_PARTIAL items:** none.

## Forward Preview

### Test Infra Found
vitest + supertest in `packages/api` (hermetic self-seeding via `signUpAndGetCookie` + per-file
seeding). No RN runner for `apps/mobile` (standing gap).

### Blast Radius Changes
`packages/api` (staff route + 1 new test file), `apps/mobile` (staff-api + 1 new screen + nav +
layout). No schema/migration/state-machine change. `.expo/types/router.d.ts` regenerated.

### Commands to Stay Green
`pnpm --filter @jojopotato/api test` (needs Postgres up + `db:migrate`),
`pnpm --filter @jojopotato/api typecheck`, `pnpm --filter @jojopotato/mobile typecheck`
(run `expo start` once if new routes were added), `pnpm --filter @jojopotato/mobile lint`.

### Dependency Changes
None. No new packages, no `packages/types` change (reuses `StaffOrderDetail`).
