---
name: plan:menu-004-category-filter-polish
description: Wire the Home category filter to actually filter the product grid + 2 regression guards (MENU-004, issue #103)
date: 17-07-26
feature: ordering-cart
phase: "PLAN"
---

# PLAN — MENU-004: Category Filter Wiring + Regression Guards

Date: 17-07-26
Complexity: Simple
Status: PLANNED

Branch: `feat/menu-004-category-filter-polish` (already cut, checked out, based on `a055bde`).
INNOVATE was skipped — this is a mechanical state-lift with a locked SPEC, no competing designs.

## Overview

Home's category chips already toggle a local selected id but never affect the product grid. This
plan lifts that selection one level up into `(tabs)/index.tsx`, adds a pure `filterProductsByCategory`
helper (real vitest coverage, mirroring `flattenMenuForHome`), wires `CategorySelector` to accept
`selectedId`/`onSelect` props, clears the selection on branch change, and shows `EmptyState` when a
filtered category has zero products. Two regression guards (Product Details pricing/gating,
light/dark theming) are re-run, not re-written.

## Goals

1. Tapping a category chip filters the grid to that category (AC1-3).
2. Empty-category state shows `EmptyState`, never a blank area (AC4).
3. Branch switch always resets the filter (AC6).
4. Stale comment removed from `category-selector.tsx` (AC7).
5. Zero regressions in Product Details pricing/gating (AC8) or theming (AC9).

## Scope

In scope: `category-selector.tsx`, `(tabs)/index.tsx`, one new pure helper + its test file.
Out of scope: everything listed in the SPEC's "Out Of Scope" section — no restyling, no Order-tab
chips, no new `packages/ui` components, no backend change. `product-grid.tsx` is verified to need
NO change (already accepts a `products` prop; filtering happens upstream).

## Acceptance Criteria

Numbered ACs are locked verbatim in the SPEC (`menu-004-category-filter-polish_SPEC_17-07-26.md`,
section "Acceptance Criteria (Testable Outcomes)", AC1-AC10). This plan does not restate them in
full — the SPEC is the source of truth. Summary for quick reference:

1. Tapping a chip filters the grid to that category only.
2. Tapping the active chip again clears the filter, restoring the full grid.
3. Selecting a different category while one is active swaps directly to the new filter.
4. A category with zero products at the branch shows `EmptyState`, not a blank area.
5. The filtered grid never shows a product unavailable at the selected branch (regression guard).
6. Switching branches while a category is active always clears the selection.
7. The stale "no filtering required at this stage" comment is removed from `category-selector.tsx`.
8. Product Details pricing/gating stays correct (MENU-002 regression guard).
9. Order tab + Product Details keep rendering correctly in light/dark mode (UX-001 regression guard).
10. Any new reusable UI is exported from `packages/ui/src/index.ts` (expected vacuously satisfied —
    no new UI anticipated).

The Verification Evidence table below maps each gate to its AC number.

## Phase Completion Rules

- **CODE DONE**: all Implementation Checklist items 1-13 complete, all Fully-Automated gates green
  (item 14), no known regressions in AC8/AC9 regression-guard suites.
- **VERIFIED**: CODE DONE, plus all Agent-Probe scenarios in the Verification Evidence table
  (AC1/AC2/AC4/AC6/AC9 rendering halves) walked through and confirmed by a human or Agent-Probe
  session — do not mark VERIFIED on code-complete alone.
- A phase found to deviate materially from this plan (e.g. a genuine SPEC gap surfaces) must be
  filed as a backlog note per the SPEC's own "no scope padding" constraint — never implemented
  inline without updating this plan first.

## Implementation Checklist

1. **Add pure filter helper** — create
   `apps/mobile/src/features/home/lib/filter-products-by-category.ts` exporting
   `filterProductsByCategory(products: MenuItem[], categoryId: string | null): MenuItem[]`.
   - `categoryId === null` → return `products` unchanged (no filter active).
   - otherwise → return `products.filter(p => p.categoryId === categoryId)`.
   - Pure, no I/O, mirrors `flattenMenuForHome`'s style/doc-comment convention (see
     `apps/mobile/src/features/home/lib/menu-to-home-view.ts:1-27`).

