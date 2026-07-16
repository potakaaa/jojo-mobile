---
name: plan:star-001-star-earning
description: "STAR-001 — Jojo Stars earning: idempotent 1-star-per-completed-order service + refund reversal (backend service module, no live wiring)"
date: 14-07-26
feature: rewards-notifications
---

# STAR-001 — Jojo Stars Earning Service

Date: 14-07-26
Status: COMPLETE (STAR-001 — archived 14-07-26)
Complexity: COMPLEX
Feature: rewards-notifications

**Complexity note:** COMPLEX — schema + migration + idempotency + refund-reversal surface; high-risk classes: schema/migration + credit accounting.

**TL;DR:** Build two standalone, idempotent, retry-safe service functions in `packages/api` —
`creditStarForCompletedOrder(orderId)` and `reverseStarForRefundedOrder(orderId)` — backed by a new
DB unique constraint on `star_transactions (order_id, type)` (migration `0005`) and a configurable
minimum-amount constant. All logic runs inside `db.transaction` with `insert-transaction-row-first +
onConflictDoNothing`, so the `user_stars` counter bump only happens when a transaction row was
actually inserted. No live endpoint wiring (that is STAFF-003) — tests invoke the services directly.
All 5 acceptance criteria are Fully-Automated vitest tests against a real per-run Postgres.

---

## Overview

Implement GitHub issue #26 (P0, area:rewards): Jojo Stars earning. Customers earn exactly 1 star per
completed eligible order; the credit is idempotent (re-firing the "order completed" event never
double-credits); cancelled orders never earn; refunds of already-earned orders write a reversal
`adjusted` transaction instead of a silent DB edit. Below-minimum orders earn nothing.

This plan delivers **decoupled service functions only** — the standalone idempotent unit that
STAFF-003 will later call from the staff status-update / refund endpoints. There is no live trigger,
endpoint, or UI in this scope.

### Goals

1. New service module exposing `creditStarForCompletedOrder(orderId)` (earn) and
   `reverseStarForRefundedOrder(orderId)` (adjust/reverse).
2. DB-level idempotency: unique constraint on `star_transactions (order_id, type)` +
   `.onConflictDoNothing({ target: [...] })` on insert (mirrors the `order_number` pattern at
   `packages/api/src/routes/orders.ts:180`).
3. Configurable eligibility threshold via one named constant (`STAR_EARNING_MINIMUM_CENTS`,
   default `0`), structured so ADM-005 can later swap it for a config-table read.
4. Real shared types in `packages/types/src/rewards.ts` (`StarTransactionType`, `UserStars`,
   `StarTransaction`) replacing the wrong points/tier placeholder.
5. Full automated vitest coverage: all 5 ACs, hermetic self-seeding, against a real Postgres.

### Acceptance Criteria (testable — each becomes an automated vitest test)

- **AC1:** Completing an eligible order credits exactly 1 star — `user_stars.current_stars` and
  `lifetime_stars` both +1, and one `star_transactions` row with `type='earned'` is written.
- **AC2:** Cancelling an order (from any prior status) never credits a star for that order.
- **AC3:** Refunding a completed order that already earned a star writes an `adjusted` transaction
  that nets the user's count back down (not a silent DB edit).
- **AC4:** Firing the same "order completed" event twice → exactly ONE `earned` transaction for that
  order (no double-credit).
- **AC5:** An order below the configured minimum amount does not earn a star.

### Phase Completion Rules

- **CODE DONE** = all 6 checklist steps applied, `tsc --noEmit` green, migration `0005` generated
  and committed.
- **VERIFIED** = every row in the Verification Evidence table is green (all 5 ACs + edge cases +
  typecheck/lint/migration-sync gates pass via `pnpm --filter @jojopotato/api test`). CODE DONE alone
  is NOT VERIFIED.
- **DONE / archivable** = VERIFIED AND the validate-contract gate reads PASS AND the migration is
  committed on `dev/star`. No behavior may be declared PASS on a Known-Gap tier (none exist here —
  all gates are Fully-Automated).

### Scope (in)

- `packages/api/src/db/schema/star_transactions.ts` — add unique constraint (partial index).
- New migration `0005` via `pnpm --filter @jojopotato/api db:generate`.
- New service module (see Public Contracts for exact path).
- `packages/types/src/rewards.ts` — overwrite placeholder with real star types.
- New integration test file(s).

### Scope (out) — explicit, with TODO seams

