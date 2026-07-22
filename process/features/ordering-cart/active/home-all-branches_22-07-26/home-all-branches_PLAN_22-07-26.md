---
name: plan:home-all-branches
description: "Home tab shows all-branch products/deals (deduped, subtext-labeled), never a dead-end empty state; confirm-then-switch on cross-branch tap"
date: 22-07-26
feature: ordering-cart
---

# PLAN — Home Tab Shows All-Branch Products

**Date**: 22-07-26

**Complexity**: COMPLEX (new API route + shared `packages/ui` prop contract change + a refactor of
already-shipped branch-switch logic touching 2 screens + regression risk on 2 named test files).

**Status**: VALIDATED — Gate: PASS (see `## Validate Contract` below). 4 plan-mechanism corrections
were applied during VALIDATE (V6) before this gate was written — see `## Validate Contract` →
"Proposed Plan Updates Applied" for what changed and why. Ready for EXECUTE.

**Reads first:** `home-all-branches_SPEC_22-07-26.md` (locked, 12 ACs, L1–L6) — this plan
implements it verbatim. INNOVATE decisions D1–D4 (embedded in the orchestrator task) are locked
and are NOT re-opened below; each work group below cites which decision it implements.

## Overview

Today the Home tab and Deals surfaces only show products/deals carried by the currently-selected
branch, producing a dead "Menu coming soon" / "Unavailable at this branch" state whenever that
branch happens to be thin on stock — even though other branches carry the same items right now.
This plan implements the locked SPEC (`home-all-branches_SPEC_22-07-26.md`, 12 ACs, constraints
L1–L6) and the locked INNOVATE decisions (D1–D4): a new all-branch product route, an additive
branch-count field on the existing all-branch deals route, a subtext caption on product/deal
cards, and a shared confirm-then-switch hook reused by a new proactive tap-time check. See
`## Acceptance Criteria` below for the full testable outcome list (mirrored from the SPEC) and
`## Implementation Checklist` for the atomic, ordered execution steps.

## Acceptance Criteria

This plan targets all 12 SPEC acceptance criteria (AC1–AC12) verbatim — see the SPEC file for full
text. Summary (full detail + proof strategy in `## Verification Evidence` below):

1. AC1 — All-branch merge, deduped (one card per product regardless of selected branch).
2. AC2 — Branch-count subtext, single branch → shows that branch's name.
3. AC3 — Branch-count subtext, multiple branches → "Available at N branches".
4. AC4 — No dead "Menu coming soon" state when the selected branch itself is empty.
5. AC5 — Same-branch tap opens Product Details immediately, no dialog (unchanged).
6. AC6 — Cross-branch tap shows confirmation naming the branch; cancel is a no-op.
7. AC7 — Cross-branch tap, confirm switches branch, clears cart if needed, then navigates.
8. AC8 — Home deals strip is never "unavailable" purely due to branch mismatch.
9. AC9 — Deals tab matches the same all-branch/subtext/never-unavailable treatment.
10. AC10 — Category filter still works against the merged all-branch product list.
11. AC11 — Cross-branch order placement remains impossible (non-regression, server unchanged).
12. AC12 — On-device visual/interaction walkthrough (Agent-Probe, standing project-wide gap).

## TL;DR

Add one new all-branch product route (`GET /products`) and one additive field on the existing
`GET /deals/products` (`branches: {id, name}[]`), both reusing existing serializers/availability
helpers with zero new derivation logic server-side. Add an optional `subtext` prop to `ProductCard`
and `DealCard` (packages/ui) plus a pure `formatBranchSubtext()` formatter. Extract the existing
Product-Details branch-switch flow into a shared hook, reused by a NEW proactive tap-time check on
Home/Deals cards. Wire Home + Deals tab screens to the new all-branch data. 5 independent work
groups (1–4 parallel-safe) then one integration group (5) then the owed Agent-Probe walkthrough.

**VALIDATE correction (read before EXECUTE):** the D4 hook MUST also call
`useBranch().setSelectedBranch()`, not only `useCart().setBranch()` — see Work Group 4 step 1 and
the Validate Contract for why this is load-bearing, not optional polish.

---

## Touchpoints

### New files