2. **Add unit tests** — create
   `apps/mobile/src/features/home/lib/__tests__/filter-products-by-category.test.ts` (same
   directory/style as `menu-to-home-view.test.ts`), covering:
   - filters to only the selected category's products (AC1)
   - `categoryId = null` returns the full unfiltered list (AC2's "cleared" case)
   - switching from category A's id to category B's id returns exactly B's products, not A's or
     the union (AC3)
   - a category id with zero matching products returns `[]` (AC4's data-path half)
   - filtering never adds an item not present in the input array (AC5 regression-guard assertion —
     e.g. assert `result.every(r => products.includes(r))` or equivalent subset check)

3. **Widen `CategorySelectorProps`** in
   `apps/mobile/src/features/home/components/category-selector.tsx:8-10` — add
   `selectedId: string | null` and `onSelect: (categoryId: string | null) => void`.

4. **Remove local state, delegate to props** in `category-selector.tsx:25-27` — delete the internal
   `useState<string | null>` (line 27) and the `useState` import if no longer used elsewhere in the
   file (verify — currently only used here). Replace the `onPress` handler at `category-selector.tsx:43-45`
   with a call to the new `onSelect` prop using the same toggle logic
   (`onSelect(category.id === selectedId ? null : category.id)`). Read `isSelected` from the
   `selectedId` prop instead of local state (`category-selector.tsx:36`).

5. **Remove stale doc comment** — delete/replace the "Self-contained — the selection is not
   propagated to the product grid (no filtering required at this stage)" sentence at
   `category-selector.tsx:22-23`. Replace with a comment reflecting that selection now propagates
   outward via `onSelect` (AC7 — verify with `grep -n "no filtering required" apps/mobile/src/features/home/components/category-selector.tsx` returning 0 matches after this step).

6. **Lift filter state in Home screen** — in `apps/mobile/src/app/(tabs)/index.tsx`, add
   `const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);` near the
   other screen-level state (after `insets` around line 103-104; `useState` needs adding to the
   existing `import { useEffect, useMemo } from 'react';` at line 12).

7. **Reset filter on branch change** — extend the existing branch-sync `useEffect`
   (`index.tsx:133-135`, keyed on `[branchId, setBranch]`) with a second effect OR extend the
   existing one to also call `setSelectedCategoryId(null)` whenever `branchId` changes. Prefer a
   SEPARATE `useEffect(() => { setSelectedCategoryId(null); }, [branchId]);` right after the
   existing branch-sync effect — keeps the two concerns (cart sync vs. filter reset) independently
   readable and matches the SPEC's framing of AC6 as its own concern (AC6).

8. **Filter the grid's product list** — extend the existing `menuView` derivation
   (`index.tsx:137-140`, currently `useMemo` over `menuQuery.data`) with a second, dependent
   `useMemo` (or extend the same `useMemo`'s deps) that produces
   `filteredProducts = filterProductsByCategory(menuView.products, selectedCategoryId)`. Import
   `filterProductsByCategory` from the new helper file.

9. **Wire props through to `CategorySelector` and `ProductGrid`** at `index.tsx:324` and `:329`:
   - `<CategorySelector categories={menuView.categories} selectedId={selectedCategoryId} onSelect={setSelectedCategoryId} />`
   - `<ProductGrid products={filteredProducts} onProductPress={openProduct} />` (swap `menuView.products` → `filteredProducts`; `ProductGrid` itself is UNCHANGED, verified in research — confirm no other prop drift while editing this line).

10. **Empty-category state** — extend the existing conditional chain at `index.tsx:315-331`
    (currently `menuView.products.length === 0 ? <EmptyState .../> : <>... </>`) with one more
    branch: when `menuView.products.length > 0` AND `filteredProducts.length === 0` (i.e. a real
    category is selected but has 0 products at this branch), render `EmptyState` with a message
    distinct from the "Menu coming soon" branch — e.g. title `"Nothing here yet"` /
    description `"No items in this category at this branch."` — while STILL rendering
    `CategorySelector` above it so the user can pick a different chip (do not hide the chip row;
    only the grid area swaps to `EmptyState`). This matches the SPEC's "chip stays visibly
    selected" requirement (AC4).

11. **Confirm no `product-grid.tsx` change needed** — re-verify after step 9 that `ProductGrid`'s
    existing `products: MenuItem[]` prop signature needs no edit (per research: confirmed, it
    already accepts a filtered list transparently).

12. **Do not touch** `add-to-cart-bar.tsx`, `use-menu.ts`, `product-options.ts`, `product-grid.tsx`
    (if step 11 confirms), or the Order tab's `category-section.tsx` — explicit non-goals per SPEC
    Constraints/Out of Scope.

13. **Run regression guards** — re-run `packages/utils/src/__tests__/product-options.test.ts` (AC8)
    unmodified; perform an Agent-Probe visual walkthrough of Order tab + Product Details in both
    light and dark mode (AC9) — no code changes expected to satisfy either, these are confirmation-only steps.

14. **Run automated gates** (see Verification Evidence table) and fix forward until green.

15. **Baseline-isolation step (added at VALIDATE, mandatory, run BEFORE step 1):** the working tree
    was found DIRTY at VALIDATE time (17-07-26) with an unrelated, in-progress, uncommitted
    nav-route restructuring (`(tabs)/order/*` → `(tabs)/cart/*`, `(tabs)/branches/*` →
    `(tabs)/branch/*`, product screens moved to a top-level route) that is NOT part of MENU-004's
    blast radius. This currently makes `pnpm --filter @jojopotato/mobile typecheck` red (5
    pre-existing errors in `account/index.tsx`, `deals/deal/[dealId].tsx`, `order/index.tsx`,
    `use-reorder.ts` — stale typed-routes codegen, none of these files are touched by this plan)
    and `pnpm --filter @jojopotato/mobile test` red (2 pre-existing jest module-resolution
    failures in `product-branch-switch.test.tsx` / `cart-branch-switch.test.tsx` — stale imports
    pointing at routes already renamed on disk). Before making any edit: run both commands, record
    the exact baseline failure list (it may differ from the one observed at VALIDATE time if the
    concurrent restructuring has since been committed/finished — that is fine, just capture
    whatever the current baseline actually is). After implementing steps 1-14, re-run both commands
    and confirm no NEW failures appear beyond that baseline in files this plan touches. Do NOT
    attempt to fix the pre-existing/unrelated failures inline — that is scope creep outside this
    SPEC's authority (file a backlog note instead if they are still present and blocking at EXECUTE
    close-out). When staging a commit, stage ONLY the exact touchpoint files listed below — do NOT
    `git add -A` or `git add .`, since the working tree may still hold substantial unrelated
    uncommitted work from other in-flight tasks.

## Touchpoints

| File | Change |
|---|---|
| `apps/mobile/src/features/home/lib/filter-products-by-category.ts` | NEW — pure filter helper |
| `apps/mobile/src/features/home/lib/__tests__/filter-products-by-category.test.ts` | NEW — unit tests |
| `apps/mobile/src/features/home/components/category-selector.tsx` | Widen props (`selectedId`/`onSelect`), remove local `useState`, remove stale comment |
| `apps/mobile/src/app/(tabs)/index.tsx` | Add `selectedCategoryId` state, branch-change reset effect, filtered-products derivation, prop wiring, empty-category branch |

No other files are touched. `apps/mobile/src/features/home/components/product-grid.tsx` is
explicitly NOT touched (verified no signature change needed).

## Public Contracts

- `CategorySelectorProps` gains two new REQUIRED props (`selectedId`, `onSelect`) — this is a
  breaking change to the component's prop contract, but `CategorySelector` has exactly one caller
  (`(tabs)/index.tsx`), so no other call site needs updating. Confirm via
  `grep -rn "CategorySelector" apps/mobile/src` before merging (expect 1 import + 1 usage site
  outside the component's own file).
- `filterProductsByCategory` is a new exported pure function — internal to `apps/mobile`, not
  re-exported from `@jojopotato/types` or `@jojopotato/utils` (SPEC scopes this as an
  `apps/mobile`-local helper alongside `flattenMenuForHome`, not a shared package util).
- No `packages/ui`, `packages/types`, `packages/utils`, or backend/API contract changes.

## Blast Radius

Single package (`apps/mobile`), 3 touched files + 2 new files. No schema/auth/API/billing surface.
Risk class: none of the High-Risk Classes apply (no auth, billing, migration, public API, deploy,
or secrets surface). This is a pure frontend state-lift confined to one screen and one component.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `filterProductsByCategory` unit test: filters to selected category only | Fully-Automated | AC1 |
| `filterProductsByCategory` unit test: `null` categoryId returns full unfiltered list | Fully-Automated | AC2 |
| `filterProductsByCategory` unit test: switching A→B returns B's products only | Fully-Automated | AC3 |
| `filterProductsByCategory` unit test: category with 0 matches returns `[]` | Fully-Automated | AC4 (data-path half) |
| `filterProductsByCategory` unit test: output is always a subset of input (never re-adds items) | Fully-Automated | AC5 |
| Agent-Probe: tap chip on-device, confirm grid visibly narrows | Agent-Probe | AC1 |
| Agent-Probe: tap active chip again, confirm grid restores | Agent-Probe | AC2 |
| Agent-Probe: select category with 0 branch products, confirm `EmptyState` renders with chip still selected | Agent-Probe | AC4 (rendering half) |
| Agent-Probe: select category on branch A, switch to branch B, confirm chip row clears + full grid shows | Agent-Probe | AC6 |
| `grep -n "no filtering required" apps/mobile/src/features/home/components/category-selector.tsx` returns 0 matches | Fully-Automated | AC7 |
| Re-run `pnpm --filter @jojopotato/utils test` — stays green (39/39 for the whole package; `product-options.test.ts` itself is 9 of those 39 — see correction note below) | Fully-Automated | AC8 |
| Agent-Probe: Order tab + Product Details render correctly in light and dark mode | Agent-Probe | AC9 |
| Touchpoints-table review: confirm no new `.tsx` component file was added under `apps/mobile/src/features/home/components/` (the literal `grep -rn "packages/ui" apps/mobile/src/features/home` in the original draft is a non-diagnostic no-op — nothing in this codebase imports via that literal string; corrected at VALIDATE, see Validate Contract) | Fully-Automated (by construction, via Touchpoints review, not the original grep) | AC10 |

## Test Infra Improvement Notes

(none identified yet)

## Test Commands

- `pnpm --filter @jojopotato/mobile test` — runs the new `filter-products-by-category.test.ts` plus
  the existing pure-TS vitest suite (node env) AND the existing `jest`/`jest-expo` RN component
  suite (the package's `test` script is `vitest run --passWithNoTests && jest` — both run
  sequentially under this one command; see the Baseline-isolation step above for why this may show
  pre-existing unrelated jest failures at the time EXECUTE starts).
- `pnpm --filter @jojopotato/utils test` — re-runs `product-options.test.ts` (AC8 regression guard)
  as part of the whole-package run (39 tests total across 4 files).
- `pnpm --filter @jojopotato/mobile typecheck` (or equivalent `tsc --noEmit` per package script) —
  confirm the widened `CategorySelectorProps` and new helper typecheck cleanly. See the
  Baseline-isolation step above — this command was observed RED at VALIDATE time for reasons
  entirely unrelated to this plan's blast radius.
- `pnpm --filter @jojopotato/types typecheck` — not expected to be touched, run only if the
  typecheck command spans workspace boundaries.

**Known harness debt (not a gate for this plan):** `pnpm format:check` is broken repo-wide (~131
files, CRLF/`core.autocrlf=true` drift, confirmed independently twice). Do NOT run
`prettier --write` broadly — it would rewrite unrelated files. Format the 4 touched files manually
if needed, or accept the pre-existing broken state as out-of-scope debt.

**Stale doc note:** `process/context/tests/all-tests.md` incorrectly claims `packages/utils` has no
test runner — it does (vitest, 39/39 verified live). Its "no RN component/E2E runner" claim for
`apps/mobile` is accurate for navigation/E2E; note `apps/mobile` DOES now also have a jest/jest-expo
RN component runner (confirmed live 17-07-26) — screen-composition/chip-tap/branch-switch scenarios
in this plan still stay Agent-Probe because no test file for `(tabs)/index.tsx`'s Home screen or
`CategorySelector` exists in that runner's suite; this plan does not add one (out of scope, no AC
requires it).

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/ordering-cart/active/menu-004-category-filter-polish_17-07-26/menu-004-category-filter-polish_PLAN_17-07-26.md`
2. **Last completed phase or step:** VALIDATE — validate-contract written 17-07-26, gate CONDITIONAL (see below). No implementation started.
3. **Validate-contract status:** written, see `## Validate Contract` below.
4. **Supporting context files loaded:** SPEC at
   `process/features/ordering-cart/active/menu-004-category-filter-polish_17-07-26/menu-004-category-filter-polish_SPEC_17-07-26.md`;
   prior art at `process/features/ordering-cart/completed/menu-product-browsing_10-07-26/`;
   `process/context/all-context.md`; `process/context/tests/all-tests.md`.
5. **Next step for a fresh agent picking up mid-execution:** run the new step 15
   (Baseline-isolation) FIRST. Then if Implementation Checklist items 1-11 are unchecked, start at
   item 1 (new pure helper first — TDD-first, write the failing test before the implementation). If
   items 1-11 are done but gates (item 14) haven't been confirmed green, run the Test Commands above
   and fix forward, isolating any pre-existing baseline noise per step 15. If all automated gates
   are green, the remaining work is the 4 Agent-Probe walkthroughs in the Verification Evidence
   table (AC1/AC2/AC4/AC6/AC9) — no code changes expected unless a probe surfaces a real bug, in
   which case treat it as a genuine deviation and update this plan before proceeding.

## Validate Contract

Status: CONDITIONAL
Date: 17-07-26
date: 2026-07-17
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 7-signal score 0/7 (single package, no schema/auth/API/billing surface, INNOVATE
legitimately skipped — no competing direction to fan out over, 4 files touched/created, no phase
program). LOW tier → sequential validation was correct; no parallel fan-out was needed for this
plan and none was spun up.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | tapping a chip filters the grid to that category only | Fully-Automated | `pnpm --filter @jojopotato/mobile test` → `filter-products-by-category.test.ts` "filters to only the selected category's products" | A |
| AC2 | tapping the active chip again clears the filter | Fully-Automated | same file, `categoryId = null` → full unfiltered list case | A |
| AC3 | selecting a different category swaps directly (no union, no stale A) | Fully-Automated | same file, A→B switch case | A |
| AC4 (data) | zero-match category returns `[]` | Fully-Automated | same file, empty-result case | A |
| AC5 | filter never re-adds an item not in the input | Fully-Automated | same file, subset-invariant case | A |
| AC7 | stale "no filtering required" comment removed | Fully-Automated | `grep -n "no filtering required" apps/mobile/src/features/home/components/category-selector.tsx` → 0 matches | A |
| AC8 | Product Details pricing/gating unaffected (regression) | Fully-Automated | `pnpm --filter @jojopotato/utils test` (39/39, incl. `product-options.test.ts`'s 9) | A |
| AC10 | no new inline UI outside `packages/ui` | Fully-Automated (by Touchpoints-table construction, not a runnable grep — see correction below) | Touchpoints table review at EXECUTE/EVL close — confirm no new `.tsx` file was added to `apps/mobile/src/features/home/components/` | A |
| AC4 (render) | `EmptyState` renders with chip still selected, at 0-match category | Agent-Probe | on-device walkthrough | A (post-EXECUTE) |
| AC1/AC2 (render) | chip tap visibly narrows/restores the grid | Agent-Probe | on-device walkthrough | A (post-EXECUTE) |
| AC6 | branch switch always clears the filter, shows new branch's full grid | Agent-Probe | on-device walkthrough, branch A → branch B, with a category active | A (post-EXECUTE) |
| AC9 | Order tab + Product Details render correctly, light and dark | Agent-Probe | manual visual walkthrough both modes | A (post-EXECUTE) |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated /
Hybrid / Agent-Probe). No Known-Gap rows exist in this plan — every AC has a real proving strategy,
none rest on an unproven residual.

Legacy line form (retained so existing validate-contract consumers still parse):
- `apps/mobile/src/features/home/lib/filter-products-by-category.ts` (AC1-AC5, AC10): Fully-automated: `pnpm --filter @jojopotato/mobile test`
- `apps/mobile/src/features/home/components/category-selector.tsx` (AC7): Fully-automated: `grep -n "no filtering required" apps/mobile/src/features/home/components/category-selector.tsx`
- `packages/utils/src/__tests__/product-options.test.ts` (AC8): Fully-automated: `pnpm --filter @jojopotato/utils test`
- Home screen composition, chip taps, empty state, branch-switch reset, light/dark theming (AC1/AC2/AC4/AC6/AC9 rendering halves): agent-probe: on-device or simulator walkthrough, no RN component test exists for this screen

### Failing stubs (Fully-Automated rows only)

```
Failing stub for AC1:
test("should filter products to only the selected category's products", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: filters to only the selected category's products")
})

Failing stub for AC2:
test("should return the full unfiltered list when categoryId is null", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: categoryId = null returns the full unfiltered list")
})

Failing stub for AC3:
test("should swap directly from category A's products to category B's products", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: switching A's id to B's id returns exactly B's products, not A's or the union")
})

Failing stub for AC4 (data path):
test("should return an empty array for a category with zero matching products", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: a category id with zero matching products returns []")
})

Failing stub for AC5:
test("should never return a product that was not present in the input array", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: filtering never adds an item not present in the input array")
})
```

AC7/AC8/AC10 are grep/re-run/review gates, not new behavior — no TDD stub applies (AC8 is a
pre-existing passing suite being re-run, not new code).

Dimension findings:
- Infra fit: CONCERN — the working tree was found DIRTY at VALIDATE time with an unrelated,
  in-progress, uncommitted nav-route restructuring (`order/*`→`cart/*`, `branches/*`→`branch/*`,
  product screens moved top-level) that is NOT part of this plan's scope. This currently makes
  `pnpm --filter @jojopotato/mobile typecheck` red (5 pre-existing errors, none in files this plan
  touches) and `pnpm --filter @jojopotato/mobile test` red (2 pre-existing jest module-resolution
  failures, same cause). Verified empirically by running both commands live. Branch state itself is
  correct (`feat/menu-004-category-filter-polish`, HEAD `a055bde`, matches the plan's claim exactly)
  and the plan's own 4 blast-radius files are byte-identical to `HEAD` except for
  `(tabs)/index.tsx`'s two unrelated route-string edits (both outside the lines this plan touches) —
  so the plan's edit targets themselves are unaffected. Mitigation: added Implementation Checklist
  step 15 (Baseline-isolation) and folded the finding into the Test Commands section. This is a
  transient environment fact, not a plan defect — does not require returning to PLAN.
- Test coverage: PASS — tier assignments are honest and calibrated, not inflated. The pure-function
  tests (AC1-AC5) are genuine behavioral proofs (filter/pass-through/switch/empty/subset-invariant),
  not trivial shape checks. AC6's Agent-Probe tier is explicitly and correctly justified in the SPEC
  itself (no meaningful pure-function seam for "did branchId change"). Two minor, non-blocking
  accuracy nits found and corrected in-place: (1) the Verification Evidence table's original AC8 row
  said "`product-options.test.ts` ... stays green (39/39)" — the 39 is the whole `packages/utils`
  package's test count across 4 files; `product-options.test.ts` alone is 9 of those 39. The command
  itself (`pnpm --filter @jojopotato/utils test`) was already correct; only the row's wording was
  imprecise, now corrected. (2) AC10's original grep command
  (`grep -rn "packages/ui" apps/mobile/src/features/home`) is a non-diagnostic no-op — nothing in
  this codebase imports via that literal string (imports use the `@jojopotato/ui` package alias), so
  the grep would trivially return 0 matches regardless of whether AC10 actually holds. Confirmed live
  (`exit=1`, meaning "not found," on the unmodified codebase). Replaced with an honest
  Touchpoints-table review as the real check — the underlying claim (no new UI added) is true by
  construction since the Touchpoints table lists no new `.tsx` component file, but the original
  automated check did not actually verify it.
- Breaking changes: PASS — `CategorySelectorProps` gains 2 required props, a real breaking change to
  the component's own contract, but `grep -rn "CategorySelector" apps/mobile/src` confirms exactly
  one call site outside the component's own file (`(tabs)/index.tsx:324`). No other consumer exists
  to break.
- Security surface: PASS — no auth, billing, schema, migration, public API, deploy, or secrets
  surface touched. Confirmed against the plan's own Blast Radius section and the 4-file touchpoint
  list; no High-Risk Class applies.
- Section A — Pure filter helper + tests: PASS — mechanical feasibility confirmed
  (`apps/mobile/src/features/home/lib/` and its `__tests__/` subfolder both already exist; sibling
  `menu-to-home-view.ts`/`.test.ts` pair verified as the exact pattern being mirrored).
  `MenuItem.categoryId` is a required (non-optional) `string` field in `packages/types/src/menu.ts`
  — the comparison `p.categoryId === categoryId` is well-typed with no null-handling gap. No gaps,
  no conflicts.
- Section B — `category-selector.tsx` prop lift: PASS — every line reference in the checklist
  (interface at 8-10, `useState` at 27, `onPress` handler at 43-45, `isSelected` read at 36, stale
  comment at 22-23) was verified byte-for-byte against the live file. Single caller confirmed (see
  Breaking changes above). No gaps, no conflicts.
- Section C — `(tabs)/index.tsx` state lift + wiring + empty state: PASS — every line reference
  (import at 12, `insets` at 103, branch-sync effect at 133-135, `menuView` derivation at 137-140,
  render block at 315-331, `CategorySelector`/`ProductGrid` calls at 324/329) was verified
  byte-for-byte against the live file (these specific lines are unmodified from `HEAD`, unaffected
  by the dirty-tree issue above). The proposed branch-reset effect keyed on `[branchId]` fires
  correctly on mount (harmless, already-null) and on every real branch change (correct reset).
  `EmptyState`'s real prop shape (`iconName`/`title`/`description?`/`actionLabel?`/`onAction?`/
  `mode?`) fits the plan's proposed usage with no adaptation needed. No gaps, no conflicts.
- Section D — Regression guards + scope discipline: CONCERN (same underlying issue as Infra fit
  above, not double-counted in the net-gate total) — the AC8 regression command depends on a package
  (`packages/utils`) that is unaffected by the dirty tree (verified green, 39/39 live), but the
  broader Test Commands section needed the baseline-isolation caveat added. Scope discipline itself
  is clean: reviewed the Implementation Checklist and Touchpoints table against the SPEC's Out Of
  Scope section — no restyling, no new components, no Order-tab chips, no backend change; explicit
  non-goals are called out at checklist item 12.
- INNOVATE-skip judgment check: confirmed appropriate. No genuine competing design was found —
  where to hold `selectedCategoryId` (screen-local state, given a single consumer) and how to
  express the reset (a separate small effect vs. folding into the existing one) are both low-stakes
  implementation choices already reasoned through in the plan text, not architecture-level
  decisions. The SPEC itself already locked the one real design question (branch-switch reset
  semantics, deliberately diverging from issue #103's AC4) through its own resolved Open Questions,
  with explicit user sign-off — that is exactly the kind of decision INNOVATE exists to arbitrate,
  and it was already closed before this plan was written. No CONDITIONAL routing back for a missed
  design comparison.

Net Gate Derivation:

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | CONCERN |
| Test coverage | PASS |
| Breaking changes | PASS |
| Security surface | PASS |

| Layer 2 sections | Status |
|---|---|
| Section A — Pure filter helper + tests | PASS |
| Section B — category-selector.tsx prop lift | PASS |
| Section C — index.tsx state lift + wiring + empty state | PASS |
| Section D — Regression guards + scope discipline | CONCERN |

**Totals: 0 FAILs / 1 underlying CONCERN (surfaced on 2 rows — Infra fit and Section D describe the
same dirty-working-tree finding, not two separate problems) / 6 PASSes**

**→ Net Gate: CONDITIONAL**

Open gaps: none beyond the one CONCERN above (dirty working tree at VALIDATE time — transient,
mitigated by Implementation Checklist step 15, does not require a plan rewrite).

What this coverage does NOT prove:
- The pure-function tests (AC1-AC5) prove the filtering LOGIC is correct; they do NOT prove the chip
  tap actually reaches `setSelectedCategoryId` on-device, that `ProductGrid` re-renders visibly, or
  that the empty-state text reads correctly on a real screen — those are the paired Agent-Probe rows
  (AC1/AC2/AC4 rendering halves).
- AC7's grep proves the stale comment string is gone; it does NOT prove the replacement comment is
  accurate or that `onSelect` is actually wired correctly end-to-end (that is covered by AC1-AC3's
  functional proof plus the Agent-Probe rendering walkthroughs).
- AC8's regression re-run proves `packages/utils`'s pricing/gating math is untouched; it does NOT
  prove Product Details' on-screen rendering of that math is untouched (no RN component test exists
  for `product/[productId].tsx` in this plan's scope — that is AC9's Agent-Probe row, and even that
  is scoped to light/dark rendering, not a full pricing walkthrough).
- AC6 (branch-switch reset) has zero automated coverage of any kind, by design (see the SPEC's own
  honest tier note) — it is proven ONLY by the Agent-Probe walkthrough, and only for the specific
  scenario exercised (one category active, one branch switch). Rapid/repeated branch switching, or a
  switch that races the menu re-fetch, is not separately verified.
- The dirty-working-tree CONCERN means the two Fully-Automated gate COMMANDS (`typecheck`, `test`)
  are not proven clean as a whole right now — only the specific lines/behaviors this plan's own
  tests target are proven. A truly clean, whole-command green run is deferred to EXECUTE time after
  the baseline-isolation step separates pre-existing noise from real regressions.

Gate: CONDITIONAL
Accepted by: session (autonomous VALIDATE pass, no live user turn available in this subagent
invocation) — accepted concern: "dirty working tree / pre-existing unrelated typecheck+test
failures at VALIDATE time," mitigated via Implementation Checklist step 15 and Test Commands
section updates; re-verify baseline is still accurate when EXECUTE actually starts, since it may
have changed (improved or worsened) by then.

## Autonomous Goal Block

SESSION GOAL: Wire the Home category filter to actually filter the product grid (MENU-004,
issue #103) — a mechanical state-lift on `feat/menu-004-category-filter-polish`, no competing
design, SPEC-locked.
Charter + umbrella plan: N/A — single plan, no umbrella/phase program governs this work.
Autonomy: standard RIPER-5 autonomy — VALIDATE ran autonomously as a subagent pass (no live user
turn available); CONDITIONAL was self-accepted per `orchestration.md` §VALIDATE Gate autonomous
rules (CONCERN-only, no FAIL, cheap/actionable mitigation). EXECUTE still requires explicit "ENTER
EXECUTE MODE" — this gate does not grant standing EXECUTE consent.
Hard stop conditions / safety constraints:
- No schema, auth, API, or billing surface may be touched — if EXECUTE discovers any of these in
  scope, stop and return to PLAN.
- Do not restyle, add new `packages/ui` components, add Order-tab chip filtering, or touch
  `add-to-cart-bar.tsx`'s inset math — all explicitly out of scope per the SPEC.
- Do not attempt to fix the pre-existing, unrelated nav-restructuring typecheck/test failures
  inline (see Implementation Checklist step 15) — file a backlog note instead if still present.
- Never `git add -A` when committing — stage only the 4 exact touchpoint files, since the working
  tree may hold substantial unrelated uncommitted work from other in-flight tasks.
Next phase: EXECUTE — `process/features/ordering-cart/active/menu-004-category-filter-polish_17-07-26/menu-004-category-filter-polish_PLAN_17-07-26.md`
Validate contract: inline in this plan, `## Validate Contract` section above.
Execute start: `pnpm --filter @jojopotato/mobile test` (after Implementation Checklist steps 1-2,
TDD-first) | `pnpm --filter @jojopotato/utils test` (AC8 regression) | `pnpm --filter @jojopotato/mobile typecheck` | 4 Agent-Probe walkthroughs (AC1/AC2/AC4/AC6/AC9) after code-complete | high-risk pack: no (no High-Risk Class applies).