| Deferred item | Owner | Seam left in this plan |
|---|---|---|
| Live staff "mark completed" PATCH endpoint that CALLS `creditStarForCompletedOrder` | STAFF-003 | `// TODO(STAFF-003): call creditStarForCompletedOrder(order.id) after status → 'completed'` comment in the service module header |
| Live refund endpoint that CALLS `reverseStarForRefundedOrder` | STAFF-003 | `// TODO(STAFF-003): call reverseStarForRefundedOrder(order.id) after payment_status → 'refunded'` comment |
| Rewards screen UI (star progress display) | STAR-002 | none (mobile) |
| Coupon issuance on reaching 5-star threshold | STAR-003 | none — this plan credits stars only, does not issue coupons |
| Admin Rewards configuration (config-table minimum) | ADM-005 | eligibility check isolated behind `STAR_EARNING_MINIMUM_CENTS` constant + `isOrderEligibleForStar()` helper so the constant read can later become a DB read |

---

## Touchpoints

Files this plan will change or read:

| File | Action | Why |
|---|---|---|
| `packages/api/src/db/schema/star_transactions.ts` | MODIFY | Add unique constraint / partial unique index on `(order_id, type)`. |
| `packages/api/drizzle/0005_*.sql` | NEW (generated) | Migration adding the unique index. Generated via `db:generate`, committed. |
| `packages/api/drizzle/meta/*` | MODIFY (generated) | drizzle-kit journal/snapshot update — part of the generated migration, committed. |
| `packages/api/src/lib/star-earning.ts` | NEW | Service module: `creditStarForCompletedOrder`, `reverseStarForRefundedOrder`, `STAR_EARNING_MINIMUM_CENTS`, `isOrderEligibleForStar`. |
| `packages/types/src/rewards.ts` | MODIFY (overwrite) | Replace points/tier placeholder with `StarTransactionType`, `UserStars`, `StarTransaction`. |
| `packages/api/src/lib/__tests__/star-earning.integration.test.ts` | NEW | All 5 ACs + idempotency/refund edge cases, hermetic self-seeding. |
| `packages/types/src/index.ts` | READ ONLY | Already `export * from './rewards'` — no change needed (verified). |
| `packages/api/src/routes/lib/serializers.ts` | READ ONLY | Reuse `numericToCents(order.total)` to convert decimal PHP → cents for eligibility compare. |
| `packages/api/src/routes/orders.ts` | READ ONLY | Reference idempotency pattern (line 180) + `centsToNumeric` (private, line 49 — NOT reusable, see note). |

**`packages/types/src/rewards.ts` overwrite is safe:** grep confirms nothing in the codebase
consumes the placeholder `RewardsTier`/`RewardsAccount`/`RewardsTierProgress` types today. Overwrite,
do not add-alongside.

**Cents/decimal note (critical unit correctness):** `orders.total` is `numeric(10,2)` — the pg
driver returns it as a decimal string (e.g. `"12.50"`). The app layer is cents-native. There is NO
shared exported `centsToNumeric` — the one in `orders.ts:49` is a private local function. Use the
EXPORTED `numericToCents(order.total)` from `packages/api/src/routes/lib/serializers.ts` to get the
order total in integer cents, then compare against `STAR_EARNING_MINIMUM_CENTS` (unit: cents).

---

## Public Contracts

New module `packages/api/src/lib/star-earning.ts`:

```
STAR_EARNING_MINIMUM_CENTS: number   // = 0 (default; every completed order eligible)

isOrderEligibleForStar(order): boolean
  // pure: numericToCents(order.total) >= STAR_EARNING_MINIMUM_CENTS
  // isolated so ADM-005 can swap the constant for a config-table read

creditStarForCompletedOrder(orderId: string): Promise<StarCreditResult>
  // idempotent, retry-safe. Credits exactly 1 star for a completed eligible order.

reverseStarForRefundedOrder(orderId: string): Promise<StarReversalResult>
  // idempotent. Writes an `adjusted` (-1) reversal if an `earned` row exists and no
  // reversal exists yet. Decrements current_stars only (lifetime stays monotonic).
```

Return-shape recommendation (final wording locked at EXECUTE; VALIDATE may refine):
- `StarCreditResult = { credited: boolean; reason?: 'not-found' | 'not-completed' | 'below-minimum' | 'already-credited' }`
- `StarReversalResult = { reversed: boolean; reason?: 'not-found' | 'no-earned-star' | 'already-reversed' }`

New shared types in `packages/types/src/rewards.ts` (visible to all `@jojopotato/*` consumers):

```
StarTransactionType = 'earned' | 'redeemed' | 'adjusted' | 'expired'   // mirrors star_tx_type enum
UserStars           = { currentStars: number; lifetimeStars: number }
StarTransaction     = { id; userId; orderId: string | null; type: StarTransactionType;
                        stars: number; description: string | null; createdAt: string }
```

