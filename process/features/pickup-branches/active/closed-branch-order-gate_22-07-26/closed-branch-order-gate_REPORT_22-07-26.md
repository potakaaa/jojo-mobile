---
phase: closed-branch-order-gate
date: 2026-07-22
status: COMPLETE
feature: pickup-branches
plan: process/features/pickup-branches/active/closed-branch-order-gate_22-07-26/closed-branch-order-gate_PLAN_22-07-26.md
---

# EXECUTE REPORT — Reject Order Placement When the Branch Is Closed (Opening Hours)

Date: 22-07-26
Status: CODE DONE — all 22 EXECUTE-scoped checklist steps complete, all 5 gates green.
Step 23 (backlog note) is explicitly UPDATE-PROCESS-scoped and was correctly NOT done here.

## TL;DR

`POST /orders` now rejects a branch that is closed by its `opening_hours`, with
reason code `BRANCH_CLOSED` and copy distinct from the pre-existing
`NOT_ACCEPTING_PICKUP` rejection. The 5-file stale-fixture repair landed
completely and was proven load-bearing by mutation. API 759 → 765 (+6), utils
51 → 63 (+12), both typechecks clean, all 7 touched files Prettier-clean. Zero
line drift against the plan's cited line numbers. One documented deviation
(step 16, a "do not duplicate" instruction the plan itself conditioned).

## What Was Done

### Section A — `packages/api/src/routes/orders.ts` (steps 1–5)

| Step | Change | Line (final) |
|---|---|---|
| 1 | `import { getIsOpenNow } from '@jojopotato/utils';` | L2 |
| 2 | `OrderError` gained optional 3rd param `readonly reason?: string` | L70–79 |
| 3 | `is_accepting_pickup` throw now passes `'NOT_ACCEPTING_PICKUP'` | L141–147 |
| 4 | New opening-hours gate, immediately after the not-accepting check | L148–155 |
| 5 | Catch handler conditionally serializes `reason` | L582–587 |

The new gate verbatim:

```ts
if (!getIsOpenNow(branch.opening_hours, new Date())) {
  throw new OrderError(400, 'This branch is closed right now.', 'BRANCH_CLOSED');
}
```

Response shape widens additively: `{ error }` → `{ error, reason? }`. All 19
pre-existing 2-arg `new OrderError(...)` call sites remain valid and unmodified
(`reason` defaults to `undefined`, and the spread omits the key entirely).

### Section B — fixture repair, 5 files (steps 6–12)

**Fixture-repair count per file — all sites, verified by grep before and after:**

| # | File | Sites fixed | Constant | Verified test(s) re-green |
|---|---|---|---|---|
| 1 | `packages/api/src/routes/__tests__/orders.test.ts` | **5** | `ALWAYS_OPEN_HOURS` (shared, file-top) | whole file, 94/94 |
| 2 | `packages/api/src/lib/__tests__/admin-deals.integration.test.ts` | **1** (`seedBranch()`) | file-local `ALWAYS_OPEN_HOURS` | AC9 (HARD), AC10 |
| 3 | `packages/api/src/lib/__tests__/admin-products.integration.test.ts` | **1** (`seedBranch()`) | file-local `ALWAYS_OPEN_HOURS` | AC1 (HARD), 2 cases |
| 4 | `packages/api/src/routes/__tests__/deals-products.test.ts` | **1** (`makeBranch()`) | file-local `ALWAYS_OPEN_HOURS` | deal-at-branch-B placement |
| 5 | `packages/api/src/routes/__tests__/cart.integration.test.ts` | **2** (`branchId`, `otherBranchId`) | file-local `ALWAYS_OPEN_HOURS` | AC8-snapshot (HARD), AC9 |
| | **Total** | **10 sites across 5 files** | | |

Per E3, each of the 4 sibling files got its **own file-local constant** — no
cross-file import was attempted, since none of them share a test-helper module.

`orders.test.ts` also gained `ALWAYS_CLOSED_HOURS` (`open === close === '23:59'`,
an empty half-open minute range) for the new suite's closed-branch fixtures.
This is deterministic at every wall-clock instant, which the route requires —
it evaluates live server time by design and accepts no injectable `now`.

### Section C — new tests

**`packages/utils/src/__tests__/hours.test.ts` (NEW FILE, step 13) — 12 tests.**
`getIsOpenNow` previously had zero unit tests anywhere in the repo. Follows
`packages/api/src/routes/lib/__tests__/deal-schedule.test.ts`'s
half-open-boundary style: exact instants constructed and injected via the
function's own `now` parameter, nothing races the wall clock. Covers the
closing-minute boundary (AC5), the opening minute, day-key resolution in
branch-local time, the `'00:00'`-close end-of-day convention, and malformed
input.

