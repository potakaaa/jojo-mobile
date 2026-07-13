---
name: plan:merge-menu-api-reconciliation
description: "Reconcile feat/pickup-order-flow-and-dev-temp-login with development's parallel menu/branch API, react-query adoption, and cents-vs-decimal money convention clash"
date: 13-07-26
feature: general
phase: "n/a"
---

# Merge: Menu API + React Query + Money-Unit Reconciliation — PLAN (13-07-26)

Date: 13-07-26
Status: VALIDATED — 3rd outer-PVL pass (13-07-26) re-ran V1-V7 from scratch after the 2nd PVL supplement (F4 api-request.ts carve-out, C5 default-param fix, C6 missing call-sites); confirmed via fresh disposable-worktree merge probe + hand-traced type checks. Gate: PASS. Ready for ENTER EXECUTE MODE.
Complexity: COMPLEX (7 real merge conflicts + 4 auto-merge-clean rewrites, ~38-44 total touched files, 6 gaps, full order-placement regression risk)

## Overview

This plan reconciles `feat/pickup-order-flow-and-dev-temp-login` with `origin/development`'s
independently-built menu/branch feature (its own SPEC/plan cycle, referencing `AC3`/`AC7`/`AC8`/
`AC9`/`AC11` acceptance criteria). Context loaded: `process/context/all-context.md` (root router)
and `process/context/tests/all-tests.md` (test runner routing — no mobile test runner yet;
`packages/api`/`packages/ui` use vitest) per repo convention before writing this plan.

## TL;DR

