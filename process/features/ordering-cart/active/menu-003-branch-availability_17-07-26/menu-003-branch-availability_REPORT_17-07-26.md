---
phase: menu-003-branch-availability
date: 2026-07-17
status: COMPLETE_WITH_GAPS
feature: ordering-cart
plan: process/features/ordering-cart/active/menu-003-branch-availability_17-07-26/menu-003-branch-availability_PLAN_17-07-26.md
---

# MENU-003 — Branch Availability for Deals — EXECUTE REPORT

**TL;DR:** All 8 plan sections implemented on `feat/menu-003-deal-branch-availability`. API
448 → **460/460**, utils 35 → **39/39**, all 3 typechecks clean, 0 lint errors. **AC5 (the HARD
money-safety gate) is proven by real passing tests, and I verified they are non-vacuous by
disabling the guard and watching them go red.** Two gaps, neither a code defect: `pnpm
format:check` fails on this Windows checkout for a pre-existing CRLF reason unrelated to this
change (proven), and AC10's Agent-Probe walkthrough is not performed. One notable deviation:
4 pre-existing tests in `admin-deals.integration.test.ts` (not in the plan's Touchpoints) had
to be updated because they encoded the exact behavior SPEC AC7 deliberately overrides.

## What Was Done

Branch cut from `development` per the SPEC constraint: `feat/menu-003-deal-branch-availability`.
Nothing committed — left staged for the orchestrator's commit checkpoint, per instruction.

| Section | File | What |
|---|---|---|
| 0 | — | Branch cut; production pre-flight run (see below) |
| 1 | `packages/api/src/routes/lib/coupon-apply.ts` | `type Queryer` → `export type Queryer`. One word. No definition/body change. |
| 1 | `packages/api/src/routes/lib/deal-availability.ts` | **NEW** — `resolveAvailableDealProductIds(dbOrTx, branchId, dealProductIds)`. Reuses the exported `Queryer` (no parallel `DbOrTx` declared). 2 batched queries regardless of deal count. Zero-component deals excluded without running query 2. No `FOR UPDATE`. |
| 2 | `packages/api/src/routes/branches.ts` | Helper call inside the existing `if (isDealMenu && productIds.length)` block + one `isDealMenu &&`-gated skip as the first line of the per-product loop. |
| 3 | `packages/api/src/routes/orders.ts` | AC5 rejection block, inserted exactly between the coupon guard (ends 231/232) and the dormant legacy block (comment at 234). Runs on `tx`. Batches ALL deal lines in one helper call. |
| 4 | `packages/api/src/db/schema/deal_components.ts` | Comment-only; stale "NEVER read by pricing/cart/order-placement code" claim corrected. |
| 5 | `apps/mobile/src/features/orders/hooks/use-reorder.ts` | Two `fetchQuery` calls (regular + `{isDeal:true}`, distinct query keys) merged at the CALL SITE. `reconcileReorder` signature and body untouched. |
| 6 | `branches.test.ts`, `orders.test.ts`, `reorder.test.ts` | +16 new tests (see below). |
| 7 | — | AC4 diff-scope check performed (see below). |
| 8 | `process/features/admin-dashboard/backlog/menu-003-admin-invisible-deal-indicator_NOTE_17-07-26.md` | **NEW** backlog note. |

### Hard constraints — all honored

- **AC5 proven by a real Fully-Automated test.** Known-Gap not used anywhere near it.
- **Regular non-deal filtering byte-identical.** `branches.test.ts` diff has **zero removed
  lines** — the pre-existing regular-menu assertions (lines 220-252) are untouched and green.
  `orders.ts` diff is purely additive (zero removed lines). `orders.ts:134-146` untouched.
- **`reconcileReorder` zero signature/body change.** Verified — the merge happens in
  `use-reorder.ts`. Its tests grew 35 → 39; the original 35 are untouched and green.
- **Multi-deal-line carts batched** — one helper call for the whole cart. Dedicated test.
- **`Queryer` reused**, not re-declared. No `FOR UPDATE`. No migration. `admin/deals.ts`,
  legacy `GET /deals`/`GET /deals/:id`, `apply-deal.ts`, `eligibility.ts`, `use-deal-usage.ts`
  all untouched.

### Non-vacuity check (unprompted, but AC5 is a money gate)

I wrote implementation before tests, so the tests had never been observed failing. To prove
they aren't vacuously green, I temporarily disabled each guard and re-ran:

- **AC5 guard disabled** (`orders.ts`): 3 rejection tests → **RED**; the 2 acceptance tests
  (contrast-success, regular-product) correctly stayed green. Guard restored, verified.
- **Read-path filter disabled** (`branches.ts`): 6 of 7 → **RED**; AC1 (an inclusion
  assertion) correctly stayed green. Filter restored, verified.

This is the evidence that AC5's coverage is real, not a passing assertion that would pass anyway.

## Section 0 — Production Pre-Flight Count (report-and-continue)

Query run: `SELECT p.id, p.name FROM products p WHERE p.is_deal = true AND NOT EXISTS (SELECT 1 FROM deal_components dc WHERE dc.deal_product_id = p.id);`

**Against the dev DB (the only reachable environment): 0 rows. 0 deals of any kind exist.**

**Against production: NOT RUN — I could not reach production, and state that plainly rather
than implying otherwise.** Findings supporting this:

- No API deploy target exists in-repo (`fly.toml`/`render.yaml`/`railway.json`/`vercel.json`
  all absent; `eas.json` is mobile-build only).
- The only Postgres config is the local `docker-compose.yml` (`jojo`/`jojopotato`).
- `packages/api/src/db/client.ts` reads a single `DATABASE_URL`. I did not read `.env`
  (privacy-blocked, and I had no need to).
- Consistent with `all-context.md`: the API has no deploy story yet.

**Best available reading: there is no deployed production API/DB, so the zero-component-hide
decision has no live data to disturb.** I cannot prove a negative about infrastructure outside
this repo. **Owed pre-merge action:** if any production/staging DB does exist, run the query
above there before merging. Recorded, not silently skipped.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test` | **PASS — 460/460, 34 files** (baseline 448 → +12) |
| `pnpm --filter @jojopotato/utils test` | **PASS — 39/39, 4 files** (baseline 35 → +4) |
| `pnpm --filter @jojopotato/api typecheck && pnpm --filter @jojopotato/mobile typecheck && pnpm --filter @jojopotato/utils typecheck` | **PASS — all 3 clean** |
| `pnpm format:check` | **FAIL — pre-existing environment issue, NOT this change.** See below. |
| (extra) lint: api / utils / mobile | **0 errors.** 4 warnings, all in files never touched by this plan. |

### New tests (+16)

`branches.test.ts` (+7, self-seeding on its own branches/category): AC1 listed-when-all-available,
AC2 one-component-flip removes only that deal (sibling still listed), AC3 per-branch isolation
(hidden at A, listed at B), AC6 2-component/one-down excluded, AC7 zero-component hidden despite
the deal-product itself being available, AC8 branch-available-but-`is_active=false` excluded,
plus the **no-bpa-row residual** (component with NO `branch_product_availability` row at all).

`orders.test.ts` (+5): AC5 rejection (400, **zero order rows written**), AC5 contrast (the SAME
deal → 201 at a branch where the component IS available), multi-deal-line cart (2 deals at one
branch, the AVAILABLE one listed FIRST so a first-line-only check would wrongly accept), AC8 at
placement, and a regular-product control proving non-deal orders are unaffected.

`reorder.test.ts` (+4): AC9a still-available deal reorders at today's price, AC9b-i deal pulled,
AC9b-ii deal hidden for a component (both → `product_unavailable`, confirming no new reason enum
is needed), plus a mixed regular+deal partition.

### `pnpm format:check` — diagnosed, not hand-waved

Fails with **131 files**, the overwhelming majority never touched by this plan. Root cause:

- `git config core.autocrlf` = **`true`** on this Windows checkout → git rewrites LF→CRLF.
- An untouched control file (`packages/utils/src/discount.ts`, clean `git status`) is flagged,
  and `head -1 | cat -A` shows `^M$` (CRLF).
- **Proof it is line-endings only:** copying `deal-availability.ts`, `orders.ts`,
  `coupon-apply.ts` and the untouched control into a project-internal probe dir with CR
  stripped → `prettier --check` reports **"All matched files use Prettier code style!"** for
  all four.

So every file's *content* is prettier-clean, mine included; the gate fails purely on line
endings. **Classification: `harness-drift` (environment), not `product-breakage`.** It fails
identically on untouched `development` for any change, and CI (Linux, `autocrlf` off) is
unaffected — which is why repo CI is green.

**Deliberately NOT fixed:** running `prettier --write` would rewrite 131 unrelated files,
blowing the plan's blast radius. Per the plan's escalation ladder this is documented and
continued, not silently absorbed. Recorded as a test-infra gap below.

## Plan Deviations

**1. `admin-deals.integration.test.ts` updated (4 tests) — file NOT in the plan's Touchpoints.**

- **What:** 4 pre-existing tests went red. Root cause: their `createDeal()` helper creates a
  deal with **zero components**, then asserts it is listed / orderable — i.e. they encode
  precisely the behavior SPEC AC7 deliberately overrides ("a deal with zero attached components
  is never listed at any branch, under any availability state").
- **Why it is not a defect in my code:** AC7 is explicit, user-decided, and locked. There is no
  implementation that satisfies AC7 and leaves those assertions true.
- **Fix applied:** minimal and intent-preserving — each now attaches ONE available component via
  the **already-existing** `createDealWith(...)` helper. Each test's actual subject (is_deal
  filter split; availability auto-seed-on-create; price-snapshot integrity; deal orderability)
  is unchanged and still genuinely exercised. In the auto-seed test I set availability on the
  *component only*, never the deal, preserving exactly what that test asserts.
- **Not touched:** `admin/deals.ts` (the route) itself — only its test's seed data.
- **Judgment:** within-blast-radius (test-data adaptation to a SPEC-locked behavior change), not
  a redesign. Surfaced here rather than absorbed silently.

**2. AC4 diff-scope check (step 16) — passes on intent; 2 hunks are not literally inside the block.**

The `branches.ts` diff is 4 hunks. Two match step 16's categories exactly (the helper call
inside the `if (isDealMenu ...)` block; the one `isDealMenu &&`-gated skip line in the loop).
Two do not sit literally inside the block:

- the `import { resolveAvailableDealProductIds }` line — no runtime effect in the handler;
- `let availableDealIds = new Set<string>();` — declared just above the block because JS block
  scoping means a `let` inside the `if` is invisible to the loop that reads it.

I reconsidered as step 16 instructs and confirmed **no tighter mechanically-valid form exists**
(computing inside the loop would query per-product; a separate loop is a larger diff). Both are
zero-behavior on the regular path, which is step 16's stated intent — it already accepts that
"one new no-op branch instruction is now evaluated per product". Empirically: the regular-menu
tests are byte-identical (zero removed lines) and green. Recording it as a judgment call rather
than claiming a clean literal pass.

**3. Process deviation (mine, self-inflicted, resolved):** I attempted a `git stash`-based
baseline comparison for `format:check`. It half-failed (permission denied removing the untracked
task folder), leaving a duplicate `stash@{0}` and a failed `stash pop`. **No work was lost** —
verified by re-running the full gates (identical 460/460 and 39/39), then confirmed
`git diff stash@{0}` was empty before dropping only that stash. The 3 pre-existing stashes from
other branches are untouched. I should have used a git worktree instead of stashing.

## Test Infra Gaps Found

1. **`pnpm format:check` is unrunnable on a Windows checkout with `core.autocrlf=true`** —
   fails on 131 files for line endings alone, on any branch including untouched `development`.
   Classification: `harness-drift`. Suggested fix (out of scope here): add
   `endOfLine: "auto"` to the Prettier config, or a `.gitattributes` with `* text eol=lf`.
   This gate cannot serve as a signal for any local change until then.
2. **`process/context/tests/all-tests.md` is STALE** — it claims `packages/{types,utils}` have
   no test runner. `packages/utils` has a real vitest runner (`"test": "vitest run"`), which I
   ran live: 4 suites, 39 tests. Flagging for UPDATE PROCESS (the VALIDATE contract already
   noted this; confirming it independently).
3. **`pnpm --filter @jojopotato/api test -- <file>` does not filter** — it silently runs the
   whole suite. Use `npx vitest run <path>` from `packages/api` instead. Minor, cost me one
   ~107s run.
4. **No RN component/E2E runner in `apps/mobile`** (pre-existing, project-wide) — AC10 stays
   Agent-Probe. Unchanged by this plan.

## Owed / Not Done

- **AC10 (Agent-Probe, deep-linked unavailable deal):** **NOT performed.** Requires the mobile
  app running on a device/simulator against a seeded branch; no RN runner exists and I have no
  device. AC5 is the automated backstop for the "cannot actually place the order" half; the
  "details screen shows a clear not-available state" half is genuinely unverified. Per the
  plan's Phase Completion Rules this blocks **VERIFIED**, not CODE DONE.
- **Production pre-flight against a real production DB** — see Section 0. No production target
  appears to exist; re-run if one does.

## Closeout Packet

- **Selected plan:** `process/features/ordering-cart/active/menu-003-branch-availability_17-07-26/menu-003-branch-availability_PLAN_17-07-26.md`
- **Finished:** all 8 sections; 16 new tests; AC1-AC9 + multi-deal-line + no-bpa-row residual all
  Fully-Automated and green; AC5 additionally proven non-vacuous by a disable-and-watch-it-fail check.
- **Verified:** API 460/460, utils 39/39, 3/3 typechecks, 0 lint errors, AC4 no-diff regression lock.
- **Still unverified:** AC10 (Agent-Probe, owed); production pre-flight (no reachable production);
  `format:check` (blocked by a pre-existing environment issue, content proven clean).
- **Remaining cleanup:** commit checkpoint (nothing committed — left for the orchestrator);
  `all-tests.md` staleness fix at UPDATE PROCESS.
- **Single best next state: `Keep in active/testing`.** Code is complete and automated-green, but
  the plan's own Phase Completion Rules forbid marking it VERIFIED while AC10 is outstanding.

## Forward Preview

**Test Infra Found:** `packages/utils` vitest is real and green (39/39) — `all-tests.md` says
otherwise and is wrong. `packages/api` vitest+supertest needs docker + `db:migrate` first, and
its suites self-seed hermetically (reuse `makeBranch`/`makeProduct`/`attach`/`setAvailability`
patterns added here). `format:check` is environment-broken locally.

**Blast Radius Changes:** +1 new file (`routes/lib/deal-availability.ts`) — the shared
component-availability check, now the single source of truth for both the deals-menu read path
and order placement. Any future deal-visibility rule belongs there, not in either caller.
`Queryer` is now exported from `coupon-apply.ts` and is the standard db-or-tx type for new
`routes/lib` helpers.

**Commands to Stay Green:** `pnpm --filter @jojopotato/api test` (460), `pnpm --filter
@jojopotato/utils test` (39), the 3 typechecks. Skip `format:check` locally until the CRLF
config is fixed; trust CI.

**Dependency Changes:** none. No new packages, no migration, no schema change, no new endpoint.