**`orders.test.ts` → `describe('POST /orders — branch opening-hours gate')`
(steps 14–18) — 6 tests.** Self-contained `beforeAll` seeding 3 dedicated
branches (`closedBranchId`, `openNotAcceptingBranchId`,
`closedNotAcceptingBranchId`) plus its own category/product/user, so the new
suite never couples to the shared `branch20Id`/`branch45Id` fixture state used
by ~15 other describe blocks. The product is available at all three branches so
only the branch gate can decide the outcome — an availability miss cannot mask
a real rejection.

## Test Gate Outcomes

All commands run from repo root after `docker compose up -d` +
`pnpm --filter @jojopotato/api db:migrate` (both succeeded).

| Gate | Command | Result |
|---|---|---|
| API suite | `pnpm --filter @jojopotato/api test` | **765 passed (49 files)**, 0 failed — baseline 759, +6 |
| utils suite | `pnpm --filter @jojopotato/utils test` | **63 passed (6 files)**, 0 failed — baseline 51, +12 |
| API typecheck | `pnpm --filter @jojopotato/api typecheck` | clean, exit 0 |
| utils typecheck | `pnpm --filter @jojopotato/utils typecheck` | clean, exit 0 |
| Format | `pnpm format:check` | all 7 touched/new files clean (see Known Gaps for the pre-existing repo-wide CRLF noise) |

Verbatim final tallies:

```
 Test Files  49 passed (49)
      Tests  765 passed (765)

 Test Files  6 passed (6)
      Tests  63 passed (63)
```

### Mutation-sensitivity evidence (what breaking each gate turns red)

Every claim below was **executed**, not reasoned about. Each mutation was
applied, the suite run, and the source restored byte-identically (confirmed by
an empty `git diff` on the reverted file).

| # | Mutation | Result | Verdict |
|---|---|---|---|
| M1 | `getIsOpenNow`'s `currentMinutes < closeMinutes` → `<=` | exactly **2** of 63 utils tests red: "is CLOSED at the exact closing minute" + "empty-range day". 61 unaffected. | AC5 non-vacuous |
| M2 | new gate `if (!getIsOpenNow(...))` → `if (false)` | exactly **3** of 94 orders tests red: AC1's two + AC3's. AC4a/AC4b/reason-omission correctly unaffected (they fire before the gate). | AC1/AC3 non-vacuous |
| M3 | revert `cart.integration.test.ts` fixtures to the malformed literal | exactly **2** red: `AC8-snapshot` and `AC9` | fixture repair is genuinely load-bearing, not cosmetic |

M1's second red assertion is an addition beyond VALIDATE's predicted single
detector — it is a strictly stronger second detector of the same mutation, not
a weakening. M3 is the direct demonstration of the regression this whole plan
existed to prevent.

### AC6 / AC7 — Hybrid (code-review) gates, explicitly confirmed

Required by the plan's Phase Completion Rules; confirmed here rather than
implied by the code existing.

- **AC6 (reuses shared `getIsOpenNow`, no reimplementation) — CONFIRMED.**
  `orders.ts` imports it at L2 and calls it at L153. A grep of `orders.ts` for
  any local opening-hours parsing (`JSON.parse` of an hours value,
  `opening_hours.split`, `toMinutes`, `openMinutes`, `closeMinutes`) returns
  **zero** matches. `packages/utils/src/hours.ts` was not modified — verified
  byte-identical by `git diff` after the M1 mutation was reverted.
- **AC7 (reopen time included only when cleanly derivable, else omitted) —
  CONFIRMED.** Per Decision D3 no derivation helper was built, so the omit
  branch is the only branch this pass takes. The message is a plain
  single-quoted literal (`'This branch is closed right now.'`) — grep confirms
  no template literal, no interpolation, and no date formatting anywhere in the
  closed-branch throw. It is structurally impossible for this pass to emit a
  guessed reopen time.

## Verification Discipline Applied

- **E1 (re-grep before editing) — done.** Re-grepped `orders.ts` immediately
  before each edit. **Zero line drift:** `class OrderError` L63,
  `is_accepting_pickup` L133, catch handler L564–565 — all exactly as the
  validate contract's cycle-2 citation stated, including the corrected L564
  (not L563).
- **E2 (sibling-plan coordination) — checked, not triggered.** The sibling
  `order-reasons-cart-edit_22-07-26` plan has NOT started EXECUTE (its
  `## Validate Contract` is still a placeholder and `orders.ts` contains no
  `PATCH /:orderId/cancel` route). Its target region (`PATCH
  /:orderId/complete` at L635, now L653 after my +18 lines) never overlapped
  mine. Re-grepped anyway before every edit.