Merge `origin/development`'s independently-built menu/branch feature into
`feat/pickup-order-flow-and-dev-temp-login`, keeping **this branch's real backend (cents,
`/branches`, `/branches/:id/menu`, `/orders`) as canonical**, adopting **react-query** and
**development's nicer menu UI components**, and promoting a new **cents-native catalog type set**
into `packages/types/src/menu.ts` so the adopted components/hooks can consume this branch's real
API. **VALIDATE ran an actual disposable-worktree merge** (not just static `git merge-tree`
inspection) and found the real conflict count is **7**, not 11 — 4 files this plan originally
listed as conflicts actually auto-merge cleanly with wrong (development's raw decimal) content
still in place, which is a more dangerous failure mode than a real conflict because nothing forces
anyone to fix them. VALIDATE also found that adopting `BranchProvider` as-is silently returns zero
branches against real data (Gap F, new), and that 4 real screens/hooks depend on files this plan
deletes but were missing from Touchpoints. All of these are now fixed below (see §0, corrected §1,
Gap F, and the expanded Touchpoints/Blast Radius/checklist).

---

## §0 — Critical corrections found during VALIDATE's disposable-worktree merge probe

Two rounds of real-source verification happened: RESEARCH-time (`git merge-tree`, static diff) and
VALIDATE-time (`git worktree add --detach` + an actual `git merge origin/development --no-edit`).
**The worktree probe is ground truth** — the static `git merge-tree` inspection this plan
originally relied on undercounted correctly-flagged files as real conflicts when several of them
in fact auto-merge cleanly (with wrong content still landing).

**Corrected conflict count: 7 real conflicts** (not 11). Confirmed via `git status --short` inside
the disposable worktree after the actual merge:
- `UU`: `apps/mobile/src/app/(tabs)/order/cart.tsx`, `apps/mobile/src/app/(tabs)/order/index.tsx`,
  `apps/mobile/src/app/(tabs)/order/product/[productId].tsx`,
  `apps/mobile/src/features/home/components/product-grid.tsx`, `packages/api/src/index.ts`,
  `packages/types/src/pickup.ts`
- `AA`: `packages/api/src/routes/branches.ts`

**4 files that auto-merge CLEANLY (no `UU`/`AA`, no conflict markers) despite this plan's original
claim that they conflict:** `packages/types/src/menu.ts`, `apps/mobile/src/app/component-showcase.tsx`,
`apps/mobile/src/features/home/mock-home.ts`, `packages/ui/src/components/__tests__/mocks.ts`.

**Why this matters — the silent-no-op trap:** `git checkout --ours <path>` is a **silent no-op** on
a path that is not actually conflicted (`Updated 0 paths from the index`, exit 0). It does NOT
revert the file to HEAD's content. For these 4 files, a clean auto-merge means git already picked a
resolution on its own — in practice, development's raw decimal content lands wholesale, since these
files only changed on development's side since the merge-base. `checkout --ours`, as the original
checklist prescribed, would do nothing to fix that. Concretely, without a real fix:
- `packages/types/src/menu.ts` ships with development's raw decimal `Product`/`ProductOption`/
  `Category`/`ProductDetail`/`MenuResponse` sitting untouched next to `MenuItem`/`MenuCategory` —
  i.e. Gap A's cents-native promotion never actually happens, because no conflict marker forces
  anyone to touch the file.
- `component-showcase.tsx` and `packages/ui/.../mocks.ts` keep referencing development's `Product`
  type instead of reverting to `MenuItem`-only.
- `mock-home.ts` keeps development's `Category`/`Product` decimal-literal mocks.

**Fix, applied throughout this plan** (see corrected §1 table, checklist items 1/6/7, and the
V-A/Acceptance Criteria #1 updates below): the 7 `UU`/`AA` files are resolved as live merge
conflicts (`git checkout --ours` / manual resolution during the merge, before commit). The 4
auto-merge-clean files are **not** conflict resolutions — they are **required post-merge-commit
rewrites**, applied with `git show HEAD:<path> > <path>` (works on any path regardless of conflict
status, unlike `checkout --ours`), and for `packages/types/src/menu.ts` specifically, followed by
the explicit Gap A content-authoring step (the superset-merge promotion is authored content, not a
plain revert).

`pnpm typecheck` (V-B) will eventually catch some of this fallout (e.g. `mock-home.ts`'s
`basePrice` field disappearing once Gap A's rename lands) but the resulting errors read as
unrelated type noise, not "you forgot to fix this file" — so this cannot be relied on as the
enforcement mechanism. The checklist below makes each of these 4 files an explicit, named step
instead.

---

## Touchpoints Preface — Corrected Merge-Resolution File List (confirmed via a real `git worktree add --detach` + `git merge origin/development --no-edit` probe — ground truth, not static `git merge-tree` inspection)

**A — Real merge conflicts (7, `UU`/`AA`) — resolved live, during the merge, before commit:**

| # | File | Git status | Resolution strategy (summary — detail in §5) |
|---|---|---|---|
| 1 | `apps/mobile/src/app/(tabs)/order/cart.tsx` | UU | Keep ours (real `useCart`/`CartSessionProvider` wiring); do not adopt dev's mock-data rewrite; **also swap its own pre-existing `useBranch, useBranches` import onto `BranchProvider`'s `useBranch()`** (F3 — this dependency exists on HEAD's own side, independent of dev's conflicting diff) |
| 2 | `apps/mobile/src/app/(tabs)/order/index.tsx` | UU | Take dev's structure (real `BranchSwitcher`+`CategorySection`+`useMenu()`), retarget onto our types/hooks |
| 3 | `apps/mobile/src/app/(tabs)/order/product/[productId].tsx` | UU | Take dev's structure (react-query, `OptionGroupSelector`, `AddToCartBar`), retarget onto our cents types/hooks/route params |
| 4 | `apps/mobile/src/features/home/components/product-grid.tsx` | UU | Keep ours (`MenuItem`, `onProductPress` prop); discard dev's `Product`/decimal rewrite |
| 5 | `packages/api/src/index.ts` | UU | Keep ours (bare paths, request-logger, `ordersRouter`); do NOT mount dev's `/api/` prefix or `menuRouter` |
| 6 | `packages/types/src/pickup.ts` | UU | Superset merge: keep our required `estimatedPrepMinutes`/`isAcceptingPickup`, add dev's optional `slug`/`phone`/`openingHours`; `isOpen` stays optional/client-computed (ours) — see §5.10 |
| 7 | `packages/api/src/routes/branches.ts` | AA | Keep ours in full (detail-by-id, distance-sort, `/menu` sub-route); discard dev's rewrite entirely |

**B — Auto-merges CLEANLY (no conflict marker) but requires an explicit post-merge-commit rewrite —
NOT a live conflict resolution; do NOT use `git checkout --ours` (silent no-op on a non-conflicted
path):**

| # | File | Why it needs a rewrite anyway | Rewrite method |
|---|---|---|---|
| 8 | `packages/types/src/menu.ts` | Auto-merge lands development's raw decimal catalog types wholesale; Gap A's cents-native promotion must be authored content, not a revert | Author the Gap A superset content directly (see Gap A) — NOT a `git show HEAD:` revert, since new content must be added, not restored |
| 9 | `apps/mobile/src/app/component-showcase.tsx` | Auto-merge keeps dev's `Product`/decimal samples | `git show HEAD:apps/mobile/src/app/component-showcase.tsx > apps/mobile/src/app/component-showcase.tsx` |
| 10 | `apps/mobile/src/features/home/mock-home.ts` | Auto-merge keeps dev's `Product`/`Category`/decimal mocks | `git show HEAD:apps/mobile/src/features/home/mock-home.ts > apps/mobile/src/features/home/mock-home.ts` |
| 11 | `packages/ui/src/components/__tests__/mocks.ts` | Auto-merge keeps dev's `Product`/decimal rewrite | `git show HEAD:packages/ui/src/components/__tests__/mocks.ts > packages/ui/src/components/__tests__/mocks.ts` |

**Verification instruction for EXECUTE:** re-run the real merge probe at the start of EXECUTE —
`git worktree add --detach /tmp/merge-probe-$(date +%s) <base>`, `cd` in, `git merge
origin/development --no-edit`, capture `git status --short`, remove the worktree — and confirm the
file list still matches the 7 (A) + 4 (B) above. If it differs, treat it as real signal: stop and
re-diff the new/changed file against this plan's assumptions before improvising a resolution. A
static `git merge-tree` read is **not** sufficient re-verification — it does not reliably
distinguish "auto-merges clean with wrong content" from "no changes on either side."

---

## Touchpoints

**Backend (`packages/api`):**
- `packages/api/src/index.ts` (conflict — keep ours, verify request-logger + ordersRouter survive)
- `packages/api/src/routes/branches.ts` (conflict — keep ours in full)
- `packages/api/src/routes/menu.ts` (dev-only add — DELETE, do not mount; verify no other file imports it first)
- `packages/api/src/routes/lib/serializers.ts` (read-only reference — already cents-native `ApiMenuProduct`/`ApiMenuOption`/`ApiBranch`; NOT modified by this plan, used as the source-of-truth shape for the promoted `packages/types` catalog types **and** confirmed the exact 3 response envelope shapes consumers must handle — see Gap G/C4)

**Shared types (`packages/types`):**
- `packages/types/src/menu.ts` (auto-merge-clean rewrite, NOT a conflict — see §1-B and Gap A)
- `packages/types/src/pickup.ts` (conflict — superset merge, see §5.10)
- `packages/types/src/cart.ts` (read-only reference — NOT touched; already cents-native `MenuItem`/`CartItemOption` consumers unaffected)

**Shared utils (`packages/utils`):**
- `packages/utils/src/pricing.ts` (dev-only add — DELETE, decimal-based, redundant per Gap D)
- `packages/utils/src/product-options.ts` (dev-only add — ADOPT as-is, unit-agnostic)
- `packages/utils/src/currency.ts` (dev-only additive change — KEEP `formatPricePHP` addition alongside unchanged `formatCurrency`; not a conflict, confirmed via diff)
- `packages/utils/src/index.ts` (verify new exports wired: `product-options` yes, `pricing` no)

**Shared UI (`packages/ui`):**
- `packages/ui/src/components/__tests__/mocks.ts` (auto-merge-clean rewrite, NOT a conflict — see §1-B, keep ours via `git show HEAD:`)
- `packages/ui/src/components/addon-selector.tsx` (dev-only add — ADOPT as-is)
- `packages/ui/src/index.ts` (verify `AddOnSelector` export wired)

**Mobile app (`apps/mobile`):**
- `apps/mobile/package.json` (dev-only additive dependency — ADOPT `@tanstack/react-query: ^5.62.0`)
- `apps/mobile/src/app/_layout.tsx` (NOT a listed conflict — auto-merges cleanly, and its auto-merged content already wires `QueryClientProvider → AuthProvider → BranchProvider → CartSessionProvider` **plus a working `AppState`/`focusManager` bridge** — MUST be edited to confirm/preserve, not hand-rewritten from scratch; see C1 below and Gap C)
- `apps/mobile/src/app/(tabs)/order/index.tsx` (conflict — take dev's structure, retarget)
- `apps/mobile/src/app/(tabs)/order/product/[productId].tsx` (conflict — take dev's structure, retarget)
- `apps/mobile/src/app/(tabs)/order/cart.tsx` (conflict — keep ours; also retarget its own `useBranch, useBranches` import per F3, see §1-A row 1)
- `apps/mobile/src/app/(tabs)/order/checkout.tsx` (**newly added per F3 — NOT a conflict, but imports the now-superseded `useBranch` from `features/branches/hooks/use-branches`**: retarget to `useBranch()` from `BranchProvider`)
- `apps/mobile/src/app/(tabs)/branches/index.tsx` (**newly added per F3 — NOT a conflict, but imports the now-superseded `useBranches`**: retarget to `useBranch()` from `BranchProvider`, using its `branches`/`isLoading`/`isError`/`refetch` fields)
- `apps/mobile/src/app/(tabs)/branches/[branchId].tsx` (**newly added per F3 — NOT a conflict, but imports the now-superseded `useBranch` and `useBranchMenu`, plus the `MenuProduct` type from the deleted local `features/menu/lib/api-client`**: retarget to `useBranch()` (selection) + `useMenu()` (branch menu); drop the `MenuProduct` import, use the promoted `Product` type)
- `apps/mobile/src/app/component-showcase.tsx` (auto-merge-clean rewrite, NOT a conflict — see §1-B, keep ours via `git show HEAD:`)
- `apps/mobile/src/features/home/components/product-grid.tsx` (conflict — keep ours)
- `apps/mobile/src/features/home/mock-home.ts` (auto-merge-clean rewrite, NOT a conflict — see §1-B, keep ours via `git show HEAD:`)
- `apps/mobile/src/lib/query-client.ts` (dev-only add — ADOPT as-is)
- `apps/mobile/src/lib/api-client.ts` (dev-only add — ADOPT the file, REWRITE its 3 fetch functions to hit `/branches`, `/branches/:id/menu`, this branch's real cents-native response shapes; handle each endpoint's distinct response envelope (Gap G/C4); compute `isOpen` per Gap F; no dedicated single-product endpoint call — see Gap B)
- `apps/mobile/src/features/branch/hooks/use-branch.ts` (dev-only add — ADOPT as-is, no code changes needed here; the real fix for Gap F lands one file over, in `lib/api-client.ts`'s `getBranches()`)
- `apps/mobile/src/features/menu/hooks/use-menu.ts` (dev-only add — ADOPT, retarget onto `getMenu()`'s real cents-native `MenuResponse`, add 20s poll + `refetchOnWindowFocus` per Gap B)
- `apps/mobile/src/features/menu/hooks/use-product-details.ts` (dev-only add — REPLACE network-poll body with client-side lookup into `useMenu()`'s cached tree, see Gap B)
- `apps/mobile/src/features/menu/components/add-to-cart-bar.tsx` (dev-only add — ADOPT, retarget per Gap D: `unitPrice`→`unitPriceCents`, `formatPricePHP`→`formatCurrency`)
- `apps/mobile/src/features/menu/components/branch-switcher.tsx` (dev-only add — ADOPT, verify unit-agnostic)
- `apps/mobile/src/features/menu/components/category-section.tsx` (dev-only add — ADOPT, verify unit-agnostic)
- `apps/mobile/src/features/menu/components/option-group-selector.tsx` (dev-only add — ADOPT, retarget field name `option.id`→`option.optionId` per Gap E; **also define the `OptionGroup` type inline per C3** since its import source (`group-options.ts`) is not adopted)
- `apps/mobile/src/features/menu/lib/group-options.ts` (dev-only add — **DO NOT ADOPT**, see Gap E: our backend already groups by type, this becomes dead/wrong-shape code)
- `apps/mobile/src/features/cart/lib/product-to-menu-item.ts` (dev-only add — REWRITE: no `* 100`, cents already native once Gap A lands; consider deleting if trivial)
- **Superseded (delete):** `apps/mobile/src/features/branches/{hooks/use-branches.ts,lib/api-client.ts}`, `apps/mobile/src/features/menu/{hooks/use-branch-menu.ts,lib/api-client.ts,lib/api-client.contract.ts}`, `apps/mobile/src/features/shared/{components/screen-message.tsx,lib/api-request.ts}` — see §6. **`apps/mobile/src/features/shared/hooks/use-async-data.ts` is CARVED OUT of this deletion list per F3 — see §6.**
- **Unaffected, verify only:** `apps/mobile/src/features/orders/*` (still depends on `use-async-data.ts`, which is now explicitly kept — see F3/§6), `apps/mobile/src/features/cart/hooks/use-cart.ts`, `apps/mobile/src/features/cart/hooks/use-cart-session.ts` (or equivalent `CartSessionProvider` file — confirm exact path at EXECUTE)

---

## Public Contracts

- **Backend HTTP surface** (unchanged by this merge): `GET /branches`, `GET /branches/:branchId`,
  `GET /branches/:branchId/menu`, `POST /orders` + existing order-flow routes, all under bare paths
  (no `/api/` prefix). `GET /api/menu`, `GET /api/menu/products/:id`, and the rewritten
  `GET /api/branches` from development are **discarded, never mounted**.
- **Response envelopes are NOT uniform across the 3 real endpoints (Gap G / C4, verified via
  `packages/api/src/routes/branches.ts`):** `GET /branches` → `{ branches: [...] }`; `GET
  /branches/:id` → `{ branch: {...} }`; `GET /branches/:id/menu` → unwrapped `{ branchId,
  categories }` (no wrapper key at all). The rewritten `apps/mobile/src/lib/api-client.ts` (Gap B/
  checklist item 10) MUST unwrap each of the 3 shapes correctly — this is not one uniform shape and
  must not be assumed away.
- **`packages/types/src/menu.ts` new public exports**: `ProductOptionType`, `ProductOption`
  (cents-native: `priceDeltaCents`), `Product` (cents-native: `basePriceCents`), `Category`,
  `ProductDetail`, `MenuResponse` — all newly promoted, all cents-native, field-name-compatible
  with `packages/api/src/routes/lib/serializers.ts`'s `ApiMenuProduct`/`ApiMenuOption`/`ApiMenu`
  (i.e. `optionId` not `id`, `basePriceCents` not `basePrice`). `MenuItem`/`MenuCategory` (existing,
  cart-internal) are **unchanged**.
- **`packages/types/src/pickup.ts`**: `PickupBranch` gains optional `slug`, `phone`, `openingHours`
  fields (additive, non-breaking to existing `MOCK_BRANCH`/`BranchCard`/`BranchSelector` usages);
  `estimatedPrepMinutes`/`isAcceptingPickup` remain **required** (ours); `isOpen` remains **optional**
  client-computed (ours) — NOT promoted to required as dev's version does. **`isOpen` is now
  actually computed** (Gap F) at the `getBranches()` boundary as `branch.isAcceptingPickup` (our
  `ApiBranch` has no `isActive` field — the backend query already filters to active branches only,
  so `isAcceptingPickup` alone is the field-accurate equivalent of development's own
  `isActive && isAcceptingPickup` derivation).
- **`apps/mobile/src/lib/api-client.ts`** (new global client, adopted+rewritten): `getBranches()`,
  `getMenu(branchId)` — both hit this branch's real endpoints and unwrap the correct envelope per
  Gap G. `getProductDetails()` is **removed** (Gap B — no dedicated endpoint; product detail is
  derived client-side from `getMenu()`'s tree).
- **`BranchProvider`/`useBranch()`** (new, adopted as-is): `{ selectedBranch, setSelectedBranch,
  branches, isLoading, isError, refetch }` — mounted in `_layout.tsx`. Composes with (does not
  replace) the existing `CartSessionProvider`'s `pickupBranchId`/`setBranch()` — see Gap C. Now
  returns a non-empty branch list against real data once Gap F's `isOpen` fix lands.

---

## Blast Radius

- **Packages touched:** `packages/api` (2 files modified, 1 file deleted), `packages/types` (2 files
  modified), `packages/utils` (1 file deleted, 1 file adopted, 1 file additive-only), `packages/ui`
  (1 file modified/kept-ours, 1 file adopted), `apps/mobile` (1 dependency added, ~8 new files
  adopted/retargeted, ~5 files deleted (was 7 — `use-async-data.ts` (F3) and `api-request.ts` (F4) both carved out, see §6), 7 real
  conflict files resolved + 4 auto-merge-clean files rewritten, 4 newly-discovered consumer files
  retargeted (`branches/index.tsx`, `branches/[branchId].tsx`, `checkout.tsx`, plus `cart.tsx`'s own
  extra import fix), 1 layout file confirmed/preserved).
- **Risk class:** money/pricing correctness (cents-vs-decimal boundary), full order-placement
  regression risk (re-plumbing an already-EVL-verified flow onto a third data-fetching
  architecture), shared type surface change (`packages/types` consumed by `packages/ui` and
  `apps/mobile` both), silent-filter-to-zero risk on branch listing (Gap F) now closed.
- **Estimated file count:** 7 real conflict resolutions + 4 auto-merge-clean rewrites + ~9 adopted
  new files + ~9 retargeted new files + ~5 deletions (was 7 — `use-async-data.ts` (F3) and `api-request.ts` (F4) both kept) + ~8
  consumer-rework touch points + 3 newly-discovered consumer touchpoints (F3) ≈ **38-44 files
  total**. This exceeds the COMPLEX-plan bar; EXECUTE strategy below reflects that.
- **No schema/migration change.** No new backend route added (Gap B keeps backend surface
  unchanged). No billing/payments/auth surface touched.

---

## Gap Resolutions — Gaps A–F — Formalized Resolutions (verified against real source in §0–§2, not assumed)

### Gap A — Catalog types must become cents-native (packages/types/src/menu.ts)

**Verified:** development's `packages/types/src/menu.ts` defines `Product.basePrice` /
`ProductOption.priceDelta` as whole-PHP decimal (doc comment confirms: "whole PHP units, e.g. `89`
= ₱89.00"). This branch's real backend already emits cents-native equivalents — but as **local,
non-shared types** inside `apps/mobile/src/features/menu/lib/api-client.ts`
(`MenuProduct`/`MenuProductOption`/`MenuCategory`/`BranchMenu`), guarded by a hand-written
compile-time contract test (`api-client.contract.ts`) against `serializers.ts`'s wire shape.

**IMPORTANT (§0 correction): `packages/types/src/menu.ts` auto-merges cleanly** (no conflict
marker) with development's raw decimal types intact — this Gap A promotion is therefore an
**explicit content-authoring step**, not a conflict resolution. See §1-B row 8.

**Resolution — promote, don't invent:**
1. Move (rename, don't reinvent) `features/menu/lib/api-client.ts`'s local types into
   `packages/types/src/menu.ts` as the new catalog types, renamed to match development's naming
   convention (so adopted components compile without a second naming scheme):
   - `MenuProductOption` → `ProductOption` (`optionId: string; optionType: ProductOptionType; name:
     string; priceDeltaCents: number`)
   - `MenuProduct` → `Product` (`id, name, description?, imageUrl?, basePriceCents, options:
     Record<ProductOptionType,ProductOption[]>` — **NOTE: options stay grouped-by-type, see Gap E**
     — do not flatten to match dev's `ProductOption[]` shape)
   - `MenuCategory` (menu-tree one) → `Category` (`id, name, products: Product[]`)
   - `BranchMenu` → `MenuResponse` (`{ branchId?: string, categories: Category[] }` — confirm exact
     field name against `ApiMenu` in `serializers.ts`, which uses `branchId` + `categories`)
   - New `ProductDetail = Product & { isAvailable: boolean }` — this branch's backend has no
     dedicated product-detail endpoint (Gap B), so `ProductDetail` is a client-derived type, not a
     wire type; `isAvailable` is computed from the branch-availability join already present in
     `serializeMenuProduct` if it exposes it, else default to `true` unless the product is filtered
     out of the branch tree entirely (confirm exact availability signal in `serializers.ts` at
     EXECUTE — if no explicit `isAvailable` field exists on `ApiMenuProduct`, treat "present in the
     branch's menu tree" as available and "absent" as unavailable/sold-out, and verify this against
     the real availability-flip test scenario in Verification Evidence row V-5)
2. **Existing `MenuItem`/`MenuCategory`** in `packages/types/src/menu.ts` (cart-internal, already
   cents-native per their own doc comment) — **unchanged, keep verbatim**.
3. **Delete development's raw decimal catalog types** (which auto-merged into the file wholesale —
   see §0) as part of authoring the superset content; do not leave both the old decimal set and the
   new cents-native set coexisting.
4. Delete the now-duplicate local type definitions from `features/menu/lib/api-client.ts` once
   promoted (this file itself is being replaced by the new global `lib/api-client.ts` per Touchpoints
   — see §6 supersession list).
5. Update `packages/api/src/routes/lib/serializers.ts`'s exported types (`ApiMenuProduct`,
   `ApiMenuOption`, `ApiMenu`, `ApiBranch`) — **no change needed**, these stay server-internal;
   the promoted `packages/types` catalog types are a parallel, structurally-matching public contract
   consumed by the mobile client. (Do not attempt to have `packages/api` import from
   `packages/types` in this pass — that is a larger refactor, out of scope, note as a backlog
   observation only if it becomes a real pain point during EXECUTE.)

### Gap B — No dedicated single-product-detail endpoint; derive from `useMenu()` tree

**Verified reasonable — adopt orchestrator's proposed resolution as-is, with one refinement:**
`useProductDetails(productId)` (adopted, rewritten) becomes a **pure derivation hook**, not a
`useQuery`:

```
export function useProductDetails(productId: string) {
  const menu = useMenu(); // already polling/refetching per below
  const product = useMemo(
    () => menu.data?.categories.flatMap(c => c.products).find(p => p.id === productId),
    [menu.data, productId],
  );
  return { data: product, isLoading: menu.isLoading, isError: menu.isError };
}
```

`useMenu()` itself gains `refetchInterval: 20_000` + `refetchOnWindowFocus: true` (moved from the
single-product hook, since there is no longer a per-product query to attach them to). This is
a **deliberate, explicit scope reduction** vs development's per-product granular polling — document
this in the phase report, not silently: coarser (whole-menu refetch vs one product) but same
user-facing outcome (mid-session availability flip reflected within ~20s or on refocus).

**Note (C1):** the "or refocus" half of this guarantee depends on `_layout.tsx`'s auto-merged
`AppState`/`focusManager` bridge surviving EXECUTE unmodified — see Gap C below and the Touchpoints
entry for `_layout.tsx`.

**Refinement over the orchestrator's proposal:** keep the return shape a
`{ data, isLoading, isError }` object (not a raw `UseQueryResult`) so `[productId].tsx` doesn't need
to know whether the value came from a derived `useMemo` or a real query — this also makes a future
reintroduction of a dedicated endpoint a one-line hook-body swap with no consumer changes.

**No backend endpoint added this pass** — confirmed reasonable: `serializeMenuProduct` (existing,
proven) already returns the full per-product shape as part of the branch-menu tree; a single-product
endpoint would be pure duplication of that serializer for one row, not new capability.

### Gap C — BranchProvider (browsing-branch) vs CartSessionProvider (cart-branch) composition

**Verified reasonable — adopt orchestrator's proposed resolution, made concrete + explicit on the
open question:**

- `BranchProvider` = source of truth for "what branch is the user currently browsing" — drives
  `useMenu()`, persists across restarts via `expo-secure-store`. Mount in `_layout.tsx` **alongside**
  `AuthProvider` and `CartSessionProvider` (exact nesting order: `QueryClientProvider` wraps the
  outermost (both `BranchProvider` and any future react-query consumer need it) → `AuthProvider` →
  `BranchProvider` → `CartSessionProvider` → rest of tree).
- **C1 — do not hand-rewrite `_layout.tsx` from this description.** The file auto-merges cleanly
  (confirmed in the same worktree probe as F1 — it is NOT in the §1-A or §1-B lists) and its
  auto-merged content ALREADY wires exactly this nesting order, plus a native `AppState.
  addEventListener('change', ...) → focusManager.setFocused(...)` bridge that TanStack Query's
  `refetchOnWindowFocus` requires on native RN (there is no browser `window` focus/blur event on a
  phone — without this bridge, `refetchOnWindowFocus` is a silent no-op on native). Checklist item
  18 is therefore a **confirm-and-diff** step, not an author-from-scratch step: read the
  auto-merged file, confirm the bridge and nesting order are present, and only adjust if something
  is actually missing. Losing this bridge would not be caught by any automated gate — it would
  silently break only the "or refocus" half of Gap B's freshness guarantee (V-D row 5's "wait ≤20s
  or refocus" scenario could still pass via the 20s poll path alone, masking the regression).
- `CartSessionProvider.setBranch()` continues to be called **only at the moment an item is actually
  added to cart** (already wired from the prior merge-cart-reconciliation plan) — cart's
  `pickupBranchId` is set FROM the currently-browsing `selectedBranch.id` at add-to-cart time.
  **`BranchProvider` browsing a new branch does NOT itself trigger the cart's
  branch-switch-clear-confirm flow** — only the explicit add-to-cart action does (this resolves the
  orchestrator's open question explicitly). Rationale: a user should be free to window-shop a
  different branch's menu without being interrupted by a "clear your cart?" prompt; the prompt only
  makes sense at the point they're committing to add an item from a different branch than their
  existing cart.
- **Concrete flow:** user has cart from Branch A → browses Branch B's menu via `BranchSwitcher` (no
  prompt, `BranchProvider.selectedBranch` updates, `useMenu()` refetches for Branch B, cart
  untouched) → taps "Add to Cart" on a Branch B product → **now** the existing
  branch-switch-clear-confirm `Alert` (already present in `[productId].tsx`'s adopted `handleAdd`,
  verified in §2 real-source read) fires, exactly as development's own `[productId].tsx` already
  implements it (confirmed via `git show origin/development:...[productId].tsx` — the
  `isSwitchingBranch` check + `Alert.alert('Switch branch?', ...)` block already exists there and
  needs no new code, only retargeting per Gap D/E).
- **Verified no silent-disagreement scenario exists**: because the clear-confirm check reads
  `cart.pickupBranchId !== selectedBranch.id` at add-to-cart time (not at browse time), the two
  "current branch" concepts can diverge freely while browsing and are only reconciled at the single
  well-defined mutation point (add-to-cart). No other screen reads `cart.pickupBranchId` to decide
  what menu to show.

### Gap D — Component/utility retargeting (cents boundary)

- **`AddToCartBar`**: rename prop `unitPrice: number` → `unitPriceCents: number`; change
  `formatPricePHP(unitPrice)` → `formatCurrency(unitPriceCents)` (import from `@jojopotato/utils`,
  already exported, unchanged). Verify the one call site in `[productId].tsx`
  (`<AddToCartBar unitPrice={unitPrice} .../>` → `<AddToCartBar unitPriceCents={unitPriceCents} .../>`).
- **`product-to-menu-item.ts`**: rewrite `productToMenuItem()` to drop `Math.round(basePrice * 100)`
  — input `Product.basePriceCents` is already cents-native once Gap A lands. Resulting function
  becomes near-identity (`priceCents: product.basePriceCents`, rest is a field copy) — **evaluate at
  EXECUTE whether to keep the file** (a thin adapter is still arguably worth keeping as a stable
  seam even if trivial, since it isolates `[productId].tsx` from `Product`↔`MenuItem` shape drift —
  lean toward **keeping it** as a 1-line-bodied function rather than deleting, since the seam has
  proven valuable once already in this codebase's history per the `api-client.contract.ts` doc
  comment about a prior regression).
  **C5 fix — drop the dead-field default parameter:** dev's real `product-to-menu-item.ts` has
  `productToMenuItem(product: Product, isAvailable: boolean = product.isActive)`. The promoted
  `Product` type (per this Gap's own type list above) has no `isActive` field — only `ProductDetail`
  (`Product & { isAvailable: boolean }`) carries availability, and the one real call site
  (`[productId].tsx`'s `handleAdd()`) already passes `isAvailable` explicitly. **Fix:** when
  rewriting, drop the default-parameter's field reference entirely — make `isAvailable` a required
  parameter (preferred, since it is always passed explicitly today) rather than defaulting to a
  nonexistent `product.isActive`. Leaving the old default in place fails `tsc` with "Property
  'isActive' does not exist on type 'Product'" the moment this file is retargeted.
- **`packages/utils/src/pricing.ts`**: **DELETE**. This branch's price computation lives
  server-side (`serializers.ts` + order-placement transaction logic, cents, already correct) and
  the mobile client's unit-price computation is a trivial cents sum (`basePriceCents +
  sum(selected priceDeltaCents)`), not worth a shared decimal-oriented utility. Confirmed no other
  file references `parsePriceString`/`computeUnitPrice` outside development's own new files (all of
  which are being retargeted or deleted in this plan) — safe to delete outright, not just unmount.
- **`packages/utils/src/product-options.ts`**: **ADOPT as-is** (`getRequiredOptionTypes`,
  `isRequiredSelectionComplete`) — verified unit-agnostic (operates on `optionType`/`isActive`
  fields only, no money). **Also REPLACES** this branch's existing inline `needsSize`/`needsFlavor`
  boolean logic in `product/[productId].tsx` (verified in §2 real-source read — HEAD's current
  screen computes `needsSize = sizeOptions.length > 0 && !selectedSize` etc. inline) — since the
  whole screen is being restructured to dev's `OptionGroupSelector`-based layout anyway (per
  Touchpoints #3), this replacement happens naturally as part of that restructure, not as a
  separate edit.
- **`packages/api/src/routes/menu.ts`**: **DELETE**, do not mount. Verified no other file imports
  it (only `packages/api/src/index.ts` imports `menuRouter`, and that import is dropped as part of
  keeping our `index.ts` — confirmed via real `git show` diff of both `index.ts` versions in §0/§2).
- **`packages/api/src/index.ts` mounting**: keep HEAD's version verbatim — confirmed via real diff
  that HEAD's version retains the request-logger middleware (dev's version has none) and mounts
  `ordersRouter` (dev's version has no orders router at all, confirmed `git show
  origin/development:packages/api/src/routes/orders.ts` → fatal, file does not exist upstream).
  **No merge needed here beyond taking HEAD's file wholesale** — dev's `index.ts` changes
  (`/api/auth/*splat`, magic-link bridge, dev-auto-login route) are auth-only concerns that
  **already exist identically in HEAD's version too** (both branches independently carry the same
  better-auth wiring from the shared `development` ancestor — confirmed identical in both `git show`
  outputs above except for the branches/menu/orders mount lines and the request-logger). Resolution:
  take HEAD's `index.ts` file wholesale, zero manual reconciliation needed beyond confirming the
  auth/magic-link/dev-login sections are byte-identical (they are, per the two full `git show`
  outputs captured during RESEARCH).

### Gap E — Option-grouping shape mismatch (newly identified during real-source verification, not in orchestrator's brief)

**New finding, not anticipated by the orchestrator:** development's `useProductDetails()` returns a
**flat `ProductOption[]`**, grouped client-side via `groupOptions()` (a `lib/group-options.ts`
utility that buckets by `optionType` and sorts by `sortOrder`). This branch's real backend
(`serializeMenuProduct` in `serializers.ts`) returns options **already grouped by type**
(`options: Record<ProductOptionType, ApiMenuOption[]>` — confirmed via real `ApiMenuProduct`
interface read in §2). Once Gap A promotes this shape into `packages/types/src/menu.ts`'s `Product`
type, `groupOptions()` (which expects and returns from a flat array) no longer has a valid input to
operate on.

**Resolution: do NOT adopt `apps/mobile/src/features/menu/lib/group-options.ts`.** Instead, since
the data already arrives grouped, replace its one call site (`groups = groupOptions(product.options)`
in `[productId].tsx`) with a trivial local mapping that reads the already-grouped `Record` directly,
preserving the same fixed display order (`size`, `flavor`, `add_on`) `group-options.ts` encoded:

```
const GROUP_ORDER: ProductOptionType[] = ['size', 'flavor', 'add_on'];
const groups = GROUP_ORDER
  .filter((type) => (product?.options[type]?.length ?? 0) > 0)
  .map((type) => ({ type, options: product!.options[type] }));
```

(Options are already sorted server-side per existing `serializeMenuProduct` ordering — verify this
sort-order guarantee still holds at EXECUTE by reading `serializeMenuProduct`'s body in full, since
this plan's research pass only confirmed the *shape*, not the internal sort implementation, of that
function.) This mapping can live inline in `[productId].tsx` or as a 5-line local helper — not
worth its own file given the trivial size once un-flattened.

**Consequence for `OptionGroupSelector`**: its `group.options.map((option) => ({ id: option.id, ...
}))` calls (mapping into `FlavorSelector`/`SizeSelector`/`AddOnSelector` props) must change
`option.id` → `option.optionId` (the real field name on `ApiMenuOption`/the promoted `ProductOption`
type — confirmed via real read of both `serializers.ts` and dev's own `group-options.ts`/
`option-group-selector.tsx`, which use `option.id`, a field that **does not exist** on this
branch's wire shape). This is a required retarget, not optional — without it, every option render
would silently produce `id: undefined`, the exact class of bug `api-client.contract.ts`'s doc
comment describes from EVL cycle 1 of the prior plan.

**C6 fix — 2 additional call sites in `[productId].tsx` itself, not just `option-group-selector.tsx`
(the same `option.id`→`option.optionId` rename, missed by the original 3-site enumeration above):**
1. `selectedOptions`'s derivation (`product.options.filter((option) => selectedIds.has(option.id))`)
   assumes the old flat-array shape and the old field name. Once Gap A's grouped
   `Record<ProductOptionType, ProductOption[]>` shape lands, this must first flatten, then rename:
   `Object.values(product.options).flat().filter((option) => selectedIds.has(option.optionId))`.
2. `handleAdd()`'s `opts` construction (the object literal built for `CartItemOption`) reads
   `option.id` as its source field for the item's `id: option.id` assignment — this must become
   `id: option.optionId` (the target `CartItemOption.id` field name itself is unchanged, only the
   source field being read changes). This is the 4th `option.id`→`option.optionId` occurrence, in a
   different file from the 3 named above — both this and item 1 are required retargets under
   checklist item 20's "retarget per Gaps A/B/D/E" instruction, not optional cleanup.

**C3 — `OptionGroupSelector`'s `OptionGroup` type import is orphaned by the "do not adopt
group-options.ts" decision above.** Verified: dev's `option-group-selector.tsx` has `import type {
OptionGroup } from '@/features/menu/lib/group-options'`. Since that file is not adopted, this
import must be redefined. **Fix:** define `export interface OptionGroup { type: ProductOptionType;
options: ProductOption[] }` inline in `option-group-selector.tsx` (or promote it into
`packages/types/src/menu.ts` alongside the other Gap A types if it turns out to be reused
elsewhere) and update the import accordingly. Without this, checklist item 14's "adopt + retarget"
hits a missing-module error the moment the file is adopted.

### Gap F — BranchProvider filters real branches to zero (isOpen never populated by real backend)

**Verified (VALIDATE finding F2):** dev's adopted `BranchProvider`/`use-branch.ts`'s `openOnly()`
filters on `branch.isOpen`. `packages/api/src/routes/lib/serializers.ts`'s `ApiBranch` has **no
`isOpen` field** — only `isAcceptingPickup`/`estimatedPrepMinutes`/etc (confirmed via full read of
`serializeBranch()`). A repo-wide grep (`grep -rn "isOpen" apps/mobile/src packages/ui/src
packages/types/src packages/api/src`) confirms `isOpen` exists ONLY in mock literals
(`component-showcase.tsx`, `mock-home.ts`, `packages/ui/.../mocks.ts`) and two display-only badge
components (`branch-selector.tsx`, `branch-card.tsx`) — it is never computed from real data
anywhere today. Every real `getBranches()` response therefore has `isOpen === undefined` (falsy),
so `openOnly()` returns **zero branches against real data, every time**. Not caught by
`pnpm typecheck` (`isOpen` is an optional field; `undefined` is a valid value).

**Resolution — compute `isOpen` at the API-client boundary, reusing development's own proven
pattern.** Development's own (unmodified) `apps/mobile/src/lib/api-client.ts` (the very file this
plan adopts+retargets in checklist item 10) already does exactly this:
```ts
return body.branches.map((branch) => ({
  ...branch,
  isOpen: branch.isActive && branch.isAcceptingPickup,
}));
```
**Adapt, don't copy verbatim** — our real `ApiBranch` (per `serializers.ts`) has no `isActive` field
at all (the backend's `GET /branches` query already filters `is_active = true` server-side, so
every row returned is implicitly active). The retargeted `getBranches()` in checklist item 10 must
therefore compute:
```ts
return body.branches.map((branch) => ({
  ...branch,
  isOpen: branch.isAcceptingPickup,
}));
```
This is the field-accurate equivalent of development's own derivation, adapted to this branch's
real wire shape (no phantom `isActive` check on an already-filtered list). This lands as a single
line added to the map already required by checklist item 10, inside the rewritten
`apps/mobile/src/lib/api-client.ts` — **not** in `use-branch.ts` itself, which is otherwise adopted
unchanged (per Touchpoints).

### Gap G — Response envelope shapes differ across the 3 real backend routes (newly identified — C4)

**Verified via `packages/api/src/routes/branches.ts` (HEAD):** `GET /branches` →
`{ branches: [...] }`; `GET /branches/:id` → `{ branch: {...} }`; `GET /branches/:id/menu` →
unwrapped `{ branchId, categories }` (no wrapper key at all). The rewritten
`apps/mobile/src/lib/api-client.ts` (checklist item 10) must therefore handle **3 different
envelope shapes**, not one uniform shape. **Fix:** `getBranches()` unwraps `body.branches`,
`getMenu()` uses the response body directly (already `{ branchId, categories }` shape, matches
`MenuResponse` as-is — no unwrap needed), and if a future `getBranch(id)` single-fetch is ever
added it must unwrap `body.branch`. This must be an explicit execute-agent instruction (checklist
item 10), not assumed away as "the same shape as the others."

---

## Superseded Files — Old Data Layer Removal (this branch's own, pre-merge simpler hooks)

Per user decision #2 (react-query for menu/branch data-fetching), the following files — built in
the *original* pickup-order-flow plan, before this merge — are **replaced, not kept alongside
duplicates**:

| File | Action | Replaced by |
|---|---|---|
| `apps/mobile/src/features/branches/hooks/use-branches.ts` | DELETE | `BranchProvider`/`useBranch()` |
| `apps/mobile/src/features/branches/lib/api-client.ts` | DELETE | `apps/mobile/src/lib/api-client.ts` (`getBranches`) |
| `apps/mobile/src/features/menu/hooks/use-branch-menu.ts` | DELETE | `useMenu()` |
| `apps/mobile/src/features/menu/lib/api-client.ts` | DELETE (after type promotion per Gap A) | `apps/mobile/src/lib/api-client.ts` (`getMenu`) |
| `apps/mobile/src/features/menu/lib/api-client.contract.ts` | DELETE | No longer needed as a standalone file — **but its regression-guard PURPOSE must be preserved** (see below) |
| `apps/mobile/src/features/shared/components/screen-message.tsx` | Evaluate for reuse — see note below | dev's inline `ActivityIndicator`/plain-`Text` loading/error states in `[productId].tsx` |
| `apps/mobile/src/features/shared/hooks/use-async-data.ts` | **CARVED OUT — DO NOT DELETE (F3 fix, see below)** | n/a — still consumed by out-of-scope order hooks |
| `apps/mobile/src/features/shared/lib/api-request.ts` | **CARVED OUT — DO NOT DELETE (F4 fix, see below)** | n/a — still consumed by out-of-scope `features/orders/lib/api-client.ts` |

**F3 fix — `use-async-data.ts` carve-out:** the original Superseded Files list marked this file
DELETE ("replaced by react-query's `useQuery`"). Verified via repo-wide grep
(`grep -rln "use-async-data" apps/mobile/src`): `apps/mobile/src/features/orders/hooks/
use-order.ts` and `use-order-history.ts` — both explicitly declared out-of-scope for this merge's
react-query migration (see the "order hooks scope boundary" note below) — still import it.
Deleting it unconditionally would break order-history/order-detail screens, contradicting this
plan's own claim that order-placement hooks are untouched. **Fix:** keep `use-async-data.ts` in
place (do not delete it as part of this merge); optionally relocate it to
`apps/mobile/src/features/orders/lib/use-async-data.ts` if a future pass wants `features/shared` to
be fully retired, but that relocation is out of scope here. Checklist item 22's "confirm zero
remaining imports before deleting" grep must explicitly skip this file.

**F4 fix — `api-request.ts` carve-out (2nd supplement cycle, same bug class as F3):** the original
Superseded Files list marked this file DELETE ("replaced by `lib/api-client.ts`'s internal
`getJson()`"). Verified via repo-wide grep (`grep -rln "api-request" apps/mobile/src`): exactly 3
importers — `features/menu/lib/api-client.ts` and `features/branches/lib/api-client.ts` (both
superseded, both being deleted — fine), and `features/orders/lib/api-client.ts` (confirmed via
direct read: `import { apiRequest } from '@/features/shared/lib/api-request'`) — explicitly
out-of-scope per the "order hooks scope boundary" note below, and still depends on it. Deleting it
unconditionally would break order placement/checkout, contradicting this plan's own claim that
order hooks are untouched. **Fix:** keep `api-request.ts` in place (do not delete it as part of
this merge), exactly mirroring the `use-async-data.ts` carve-out treatment above; optionally
relocate it to `apps/mobile/src/features/orders/lib/api-request.ts` if a future pass wants
`features/shared` fully retired, but that relocation is out of scope here. Checklist item 22's
"confirm zero remaining imports before deleting" grep must explicitly skip this file too (both
`use-async-data.ts` and `api-request.ts` are now carved out — 6 files deleted, not 7).

**Preserve the contract-test intent, don't just delete it:** `api-client.contract.ts` exists because
a prior EVL cycle found the mobile client's local types had silently drifted from the server's real
wire shape (bare `as T` casts hide `tsc` mismatches). Once the catalog types move into
`packages/types/src/menu.ts` (Gap A) and are used directly by `apps/mobile/src/lib/api-client.ts`'s
typed `getJson<T>()` calls, add an equivalent `satisfies`-based compile-time fixture — either as a
new `apps/mobile/src/lib/api-client.contract.ts` or inline test-only fixtures in the same file —
asserting a realistic server-shaped literal against `Product`/`Category`/`MenuResponse`. This is a
required EXECUTE checklist item (§7, item 23), not optional cleanup.

**`screen-message.tsx` reuse note:** dev's `[productId].tsx` and `order/index.tsx` use inline
`ActivityIndicator`/plain `Text` for loading/error states rather than `ScreenMessage`/`ScreenLoader`.
Since `ScreenMessage`/`ScreenLoader` are this branch's own shared components (not
dead — check other consumers first with a repo-wide grep before deciding), the resolution is: **keep
`screen-message.tsx`** if any other screen still imports it after this merge (grep at EXECUTE time);
if `product/[productId].tsx` and `order/index.tsx` were its only consumers, **replace dev's inline
loading/error markup with `ScreenLoader`/`ScreenMessage` calls** instead of the reverse (prefer the
existing shared component over inline markup, per the repo's "always use shared UI, never one-off
screen UI" convention in `all-context.md`) — do not delete `screen-message.tsx` if this is the case.

**`apps/mobile/src/features/orders/*` scope boundary — explicit decision, not left ambiguous:**
The user's decision #2 was scoped to "menu/branches data fetching." **This plan does NOT migrate
`features/orders/{hooks/use-checkout.ts,hooks/use-order.ts,hooks/use-order-history.ts,
lib/api-client.ts}` to react-query.** Rationale, stated explicitly rather than assumed: (a) it is a
real scope expansion beyond the user's stated decision; (b) development's own team scoped their
`query-client.ts` doc comment to say explicitly *"scoped to menu/branch/product data only (per SPEC
Out Of Scope: not an app-wide data-fetching mandate)"* — confirmed via real read of that file's
comment during RESEARCH — meaning even the team that introduced react-query into this codebase
deliberately did NOT intend it as an app-wide replacement; (c) the order-placement flow is this
branch's own, real, 47-test-covered code with no react-query precedent to follow. **This scope
boundary is also why `use-async-data.ts` must be carved out of deletion (F3 fix above)** — the
order hooks this boundary deliberately leaves untouched still depend on it. **This is flagged here
as an explicit scope boundary for user sign-off during PLAN review, not a silent assumption** —
if the user wants order-hooks migrated too, that is a follow-up plan, not part of this merge.

---

## Implementation Checklist

**Phase 1 — Merge mechanics**
1. `git fetch origin development`; run the disposable-worktree merge probe (`git worktree add
   --detach /tmp/merge-probe-$(date +%s) HEAD`, `cd` in, `git merge origin/development --no-edit`,
   capture `git status --short`, remove the worktree) and confirm it matches the corrected §1-A (7
   `UU`/`AA`) + §1-B (4 auto-merge-clean) file lists. Investigate any drift before proceeding. A
   static `git merge-tree` read alone is NOT sufficient here (see §0).
2. `git merge origin/development` (expect conflicts in the 7 `UU`/`AA` files from §1-A only; do
   not use `--no-commit` — resolve inline, standard merge commit).
3. Resolve backend conflicts first (lowest risk, no UI dependency): `packages/api/src/index.ts`
   (take ours), `packages/api/src/routes/branches.ts` (take ours in full).
4. `git rm packages/api/src/routes/menu.ts` if it lands as an unmerged add; confirm no import
   references remain (`grep -rn "routes/menu" packages/api/src`).
5. Resolve `packages/types/src/pickup.ts` per §5.10 (superset merge — this IS a real `UU`
   conflict, §1-A row 6).
6. **Author `packages/types/src/menu.ts` per Gap A** — this file auto-merges CLEANLY (§1-B row 8,
   not a conflict): promote types from `features/menu/lib/api-client.ts`, keep `MenuItem`/
   `MenuCategory` verbatim, add the cents-native catalog types, and delete development's raw
   decimal types that landed via the clean auto-merge. This is content authoring, not a `git
   checkout --ours`/`git show HEAD:` operation.
7. Resolve the remaining files from the original "keep ours" set correctly per their real git
   status (§0/§1 correction — do NOT treat all 4 the same way):
   - `apps/mobile/src/features/home/components/product-grid.tsx` — this IS a real `UU` conflict
     (§1-A row 4): `git checkout --ours apps/mobile/src/features/home/components/product-grid.tsx`.
   - `apps/mobile/src/app/component-showcase.tsx`, `apps/mobile/src/features/home/mock-home.ts`,
     `packages/ui/src/components/__tests__/mocks.ts` — these auto-merge CLEANLY (§1-B rows 9-11);
     `git checkout --ours` is a **silent no-op** on them. Use `git show HEAD:<path> > <path>`
     instead for each, then verify no orphaned imports remain.
8. Add `@tanstack/react-query` to `apps/mobile/package.json`; `pnpm install`.

**Phase 2 — New file adoption (non-conflicting adds from development)**
9. Adopt as-is (no changes): `apps/mobile/src/lib/query-client.ts`, `apps/mobile/src/features/branch/hooks/use-branch.ts`, `apps/mobile/src/features/menu/components/{branch-switcher,category-section}.tsx`, `packages/ui/src/components/addon-selector.tsx`, `packages/utils/src/product-options.ts`. Wire `AddOnSelector` export into `packages/ui/src/index.ts` and `product-options` exports into `packages/utils/src/index.ts` if not already re-exported by the merge.
10. Adopt + retarget `apps/mobile/src/lib/api-client.ts`: rewrite `getBranches()`/`getMenu(branchId)`
    to call `/branches` and `/branches/:branchId/menu`; **unwrap each endpoint's distinct response
    envelope correctly** (Gap G — `/branches` → unwrap `body.branches`; `/branches/:id/menu` →
    already the bare `{branchId, categories}` shape, no unwrap needed); **compute `isOpen:
    branch.isAcceptingPickup` in `getBranches()`'s per-branch map** (Gap F — our `ApiBranch` has no
    `isActive` field, so this is the field-accurate adaptation of development's own `isActive &&
    isAcceptingPickup` derivation); delete `getProductDetails()` entirely (Gap B).
11. Adopt + retarget `apps/mobile/src/features/menu/hooks/use-menu.ts`: point at the rewritten `getMenu()`; add `refetchInterval: 20_000` + `refetchOnWindowFocus: true` (Gap B).
12. Adopt + rewrite `apps/mobile/src/features/menu/hooks/use-product-details.ts` as a pure derivation over `useMenu()`'s cache (Gap B — no network call).
13. **Do not adopt** `apps/mobile/src/features/menu/lib/group-options.ts` (Gap E) — instead add the small inline `GROUP_ORDER` mapping directly in `product/[productId].tsx` per §5 Gap E snippet.
14. Adopt + retarget `apps/mobile/src/features/menu/components/option-group-selector.tsx`: change
    every `option.id` reference to `option.optionId` (Gap E); **also define `export interface
    OptionGroup { type: ProductOptionType; options: ProductOption[] }` inline in this file**
    (Gap E / C3), replacing its now-orphaned import from the un-adopted `group-options.ts`.
15. Adopt + retarget `apps/mobile/src/features/menu/components/add-to-cart-bar.tsx`: `unitPrice`→`unitPriceCents` prop rename, `formatPricePHP`→`formatCurrency` (Gap D).
16. Adopt + rewrite `apps/mobile/src/features/cart/lib/product-to-menu-item.ts`: drop the `* 100` conversion; keep the file as a thin adapter (Gap D rationale).
17. **Delete** `packages/utils/src/pricing.ts` (Gap D) and any residual re-export of it from `packages/utils/src/index.ts`.

**Phase 3 — Consumer rework (screens that used the now-superseded data layer)**
18. `apps/mobile/src/app/_layout.tsx`: this file **auto-merges cleanly** and already contains the
    correct nesting order (`QueryClientProvider → AuthProvider → BranchProvider →
    CartSessionProvider`) plus a working `AppState`/`focusManager` bridge (Gap C / C1). **Do not
    hand-rewrite from scratch** — read the auto-merged file, confirm the bridge and nesting order
    survive, and only adjust if something is genuinely missing; import `queryClient` from
    `lib/query-client.ts` if the merge didn't already wire it.
19. `apps/mobile/src/app/(tabs)/order/index.tsx`: take dev's structure; retarget imports to the adopted/retargeted `useBranch`/`useMenu`/`BranchSwitcher`/`CategorySection`; confirm tapped-product navigation still pushes to `product/[productId]` with the same route param contract as before (verify param name — HEAD's screen also previously took a `branchId` search param, confirm whether the restructured flow still needs it now that `BranchProvider` supplies the branch context implicitly, or whether it's now redundant and should be dropped).
20. `apps/mobile/src/app/(tabs)/order/product/[productId].tsx`: take dev's structure; retarget per Gaps A/B/D/E (types, price fields, option grouping, add-to-cart-bar props); preserve the existing branch-switch-clear-confirm `Alert` flow verbatim (Gap C) since it already matches this branch's intended cart-invariant behavior.
21. `apps/mobile/src/app/(tabs)/order/cart.tsx`: keep HEAD's version, take ours wholesale — confirm
    no import now points at a deleted file (dev's conflicting diff pulled in
    `productToMenuItem`/`MOCK_CART_BRANCH`/`MOCK_PRODUCTS` references that belong to dev's
    mock-data variant of this screen, not ours); **also retarget this file's own pre-existing
    `useBranch, useBranches` import** (from `features/branches/hooks/use-branches`, which this plan
    deletes) onto `useBranch()` from `BranchProvider` — this is a HEAD-side dependency, not fallout
    from dev's diff, and was missing from the original checklist (F3).
21a. **(F3 — newly added)** `apps/mobile/src/app/(tabs)/order/checkout.tsx`: retarget its
    `useBranch` import (from the superseded `features/branches/hooks/use-branches`) onto
    `useBranch()` from `BranchProvider`.
21b. **(F3 — newly added)** `apps/mobile/src/app/(tabs)/branches/index.tsx`: retarget its
    `useBranches` import (superseded, deleted) onto `useBranch()` from `BranchProvider`, using its
    `branches`/`isLoading`/`isError`/`refetch` fields.
21c. **(F3 — newly added)** `apps/mobile/src/app/(tabs)/branches/[branchId].tsx`: retarget its
    `useBranch`/`useBranchMenu` imports (both superseded, deleted) onto `useBranch()` (selection) +
    `useMenu()` (branch menu); drop the `MenuProduct` type import (superseded local type) in favor
    of the promoted `Product` type from `packages/types/src/menu.ts`.
22. Delete superseded files per §6 table (5 files — `use-async-data.ts` (F3) and `api-request.ts`
    (F4) are both explicitly excluded/carved out, matching the Blast Radius section's `~5 files
    deleted (was 7)` count; corrected from a stale `6` during the 3rd VALIDATE pass, C7) after
    confirming zero remaining imports
    (`grep -rn` each old import path across `apps/mobile/src`) — this grep must now also cover
    `checkout.tsx`, `branches/index.tsx`, `branches/[branchId].tsx`, and `cart.tsx`'s own import
    (items 21/21a/21b/21c above), plus `features/orders/lib/api-client.ts`'s dependency on
    `api-request.ts` (F4), before trusting a clean result.
23. Add the compile-time wire-contract fixture (§6 "Preserve the contract-test intent") asserting `Product`/`Category`/`MenuResponse` shape against a realistic literal.

**Phase 4 — Verification**
24. `git diff --check` (zero conflict markers).
25. `pnpm typecheck` (repo-wide) — zero errors.
26. `pnpm --filter @jojopotato/ui test` — green (adjust any test fixture that referenced removed `pricing.ts` or old `mocks.ts` shape — none expected per Gap D deletion rationale, but confirm).
27. `pnpm --filter @jojopotato/api test` — green, confirms `branches.ts`/order routes/serializers untouched and still passing (existing 47-test order-placement suite).
28. Grep sweep for money-unit regressions (§8 verification plan, items V-1–V-4) — **scope widened
    to all of `apps/mobile/src`** (C2 fix — the original scope of just `features/menu`/
    `features/cart` missed `apps/mobile/src/app/(tabs)/order/**`, where `[productId].tsx`'s real
    `Math.round(option.priceDelta * 100)` conversion actually lives).
29. Manual/agent-probe full order-placement flow (§8 verification plan, item V-5) — branch browse → product detail → add to cart → checkout → confirmation, against the real backend with the new data layer. **Also confirm `BranchProvider` returns ≥1 real branch** (Gap F regression check — if the branch list renders empty, Gap F's fix did not land correctly).
30. Update this plan's `## Resume and Execution Handoff` section with final state before requesting VALIDATE.

---

## Verification Plan

### V-A. Merge mechanics

| Check | Command | Pass criterion |
|---|---|---|
| Real conflict set matches corrected list | Disposable-worktree probe (`git worktree add --detach`, `git merge origin/development --no-edit`, `git status --short`, remove worktree) | Exactly the 7 `UU`/`AA` files in §1-A — not 11, not any other count |
| Zero conflict markers post-resolution | `git diff --check` | No output |
| All 7 conflicts resolved | `git status --short` shows no `UU`/`AA` entries | Confirmed |
| 4 auto-merge-clean files correctly rewritten | Manual diff of the 4 §1-B files against `git show HEAD:<path>` (for 3) / Gap A content (for `menu.ts`) | Content matches intended resolution, not development's raw auto-merged content |

### V-B. Automated gates

| Gate | Command | Proves |
|---|---|---|
| Typecheck (repo-wide) | `pnpm typecheck` | No type drift across `packages/types` promotion, no `apps/mobile` consumer left importing a deleted file (including the F3-discovered consumers) |
| UI package tests | `pnpm --filter @jojopotato/ui test` | `mocks.ts` (kept-ours, rewritten via `git show HEAD:`) still satisfies existing UI component tests; `AddOnSelector` compiles cleanly if it has tests |
| API package tests | `pnpm --filter @jojopotato/api test` | `branches.ts` (kept-ours) and the full 47-test order-placement suite still pass unmodified — proves the backend was untouched by this merge in any way that regresses existing coverage |

### V-C. Money-unit regression grep sweep

| Check | Command | Pass criterion |
|---|---|---|
| No un-suffixed decimal catalog fields survive | `grep -rn "\.basePrice\b\|\.priceDelta\b" apps/mobile/src packages/types/src` (excluding `basePriceCents`/`priceDeltaCents` matches) | Zero matches — confirms Gap A rename is complete everywhere, not just in the files this plan explicitly touched |
| No orphaned `formatPricePHP` call sites | `grep -rn "formatPricePHP" apps/mobile/src` | Zero matches (util itself may still exist in `currency.ts` per Gap D "additive, harmless" ruling — only *call sites* must be zero) |
| No leftover `* 100` / `/ 100` conversions on already-cents values | `grep -rn "\* 100\|/ 100" apps/mobile/src` (**scope widened per C2** — was `apps/mobile/src/features/menu apps/mobile/src/features/cart`, now the whole `apps/mobile/src` tree so `apps/(tabs)/order/**` is covered too) | Zero matches, or every match manually confirmed to be operating on a genuinely-decimal input (should be none post-Gap-D) |
| `pricing.ts` fully removed | `test -f packages/utils/src/pricing.ts` exits nonzero AND `grep -rn "from '@jojopotato/utils'" apps/mobile/src \| xargs grep -l "parsePriceString\|computeUnitPrice"` returns nothing | Confirmed |

### V-D. Full order-placement flow (highest-risk item — re-plumbing verified functionality)

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Branch browse → menu loads via `useMenu()` against real `/branches/:id/menu` | Hybrid (requires running `packages/api` dev server + seeded DB) | New data layer reaches the real, unmodified backend correctly (Gap A/B/G types + envelope match wire shape) |
| Product detail screen renders options grouped correctly, required-option gating works | Agent-probe (visual/interaction judgment: correct groups, correct Required/Optional badges, price updates live) | `OptionGroupSelector`/`groupOptions`-replacement (Gap E, incl. `OptionGroup` type per C3) + `product-options.ts` (Gap D) work together correctly |
| Add to cart from a DIFFERENT branch than existing cart triggers switch-confirm | Hybrid (scripted interaction against real cart state) | Gap C's composition boundary (browse vs cart branch) is correctly wired — no silent disagreement |
| Add to cart, proceed to checkout, complete order | Hybrid (exercises this branch's existing, previously-EVL-verified checkout+order-placement flow, now fed by the new data layer) | The pre-existing 47-test-covered order flow is NOT broken by swapping its upstream data source; also exercises the newly-retargeted `checkout.tsx` (F3) |
| Mid-session availability flip reflected without restart | Agent-probe (toggle `branch_product_availability.is_available` in DB, wait ≤20s **and separately test app-refocus**, confirm UI updates both ways) | Gap B's coarser (whole-menu-poll) scope-reduction still satisfies the original intent (AC11-equivalent); refocus path specifically exercises the `_layout.tsx` `AppState`/`focusManager` bridge (C1) |
| Money amounts render correctly throughout (no ₱890.00 for what should be ₱8.90, or vice versa) | Fully-automated (typecheck via V-C grep sweep) + Agent-probe (visual spot-check on 2-3 real products with add-on deltas) | Cents-vs-decimal boundary (Gap A) has no silent double-conversion anywhere in the adopted UI |

### V-E. Branch-listing regression (new — Gap F)

| Check | Command / Steps | Pass criterion |
|---|---|---|
| `BranchProvider` returns ≥1 branch against real seeded data | Hybrid — run `packages/api` + seeded Postgres, open the Order tab or Branches tab, confirm branch list renders | At least 1 real branch renders; zero-branch result means Gap F's `isOpen` fix did not land or is wrong |
| Branches tab and `[branchId].tsx` detail screen both render post-retarget | Hybrid (manual navigation) | Confirms F3's retarget of `branches/index.tsx` and `branches/[branchId].tsx` compiles and functions, not just typechecks |

**Escalation note:** the V-D/V-E hybrid rows require a running local `packages/api` + seeded
Postgres — if that infra is unavailable at VALIDATE/EXECUTE time, downgrade to agent-probe against
a mocked fetch layer and flag the gap explicitly in the validate-contract rather than silently
skipping.

---


## Acceptance Criteria

1. `git merge origin/development` completes with zero remaining conflict markers (`git diff
   --check` clean) across all **7 confirmed real conflict files** (§1-A); the **4 auto-merge-clean
   files** (§1-B) are separately confirmed to carry the correct post-merge-commit content (not
   development's raw auto-merged content) via manual diff.
2. `pnpm typecheck`, `pnpm --filter @jojopotato/ui test`, and `pnpm --filter @jojopotato/api test` all pass with zero errors.
3. No money-unit mismatch survives anywhere: zero un-suffixed decimal catalog field usages (`.basePrice`/`.priceDelta`), zero `formatPricePHP` call sites, zero leftover `* 100`/`/ 100` conversions on already-cents values anywhere in `apps/mobile/src` (widened scope, C2), `pricing.ts` fully removed.
4. The full order-placement flow (branch browse → product detail → add to cart → checkout → confirmation) works end-to-end against the real backend with the new react-query data layer and adopted UI components, including the branch-switch-clear-confirm invariant (Gap C), mid-session availability reflection via both the 20s poll AND app-refocus (Gap B + C1), and a non-empty real branch list (Gap F).
5. `packages/types/src/menu.ts`'s superset merge (Gap A) is structurally correct: `MenuItem`/`MenuCategory` unchanged, new cents-native catalog types (`Product`, `ProductOption`, `Category`, `ProductDetail`, `MenuResponse`) present and consumed by the adopted UI/hooks without field-name drift (Gap E: `optionId` not `id`), and development's raw decimal types are fully removed (not left coexisting).
6. All 4 newly-discovered consumer files (`branches/index.tsx`, `branches/[branchId].tsx`, `checkout.tsx`, `cart.tsx`'s own extra import) compile and function against the new `BranchProvider`/`useMenu()` data layer (F3), and `use-async-data.ts` remains available for the explicitly out-of-scope order hooks.

## Phase Completion Rules

- Phase 1 (merge mechanics, checklist items 1-8) is CODE DONE when the corrected conflict set
  (§1-A, 7 files) shows zero `UU`/`AA` entries, the 4 auto-merge-clean files (§1-B) have been
  explicitly rewritten (not silently left as auto-merged), and the repo installs cleanly.
- Phase 2 (new file adoption, items 9-17) is CODE DONE when all adopted/retargeted files compile (`pnpm typecheck` green) and no orphaned dev-only decimal utility remains.
- Phase 3 (consumer rework, items 18-23 + 21a/21b/21c) is CODE DONE when every superseded file
  (except the carved-out `use-async-data.ts`) is deleted with zero remaining imports — including
  from the 4 newly-discovered F3 consumers — and the wire-contract fixture (item 23) exists.
- Phase 4 (verification, items 24-30) is VERIFIED only after all automated gates (V-B), the
  money-unit grep sweep (V-C, widened scope), the full order-placement flow scenarios (V-D), and
  the branch-listing regression checks (V-E) pass — code-complete without these is `CODE DONE`, not
  `VERIFIED`, per this repo's phase-status convention.
- This plan as a whole reaches `Ready for UPDATE PROCESS archival` only after VALIDATE (re-run from
  V1 after this supplement) and EXECUTE both complete with a `Gate: PASS` or accepted `Gate:
  CONDITIONAL`.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Disposable-worktree merge probe confirms exactly 7 `UU`/`AA` + 4 auto-merge-clean | Fully-Automated | Merge mechanics are based on ground truth, not static `git merge-tree` inference (§0/F1 fix) |
| `git diff --check` zero markers | Fully-Automated | Merge completes cleanly (task instruction (a)) |
| `pnpm typecheck` | Fully-Automated | Type-level correctness across the cents-native promotion; catches any missed consumer of a deleted file, including F3's newly-discovered consumers (task instruction (b)) |
| `pnpm --filter @jojopotato/ui test` | Fully-Automated | UI package unaffected by kept-ours mock resolution (task instruction (b)) |
| `pnpm --filter @jojopotato/api test` | Fully-Automated | Backend/order-placement suite (47 tests) untouched and still green (task instruction (b)) |
| Money-unit grep sweep (4 sub-checks, V-C, widened scope) | Fully-Automated | No cents/decimal mismatch survives anywhere in the adopted code, including `order/**` (task instruction (c), C2 fix) |
| Full order-placement flow, 5 sub-scenarios (V-D) | Hybrid + Agent-Probe | End-to-end regression safety for the highest-risk re-plumbing (task instruction (d)) |
| Branch-listing regression (V-E, new) | Hybrid | `BranchProvider` returns ≥1 real branch post-Gap-F-fix; F3 consumer screens render |
| Gap A type promotion completeness | Fully-Automated (via typecheck) + manual code read | `packages/types/src/menu.ts` superset merge is structurally correct, not just compiling by accident, and development's raw decimal types are actually removed |
| Gap C branch-composition boundary + `_layout.tsx` focus bridge (C1) | Hybrid (scripted interaction) + manual diff of auto-merged `_layout.tsx` | No silent disagreement between browsing-branch and cart-branch state; refocus-triggered refresh still works |
| Gap E option-grouping field rename (`option.id`→`optionId`) + `OptionGroup` type (C3) | Fully-Automated (typecheck catches missing field/type) + Agent-probe (visual) | Adopted `OptionGroupSelector` renders real options correctly, not `undefined` ids, and compiles without an orphaned import |
| Gap F `isOpen` derivation | Hybrid (real backend + seeded DB) | `BranchProvider`'s `openOnly()` no longer filters every branch out |
| Gap G response-envelope unwrapping (C4) | Fully-Automated (typecheck) + Hybrid (real fetch) | `getBranches()`/`getMenu()` correctly unwrap their distinct envelope shapes |

---

## Test Infra Improvement Notes

- `apps/mobile` still has no automated test runner (repo-wide known-gap, tracked in
  `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`) — every mobile-side
  check in this plan is either `pnpm typecheck` (compile-time only) or agent-probe/hybrid manual
  verification. The compile-time wire-contract fixture added in checklist item 23 is the strongest
  available substitute for a real unit test on the mobile side, following the exact pattern
  `api-client.contract.ts` already established and that this plan is deleting-and-recreating.
- Consider, as a follow-up (not in this plan's scope): a lightweight Vitest setup for
  `apps/mobile`'s pure-logic modules (`group-options`-replacement helper, `product-to-menu-item`,
  the Gap E inline mapping) — these are pure functions with no RN runtime dependency and would be
  cheap to unit-test once a runner exists, unlike the screen components themselves.
- **New, from this supplement:** a disposable-worktree merge probe (as used by VALIDATE to find F1)
  is a reusable technique this repo should consider scripting (`scripts/merge-probe.sh` or similar)
  for any future cross-branch reconciliation plan — static `git merge-tree` inspection alone proved
  insufficient to distinguish real conflicts from clean-but-wrong auto-merges.

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/general-plans/active/merge-menu-api-reconciliation_13-07-26/merge-menu-api-reconciliation_PLAN_13-07-26.md`
2. **Last completed phase or step:** VALIDATE — 3rd outer-PVL pass (13-07-26) re-ran V1-V7 from scratch against the 2nd supplement (which addressed F4/C5/C6). Re-confirmed F1-F3/C1-C4 have not regressed (fresh disposable-worktree merge probe + real source reads), verified F4/C5/C6 fixes are correct and complete via hand-traced type checks and independent greps, and actively searched for (and ruled out) a 3rd occurrence of the carve-out bug class and a 6th `option.id` occurrence. **Gate: PASS.** Not yet merged/executed.
3. **Validate-contract status:** the `## Validate Contract` section below is the 3rd-pass contract (`generated-by: outer-pvl`, supersedes the 13-07-26 2nd-pass BLOCKED contract) — `Gate: PASS`. This plan is ready for EXECUTE.
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/development-protocols/orchestration.md`; real source re-verified via two fresh disposable `git worktree` merge probes (one to re-confirm the conflict/auto-merge-clean file list, one to read the actual auto-merged `_layout.tsx` content directly), plus fresh `git show`/`grep` reads of `apps/mobile/src/features/menu/lib/api-client.ts` (HEAD, source of the promoted `Product` type), `apps/mobile/src/app/(tabs)/order/product/[productId].tsx` (dev), `packages/api/src/routes/lib/serializers.ts` (HEAD), `packages/api/src/routes/branches.ts` (HEAD), `packages/api/src/routes/menu.ts` (dev, confirmed discarded), `packages/utils/src/currency.ts` (both), and `apps/mobile/src/features/cart/hooks/use-cart.ts` (HEAD).
5. **Next step for a fresh agent picking up mid-execution:** run `ENTER EXECUTE MODE` against this plan file. If execution has already started, run the disposable-worktree merge probe from checklist item 1 to determine how many of the 7 real conflicts remain unresolved, and cross-reference the Implementation Checklist (§7) numbering (including items 21a/21b/21c) to find the next unchecked step.

## Validate Contract

Status: PASS
Date: 13-07-26
date: 2026-07-13
generated-by: outer-pvl
supersedes: 2026-07-13 (outer-pvl) — 3rd outer-PVL pass has current evidence (re-ran V1-V7 from scratch after the 13-07-26 2nd PVL supplement addressed F4/C5/C6)

Parallel strategy: sequential
Rationale: single plan, single validator. Score 2/7 (S2 schema-adjacent type surface, S7 34-40 files) would normally suggest parallel subagents, but — same as passes 1 and 2 — the highest-value work is one continuous investigative thread (disposable-worktree merge probe → real source reads → cross-file consistency checks, each finding building on the last), so sequential-with-real-verification was used again.

### V1 Pre-Check

- Plan file exists, readable, structurally valid: `node .../validate-plan-artifact.mjs process/general-plans/active/merge-menu-api-reconciliation_13-07-26/merge-menu-api-reconciliation_PLAN_13-07-26.md` → 0 failures, 0 warnings (979 lines).
- Branch: `feat/pickup-order-flow-and-dev-temp-login`, clean except this plan's own untracked folder (`git status --short` confirmed clean at session start and end).
- No Dependency-BLOCKED phases (single plan, no `## Phase Ordering`).
- `results.tsv` shows cycle 0 (START), cycle 1 (BLOCKED, F1-F3+C1-C4), cycle 2 (SUPPLEMENT_APPLIED), cycle 3 (BLOCKED, F4+C5+C6), cycle 4 (SUPPLEMENT_APPLIED) — this is the re-validation pass that follows cycle 4's supplement, run fresh from V1 per explicit task instruction (not reusing the stale 2nd-pass BLOCKED contract).
- No `## Inner Loop Refresh Note` heading present (this plan uses direct PVL-supplement status-line/Resume-Handoff tracking, not the phase-program inner-loop refresh-note mechanism) — re-run triggered directly by explicit task instruction.

### V2-V3: Verification Method

Same evidence-based methodology as passes 1 and 2 — narrative review explicitly rejected again per task instruction, with added rigor because this is a 3rd pass (the task instruction explicitly warned against downgrading rigor). Concretely:

1. **Disposable git worktree merge probe #1, re-run fresh**: `git worktree add --detach` + `git merge origin/development --no-edit`, captured `git status --short`, removed the worktree. Confirmed the corrected conflict set (7 `UU`/`AA` + 4 auto-merge-clean `M`) matches the plan's §0/§1 tables exactly, file-for-file — unchanged from passes 1 and 2, no regression.
2. **F4 re-verification**: `grep -rln "api-request" apps/mobile/src` → exactly 3 importers: `features/menu/lib/api-client.ts` (superseded, deleted), `features/branches/lib/api-client.ts` (superseded, deleted), `features/orders/lib/api-client.ts` (out-of-scope, kept). Confirmed the plan's §6 table now carves `api-request.ts` out (do NOT delete) exactly mirroring `use-async-data.ts`'s F3 carve-out. Fix is correct and complete.
3. **3rd-occurrence sweep (new this pass, per explicit task instruction)**: independently grepped every remaining Superseded-Files entry (`use-branches`, `features/branches/lib/api-client`, `use-branch-menu`, `features/menu/lib/api-client`, `api-client.contract`, `screen-message`) for any additional out-of-scope importer beyond what the plan already documents. Found `screen-message.tsx` has 3 real importers outside this plan's Touchpoints (`history.tsx`, `confirmation/[orderId].tsx`, `tracking/[orderId].tsx`) — but confirmed this is NOT a new bug: the plan's own file-count math ("~5 files deleted, was 7") already excludes `screen-message.tsx` from the raw-delete count from the first draft onward (§6's resolution for it has always been "Evaluate for reuse," never a plain DELETE), and its accompanying note's "keep if any other screen still imports it after this merge" instruction is directionally correct and sufficient given these 3 real importers exist. No 3rd occurrence of the carve-out bug found — flagged as a minor, non-blocking documentation nitpick only (see Findings — CONCERN below).
4. **C5 hand-trace**: read HEAD's real `features/menu/lib/api-client.ts` (the actual source of the promoted `Product` type per Gap A, NOT dev's decimal `Product`) — confirmed `MenuProduct` fields are exactly `{ id, name, description?, imageUrl?, basePriceCents, options }`, no `isActive`/`isAvailable` field, matching `ApiMenuProduct` in `serializers.ts`. Read dev's real `[productId].tsx` `handleAdd()` — confirmed the one real call site always passes `product.isAvailable` explicitly (`productToMenuItem(product, product.isAvailable)`). Fix (make `isAvailable` a required parameter, drop the `product.isActive` default) is genuinely typecheck-clean and safe.
5. **C6 verification + 6th-occurrence sweep**: read dev's real `[productId].tsx` — confirmed both named call sites exist verbatim (`selectedOptions`'s flat `.filter((option) => selectedIds.has(option.id))` and `handleAdd()`'s `opts` mapping `id: option.id`). Independently grepped every dev-only adopted/retargeted file (`option-group-selector.tsx`, `[productId].tsx`, `group-options.ts`, `add-to-cart-bar.tsx`, `product-to-menu-item.ts`, `use-menu.ts`, `use-product-details.ts`, `lib/api-client.ts`) for `option.id`/`option\.id` — found exactly 5 total occurrences (3 in `option-group-selector.tsx` + 2 in `[productId].tsx`), matching the plan's own count exactly. No 6th occurrence found.
6. **Gap F/Gap G re-verification**: re-read `serializers.ts`'s `ApiBranch` interface (no `isActive`, only `isAcceptingPickup`) and `branches.ts`'s three route handlers (`{branches:[]}` / `{branch:{}}` / bare `{branchId,categories}`) fresh — both unchanged, no regression.
7. **C1 empirical re-verification (upgraded from read-and-infer to actually re-running the merge)**: ran a 2nd disposable worktree merge and read the literal resulting `_layout.tsx` content directly (not inferred from diffing HEAD vs dev separately). Confirmed the actual auto-merged file is byte-identical to dev's version — `QueryClientProvider → AuthProvider → BranchProvider(+CartSessionProvider via AuthedTree) → RootNavigator`, plus the `AppState.addEventListener('change', ...) → focusManager.setFocused(...)` bridge — because HEAD never modified this file relative to the merge-base, so git's 3-way merge takes dev's side wholesale (a clean, non-conflicted resolution). This is the highest silent-regression-risk item in the plan (C1) and is now confirmed with direct evidence, not inference.
8. **Gap B re-verification**: read dev's real `packages/api/src/routes/menu.ts` in full — confirmed it DOES have a dedicated per-product endpoint (`GET /api/menu/products/:productId`), but this entire file is discarded (not adopted) per Gap D/checklist item 4. Confirmed HEAD's real `branches.ts` has exactly 3 routes (`/`, `/:branchId`, `/:branchId/menu`) and no per-product endpoint. Confirmed `index.ts` mounts only `branchesRouter`/`ordersRouter` at bare paths, no `menuRouter`. Gap B's "no new backend endpoint" claim holds for the actually-executed result.
9. **Gap C re-verification**: read dev's real `handleAdd()` — confirmed the `isSwitchingBranch = cart.items.length > 0 && cart.pickupBranchId !== selectedBranch.id` check + `Alert.alert('Switch branch?', ...)` block exists verbatim. Read HEAD's real `useCart()` — confirmed `addItem`/`clearCart`/`setBranch`/`cart.pickupBranchId` API shape matches exactly what the adopted screen expects. No shape drift.
10. **Money-unit / Gap D re-verification**: diffed `currency.ts` merge-base → dev — confirmed purely additive (`formatPricePHP` added, `formatCurrency` untouched). Grepped every dev-only new mobile file for `formatPricePHP` call sites — found exactly 1 (`add-to-cart-bar.tsx`), matching checklist item 15's retarget exactly; no orphaned call sites will remain.
11. **Baseline sanity check**: ran `pnpm typecheck` on current (pre-merge) HEAD — all 6 packages pass (5 cache hits + 1 fresh, all green), confirming the plan's starting point has no pre-existing, unrelated failures that would confound EXECUTE-time gate results.

Both worktree probes cleaned up (`git merge --abort` + `git worktree remove --force`) before writing this contract.

### Findings — FAIL (BLOCKING)

None. F4 (from pass 2) is confirmed fixed; no new FAIL found this pass.

### Findings — CONCERN

**C7 (NEW, non-blocking, documentation-only) — Touchpoints preface (line ~174) labels `screen-message.tsx` under a "Superseded (delete)" bucket alongside files that are genuinely unconditional deletes, but §6's actual per-file resolution for it is "Evaluate for reuse," not delete.**
This is NOT a functional bug: (a) `screen-message.tsx` has 3 confirmed real importers outside this plan's scope (`history.tsx`, `confirmation/[orderId].tsx`, `tracking/[orderId].tsx`), so per §6's own conditional instruction ("keep if any other screen still imports it after this merge — grep at EXECUTE time"), it will correctly be kept; (b) the plan's own file-count math ("~5 files deleted, was 7") already excludes it from the raw-delete count, consistent from the plan's first draft onward — it was never actually miscounted as a straight delete. The only issue is the Touchpoints preface's summary bullet using an imprecise bucket label. Suggested fix (cosmetic, optional, not required before EXECUTE): reword line 174 to separate `screen-message.tsx` into its own "conditionally kept, see §6" clause instead of bundling it under "Superseded (delete)."

### Findings — Confirmed Correct (re-verified fresh this pass, all previously-fixed items)

- **F1 (conflict count)** — re-confirmed via a fresh disposable-worktree merge: exactly 7 `UU`/`AA` + 4 auto-merge-clean, file-for-file match, unchanged since pass 2.
- **F2 / Gap F (isOpen)** — re-confirmed `ApiBranch` has no `isActive` field, dev's `openOnly()` filters on `branch.isOpen`, the plan's adapted derivation (`isOpen: branch.isAcceptingPickup`) is correct.
- **F3 (missing consumers)** — re-confirmed the 4 consumer files (`branches/index.tsx`, `branches/[branchId].tsx`, `checkout.tsx`, `cart.tsx`'s own import) via a fresh `use-branches` grep — exactly these 4 importers, matching the plan's Touchpoints. `use-async-data.ts` carve-out re-confirmed necessary (`use-order.ts`/`use-order-history.ts` still import it).
- **F4 (api-request.ts carve-out)** — confirmed fixed this pass (see V2-V3 step 2 above).
- **C1 (`_layout.tsx` bridge)** — confirmed via a live 2nd worktree merge + direct file read (upgraded from inference to empirical proof this pass — see V2-V3 step 7).
- **C2 (grep scope)** — widened `apps/mobile/src`-wide scope re-confirmed correct and necessary.
- **C3 (`OptionGroup` orphaned import)** — re-confirmed dev's `option-group-selector.tsx` imports `OptionGroup` from the un-adopted `group-options.ts`; inline-redefinition fix re-confirmed correct.
- **C4 / Gap G (envelope shapes)** — re-confirmed exactly the 3 documented shapes via fresh `branches.ts` route-handler read.
- **C5 (product-to-menu-item.ts default param)** — confirmed fixed this pass via hand-traced type check (see V2-V3 step 4 above).
- **C6 (option.id → optionId, 2 additional call sites)** — confirmed fixed this pass, plus an independent sweep found no 6th occurrence (see V2-V3 step 5 above).
- **Gap B (no new backend endpoint)** — re-confirmed against the actually-executed result (dev's menu.ts, which does have a per-product endpoint, is discarded entirely; HEAD's real `branches.ts` has no per-product route).
- **Gap C (branch composition, `isSwitchingBranch` flow)** — re-confirmed dev's real `handleAdd()` and HEAD's real `useCart()` API shape match with no drift.
- **Gap D (money-unit retargeting)** — re-confirmed `currency.ts` merges additively and exactly 1 `formatPricePHP` call site exists, matching checklist item 15.
- **Gap E's sort-order guarantee** — previously confirmed (pass 2), unchanged.

### Known Gaps (accepted, non-blocking)

- `apps/mobile` still has no automated test runner (pre-existing, tracked in `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`) — unchanged from passes 1 and 2.

### Test gates (5-column)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| F1 | Real merge produces exactly the claimed conflict set | Fully-Automated | `git worktree add --detach <tmp> HEAD && cd <tmp> && git merge origin/development --no-edit; git status --short` — re-confirmed twice this pass (once for file-list, once for `_layout.tsx` content) | A — proven now |
| F2/Gap F | `BranchProvider` returns ≥1 branch against real seeded data | Hybrid (requires running `packages/api` + seeded Postgres) | Branch tab / order tab loads branches after merge | A — fix verified correct via source read; execution-time hybrid run still required at EXECUTE/EVL |
| F3 | Repo compiles after Superseded Files deletion, incl. the 4 F3 consumers | Fully-Automated | `pnpm typecheck` (repo-wide), post-Touchpoints-correction | A — fix verified correct via source read; `pnpm typecheck` re-run required at EXECUTE |
| F4 | `features/orders/lib/api-client.ts` (out-of-scope) still compiles after Superseded Files deletion | Fully-Automated | `pnpm typecheck` (repo-wide) | A — carve-out verified correct via grep this pass; `pnpm typecheck` re-run required at EXECUTE |
| C2 | No leftover `* 100`/`/ 100` on already-cents fields anywhere touched | Fully-Automated | `grep -rn "\* 100\|/ 100" apps/mobile/src` (widened scope) | A — proven now |
| C5 | `product-to-menu-item.ts` compiles once retargeted (no reference to nonexistent `Product.isActive`) | Fully-Automated | `pnpm typecheck` | A — hand-traced correct this pass against the real promoted `Product` type; `pnpm typecheck` re-run required at EXECUTE |
| C6 | `[productId].tsx`'s `selectedOptions`/`handleAdd()` compile against the grouped `Record` shape | Fully-Automated | `pnpm typecheck` | A — verified correct this pass via real source read + independent 6th-occurrence sweep; `pnpm typecheck` re-run required at EXECUTE |
| C7 (new, non-blocking) | `screen-message.tsx` is correctly kept (not deleted) given its 3 out-of-scope importers | Fully-Automated | `pnpm typecheck` + `grep -rln "screen-message" apps/mobile/src` post-merge (must still show `history.tsx`/`confirmation/[orderId].tsx`/`tracking/[orderId].tsx`) | D — named residual; cosmetic Touchpoints-wording fix optional, not required before EXECUTE |
| existing V-B | Typecheck / UI tests / API tests | Fully-Automated | `pnpm typecheck`, `pnpm --filter @jojopotato/ui test`, `pnpm --filter @jojopotato/api test` | A — baseline (pre-merge) confirmed green this pass; full post-merge run required at EXECUTE |
| existing V-D | Full order-placement flow incl. branch-switch-clear-confirm and availability refresh | Hybrid + Agent-Probe | Per plan's Verification Plan V-D (unchanged) | C — deferred to EXECUTE/EVL, per plan's own hybrid/agent-probe tiering |

Failing stub (F4, Fully-Automated, retained from pass 2 — becomes the red-first EXECUTE starting point):
```
test("should carve features/shared/lib/api-request.ts out of the Superseded Files deletion list, since features/orders/lib/api-client.ts (out-of-scope) still imports it", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: api-request.ts carve-out, same class as use-async-data.ts (F3)")
})
```

Legacy line form:
- Merge mechanics: [Fully-automated: disposable-worktree `git merge` + `git status --short` conflict enumeration] — PASSING, re-confirmed twice this pass (7+4 file list, plus literal `_layout.tsx` content).
- Superseded-files deletion safety: [Fully-automated: `pnpm typecheck` after Superseded Files deletion] — F4's carve-out verified correct via grep; full typecheck run deferred to EXECUTE.
- Option-shape / price-field retargeting: [Fully-automated: `pnpm typecheck` after checklist items 16/20 land] — C5/C6 hand-traced correct against real types this pass; full typecheck run deferred to EXECUTE.

Dimension findings:
- Infra fit: PASS — no container/infra/worker/proxy surface touched by this plan.
- Test coverage: PASS — every FAIL/CONCERN from prior passes now has a named, correct fix with a Fully-Automated gate (`pnpm typecheck`) that will catch any regression at EXECUTE time; the one remaining known-gap (no mobile test runner) is pre-existing and already backlogged.
- Breaking changes: PASS — the Superseded Files table (§6) now correctly carves out both `use-async-data.ts` (F3) and `api-request.ts` (F4); no remaining unconditional-delete-of-a-still-imported-file found after an independent 3rd-occurrence sweep.
- Security surface: PASS — no auth, billing, secrets, or trust-boundary surface touched.

Open gaps: none blocking. C7 (screen-message.tsx Touchpoints-wording nitpick) is cosmetic/optional. Pre-existing mobile-test-runner gap remains backlogged (see Known Gaps).

What this coverage does NOT prove:
- None of the Fully-Automated gates (`pnpm typecheck`, UI/API test suites, grep sweeps) have actually been run against the post-merge tree yet — this VALIDATE pass hand-traces correctness against real source and confirms the fixes are structurally sound, but the merge itself has not been executed. EXECUTE must still run the actual merge, resolve the 7 conflicts, author the 4 auto-merge-clean rewrites, and then run all V-B/V-C gates for real, expecting them to pass given this pass's verification.
- The Hybrid/Agent-Probe rows (branch-listing regression, full order-placement flow, availability-flip refresh) require a running `packages/api` + seeded Postgres and have not been executed in this VALIDATE pass — they remain deferred to EXECUTE/EVL exactly as the plan's own Verification Plan states.
- No gate proves the disposable-worktree merge probe technique will be re-run at EXECUTE-time as checklist item 1 instructs — that re-run is manual (the plan's Test Infra Improvement Notes already flag scripting it as a future improvement).

Gate: PASS
Accepted by: N/A — Gate is PASS, no concerns require acceptance. C7 is a non-blocking cosmetic note, not a concern requiring sign-off.

Recommended next step: `ENTER EXECUTE MODE` for this plan. EXECUTE should re-run the disposable-worktree merge probe (checklist item 1) as its first step per the plan's own instruction, then proceed through the Implementation Checklist in order.

## Autonomous Goal Block

SESSION GOAL: Merge origin/development's menu/branch feature into feat/pickup-order-flow-and-dev-temp-login (cents-native types, react-query adoption) without regressing the existing order-placement flow or the cents-vs-decimal money boundary.
Charter + umbrella plan: N/A — single plan (`process/general-plans/active/merge-menu-api-reconciliation_13-07-26/merge-menu-api-reconciliation_PLAN_13-07-26.md`).
Autonomy: standard RIPER-5 gates apply; no standing /goal is active for this plan.
Hard stop conditions / safety constraints:
- Re-run the disposable-worktree merge probe (checklist item 1) at the start of EXECUTE and confirm the file list still matches the 7 `UU`/`AA` + 4 auto-merge-clean lists before proceeding — if it differs, stop and re-diff before improvising.
- Do not delete any Superseded Files entry until `grep -rn` confirms zero remaining importers (checklist item 22) — `use-async-data.ts` and `api-request.ts` must NOT be deleted at all.
- Preserve `_layout.tsx`'s auto-merged `AppState`/`focusManager` bridge (C1) — do not hand-rewrite this file from the plan's simplified description; empirically confirmed present and correct as of this 3rd VALIDATE pass.
- Author `packages/types/src/menu.ts` per Gap A as explicit content (not a `checkout --ours`/`git show HEAD:` revert) — it auto-merges clean with development's raw decimal types intact.
Next phase: EXECUTE — run the Implementation Checklist (§7) in order, starting with the merge-probe re-run (item 1).
Validate contract: inline in plan (section above) — `Gate: PASS` as of this 3rd VALIDATE pass (13-07-26).
Execute start: `ENTER EXECUTE MODE` for this plan file. Fully-auto gates: `pnpm typecheck`, `pnpm --filter @jojopotato/ui test`, `pnpm --filter @jojopotato/api test`, plus the V-C money-unit grep sweep. Hybrid/agent-probe: full order-placement flow (V-D) + branch-listing regression (V-E), both require a running `packages/api` + seeded Postgres. High-risk pack: no (no auth/billing/schema/deploy surface touched).