| File | Purpose |
|---|---|
| `packages/api/src/routes/products.ts` | D1 — new all-branch product route (sibling to `deals-products.ts`) |
| `packages/api/src/routes/__tests__/products.test.ts` | vitest+supertest suite for the new route, mirrors `deals-products.test.ts` |
| `apps/mobile/src/features/menu/hooks/use-all-branch-products.ts` | New hook reading `GET /products`, alongside (not replacing) `useMenu()` |
| `apps/mobile/src/lib/api-client.ts` | (existing file, additive) — add `getAllBranchProducts()` client fn |
| `apps/mobile/src/features/home/lib/format-branch-subtext.ts` | Pure formatter: `branches[]` → subtext string (D3) |
| `apps/mobile/src/features/home/lib/__tests__/format-branch-subtext.test.ts` | TDD-first unit tests, mirrors `filter-products-by-category.test.ts` |
| `apps/mobile/src/features/branch/hooks/use-confirm-branch-switch.ts` | D4 — shared confirm-then-switch hook (resolve confirm → clear-if-needed → switch BOTH the cart's branch AND the globally selected pickup branch; does NOT navigate) |
| `apps/mobile/src/features/branch/hooks/__tests__/use-confirm-branch-switch.test.tsx` | Hook-level test for the shared extraction — MUST include a case asserting `useBranch().setSelectedBranch` is called with the resolved target branch object, not just `useCart().setBranch` (VALIDATE finding, see Work Group 4) |
| `apps/mobile/src/features/home/components/__tests__/product-grid.test.tsx` (or equivalent Home-tap-flow test) | AC5/AC6/AC7 component coverage — cross-branch tap → dialog → confirm/cancel |
| `apps/mobile/src/app/(tabs)/deals/__tests__/index.test.tsx` | AC8/AC9 Deals-tab-subtext + never-unavailable-due-to-mismatch coverage |

### Modified files

| File | Change |
|---|---|
| `packages/api/src/routes/lib/serializers.ts` | Additive: extend `serializeMenuProduct`'s optional-params contract (or a thin new serializer wrapper) so the new `/products` route and the `/deals/products` `branches` field can attach `branches: {id, name}[]` without touching the existing `ApiMenuProduct` fields consumed by `GET /branches/:id/menu`. Confirmed feasible: `serializeMenuProduct(product, options, components?, available?, scheduleWindows?)` already takes optional trailing params — add `branches?` as a 6th trailing optional param, same omit-when-absent convention. |
| `packages/api/src/routes/deals-products.ts` | D2 — additive `branches: {id, name}[]` computed by calling `resolveAvailableDealProductIds` once per active, accepting-pickup branch and aggregating (reuse verbatim, no re-derivation). See "accepting-pickup filter" note under Work Group 2. |
| `packages/api/src/index.ts` | Mount `app.use('/products', productsRouter);` (public, unauthenticated, sibling to `/branches` and `/deals/products`). Confirmed no path collision with any existing mount. |
| `packages/types/src/menu.ts` | Additive `branches?: { id: string; name: string }[]` field on `Product` (mirrors the existing `available?`/`schedule?` omit-when-absent convention). Also add the same field to `MenuItem` (cart-internal shape) per Work Group 5 step 1 — both types need it. |
| `packages/ui/src/components/product-card.tsx` | Additive optional `subtext?: string` prop — unlabeled caption row under the name/description, following `DealCard`'s `scheduleSummary` precedent (confirmed real: `DealCard.scheduleSummary?: string` exists today with an identical unlabeled-caption-row pattern). `mode: ThemeMode` stays required (no change to that contract). Confirmed current `ProductCardProps` = `{ product, imageSource?, onPress?, mode }` — no existing subtext slot, matches SPEC background claim. |
| `packages/ui/src/components/deal-card.tsx` | Additive optional `subtext?: string` prop, same treatment. Also: the Home/Deals-tab consumers stop passing `available={product.available}` where that would trigger the "Unavailable at this branch" dimmed treatment for a pure branch-mismatch reason (L3) — see Work Group 5 |
| `apps/mobile/src/features/home/lib/menu-to-home-view.ts` OR a new sibling merge helper | D1 consumption — merge/dedup logic: turn `GET /products`'s flat all-branch list into the `MenuItem[]`/`MenuCategory[]` shape `ProductGrid`/`CategorySelector` already accept, now carrying `branches` |
| **`apps/mobile/src/features/home/components/product-grid.tsx`** | **[VALIDATE-added touchpoint — was missing from the original plan.]** Additive: inside `renderItem`, compute `subtext={formatBranchSubtext(item.branches)}` and pass it to `<ProductCard>` alongside the existing `product`/`imageSource`/`onPress`/`mode` props. Without this change, `MenuItem.branches` and `ProductCard.subtext` would both exist but nothing would ever connect them — AC2/AC3 would silently never render on Home's grid. |
| `apps/mobile/src/app/(tabs)/index.tsx` | Wire Home's product grid to `useAllBranchProducts()` (new) instead of `useMenu()`'s branch-scoped tree; wire the deals strip to consume `branches` from `useDealProducts()`; wire the new proactive cross-branch tap check via the shared hook (D4) before calling `useNavigateToProduct`/opening a deal |
| `apps/mobile/src/app/(tabs)/deals/index.tsx` | Same subtext + never-unavailable-due-to-mismatch treatment (L5 — automatic via shared `DealCard`/`dealProductToCard`, but the tap handler needs the same proactive-check wiring). Confirmed: this screen already consumes `useDealProducts()` (the all-branch DEAL-004 route), matching the Home strip's data source — its header doc-comment is stale (still references the old branch-scoped route) but its actual import/behavior is already correct; a one-line comment fix is a free cleanup, not required. |
| `apps/mobile/src/app/(tabs)/product/index.tsx` | D4 refactor — `handleAdd`'s `isSwitchingBranch` branch + `confirmBranchSwitch` extracted into the new shared hook; this screen becomes a CALLER of the hook, not the owner of the confirm/clear/switch logic. **Must not change external behavior** — this is the file the 2 named regression tests exercise. Confirmed exact current shape: `handleAdd` sets `pendingSwitch` when `cart.items.length > 0 && cart.pickupBranchId !== selectedBranch.id`; `confirmBranchSwitch` runs `clearCart(); setBranch(selectedBranch.id); addItem(...)`. In this EXISTING flow `selectedBranch` (from `useBranch()`) is already the target — only the cart's own branch is stale — which is why this flow never needed to call `setSelectedBranch`. The NEW Home/Deals trigger point is different (see Work Group 4). |
| `packages/ui/src/index.ts` | Export barrel — no new component, but re-verify `ProductCard`/`DealCard` prop-type exports still resolve after the additive prop change (no action expected, verification only) |

### Read-only context (no edits, referenced for pattern-matching)

- `packages/api/src/routes/lib/deal-availability.ts` (`resolveAvailableDealProductIds` — reused verbatim, D2). Confirmed signature: `resolveAvailableDealProductIds(dbOrTx, branchId, dealProductIds): Promise<Set<string>>`.
- `apps/mobile/src/app/(tabs)/product/index.tsx`'s pre-refactor `handleAdd`/`confirmBranchSwitch` (source of the D4 extraction)
- `apps/mobile/src/features/cart/hooks/use-cart.ts` (`setBranch`, `clearCart`, `cart.pickupBranchId` — consumed, not modified). **Confirmed by reading source:** `useCart().setBranch(branchId)` only mutates the CART's own `pickupBranchId` (and, as a side effect of its optimistic update, clears cart items when the id actually changes — `optimisticSetBranch` sets `items: []` whenever `pickupBranchId` changes; `product/index.tsx`'s explicit separate `clearCart()` call is therefore harmless-redundant with today's `setBranch`, not a bug). It has **zero effect** on `useBranch()`'s `selectedBranch` — the two contexts are fully independent.
- `apps/mobile/src/features/branch/hooks/use-branch.ts` (`selectedBranch`, `branches`, `setSelectedBranch` — **all three now consumed** by the new D4 hook, not modified as a source file). **Confirmed by reading source:** `setSelectedBranch(branch: PickupBranch)` takes the FULL branch object (not just an id) and persists it to `SecureStore`; `useMenu()` (and therefore `useProductDetails()`) is keyed on `useBranch().selectedBranch.id` — this is the mechanism the D4 fix below depends on.
- `apps/mobile/src/features/menu/hooks/use-menu.ts` / `use-product-details.ts` (read-only, confirms the dependency above: `useMenu()` = `useQuery({ queryKey: ['menu', selectedBranch?.id], ... })`; `useProductDetails(productId)` derives purely from `useMenu()`'s cached tree — it does **not** read `useCart().cart.pickupBranchId` at all).
- `apps/mobile/src/features/menu/lib/navigate-to-product.ts` (`useNavigateToProduct` — consumed unchanged; L4 means the hook's optional `branchId` param stays unused by the caller, exactly as today)

---

## Public Contracts

1. **`GET /products`** (new, unauthenticated, public) — returns every active, non-deal product
   across every active, **accepting-pickup** branch, deduplicated (one row per product), each carrying
   `branches: {id, name}[]`. Response envelope mirrors `GET /deals/products`'s
   `{ categories: [{ id, name, products }] }` shape (reuses `serializeMenuCategory`), so the
   mobile client can flatten it the same way `flattenMenuForHome` already does. No `branchId`
   query param — this route is deliberately branch-agnostic by construction (AC1, AC4).
2. **`GET /deals/products`** (existing, modified additively) — response gains `branches:
   {id, name}[]` on every deal-product. `available: boolean` (existing, `branchId`-gated) is
   UNCHANGED and stays present — it still drives order-placement-adjacent logic elsewhere; this
   plan does not remove it, only stops the Home/Deals-tab UI from rendering the "Unavailable at
   this branch" badge off of it (L3/AC8/AC9 are a presentation change, not a contract removal).
3. **`ProductCard`/`DealCard`** (`packages/ui`) — additive optional `subtext?: string` prop on
   both. `mode: ThemeMode` remains required with no default (unchanged repo-wide convention).
   Omitting `subtext` is a no-op — every existing call site (Order tab, component-showcase, etc.)
   renders byte-identically.
4. **`useConfirmBranchSwitch()`** (new shared hook) — public contract:
   `{ pendingBranchId, requestSwitch(targetBranchId: string), confirm(): Promise<void>, cancel() }`.
   **[VALIDATE-corrected]** `confirm()` MUST perform, in order: (a) resolve the full target
   `PickupBranch` object via `useBranch().branches.find(b => b.id === targetBranchId)`; (b) if not
   found (edge case — see Work Group 4 step 4 below), reject/no-op with an error toast rather than
   throw; (c) conditionally `clearCart()` when the cart holds items from a different branch; (d)
   call `useCart().setBranch(targetBranchId)`; (e) call `useBranch().setSelectedBranch(resolvedBranch)`.
   Steps (d) and (e) both run — omitting (e) was the VALIDATE-caught defect (see Work Group 4).
   The hook does **NOT** navigate — the caller navigates only after the hook's `confirm()` promise
   resolves, per L4.

## Blast Radius

- **Server:** 1 new route file + 1 new mount line + 1 additive field on 1 existing route +
  serializer additions. No schema/migration changes. No auth changes (both routes stay public,
  matching `/branches` and the existing `/deals/products`).
- **Client (packages/ui):** 2 components gain 1 additive prop each. No breaking change to any
  existing consumer (verified by grep sweep during EXECUTE, mirroring the `ProductCard` chevron
  precedent from `order-tab-enhance`).
- **Client (apps/mobile):** 2 screens rewired (Home, Deals tab), 1 already-shipped screen
  refactored (`(tabs)/product/index.tsx` — extraction only, no behavior change), 1 new shared hook,
  2 new pure derivation files, 1 new client-API function, 1 additive per-item wiring change
  (`product-grid.tsx`, VALIDATE-added).
- **Risk class:** none of the SPEC's High-Risk Classes (no auth, no billing, no schema/migration,
  no public API *contract removal* — only additive fields, no destructive writes). The one
  elevated-risk item is the D4 refactor touching already-shipped, regression-tested code — mitigated
  by re-running the 2 named regression tests as a non-negotiable gate (see Verification Evidence),
  AND by the VALIDATE-caught correction that the hook must also call `setSelectedBranch` (without
  which the plan's own new feature would not actually work end-to-end for Home/Deals taps).
- **Files touched (rough count):** ~9 new, ~10 modified = **19 files** (added `product-grid.tsx`),
  spanning `packages/api`, `packages/types`, `packages/ui`, `apps/mobile` (4 packages/apps —
  matches INNOVATE's flagged cross-package blast radius).

---

## Locked Decisions Recap (informational — implement, do not re-derive)

- **D1** — new `GET /products` route (products.ts), sibling to `deals-products.ts`. Rejected:
  client-side N-branch fan-out; `?allBranches=true` flip on the existing menu route.
- **D2** — additive `branches` field on `GET /deals/products`, computed server-side by calling
  `resolveAvailableDealProductIds` once per active, accepting-pickup branch and aggregating. Note
  (non-blocking): this loop is linear in branch count (4 today); leave an inline code comment
  marking ~15-20 branches as a revisit trigger.
- **D3** — new optional `subtext?: string` prop on `ProductCard` AND `DealCard` (packages/ui,
  following `DealCard.scheduleSummary` precedent) + a pure `formatBranchSubtext(branches)` →
  `"Branch Name"` (N=1) | `"Available at N branches"` (N>1) formatter, TDD-first.
- **D4** — extract the existing confirm-then-switch flow from `(tabs)/product/index.tsx` into a
  shared hook reused by the new Home/Deals tap trigger. Ordering: confirm → clear-if-needed →
  switch BOTH the cart branch AND the globally-selected pickup branch → hook resolves; CALLER
  navigates only after. New proactive "does the selected branch carry this product?" check lives
  beside the Home/Deals tap handler, NOT inside the shared hook. Always use `ConfirmDialog`/`Toast`
  — never `Alert.alert`.

---

## Implementation Checklist (Work Groups, execution ordering)

Work groups **1–4 are mutually parallel-safe** (independent files, no shared edit surface).
Work group **5 depends on 1–4** (consumes all of D1/D2/D3/D4). AC12 (Agent-Probe) runs after 5.

### Work Group 1 — D1: `GET /products` backend route

1. Create `packages/api/src/routes/products.ts`:
   - Query all active, non-deal products (`products.is_active = true AND products.is_deal =
     false`), joined to their active category (mirrors `branches.ts`'s regular-menu query shape,
     minus the `branch_product_availability` INNER JOIN — this route is deliberately branch-agnostic).
   - Batch-query `branch_product_availability` for those product ids WHERE `is_available = true`,
     joined to `branches` (**active AND `is_accepting_pickup = true`** — see VALIDATE note below)
     for the name — one query, not per-product — to build `Map<productId, {id, name}[]>`.
     **[VALIDATE correction]** Filter branches to `is_active = true AND is_accepting_pickup = true`,
     not `is_active` alone. Reason: `useBranch()` (the client's globally-selectable branch list,
     used by the D4 hook to resolve a switch target) is already filtered client-side to
     `isAcceptingPickup === true` (`openOnly()` in `use-branch.ts`). If this route's `branches[]`
     included a currently-non-accepting branch, the Home grid could show "Available at Branch X"
     for a branch the customer cannot actually select or order from, and the D4 hook's
     `useBranch().branches.find(id)` lookup for that branch would fail. Matching the filter avoids
     both problems.
   - Options query: reuse the same batched-options pattern as `branches.ts`/`deals-products.ts`.
   - Serialize via `serializeMenuProduct` (existing) + attach `branches` (new field, see
     serializer note below).
   - Response: `{ categories: [{ id, name, products }] }` (grouped by real category, NOT the
     single synthetic "Deals" bucket `deals-products.ts` uses — regular products keep real
     categories so `CategorySelector`/AC10 continue to work unchanged).
2. `packages/api/src/routes/lib/serializers.ts`: extend `serializeMenuProduct`'s signature with an
   additional optional trailing param `branches?: { id: string; name: string }[]` (mirrors the
   existing `available?`/`scheduleWindows?` optional-trailing-param convention exactly — omit-key
   pattern, zero change to any existing caller that doesn't pass it). Emit the `branches` key only
   when the param is passed and non-empty (same convention as `schedule`).
3. `packages/types/src/menu.ts`: add `branches?: { id: string; name: string }[]` to `Product`,
   documented as additive/omit-when-absent, mirroring the `available`/`schedule` doc comments.
4. Mount: `packages/api/src/index.ts` — `app.use('/products', productsRouter);` (public, no auth
   middleware — sibling position to `/branches` and `/deals/products`). Confirmed no existing mount
   collides with `/products`.
5. `packages/api/src/routes/__tests__/products.test.ts` — mirror `deals-products.test.ts`'s
   structure: empty-catalog case, dedup (one row per product, not per branch), `branches` array
   correctness (1-branch product, 2+-branch product, 0-branch product — a product exists but has
   no `branch_product_availability` row anywhere → `branches: []`, still listed per AC4/AC1),
   category grouping, deal-products excluded, inactive products/branches excluded, **a branch that
   is active but `is_accepting_pickup = false` does NOT appear in any product's `branches[]`**.

### Work Group 2 — D2: additive `branches` field on `GET /deals/products`

1. `packages/api/src/routes/deals-products.ts`: after the existing single-optional-`branchId`
   availability resolution, ALSO fetch all active, **accepting-pickup** branches (same
   `is_active = true AND is_accepting_pickup = true` filter as Work Group 1 — VALIDATE correction,
   applies here identically) and, for each, call `resolveAvailableDealProductIds(db, branch.id,
   productIds)` — aggregate into `Map<productId, {id, name}[]>`. Reuse the function verbatim; do
   not re-derive availability logic (MENU-003 invariant, cited in SPEC background).
   - Inline code comment: `// Linear in branch count (currently 4). Revisit with a batched
     multi-branch query if this list grows past ~15-20 branches.`
2. Pass the new `branches` array into `serializeMenuProduct`'s new trailing param (same as Work
   Group 1's serializer change — one shared code path).
3. Extend `packages/api/src/routes/__tests__/deals-products.test.ts` with new cases: a deal
   available at 1 branch → `branches` has 1 entry; a deal available at 2+ branches → `branches`
   has all of them; a deal available nowhere (e.g. zero-component deal, or every component
   unavailable everywhere) → `branches: []`, deal is STILL LISTED (flag-not-hide, unchanged); a
   deal whose only carrying branch is active-but-not-accepting-pickup → `branches: []` (same
   VALIDATE-corrected filter as Work Group 1). Confirm the existing `available: boolean` field is
   UNCHANGED (regression-locked).

### Work Group 3 — D3: `subtext` prop + formatter (packages/ui + apps/mobile)

1. `packages/ui/src/components/product-card.tsx`: add optional `subtext?: string` prop.
   Render as an unlabeled `<Text>` caption row, positioned under `description` (or under `name`
   if no description) — small, `theme.textSecondary`, mirrors `DealCard.scheduleSummary`'s
   `styles.scheduleSummary` treatment exactly (same font/size/color tokens). No new theming
   surface — `mode: ThemeMode` stays required, no default. Omitting `subtext` renders unchanged.
2. `packages/ui/src/components/deal-card.tsx`: add optional `subtext?: string` prop, same unlabeled
   caption-row treatment, positioned alongside the existing `validUntil`/`scheduleSummary` caption
   rows (after them, before the `isUnavailable` badge check — but see Work Group 5 for the L3
   change to when that badge fires at all).
3. `apps/mobile/src/features/home/lib/format-branch-subtext.ts` — pure function:
   ```
   formatBranchSubtext(branches: { id: string; name: string }[]): string | undefined
   ```
   - `branches.length === 0` → `undefined` (no subtext row — e.g. a product with zero carrying
     branches; card still renders per AC1/AC4, just without a subtext caption).
   - `branches.length === 1` → the single branch's `name`.
   - `branches.length >= 2` → `` `Available at ${branches.length} branches` ``.
4. TDD-first unit tests in `__tests__/format-branch-subtext.test.ts` (mirrors
   `filter-products-by-category.test.ts`'s structure): 0/1/2/N-branch cases, proven non-vacuous
   (a passthrough/always-undefined implementation fails the 1- and 2+-branch cases).
5. Run `pnpm --filter @jojopotato/mobile guard:theme-mode` and `packages/ui`'s `check-tokens`
   after the two component edits — hard gate per repo convention, zero violations expected (no new
   theming surface was introduced, only a text-caption prop).
6. **[VALIDATE-added]** This formatter has exactly one real consumer wiring point:
   `product-grid.tsx`'s `renderItem` (regular products) and the Deals strip/tab's `<DealCard
   subtext={...}>` call sites (Work Group 5). Do not consider Work Group 3 "done" until both
   consumer sites actually call `formatBranchSubtext()` — see Work Group 5 step 3/4.

### Work Group 4 — D4: shared confirm-then-switch hook extraction

1. Create `apps/mobile/src/features/branch/hooks/use-confirm-branch-switch.ts`:
   - Extract the exact logic currently inline in `(tabs)/product/index.tsx`'s `handleAdd`
     (the `isSwitchingBranch` check + `setPendingSwitch`) and `confirmBranchSwitch`
     (`clearCart()` + `setBranch()`) into the hook.
   - Hook owns: pending-switch state (store the pending TARGET BRANCH ID), the decision "does this
     action require clearing the cart first" (`cart.items.length > 0 && cart.pickupBranchId !==
     targetBranchId`), and the confirm/cancel resolution.
   - **[VALIDATE correction — load-bearing, not optional]** On `confirm()`, the hook must perform
     ALL of the following, in order:
     1. Resolve the full target `PickupBranch` object: `const target = branches.find(b => b.id ===
        pendingBranchId)` (using `useBranch().branches`, called from inside this hook).
     2. If `target` is undefined (the branch dropped out of the accepting-pickup list between tap
        and confirm — a real but rare race), do NOT proceed with a partial switch. Reject
        gracefully: clear pending state and let the caller show an error toast (see Work Group 4
        step 4 below for the exact caller-visible contract).
     3. If the cart holds items from a different branch: `clearCart()`.
     4. `useCart().setBranch(pendingBranchId)`.
     5. `useBranch().setSelectedBranch(target)`.
     **Why both (4) and (5) are required:** `useCart().setBranch()` only updates the CART's own
     `pickupBranchId` — it has zero effect on `useBranch().selectedBranch`. But `useMenu()` (and
     therefore `useProductDetails()`, which powers Product Details) is keyed ONLY on
     `useBranch().selectedBranch.id`, never on the cart's branch. If the hook only did (4), the
     existing `(tabs)/product/index.tsx` flow would keep working (there, `selectedBranch` is
     already the target — the mismatch is cart-only), but the NEW Home/Deals cross-branch-tap flow
     (where `selectedBranch` genuinely needs to CHANGE to the tapped product's branch) would leave
     `useMenu()` querying the OLD branch — so `navigateToProduct` would land on a Product Details
     screen that cannot find the tapped product (AC7 would silently fail: no crash, just the
     product-not-available message the SPEC explicitly says must not flash). Calling
     `setSelectedBranch(target)` unconditionally is safe and idempotent for the EXISTING
     `product/index.tsx` flow too — `target` there already equals the current selection, so it's a
     harmless no-op re-set (same id in, same id out, no extra refetch since `useMenu()`'s query key
     is unchanged).
   - Hook does **NOT** navigate and does **NOT** call `addItem`/open Product Details — those stay
     caller-specific (Product Details still calls `addItem` after switching; Home/Deals will call
     `navigateToProduct`/open the deal after switching). This is the critical ordering constraint
     from L4/D4: switch resolves BEFORE the caller's next action runs.
   - Exact API shape: `{ pendingBranchId, requestSwitch(targetBranchId: string), confirm(): Promise<void>, cancel() }`
     — `confirm()` resolves only after steps 1–5 above have run (or rejects/no-ops on the not-found
     edge case), so callers can safely `await` it or chain a `.then()` before navigating/adding.
2. Refactor `(tabs)/product/index.tsx`:
   - Replace the inline `pendingSwitch` state + `confirmBranchSwitch` function with calls into
     the new hook.
   - `handleAdd` becomes: build `menuItem`/`opts` → if branch mismatch, `requestSwitch(selectedBranch.id)`
     and return (store the pending add-item payload locally in THIS screen, not in the hook — the
     hook only owns branch-switch state, not "what to do after") → on the hook's `confirm()`
     resolving, THIS screen calls `addItem(...)` and shows the toast (unchanged behavior).
   - The `<ConfirmDialog>` JSX in this screen now reads its `visible`/`onConfirm`/`onCancel` off
     the hook's exposed state/handlers instead of local state.
   - **Explicit non-goal:** do not change the dialog copy, the toast copy, or the timing of when
     `addItem` fires relative to `setBranch`/`setSelectedBranch` — this is a pure extraction plus
     the one behavioral addition documented above (calling `setSelectedBranch`), not a broader
     behavior change. The extraction MUST NOT alter the exact strings asserted by the 2 regression
     tests (`title="Switch branch?"`, `confirmLabel="Clear and switch"`, `cancelLabel="Cancel"` on
     Product Details; `title="Change branch?"`, `confirmLabel="Change & clear"` on the (unrelated,
     untouched) Cart screen).
3. Add `apps/mobile/src/features/branch/hooks/__tests__/use-confirm-branch-switch.test.tsx` —
   hook-level test asserting: same-branch request is a no-op (no dialog state set), cross-branch
   request sets pending state, `confirm()` clears cart only when the cart held items from a
   DIFFERENT branch (not when the cart was empty), `confirm()` always calls `setBranch`, **`confirm()`
   always calls `setSelectedBranch` with the resolved full branch object (VALIDATE-added
   assertion)**, `cancel()` clears pending state without calling `clearCart`/`setBranch`/
   `setSelectedBranch`, and the not-found edge case (target id absent from `useBranch().branches`)
   resolves without throwing and without calling `clearCart`/`setBranch`/`setSelectedBranch`.
4. **Edge-case handling (VALIDATE-added, Execute-Agent Instruction):** when `confirm()` hits the
   not-found case (step 1.2 above), the caller (Home/Deals screen) should show an error toast (e.g.
   "That branch is no longer available — please try another item.") and NOT navigate. Exact copy
   is an EXECUTE-time judgment call; the constraint is: no crash, no navigation, no silent no-op
   with zero user feedback.
5. **MANDATORY non-regression gate (do not skip, do not merely "add new tests"):** re-run, unmodified
   except for necessarily-adjusted mocks if the hook's internals change what's mocked:
   - `apps/mobile/src/features/cart/__tests__/cart-branch-switch.test.tsx`
   - `apps/mobile/src/features/menu/__tests__/product-branch-switch.test.tsx`
   Both MUST stay green after the extraction. These tests mock `useCart`/`useBranch` directly (not
   the new hook) and return a STATIC `selectedBranch`/`branches` fixture — they do not assert
   whether `setSelectedBranch` is or isn't called, so the VALIDATE-added `setSelectedBranch` call
   is safe to add without touching either file. If a change to either test file becomes necessary
   anyway, document exactly why in the phase report; an unexplained edit to either file is a signal
   the extraction altered behavior beyond what this plan authorizes.

### Work Group 5 — Integration: wire Home + Deals tab (depends on 1–4)

1. **New merge/dedup derivation** (D1 consumption): create a pure helper — e.g.
   `apps/mobile/src/features/home/lib/all-branch-products-to-home-view.ts` — that takes
   `GET /products`'s `{ categories }` response and flattens it into the existing `HomeMenuView`
   shape (`{ categories: MenuCategory[]; products: MenuItem[] }`), extending `MenuItem` with the
   new `branches` field (add `branches?: { id: string; name: string }[]` to `MenuItem` in
   `packages/types/src/menu.ts` alongside the `Product` change in Work Group 1 step 3 — both types
   need it, since `flattenMenuForHome`/this new helper both produce `MenuItem`).
   - This is genuinely a NEW file (not a modification of `flattenMenuForHome`) because the input
     shape differs meaningfully in intent (already-deduped all-branch vs. per-branch), even though
     the output shape (`HomeMenuView`) is identical — keeps `flattenMenuForHome` (still used
     nowhere after this? — verify: check whether anything besides Home still needs the
     branch-scoped `useMenu()` tree; if nothing does, note it as a candidate for a follow-up
     cleanup, do NOT delete it in this plan — Order tab explicitly stays single-branch per SPEC
     Out-of-Scope, so confirm during EXECUTE whether `useMenu()`/`flattenMenuForHome` still has a
     live consumer before deciding whether removal is even relevant — confirmed during VALIDATE:
     `useProductDetails()` still depends on `useMenu()` directly, so `useMenu()` stays live
     regardless; only `flattenMenuForHome`'s Home-specific consumer moves).
   - TDD-first unit tests for this new helper, dedup-focused (SPEC AC1's actual proof surface):
     construct a fixture where the same product id appears under 2 different branches' underlying
     rows is impossible at the API layer (the new route already dedupes server-side) — so this
     helper's own test instead asserts it does NOT introduce duplicate cards from a
     multi-category or multi-branches-array situation, and correctly threads `branches` through
     to each `MenuItem`.
2. `apps/mobile/src/features/menu/hooks/use-all-branch-products.ts`: `useQuery` wrapping the new
   `getAllBranchProducts()` client call (add to `apps/mobile/src/lib/api-client.ts`, mirroring
   `getDealProducts`'s shape — flatten `{ categories }` into a flat product list OR keep the
   categories envelope, matching whatever the merge helper from step 1 expects). No `enabled`
   gate — this route needs no branch selection (mirrors `useDealProducts`'s no-gate pattern, AC1).
3. `apps/mobile/src/app/(tabs)/index.tsx`:
   - Replace the product-grid data source: `menuQuery` (branch-scoped `useMenu()`) → new
     `useAllBranchProducts()`, run through the new merge helper instead of `flattenMenuForHome`.
   - **Remove the "Menu coming soon" dead-end path** (AC4) — the empty-grid empty state now only
     fires when the ALL-BRANCH catalog is genuinely empty (SPEC's still-valid separate empty
     state), not when `selectedBranch`'s own menu happens to be empty.
   - `selectCategory`/`filterProductsByCategory`/`CategorySelector` wiring is UNCHANGED (AC10) —
     they already operate on whatever `MenuItem[]`/`MenuCategory[]` is passed in; only the upstream
     source of that list changes.
   - `openProduct(productId)`: becomes the NEW proactive-check call site (D4). Before calling
     `navigateToProduct`, look up the tapped product's `branches` (from the merged all-branch list
     already in memory — no extra fetch) and check whether `selectedBranch.id` is among them.
     - Carried by current branch (or `branches` includes it) → call `navigateToProduct` immediately,
       unchanged (AC5).
     - NOT carried by current branch → call the D4 hook's `requestSwitch(otherBranchId)` (pass the
       target branch's id string — the hook resolves the full object internally, see Work Group 4);
       on the hook's `confirm()` resolving, THEN call `navigateToProduct` (AC7). On cancel, do
       nothing (AC6). On the not-found edge case, show the error toast per Work Group 4 step 4 and
       do not navigate.
     - Confirm dialog message: `"This is from {branch name}. Switch your pickup branch?"` per
       SPEC's Flow diagram — pass the target branch's name into the dialog copy. **Confirmed during
       VALIDATE:** `packages/ui/src/components/confirm-dialog.tsx`'s `message` prop is already a
       plain, free-form optional string, set per-call by the caller (`message?: string`, rendered
       verbatim) — no `packages/ui` change is needed for this; the caller just interpolates the
       branch name into its own string, exactly like `product/index.tsx`'s existing dialog already
       does for its own message.
   - Deals strip: `openDeal(dealId)` gets the same proactive-check treatment, sourced from
     `useDealProducts()`'s new `branches` field (Work Group 2). `<DealCard>` stops passing
     `available={product.available}` as the sole driver of the dimmed/unavailable badge — that
     prop still exists on `DealCard` (do not remove it from the component, other future callers
     may need it), but per L3/AC8 the Home strip and Deals tab must not surface it purely because
     the CURRENTLY SELECTED branch can't fulfil the deal (that's exactly the "unavailable due to
     branch mismatch" case this SPEC eliminates) — pass `subtext={formatBranchSubtext(product
     .branches)}` and omit/pass-through `available` only if a genuinely different signal drives it
     (e.g. deal fully inactive/expired everywhere — verify during EXECUTE whether `available` can
     still legitimately be `false` for a reason OTHER than "not at this branch"; if not, stop
     passing `available` on Home/Deals entirely and rely on `branches.length === 0` +
     no-subtext-rendered as the only degraded state).
4. `apps/mobile/src/app/(tabs)/deals/index.tsx`: identical `subtext`/never-badge-due-to-mismatch
   treatment (L5 — shares `DealCard`/`dealProductToCard`), plus the same proactive-tap-check
   wiring before `router.push` to Deal Details (AC9). This screen currently `router.push`es
   directly (no shared navigate-to-deal helper exists) — the proactive check simply gates that
   existing `router.push` call the same way Home's `openDeal` does.
5. **[VALIDATE-added, was implicit]** `apps/mobile/src/features/home/components/product-grid.tsx`:
   inside `renderItem`, add `subtext={formatBranchSubtext(item.branches)}` to the `<ProductCard>`
   call — this is the only place a regular product's subtext actually reaches the rendered card
   (Work Group 3 built the formatter; this step is what calls it).
6. Component tests (new, per the New Files table): AC5 (same-branch tap → no dialog, navigates
   immediately), AC6 (cross-branch tap → dialog shows target branch name, cancel = zero mutation/
   navigation), AC7 (confirm → `setSelectedBranch` + `setBranch` → conditional `clearCart` →
   navigate, in that order; assert the navigated-to product actually resolves — i.e. that
   `useProductDetails`/`useMenu()` would find it post-switch, not just that `navigateToProduct` was
   called), AC8 (Home deals strip never renders unavailable-due-to-mismatch, subtext reflects real
   count), AC9 (Deals tab — same assertions as AC8).
7. **[VALIDATE-added, minor]** Add or extend a Home-screen-level test/assertion proving AC4
   directly: with a selected branch whose OWN per-branch menu is empty but the all-branch catalog
   is non-empty, the grid still renders products (not the "Menu coming soon" empty state). This can
   be a small addition to the merge-helper test or a dedicated Home-screen component test —
   EXECUTE's choice, as long as the assertion exists somewhere.

### AC12 — Agent-Probe (after Work Group 5, before archival)

User-run on-device walkthrough: light/dark mode grid render, confirm-dialog copy reads naturally,
branch-switch-then-navigate lands cleanly on Product Details with no "not available" flash, Deals
strip/tab read correctly with new subtext. This is the standing project-wide no-RN-E2E-runner gap
(already documented, not new debt) — record as owed in the phase report; the task folder stays in
`active/` until the user performs it, per this repo's established Phase Completion Rules.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `packages/api` vitest: `products.test.ts` — dedup, `branches` array correctness (0/1/2+ branches, accepting-pickup filter), category grouping, deal-products excluded | Fully-Automated | AC1, AC2, AC3, AC4 |
| `packages/api` vitest: `deals-products.test.ts` new cases — `branches` field on deal-products (incl. accepting-pickup filter), `available` unchanged | Fully-Automated | AC8, AC9 (data layer) |
| `apps/mobile` vitest: `format-branch-subtext.test.ts` — 0/1/2+ branch cases | Fully-Automated | AC2, AC3 |
| `apps/mobile` vitest: `all-branch-products-to-home-view.test.ts` (or equivalent merge-helper test) — dedup/merge, `branches` threaded through | Fully-Automated | AC1, AC4 |
| `apps/mobile` vitest: `filter-products-by-category.test.ts` — RE-RUN unmodified against the merged list's new upstream source | Fully-Automated | AC10 |
| `apps/mobile` jest-expo: `use-confirm-branch-switch.test.tsx` — asserts `setSelectedBranch` AND `setBranch` both fire on confirm, not-found edge case handled | Hybrid | AC7 (mechanism-level, the VALIDATE-caught fix) |
| `apps/mobile` jest-expo: Home product-grid component test — same-branch tap opens directly (no dialog) | Hybrid | AC5 |
| `apps/mobile` jest-expo: Home product-grid component test — cross-branch tap shows dialog with correct branch name, cancel is a no-op | Hybrid | AC6 |
| `apps/mobile` jest-expo: Home product-grid component test — confirm switches branch (both cart AND selected-branch), conditionally clears cart, then navigates, in order | Hybrid | AC7 |
| `apps/mobile` jest-expo: Home deals-strip component test — no card renders unavailable purely due to branch mismatch; subtext correct | Hybrid | AC8 |
| `apps/mobile` jest-expo: Deals-tab component test — same assertions as AC8 | Hybrid | AC9 |
| **`apps/mobile/src/features/cart/__tests__/cart-branch-switch.test.tsx` — RE-RUN, must stay green (non-regression gate, not new-test substitute)** | Hybrid | Regression guard on D4 extraction (protects AC7's existing precedent) |
| **`apps/mobile/src/features/menu/__tests__/product-branch-switch.test.tsx` — RE-RUN, must stay green (non-regression gate, not new-test substitute)** | Hybrid | Regression guard on D4 extraction (protects AC5/AC7's existing precedent) |
| `packages/api` vitest: existing order-placement branch-availability suite (`orders.test.ts`'s `POST /orders — MENU-003 deal component availability` block, confirmed present at line ~1757, and/or the general branch-availability tests) — RE-RUN unmodified | Fully-Automated | AC11 (non-regression, no server change) |
| `pnpm --filter @jojopotato/mobile guard:theme-mode` + `packages/ui` `check-tokens` | Fully-Automated | Theming convention gate on the `ProductCard`/`DealCard` prop additions (constraint, not a numbered AC) |
| User-run on-device walkthrough (light/dark, dialog copy, no-flash landing, Deals subtext) | Agent-Probe | AC12 |

### Exact Commands (confirmed live against `process/context/tests/all-tests.md` and each package's `package.json` during VALIDATE — no longer "confirm at EXECUTE")

- `packages/api`: `docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test` (runs `vitest run`)
- `apps/mobile` (vitest pure-TS + jest-expo RN components, ONE script, sequential): `pnpm --filter @jojopotato/mobile test` — this runs `vitest run --passWithNoTests && jest` as a single package script. **There is no separate `test:local` script — the earlier draft of this plan referenced one that does not exist; corrected during VALIDATE.**
- `packages/ui` (jest-expo): `pnpm --filter @jojopotato/ui test` (runs `jest`)
- Typechecks: `pnpm --filter @jojopotato/api typecheck`, `pnpm --filter @jojopotato/mobile typecheck`, `pnpm --filter @jojopotato/ui typecheck`, `pnpm --filter @jojopotato/types typecheck` (if applicable)
- `pnpm --filter @jojopotato/mobile guard:theme-mode` (runs `node scripts/check-theme-mode.mjs`)
- `pnpm --filter @jojopotato/ui check-tokens` (runs `node scripts/check-raw-tokens.mjs`)
- `pnpm format:check` on touched files

---

## Test Infra Improvement Notes

(none identified yet)

---

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/features/ordering-cart/active/home-all-branches_22-07-26/home-all-branches_PLAN_22-07-26.md`
2. **Last completed phase or step:** VALIDATE — Gate: PASS. 4 corrections applied to the plan text
   during VALIDATE (see `## Validate Contract` → Proposed Plan Updates Applied). Not yet executed.
3. **Validate-contract status:** written — see `## Validate Contract` below. Gate: PASS.
4. **Supporting context files loaded:**
   - `process/features/ordering-cart/active/home-all-branches_22-07-26/home-all-branches_SPEC_22-07-26.md`
   - `process/context/all-context.md`, `process/context/tests/all-tests.md`
   - Read (not modified): `packages/api/src/routes/{deals-products,branches}.ts`,
     `packages/api/src/routes/lib/{deal-availability,serializers}.ts`,
     `packages/types/src/menu.ts`, `apps/mobile/src/app/(tabs)/{index,product/index,deals/index}.tsx`,
     `apps/mobile/src/features/{home,menu,deals,branch,cart}/**` (hooks/lib referenced above),
     `packages/ui/src/components/{product-card,deal-card,confirm-dialog}.tsx`,
     the 2 named regression test files, `apps/mobile/src/features/home/components/product-grid.tsx`,
     `apps/mobile/src/features/branch/hooks/use-branch.ts`, `apps/mobile/src/features/cart/hooks/use-cart.ts`,
     `apps/mobile/src/features/menu/hooks/{use-menu,use-product-details}.ts`.
5. **Next step for a fresh agent picking up mid-execution:** ENTER EXECUTE MODE against this plan.
   Work Groups 1–4 may be done in any order or in parallel, but Work Group 5 MUST NOT begin until
   1–4 are all complete (it consumes all four). Pay special attention to Work Group 4 step 1 — the
   `setSelectedBranch` call is load-bearing, not optional; the hook-level test in Work Group 4
   step 3 must assert it fires.

---

## Validate Contract

Status: PASS
Date: 22-07-26
date: 2026-07-22
generated-by: outer-pvl

Parallel strategy: sequential (executed) — recommended: parallel-subagents
Rationale: 7-signal score 3/7 (S1 multi-package scope: packages/api + packages/types +
packages/ui + apps/mobile; S2 additive API surface touched; S7 19 files in blast radius) = MEDIUM,
which per the strategy table would recommend parallel Layer-1/Layer-2 fan-out subagents. This
VALIDATE pass was executed by a single vc-validate-agent session with no sub-agent spawn capability
available in-session, so all 4 Layer-1 dimensions and 5 Layer-2 work-group sections below were
analyzed sequentially by direct source-code verification (not fanned out) — coverage is complete,
only the execution mechanism differs from the recommendation. For EXECUTE: recommend PARALLEL
SUBAGENTS for Work Groups 1–4 (4 agents, mutually independent per the plan's own claim, verified
true — no shared edit surface) followed by ONE sequential agent for Work Group 5 (depends on all
four). Agent count: 4 (parallel) + 1 (sequential) = 5, well under the 30-agent cost-guard
threshold. Alternative: a single sequential vc-execute-agent end-to-end is also reasonable given
the plan's modest total file count (19) and the tight coupling all 5 work groups have to one
feature narrative — either strategy is acceptable; parallel saves wall-clock time, sequential
reduces coordination risk on the D4/D3 touchpoints that Work Group 5 depends on precisely.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | All-branch merge, deduped (one card per product) | Fully-Automated | `apps/mobile` `all-branch-products-to-home-view.test.ts` (new, Work Group 5 step 1) + `packages/api` `products.test.ts` dedup case | B |
| AC2 | Branch-count subtext, single branch → branch name | Fully-Automated | `format-branch-subtext.test.ts` (new, Work Group 3) | B |
| AC3 | Branch-count subtext, 2+ branches → "Available at N branches" | Fully-Automated | `format-branch-subtext.test.ts` (new, Work Group 3) | B |
| AC4 | No dead "Menu coming soon" when selected branch itself is empty | Fully-Automated | merge-helper test + Home-screen assertion (Work Group 5 step 7, VALIDATE-added) | B |
| AC5 | Same-branch tap opens Product Details immediately, no dialog | Hybrid | Home product-grid component test (new, Work Group 5 step 6) | B |
| AC6 | Cross-branch tap shows confirm dialog naming the branch; cancel is a no-op | Hybrid | Home product-grid component test (new, Work Group 5 step 6) | B |
| AC7 | Cross-branch tap, confirm switches (cart branch AND selected branch), conditional clear, then navigates in order, product actually resolves | Hybrid | `use-confirm-branch-switch.test.tsx` (new, Work Group 4 step 3) + Home product-grid component test (Work Group 5 step 6) | B |
| AC8 | Home deals strip never "unavailable" due to branch mismatch; subtext correct | Hybrid | Home deals-strip component test (new, Work Group 5 step 6) | B |
| AC9 | Deals tab matches AC8's treatment | Hybrid | Deals-tab component test (new, Work Group 5 step 6) | B |
| AC10 | Category filter still works over the merged list | Fully-Automated | `filter-products-by-category.test.ts` — RE-RUN unmodified | A |
| AC11 | Cross-branch order placement remains impossible (non-regression) | Fully-Automated | `orders.test.ts` `POST /orders — MENU-003 deal component availability` block (line ~1757) — RE-RUN unmodified | A |
| AC12 | On-device visual/interaction walkthrough | Agent-Probe | User-run walkthrough after Work Group 5 | D |
| — (regression guard) | D4 extraction does not break the 2 pre-existing branch-switch flows | Hybrid | `cart-branch-switch.test.tsx` + `product-branch-switch.test.tsx` — RE-RUN unmodified | A |
| — (theming constraint) | New `subtext` props / new component pass the repo's mode-prop + raw-token conventions | Fully-Automated | `guard:theme-mode` + `check-tokens` | B |

gap-resolution legend:
- A — proven now (gate passes in this cycle; pre-existing tests re-run as non-regression checks)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries only Fully-Automated / Hybrid / Agent-Probe.
No Known-Gap strategy value is used anywhere in this table — AC12 is the only Agent-Probe row and
it is a named, standing, already-documented project-wide residual (no RN E2E/navigation runner
exists anywhere in this repo), not a gap unique to this plan.

Legacy line form (retained so existing validate-contract consumers still parse):
- AC1/AC4/AC10: apps/mobile+packages/api pure-derivation and dedup coverage: [Fully-automated: `pnpm --filter @jojopotato/mobile test` (vitest portion) + `pnpm --filter @jojopotato/api test`]
- AC2/AC3: subtext formatter coverage: [Fully-automated: `pnpm --filter @jojopotato/mobile test` (vitest portion)]
- AC5/AC6/AC7/AC8/AC9: confirm-dialog + branch-switch + deals-strip component coverage: [hybrid: `pnpm --filter @jojopotato/mobile test` (jest portion) + precondition: none, jest-expo is self-contained]
- AC11: cross-branch order-placement non-regression: [hybrid: `pnpm --filter @jojopotato/api test` + precondition: `docker compose up -d && pnpm --filter @jojopotato/api db:migrate`]
- AC12: on-device walkthrough: [agent-probe: light/dark grid render, dialog copy, no-flash landing, Deals subtext — user-run, standing project-wide gap]
- Theming: [fully-automated: `pnpm --filter @jojopotato/mobile guard:theme-mode` + `pnpm --filter @jojopotato/ui check-tokens`]

Failing stubs (Fully-Automated rows only):

```
// AC1 (merge/dedup) — apps/mobile/src/features/home/lib/__tests__/all-branch-products-to-home-view.test.ts
test("should dedupe products carried by multiple branches into one MenuItem with a populated branches array", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: all-branch merge, deduped")
})
```
```
// AC2/AC3 (subtext) — apps/mobile/src/features/home/lib/__tests__/format-branch-subtext.test.ts
test("should format subtext as the single branch name when branches.length === 1, and 'Available at N branches' when >= 2", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: branch-count subtext formatting")
})
```
```
// AC4 (no dead empty state) — Home-screen or merge-helper test
test("should render the all-branch product grid even when the selected branch's own menu is empty", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: no dead Menu-coming-soon state")
})
```
```
// AC10 (category filter over merged list) — RE-RUN, no new stub needed (pre-existing test, unmodified)
```
```
// AC11 (order-placement non-regression) — RE-RUN, no new stub needed (pre-existing test, unmodified)
```
```
// Theming — pnpm --filter @jojopotato/mobile guard:theme-mode / pnpm --filter @jojopotato/ui check-tokens
// (script-based gate, not a test-file stub — fails the run itself on violation)
```

Dimension findings:
- Infra fit: PASS — No container/infra/proxy/gateway surface touched. New Express route mount
  point (`/products`) confirmed to collide with nothing existing. Reuses established public-route,
  no-auth-middleware pattern from `/branches` and `/deals/products` exactly.
- Test coverage: CONCERN → RESOLVED — the plan's Exact Commands section named a nonexistent
  `apps/mobile` `test:local` script; corrected in this pass to the real single `pnpm --filter
  @jojopotato/mobile test` command (confirmed live against `package.json` and `all-tests.md`). All
  other test-tier assignments (Fully-Automated for pure derivations, Hybrid for component/RN tests,
  Agent-Probe for AC12) match established repo convention. Vacuous-green check: every developed
  behavior (AC1–AC11) has at least one Fully-Automated or Hybrid proving test named — AC12's
  Agent-Probe status is a residual confirmation of already-covered behavior, not the sole proof of
  any developed behavior, so the net-gate vacuous-green ban does not apply.
- Breaking changes: PASS — every server/client contract change is additive (new route, new optional
  fields, new optional props). `ConfirmDialog.message` confirmed to already accept free-form
  per-call text (verified by reading `confirm-dialog.tsx` directly) — no `packages/ui` breaking
  change needed to satisfy the SPEC's dialog-copy requirement, resolving the plan's own flagged
  open question. `serializeMenuProduct`'s real signature (`product, options, components?,
  available?, scheduleWindows?`) confirmed to support one more optional trailing param
  (`branches?`) with zero impact on existing callers.
- Security surface: PASS — no auth/billing/schema/migration surface. Both routes stay public,
  matching precedent. `resolveAvailableDealProductIds` reused verbatim (MENU-003 invariant
  preserved, no re-derivation of availability logic that could drift from the write-path check).
- Work Group 1 (D1, GET /products) feasibility: CONCERN → RESOLVED — mechanically feasible
  (query shape, mount point, and serializer extension all confirmed against real source); the one
  real gap (branches[] should filter on `is_accepting_pickup`, not just `is_active`, to match
  `useBranch()`'s client-side selectable-branch set) is fixed in this pass (Work Group 1 step 1).
- Work Group 2 (D2, deals/products branches field) feasibility: CONCERN → RESOLVED — same
  accepting-pickup filter gap as Work Group 1, same fix applied (Work Group 2 step 1).
- Work Group 3 (D3, subtext prop + formatter) feasibility: CONCERN → RESOLVED — `DealCard
  .scheduleSummary` precedent confirmed real; `ProductCard`'s current prop list confirmed to lack a
  subtext slot (SPEC background claim accurate). Gap found: no described touchpoint actually calls
  `formatBranchSubtext()` for regular products — `product-grid.tsx` was missing from the plan's
  Touchpoints entirely. Fixed: `product-grid.tsx` added as a modified file with an explicit
  `renderItem` wiring step (Work Group 5 step 5).
- Work Group 4 (D4, shared hook extraction) feasibility: **CONCERN (highest severity found this
  pass) → RESOLVED.** The hook as originally described only called `useCart().setBranch()` on
  confirm. Verified by reading `use-menu.ts`, `use-product-details.ts`, `use-branch.ts`, and
  `use-cart.ts` directly that `useMenu()`/`useProductDetails()` are keyed exclusively on
  `useBranch().selectedBranch.id`, which `useCart().setBranch()` never touches — the two contexts
  are fully independent. As originally written, the plan's own primary new feature (AC7:
  cross-branch tap → confirm → land cleanly on Product Details) would have functionally failed for
  the NEW Home/Deals trigger point (though the pre-existing Product-Details add-to-cart flow would
  have kept working, since there `selectedBranch` is already correct — which is why the existing
  regression tests would NOT have caught this). Fixed: the hook must also resolve the full
  `PickupBranch` object via `useBranch().branches.find()` and call `useBranch().setSelectedBranch()`
  — both changes applied to Work Group 4 step 1, the Public Contracts section, and the hook-level
  test's assertion list; confirmed idempotent/safe for the pre-existing Product Details flow too.
  Also added: a not-found edge-case contract (target branch id absent from `useBranch().branches`)
  and an explicit caller-facing instruction for it (Work Group 4 step 4).
- Work Group 5 (Integration) feasibility: CONCERN → RESOLVED (depended on WG1/WG2/WG3/WG4 fixes
  above, now folded in). `(tabs)/index.tsx` and `(tabs)/deals/index.tsx` structure both confirmed
  against real source — `openProduct`/`openDeal`'s current shape, `deals/index.tsx`'s existing
  (if staledocumented) use of `useDealProducts()` confirmed to already be the all-branch DEAL-004
  route, matching the plan's L5 claim.

Open gaps: none blocking. Two minor, non-blocking notes (not filed as backlog — both are
Execute-Agent Instructions living in the plan text, not deferred work):
- `deals/index.tsx`'s header doc-comment is stale (references the old branch-scoped menu route
  even though its actual `useDealProducts()` import already reads the correct all-branch route) —
  a free one-line comment fix during EXECUTE, not required, not blocking.
- Whether `available` on `DealCard` can still legitimately be `false` for a reason other than
  "not at this branch" (e.g. schedule/expiry) is left as an EXECUTE-time verification (Work Group 5
  step 3) — resolvable by reading `deal-availability.ts`'s callers, not an open design question.

What this coverage does NOT prove:
- The Fully-Automated pure-derivation tests (dedup, subtext formatting, category filter) prove the
  LOGIC is correct but not that the RENDERED SCREEN looks/feels right — that is exactly what AC12
  (Agent-Probe) and the Hybrid component tests together are for; the component tests prove render
  output and callback sequencing under jsdom/jest-expo, not real device timing, gesture feel, or
  actual light/dark contrast on a physical screen.
- The Hybrid component tests for AC5–AC9 prove the CALLBACK SEQUENCE (dialog shown/hidden, mutation
  functions called in order) but do not prove that `useMenu()`'s query actually refetches and
  resolves against the new branch inside a real network round-trip — that requires either a real
  device or an integration-level test against a live `packages/api` instance, neither of which this
  plan's Hybrid tier includes (jest-expo mocks the hooks, per the established pattern in the 2
  regression test files).
- The AC11 non-regression re-run proves the SERVER's existing branch-availability rejection logic
  is unchanged — it does NOT newly test that the client never CONSTRUCTS a cross-branch cart in the
  first place under the new Home/Deals flow (that's what AC6/AC7's Hybrid tests are for instead).
- No test in this contract exercises the WG1/WG2 `is_accepting_pickup` filter fix (this plan's own
  correction) against a scenario where a branch transitions from accepting-pickup to not while a
  customer already has that branch's product open in the merged grid — this is a narrow race window
  considered acceptable given the existing app-wide precedent of not locking availability reads
  (see `deal-availability.ts`'s own doc comment: "Deliberately NOT `FOR UPDATE`").
(Required until C3 is implemented — temporary C3 mitigation)

Gate: PASS (no unresolved FAILs; all 5 CONCERNs identified during this pass were resolved by
applying corrective Plan Updates directly to the plan text before finalizing this contract, not
merely accepted as-is)
Accepted by: session (autonomous VALIDATE pass — no interactive user available in this subagent
context; all CONCERNs were resolved via mechanical, within-scope plan-text corrections rather than
left open, so no user acceptance of an unresolved gap was required)

### Proposed Plan Updates Applied (V6)

| # | What changed | Where in plan | Why |
|---|---|---|---|
| P1 | D4 hook must call `useBranch().setSelectedBranch()` (resolved via `useBranch().branches.find()`) in addition to `useCart().setBranch()`, with an explicit not-found edge case | Work Group 4 step 1/3/4; Public Contracts item 4; Blast Radius | Without this, `useMenu()`/`useProductDetails()` stay keyed on the OLD selected branch after a Home/Deals cross-branch confirm — AC7's "lands cleanly, no flash" would functionally fail. Confirmed by reading `use-menu.ts`/`use-product-details.ts`/`use-branch.ts`/`use-cart.ts` directly. |
| P2 | `GET /products` and `GET /deals/products`'s `branches[]` aggregation must filter branches to `is_active = true AND is_accepting_pickup = true`, not `is_active` alone | Work Group 1 step 1; Work Group 2 step 1 | Matches `useBranch()`'s client-side `openOnly()` filter (branches shown as switch-selectable). Otherwise a product's subtext/switch-target could name a branch the customer cannot actually select, breaking the D4 hook's `.find()` lookup. |
| P3 | Corrected the Exact Commands section: `apps/mobile` has ONE test script (`pnpm --filter @jojopotato/mobile test`, running `vitest run --passWithNoTests && jest` sequentially) — removed the reference to a nonexistent `test:local` script | Verification Evidence → Exact Commands | Confirmed live against `apps/mobile/package.json` and `process/context/tests/all-tests.md`; the original draft flagged this as "confirm at EXECUTE," now resolved during VALIDATE. |
| P4 | Added `apps/mobile/src/features/home/components/product-grid.tsx` as a modified-files touchpoint, with an explicit `renderItem` wiring step calling `formatBranchSubtext()` | Touchpoints → Modified files; Work Group 5 step 5 (new) | The formatter (Work Group 3) and the prop (`ProductCard.subtext`) both existed in the original plan, but nothing in the original Touchpoints table actually connected them for regular products — AC2/AC3 would have silently never rendered on Home's grid. |

### Execute-Agent Instructions

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | `ConfirmDialog`'s `message` prop already supports free-form per-call text — do not add a `packages/ui` change for the "This is from {branch}..." dialog copy; just interpolate the string at the call site, matching `product/index.tsx`'s existing pattern. | Work Group 5 step 3 (Home `openProduct` dialog wiring) |
| E2 | When the D4 hook's `confirm()` hits the not-found edge case (target branch id absent from `useBranch().branches`), the caller must show a user-visible error (toast) and must not navigate. Exact copy is an EXECUTE-time judgment call. | Work Group 4 step 4 |
| E3 | Verify during EXECUTE whether `DealCard`'s `available` prop can still legitimately be `false` for a reason other than "not at the currently-selected branch" (e.g. schedule/expiry) before deciding whether to stop passing it on Home/Deals entirely. | Work Group 5 step 3 |
| E4 | `deals/index.tsx`'s header doc-comment is stale (references the old branch-scoped route) even though its actual `useDealProducts()` import is already correct — a free one-line comment fix, not required, not blocking. | Work Group 5 step 4 (optional) |
| E5 | Do not delete `flattenMenuForHome`/`useMenu()` — `useProductDetails()` still depends on `useMenu()` directly and stays live regardless of this plan's Home-grid rewiring. | Work Group 5 step 1 |

### Backlog Artifacts

(none — all findings resolved as in-scope plan corrections; no deferred work needed)

## Autonomous Goal Block

SESSION GOAL: Home tab (+ Deals strip/tab) shows deduped, subtext-labeled products from ALL
branches instead of only the selected branch's menu, with a confirm-then-switch flow on
cross-branch taps.
Charter + umbrella plan: N/A — single plan (`home-all-branches_22-07-26`), not part of a phase
program or umbrella charter.
Autonomy: standard /goal autonomy rules apply once EXECUTE begins — CONDITIONAL findings during
EVL apply fixes and proceed; BLOCKED items go to backlog and continue with remaining work groups;
irreversible/outward-facing actions without explicit instruction are a hard stop. No high-risk
class is present in this plan (no auth/billing/schema/migration/deploy surface), so no evidence
pack / manual-first handoff is required.
Hard stop conditions / safety constraints:
- Do not remove or repurpose `packages/api/src/routes/branches.ts`'s `GET /branches/:branchId/menu`
  route — the Order tab depends on its single-branch contract and stays out of this plan's scope.
- Do not weaken or bypass `POST /orders`'s existing branch-availability rejection (AC11) — it is
  explicitly a non-regression guarantee, not something this plan touches.
- Do not change the 2 regression test files' asserted dialog copy/button labels
  (`cart-branch-switch.test.tsx`, `product-branch-switch.test.tsx`) without documenting exactly why
  in the phase report — an unexplained edit signals a behavior change beyond this plan's scope.
- The D4 hook's `setSelectedBranch` call (Work Group 4 step 1, VALIDATE-added) is load-bearing —
  do not simplify it away during EXECUTE without re-verifying AC7 end-to-end.
Next phase: EXECUTE — `process/features/ordering-cart/active/home-all-branches_22-07-26/home-all-branches_PLAN_22-07-26.md`
Validate contract: inline in this plan file (see `## Validate Contract` above)
Execute start: `pnpm --filter @jojopotato/api test` (after `docker compose up -d && pnpm --filter @jojopotato/api db:migrate`) | `pnpm --filter @jojopotato/mobile test` | `pnpm --filter @jojopotato/ui test` | `pnpm --filter @jojopotato/mobile guard:theme-mode` | `pnpm --filter @jojopotato/ui check-tokens` — high-risk pack: no