DB contract (migration `0005`): partial unique index
`CREATE UNIQUE INDEX star_transactions_order_type_unique ON star_transactions (order_id, type) WHERE order_id IS NOT NULL;`
(Partial scope chosen because `order_id` is nullable; future `redeemed`/`expired` rows may carry NULL
`order_id` and Postgres treats NULLs as distinct — the partial index confines the constraint to
order-linked earn/adjust rows and prevents accidental future collisions. See Risks.)

---

## Blast Radius

- **Files:** 4 hand-edited (schema, service module, types, test) + 1 generated migration (+ drizzle
  meta) = ~6 files.
- **Packages:** `@jojopotato/api` (schema, service, migration, test), `@jojopotato/types` (rewards).
- **Risk class:** HIGH — schema/migration (DDL, additive unique index) + credit accounting (money-
  adjacent counter integrity). Both are high-risk classes → mandatory hybrid-or-better test tier
  (satisfied: all gates are Fully-Automated). VALIDATE is mandatory (not skippable).
- **Runtime blast:** near-zero at this stage — no route mounts the module, nothing calls it in
  production yet. The only live artifact shipped is the additive unique index (safe: `star_transactions`
  has no seeded rows, so no existing-data conflict on index creation).

---

## Implementation Checklist

Ordered so `tsc --noEmit` stays green between steps (types → schema → migration → service → tests).

1. **Types first.** Overwrite `packages/types/src/rewards.ts` with `StarTransactionType`,
   `UserStars`, `StarTransaction` (shapes in Public Contracts). Delete the old
   `RewardsTier`/`RewardsAccount`/`RewardsTierProgress` placeholder. `packages/types/src/index.ts`
   already re-exports `./rewards` — no index change. Run `pnpm --filter @jojopotato/types typecheck`.

2. **Schema constraint.** In `packages/api/src/db/schema/star_transactions.ts`, add a partial unique
   index to the table's second-arg callback:
   `uniqueIndex('star_transactions_order_type_unique').on(t.order_id, t.type).where(sql\`${t.order_id} IS NOT NULL\`)`
   (import `uniqueIndex` and `sql` from `drizzle-orm`; keep the existing `index(...user_idx)`). Run
   `pnpm --filter @jojopotato/api typecheck`.

3. **Generate migration.** Run `pnpm --filter @jojopotato/api db:generate`. Confirm it emits
   `packages/api/drizzle/0005_*.sql` containing the partial unique index (and updates
   `drizzle/meta/`). Inspect the generated SQL — it MUST be the partial `WHERE order_id IS NOT NULL`
   index, nothing else. **The generated migration + meta files MUST be committed** (CI applies
   migrations; an uncommitted migration breaks the test DB).

4. **Service module.** Create `packages/api/src/lib/star-earning.ts` with the TODO(STAFF-003) header
   seams, `STAR_EARNING_MINIMUM_CENTS = 0` (unit: cents), `isOrderEligibleForStar(order)`,
   `creditStarForCompletedOrder(orderId)`, and `reverseStarForRefundedOrder(orderId)`. Implement per
   the Logic section below. Import `db` from `../db/client`, schema from `../db/schema`,
   `numericToCents` from `../routes/lib/serializers`, and `eq`/`and`/`sql` from `drizzle-orm`. Run
   `pnpm --filter @jojopotato/api typecheck`.

5. **Tests.** Create `packages/api/src/lib/__tests__/star-earning.integration.test.ts`, copying the
   hermetic self-seeding pattern from `packages/api/src/routes/__tests__/staff-orders.integration.test.ts`
   (top-of-file `process.env.* ??=` guards incl. `VITEST='true'`; dynamic-import `db`/`schema`; seed
   own branch/user/order rows; FK-ordered cleanup in `afterAll`). Cover AC1–AC5 + the 3 edge cases
   in the Verification Evidence table. Provide a shared `seedCompletedOrder({ userId, branchId, totalCents })`
   fixture helper (AC1/AC3/AC4/AC5 all need it).

6. **Run the full gate suite** (see Verification Evidence). All must be green before handoff.

---

## Logic (precise — pseudocode OK)

### Earn: `creditStarForCompletedOrder(orderId)`