- **E3 (per-file local constants) — done**, all 4 sibling files.
- **E4 (post-repair combined grep) — done, run in BOTH directions.**
  Forward: of every file in `packages/api/src` still containing the malformed
  literal, **zero** also contain a `POST /orders` call site.
  Inverse: of every file containing a `POST /orders` call site (exactly 5,
  matching the plan), **all 5 report 0 remaining literals**.
  Also independently re-derived the 5-file scope from scratch before editing,
  using all three calling conventions (`.post('/orders')` chain,
  `req('POST', '/orders', …)` raw-fetch helper, `post('/orders', …)` local
  helper) — reproduced the plan's exact 5-file set with zero additions.
  Two near-miss candidates were individually checked and cleared:
  `staff-order-status.integration.test.ts` (its `/orders` hits are comments and
  a `GET /orders/completed` section header) and `coupons.integration.test.ts`
  (a single prose comment mentioning `POST /orders`). Neither places an order.

## Plan Deviations

**One deviation, within blast radius, plan-sanctioned.**

| # | Step | Deviation | Justification |
|---|---|---|---|
| D-1 | 16 (AC2 explicit open-branch case) | **Not added.** | Step 16 says to add it *"only if no existing test in the file already asserts a 201 against an open-and-accepting branch with the corrected fixture — check first, do not duplicate."* I checked: `orders.test.ts:371–380` (`POST /orders — auth boundary` > "creates an order and recomputes price server-side (cents)") asserts `201` against `branch20Id`, which now carries `ALWAYS_OPEN_HOURS` and defaults `is_accepting_pickup: true`. AC2 is covered there and by ~100 further 201 assertions across the file. Adding a second would be the duplication the step forbids. A comment in the new describe block records where AC2 is proven, so the omission is traceable rather than silent. |

No other deviation. No hard-stop-class deviation. No schema change, no
migration, no new route, no auth/billing/container/secret surface — the
5-artifact high-risk evidence pack skip decision holds against the final diff
(`orders.ts` still has exactly 4 handlers, all pre-existing).

**Two additions beyond the literal checklist, both strictly additive and inside
the plan's own blast radius:**

1. `ALWAYS_CLOSED_HOURS` constant in `orders.test.ts` — step 14 specified this
   exact `{ open: '23:59', close: '23:59' }` value inline; hoisting it to a
   named constant alongside `ALWAYS_OPEN_HOURS` matches D5's own
   one-source-of-truth rationale.
2. Two extra tests in the new suite beyond the AC1/AC3/AC4 minimum:
   "persists no order when placement is rejected as closed" (rollback proof)
   and "omits reason entirely for a rejection that carries no reason code"
   (locks the additive-shape promise in Public Contracts, so a bare `{ error }`
   consumer provably sees no change). Both are within the described suite.

**Path-citation correction (not a deviation):** the EXECUTE handoff prompt cited
`packages/api/src/routes/admin/__tests__/admin-deals.integration.test.ts` and
`.../admin-products.integration.test.ts`. The real paths are
`packages/api/src/lib/__tests__/…`, exactly as the plan's own Touchpoints table
and checklist steps 8–9 state. The plan was correct; the handoff prompt's paths
were not. Resolved by re-grep, no wrong file edited.

## Test Infra Gaps Found

- **Pre-existing repo-wide CRLF format drift — NOT caused by this work,
  proven by measurement, not assumed.** `pnpm format:check` flags 51 files
  repo-wide. Stash-baseline comparison: with my 6 tracked files stashed and the
  new file moved aside, the baseline flags **58** files — and both
  `packages/api/src/routes/orders.ts` and
  `packages/api/src/routes/__tests__/orders.test.ts` are **already in that
  baseline list**. `comm -13 baseline after` returns **zero** genuinely new
  files. This is the known
  `general-plans/backlog/crlf-line-ending-format-check-drift_NOTE_17-07-26.md`
  issue (Windows `core.autocrlf`).
  Separately, running `prettier --write` on my 7 files did surface **two real
  content-level issues in my own new code** (an over-long `res.status(...)`
  chain in `orders.ts`, and a `db.select()` chain in the new test) — both fixed,
  after which all 7 files are clean and the repo count dropped 58 → 52.
- **`getIsOpenNow` had zero unit tests repo-wide before this pass.** Now closed
  by `packages/utils/src/__tests__/hours.test.ts`. Treat this as durable: any
  future change to `getIsOpenNow`'s minute-range semantics should extend this
  file rather than rely on downstream integration tests.
