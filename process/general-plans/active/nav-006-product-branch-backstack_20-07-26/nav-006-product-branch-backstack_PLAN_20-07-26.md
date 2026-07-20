---
name: plan:nav-006-product-branch-backstack
description: "Fix Product/Branch detail back-stack doubling by mirroring the NAV-005 Tracking static-index-anchor + centralized-nav-helper pattern"
date: 20-07-26
feature: none
---

# NAV-006 — Product & Branch Detail Back-Stack Fix (SIMPLE)

**Date**: 20-07-26
**Status**: ACTIVE — PLAN written, VALIDATE pending
**Complexity**: SIMPLE
**Context:** see `process/context/all-context.md` (mobile theming + test-tier discipline) and `process/context/tests/all-tests.md`

**TL;DR:** Product and Branch detail screens are each anchored on a DYNAMIC route
segment (`[productId].tsx` / `[branchId].tsx`) with no static `index.tsx`, so
expo-router never downgrades repeat `router.push()` into `NAVIGATE` and frames stack
(open A → open B → back lands on A, not the tab root). Fix = mirror the already-proven
NAV-005 Tracking pattern exactly: restructure each to a static `index.tsx` anchor
reading the id via a query param, centralize the push in one helper per route, and
repoint every call-site + the jest test imports. `apps/mobile`-only, zero backend/
package/admin surface. Behavioral verification is Agent-Probe (no RN nav E2E runner —
project-wide gap); typecheck + lint + jest + format are the automated gates.

## Overview

This is the SAME bug already fixed once for the Tracking route (NAV-004 introduced the
top-level route; NAV-005 fixed its double-open by switching the stack anchor from a
dynamic segment to a static `index`). That fix was never back-applied to Product and
Branch. This plan back-applies it, verbatim in mechanism.

**Confirmed root cause (from RESEARCH/DEBUG):** `(tabs)/product/_layout.tsx` and
`(tabs)/branch/_layout.tsx` are hidden tab-screens whose nested `Stack` is anchored at
position 0 on a dynamic route file (`[productId].tsx` / `[branchId].tsx` — no
`index.tsx` exists in these folders). Because the pathname differs on every distinct
id, a dynamic anchor makes the push target resolve to the `'stack'` navigator, which
SKIPS the `PUSH`→`NAVIGATE` downgrade — so each push adds a frame instead of replacing.
Reference for WHY the static-index anchor fixes it: the prose in
`apps/mobile/src/app/(tabs)/tracking/_layout.tsx` and
`apps/mobile/src/features/orders/lib/navigate-to-tracking.ts` (read both before executing).

**Reference (already-proven) implementation in this repo:**
- `apps/mobile/src/app/(tabs)/tracking/_layout.tsx` — static `index` anchor, `headerShown:false`.
- `apps/mobile/src/app/(tabs)/tracking/index.tsx` — reads `orderId` via `useLocalSearchParams`.
- `apps/mobile/src/features/orders/lib/navigate-to-tracking.ts` — the single `useNavigateToOrderTracking()` hook; `router.push({ pathname: '/(tabs)/tracking', params: { orderId } })`.

**Sibling precedent plans (read for prose/structure convention):**
- `process/general-plans/active/nav-004-tracking-top-level-route_17-07-26/`
- `process/general-plans/active/nav-005-shared-routes-top-level_17-07-26/nav-005-shared-routes-top-level_PLAN_17-07-26.md`

## Goals

1. Opening two different products in sequence, then pressing back, lands on the calling
   screen / tab root — NOT the previously-opened product. Same for branches.
2. All single-open regressions from NAV-005 still pass (open one product → back → tab root).
3. Navigation TO each route is centralized in one helper (DRY, mirrors `navigate-to-tracking.ts`).
4. Zero change to backend, `packages/*`, or `apps/admin`.

## Scope (Locked from INNOVATE — do not re-litigate)

- **In scope (code):** Product route + Branch route restructure and all their call-sites.
- **D2 — Deals: AC only, NO code.** `(tabs)/deals/deal/[dealId].tsx` is a structurally
  different second-level nested push (not a stack anchor) and unconfirmed. Do NOT
  restructure it here. Add an Agent-Probe AC to test-confirm the repro; if it reproduces,
  it becomes a SEPARATE follow-up plan (file a backlog note pointing to it at that time).
