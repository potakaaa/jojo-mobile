---
phase: customer-mark-picked-up-sections-ab
date: 2026-07-21
status: COMPLETE
feature: ordering-cart
plan: process/features/ordering-cart/active/customer-mark-picked-up_21-07-26/customer-mark-picked-up_PLAN_21-07-26.md
---

# EXECUTE REPORT — Sections A + B (API route + API tests)

**TL;DR:** Sections A (items 1–7) and B (items 8–15) are complete and green. `PATCH
/orders/:orderId/complete` is implemented in `packages/api/src/routes/orders.ts`; 17 new
integration cases take `orders.test.ts` from 71 → 88 and the full API suite from 681 → 698, zero
regressions. All four HARD gates (AC2/AC3/AC4/AC5) are real passing automated tests, each
**mutation-proven non-vacuous**. Section C (`apps/mobile`) and Section D (cross-package gates) were
out of scope and not touched.

## What Was Done

### Section A — API route (items 1–7)

`packages/api/src/routes/orders.ts` — added `ordersRouter.patch('/:orderId/complete',
requireSession, …)`, registered immediately **before** `GET /:orderId`.

| Item | Done | Note |
|---|---|---|
| 1 | ✅ | Route registered before the broader `/:orderId`-shaped handler |
| 2 | ✅ | Sequence: userId → uuid→404 → SELECT→404 → **ownership→403** → status→409 |
| 3 | ✅ | `{ status: 'completed', completed_at: now, updated_at: now }` |
| 4 | ✅ | `db.transaction` + CAS `where(id AND status = <read status>)`, 0 rows → 409 |
| 5 | ✅ | `creditStarForCompletedOrder(orderId)` **after** commit, wrapped + logged |
| 6 | ✅ | No `notifyCustomer` / `dispatchOrderNotification` call |
| 7 | ✅ | Re-select order + items → `{ order: serializeOrder(order, items) }` |

Constraint compliance:

- `packages/api/src/routes/lib/order-state-machine.ts` — **untouched** (`git diff` confirms);
  `canTransition` reused as-is, `ready → completed` was already legal.
- The staff PATCH handler in `packages/api/src/routes/staff.ts` — **untouched** (`git diff`
  confirms).
- `packages/api/src/lib/star-earning.ts` — **byte-identical to HEAD** (verified with
  `git diff --exit-code` after the mutation probes below).
- Error sequence is 404 → 403 → 409 with ownership strictly before status, copied from
  `GET /orders/:orderId` (invalid UUID → 404, not 400).
- No `apps/mobile/` file was read-and-edited, created, or deleted.

### Section B — API tests (items 8–15)

`packages/api/src/routes/__tests__/orders.test.ts` — new module-level `patch()` helper (mirroring
the existing `post()`/`get()`) plus a new
`describe('PATCH /orders/:orderId/complete — customer self-confirm pickup')` block with 17 cases.

| Item | AC | Test case | Tier |
|---|---|---|---|
| 8 | AC1 | `AC1: the owner completes a ready order → 200, status completed, completed_at set` | Fully-Automated |
| 9 | AC2 | `AC2 (HARD): a non-owner cannot complete another user order → 403, order unchanged, no star` | **HARD** |
| 9 | AC2 | `AC2 (HARD): ownership is checked BEFORE status — a non-owner gets 403 for a pending order too, never a state-revealing 409` | **HARD** |
| 9 | AC2 | `AC2: an unauthenticated caller cannot complete an order → 401, order unchanged` | Fully-Automated (additive) |
| 10 | AC3 | `AC3 (HARD, completeness): the rejected-status list is exactly every OrderStatus except ready` | **HARD** (additive lock) |
| 10 | AC3 | `AC3 (HARD): completing a %s order → 409, order unchanged, no star` × **7 statuses** | **HARD** |
| 11 | AC4 | `AC4 (HARD): customer self-completion credits exactly one star` | **HARD** |
| 12 | AC5 | `AC5 (HARD): a repeat call and a subsequent staff-path credit never mint a second star` | **HARD** |
| 13 | AC6 | `AC6: two concurrent completions of the same order → exactly one 200 and one 409, one star` | Fully-Automated |
| 14 | AC7 | `AC7: a malformed order id and an unknown order id both → 404 (never 400)` | Fully-Automated |
| 15 | AC8 | `AC8: a status field in the request body is ignored — the order still becomes completed` | Fully-Automated |

## HARD Gate Non-Vacuity Proof (mutation probes)

Green tests prove nothing unless they fail when the feature is broken. Each HARD gate was probed by
temporarily mutating the source, running the suite, then restoring. Every probe was reverted; the
tree is clean.

| # | Mutation | Result | Verdict |
|---|---|---|---|
| 1 | Ownership check deleted from the handler | **2 failed / 86 passed** — exactly the 2 AC2 HARD tests | AC2 non-vacuous |
| 2 | Status gate deleted (both `canTransition` and the `!== 'ready'` pin) | **8 failed** — all 7 AC3 HARD cases + AC5 | AC3 non-vacuous |
| 3 | `creditStarForCompletedOrder` call removed | **3 failed** — AC4, AC5, AC6 | AC4 non-vacuous |
| 4 | Star idempotency short-circuit removed | **1 failed** — AC5 | AC5 sensitive |
| 4b | *Precision probe (E4):* still **reports** `already-credited`, but silently double-bumps the balance | **1 failed** — AC5, at the concrete balance assertion: `expected { current: 2, lifetime: 2 } to deeply equal { current: 1, lifetime: 1 }` | **E4 satisfied** |