- **The malformed `opening_hours` fixture pattern remains in 21 other files**
  that do not currently place orders (`branches.test.ts`, `deals.test.ts`,
  `staff-*`, `admin-*`, …). None are affected today, but any future feature
  adding a `POST /orders` call site against one of those `seedBranch()` /
  `makeBranch()` helpers will silently inherit a closed branch. VALIDATE hit
  this exact trap twice across three cycles. The plan's own Test Infra
  Improvement Notes already recommend a single shared fixture constant as the
  durable fix — worth a backlog note at UPDATE PROCESS.
- No `CONTEXT_PARTIAL` items. No follow-up plan stubs created.

## Closeout Packet

- **Selected plan:** `process/features/pickup-branches/active/closed-branch-order-gate_22-07-26/closed-branch-order-gate_PLAN_22-07-26.md`
- **Finished:** all 22 EXECUTE-scoped checklist steps (1–22). Step 23 is
  UPDATE-PROCESS-scoped and deliberately left undone.
- **Verified:** AC1, AC2, AC3, AC4 (both sub-cases), AC5 — all Fully-Automated
  and passing, each proven non-vacuous by an executed mutation. AC6 and AC7 —
  Hybrid code-review gates, explicitly confirmed above with grep evidence.
- **Still unverified:** nothing within EXECUTE scope. This plan requires no
  Agent-Probe walkthrough (server-only change, no UI surface), so unlike most
  active plans in this repo there is no owed manual step.
- **Cleanup remaining (UPDATE PROCESS):** checklist step 23 — file the deferred
  "next opening time" derivation backlog note under
  `process/features/pickup-branches/backlog/` (Decision D3), so AC7's full
  intent is explicitly deferred rather than silently lost. Recommend also
  filing the shared-test-fixture-constant note described above.
- **Files changed (exactly 7 — blast radius confirmed isolated):**
  1. `packages/api/src/routes/orders.ts` (source)
  2. `packages/api/src/routes/__tests__/orders.test.ts`
  3. `packages/api/src/lib/__tests__/admin-deals.integration.test.ts`
  4. `packages/api/src/lib/__tests__/admin-products.integration.test.ts`
  5. `packages/api/src/routes/__tests__/deals-products.test.ts`
  6. `packages/api/src/routes/__tests__/cart.integration.test.ts`
  7. `packages/utils/src/__tests__/hours.test.ts` (NEW)

  Other modified files in the working tree (`apps/mobile/**`, `packages/ui/**`,
  `packages/types/src/flavors.ts`, `apps/admin/src/routeTree.gen.ts`) belong to
  a concurrent UI workstream and were **not** touched by this plan — confirmed
  by grepping every non-`packages/api` changed file for `getIsOpenNow` /
  `opening_hours` / `ALWAYS_OPEN` / `BRANCH_CLOSED`: the single hit is a
  pre-existing `SAMPLE_BRANCH_CLOSED` mobile showcase constant that is not part
  of any diff.
- **Nothing staged or committed** — left entirely for the user.
- **Best next state:** `Ready for UPDATE PROCESS archival` once step 23's
  backlog note is filed.

## Forward Preview

### Test Infra Found
- `packages/api` vitest pins `env: { TZ: 'UTC' }`; `packages/utils` vitest does
  **not**. The new `hours.test.ts` is TZ-safe regardless because `getIsOpenNow`
  uses only `getUTC*` accessors plus an explicit offset, and every assertion
  injects an absolute UTC instant — no host-local accessor is reachable. Any
  future `packages/utils` test that is timezone-sensitive in a different way
  should add the pin first.
- The `describe`-local `beforeAll` + own-fixtures pattern (MENU-003, DEAL-005,
  and now this suite) is the established way to add a branch-scoped
  `POST /orders` suite to `orders.test.ts` without coupling to shared state.

### Blast Radius Changes
- `OrderError` now takes an optional 3rd `reason` argument. Any future throw
  that should carry a machine-readable code passes it as arg 3; the catch
  handler serializes it automatically. Existing 2-arg throws need no change.
- `POST /orders` error responses may now include `reason`. Consumers reading
  only `error` are unaffected (verified: `apps/mobile`'s `apiRequest()` throws a
  plain `Error` from `error.message` and never validates the body shape).
- Every branch fixture used for order placement must now carry **JSON**
  `opening_hours`. A bare `HH:MM`-range string means "closed" and will reject
  the order.

### Commands to Stay Green
```
docker compose up -d
pnpm --filter @jojopotato/api db:migrate
pnpm --filter @jojopotato/api test
pnpm --filter @jojopotato/utils test
pnpm --filter @jojopotato/api typecheck
pnpm --filter @jojopotato/utils typecheck
pnpm format:check
```

### Dependency Changes
None. No package added or upgraded. `@jojopotato/utils` was already a
`workspace:*` dependency of `packages/api`; this pass is the second consumer of
that import path in `packages/api/src/routes` (after `lib/coupon-apply.ts`).