- **D3 — Tab-bar: NO code.** Do NOT touch `apps/mobile/src/components/floating-tab-bar.tsx`.
  Backlog note filed documenting the tab-bar escape-hatch as future defense-in-depth.
- **D4 — Verification is Agent-Probe by necessity.** `apps/mobile` has no RN
  component/E2E navigation runner (see `process/context/tests/all-tests.md`). Behavioral
  nav proof is Agent-Probe-tier — not by choice.

## Touchpoints

### Product route (rename dynamic anchor → static index)
| # | File | Action |
|---|---|---|
| P1 | `apps/mobile/src/app/(tabs)/product/[productId].tsx` | RENAME → `apps/mobile/src/app/(tabs)/product/index.tsx`. Change `useLocalSearchParams<{ productId: string }>()` to read from query params (shape unchanged — params are already query params on a static-index push, so the destructure stays `{ productId }`). Verify no `router.push` to a product/branch path inside the screen body; if any exists (e.g. sibling-product switch), route it through the new helper. (Note: `router` import stays — the screen uses `router.back()` in `<ScreenHeader onBack>`.) |
| P2 | `apps/mobile/src/app/(tabs)/product/_layout.tsx` | Update the doc comment to reference `./index.tsx` static anchor (mirror `tracking/_layout.tsx` prose). Confirm `<Stack screenOptions={{ headerShown: false }} />` — no structural change needed beyond the anchor now being static. |
| P3 | `apps/mobile/src/features/menu/lib/navigate-to-product.ts` | CREATE (the `features/menu/lib/` dir does not exist yet — create it). Export `useNavigateToProduct()` returning `(productId: string, branchId?: string) => void` that calls `router.push({ pathname: '/(tabs)/product', params: { productId, ...(branchId ? { branchId } : {}) } })`. Mirror the doc-comment mechanism note from `navigate-to-tracking.ts`. Export `PRODUCT_DETAIL_PATHNAME = '/(tabs)/product'`. |

### Product call-sites (route every push through the helper)
| # | File | Current | Action |
|---|---|---|---|
| P4 | `apps/mobile/src/app/(tabs)/index.tsx` | `openProduct` at ~L184-190 pushes `'/(tabs)/product/[productId]'` with `{ productId, branchId }` | Replace body with `useNavigateToProduct()` call, passing `productId` + `branchId`. |
| P5 | `apps/mobile/src/app/(tabs)/order/index.tsx` | `openProduct` at ~L34-38 pushes `'/(tabs)/product/[productId]'` with `{ productId }` | Replace with `useNavigateToProduct()` call (productId only). |
| P5b | `apps/mobile/src/app/(tabs)/order/_layout.tsx` | Doc comment at L8 lists `product/[productId]` as a former Order-stack screen (stale — the grep-fresh Fully-Automated gate flags it) | Update the doc comment to say `product` (static-index route) — a doc-only edit; the file is NOT in the original touchpoints table but the grep-fresh gate (line 117) requires ZERO dynamic-segment refs. **[VALIDATE-added — resolves CONCERN C1.]** |

### Product test imports (jest — MUST update or `test` gate fails)
| # | File | Action |
|---|---|---|
| P6 | `apps/mobile/src/features/menu/__tests__/product-branch-switch.test.tsx` | Update import `@/app/(tabs)/product/[productId]` → `@/app/(tabs)/product` (or `.../product/index`). Update any `useLocalSearchParams` mock if present. |
| P7 | `apps/mobile/src/features/menu/__tests__/product-toast.test.tsx` | Same import repoint. |

### Branch route (rename dynamic anchor → static index)
| # | File | Action |
|---|---|---|
| B1 | `apps/mobile/src/app/(tabs)/branch/[branchId].tsx` | RENAME → `apps/mobile/src/app/(tabs)/branch/index.tsx`. Keep `useLocalSearchParams<{ branchId: string }>()` (query-param shape, unchanged destructure). The screen has in-body branchId-change handling (`loadingBranchId` state, the `apiFetch(/api/branches/${branchId})` effect) — that reads the param, not a path segment, so it is unaffected; verify it still reads `branchId` from `useLocalSearchParams`. The screen's only in-body `router.push` is to `/(tabs)/order` (line ~158) — that is NOT a branch path, so it stays as-is (do NOT route it through the branch helper). |
| B2 | `apps/mobile/src/app/(tabs)/branch/_layout.tsx` | Update doc comment to reference `./index.tsx` static anchor. Confirm `headerShown:false`. |
| B3 | `apps/mobile/src/features/branches/lib/navigate-to-branch.ts` | CREATE (the `features/branches/lib/` dir does not exist yet — create it). Export `useNavigateToBranch()` returning `(branchId: string) => void` calling `router.push({ pathname: '/(tabs)/branch', params: { branchId } })`. Export `BRANCH_DETAIL_PATHNAME = '/(tabs)/branch'`. Mirror `navigate-to-tracking.ts` doc note. |

