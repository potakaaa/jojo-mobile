---
phase: home-all-branches
date: 2026-07-22
status: COMPLETE_WITH_GAPS
feature: ordering-cart
plan: process/features/ordering-cart/active/home-all-branches_22-07-26/home-all-branches_PLAN_22-07-26.md
---

# EXECUTE REPORT — Home Tab Shows All-Branch Products

**TL;DR** — All 5 work groups implemented. 11 of 12 acceptance criteria are proven by real,
non-vacuous automated tests (AC12 is the standing user-run Agent-Probe walkthrough). Every gate in
my blast radius is green. Three gates are red **for reasons entirely outside this plan**: two other
agents were writing to the same working tree during this session and left a failing typecheck, a
failing jest suite, and an unformatted file in `notifications`/`staff` — all in untracked files
created after my session started, none of which I touched.

---

## What Was Done

### Work Group 1 — `GET /products` (new all-branch catalog route)

- **`packages/api/src/routes/products.ts`** (new). Returns every active, non-deal product joined to
  its active category, in the `{ categories: [{ id, name, products }] }` envelope the branch menu
  and `/deals/products` already use. Takes **no `branchId`** — branch-agnostic by construction, so
  the Home grid cannot dead-end on a thin branch. Three queries total (products+categories,
  options, availability), never one per product.
- Each product carries `branches: { id, name }[]` — the branches that carry it right now, filtered
  to `is_active = true AND is_accepting_pickup = true` (VALIDATE correction P2), matching
  `useBranch()`'s own client-side `openOnly()` filter so the subtext and the switch target can only
  ever name a branch the customer can actually select.
- **`packages/api/src/routes/lib/serializers.ts`** — added `ApiProductBranch` and a 6th optional
  trailing param `branches?` on `serializeMenuProduct`, following the existing
  `available?`/`scheduleWindows?` convention.
- **`packages/api/src/index.ts`** — `app.use('/products', productsRouter)` mounted public/no-auth,
  sibling to `/branches`. No path collision (verified against all 14 existing mounts).
- **`packages/types/src/menu.ts`** — additive `ProductBranch` type + `Product.branches?` and
  `MenuItem.branches?`.

### Work Group 2 — additive `branches` on `GET /deals/products`

- **`packages/api/src/routes/deals-products.ts`** — fetches the active + accepting-pickup branch
  list once, then calls `resolveAvailableDealProductIds` **verbatim** per branch and aggregates.
  Availability logic is never re-derived, preserving the MENU-003 invariant that browse and
  placement cannot disagree. Inline comment marks ~15-20 branches as the revisit trigger.
- `available: boolean` is **unchanged** and still emitted — regression-locked by a test.

### Work Group 3 — `subtext` prop + formatter

- **`packages/ui/src/components/product-card.tsx`** and **`deal-card.tsx`** — additive optional
  `subtext?: string`, rendered as an unlabeled caption row with a `testID` handle, mirroring
  `DealCard.scheduleSummary`'s existing treatment. `mode: ThemeMode` stays required.
- **`apps/mobile/src/features/home/lib/format-branch-subtext.ts`** (new, TDD-first) — `0/undefined
  → undefined` (no row), `1 → the branch name`, `2+ → "Available at N branches"`.

### Work Group 4 — shared confirm-then-switch hook

- **`apps/mobile/src/features/branch/hooks/use-confirm-branch-switch.ts`** (new) — extracted from
  `(tabs)/product/index.tsx`. Exposes `{ pendingBranchId, requestSwitch, confirm, cancel,
  willClearCart }`. `confirm()` resolves the full `PickupBranch` from `useBranch().branches`,
  conditionally clears the cart, then calls **both** `useCart().setBranch()` **and**
  `useBranch().setSelectedBranch()` (VALIDATE correction P1 — load-bearing, see Deviations). It
  never navigates and never adds to cart.
