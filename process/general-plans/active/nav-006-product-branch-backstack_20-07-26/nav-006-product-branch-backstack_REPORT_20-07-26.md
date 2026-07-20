---
name: report:nav-006-product-branch-backstack
description: "EXECUTE report — Product & Branch detail back-stack fix (static-index anchor + centralized nav helpers)"
date: 20-07-26
metadata:
  node_type: memory
  type: report
  feature: none
  phase: EXECUTE
---

# NAV-006 — EXECUTE Report (Product & Branch Detail Back-Stack Fix)

**Phase:** EXECUTE
**Date:** 2026-07-20
**Status:** COMPLETE (CODE DONE) — Agent-Probe ACs owed before VERIFIED
**Plan:** `process/general-plans/active/nav-006-product-branch-backstack_20-07-26/nav-006-product-branch-backstack_PLAN_20-07-26.md`

## TL;DR

Back-applied the proven NAV-005 Tracking pattern to Product Details and Branch Details:
each screen's stack is now anchored on a STATIC `index.tsx` (id read as a query param)
instead of a dynamic `[productId]`/`[branchId]` segment, and every call-site pushes through
one centralized `useNavigateToProduct()` / `useNavigateToBranch()` hook. All 5 automated
gates are green; the behavioral double-open fix is Agent-Probe (no RN nav E2E runner) and is
owed to the user before the plan is VERIFIED.

## What Was Done

Implementation checklist executed top-to-bottom (Product P1-P7 + P5b, then Branch B1-B6):

| Step | Touchpoint | Action taken |
|---|---|---|
| 2 | P3 | Created `apps/mobile/src/features/menu/lib/navigate-to-product.ts` — `useNavigateToProduct()` + `PRODUCT_DETAIL_PATHNAME = '/(tabs)/product'`; mirrors `navigate-to-tracking.ts` mechanism doc. |
| 3 | P1 | `git mv (tabs)/product/[productId].tsx → (tabs)/product/index.tsx`. Body unchanged — already reads `useLocalSearchParams<{ productId }>()` (a query param) and uses `router.back()`; no in-body product/branch push exists. |
| 4 | P2 | `(tabs)/product/_layout.tsx` doc comment rewritten to reference the static `./index.tsx` anchor + the `PUSH→NAVIGATE` mechanism (mirrors `tracking/_layout.tsx`). |
| 5 | P4 | `(tabs)/index.tsx` `openProduct` now calls `navigateToProduct(productId, branchId)`. |
| 6 | P5 | `(tabs)/order/index.tsx` `openProduct` now calls `navigateToProduct(productId)`. `router` import kept (still used for cart/history pushes). |
| 6b | P5b | `(tabs)/order/_layout.tsx` L8 doc comment `product/[productId]` → `product`. |
| 7 | P6/P7 | Jest imports in `product-branch-switch.test.tsx` + `product-toast.test.tsx` repointed `@/app/(tabs)/product/[productId]` → `@/app/(tabs)/product`. |
| 9 | B3 | Created `apps/mobile/src/features/branches/lib/navigate-to-branch.ts` — `useNavigateToBranch()` + `BRANCH_DETAIL_PATHNAME = '/(tabs)/branch'`. |
| 10 | B1 | `git mv (tabs)/branch/[branchId].tsx → (tabs)/branch/index.tsx`. Body unchanged — reads `useLocalSearchParams<{ branchId }>()`; `loadingBranchId` state + `apiFetch(/api/branches/${branchId})` effect read the param (not a path segment) and are unaffected; the in-body `router.push('/(tabs)/order')` left as-is. |
| 11 | B2 | `(tabs)/branch/_layout.tsx` doc comment rewritten to reference the static `./index.tsx` anchor + mechanism; the singular-`branch/` distinctness warning preserved. |
| 12 | B4 | `(tabs)/index.tsx` `openBranch` now calls `navigateToBranch(branchId)`. |
| 13 | B5 | `(tabs)/branches/index.tsx` `onOrderPress` now calls `navigateToBranch(id)`. `router` import REMOVED (it was used only for that one push → would be an unused-import lint error). |
| 14 | B6 | Jest import in `branch-detail-toast.test.tsx` repointed `@/app/(tabs)/branch/[branchId]` → `@/app/(tabs)/branch`. Existing `useLocalSearchParams: () => ({ branchId: 'b1' })` mock kept. |

Hooks were instantiated at component top (`const navigateToProduct = useNavigateToProduct();`
etc.), matching the existing `useNavigateToOrderTracking()` usage in `(tabs)/index.tsx`.

No changes to `(tabs)/deals/**` or `floating-tab-bar.tsx` (D2/D3 — out of scope, honored).

## Test Gate Outcomes (all Fully-Automated gates green)

