---
phase: merge-cart-reconciliation
date: 2026-07-13
status: COMPLETE
feature: general
plan: process/general-plans/active/merge-cart-reconciliation_13-07-26/merge-cart-reconciliation_PLAN_13-07-26.md
---

# Merge Cart Reconciliation — EXECUTE Report (13-07-26)

## TL;DR

Merge executed, all 6 predicted conflicts resolved per the plan's recipe, 3 downstream consumers
reworked, `cart-totals.ts` deleted. All 3 automated/hybrid gates green (typecheck 5/5, UI 37/37,
API 47/47). All Agent-Probe scenarios pass by code-trace (no live device). One within-blast-radius
deviation (component-showcase.tsx fixture fields). Merge is staged but **NOT committed** (left for
explicit user instruction).

## What Was Done

- **Merge:** `git merge origin/development` produced EXACTLY the 6 predicted conflicts — no 7th, no
  drift. Confirmed against the plan's Merge Mechanics Step 1 list.
- **Conflict resolutions (Steps 2-7):**
  - `packages/types/src/cart.ts` — took development's version verbatim (canonical `Cart`/`CartItem`/`CartItemOption`/`AppliedDiscount`).
  - `apps/mobile/src/features/cart/hooks/use-cart.ts` — took dev's version; removed `MOCK_CART` import; added `EMPTY_CART` default; **applied Finding F1 fix** — `setBranch` now clears `items` + `appliedDiscount` on a real branch change (parity with pre-merge reducer).
  - `apps/mobile/src/app/_layout.tsx` — took dev's version (mounts `CartSessionProvider`, no `initialCart` prop → defaults to `EMPTY_CART`).
  - `apps/mobile/src/app/(tabs)/order/cart.tsx` — took dev's base; wired real `useBranch`/`useBranches`; render guards (`ScreenLoader`/`ScreenMessage`); real pickup estimate from `branch.estimatedPrepMinutes ?? 20`; cyclic `handleChangeBranch` over real branch list with `onChange` hidden when ≤1 branch; `productForLine` returns `imageUrl: undefined` (accepted cosmetic known-gap); removed all mock plumbing + dev-only button; **coupon UI replaced with static "Coupons coming soon" note** (Gap B).
  - `apps/mobile/src/app/component-showcase.tsx` — took dev's base; restored this branch's 7-value `ORDER_STATUSES` (`pending/accepted/preparing/flavoring/ready/completed/cancelled`); **+ deviation: restored required `PickupBranch` fields on both sample fixtures** (see Plan Deviations).
  - `packages/ui/src/components/__tests__/mocks.ts` — took dev's base; added `estimatedPrepMinutes: 20`/`isAcceptingPickup: true` to the single `MOCK_BRANCH` fixture (F4).
- **Consumer rework (Steps 8-10):**
  - `product/[productId].tsx` — new `addItem(menuItem, opts, qty)` signature; `CartItemOption[]` built inline from selected size/flavor; `categoryId` sourced via owning-category lookup (Gap A); `setBranch(branchId)` preserved immediately before `addItem` (F5 ordering); removed `SelectedOption`/`toSelectedOption` imports.
  - `checkout.tsx` — reads `cart`/`subtotalCents`/`clearCart` from `useCart()`; maps `CartItem.selectedOptions[].id` → `optionId` in the `POST /orders` body; empty-cart guard on `cart.items.length === 0`; removed `cart-totals` import.
  - Deleted `apps/mobile/src/features/cart/lib/cart-totals.ts` (re-confirmed zero external references via grep first).

## What Was Skipped or Deferred

- Coupon backend — out of scope (UI disabled instead, Gap B).
- Per-line cart image snapshot — accepted known-gap (`imageUrl: undefined`; `CartItem` renders a placeholder).
- Merge commit — intentionally left uncommitted (staged, `MERGE_HEAD` present) pending explicit user instruction.

## Test Gate Outcomes

| Gate | Strategy | Result |
|---|---|---|
| Conflict-marker sweep (`grep -rln '^<<<<<<<\|^>>>>>>>' apps/ packages/`) | Fully-Automated | PASS — NONE |
| `pnpm typecheck` | Fully-Automated | PASS — 5/5 packages |
| `pnpm --filter @jojopotato/ui test` | Fully-Automated | PASS — 37/37 tests, 19 suites |
| `pnpm --filter @jojopotato/api test` | Hybrid (local Postgres) | PASS — 47/47 tests, 6 files (unaffected, as predicted) |
| Product→cart→checkout→confirmation flow | Agent-Probe (code-trace) | PASS — see below |
| Coupon UI absent | Agent-Probe (code-trace) | PASS — static note only, no Input/Apply/CouponCard |
| Branch-switch no-mix (Home/Branches) | Agent-Probe (code-trace) | PASS — F1 hook fix |
| Branch-switch no-mix (product-add) | Agent-Probe (code-trace) | PASS — F5, same hook fix |
| Cart line image | Known-Gap | Accepted (placeholder rendered) |

### Agent-Probe code-trace findings (no live device available)