```
order = SELECT * FROM orders WHERE id = orderId
if !order                              -> return { credited:false, reason:'not-found' }
if order.status !== 'completed'        -> return { credited:false, reason:'not-completed' }
if !isOrderEligibleForStar(order)      -> return { credited:false, reason:'below-minimum' }
   // isOrderEligibleForStar: numericToCents(order.total) >= STAR_EARNING_MINIMUM_CENTS

db.transaction(tx => {
  // 1. INSERT the earned transaction FIRST, guarded by onConflictDoNothing.
  //    The unique index (order_id, type) makes a second 'earned' insert a no-op.
  inserted = tx.insert(starTransactions)
    .values({ user_id: order.user_id, order_id: order.id, type:'earned', stars:1,
              description:'Earned 1 star for completed order' })
    .onConflictDoNothing({ target: [starTransactions.order_id, starTransactions.type] })
    .returning()

  // 2. ONLY bump user_stars when a row was actually inserted.
  //    If inserted is empty -> this order already earned -> DO NOT touch user_stars.
  if (inserted.length === 0) return { credited:false, reason:'already-credited' }

  // 3. Upsert user_stars (+1 current, +1 lifetime). No row is seeded, so upsert by unique user_id.
  tx.insert(userStars)
    .values({ user_id: order.user_id, current_stars:1, lifetime_stars:1 })
    .onConflictDoUpdate({
      target: userStars.user_id,
      set: { current_stars: sql`${userStars.current_stars} + 1`,
             lifetime_stars: sql`${userStars.lifetime_stars} + 1`,
             updated_at: new Date() } })

  return { credited:true }
})
```

**Why insert-transaction-row-first:** the whole credit is a single atomic, conflict-guarded
operation. The unique index is the source of truth for "already credited" — the `user_stars` bump is
strictly gated on `inserted.length > 0`, so a double-fire (even concurrent) can never double-count:
the second insert conflicts → returns empty → the counter is not touched. This directly proves AC4.

### Reverse: `reverseStarForRefundedOrder(orderId)`

```
order = SELECT * FROM orders WHERE id = orderId
if !order  -> return { reversed:false, reason:'not-found' }
   // NOTE: refunded = order.payment_status === 'refunded' (order.status stays 'completed').
   // 'refunded' is NOT an order_status — it lives only on payment_status. The reversal keys off
   // an existing 'earned' star_transaction, so it works regardless of payment_status timing.

db.transaction(tx => {
  earned = tx.select().from(starTransactions)
    .where(and(eq(order_id, orderId), eq(type,'earned')))
  if (earned.length === 0) return { reversed:false, reason:'no-earned-star' }

  // idempotent reversal: insert 'adjusted' (-1) guarded by the same unique index (order_id,'adjusted')
  inserted = tx.insert(starTransactions)
    .values({ user_id: earned.user_id, order_id: orderId, type:'adjusted', stars:-1,
              description:'Reversed star for refunded order' })
    .onConflictDoNothing({ target: [starTransactions.order_id, starTransactions.type] })
    .returning()
  if (inserted.length === 0) return { reversed:false, reason:'already-reversed' }

  // decrement current_stars only; lifetime_stars stays monotonic (see Assumption below).
  tx.update(userStars)
    .set({ current_stars: sql`${userStars.current_stars} - 1`, updated_at: new Date() })
    .where(eq(userStars.user_id, earned.user_id))

  return { reversed:true }
})
```

**Assumption flagged for VALIDATE to confirm:** PRD §6.10 is silent on whether a refund should
decrement `lifetime_stars`. This plan recommends **lifetime stays monotonic** (reversal touches
`current_stars` only) — lifetime represents cumulative earning history, current represents redeemable
balance. VALIDATE should confirm this interpretation or flag it for the product owner.

---

## Verification Evidence

Gate command for all automated rows:
`DATABASE_URL=postgres://jojo:jojo@localhost:5432/jojopotato pnpm --filter @jojopotato/api test`
(precondition: `docker compose up -d`; the vitest `globalSetup` drops/recreates a `_test` DB and
applies all migrations incl. `0005` automatically — no manual `db:migrate` needed for the test DB).

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Completing an eligible order → `user_stars.current_stars` +1 AND `lifetime_stars` +1 AND exactly one `star_transactions` row `type='earned'` for that order | Fully-Automated | **AC1** |
| Order with `status='cancelled'` (from any prior status) → `creditStarForCompletedOrder` returns `not-completed`, zero star rows, `user_stars` unchanged | Fully-Automated | **AC2** |
| Refunding a completed order that earned a star → `reverseStarForRefundedOrder` writes one `adjusted` (-1) row AND `current_stars` nets back down (not a silent edit) | Fully-Automated | **AC3** |
| Fire `creditStarForCompletedOrder(orderId)` twice → exactly ONE `earned` row for that order; `current_stars`/`lifetime_stars` bumped exactly once; 2nd call returns `already-credited` | Fully-Automated | **AC4** |
| Order total below `STAR_EARNING_MINIMUM_CENTS` (set via a >0 override in the test) → returns `below-minimum`, zero star rows, `user_stars` unchanged | Fully-Automated | **AC5** |
| Edge: fire reversal twice → exactly ONE `adjusted` row; `current_stars` decremented once; 2nd returns `already-reversed` | Fully-Automated | idempotency hardening (supports AC3) |
| Edge: reverse an order that never earned → returns `no-earned-star`, no `adjusted` row | Fully-Automated | idempotency hardening (supports AC3) |
| Edge: default `STAR_EARNING_MINIMUM_CENTS = 0` → a 0-total / any-total completed order earns | Fully-Automated | eligibility default (supports AC5) |
| `pnpm --filter @jojopotato/api typecheck` exits 0 | Fully-Automated | types compile (all ACs) |
| `pnpm --filter @jojopotato/types typecheck` exits 0 | Fully-Automated | shared rewards types compile |
| Migration-sync: `pnpm --filter @jojopotato/api db:generate` produces NO new diff after step 3 (migration is committed and in sync with schema) | Fully-Automated | schema/migration integrity |
| `pnpm --filter @jojopotato/api lint` exits 0 | Fully-Automated | lint gate |