- **`(tabs)/product/index.tsx`** — now a *caller* of the hook. The screen keeps its own
  `pendingAdd` payload ("what to do after"); the hook owns only branch-switch state. Dialog copy,
  button labels, and the conditional-clear condition are unchanged.

### Work Group 5 — Home + Deals integration

- **`apps/mobile/src/lib/api-client.ts`** — `getAllBranchProducts()`.
- **`apps/mobile/src/features/menu/hooks/use-all-branch-products.ts`** (new) — no `enabled` gate,
  no branch in the query key. Lives alongside `useMenu()`, which is untouched.
- **`apps/mobile/src/features/home/lib/all-branch-products-to-home-view.ts`** (new, TDD-first) —
  flattens + dedupes by product id (first occurrence wins), threading `branches` onto each
  `MenuItem`.
- **`product-grid.tsx`** — passes `subtext={formatBranchSubtext(item.branches)}` (VALIDATE
  correction P4: without this, the formatter and the prop would both exist but never connect).
- **`(tabs)/index.tsx`** — grid source swapped to the all-branch query; the "Select a branch to see
  the menu" gate removed and the "Menu coming soon" state now fires only for a genuinely empty
  catalog; proactive cross-branch check on both `openProduct` and `openDeal`; `ConfirmDialog` +
  `Toast` added; deals strip gets `subtext` and stops passing `available`.
- **`(tabs)/deals/index.tsx`** — same treatment; stale header doc-comment fixed (E4).

---

## Per-AC Evidence

| AC | Strategy | Proving test | Result |
|---|---|---|---|
| AC1 all-branch merge, deduped | Fully-Automated | `products.test.ts` "returns each product exactly ONCE…" + `all-branch-products-to-home-view.test.ts` "emits ONE MenuItem per distinct product id" | PASS |
| AC2 single-branch subtext = name | Fully-Automated | `format-branch-subtext.test.ts` + `products.test.ts` "carries a single-branch product with exactly one entry" + Home render test | PASS |
| AC3 multi-branch subtext = real count | Fully-Automated | `format-branch-subtext.test.ts` + `products.test.ts` "carries every carrying branch" + Home render test | PASS |
| AC4 no dead "Menu coming soon" | Fully-Automated + Hybrid | merge-helper "still yields products when the selected branch carries none" + Home "renders the all-branch grid even when the selected branch carries nothing" | PASS |
| AC5 same-branch tap opens directly | Hybrid | `product-grid.test.tsx` "a same-branch tap navigates immediately with no dialog" | PASS |
| AC6 cross-branch dialog names branch; cancel no-op | Hybrid | `product-grid.test.tsx` "…and cancel is a no-op" + Deals-tab equivalent | PASS |
| AC7 confirm switches (both stores) then navigates | Hybrid | `use-confirm-branch-switch.test.tsx` "switches BOTH the cart branch and the selected pickup branch" + `product-grid.test.tsx` "confirming switches both branch stores BEFORE navigating" | PASS |
| AC8 Home deals strip never unavailable-by-mismatch | Hybrid | `product-grid.test.tsx` "never renders the unavailable badge for a mere branch mismatch, and shows subtext" | PASS |
| AC9 Deals tab matches AC8 | Hybrid | `(tabs)/deals/__tests__/index.test.tsx` (7 tests) + flipped assertion in `deals-screens.test.tsx` | PASS |
| AC10 category filter over merged list | Fully-Automated | `filter-products-by-category.test.ts` re-run unmodified + merge-helper "produces a list the existing category filter still narrows correctly" | PASS |
| AC11 cross-branch placement still impossible | Fully-Automated | `orders.test.ts` `POST /orders — MENU-003 deal component availability` block (5 tests) + `deals-products.test.ts` placement block, re-run unmodified; zero server placement code touched | PASS (clean run) |
| AC12 on-device walkthrough | Agent-Probe | user-run | **OWED** |
| — regression guard | Hybrid | `cart-branch-switch.test.tsx` + `product-branch-switch.test.tsx` | PASS |
| — theming constraint | Fully-Automated | `guard:theme-mode` + `check-tokens` | PASS |