### Branch call-sites
| # | File | Current | Action |
|---|---|---|---|
| B4 | `apps/mobile/src/app/(tabs)/index.tsx` | `openBranch` at ~L174-180 pushes `'/(tabs)/branch/[branchId]'` | Replace with `useNavigateToBranch()` call. |
| B5 | `apps/mobile/src/app/(tabs)/branches/index.tsx` | ~L111-114 pushes `'/(tabs)/branch/[branchId]'` with `{ branchId: id }` | Replace with `useNavigateToBranch()` call. |

### Branch test imports (jest)
| # | File | Action |
|---|---|---|
| B6 | `apps/mobile/src/features/branches/__tests__/branch-detail-toast.test.tsx` | Update import `@/app/(tabs)/branch/[branchId]` → `@/app/(tabs)/branch`. It already mocks `useLocalSearchParams: () => ({ branchId: 'b1' })` — keep. |

### Documentation / backlog (process artifacts)
| # | File | Action |
|---|---|---|
| D3-note | `process/general-plans/backlog/nav-tab-bar-escape-hatch-defense_NOTE_20-07-26.md` | CREATED by this PLAN pass (below) — documents the D3 out-of-scope tab-bar gap. |
| D2-note | (conditional) `process/general-plans/backlog/nav-006-deals-backstack-followup_NOTE_{date}.md` | File ONLY IF the Agent-Probe deals repro (AC-D2) confirms the bug. Points to a future separate plan. Do NOT create pre-emptively. |

**Grep-fresh instruction for EXECUTE:** before finishing, re-run
`grep -rn "product/\[productId\]\|branch/\[branchId\]" apps/mobile/src` and confirm ZERO
remaining references to the dynamic-segment pathnames (call-sites, imports, and doc
comments all migrated). Files may have moved since this plan was written.

## Public Contracts

- **Route paths change** for internal navigation only: `/(tabs)/product/[productId]` →
  `/(tabs)/product` (query param `productId`), and `/(tabs)/branch/[branchId]` →
  `/(tabs)/branch` (query param `branchId`). No external/HTTP contract, no deep-link
  contract documented elsewhere is affected (verify no `notification-factory.ts` target
  points at product/branch — grep confirmed only `deal/[dealId]` is targeted there, which
  is out of scope).
- **New public helpers:** `useNavigateToProduct()` / `PRODUCT_DETAIL_PATHNAME`
  (`@/features/menu/lib/navigate-to-product`) and `useNavigateToBranch()` /
  `BRANCH_DETAIL_PATHNAME` (`@/features/branches/lib/navigate-to-branch`). These become
  the ONLY approved way to navigate to each screen (mirrors the `navigate-to-tracking`
  contract — no direct `router.push` to these routes at any call-site).

## Blast Radius

- **Scope:** `apps/mobile` ONLY. Explicitly touches ZERO of: `packages/*`, `apps/admin`,
  `packages/api` / backend, DB/schema/migrations, auth. This bounds VALIDATE scope to the
  mobile app.
- **File count:** ~14 files (2 renames, 2 new helpers, 4 call-site edits, 3 layout/doc
  comment updates incl. `order/_layout.tsx`, 3 jest import repoints) + 1 backlog note. No Deals files.
