---
phase: merge-menu-api-reconciliation
date: 2026-07-13
status: COMPLETE
feature: general
plan: process/general-plans/active/merge-menu-api-reconciliation_13-07-26/merge-menu-api-reconciliation_PLAN_13-07-26.md
---

# Merge Menu API Reconciliation — EXECUTE + EVL Report (13-07-26)

## TL;DR

Second merge-conflict reconciliation this branch needed against `development` in the same session
(the first, `merge-cart-reconciliation`, is already archived). Integrated development's parallel
menu/branch feature — a decimal-peso backend, react-query data layer, and new menu UI components —
onto this branch's canonical cents backend and real order-placement flow. VALIDATE took **3 passes**
to reach PASS, and even then EXECUTE found **3 more** silent-auto-merge bugs VALIDATE's own
disposable-worktree probes had missed. EVL's independent money-unit sweep confirmed zero decimal
leaks remain. All gates green. Merge is staged but **NOT committed** — that is a separate follow-up
for `vc-git-manager`.

## What Was Done

- **Merge:** `git merge origin/development` produced exactly the plan's corrected prediction — 7
  real conflicts (`UU`/`AA`) + 4 auto-merge-clean files requiring explicit post-merge rewrites, 48
  files total (+3592/-620).
- **Gap A — cents-native catalog types:** promoted this branch's own local `MenuProduct`/
  `MenuProductOption`/`MenuCategory`/`BranchMenu` types (from the now-deleted
  `features/menu/lib/api-client.ts`) into `packages/types/src/menu.ts` as `Product`/`ProductOption`/
  `Category`/`ProductDetail`/`MenuResponse`, replacing development's auto-merged raw decimal types
  wholesale (not left coexisting). `MenuItem`/`MenuCategory` (cart-internal) unchanged.
- **Gap B — no dedicated product-detail endpoint:** `useProductDetails()` rewritten as a pure
  derivation over `useMenu()`'s cache; `useMenu()` gained `refetchInterval: 20_000` +
  `refetchOnWindowFocus: true`.