**Non-vacuity spot-checks (done, not assumed):** the merge-helper tests fail if dedup degrades to a
passthrough; the subtext tests fail if the formatter always returns a count or always `undefined`;
the AC7 hook test fails if `setSelectedBranch` is removed — which is precisely the defect VALIDATE
caught and which no pre-existing regression test could have detected.

---

## Test Gate Outcomes

Commands as specified in the plan's Exact Commands section.

| Gate | Result |
|---|---|
| `pnpm --filter @jojopotato/api test` (full) | see "Full API suite" below — untrustworthy under concurrent DB use |
| `packages/api` — `orders` + `branches` + `products` + `deals-products` (blast radius + AC11) | **148 passed / 4 files, clean run** |
| `pnpm --filter @jojopotato/mobile test` — vitest portion | **122 passed** (includes my +15: 6 subtext + 9 merge-helper) |
| `pnpm --filter @jojopotato/mobile test` — jest portion, my scope | **170 passed / 33 suites** (includes my +27: 9 hook + 11 Home + 7 Deals-tab) |
| `pnpm --filter @jojopotato/ui test` | **124 passed / 32 suites** (was 113 — +11 new subtext tests) |
| `prettier --check` on every file I touched | clean |
| `pnpm --filter @jojopotato/ui check-tokens` | OK — no raw hex literals |
| `pnpm --filter @jojopotato/mobile guard:theme-mode` | OK — 32 components, 235 call sites, 0 violations |
| `pnpm --filter @jojopotato/types typecheck` | clean |
| `pnpm --filter @jojopotato/api typecheck` | clean |
| `pnpm --filter @jojopotato/ui typecheck` | clean |
| `pnpm --filter @jojopotato/mobile typecheck` | **7 errors — all in one concurrent-workstream file, see below** |
| `pnpm --filter @jojopotato/{ui,api,types} lint` | 0 errors |
| `pnpm --filter @jojopotato/mobile lint` | **2 errors — both in concurrent-workstream files, see below** |
| `pnpm format:check` | **1 file — concurrent-workstream, see below** |

### Full API suite

**The full-suite command could not produce a trustworthy result this session, because another
agent was running `packages/api` tests against the same Postgres at the same time.** Stating that
plainly rather than reporting a number I do not believe:

- **Run 1:** 729 passed / 1 failed (730). The one failure was
  `admin-deals.integration.test.ts > 404s attaching to a non-existent deal` — a 30s **timeout**,
  not an assertion failure, in an 831s run. That suite re-run in isolation: **74/74 passed.**
- **Run 2:** 637 passed / 31 failed / 65 skipped, with a Postgres **`FATAL 08P01`** protocol error
  on a torn-down connection — the signature of the shared test DB being dropped underneath a
  live run, not of any assertion breaking.
- **Run 3 (targeted), attempt 1:** aborted in `test/global-setup.ts` with Postgres
  **`55006 — There is 1 other session using the database`** while trying to `DROP DATABASE`. This
  is direct, unambiguous proof of the concurrent run.
- **Run 3, attempt 2 (after the other run released the DB): CLEAN — 148 passed / 4 files**, covering
  `orders.test.ts` (including the entire `POST /orders — MENU-003 deal component availability`
  block that AC11 names), `branches.test.ts` (the single-branch menu contract this plan must not
  change), plus both new/changed route suites.
- **Run 4 (full, retried): 540 passed / 61 failed / 132 skipped.** Failure signature: **11×
  `42P01 — relation "users" / "branches" / "products" / "session" does not exist`.** The tables were
  removed from underneath the run. Confirmed live: `ps` showed a second `vitest` process (pid
  59353, launched via `pnpm --filter`) executing at that moment. These are not assertion failures —
  the schema itself vanished mid-run because the other process's `global-setup` dropped and
  recreated the fixed-name test database.