- **(a) Branch-switch clears cart from all 3 sites.** The fix lives in `CartSessionProvider.setBranch`: `prev.pickupBranchId === branchId ? prev : { ...prev, pickupBranchId: branchId, items: [], appliedDiscount: undefined }`. Verified exactly 4 `setBranch` callers app-wide (Home `index.tsx:32`, Branches `branches/index.tsx:25`, `cart.tsx`, product `[productId].tsx`), all routed through this hook. Home/Branches call `setBranch(newBranchId)` directly → items cleared on real change. Product screen calls `setBranch(branchId)` then `addItem(...)` → different-branch items cleared first, new item added under the new branch. Same-branch re-selection returns `prev` unchanged (no spurious clear). All 3 clear rather than mix.
- **(b) POST /orders body is valid with non-undefined ids.** `productId = item.menuItemId` (real product id from `MenuItem.id`); `optionId = o.id` where `CartItemOption.id` is sourced from `selectedSize.optionId`/`selectedFlavor.optionId` (real menu-API UUIDs). Products without options → empty `selectedOptions: []` (valid per zod schema). Mapping is compile-time enforced (`placeOrder: (input: CreateOrderInput) => ...`, not `any`); typecheck passed → structurally correct.

## Plan Deviations

1. **component-showcase.tsx sample fixtures** — restored `estimatedPrepMinutes`/`isAcceptingPickup` on both `SAMPLE_BRANCH` (20/true) and `SAMPLE_BRANCH_CLOSED` (25/false). Merge Mechanics Step 6 named only the `ORDER_STATUSES` edit; taking dev's version verbatim dropped these two required `PickupBranch` fields (TS2739 x2 at first typecheck). Within-blast-radius (same Touchpoint-5 file, same edit class as Step 7's mocks.ts restore, values match prior HEAD, F4 already documented the two-branch demo). No hard-stop surface. Recorded in the plan's new `## Deviations` section.

## Test Infra Gaps Found

- No RN test runner for `apps/mobile` — the F1/F5 branch-switch invariant and the e2e order flow have Agent-Probe (code-trace) coverage only. Pre-existing repo-wide gap (tracked at `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`). A `CartSessionProvider.setBranch` unit test is the cheapest future guard once Jest/Vitest lands for the app.

## SPEC Achievement

No standalone locked `*_SPEC_*.md` exists for this plan — this was a merge-conflict reconciliation
born directly as a PLAN (RESEARCH was orchestrator git reconnaissance answering a user clarifying
question; INNOVATE was the user's explicit locked architecture choice — see the plan's Decision
Summary). The plan's 8 Acceptance Criteria serve as the equivalent scored criteria:

| Criterion | Behavior | Status | Proven by |
|---|---|---|---|
| AC1 | Zero unresolved conflict markers anywhere in the repo | **met** | Fully-Automated grep sweep, PASS |
| AC2 | `pnpm typecheck` exits 0 across all workspace packages | **met** | Fully-Automated, PASS 5/5 |
| AC3 | `pnpm --filter @jojopotato/ui test` exits 0 | **met** | Fully-Automated, PASS 37/37 |
| AC4 | `pnpm --filter @jojopotato/api test` exits 0 | **met** | Hybrid (local Postgres), PASS 47/47 |
| AC5 | Full product→cart→checkout→confirmation flow works end-to-end on the new cart shape | **met** | Agent-Probe (code-trace — no live device/simulator available this session) |
| AC6 | Coupon-apply UI is disabled/hidden in the merged cart screen | **met** | Agent-Probe (code-trace) |
| AC7 | `cart-totals.ts` deleted with zero dangling references | **met** | Fully-Automated grep sweep, PASS |
| AC8 | Branch-switch (Home/Branches tabs, and the product-add path per Finding F5) does not silently mix branches | **met** | Agent-Probe (code-trace) — both traced against the actual `setBranch` fix in `use-cart.ts` |

All 8 acceptance criteria are **met** by a passing Fully-Automated/Hybrid gate or an Agent-Probe
trace against real source (no criterion rests on a Known-Gap residual). The plan's one documented
Known-Gap (cart line rows render with no product image, `imageUrl: undefined`) is an explicitly
accepted cosmetic residual, not the basis for any AC's "met" status — consistent with the
validate-contract's Net-Gate Vacuous-Green Check.