All 5 ACs are Fully-Automated — no Agent-Probe or Known-Gap tier is used for any developed behavior.

---

## Test Infra Improvement Notes

(none identified yet) — the existing vitest + supertest + per-run pristine `_test` DB
(`packages/api/test/global-setup.ts`) harness is sufficient; STAR-001 reuses it directly. The
hermetic self-seeding pattern from `staff-orders.integration.test.ts` is the template.

---

## Dependencies, Risks, Integration Notes

**Dependencies:**
- Local Postgres running (`docker compose up -d`) for the test gate.
- `numericToCents` from `packages/api/src/routes/lib/serializers.ts` (exported, confirmed).
- Migrations `0000–0004` already applied (schema present).

**Risks / open items for VALIDATE:**

| Risk | Mitigation / decision |
|---|---|
| Exact Drizzle `.onConflictDoNothing({ target: [...] })` behavior against a **partial** unique index (`WHERE order_id IS NOT NULL`) — does the ON CONFLICT correctly match the partial index arbiter? | **Flag as a `vc-feasibility-test` candidate during VALIDATE** (do NOT run in PLAN). If Drizzle's `target: [cols]` does not bind to a partial index arbiter, fall back to `.onConflictDoNothing({ target: [...], targetWhere: sql\`order_id IS NOT NULL\` })` or a full (non-partial) unique index. VALIDATE resolves the exact form. |
| `numeric(10,2)` decimal → cents conversion drift | Use `numericToCents` (rounds after ×100) — same guard the codebase already trusts. Constant unit is explicitly cents. |
| `user_stars` has no seeded row → first credit must lazily create it | `onConflictDoUpdate` upsert keyed on `userStars.user_id` (`.unique()`), handled in Logic. |
| `lifetime_stars` on refund — PRD silent | Recommend monotonic lifetime (decrement `current_stars` only); flagged for VALIDATE/product confirm above. |
| Overwriting `rewards.ts` breaks a consumer | grep-confirmed no consumer today; safe overwrite. |

**Backwards compatibility:** Migration `0005` is purely additive (a new index). `star_transactions`
has no seeded rows, so index creation cannot conflict with existing data. No column drops/renames. No
existing behavior changes (nothing calls the new module yet).

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/rewards-notifications/active/star-001-star-earning_14-07-26/star-001-star-earning_PLAN_14-07-26.md`
2. **Last completed step:** PLAN written. No implementation done.
3. **Validate-contract status:** PENDING — VALIDATE is MANDATORY (schema/migration + credit-accounting
   high-risk classes). Next phase is VALIDATE; the `.onConflictDoNothing`-with-partial-index behavior
   is a flagged feasibility-probe candidate.
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`,
   `process/features/rewards-notifications/_GUIDE.md`, PRD §6.10, and verified source files:
   `star_transactions.ts`, `user_stars.ts`, `orders.ts` (idempotency pattern line 180 + private
   `centsToNumeric` line 49), `orders.ts` schema, `serializers.ts` (`numericToCents`), schema
   `index.ts`, types `index.ts`, `global-setup.ts`, `test-db-url.ts`, `staff-orders.integration.test.ts`.
5. **Next step for a fresh agent:** Enter VALIDATE. Turn AC1–AC5 into a validate-contract with the
   Verification Evidence table as the test-gate matrix. Resolve the partial-unique-index ON CONFLICT
   feasibility question (probe if uncertain). Then EXECUTE the 6-step checklist in order (types →
   schema → `db:generate` → service → tests → run gates), committing the generated migration.