- **Risk class:** LOW — presentation/navigation only, no data mutation, no contract
  visible outside the app. The dynamic→static rename is the only structural risk; the
  jest suite covers the import breakage automatically.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/mobile typecheck` exits 0 (baseline is 0 errors) | Fully-Automated | Rename + helper wiring type-sound; no dangling `[productId]`/`[branchId]` type refs (Goal 1/3) |
| `pnpm --filter @jojopotato/mobile test` (`vitest run --passWithNoTests && jest`) green | Fully-Automated | jest test imports (P6/P7/B6) repointed correctly; screens still mount/behave under existing product-switch/toast/branch-detail tests (Goal 2/3) |
| `pnpm --filter @jojopotato/mobile lint` clean | Fully-Automated | No unused `router` imports / dead pathname constants left behind |
| `pnpm format:check` clean | Fully-Automated | Prettier-clean touched files (repo commit-hygiene gate) |
| Grep: zero `product/[productId]` or `branch/[branchId]` pathname refs remain | Fully-Automated | Every call-site + import + doc comment migrated (Goal 3) — includes `order/_layout.tsx:8` (P5b) |
| **AC-P1** Product double-open: open Product A (from Home) → back → confirm lands at Home/menu → open Product B (different id) → back → confirm lands at Home/menu, NOT Product A | Agent-Probe | Core bug fixed for Product (Goal 1) — the exact test NAV-005's AC matrix omitted |
| **AC-P2** Product double-open from Order tab: open Product A (from Order) → back → Order list → open Product B → back → Order list, NOT Product A | Agent-Probe | Fix holds from the second call-site (Goal 1) |
| **AC-P3** Product single-open regression: open one product → back → calling screen (NAV-005 baseline still holds) | Agent-Probe | No regression of the prior single-open behavior (Goal 2) |
| **AC-B1** Branch double-open: open Branch A (from Home) → back → Home → open Branch B (different id) → back → Home, NOT Branch A | Agent-Probe | Core bug fixed for Branch (Goal 1) |
| **AC-B2** Branch double-open from Branches tab: open Branch A → back → Branches list → open Branch B → back → Branches list, NOT Branch A | Agent-Probe | Fix holds from the second call-site (Goal 1) |
| **AC-B3** Branch single-open regression: open one branch → back → calling screen | Agent-Probe | No regression (Goal 2) |
| **AC-D2** Deals probe (out-of-code-scope confirm): open Deal A → back → confirm lands at deals list/tab root → open Deal B → back → confirm lands at deals list/tab root, NOT Deal A | Agent-Probe | Confirms whether Deals needs a SEPARATE follow-up plan (D2). If it reproduces → file the D2 backlog note |
| **AC-THEME** Light AND dark pass on Product Details + Branch Details (any touched screen uses `mode`-aware `@jojopotato/ui` tokens, no hardcoded colors) | Agent-Probe | CLAUDE.md theming convention upheld on touched screens |

## Test Infra Improvement Notes

(none identified yet) — behavioral navigation proof remains Agent-Probe because
`apps/mobile` has no RN component/E2E navigation runner (project-wide gap tracked in
`process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md` and
`process/context/tests/all-tests.md`). The jest suite covers screen mount + import
integrity but cannot assert nav-stack depth.

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/nav-006-product-branch-backstack_20-07-26/nav-006-product-branch-backstack_PLAN_20-07-26.md`
2. **Last completed step:** VALIDATE complete — validate-contract written (Gate: PASS). Backlog note for D3 created.
3. **Validate-contract status:** written 20-07-26 (Gate: PASS) — see `## Validate Contract` below.
4. **Supporting context loaded:** `apps/mobile/src/app/(tabs)/tracking/_layout.tsx`,
   `apps/mobile/src/features/orders/lib/navigate-to-tracking.ts` (reference impl);
   product/branch route dirs + call-sites confirmed via grep; `process/context/tests/all-tests.md`
   (Agent-Probe tier rationale).
5. **Next step for a fresh agent:** `ENTER EXECUTE MODE` — EXECUTE the touchpoints table
   top-to-bottom (Product P1-P7 incl. P5b, then Branch B1-B6), running the automated gates
   after each of the two route restructures. Read the two reference files first — the
   mechanism (why static-index anchor downgrades PUSH→NAVIGATE) must be reproduced exactly,
   not approximated.

## Implementation Checklist

Execute in order; run the automated gates after the Product block (P) and again after the Branch block (B).