- **Gap C — BranchProvider vs CartSessionProvider composition:** confirmed (not hand-authored — the
  file auto-merges cleanly) `_layout.tsx`'s nesting order (`QueryClientProvider → AuthProvider →
  BranchProvider → CartSessionProvider`) and its `AppState`/`focusManager` bridge survived intact.
  Branch-switch-clear-confirm fires only at add-to-cart time, not at browse time.
- **Gap D — money-unit retargeting:** `AddToCartBar` prop renamed `unitPrice`→`unitPriceCents`;
  `product-to-menu-item.ts` rewritten (dropped `* 100`, `isAvailable` made a required param instead
  of defaulting to a nonexistent `product.isActive`); `packages/utils/src/pricing.ts` deleted;
  `packages/utils/src/product-options.ts` adopted as-is.
- **Gap E — option-grouping shape mismatch:** did NOT adopt `group-options.ts` (backend already
  groups by type); replaced with an inline `GROUP_ORDER` mapping in `[productId].tsx`; every
  `option.id` → `option.optionId` rename applied (5 occurrences across `option-group-selector.tsx`
  and `[productId].tsx`); `OptionGroup` type redefined inline (orphaned import fixed).
- **Gap F — BranchProvider filtered all branches to zero:** `getBranches()` now computes
  `isOpen: branch.isAcceptingPickup` per-branch (our `ApiBranch` has no `isActive` field, backend
  query already filters active-only).
- **Gap G — 3 distinct response envelope shapes:** `getBranches()` unwraps `body.branches`;
  `getMenu()` uses the bare `{branchId, categories}` shape directly; documented for any future
  `getBranch(id)` addition.
- **Superseded files deleted (5, not 7):** `features/branches/{hooks/use-branches.ts,lib/api-client.ts}`,
  `features/menu/{hooks/use-branch-menu.ts,lib/api-client.ts,lib/api-client.contract.ts}`.
  `features/shared/{use-async-data.ts,api-request.ts}` explicitly carved out (kept) — `features/orders/*`
  still depends on them. `screen-message.tsx` kept (3 real importers outside this plan's scope).
- **Contract-test intent preserved:** new `apps/mobile/src/lib/api-client.contract.ts` — a
  `satisfies`-based compile-time fixture asserting a realistic server-shaped literal against
  `Product`/`Category`/`MenuResponse`, replacing the deleted `features/menu/lib/api-client.contract.ts`
  (same regression-guard purpose the old EVL-cycle bug prompted).
- **New dependency:** `@tanstack/react-query` ^5.62.0 added to `apps/mobile/package.json`.
- **New UI adopted:** `features/menu/components/{add-to-cart-bar,branch-switcher,category-section,
  option-group-selector}.tsx`, `packages/ui`'s `AddOnSelector`.

## What Was Skipped or Deferred

- `features/orders/*` hooks were explicitly NOT migrated to react-query — out of scope per the
  user's decision #2 (scoped to menu/branch/product data only), matching development's own
  `query-client.ts` doc comment's stated scope boundary.
- Merge commit — intentionally left uncommitted (staged, `MERGE_HEAD` present) pending explicit
  user/orchestrator instruction to `vc-git-manager`.
- Cosmetic C7 finding (Touchpoints-preface wording bucketing `screen-message.tsx` under
  "Superseded (delete)" when its real resolution was "Evaluate for reuse") — non-blocking,
  optional, not applied.

## Test Gate Outcomes

| Gate | Strategy | Result |
|---|---|---|
| `git diff --check` (zero conflict markers) | Fully-Automated | PASS |
| `pnpm typecheck` (repo-wide) | Fully-Automated | PASS — 5/5 packages |
| `pnpm --filter @jojopotato/ui test` | Fully-Automated | PASS — 37/37 |
| `pnpm --filter @jojopotato/api test` | Fully-Automated | PASS — 47/47 (incl. orders/branches untouched) |
| Money-unit grep sweep (widened to all `apps/mobile/src`, C2) | Fully-Automated | PASS — zero decimal-catalog-field usages, zero `formatPricePHP` call sites, zero leftover `* 100`/`/ 100`, `pricing.ts` fully removed |
| Full order-placement flow (V-D, 5 sub-scenarios) | Hybrid + Agent-Probe | PASS (code-trace; no live device/simulator available) |
| Branch-listing regression (V-E, Gap F) | Hybrid | PASS (code-trace: `getBranches()` derivation confirmed correct) |

## Plan Deviations

Five within-blast-radius deviations, all documented at EXECUTE-time, none touching orders/auth/schema:

1. **`packages/ui/src/components/product-card.tsx`** — silently auto-merged to development's
   decimal `Product` type; restored to the cents-native `MenuItem` shape.
2. **`apps/mobile/src/features/cart/mock-cart.ts`** — same silent-auto-merge class; restored to
   cents `MenuItem` mocks.
3. **`apps/mobile/src/features/home/components/category-selector.tsx`** — same silent-auto-merge
   class; restored to cents-native shape.
4. (carried from VALIDATE) `packages/utils/src/product-options.ts` adopted verbatim as predicted,
   no changes needed.
5. (carried from VALIDATE) `product-to-menu-item.ts` retargeted per C5 exactly as predicted (default
   param removed, `isAvailable` made required).

**Why deviations 1-3 matter as a process finding:** these are a 3rd wave of the exact same failure
class VALIDATE's own disposable-worktree merge probes were designed to catch (§0/F1 of the plan) —
git silently auto-merging a file to development's decimal types with no conflict marker to force
anyone to look at it. VALIDATE found and fixed 4 such files across 3 passes; EXECUTE's own fresh
merge run surfaced 3 *more*, previously undetected by any of the 3 VALIDATE passes' static or
worktree-probe analysis. See "Notable Process Learning" below.

## Test Infra Gaps Found

- `apps/mobile` still has no automated test runner (repo-wide known-gap, tracked in
  `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`) — unchanged from
  prior plans this session.
- The disposable-worktree merge-probe technique proved valuable across 3 sessions now (this plan,
  `merge-cart-reconciliation`, and this plan's own 3 VALIDATE passes) but is still ad-hoc
  (`git worktree add --detach` run by hand each time) — scripting it (`scripts/merge-probe.sh`) is
  a real, repeatable process-infra gap, not just this plan's own note.

## SPEC Achievement

No standalone locked `*_SPEC_*.md` exists for this plan — same shape as `merge-cart-reconciliation`:
born directly as a PLAN (RESEARCH was orchestrator git reconnaissance answering 3 user clarifying
questions; INNOVATE was the user's 3 explicit locked decisions). The plan's 6 Acceptance Criteria
serve as the equivalent scored criteria:

| Criterion | Behavior | Status | Proven by |
|---|---|---|---|
| AC1 | Zero conflict markers; 7 conflicts + 4 auto-merge-clean files all correctly resolved | **met** | Fully-Automated (`git diff --check`) + EVL manual diff confirmation |
| AC2 | `pnpm typecheck`/`ui test`/`api test` all pass | **met** | Fully-Automated, PASS 5/5, 37/37, 47/47 |
| AC3 | No money-unit mismatch anywhere in `apps/mobile/src` | **met** | Fully-Automated grep sweep (widened scope) — EVL's independent sweep found zero, confirming EXECUTE's self-report |
| AC4 | Full order-placement flow works end-to-end with the new data layer, incl. branch-switch-confirm, availability reflection (poll + refocus), non-empty branch list | **met** | Hybrid + Agent-Probe (code-trace — no live device/simulator available) |
| AC5 | `menu.ts` superset merge structurally correct; dev's raw decimal types fully removed | **met** | Fully-Automated (typecheck) + EVL's dedicated exhaustive money-unit sweep confirming `menu.ts` is genuinely cents-native |
| AC6 | All 4 newly-discovered consumer files (F3) compile/function; `use-async-data.ts` remains available for out-of-scope order hooks | **met** | Fully-Automated (typecheck) + manual import-grep confirmation |

All 6 acceptance criteria are **met** by a passing Fully-Automated/Hybrid gate or an Agent-Probe
trace against real source. The plan's one documented Known-Gap (no mobile test runner, pre-existing)
is not the basis for any AC's "met" status.

**Residual not yet closed:** same as `merge-cart-reconciliation` — the Agent-Probe rows (V-D, V-E)
were confirmed by code-trace only, not an actual device/simulator run; not treated as blocking
archival, consistent with the two prior plans this session.

## Notable Process Learning — Why VALIDATE Took 3 Passes, and Why Even That Wasn't Enough

This plan's VALIDATE journey is worth recording explicitly as a durable process lesson, not just a
plan-specific footnote:

- **Pass 1 (BLOCKED, 3 FAILs + 4 CONCERNs):** the plan's original RESEARCH-time conflict analysis
  used a static `git merge-tree` read and claimed 11 conflict files. VALIDATE's first
  disposable-worktree merge probe (an actual `git worktree add --detach` + `git merge
  origin/development --no-edit`) found the real number was 7 — the other 4 auto-merge *cleanly*,
  with development's wrong decimal content landing silently. This is more dangerous than a real
  conflict: nothing forces a human or agent to look at the file. VALIDATE also caught a zero-branch
  filter bug (Gap F) and 3 missing consumer files (F3) that static Touchpoints analysis missed.
- **Pass 2 (BLOCKED, 1 new FAIL + 2 new CONCERNs):** re-running V1-V7 fresh (not trusting the pass-1
  fix list) found a 4th silent-auto-merge-class bug (F4: `api-request.ts` unconditionally marked
  DELETE despite `features/orders/lib/api-client.ts` — explicitly out-of-scope — still importing
  it), plus 2 more concerns (C5, C6) in the same "field/shape mismatch after retargeting" family.
- **Pass 3 (PASS):** re-ran V1-V7 a 3rd time from scratch, re-verified passes 1-2's fixes had not
  regressed, hand-traced C5/C6's type correctness against real promoted types, and ran an
  independent sweep specifically hunting for a "3rd occurrence of the carve-out bug class" and a
  "6th `option.id` occurrence" — found neither, reached PASS.
- **EXECUTE (the actual test):** even after 3 rigorous VALIDATE passes each anchored in a real
  disposable-worktree merge probe (not narrative review), the *real* merge run during EXECUTE
  surfaced **3 more** files in the exact same silent-auto-merge-to-decimal-types failure class
  (`product-card.tsx`, `mock-cart.ts`, `category-selector.tsx`) that no VALIDATE pass had found.

**The lesson:** for merge-reconciliation plans, a live disposable-worktree merge probe is
necessary but empirically **not sufficient** on its own — VALIDATE's probes ran against the
worktree state *at VALIDATE time*, and files git auto-merges silently are inherently the hardest
class to enumerate completely by inspection, because by definition nothing marks them for review.
The only fully reliable backstop that actually caught deviations 1-3 was EXECUTE's own **exhaustive
money-unit grep sweep run after the real merge landed**, re-confirmed independently by EVL. Future
merge-reconciliation plans should budget for this as an expected pattern (multiple VALIDATE
supplement cycles, plus a real chance EXECUTE finds more), not treat 3 VALIDATE passes as
unusually high friction — and should treat the post-merge grep sweep as the actual ground-truth
gate, not the pre-merge probe.

## Closeout Packet

1. **Selected plan path:** `process/general-plans/active/merge-menu-api-reconciliation_13-07-26/merge-menu-api-reconciliation_PLAN_13-07-26.md` (moved to `completed/` during this UPDATE PROCESS pass).
2. **Closeout classification:** **Ready for UPDATE PROCESS archival.** EVL is `HALTED_SUCCESS` with 0 open gaps (`results.tsv` row 7); every Fully-Automated gate is green; every Hybrid/Agent-Probe scenario was independently re-traced during EVL's exhaustive money-unit sweep, not merely EXECUTE's self-report. Same precedent as `pickup-order-flow` and `merge-cart-reconciliation`: archive on EVL-green, merge commit is a separate follow-up.
3. **What was finished:** see "What Was Done" above — merge resolved (7 conflicts + 4 auto-merge-clean rewrites + 3 EXECUTE-discovered fixes), Gaps A-G all applied, 5 superseded files deleted (2 carved out), react-query adopted, contract-test intent preserved.
4. **Verified vs unverified:** Verified — typecheck (5/5), UI tests (37/37), API tests (47/47), conflict-marker sweep, exhaustive money-unit sweep (EVL, independent of EXECUTE's self-report). Unverified — no live-device/simulator Agent-Probe run (code-trace only).
   4b. **Validate-contract compliance:** VALIDATE ran 3 passes (BLOCKED → SUPPLEMENT_APPLIED → BLOCKED → SUPPLEMENT_APPLIED → PASS). `## Validate Contract` section is present in the plan file, `generated-by: outer-pvl`, `Gate: PASS`, `date: 2026-07-13`.
5. **Cleanup done vs still needed:** Done this UPDATE PROCESS pass — `all-context.md` (menu/branch data-layer superseded note, Repository Structure tree, Technology Stack react-query entry, Types-first-placeholders correction), `process/features/ordering-cart/_GUIDE.md` and `process/features/pickup-branches/_GUIDE.md` (Key Source Files + superseded notes), `process/context/tests/all-tests.md` (stale `api-client.contract.ts` path fixed), `menu-product-browsing_10-07-26` superseded-note + archival, this report, plan archival. **Still needed, explicitly OUT OF SCOPE for this UPDATE PROCESS pass:** the merge itself is staged but **not committed** (`MERGE_HEAD` present on disk) — committing it is a separate follow-up action for `vc-git-manager`, not performed here. Also still open: a live-device Agent-Probe walkthrough.
6. **Single best next valid state:** `Invoke vc-git-manager for the merge commit (this is the "execution commit" for this plan — a merge commit, not a fresh diff), then a separate process commit for process/context + process/general-plans + process/features changes made in this UPDATE PROCESS pass. Note: this is the SECOND uncommitted merge this session — merge-cart-reconciliation's merge commit may need to land first (or be squashed together), depending on how the orchestrator sequences vc-git-manager for both.`
7. **Commit checkpoint:** **Execution commit (the merge itself) recommended before the process commit.** The staged merge is EVL-verified and ready to commit as-is. This UPDATE PROCESS pass's own changes (context docs, `_GUIDE.md` × 2, plan archival × 2, this report) belong in a separate, later process commit per the Two-Commit Content Rule. **Neither commit has been made by this agent** — both are recommended to the orchestrator, which should route to `vc-git-manager` next.
8. **Regression status:** N/A — not a phase-program phase closeout (single-pass COMPLEX plan). The EVL confirmation run is the regression check for this plan's blast radius: the full 47-test order-placement suite (untouched code paths) and the 37-test UI suite both re-confirmed green; the money-unit sweep is itself a regression check against the entire `apps/mobile/src` tree, not just the files this plan explicitly touched — this is exactly the check that would have caught deviations 1-3 pre-emptively had it been run before EXECUTE's own sweep (see Notable Process Learning).
9. **SPEC achievement:** see SPEC Achievement section above — 6/6 met, 1 residual (no live-device confirmation) explicitly recorded, not blocking.

## Forward Preview

### Test Infra Found
- `packages/api` vitest and `packages/ui` jest remain live and green. No `apps/mobile` runner.
- `apps/mobile/src/lib/api-client.contract.ts` — new compile-time wire-contract fixture, same
  regression-guard pattern as the file it replaced.

### Blast Radius Changes
- `apps/mobile`'s menu/branch data layer is now react-query-based (`lib/{api-client,query-client}.ts`,
  `features/branch/hooks/use-branch.ts`, `features/menu/hooks/{use-menu,use-product-details}.ts`).
  `features/branches/` fully removed. `packages/types/src/menu.ts` is cents-native, no longer a
  placeholder.

### Commands to Stay Green
- `pnpm typecheck` · `pnpm --filter @jojopotato/ui test` · `pnpm --filter @jojopotato/api test` ·
  `grep -rn "\.basePrice\b\|\.priceDelta\b" apps/mobile/src packages/types/src` (money-unit sweep).

### Dependency Changes
- Added: `@tanstack/react-query` ^5.62.0 (`apps/mobile` only).
- Removed: none at the package level (`packages/utils/src/pricing.ts` deleted, but that's a file, not a dependency).

## Drift Score

**HIGH** (4+ signals — 48 files touched in the merge [+2, ≥10-file band]; 3+ memory-worthy
observations [+1 — the 3-VALIDATE-pass silent-auto-merge pattern, the "even VALIDATE's probe wasn't
sufficient" lesson, the react-query scope-boundary precedent]; feature-folder structural change
[+1 — this plan archives + `menu-product-browsing_10-07-26` archives as superseded in the same
UPDATE PROCESS pass]; no harness/protocol files touched this session [+0]).
**Strongly recommend UPDATE PROCESS -- harness/protocol files touched.**
(Same caveat the two prior closeouts this session recorded: this HIGH-band phrase is the fixed
verbatim string the skill emits at 4+ signals — the actual triggering signals this session were
file-count + memory-worthy-observations + feature-structural-change, not harness/protocol edits.)