**Environment note:** current branch is `dev/star` (not `dev/brn`). Verify before committing.

---

## Next Step

Plan complete. Next phase is **VALIDATE** (mandatory — schema/migration + credit-accounting
high-risk classes). Say **ENTER VALIDATE MODE** to convert AC1–AC5 into the validate-contract before
EXECUTE. Do not route to EXECUTE / ENTER EXECUTE MODE until the validate-contract gate reads PASS (or
an explicitly accepted CONDITIONAL).


## Validate Contract

Status: CONDITIONAL
Date: 14-07-26
date: 2026-07-14
generated-by: outer-pvl

Parallel strategy: sequential (fan-out role specs executed inline in the validate session)
Rationale: 3/7 signals (S2 schema/API surface, S6 high-risk class, S7 5+ files); dominant signal S6 (schema/migration + credit-accounting high-risk). Blast radius is 4 hand-edited files across one package pair with all context pre-loaded — a fan-out to 6+ subagents is disproportionate; role specs (4 Layer-1 dimensions + 2 Layer-2 sections) executed inline against real surface files + one empirical cheap-local Postgres probe.

Feasibility probe (cheap-local, resolved in-session): the plan flagged `.onConflictDoNothing({ target: [order_id, type] })` against the PARTIAL unique index (`WHERE order_id IS NOT NULL`) as a probe candidate. Probe run against live localhost Postgres:
- Bare-column form `ON CONFLICT (order_id, type) DO NOTHING` against the partial index → RUNTIME ERROR `there is no unique or exclusion constraint matching the ON CONFLICT specification`. NOT-VIABLE as written.
- Fallback A `ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO NOTHING` (Drizzle `targetWhere`) → VIABLE: 2 identical inserts produced exactly 1 row, original value preserved (dedupe works).
- Verdict: the plan's Logic pseudocode is NOT-VIABLE as written but the plan's own pre-specified fallback IS viable. Resolved as execute-agent instruction E1 (below), not a FAIL.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Completing an eligible order credits exactly 1 star (current_stars +1, lifetime_stars +1, one `earned` row) | Fully-Automated | star-earning integration suite: `DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test` — AC1 case | B |
| AC2 | Cancelled order never credits a star (`not-completed`, zero star rows, user_stars unchanged) | Fully-Automated | same suite, AC2 case | B |
| AC3 | Refund of an earned completed order writes one `adjusted` (-1) row and nets current_stars down | Fully-Automated | same suite, AC3 case | B |
| AC4 | Firing "order completed" twice → exactly ONE `earned` row (no double-credit); 2nd returns `already-credited` | Fully-Automated | same suite, AC4 case (idempotency — directly proves the ON CONFLICT partial-index fix) | B |
| AC5 | Order below `STAR_EARNING_MINIMUM_CENTS` earns nothing (`below-minimum`, zero rows) | Fully-Automated | same suite, AC5 case (with a >0 override) | B |
| EDGE-1 | Reversal fired twice → exactly ONE `adjusted` row; current_stars decremented once; 2nd returns `already-reversed` | Fully-Automated | same suite, reversal-idempotency case | B |
| EDGE-2 | Reverse an order that never earned → `no-earned-star`, no `adjusted` row | Fully-Automated | same suite, no-earned case | B |
| EDGE-3 | Default `STAR_EARNING_MINIMUM_CENTS = 0` → any-total completed order earns | Fully-Automated | same suite, default-eligibility case | B |
| TC-API | `packages/api` types compile | Fully-Automated | `pnpm --filter @jojopotato/api typecheck` exits 0 | A |
| TC-TYPES | shared rewards types compile | Fully-Automated | `pnpm --filter @jojopotato/types typecheck` exits 0 | A |
| MIG-SYNC | migration `0005` in sync with schema (no drift) | Fully-Automated | after `pnpm --filter @jojopotato/api db:generate`, `git diff` under `packages/api/drizzle/` shows no un-committed diff | B |
| LINT | lint gate | Fully-Automated | `pnpm turbo run lint` exits 0 | A |
| FMT | format gate | Fully-Automated | `pnpm format:check` exits 0 | A |

gap-resolution legend: A — proven now / B — gate added by this plan's checklist / C — deferred to named later phase / D — backlog test-building stub.
C-4 reconciliation: `strategy` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a strategy value; it appears only as a named residual (none here — all developed behavior is Fully-Automated).