This is the already-filed `api-test-db-concurrency-guard_NOTE_17-07-26.md` gap: the vitest
global-setup drops and recreates a fixed-name test DB with no concurrency guard. **No failure in
any run was an assertion failure in code this plan touches** — they were connection teardowns
(`08P01`), a drop-blocked setup (`55006`), and missing tables (`42P01`). Every gate the plan
actually names is green on a clean run. A whole-suite confirmation should be re-run on a quiet
tree; I stopped retrying rather than burn ~10 minutes per attempt against a DB another agent is
actively recreating.

### Concurrent-workstream contamination (NOT caused by this plan)

Two other agents were editing this same working tree during my session. Their files are untracked
and were created **after** my session began (timestamps below), and I touched none of them:

| File | Created | Breaks |
|---|---|---|
| `apps/mobile/src/features/notifications/lib/__tests__/prompt-and-register.test.ts` | 11:40 | 7 `mobile typecheck` errors (TS2558 jest-generic arity) |
| `apps/mobile/src/features/staff/hooks/__tests__/use-completed-orders.test.tsx` | 11:47 | 1 jest failure + 1 lint error |
| `apps/mobile/src/features/staff/hooks/__tests__/use-staff-order-detail.test.tsx` | 11:47 | 1 lint error |
| `packages/api/src/routes/__tests__/staff-order-notification.integration.test.ts` | 11:44 | 1 `format:check` warning |
| `packages/api/src/routes/orders.ts` (+11 lines), `notification-dispatch.ts`, `packages/types/src/notifications.ts`, 9 `(staff)`/`(onboarding)`/`checkout` screens | during session | — |

**On `orders.ts` specifically:** the plan lists it under hard safety constraints ("do not weaken
`POST /orders`'s branch-availability rejection"). **My diff touches it zero times.** The +11 lines
present in the working tree are the `push-notifications-fixes` workstream adding an awaited staff
push dispatch *after* the placement transaction commits; the availability rejection is untouched,
and the full MENU-003 block still passes (verified on the clean run above).

Evidence that my scope is clean: with only `features/staff/hooks/__tests__` excluded, jest is
**33 suites / 170 tests, all passing**; every mobile typecheck error names that one notifications
file and no file of mine; `format:check` passes on every file I touched.

**I deliberately did not "fix" these** — they are outside this plan's blast radius and belong to
plans still in flight. Whoever runs EVL should expect these three reds and attribute them
correctly, or re-run on a clean tree.

---

## Plan Deviations

All are within-blast-radius. None touch auth, billing, schema, or a public API contract removal.

**D1 — `confirm()` returns `Promise<boolean>`, not `Promise<void>`.**
The plan's Public Contracts item 4 specifies `confirm(): Promise<void>` but simultaneously requires
the not-found edge case to "reject/no-op" and requires the caller (E2) to show an error toast and
not navigate. A boolean result is the only non-throwing way to satisfy both. `await confirm()`
still works exactly as the plan describes.

**D2 — the hook exposes `willClearCart`.**
Not in the plan's API shape. Added so callers can honestly say "your current cart will be cleared"
in the dialog before the customer commits — the SPEC's user story explicitly asks to "be told what
happens to my cart". Purely derived state; no new mutation.

**D3 — the "same-branch request is a no-op" rule needed a definition.**
The plan named the behaviour but not the predicate. Implemented as: no-op only when the target is
already **both** the selected pickup branch and the cart's branch (i.e. genuinely nothing to
change). This keeps the pre-existing Product Details flow working (there the cart is stale, so it
correctly stages a switch).

**D4 — `serializeMenuProduct` emits `branches: []`, it does not omit an empty array.**
The plan contradicted itself: the Work Group 1 serializer step said "emit only when non-empty",
while the Work Group 1 test step required a 0-branch product to return `branches: []`. I followed
the explicitly-named test assertion. Only `undefined` (i.e. a caller that deals in no all-branch
data, such as `GET /branches/:id/menu`) omits the key, so that route's body stays byte-identical —
locked by a new assertion in `products.test.ts`.

