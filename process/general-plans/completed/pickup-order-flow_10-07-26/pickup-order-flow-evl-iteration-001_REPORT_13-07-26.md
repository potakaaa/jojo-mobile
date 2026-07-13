---
name: pickup-order-flow-evl-iteration-001
description: EVL cycle 1 — cross-phase API/mobile menu response shape mismatch found and routed to fix
date: 2026-07-13
metadata:
  type: evl-iteration-report
  plan: process/general-plans/active/pickup-order-flow_10-07-26/pickup-order-flow_PLAN_10-07-26.md
  cycle: 1
  gate: FAIL
---

# EVL Iteration Report — Cycle 1

## Summary

Independent EVL confirmation run (vc-tester) re-verified all 7 planned gates after Phase A + Phase
B1 (API) + Phase B2 (mobile) execute agents self-reported green. 6 of 7 passed with real evidence.
Gate 7 — cross-phase API↔mobile response shape reconciliation — **failed**.

## Root Cause

Phase B1 (API) and Phase B2 (mobile) were implemented in parallel against a documented contract
(per the strategy decision at EXECUTE kickoff) without a live server to integration-test against.
The two sides drifted on field names for the menu response:

| Field | Real API (`packages/api/src/routes/lib/serializers.ts`) | Mobile client (`apps/mobile/src/features/menu/lib/api-client.ts`) |
|---|---|---|
| Product price | `basePriceCents` | `priceCents` (expected) |
| Option identifier | `optionId` | `id` (expected) |
| Reward flag | (not sent) | `isRewardEligible` (expected) |

`apiRequest<T>` does a bare `as T` type assertion with no runtime validation/mapping, so `tsc` never
caught the mismatch — it only surfaces at runtime.

## Impact

- Price fields render as `undefined` (`priceCents` never populated).
- **All size/flavor options resolve to `id: undefined`** — `sizeOptions.find(o => o.id === sizeId)`
  after a user selection always matches the first array entry regardless of what was tapped (a real
  selection-state bug, not just a missing label).
- `POST /orders`'s `selectedOptions[].optionId` is sent as `undefined`, dropped by
  `JSON.stringify`, and rejected by the server's zod schema (`optionId: z.string().uuid()` required)
  — **order placement 400s for any product with size/flavor options.**

This is the single highest-risk seam flagged at kickoff (two agents building against a documented,
not cross-checked, contract in parallel) and it materialized exactly as anticipated.

## Fix Scope (next cycle)

Scoped execute-agent supplement, `apps/mobile/src/features/menu/` only:
1. Reconcile `MenuProduct`/`MenuProductOption` client types (and all consumers) to the real API field
   names (`basePriceCents`, `optionId`) — OR reconcile the API to the mobile's expected names.
   Decision: **fix the mobile client to match the already-tested, already-shipped API contract**
   (API has 44 passing tests including these exact response shapes; changing the API risks
   regressing those tests for no reason — the mobile side is the newer, less-verified layer).
2. Update every consumer of the changed fields: branch detail screen (price label), product detail
   screen (`unitPriceCents` computation, size/flavor `find` lookups), cart line construction,
   checkout `toSelectedOption` mapping.
3. Add a regression test/assertion at the mobile client-parsing boundary (even without a full RN
   test runner, a plain Node/vitest-style unit test on the pure mapping function is feasible if one
   exists, or at minimum a typed fixture-based assertion) proving a product WITH size/flavor options
   can be mapped, selected, and serialized into a valid `POST /orders` body end-to-end.

## Bookkeeping

- Cycle: 1
- Gate: FAIL
- TSV row appended after this report per vc-autoresearch ordering (report first, then row).