Legacy line form (retained for existing consumers):
- Star earning/reversal service (AC1–AC5 + 3 edges): Fully-automated: `DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test`
- API typecheck: Fully-automated: `pnpm --filter @jojopotato/api typecheck`
- Types typecheck: Fully-automated: `pnpm --filter @jojopotato/types typecheck`
- Migration-sync: Fully-automated: `pnpm --filter @jojopotato/api db:generate` then `git diff --quiet packages/api/drizzle/`
- Lint: Fully-automated: `pnpm turbo run lint`
- Format: Fully-automated: `pnpm format:check`

Failing stub: (AC4 — the load-bearing idempotency proof)
```
test("should credit exactly one earned star when order-completed fires twice", async () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: fire creditStarForCompletedOrder twice → exactly ONE earned row, user_stars bumped once, 2nd call returns already-credited")
})
```
Failing stub: (AC1)
```
test("should credit 1 star (current +1, lifetime +1, one earned row) for a completed eligible order", async () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: complete eligible order → user_stars.current_stars +1 AND lifetime_stars +1 AND one star_transactions row type='earned'")
})
```
Failing stub: (AC3)
```
test("should write one adjusted (-1) row and net current_stars down when a completed earned order is refunded", async () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: reverseStarForRefundedOrder on an earned order → one 'adjusted' (-1) row, current_stars decremented, lifetime_stars unchanged")
})
```

Dimension findings:
- Infra fit: PASS — vitest + supertest + per-run pristine `_test` DB (`packages/api/test/global-setup.ts`) is real and sufficient; hermetic self-seeding pattern from `staff-orders.integration.test.ts` confirmed reusable; migration `0005` slot correct (0000–0004 present); no mobile/container surface.
- Test coverage: PASS — all 5 ACs + 3 edges map to Fully-Automated vitest assertions with an exact runnable gate command; high-risk classes exceed the hybrid minimum; no developed behavior rests on Known-Gap (no vacuous green).
- Breaking changes: PASS — `rewards.ts` overwrite verified safe (placeholder points/tier types, grep-confirmed zero consumers); `StarTransactionType` union matches the real `star_tx_type` enum verbatim; migration `0005` purely additive (new index, no drops/renames), `star_transactions` unseeded so no index-creation conflict; runtime blast near-zero (no live caller).
- Security surface: PASS — touches credit accounting (high-risk class) but counter mutations are gated on `inserted.length > 0` behind a unique-index arbiter (no double-credit path, probe-confirmed); no auth/identity/secret/trust-boundary surface; services unwired (no caller). Risk-evidence-pack is advisory here, not blocking — becomes REQUIRED when STAFF-003 wires a live refund/complete endpoint.
- Section A feasibility (Schema + migration 0005): CONCERN — mechanically feasible; single load-bearing gap: the Logic pseudocode's bare `.onConflictDoNothing({ target: [order_id, type] })` is NOT-VIABLE against the partial index (probe-confirmed runtime error). Highest-risk edit: the partial-index ↔ ON CONFLICT binding. Resolved via E1.
- Section B feasibility (Service module + tests): CONCERN — mechanically feasible (`numericToCents` exported, `user_stars.user_id` unique, imports resolvable); insert-first-then-gated-bump ordering is atomic and correct (probe-confirmed the conflict guard makes a double-fire a no-op — cannot double-bump); gaps: apply the E1 `targetWhere` fix in BOTH call sites; pseudocode reads `earned.user_id` should be `earned[0].user_id` (array — wording nit for EXECUTE); `lifetime_stars`-monotonic-on-refund is an unresolvable-in-repo product call → accepted known-gap (C2).

Open gaps:
- `lifetime_stars` on refund (AC3): known-gap — PRD §6.10 is silent on whether a refund decrements `lifetime_stars`. Plan's default (lifetime monotonic; reversal touches `current_stars` only) is a sensible, documented product default. NOT resolvable in-repo (product-owner call). Accepted as CONDITIONAL known-gap; EDGE tests assert the current_stars-only behavior so the chosen interpretation is locked and testable. If the product owner later rules that lifetime should also decrement, it is a one-line change + one test update (tracked, not blocking).

What this coverage does NOT prove:
- The integration suite proves the service functions' behavior when invoked DIRECTLY (this plan's scope). It does NOT prove the live staff "mark completed" / refund endpoints call them correctly — that wiring is STAFF-003 and is explicitly out of scope (TODO seams left in the module header).
- MIG-SYNC (`db:generate` no-diff) proves the committed migration matches the schema. It does NOT prove the generated `0005` SQL emits the PARTIAL (`WHERE order_id IS NOT NULL`) form specifically — E1 requires the execute-agent to inspect the generated SQL and confirm the partial predicate is present (a bare full unique index would silently pass MIG-SYNC but change the future NULL-order_id semantics).
- The AC4/reversal-twice tests prove idempotency under SEQUENTIAL double-fire. They do NOT prove idempotency under TRUE concurrent (same-instant, two-connection) fire — the unique-index arbiter guarantees it at the DB level (probe-confirmed the constraint holds), but no test spins two concurrent transactions. Accepted: the DB constraint is the source of truth; a concurrent-fire test is a nice-to-have, not a gate.
- typecheck/lint/format prove compilation and style, not runtime behavior.