Probe 4b is the load-bearing one for Instruction E4. Probe 4 tripped the
`expect(second.credited).toBe(false)` assertion first, which is a *report*-level check — it does not
prove the row/balance assertion bites. Probe 4b keeps every report-level assertion passing and
breaks only the persisted balance, so **only** a concrete-value assertion can catch it. It did. AC5
is therefore proven to assert real state, not the absence of an error.

## What Was Skipped or Deferred

- **Section C (`apps/mobile`, items 16–20)** — owned by a concurrent agent. Not read-and-edited, not
  touched.
- **Section D (items 21–25)** — cross-package gates belong to the EVL pass. Ran this package's own
  gates only (below), plus `lint`.
- **AC9/AC10/AC11** — mobile/on-device criteria, outside Sections A+B.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm --filter @jojopotato/api test` | **698 passed / 45 files** (baseline 681 → +17); `orders.test.ts` **71 → 88** |
| `pnpm --filter @jojopotato/api typecheck` | clean, exit 0 |
| `pnpm --filter @jojopotato/api lint` | **0 errors**, 1 pre-existing warning in `staff-order-lookup.integration.test.ts` (untouched file, not in my diff) |
| `prettier --check` on both touched files | clean (one drift in `orders.test.ts` found and fixed, suite re-run green after) |

Zero regressions: every one of the 44 other suites passed unchanged.

## Plan Deviations

All are within-blast-radius; none change behavior or touch a hard-stop class.

| # | Deviation | Rationale |
|---|---|---|
| D1 | AC1 asserts `completed_at` on the **persisted DB row**, not the HTTP response | `serializeOrder`/`ApiOrder` has no `completedAt` field, and item 7 pins the customer serializer. The DB row is the stronger proof anyway. |
| D2 | Plan steps 2.5 and 2.6 written as two `if` blocks; implemented as one `if (!canTransition(…) \|\| currentStatus !== 'ready')` | Identical evaluation order, identical 409 + message. Both conditions are present and both were mutation-proven (probe 2). Structure only. |
| D3 | AC5's "subsequent staff completion attempt" invokes `creditStarForCompletedOrder(orderId)` directly rather than the staff HTTP route | The staff router is not mounted on this test app, and that function **is** the staff PATCH's completion side-effect (`staff.ts:383` → `creditStarsForOrder` → `creditStarForCompletedOrder`). Item 12 explicitly permits "the staff completion path/**credit service**". |
| D4 | 3 test cases beyond the 8 checklist items (401 guard; ownership-before-status ordering proof; AC3 completeness lock) | Additive coverage of constraints the plan states in prose but does not enumerate as cases. No production behavior change. The completeness lock fails if the `OrderStatus` enum ever grows, preventing the AC3 parameterisation from silently shrinking. |

**Instruction E3 resolution:** the real export is `creditStarForCompletedOrder` (not
`creditForCompletedOrder`). Used the real name; the call was made, not skipped.

Instructions E1/E2 belong to Section C and were not in scope. E4 is satisfied — see probe 4b.

## Test Infra Gaps Found

None new. The `packages/api` vitest + supertest + live-Postgres runner covered every criterion in
Sections A+B at the Fully-Automated tier; no criterion in my scope was deferred to Known-Gap or
Agent-Probe.

Two pre-existing facts confirmed still true and relied upon:
- `test/global-setup.ts` drops/recreates and re-seeds the test DB per run, so fixtures never
  accumulate across runs.
- Seeded reward tiers are 5★/10★/15★/20★, so a fresh single-star user crosses no unlock threshold —
  which is why the AC4/AC5 ledger counts are exactly 1 with no coupon side-effects.

## Closeout Packet

- **Selected plan:** `process/features/ordering-cart/active/customer-mark-picked-up_21-07-26/customer-mark-picked-up_PLAN_21-07-26.md`
- **Finished:** Section A items 1–7, Section B items 8–15.
- **Verified:** API suite 698/698, typecheck clean, lint 0 errors, Prettier clean, 4 HARD gates
  mutation-proven non-vacuous.
- **Still unverified (not my scope):** Section C mobile items, Section D cross-package gates, AC11
  on-device Agent-Probe.
- **Follow-up plan stubs created:** none.
- **CONTEXT_PARTIAL items:** none.
- **Best next valid state:** `Keep in active/testing` — Sections A+B are code-complete and green,
  but the plan as a whole is not done until Section C lands and Section D's cross-package gates run
  under EVL. Per the plan's own Phase Completion Rules the folder stays in `active/` until the AC11
  walkthrough is confirmed.

## Forward Preview

**Test Infra Found** — `packages/api` vitest/supertest against live Postgres, `fileParallelism:
false`, `TZ: 'UTC'` pinned, pristine DB per run via `test/global-setup.ts`. A reusable `patch()`
helper now sits alongside `post()`/`get()` in `orders.test.ts` for any future PATCH-route case.

**Blast Radius Changes** — none beyond plan. Exactly 2 files touched, both in `packages/api`:
`src/routes/orders.ts`, `src/routes/__tests__/orders.test.ts`.

**Commands to Stay Green** — `pnpm --filter @jojopotato/api test` (needs
`docker compose up -d` + `db:migrate`), `pnpm --filter @jojopotato/api typecheck`.

**Dependency Changes** — none. No new package, no migration, no schema edit, no state-machine edit.