1. Read reference files: `(tabs)/tracking/_layout.tsx` + `features/orders/lib/navigate-to-tracking.ts`.
2. [P3] Create `features/menu/lib/navigate-to-product.ts` (`useNavigateToProduct`, `PRODUCT_DETAIL_PATHNAME`). Create the `features/menu/lib/` dir if absent.
3. [P1] Rename `(tabs)/product/[productId].tsx` → `(tabs)/product/index.tsx`; verify `useLocalSearchParams<{productId}>()` read + `router.back()` usage intact; route any in-body product/branch push through the helper.
4. [P2] Update `(tabs)/product/_layout.tsx` doc comment to reference static `./index.tsx`.
5. [P4] Repoint `(tabs)/index.tsx` `openProduct` to `useNavigateToProduct()` (productId + branchId).
6. [P5] Repoint `(tabs)/order/index.tsx` `openProduct` to `useNavigateToProduct()` (productId only).
6b. [P5b] Update `(tabs)/order/_layout.tsx` doc comment (L8) `product/[productId]` → `product` (doc-only; required so the grep-fresh gate reaches zero).
7. [P6][P7] Repoint jest imports in `product-branch-switch.test.tsx` + `product-toast.test.tsx`.
8. Run automated gates (typecheck, test, lint, format:check). Fix inline until green.
9. [B3] Create `features/branches/lib/navigate-to-branch.ts` (`useNavigateToBranch`, `BRANCH_DETAIL_PATHNAME`). Create the `features/branches/lib/` dir if absent.
10. [B1] Rename `(tabs)/branch/[branchId].tsx` → `(tabs)/branch/index.tsx`; verify `useLocalSearchParams<{branchId}>()` read + `loadingBranchId`/effect intact; leave the in-body `router.push('/(tabs)/order')` unchanged.
11. [B2] Update `(tabs)/branch/_layout.tsx` doc comment to reference static `./index.tsx`.
12. [B4] Repoint `(tabs)/index.tsx` `openBranch` to `useNavigateToBranch()`.
13. [B5] Repoint `(tabs)/branches/index.tsx` push to `useNavigateToBranch()`.
14. [B6] Repoint jest import in `branch-detail-toast.test.tsx`.
15. Grep-fresh: `grep -rn "product/\[productId\]\|branch/\[branchId\]" apps/mobile/src` → must be ZERO.
16. Run all automated gates again → all green.
17. Hand off the Agent-Probe AC list (AC-P1..P3, AC-B1..B3, AC-D2, AC-THEME) to the user for on-device verification.

## Acceptance Criteria

All criteria are enumerated with strategy + proof mapping in the **Verification Evidence** table
above. Summary:

- **Automated (must pass before Agent-Probe handoff):** typecheck 0, `test` (vitest+jest) green,
  lint clean, `format:check` clean, zero remaining dynamic-segment pathname refs.
- **Agent-Probe (user-run, blocks VERIFIED):** AC-P1/AC-P2 (Product double-open both call-sites),
  AC-P3 (Product single-open regression), AC-B1/AC-B2 (Branch double-open both call-sites),
  AC-B3 (Branch single-open regression), AC-D2 (Deals repro confirm — conditional follow-up),
  AC-THEME (light+dark on touched screens).

## Phase Completion Rules

- **CODE DONE** = checklist steps 1-16 complete, all automated gates green, grep-fresh clean.
- **VERIFIED** = CODE DONE **plus** the user has run the Agent-Probe ACs (AC-P1..P3, AC-B1..B3,
  AC-THEME) and confirmed pass. Behavioral nav proof is Agent-Probe by necessity (no RN nav E2E
  runner), so CODE DONE alone is NOT VERIFIED — the plan stays in `active/` until the user
  confirms the on-device walkthrough.
- **AC-D2 branch:** if the Deals probe reproduces the bug, file
  `process/general-plans/backlog/nav-006-deals-backstack-followup_NOTE_{date}.md` and scope a
  SEPARATE plan — do NOT expand this plan's code scope.

## Validate Contract