**D5 — `MenuItem.isAvailable` stays `true` for a product no branch carries.**
The plan did not specify. Matching `flattenMenuForHome`'s existing behaviour was the smaller
change; setting it `false` would have added a "Sold out" badge and a disabled card that no AC asks
for. A product carried nowhere simply renders without a subtext.

**D6 — three test files needed adjustment (documented per the plan's own instruction).**

1. `product-branch-switch.test.tsx` — **mock completeness**: added `branches` + `setSelectedBranch`
   to the `useBranch` fixture. Exactly the "necessarily-adjusted mocks" case the plan anticipated.
   No assertion changed.
2. `product-branch-switch.test.tsx` — **assertion mechanism**: `expect(addItem)
   .toHaveBeenCalledTimes(1)` became `await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1))`.
   The assertion is identical; only its timing changed, because the plan's own D4 ordering
   constraint requires the caller to act *after* `confirm()` resolves, which moves `addItem` one
   microtask later. `clearCart` and `setBranch` still fire synchronously and are still asserted
   synchronously. **The asserted dialog copy and button labels are untouched**, as the plan's hard
   safety constraint requires.
3. `deals-screens.test.tsx` — **behaviour change, mandated by AC9**: the test asserting a
   branch-unavailable deal renders the "Unavailable at this branch" badge now asserts the opposite
   (no badge; branch subtext instead). DEAL-004's flag-not-hide is unchanged — the deal is still
   listed — but AC9 explicitly requires that presentation to go away on this browse surface. Deal
   Details' `available`-gated CTA is untouched and still tested.
   Plus mock completeness (`useBranch`) in `deals-screens.test.tsx`, `deals-refresh.test.tsx`, and
   `home-refresh.test.tsx` (the last also repointed from `useMenu` to `useAllBranchProducts` — its
   AC4 "one pull refetches every mounted query" premise is unchanged).

**D7 — hook-level tests use a render probe, not RTL's `renderHook`.**
`renderHook` leaves `result.current === null` in this dependency graph. The probe reads the live
hook value through `renderWithProviders`, which is the repo's established flushing helper.

### Execute-Agent Instructions

| # | Outcome |
|---|---|
| E1 | Followed — `ConfirmDialog.message` used as free-form per-call text; no `packages/ui` change for dialog copy. |
| E2 | Followed — both callers show an error toast and do not navigate when `confirm()` reports the branch is gone. |
| E3 | **Verified.** `available` on `/deals/products` is `resolveAvailableDealProductIds`'s verdict for the *selected* branch only. Its non-branch causes (zero components, a globally-inactive component) are false at *every* branch, which surfaces as `branches: []`. So `branches.length === 0` fully subsumes them, and Home/Deals stop passing `available` entirely. |
| E4 | Done — `deals/index.tsx` header comment corrected (it referenced the old branch-scoped route). |
| E5 | Followed — `useMenu()` and `flattenMenuForHome` both retained. `useMenu()` is still live (Order tab, Rewards tab, `use-product-details.ts`). `flattenMenuForHome` now has **no production consumer** — flagged as a follow-up cleanup candidate below, deliberately not deleted. |

---

## Test Infra Gaps Found

- **`packages/api` test-DB contention** — pre-existing and already filed
  (`admin-dashboard/backlog/api-test-db-concurrency-guard_NOTE_17-07-26.md`). Observed live again
  this session, three times, with hard evidence (`55006` on `DROP DATABASE`, `FATAL 08P01` mid-run).
  This session escalates the note's severity from "requires a frozen-tree re-run for trustworthy
  evidence" to "makes the full suite unrunnable while any other agent uses the DB". No new note
  filed — the existing one covers it; it should be re-read before trusting any whole-suite number.
- **Shared-working-tree contamination** — three agents writing to one checkout made three gates red
  for reasons unrelated to any one plan, and made `format:check`/`typecheck` unusable as
  whole-repo signals. This is a workflow/process gap rather than a test-runner gap; recorded here
  rather than filed, since it is a scheduling decision, not a code defect.
- **No RN E2E/navigation runner** — the standing project-wide gap behind AC12. Already documented
  in `process/context/tests/all-tests.md` §Known Gaps; explicitly **not** new debt per the SPEC.

---

## What Was Skipped or Deferred

- **AC12** — the on-device Agent-Probe walkthrough (light/dark grid render, dialog copy reads
  naturally, branch-switch lands on Product Details with no "not available" flash, Deals strip/tab
  subtext). User-run; cannot be automated here. Per the plan's Phase Completion Rules the task
  folder **stays in `active/`** until this is performed.
- **`flattenMenuForHome` removal** — now unused in production. Left in place per E5; a genuine
  follow-up cleanup candidate, not this plan's work.
- **The pre-existing unused `useQuery` import** in `(tabs)/index.tsx` — verified pre-existing via
  `git show HEAD:apps/mobile/src/app/\(tabs\)/index.tsx` (it was already import-only before my
  change). Left untouched to avoid an unspecified refactor; noted here so it is not mistaken for
  something this plan introduced.

- **The `GET /products` "empty catalog" early-return is not directly tested.** Work Group 1 step 5
  listed an "empty-catalog case", but it is structurally unreachable against the shared seeded dev
  DB, and the suite's own hermetic rule forbids asserting global emptiness. The same early return in
  `deals-products.ts` is untested for the same reason, so this matches existing precedent rather
  than lowering the bar. The Home-screen side of that state *is* covered ("shows the
  genuinely-empty-catalog state only when there are no products at all").

## Follow-up plan stubs created

None. No gap discovered during execution required deferring in-scope work.

## CONTEXT_PARTIAL items

None.

---

## Closeout Packet

- **Selected plan:**
  `process/features/ordering-cart/active/home-all-branches_22-07-26/home-all-branches_PLAN_22-07-26.md`
- **Finished:** all 5 work groups; 11/12 ACs proven by real automated tests; both mandatory
  regression suites green; theming guards green.
- **Verified vs unverified:** everything except AC12 is automated-verified. AC12 is unverified and
  owed by the user.
- **Remaining:** the AC12 walkthrough; a decision on committing (nothing was committed — 21 files
  are uncommitted on `development`, intermingled with two other agents' uncommitted work, so the
  commit should be scoped by path).
- **Best next state:** `Keep in active/testing`.

## Forward Preview

**Test Infra Found** — `apps/mobile` jest + vitest, `packages/ui` jest-expo, `packages/api`
vitest+supertest against a live local Postgres (native instance on :5432; `docker compose` is
unavailable on this machine, matching the documented dev-machine gotcha). RTL's `renderHook` does
not work here — use a render probe via `renderWithProviders`.

**Blast Radius Changes** — one new public route (`GET /products`), one additive response field on
`GET /deals/products`, two additive `packages/ui` props, two additive `packages/types` fields, one
new shared hook. `GET /branches/:branchId/menu` and `POST /orders` are provably untouched.

**Commands to Stay Green**

```
pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test
pnpm --filter @jojopotato/mobile test
pnpm --filter @jojopotato/ui test
pnpm --filter @jojopotato/mobile guard:theme-mode
pnpm --filter @jojopotato/ui check-tokens
pnpm format:check
```

**Dependency Changes** — none. No new packages, no migration, no schema change.

---

## Open Item

A whole-suite `packages/api` confirmation on a quiet tree is still owed as corroboration. It is
**not** a gap in this plan's coverage: every gate the validate-contract names is green on a clean,
uncontended run (148/148 across the four relevant suites, plus 74/74 on `admin-deals` in
isolation). The blocker is environmental — another agent's concurrent test run — not the code.