**Residual not yet closed:** the Agent-Probe rows above were confirmed by code-trace only (reading
the live source and reasoning through the execution path), not by an actual run on a device or
simulator — none was available in this environment, same limitation `pickup-order-flow` recorded.
This is a real, load-bearing gap for AC5/AC6/AC8 specifically (see Test Infra Gaps Found) and should
be closed with a live walkthrough at the next opportunity a simulator/device is available, but it is
not treated as blocking archival here (it wasn't blocking for `pickup-order-flow` either, and no
mechanical gate would improve on code-trace without a mobile test runner that doesn't exist yet).

## Closeout Packet

1. **Selected plan path:** `process/general-plans/active/merge-cart-reconciliation_13-07-26/merge-cart-reconciliation_PLAN_13-07-26.md` (moved to `completed/` during this UPDATE PROCESS pass).
2. **Closeout classification:** **Ready for UPDATE PROCESS archival.** EVL is `HALTED_SUCCESS` with 0 open gaps (`results.tsv` row 5); every Fully-Automated/Hybrid gate is green; every Agent-Probe scenario was independently re-traced against live source during EVL, not merely execute-agent's self-report. Precedent: `pickup-order-flow` was archived under the identical condition (EVL-green, code-complete, execution changes still uncommitted at archival time) — this plan follows the same convention for consistency.
3. **What was finished:** see "What Was Done" above — merge resolved (6/6 predicted conflicts, no drift), 3 consumers reworked, `cart-totals.ts` deleted, Finding F1 + F5 regression fix applied and verified.
4. **Verified vs unverified:** Verified — typecheck (5/5), UI tests (37/37), API tests (47/47, live Postgres), conflict-marker sweep, F1/F5 fix correctness (byte-for-byte source re-read at both VALIDATE and EVL). Unverified — no live-device/simulator Agent-Probe run (code-trace only, see SPEC Achievement residual note above).
   4b. **Validate-contract compliance:** VALIDATE ran twice (baseline BLOCKED on Finding F1, 13-07-26; re-validation PASS after 1 PVL-supplement cycle, same day, Finding F5 found+resolved inline). `## Validate Contract` section is present in the plan file, `generated-by: outer-pvl`, `Gate: PASS`.
5. **Cleanup done vs still needed:** Done this UPDATE PROCESS pass — `all-context.md` (cart architecture superseded note), `process/features/ordering-cart/_GUIDE.md`, superseded-note + archival on the now-obsolete `cart-screen_09-07-26` plan, this report's SPEC Achievement section, plan archival. **Still needed, and explicitly OUT OF SCOPE for this UPDATE PROCESS pass:** the merge itself is staged but **not committed** (`MERGE_HEAD` present on disk) — committing it is a separate follow-up action for `vc-git-manager`, not performed here. Also still open: a live-device Agent-Probe walkthrough (see SPEC Achievement residual).
6. **Single best next valid state:** `Invoke vc-git-manager for the merge commit (this is the "execution commit" for this plan — a merge commit, not a fresh diff), then a separate process commit for process/context + process/general-plans + process/features changes made in this UPDATE PROCESS pass.`
7. **Commit checkpoint:** **Execution commit (the merge itself) recommended before the process commit.** The staged merge (`git status` shows 19 modified/added/deleted files across `apps/mobile`, `packages/types`, `packages/ui`) is EVL-verified and ready to commit as-is — `git commit` (no `--no-verify`, no message needed beyond the default merge message unless the user wants a custom one) will complete the in-progress merge. This UPDATE PROCESS pass's own changes (context docs, `_GUIDE.md`, plan archival ×2, this report) belong in a separate, later process commit per the Two-Commit Content Rule. **Neither commit has been made by this agent** — both are recommended to the orchestrator, which should route to `vc-git-manager` next.
8. **Regression status:** N/A — not a phase-program phase closeout (single-pass COMPLEX plan). The EVL confirmation run is the regression check for this plan's blast radius: all 2 previously-shipped screens that call `setBranch()` (Home, Branches tabs) plus the 1 newly-identified caller (`product/[productId].tsx`) were re-traced and confirmed protected by the Step 3 fix — this is exactly the regression `pickup-order-flow`'s own order-placement flow was at risk of, and it held.
9. **SPEC achievement:** see SPEC Achievement section above — 8/8 met, 1 residual (no live-device confirmation) explicitly recorded, not blocking.

## Forward Preview

### Test Infra Found
- `packages/api` vitest and `packages/ui` jest are live and green. No `apps/mobile` runner.

### Blast Radius Changes
- `apps/mobile` cart is now `Cart`/`CartItem`/`CartSessionProvider`-shaped (dev's canonical model) with real backend wiring. `CartLine`/`CartProvider`/`cart-totals.ts` fully removed.

### Commands to Stay Green
- `pnpm typecheck` · `pnpm --filter @jojopotato/ui test` · `pnpm --filter @jojopotato/api test` (needs local Postgres).

### Dependency Changes
- None. No new packages; `packages/api` untouched.

## Drift Score

**HIGH** (4 signals — 19 files touched in the merge [+2, ≥10-file band]; 3+ memory-worthy
observations [+1 — Finding F1/F5 regression-catch pattern, the "merge is not a fresh diff" commit
handling, and the CART-001 plan-supersession precedent]; feature-folder structural change [+1 —
this plan archives + `cart-screen_09-07-26` archives as superseded in the same UPDATE PROCESS pass];
no harness/protocol files touched this session [+0]).
**Strongly recommend UPDATE PROCESS -- harness/protocol files touched.**
(Note, same caveat `pickup-order-flow`'s closeout recorded: this HIGH-band phrase is the fixed
verbatim string the skill emits at 4+ signals — the actual triggering signals this session were
file-count + memory-worthy-observations + feature-structural-change, not harness/protocol edits.)