Status: PASS
Date: 20-07-26
date: 2026-07-20
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 1/7 signals present (only S7 — 14 files ≥5). LOW score → single sequential vc-execute-agent (opus for the code-execution leg). Bounded mechanical rename+repoint mirroring an already-proven in-repo pattern; no independent directions, no coordination need.

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| typecheck | Rename + helper wiring type-sound; no dangling `[productId]`/`[branchId]` type refs | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` exits 0 (baseline 0) | A |
| test | jest import repoints (P6/P7/B6) correct; screens still mount under product-switch/toast/branch-detail suites | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (`vitest run --passWithNoTests && jest`) green | A |
| lint | No unused `router` import / dead pathname constant left behind | Fully-Automated | `pnpm --filter @jojopotato/mobile lint` clean | A |
| format | Touched files Prettier-clean (commit-hygiene gate) | Fully-Automated | `pnpm format:check` clean | A |
| grep-fresh | Every call-site + import + doc comment migrated off the dynamic segment (incl. `order/_layout.tsx:8`) | Fully-Automated | `grep -rn "product/\[productId\]\|branch/\[branchId\]" apps/mobile/src` returns ZERO | A |
| AC-P1/P2 | Product double-open from Home and Order call-sites lands at tab root, not the prior product | Agent-Probe | On-device: open Product A → back → root → open Product B → back → root (both call-sites) | C |
| AC-P3 | Product single-open regression (NAV-005 baseline holds) | Agent-Probe | On-device: open one product → back → calling screen | C |
| AC-B1/B2 | Branch double-open from Home and Branches call-sites lands at tab root, not the prior branch | Agent-Probe | On-device: open Branch A → back → root → open Branch B → back → root (both call-sites) | C |
| AC-B3 | Branch single-open regression | Agent-Probe | On-device: open one branch → back → calling screen | C |
| AC-D2 | Deals repro confirm (out-of-code-scope) — decides whether a follow-up plan is needed | Agent-Probe | On-device: open Deal A → back → deals root → open Deal B → back → deals root | C (→ D backlog note if it reproduces) |
| AC-THEME | Touched screens read `mode`-aware `@jojopotato/ui` tokens in light AND dark | Agent-Probe | On-device: Product + Branch details in both schemes | C |

gap-resolution legend: A — proven now (gate passes this cycle); B — fixed in this plan; C — deferred to named later verification (user-run Agent-Probe, blocks VERIFIED); D — backlog test-building stub.

C-4 reconciliation: the `strategy` column carries only the 3 proving strategies (Fully-Automated / Agent-Probe used here; Hybrid not applicable). Known-Gap is NOT used as a strategy anywhere — every developed behavior has a real proving gate (import/mount integrity is Fully-Automated; nav-stack-depth is Agent-Probe by genuine infra necessity, not Known-Gap).

Legacy line form (retained for existing consumers):
- Product/Branch route restructure (import/mount integrity): Fully-automated: `pnpm --filter @jojopotato/mobile test`
- Route migration completeness: Fully-automated: `grep -rn "product/\[productId\]\|branch/\[branchId\]" apps/mobile/src` = 0
- Type/lint/format soundness: Fully-automated: `pnpm --filter @jojopotato/mobile typecheck` + `lint` + `pnpm format:check`
- Nav-stack-depth behavior (double-open + single-open regression): Agent-probe: user on-device walkthrough (AC-P1..P3, AC-B1..B3, AC-D2, AC-THEME) — no RN nav E2E runner exists (documented project-wide gap)

Failing stub (typecheck row):
test("should typecheck the renamed static-index routes + nav helpers with zero errors", () => { throw new Error("NOT IMPLEMENTED — TDD stub: pnpm --filter @jojopotato/mobile typecheck exits 0") })

Failing stub (test row):
test("should keep product-switch/toast/branch-detail suites green after import repoints", () => { throw new Error("NOT IMPLEMENTED — TDD stub: pnpm --filter @jojopotato/mobile test green after P6/P7/B6 repoint") })

Failing stub (grep-fresh row):
test("should leave zero dynamic-segment pathname refs after migration", () => { throw new Error("NOT IMPLEMENTED — TDD stub: grep product/[productId]|branch/[branchId] apps/mobile/src returns zero") })

Dimension findings:
- Infra fit: PASS — `apps/mobile`-only; static-index-anchor + centralized-nav-helper pattern already proven in-repo (`tracking/`), reproduced verbatim. All referenced files exist; the two new helper dirs (`features/menu/lib/`, `features/branches/lib/`) are absent and are created by P3/B3 (noted in-plan). Test runners (`vitest` + `jest` via one `test` script) are correct.
- Test coverage: PASS — the right tiers: import/mount integrity is Fully-Automated (jest, existing suites repointed); nav-stack-depth is Agent-Probe by genuine necessity (no RN nav E2E runner — documented project-wide gap this plan does not need to solve). Not vacuously green: the developed code behavior is proven by real automated gates; the behavioral residual has a real Agent-Probe gate, not Known-Gap.
- Breaking changes: PASS — internal route-path change only. Verified `notification-factory.ts` targets `deal_details` only (no product/branch detail deep-link consumer); no `Linking`/deep-link config references the static product/branch pathname; the product screen retains its `router` import via `router.back()` (no unused-import lint risk).
- Security surface: PASS — STRIDE scan clean: navigation/presentation only. Zero auth/identity, billing/credits, schema/migration, secret, or trust-boundary surface. Not a high-risk class → no risk-evidence-pack required.
- Section Product route (P1-P7 + P5b): PASS (concern C1 resolved in-plan) — mechanically feasible: `useLocalSearchParams<{productId}>()` already reads a param; all 3 call-sites match described shapes; jest import repoints are the only test-breakage and are covered by the `test` gate. Highest-risk edit: the `[productId]→index` rename + jest import repoint (P6/P7) must land together or the `test` gate reds — mitigated by running gates after the P block.
- Section Branch route (B1-B6): PASS — mechanically feasible: param read + `loadingBranchId`/effect unaffected by the anchor change (they read the param, not a path segment); the sole in-body push targets `/(tabs)/order` (correctly left out of the branch helper). Highest-risk edit: rename + B6 import repoint together — same mitigation.
- Section D2/D3 out-of-scope handling: PASS — Deals correctly descoped (AC-D2 gates a conditional follow-up); tab-bar correctly descoped (D3 backlog note already on disk); no pre-emptive artifacts created.

Open gaps: none blocking. Agent-Probe behavioral ACs (AC-P1..P3, AC-B1..B3, AC-D2, AC-THEME) are user-run and block VERIFIED (not CODE DONE) — expected for this route class, not a defect.

What this coverage does NOT prove:
- typecheck / lint / format / `test` (jest): prove type-soundness, import integrity, and that screens still MOUNT — they do NOT prove the navigation back-stack depth is correct (i.e. that back lands on the tab root, not the previously-opened detail). Nav-stack depth is unobservable to jest (no RN nav E2E runner) and is proven only by AC-P1..P3 / AC-B1..B3 (Agent-Probe).
- grep-fresh: proves every dynamic-segment reference was migrated — it does NOT prove the new static-index anchor actually triggers the `PUSH`→`NAVIGATE` downgrade at runtime (that is the AC-P1/AC-B1 Agent-Probe assertion).
- No gate here proves the Deals route (AC-D2) behavior; that is an out-of-code-scope probe whose only purpose is to decide if a separate plan is needed.

Gate: PASS (no FAILs; the single CONCERN C1 — `order/_layout.tsx:8` stale doc-comment absent from the touchpoints table but caught by the grep-fresh gate — was resolved in-plan by adding touchpoint P5b + checklist step 6b).
Accepted by: session (autonomous VALIDATE, single standalone plan; C1 resolved as an applied plan mitigation, so the gate is a terminal PASS rather than a CONDITIONAL requiring a supplement cycle).

## Autonomous Goal Block

```
SESSION GOAL: NAV-006 — fix Product & Branch detail back-stack doubling by mirroring the proven NAV-005 static-index-anchor + centralized-nav-helper pattern.
Charter + umbrella plan: N/A — single standalone plan (process/general-plans/active/nav-006-product-branch-backstack_20-07-26/nav-006-product-branch-backstack_PLAN_20-07-26.md)
Autonomy: single-plan EXECUTE — apply the touchpoints table (Product P1-P7 incl. P5b, then Branch B1-B6) exactly; run automated gates after each route block; no creative deviation. Reversible, LOW-risk, apps/mobile-only.
Hard stop conditions / safety constraints:
- Do NOT touch packages/*, apps/admin, packages/api/backend, DB/schema/migrations, or auth (blast radius is apps/mobile only).
- Do NOT restructure the Deals route (deal/[dealId]) — AC-D2 is probe-only; if it reproduces, file a backlog note and scope a SEPARATE plan.
- Do NOT touch floating-tab-bar.tsx (D3 — backlog note only).
Next phase: EXECUTE: process/general-plans/active/nav-006-product-branch-backstack_20-07-26/nav-006-product-branch-backstack_PLAN_20-07-26.md
Validate contract: inline in plan (Gate: PASS, generated-by outer-pvl, 20-07-26)
Execute start: fully-auto gates → pnpm --filter @jojopotato/mobile typecheck | pnpm --filter @jojopotato/mobile test | pnpm --filter @jojopotato/mobile lint | pnpm format:check | grep -rn "product/\[productId\]\|branch/\[branchId\]" apps/mobile/src (must be 0). Agent-Probe pack (user-run, blocks VERIFIED): AC-P1..P3, AC-B1..B3, AC-D2, AC-THEME. high-risk pack: no.
```