Execute-agent instructions:
- E1 (REQUIRED — probe-verified, load-bearing): In BOTH `creditStarForCompletedOrder` and `reverseStarForRefundedOrder`, the `.onConflictDoNothing` call MUST include `targetWhere` matching the partial index predicate — `.onConflictDoNothing({ target: [starTransactions.order_id, starTransactions.type], targetWhere: sql\`${starTransactions.order_id} IS NOT NULL\` })`. The bare `target: [...]` form (as written in the plan's Logic pseudocode) raises a runtime `no unique or exclusion constraint matching the ON CONFLICT specification` error against the partial index — VALIDATE confirmed this empirically against the live DB. Do NOT ship the bare form. After implementing, inspect the generated `0005` SQL to confirm it emits `CREATE UNIQUE INDEX ... (order_id, type) WHERE order_id IS NOT NULL` (partial), then confirm AC4 passes live (not just typecheck).
- E2: In the reversal, `earned` from `tx.select()` is an ARRAY — read `earned[0].user_id` (or destructure the first row), not `earned.user_id`. Plan pseudocode is a shorthand; the array access must be explicit.
- E3: Commit the generated `0005_*.sql` AND the `drizzle/meta/` journal+snapshot updates together — CI applies migrations, so an uncommitted migration breaks the test DB. Branch is `dev/star` (verify before committing, per plan's environment note).
- E4: Keep `STAR_EARNING_MINIMUM_CENTS` unit as integer cents; the eligibility compare uses `numericToCents(order.total)` (exported, confirmed) — do NOT use the private `centsToNumeric` in `orders.ts` (not exported).

Gate: CONDITIONAL (2 CONCERNs; C1 resolved as REQUIRED execute-agent instruction E1 with a probe-verified fix, C2 accepted as a documented product known-gap; 0 FAILs)
Accepted by: session (autonomous, /goal-style single-plan validation) — accepted concerns: (1) ON CONFLICT partial-index form → resolved via execute-agent instruction E1 (probe-verified `targetWhere` fix, not deferred); (2) `lifetime_stars`-monotonic-on-refund → accepted as a documented product-owner known-gap with a sensible default locked by EDGE tests.

## Autonomous Goal Block

```
SESSION GOAL: STAR-001 — build two idempotent, retry-safe Jojo Stars service functions (creditStarForCompletedOrder / reverseStarForRefundedOrder) in packages/api, backed by a partial unique index migration 0005, with full automated vitest coverage of AC1–AC5. No live endpoint wiring (STAFF-003 owns that).
Charter + umbrella plan: N/A — single plan
Autonomy: autonomous execution granted; CONDITIONAL gate accepted in-session; apply reversible fixes without pausing; hard-stop only on irreversible/outward-facing actions not in this contract.
Hard stop conditions / safety constraints:
- Do NOT ship the bare `.onConflictDoNothing({ target: [order_id, type] })` form — it errors at runtime against the partial index. Use the `targetWhere` form (execute instruction E1). VALIDATE proved this empirically.
- Migration 0005 must be PURELY additive (the partial unique index only) and MUST be committed with its drizzle/meta updates; no column drops/renames.
- No behavior may be declared PASS on a Known-Gap tier — all ACs are Fully-Automated. The only accepted known-gap is the product-level lifetime_stars-on-refund interpretation (does not gate any AC).
- Credit-accounting counter mutations must stay gated on `inserted.length > 0` (no un-guarded user_stars bump).
Next phase: EXECUTE — process/features/rewards-notifications/active/star-001-star-earning_14-07-26/star-001-star-earning_PLAN_14-07-26.md
Validate contract: inline in plan (## Validate Contract, Gate: CONDITIONAL)
Execute start: types → schema (partial uniqueIndex) → `pnpm --filter @jojopotato/api db:generate` (0005) → service module (with E1 targetWhere fix) → integration tests → run gates: `DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test` | `pnpm --filter @jojopotato/api typecheck` | `pnpm --filter @jojopotato/types typecheck` | migration-sync `git diff --quiet packages/api/drizzle/` | `pnpm turbo run lint` | `pnpm format:check`. High-risk pack: advisory (credit-accounting; service unwired, not required until STAFF-003 endpoint wiring).
```