| Gate | Command | Result |
|---|---|---|
| typecheck | `pnpm --filter @jojopotato/mobile typecheck` | PASS — 0 errors (generated `.expo/types/router.d.ts` already carries `/(tabs)/product` + `/(tabs)/branch` as static routes with params) |
| test | `pnpm --filter @jojopotato/mobile test` (`vitest run --passWithNoTests && jest`) | PASS — vitest 56/56, jest 78/78 (incl. the 3 repointed suites) |
| lint | `pnpm --filter @jojopotato/mobile lint` | PASS — 0 errors (3 pre-existing warnings in untouched `scripts/dev-with-tunnel.mjs`, unrelated) |
| format | `pnpm format:check` | PASS — all files Prettier-clean |
| grep-fresh | `grep -rn "product/\[productId\]\|branch/\[branchId\]" apps/mobile/src` | PASS — ZERO matches (exit 1) |

## Plan Deviations

One WITHIN-BLAST-RADIUS process deviation (no scope/behavior change):

- **Gate cadence:** the plan ran automated gates twice (step 8 after the Product block, step 16
  after the Branch block). I ran the full gate suite ONCE, after completing BOTH blocks. Reason:
  `(tabs)/index.tsx` is a SHARED call-site holding both `openProduct` (P4) and `openBranch` (B4),
  and both route renames landed up-front via `git mv`. Running typecheck after only the P block
  would have flagged the not-yet-migrated `openBranch` push against the already-regenerated typed
  routes — a spurious intermediate red. Completing all edits before the first gate run avoids that
  false negative. Final gates (equivalent to step 16) are all green. No file outside the plan's
  blast radius was touched.

No hard-stop-class deviations. No naming/location deviations beyond the above.

## Test Infra Gaps Found

None new. Behavioral navigation proof (back-stack depth) remains Agent-Probe by necessity —
`apps/mobile` has no RN component/E2E navigation runner (standing project-wide gap:
`process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`,
`process/context/tests/all-tests.md`). Jest proves screen mount + import integrity but cannot
assert nav-stack depth. This is the same tier NAV-004/NAV-005 carried, not a defect.

## Agent-Probe ACs Owed (user-run — block VERIFIED, cannot be run by agent)

These require an on-device/simulator walkthrough:

- **AC-P1** Product double-open from Home: open Product A → back → Home/menu → open Product B (different id) → back → Home/menu (NOT Product A).
- **AC-P2** Product double-open from Order tab: same, from the Order menu call-site.
- **AC-P3** Product single-open regression: open one product → back → calling screen.
- **AC-B1** Branch double-open from Home: open Branch A → back → Home → open Branch B → back → Home (NOT Branch A).
- **AC-B2** Branch double-open from Branches tab: same, from the Branches list call-site.
- **AC-B3** Branch single-open regression: open one branch → back → calling screen.
- **AC-D2** Deals probe (out-of-code-scope): open Deal A → back → deals root → open Deal B → back → deals root. If it REPRODUCES the double-open, file `process/general-plans/backlog/nav-006-deals-backstack-followup_NOTE_{date}.md` and scope a SEPARATE plan — do NOT expand this plan's code.
- **AC-THEME** Light AND dark on Product Details + Branch Details (touched screens use `mode`-aware `@jojopotato/ui` tokens — unchanged this pass, but re-confirm).

## Closeout Packet

- **Selected plan:** `.../nav-006-product-branch-backstack_20-07-26/nav-006-product-branch-backstack_PLAN_20-07-26.md`
- **Finished:** all code touchpoints (P1-P7, P5b, B1-B6); all 5 automated gates green; grep-fresh clean.
- **Verified vs unverified:** Fully-Automated gates verified (typecheck/test/lint/format/grep). Behavioral back-stack fix UNVERIFIED — Agent-Probe, owed to user.
- **Cleanup remaining:** none in code. Follow-up: user runs the Agent-Probe pack; conditionally file the AC-D2 backlog note if Deals reproduces.
- **Closeout classification:** **Keep in active/testing** — CODE DONE, but the plan's Phase Completion Rules require the user's on-device Agent-Probe pass before VERIFIED/archival.
- **Best next state:** hand the Agent-Probe AC list to the user; keep the plan in `active/`.

## Forward Preview

- **Test Infra Found:** none new; RN nav E2E runner still absent (tracked gap).
- **Blast Radius Changes:** `apps/mobile` only — 2 route renames (`git mv`, history preserved), 2 new nav helpers, 5 layout/doc + call-site edits, 3 jest import repoints. Zero `packages/*`, `apps/admin`, backend, DB, or auth surface.
- **Commands to Stay Green:** `pnpm --filter @jojopotato/mobile typecheck`, `pnpm --filter @jojopotato/mobile test`, `pnpm --filter @jojopotato/mobile lint`, `pnpm format:check`, `grep -rn "product/\[productId\]\|branch/\[branchId\]" apps/mobile/src` (must be 0).
- **Dependency Changes:** none.
