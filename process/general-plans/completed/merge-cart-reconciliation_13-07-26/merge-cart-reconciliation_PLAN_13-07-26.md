---
name: plan:merge-cart-reconciliation
description: "Reconcile 6-file merge conflict between development's mock cart (CART-001) and this branch's real backend-wired cart; port backend wiring onto development's canonical Cart/CartSessionProvider model"
date: 13-07-26
feature: general
---

# Merge Cart Reconciliation — PLAN (13-07-26)

**Date**: 13-07-26
**Status**: ✅ VERIFIED — EXECUTE + EVL complete (`HALTED_SUCCESS`, 0 open gaps), archived
13-07-26. Merge is staged but **not yet committed** (`MERGE_HEAD` present) — committing it is a
follow-up action for `vc-git-manager`, out of scope for this plan/this UPDATE PROCESS pass. See
`merge-cart-reconciliation_REPORT_13-07-26.md` for the full closeout (incl. SPEC Achievement,
drift score, and commit-checkpoint recommendation).
**Complexity**: COMPLEX

## TL;DR

`development` merged a mock-data-only Cart screen (PR #62, CART-001) that now conflicts with this
branch's fully backend-wired cart (branches/menu/orders API, 44 passing tests). The user already
decided: keep `development`'s `Cart`/`CartItem`/`CartSessionProvider` model as canonical, and port
this branch's real backend wiring onto it. This plan is the exact merge-resolution recipe for the 6
conflicting files plus rework of 3 downstream consumers, resolving 2 explicit design gaps
(`MenuItem.categoryId` sourcing, coupon-UI-vs-no-backend-support) along the way.

## Overview

**Problem:** `git merge origin/development` into this branch will produce exactly 6 conflicting
files (confirmed via `git merge-tree`). Both sides are legitimate, non-overlapping RIPER-5-verified
work — this is not a "pick a winner" merge, it's an integration: dev's cart *shape* (types + state
hook + UI composition) stays, this branch's cart *plumbing* (real branch/menu/order APIs) gets
re-wired onto that shape.

**Non-conflicting but load-bearing:** development also adds `mock-cart.ts`,
`packages/ui/src/components/{cart-summary,empty-state}.tsx` (+tests), and extends
`branch-card.tsx`/`button.tsx`/`cart-item.tsx` — these merge in cleanly as pure additions and this
plan's rebuilt `cart.tsx` explicitly reuses them rather than reinventing equivalent markup.

## Goals

1. Merge `origin/development` into this branch with zero remaining conflict markers.
2. `packages/types/src/cart.ts` = development's `Cart`/`CartItem`/`CartItemOption`/`AppliedDiscount` (canonical, no further edits needed — it's already correct as the merge brings it in).
3. `apps/mobile/src/features/cart/hooks/use-cart.ts` = development's `CartSessionProvider`/`useCart()` (canonical), with `initialCart` seeded empty in production (not `MOCK_CART`) — resolved explicitly in Touchpoint 4 below.
4. Rework 3 real-backend consumers (`product/[productId].tsx`, `cart.tsx`, `checkout.tsx`) to read/write the new `Cart`/`CartItem` shape while continuing to call our real `packages/api` endpoints (branches, menu, orders) — no mock data in the shipped consumer code paths.
5. Resolve the `MenuItem.categoryId` gap and the coupon-UI-vs-no-backend-discount-support gap as explicit, deliberate decisions (not left ambiguous).
6. Prove the full order-placement flow (product select → cart → checkout → confirmation) still works end-to-end against the real backend on the new cart shape.

## Scope

In scope: the 6 conflicting files + the 3 downstream consumer files (`product/[productId].tsx`,
`checkout.tsx`, and deleting `cart-totals.ts`) + updating `packages/types/src/menu.ts`'s `MenuItem`
consumption path. Out of scope: building a real coupon backend (explicitly deferred, see Touchpoint 8),
building a real cart-persistence layer (still in-memory per development's design — unchanged),
any change to `packages/api/**` (untouched by the conflict).

## Decision Summary (from prior INNOVATE / user consultation — locked, not re-litigated here)

- **Chosen approach:** Keep development's type/state model (`Cart`, `CartItem`, `CartItemOption`, `AppliedDiscount`, `CartSessionProvider`/`useCart()`) as canonical. Port this branch's backend wiring onto it.
- **Why over alternatives:** Rejected alternative — keep our `CartProvider`/`CartLine` model and back-port dev's UI onto it — was rejected because dev's cart screen is EVL-verified (24/24 UI tests) against its own type shape; re-deriving those tests against a different shape duplicates already-proven work for no benefit, and dev's discount/coupon fields are a real forward-looking capability our model lacks entirely.
- **Risk predicted:** Adapter-layer bugs at the 3 consumer touchpoints (type mapping mismatches) are the single highest risk — mitigated by Touchpoint verification gates below (T2/T3/T4).
- **Key constraint accepted:** Coupon backend is out of scope; the merged UI must not silently show a fake discount that the server ignores (resolved as UI-disable, see Touchpoint 8).

## Touchpoints

| # | File | Conflict? | Resolution |
|---|---|---|---|
| 1 | `packages/types/src/cart.ts` | Yes (content) | Take development's version verbatim (`git checkout --theirs` equivalent — see Merge Mechanics). No further edits. |
| 2 | `apps/mobile/src/features/cart/hooks/use-cart.ts` | Yes (add/add) | Take development's version, with **two** edits: (a) change `initialCart = MOCK_CART` default to an empty-cart default (see Touchpoint 4), **and (b) restore the branch-switch cart-clear invariant inside `setBranch` — see VALIDATE Finding F1 below, this is a required addition, not optional.** |
| 3 | `apps/mobile/src/app/(tabs)/order/cart.tsx` | Yes (content) | Take development's version as the structural base; replace its `MOCK_CART_BRANCH`/`MOCK_OTHER_BRANCH`/`BRANCHES`/`estimatedPickup()`/dev-only branch-switch button with real branch data; add checkout navigation (already present in dev's version — confirmed, no change needed there); apply the coupon-UI decision (Touchpoint 8). |
| 4 | `apps/mobile/src/app/_layout.tsx` | Yes (content) | Take development's version (mounts `CartSessionProvider`), with the `initialCart` default fixed per Touchpoint 4 detail below. |
| 5 | `apps/mobile/src/app/component-showcase.tsx` | Yes (content) | Manual union: keep BOTH `SAMPLE_CART_ITEM`'s dev-shaped fields (`productNameSnapshot`, `unitPriceCents`, `lineId: 'line-showcase-1'`) AND our `ORDER_STATUSES` 7-value array. **VALIDATE note: the authoritative, verified-correct instruction is Merge Mechanics Step 6 below (use OUR `accepted`/`flavoring`/`ready` values, not dev's `confirmed`/`ready_for_pickup`) — the parenthetical in this row is worded confusingly and should be read as a pointer to Step 6, not taken literally.** |
| 6 | `packages/ui/src/components/__tests__/mocks.ts` | Yes (content) | Manual union: keep dev's `MOCK_CART_ITEM` (`productNameSnapshot`/`unitPriceCents` fields, matches canonical `CartItem`) AND our `PickupBranch` mock fixture fields (`estimatedPrepMinutes`/`isAcceptingPickup`). **VALIDATE correction: this file has exactly ONE branch fixture (`MOCK_BRANCH`), not two — add `estimatedPrepMinutes: 20`/`isAcceptingPickup: true` to that single fixture. The "first fixture / second fixture" wording in Merge Mechanics Step 7 below describes `component-showcase.tsx`'s separate two-branch demo (`estimatedPrepMinutes: 20/25`) — it does not apply to this file. Both required fields are non-optional on `PickupBranch`, so `pnpm typecheck` will fail loudly if this is skipped — low risk of a silent miss, but the instruction as originally written could confuse an executing agent.** |

Non-conflicting files kept as-is from the merge (no action needed): `apps/mobile/src/features/cart/mock-cart.ts`, `packages/ui/src/components/{cart-summary,empty-state}.tsx` (+`__tests__/{cart-summary,empty-state}.test.tsx`), `packages/ui/src/index.ts` (dev's version already exports both — verified via `git show origin/development:packages/ui/src/index.ts`), `packages/ui/src/components/{branch-card,button,cart-item}.tsx` (dev's extensions — `onChange`/`footer` on `BranchCard`, `onRemove` on `CartItem` — verified via direct read, no conflict; both new props are optional, confirmed backward-compatible with existing callers).

## Public Contracts

- `packages/types/src/cart.ts` becomes the sole cart type contract consumed by `apps/mobile` and (indirectly) by request bodies built for `packages/api`'s `POST /orders` (mapped, not directly typed against — the API's `CreateOrderInput` shape is unchanged).
- `useCart()` return shape changes from `{branchId, items: CartLine[], itemCount, setBranch, addItem(item), updateQuantity, removeItem, clear}` to `{cart, subtotalCents, discountTotalCents, totalCents, itemCount, addItem(menuItem, opts, qty?), updateQuantity, removeItem, applyDiscount, clearDiscount, clearCart, setBranch}`. **VALIDATE correction: the claim "every internal consumer of the old shape must be updated (all 3 identified in Touchpoints 3, and the 2 below)" is INCOMPLETE.** There are 3 additional `useCart()` consumers not listed anywhere in this plan: `apps/mobile/src/app/(tabs)/index.tsx` (Home tab root, destructures `setBranch`), `apps/mobile/src/app/(tabs)/order/index.tsx` (Order tab root, destructures `itemCount` only — genuinely unaffected, no action needed), and `apps/mobile/src/app/(tabs)/branches/index.tsx` (Branches tab root, destructures `setBranch`). The two `setBranch`-only consumers are the exact site of VALIDATE Finding F1 (see below) — see also Touchpoint 2. **RE-VALIDATE addition (13-07-26, Finding F5): there is actually a THIRD `setBranch` caller — `apps/mobile/src/app/(tabs)/order/product/[productId].tsx` (Checklist item 8 / Merge Mechanics Step 8) — whose current `onAddToCart` calls `setBranch(branchId); addItem(...)` with an existing code comment explicitly documenting reliance on `setBranch`'s auto-clear behavior ("Ensure the cart is scoped to this branch before adding (clears any cart from a different branch...)"). This call site is already being reworked by this plan (Step 8), but its dependency on the Step 3 `setBranch` fix was never called out. The Step 3 fix protects it automatically (same hook, same guarantee) — verified no additional code change needed — but it must be named explicitly and agent-probed; see Finding F5.**
- `packages/api/**` contract is UNCHANGED — `POST /orders` still expects `{branchId, paymentMethod, items: [{productId, quantity, selectedOptions: [{optionId}]}]}`. **VALIDATE-verified**: `checkout.tsx`'s planned mapping `item.selectedOptions.map((o) => ({ optionId: o.id }))` is correct (confirmed field-by-field against `packages/api/src/routes/orders.ts`'s zod schema and `CartItemOption.id` in development's `cart.ts`), and this exact mapping is structurally enforced by TypeScript at `pnpm typecheck` time because `useCheckout().placeOrder` is typed `(input: CreateOrderInput) => ...` (not `any`) — a wrong field name here would be a compile error, not a silent runtime bug. This specific risk (flagged as the highest-priority item to verify) is well-covered. **Re-confirmed 13-07-26** by re-reading `packages/api/src/routes/orders.ts`'s live zod schema (`selectedOptions: z.array(z.object({ optionId: z.string().uuid() }))`) and `use-checkout.ts`'s live `placeOrder: (input: CreateOrderInput) => Promise<Order | null>` signature.

## Blast Radius

- Files touched: 6 conflict-resolution files + 3 consumer rework files (`product/[productId].tsx`, `checkout.tsx`, deletion of `cart-totals.ts`) = **9 files total**, all within `apps/mobile` and `packages/types`/`packages/ui` (no `packages/api` changes). **VALIDATE addition: 3 more files read `useCart()` and were not listed — see Public Contracts correction above. Two of them (`(tabs)/index.tsx`, `(tabs)/branches/index.tsx`) need no structural edit but are the manifestation site of Finding F1; the third (`(tabs)/order/index.tsx`) needs nothing.** **RE-VALIDATE addition (Finding F5): `product/[productId].tsx` (already in the 9-file count as Checklist item 8) is ALSO a manifestation site of the same invariant, not just an addItem-signature rework target — its `setBranch(branchId)` call at the top of `onAddToCart` depends on the Step 3 fix exactly like the other two consumers. Full-repo grep (13-07-26) confirms these are the only 3 `setBranch` callers in `apps/mobile/src` — no others exist.**
- Risk class: none of auth/billing/schema/public-API/deploy/secrets apply. This is a client-side type/state-model reconciliation. Highest real risk is **regression of previously-EVL-verified order-placement flow** (re-plumbing onto a different type system) — treated as the plan's primary verification target (see Verification Evidence). **VALIDATE finding: the actual highest real risk found is NOT a type-mapping bug (that risk is well-covered and enforced by the type system, see Public Contracts) — it's a *behavioral* regression invisible to `tsc`: see Finding F1 (and its Finding F5 completeness addendum).**
- Packages affected: `apps/mobile`, `packages/types`, `packages/ui` (test fixtures only, no component logic changes).

## Design Gap Resolutions (locked decisions — not left ambiguous)

### Gap A — `MenuItem.categoryId` when mapping from `MenuProduct` (API-shaped) to `MenuItem` (cart-shaped)

`MenuProduct` (our API-response type, `apps/mobile/src/features/menu/lib/api-client.ts`) has no
`categoryId` field — it's already nested under a `MenuCategory` in the `BranchMenu` response tree, so
the product itself doesn't carry its own category id back up. `MenuItem` (development's cart-facing
type, `packages/types/src/menu.ts`) requires `categoryId: string` (non-optional).

**Decision:** thread the category id down explicitly from the branch-menu screen's traversal (the
category is already known at the point `product/[productId].tsx` finds the product via
`menu.data?.categories.flatMap(...)`) — do NOT synthesize a placeholder empty string, and do NOT
make the field optional in the shared type (that type is canonical/shared, out of this plan's
touch scope). Concretely: when building the `MenuItem` object to pass to `addItem`, find the owning
category by re-deriving it in the same `useMemo` that finds the product (`menu.data?.categories.find(c => c.products.some(p => p.id === productId))?.id ?? ''`). This keeps the shared type honest while giving `addItem` real data on the hot path; the `?? ''` fallback only fires in the
theoretically-unreachable case where the product lookup itself already failed (in which case the
screen already renders a "Couldn't load this product" error state and `onAddToCart` is unreachable).

**VALIDATE-verified:** `menu.data.categories` is `MenuCategory[]` where each category carries `products: MenuProduct[]` (confirmed in `apps/mobile/src/features/menu/lib/api-client.ts`), so the `.find(c => c.products.some(...))` lookup is mechanically sound and the existing `product` lookup at line 30 of `product/[productId].tsx` uses the exact same traversal shape. This is a real, implementable, correct resolution — no gap found here. **Re-confirmed 13-07-26** by re-reading `apps/mobile/src/features/menu/lib/api-client.ts`'s live `MenuCategory`/`MenuProduct` interfaces and `product/[productId].tsx`'s live `product` lookup — unchanged since the first VALIDATE pass.

### Gap B — Coupon UI vs. no backend discount support

`development`'s cart screen has a working "Apply coupon" input that computes a client-side 10%
discount for display (`applyDiscount`/`AppliedDiscount`), but our `POST /orders` backend has zero
discount/coupon support — `discount_total` is always `0` server-side (coupons explicitly deferred
in the original pickup-order-flow plan).

**Decision: (b) — disable/hide the coupon-apply UI for now.** This matches this branch's existing
"coupons deferred" stance and produces the least user-facing inconsistency (option (a), silently
submitting a real order at a lower total than the discount implied, would be a real trust-breaking
bug; option (a) is explicitly rejected). Concretely: in the rebuilt `cart.tsx`, replace the "Coupon /
reward" `View` block (the `Input` + `Apply` `Button`, and the `applyDiscount`/`clearDiscount`
wiring) with a static, non-interactive note: `"Coupons coming soon"` (reuse `EmptyState`'s
description-text styling or a plain `<Text>` — do not import a new component for this). Keep
`CartSummary`'s `discountCents`/`discountLabel` props wired through as `0`/`undefined` always (so
the summary component itself needs no change — it already hides the discount row when `discountCents
<= 0`). Do not call `applyDiscount`/`clearDiscount` anywhere in the rebuilt screen. Leave
`applyDiscount`/`clearDiscount` in `useCart()`'s public API unchanged (they're harmless unused
capability, and removing them would touch the canonical hook beyond what's needed).

**VALIDATE-verified:** read `development`'s actual `cart.tsx` directly. The "Coupon / reward" block
is exactly one `View` (`styles.couponSlot`) containing a ternary: the `Input`+`Apply Button` path
(calls `handleApplyCoupon` → `applyDiscount`) when no discount is applied, or a `CouponCard` +
"Remove discount" button (calls `clearDiscount`) when one is. The plan's edit target correctly
covers BOTH branches of this ternary (removing the whole block removes both call sites), and
`CartSummary`'s discount row is confirmed gated on `discountCents > 0` in
`packages/ui/src/components/cart-summary.tsx`. No gap found — decision is completely and correctly scoped. **Re-confirmed 13-07-26** by re-reading development's full `cart.tsx` and `packages/ui/src/components/cart-summary.tsx` in this pass — both claims hold exactly as described.

## VALIDATE Findings (13-07-26, first pass)

### F1 — FAIL (resolved) — `setBranch` no longer clears the cart on branch switch (behavioral regression, not caught by any listed gate)

**What was found:** the CURRENT (pre-merge) `useCart()` reducer enforces the single-branch
invariant inside the hook itself:
```ts
case 'SET_BRANCH': {
  if (state.branchId === action.branchId) return state;
  return { branchId: action.branchId, items: [] };   // <-- auto-clears on real branch change
}
```
Development's `CartSessionProvider.setBranch` (which this plan takes verbatim) does NOT do this:
```ts
const setBranch = useCallback((branchId: string) => {
  setCart((prev) => ({ ...prev, pickupBranchId: branchId }));   // <-- items untouched
}, []);
```
Development's own `cart.tsx` compensates by wrapping every one of ITS branch switches in an
explicit `clearCart()` + confirm-`Alert` before calling `setBranch()` (`handleChangeBranch`,
`handleAddFromOtherBranch`) — the invariant moved from the hook to the call site. This plan's
Touchpoint 3 correctly preserves that pattern inside the rebuilt `cart.tsx`.

**The gap:** two OTHER real, already-shipped screens call `setBranch()` directly, with no
clear-and-confirm wrapper, because under the CURRENT hook that was safe (the hook did the
clearing):
- `apps/mobile/src/app/(tabs)/index.tsx` (Home tab): `openBranch = () => { setBranch(MOCK_BRANCH.id); router.push(...) }`
- `apps/mobile/src/app/(tabs)/branches/index.tsx` (Branches tab): `openBranch = (branch) => { setBranch(branch.id); router.push(...) }`

Neither file is mentioned anywhere in this plan (not in Touchpoints, Blast Radius, Public
Contracts, or the Implementation Checklist). After this merge, a user with items in their cart
from Branch A who taps a different branch card on the Home or Branches tab will have their cart
silently relabeled to Branch B's `pickupBranchId` **with Branch A's items still in it** — a direct
violation of this plan's own stated invariant ("pickup is single-branch per order," restated in
the Decision Summary's risk section) and exactly the class of silent cross-module regression this
VALIDATE pass was asked to hunt for.

**Why it's not caught by any existing gate:** `setBranch: (branchId: string) => void` has the
identical signature in both the old and new hook — `pnpm typecheck` cannot see a purely behavioral
difference. None of the plan's 3 Agent-Probe scenarios exercise switching branches from Home or
Branches while the cart is non-empty. There is no RN test runner (confirmed via
`process/context/tests/all-tests.md`) that could catch this either.

**Required fix (small, localized — recommended before EXECUTE):** restore the clear-on-real-branch-change
behavior inside `CartSessionProvider.setBranch` itself in `use-cart.ts` (the file is already being
edited in this plan for the `initialCart` default, so this is the same edit surface):
```ts
const setBranch = useCallback((branchId: string) => {
  setCart((prev) =>
    prev.pickupBranchId === branchId ? prev : { ...prev, pickupBranchId: branchId, items: [], appliedDiscount: undefined },
  );
}, []);
```
This restores parity with the current hook's guarantee without touching `cart.tsx`'s own explicit
clear-and-confirm UX (that UX still fires correctly — user still sees the confirm dialog before
`cart.tsx` calls `clearCart()` then `setBranch()`; the hook-level clear is now a defense-in-depth
backstop for the two callers that don't confirm first, matching how Home/Branches behaved before
this merge with zero user-facing prompt).

**Required plan additions once this is applied:**
1. Touchpoint 2 / Implementation Checklist item 3 gains a second required edit (done above).
2. A new Agent-Probe verification row: "Add an item to the cart for Branch A. Without checking out, navigate to Home or Branches tab and open a different Branch B. Confirm the cart is empty (or scoped to Branch B), never silently holding Branch A's items under Branch B."
3. Blast Radius / Public Contracts should list `(tabs)/index.tsx` and `(tabs)/branches/index.tsx` as verified-no-edit-needed consumers (their `setBranch` call sites remain unchanged, only the hook's internal behavior changes).

This is the one FAIL-class finding from this VALIDATE pass. Everything else investigated
(categoryId sourcing, coupon-UI scoping, the `optionId`/`id` field mapping into `POST /orders`,
the accepted image known-gap, the exact 6-file conflict set) checked out as correct on direct
inspection of both branches' real source.

**RE-VALIDATE STATUS (13-07-26): RESOLVED.** The fix above was independently re-verified in the
13-07-26 re-validation pass by re-reading both branches' actual `use-cart.ts` in full and confirming
byte-for-byte that the proposed fix restores exact parity with the current branch's `cartReducer`
`SET_BRANCH` guarantee. See the re-validation's Finding F5 for one completeness addendum (a third
`setBranch` caller not originally enumerated — already automatically protected by this same fix).

### F2 — CONCERN (resolved) — Test coverage needs one new Agent-Probe row (ties to F1)

Covered above under F1's "Required plan additions." Existing Fully-Automated/Agent-Probe/Known-Gap
tier assignments are otherwise appropriate given the confirmed absence of an RN test runner
(`process/context/tests/all-tests.md`) — this is the sole addition needed. **RE-VALIDATE STATUS:
RESOLVED** — the Agent-Probe row exists in Verification Evidence below; broadened further by
Finding F5's addition.

### F3 — CONCERN (resolved) — Touchpoint 5 (component-showcase.tsx) parenthetical is confusingly worded

See the correction inline in the Touchpoints table above. The authoritative instruction (Merge
Mechanics Step 6) is correct and unambiguous; only the Touchpoints-table summary sentence risks
misleading a fast reader. Low severity — no code-level ambiguity for an agent that reads Merge
Mechanics Step 6 (which the row explicitly points to). **RE-VALIDATE STATUS (13-07-26): CONFIRMED
RESOLVED** — re-read the Touchpoints table row 5 in the current plan text; the correction is present
verbatim.

### F4 — CONCERN (resolved) — Touchpoint 6 / Merge Mechanics Step 7 (mocks.ts) describes a "second fixture" that doesn't exist in that file

See the correction inline in the Touchpoints table above. Self-correcting via `pnpm typecheck`
(both fields are required on `PickupBranch`, so a skipped edit fails the build loudly), but the
instruction as originally written could send an executing agent looking for a nonexistent second
branch object in the wrong file. Low severity given the automated backstop, but worth the
clarification recorded above so no time is lost during EXECUTE. **RE-VALIDATE STATUS (13-07-26):
CONFIRMED RESOLVED** — re-read both branches' `mocks.ts` in full this pass; confirmed exactly one
`MOCK_BRANCH` fixture exists in that file on both sides, and the correction text is present verbatim
in the current plan.

## RE-VALIDATE Findings (13-07-26, second pass — independent re-verification)

This pass independently re-verified every claim above against live source (not trusting the prior
pass's or the intervening plan-supplement's claims), plus re-ran the full BLOCKED-escalation checks
requested for this cycle: (1) F1's fix correctness, (2) F3/F4 resolution, (3) everything that
previously passed, (4) whether the F1 fix introduces any new regression across every `setBranch`
call site app-wide. Result: everything from the first pass holds. One new, non-blocking completeness
gap was found and resolved inline in this same pass (Finding F5).

### F5 — CONCERN (found 13-07-26, resolved inline this pass) — a third `setBranch` call site was not enumerated in F1, though the Step 3 fix already covers it

**What was found:** a full-repo grep of every `setBranch` call site in `apps/mobile/src` (not just
the two named in the original F1 writeup) surfaced a third real caller:
`apps/mobile/src/app/(tabs)/order/product/[productId].tsx`, inside `onAddToCart` (current branch,
lines 79-82):
```ts
// Ensure the cart is scoped to this branch before adding (clears any cart
// from a different branch — pickup is single-branch per order).
setBranch(branchId);
addItem({ productId: product.id, name: product.name, unitPriceCents, quantity, selectedOptions });
router.push('/(tabs)/order/cart');
```
This file's own existing code comment proves it currently relies on exactly the same `setBranch`
auto-clear guarantee that Finding F1 identified — and it is not a bystander file, it is the very file
this plan reworks in Checklist item 8 / Merge Mechanics Step 8 (the `onAddToCart` rewrite there
preserves the identical `setBranch(branchId); addItem(...)` call pattern, just with the new
`addItem(menuItem, opts, qty)` signature — see the plan's Step 8 code block).

**Why this doesn't change the required code fix:** the Step 3 fix operates inside `setBranch` itself
(the hook), so it protects every caller uniformly — this third call site gets the exact same
protection as the two Home/Branches callers, with zero additional code change required. Verified: no
other `setBranch` callers exist anywhere in `apps/mobile/src` beyond these three (full-repo grep,
13-07-26) — confirmed via `grep -rn "setBranch" apps/mobile/src`.

**Why it still matters:** F1's original writeup said "two OTHER real, already-shipped screens call
`setBranch()` directly" and Public Contracts/Blast Radius said the same — this undercounts by one,
and the omitted file is the highest-relevance one (it's mid-rework in this very plan, not just an
unlisted bystander). Left uncorrected, an executing agent reading only the original F1 text could
reasonably assume Step 8's rework has no branch-clear dependency to preserve, and the existing
Agent-Probe scenario (Checklist item 14) only exercises the Home/Branches path, not the
"add a product from a different branch's menu while the cart already holds items" path — arguably the
more natural real-world trigger for this exact invariant (browsing a branch's menu and adding a
product is a more common flow than switching branches directly from Home/Branches with items already
in the cart).

**Resolution applied in this pass:** Public Contracts and Blast Radius corrected above (see
RE-VALIDATE addition notes); Implementation Checklist item 15 and a new Verification Evidence row
added below to explicitly agent-probe this third path. No Merge Mechanics change needed — Step 8's
rework code already preserves the correct `setBranch`-then-`addItem` order, and Step 3's fix makes
that order safe. This is a documentation/test-coverage completeness fix, not a code fix.

### Everything else re-checked and confirmed unchanged (no new findings)

- 6-file conflict set: re-ran `git merge-tree $(git merge-base HEAD origin/development) HEAD origin/development` fresh — same 5 changed-in-both + 1 added-in-both = 6 files, matching the list in Merge Mechanics Step 1 exactly.
- `categoryId` (Gap A), coupon-UI-disable (Gap B): re-read both branches' real source in full — both hold exactly as described (see inline re-confirmation notes added to each Gap section above).
- `CartItemOption.id` → `optionId` mapping into `POST /orders`: re-read `packages/api/src/routes/orders.ts`'s live zod schema and `use-checkout.ts`'s live `placeOrder` signature — confirmed correct and still compile-time enforced (not `any`-typed).
- `cart-totals.ts` deletion (Step 10): fresh `grep -rn "cart-totals\|cartSubtotalCents\|lineTotalCents" apps/mobile/src apps/mobile` — only `cart.tsx`, `checkout.tsx`, and the file itself reference it; both consumers are rewritten by Steps 5/9, confirming zero dangling references after the merge.
- Full-repo grep for `CartLine`/`CartProvider` (old type/provider names): only appear in the 3 files this plan directly rewrites/deletes (`use-cart.ts`, `cart.tsx`, `cart-totals.ts`) or the root `_layout.tsx` (being replaced) — no stray consumer missed anywhere else in the repo.
- Minor test-tier observation (not a CONCERN, purely a labeling correction): `pnpm --filter @jojopotato/api test` has a stated local-Postgres precondition per `process/context/tests/all-tests.md` ("needs local Postgres via `docker compose up -d` + `db:migrate` first"), so per the Test Tier Decision Waterfall it is more precisely `Hybrid` than `Fully-Automated`. This is a pre-existing repo-wide convention (this plan doesn't touch `packages/api` at all — the gate exists purely as a regression check that the untouched backend contract still passes), not a new gap; reclassified in the Test gates table below for accuracy.

## Implementation Checklist

1. `git fetch origin development && git merge origin/development` — expect exactly the 6 listed conflicting files.
2. Resolve `packages/types/src/cart.ts` — take development's version verbatim (Merge Mechanics Step 2).
3. Resolve `apps/mobile/src/features/cart/hooks/use-cart.ts` — take development's version, replace `initialCart = MOCK_CART` default with `EMPTY_CART`, drop the now-unused `MOCK_CART` import, **and restore the branch-switch cart-clear behavior inside `setBranch` (VALIDATE Finding F1 — required, not optional)** (Merge Mechanics Step 3).
4. Resolve `apps/mobile/src/app/_layout.tsx` — take development's version (mounts `CartSessionProvider`) (Merge Mechanics Step 4).
5. Resolve `apps/mobile/src/app/(tabs)/order/cart.tsx` — take development's version as base, then: remove mock branch plumbing, wire real `useBranch`/`useBranches`, source pickup estimate from `branch.estimatedPrepMinutes`, rework `handleChangeBranch` against real branch list, strip `productForLine`'s mock-catalog image lookup, apply the coupon-UI-disable decision (Merge Mechanics Step 5, points 1-6).
6. Resolve `apps/mobile/src/app/component-showcase.tsx` — take development's version as base, restore this branch's `ORDER_STATUSES` values (Merge Mechanics Step 6).
7. Resolve `packages/ui/src/components/__tests__/mocks.ts` — take development's version as base, restore this branch's `estimatedPrepMinutes`/`isAcceptingPickup` fixture fields **on the single `MOCK_BRANCH` fixture in this file (VALIDATE Finding F4 — there is only one fixture here, not two)** (Merge Mechanics Step 7).
8. Rework `apps/mobile/src/app/(tabs)/order/product/[productId].tsx` — replace old `addItem(...)` call with the new `addItem(menuItem, opts, qty)` signature, resolve `categoryId` via the owning-category lookup, **and preserve the existing `setBranch(branchId)` call immediately before `addItem(...)` — this ordering is required for the invariant Finding F5 documents, not incidental** (Merge Mechanics Step 8).
9. Rework `apps/mobile/src/app/(tabs)/order/checkout.tsx` — read `cart`/`subtotalCents`/`clearCart` from `useCart()`, remap `CreateOrderInput.items` from `CartItem[]` (Merge Mechanics Step 9).
10. Delete `apps/mobile/src/features/cart/lib/cart-totals.ts` after confirming zero remaining references (Merge Mechanics Step 10).
11. Run `pnpm typecheck`, `pnpm --filter @jojopotato/ui test`, `pnpm --filter @jojopotato/api test` (precondition: local Postgres running via `docker compose up -d` + `db:migrate`) — all must exit 0.
12. Manually exercise the full product→cart→checkout→confirmation flow against the real backend (agent-probe, see Verification Evidence).
13. Confirm the coupon-apply UI is absent from the rendered cart screen (agent-probe).
14. **[VALIDATE-added]** Manually exercise the branch-switch-with-existing-cart-items scenario from Home tab and Branches tab (agent-probe, see Verification Evidence and Finding F1).
15. **[RE-VALIDATE-added, Finding F5]** Manually exercise the branch-switch-via-product-add scenario: with items from Branch A in the cart, open Branch B's menu, add a product to cart from the product detail screen (`product/[productId].tsx`'s `onAddToCart`), confirm the cart is now scoped to Branch B only (Branch A's items are gone, not mixed in) (agent-probe, see Verification Evidence and Finding F5).

## Acceptance Criteria

- `git status` / `grep -rl '^<<<<<<<'` show zero unresolved conflict markers anywhere in the repo.
- `pnpm typecheck` exits 0 across all workspace packages.
- `pnpm --filter @jojopotato/ui test` exits 0 (development's cart-related UI tests plus the rest of the existing UI suite, all green against the merged fixtures).
- `pnpm --filter @jojopotato/api test` exits 0 (44 existing tests, unaffected — proves the API contract was untouched; precondition: local Postgres running).
- The full order-placement flow (product select → cart → checkout → confirmation) completes successfully against the real backend using the new `Cart`/`CartItem` shape end-to-end (agent-probe).
- The coupon-apply UI is disabled/hidden in the merged cart screen (no dangling backend-unsupported affordance).
- `apps/mobile/src/features/cart/lib/cart-totals.ts` is deleted with zero dangling references.
- **[VALIDATE-added]** Switching branches from the Home tab or Branches tab while the cart holds items from a different branch does not silently mix branches — the cart is cleared or the switch is guarded, matching the single-branch-per-order invariant.
- **[RE-VALIDATE-added]** Adding a product to the cart from a different branch's product-detail screen (`onAddToCart` in `product/[productId].tsx`) while the cart already holds items from another branch does not silently mix branches — same single-branch-per-order invariant as the Home/Branches tab case above.

## Phase Completion Rules

This is a SIMPLE-shaped single-session COMPLEX plan (no multi-phase program). It is considered
complete only when ALL Acceptance Criteria above are met AND the Verification Evidence table's
Fully-Automated rows are green AND the Agent-Probe rows have been manually exercised and confirmed
by the executing agent (not merely code-complete). A merge that typechecks but has not had the
end-to-end flow agent-probed is `CODE DONE`, not `VERIFIED` — do not mark this plan complete on
typecheck/unit-test success alone.

## Merge Mechanics

### Step 1 — Merge

```bash
git fetch origin development
git merge origin/development
```

Expect: merge stops with conflicts in exactly these 6 files (verify with `git status` — if the
conflict set differs from this list, STOP and re-diff against `git merge-tree $(git merge-base HEAD origin/development) HEAD origin/development` before resolving anything, since upstream may have moved):

```
apps/mobile/src/app/(tabs)/order/cart.tsx
apps/mobile/src/app/_layout.tsx
apps/mobile/src/app/component-showcase.tsx
apps/mobile/src/features/cart/hooks/use-cart.ts
packages/types/src/cart.ts
packages/ui/src/components/__tests__/mocks.ts
```

**VALIDATE-verified (13-07-26, both passes):** ran `git merge-tree $(git merge-base HEAD origin/development) HEAD origin/development` directly — the actual conflict set matches this list exactly (5 base+our+their content conflicts plus this one add/add conflict = 6 total). No hidden 7th conflict exists. Re-ran fresh in the 13-07-26 re-validation pass with the same result.

### Step 2 — Resolve `packages/types/src/cart.ts`

Take development's side entirely:

```bash
git checkout --theirs packages/types/src/cart.ts
git add packages/types/src/cart.ts
```

Confirm the resolved file matches the "Development's `packages/types/src/cart.ts`" block quoted in
this plan's originating research (re-verify with `git show origin/development:packages/types/src/cart.ts` if in doubt).

### Step 3 — Resolve `apps/mobile/src/features/cart/hooks/use-cart.ts`

Take development's side, then apply the `initialCart` edit AND the branch-switch-clear fix (VALIDATE Finding F1):

```bash
git checkout --theirs apps/mobile/src/features/cart/hooks/use-cart.ts
git add apps/mobile/src/features/cart/hooks/use-cart.ts
```

Edit the resolved file: change

```ts
export function CartSessionProvider({
  children,
  initialCart = MOCK_CART,
}: {
```

to seed an empty cart by default instead of `MOCK_CART`. Add a small local empty-cart constant
(do not delete `MOCK_CART`/`mock-cart.ts` — component-showcase.tsx and dev's own tests may still
exercise it as an explicit prop override):

```ts
const EMPTY_CART: Cart = { id: 'cart-local', items: [], pickupBranchId: '' };

export function CartSessionProvider({
  children,
  initialCart = EMPTY_CART,
}: {
```

Remove the now-unused `import { MOCK_CART } from '@/features/cart/mock-cart';` line from
`use-cart.ts` itself (mock-cart.ts stays — it's still consumed by `component-showcase.tsx`'s dev
sandbox and its own tests, just no longer as `use-cart.ts`'s default).

**Required addition (VALIDATE Finding F1):** also edit `setBranch` in the same file to restore the
single-branch clear-on-switch invariant that the current (pre-merge) hook guarantees and that three
existing call sites rely on implicitly (`(tabs)/index.tsx`, `(tabs)/branches/index.tsx`, and
`(tabs)/order/product/[productId].tsx` — see Finding F5):

```ts
const setBranch = useCallback((branchId: string) => {
  setCart((prev) =>
    prev.pickupBranchId === branchId
      ? prev
      : { ...prev, pickupBranchId: branchId, items: [], appliedDiscount: undefined },
  );
}, []);
```

This does not change `cart.tsx`'s own explicit clear-and-confirm UX (still fires as designed); it
adds a hook-level backstop for the callers that don't confirm first.

### Step 4 — Resolve `apps/mobile/src/app/_layout.tsx`

Take development's side (mounts `CartSessionProvider` with no `initialCart` prop passed — it will
now default to the real empty cart per Step 3):

```bash
git checkout --theirs apps/mobile/src/app/_layout.tsx
git add apps/mobile/src/app/_layout.tsx
```

No further edits needed — confirm the resolved file's `<CartSessionProvider>` call has no
`initialCart` prop (it doesn't, per the dev source read; re-confirmed 13-07-26 against fresh reads
of both branches' `_layout.tsx`).

### Step 5 — Resolve `apps/mobile/src/app/(tabs)/order/cart.tsx` (the highest-effort resolution)

Take development's version as the literal starting point:

```bash
git checkout --theirs "apps/mobile/src/app/(tabs)/order/cart.tsx"
git add "apps/mobile/src/app/(tabs)/order/cart.tsx"
```

Then apply these edits to the resolved file:

1. **Remove mock branch plumbing.** Delete the `BRANCHES` record, the `MOCK_CART_BRANCH`/
   `MOCK_OTHER_BRANCH` import, and the `estimatedPickup()` helper's reliance on
   `MOCK_BRANCH_PREP_MINUTES`. Delete the `handleAddFromOtherBranch`/dev-only `__DEV__` button
   block entirely (it only existed to exercise the mixed-branch-clear prompt against mock branches
   — the mixed-branch logic itself, `handleChangeBranch`'s clear-and-switch `Alert.alert`, stays,
   just re-wired to real branches per point 3).
2. **Wire the branch to real data.** Import `useBranch` from
   `@/features/branches/hooks/use-branches` (already exists on this branch, confirmed above).
   Replace `const branch = BRANCHES[cart.pickupBranchId] ?? MOCK_CART_BRANCH;` with:
   ```ts
   const branchQuery = useBranch(cart.pickupBranchId);
   const branch = branchQuery.data;
   ```
   Guard the render: if `cart.items.length > 0` but `branch` is not yet loaded (`branchQuery.loading`)
   or failed (`branchQuery.error`), render `ScreenLoader`/`ScreenMessage` (from
   `@/features/shared/components/screen-message`, already used elsewhere in this branch) instead of
   the cart body — do not fall through to `<BranchCard>` with an `undefined` branch.
3. **Real pickup-time estimate.** Replace `estimatedPickup(MOCK_BRANCH_PREP_MINUTES)` with the same
   client-side "now + prep minutes" computation, but sourced from `branch.estimatedPrepMinutes`
   (the real `PickupBranch` field, confirmed in `packages/types/src/pickup.ts`) instead of the mock
   constant — reuse the exact function body already present (`estimatedPickup(prepMinutes:
   number): PickupTime`), just call it as `estimatedPickup(branch?.estimatedPrepMinutes ?? 20)`
   (fallback matches `checkout.tsx`'s existing `?? 20` convention for consistency).
4. **Change-branch handler uses real branch ids.** `handleChangeBranch` currently toggles between
   the two mock branch constants. Replace with real branch-list awareness: import `useBranches()`
   (plural, already exists) to get the branch list; if there is no "other" real branch to switch to
   (list length ≤ 1), disable/hide the "Change" button entirely (pass `onChange={undefined}` to
   `<BranchCard>` when only one branch exists) rather than inventing fake switch behavior. When 2+
   branches exist, pick the next branch in the list (cyclic) as the switch target — same
   clear-and-confirm `Alert.alert` UX as today, just against real data.
5. **`productForLine` real-catalog fallback.** Its `MOCK_PRODUCTS.find(...)` catalog lookup for
   `imageUrl`/`categoryId` becomes unreachable/unnecessary once the line already carries
   `productNameSnapshot`/`unitPriceCents` (which it does, per the canonical `CartItem` shape) — the
   function only needs an `imageUrl`. Since the cart doesn't independently track a per-line image
   today (neither did development's version, which used the same mock-catalog crutch), **accept
   this as a known, explicitly-scoped gap**: cart line rows render without a product image (`imageUrl:
   undefined`) rather than reaching for a mock catalog. Delete `productForLine`'s `MOCK_PRODUCTS`
   import/lookup; keep the function but return `imageUrl: undefined` unconditionally. Record this as
   a `Test Infra Improvement Notes` / backlog item (see below) — not a blocker, since it's a purely
   cosmetic regression versus development's mock-catalog demo, not a functional one. **VALIDATE-verified:** `packages/ui/src/components/cart-item.tsx` already renders a placeholder `View` when `product.imageUrl` is falsy — confirmed this prop is optional and already has a graceful fallback path, so this known-gap is genuinely non-blocking. **Re-confirmed 13-07-26** against the live `cart-item.tsx` source (`{product.imageUrl ? <Image .../> : <View style={styles.imagePlaceholder} />}`).
6. **Apply the coupon-UI decision (Gap B above).**
7. **Checkout navigation** — already present (`onPress={() => router.push('/(tabs)/order/checkout')}`)
   in dev's version; no change needed.

### Step 6 — Resolve `apps/mobile/src/app/component-showcase.tsx`

Manual union — take development's version as base (`git checkout --theirs`), then re-apply our
`ORDER_STATUSES` array values on top (development's list uses `'confirmed'`/`'ready_for_pickup'`
naming; ours uses `'accepted'`/`'flavoring'`/`'ready'` naming — **use OUR values**, since our branch's
`OrderStatus` type / `packages/api` order-status enum is the real backend contract; development's
values were placeholder naming for a mock-only screen):

```bash
git checkout --theirs apps/mobile/src/app/component-showcase.tsx
git add apps/mobile/src/app/component-showcase.tsx
```

Then edit the `ORDER_STATUSES` const array in the resolved file back to this branch's values —
confirmed via direct read of `packages/types/src/order.ts`, the exact 7-value array is:
`['pending', 'accepted', 'preparing', 'flavoring', 'ready', 'completed', 'cancelled']`. `SAMPLE_CART_ITEM`
stays as development's version verbatim (`lineId: 'line-showcase-1'`, `productNameSnapshot`,
`unitPriceCents`) since it must match the now-canonical `CartItem` shape.

### Step 7 — Resolve `packages/ui/src/components/__tests__/mocks.ts`

Manual union — take development's version as base, then re-add our `PickupBranch` fixture fields:

```bash
git checkout --theirs packages/ui/src/components/__tests__/mocks.ts
git add packages/ui/src/components/__tests__/mocks.ts
```

Then edit the resolved file to add back `estimatedPrepMinutes: 20` and `isAcceptingPickup: true` to
the single `MOCK_BRANCH` fixture in this file — matching this branch's existing values (confirmed
via direct diff above). **VALIDATE correction: this file has exactly ONE branch fixture, not two —
the "first/second fixture" framing in an earlier draft of this step was describing
`component-showcase.tsx`'s separate two-branch demo (20/true and 25/false), not this file. Do not
add a second branch object here.** Development's `MOCK_CART_ITEM` (`productNameSnapshot`/`unitPriceCents`
fields) stays as-is — it already matches the canonical `CartItem` shape.

### Step 8 — Rework `apps/mobile/src/app/(tabs)/order/product/[productId].tsx` (non-conflicting file, still needs edits)

This file has NO merge conflict (development never touched it) but calls the OLD `useCart().addItem`
signature — it must be updated in the same commit as the merge resolution, or the branch won't
typecheck after the merge.

Current call:
```ts
addItem({ productId: product.id, name: product.name, unitPriceCents, quantity, selectedOptions });
```

Replace with (per Public Contracts §`useCart()` new signature, and Gap A's `categoryId` resolution):

```ts
const category = useMemo(
  () => menu.data?.categories.find((c) => c.products.some((p) => p.id === productId)),
  [menu.data, productId],
);
// ...
const onAddToCart = () => {
  const opts: CartItemOption[] = [];
  if (selectedSize) opts.push({ id: selectedSize.optionId, optionType: 'size', name: selectedSize.name, priceDeltaCents: selectedSize.priceDeltaCents });
  if (selectedFlavor) opts.push({ id: selectedFlavor.optionId, optionType: 'flavor', name: selectedFlavor.name, priceDeltaCents: selectedFlavor.priceDeltaCents });

  const menuItem: MenuItem = {
    id: product.id,
    name: product.name,
    description: product.description,
    priceCents: product.basePriceCents,
    imageUrl: product.imageUrl,
    categoryId: category?.id ?? '',
    isAvailable: true,
  };

  setBranch(branchId);
  addItem(menuItem, opts, quantity);
  router.push('/(tabs)/order/cart');
};
```

**RE-VALIDATE note (Finding F5):** keep `setBranch(branchId)` immediately before `addItem(...)` —
this ordering is load-bearing. Once Step 3's fix lands, this call clears any different-branch cart
contents before the new item is added, exactly mirroring the current branch's existing behavior
(the current file even has a code comment saying as much: "Ensure the cart is scoped to this branch
before adding (clears any cart from a different branch...)"). The rework above already preserves
this order — no additional code change is needed, only awareness that this ordering must not be
reshuffled during EXECUTE.

Import `CartItemOption`, `MenuItem` from `@jojopotato/types` (replacing the now-unused
`SelectedOption` import — confirm `toSelectedOption` from `@/features/menu/lib/api-client` is no
longer needed in this file and remove its import too, since option-mapping is now inlined above).
`useCart()`'s destructure changes from `{ setBranch, addItem }` (unchanged shape, still has both).

**VALIDATE-verified:** `apps/mobile/src/features/menu/lib/api-client.contract.ts` (the EVL-cycle-1
regression guard for the menu wire contract) imports `SelectedOption`/`toSelectedOption`/`MenuProduct`/
`MenuProductOption` independently of this file and is NOT touched by this plan — none of its imports
are removed or changed, so it continues to compile and continues to guard the menu wire-shape
contract it was built for. Its inline comment ("emulate the product screen's flow") becomes
narratively stale after this plan (the product screen no longer calls `toSelectedOption` at
runtime), but this is a documentation nit, not a functional gap — the mapping this plan actually
changes (`CartItemOption.id` → `POST /orders`' `optionId`) is separately and directly enforced by
`tsc` via `checkout.tsx`'s typed `placeOrder(input: CreateOrderInput)` call (see Public Contracts).
Optional cleanup, not required: update the comment in a follow-up, or add a second contract fixture
covering the new cart→order-body seam for symmetry with the existing menu→cart guard. **Re-confirmed
13-07-26** by re-reading `api-client.contract.ts` in full — its imports (`SelectedOption` from
`@jojopotato/types`, `toSelectedOption`/`MenuProduct`/`MenuProductOption` from `./api-client`,
`CreateOrderInput` from the orders api-client) are all untouched by this plan's changes; `SelectedOption`
itself lives in `packages/types/src/product-option.ts`, a file this merge never touches.

### Step 9 — Rework `apps/mobile/src/app/(tabs)/order/checkout.tsx`

Replace the `useCart()` destructure and item-mapping:

```ts
// before
const { branchId, items, clear } = useCart();
...
items: items.map((line) => ({
  productId: line.productId,
  quantity: line.quantity,
  selectedOptions: line.selectedOptions.map((o) => ({ optionId: o.optionId })),
})),
...
if (order) { clear(); ... }
```

```ts
// after
const { cart, subtotalCents, clearCart } = useCart();
const branch = useBranch(cart.pickupBranchId);
...
if (cart.items.length === 0) { /* empty-cart ScreenMessage, same as today */ }
...
const onPlaceOrder = async () => {
  const order = await placeOrder({
    branchId: cart.pickupBranchId,
    paymentMethod,
    items: cart.items.map((item) => ({
      productId: item.menuItemId,
      quantity: item.quantity,
      selectedOptions: item.selectedOptions.map((o) => ({ optionId: o.id })),
    })),
  });
  if (order) {
    clearCart();
    router.replace({ pathname: '/(tabs)/order/confirmation/[orderId]', params: { orderId: order.id } });
  }
};
```

Replace every `cartSubtotalCents(items)` call with the `subtotalCents` value already computed by
`useCart()` (delete the `import { cartSubtotalCents } from '@/features/cart/lib/cart-totals';` line
and the local `subtotalCents` variable — `useCart()` now derives it). The empty-cart guard condition
changes from `!branchId || items.length === 0` to `cart.items.length === 0` (note: `cart
.pickupBranchId` can be `''` on a genuinely empty cart per Step 3's `EMPTY_CART` — guard on
`items.length === 0` alone, matching development's own cart.tsx `isEmpty` convention, not on
branch-id truthiness).

**VALIDATE-verified (highest-priority check per the risk brief):** confirmed field-by-field against
`packages/api/src/routes/orders.ts`'s zod schema (`selectedOptions: z.array(z.object({ optionId:
z.string().uuid() }))`) and development's `CartItemOption` (`{ id: string; ... }` — the option's
identity field is named `id`, not `optionId`). The mapping `{ optionId: o.id }` above is correct.
This mapping is also structurally enforced by TypeScript: `useCheckout().placeOrder` is typed
`(input: CreateOrderInput) => Promise<Order | null>` (not `any`), so a wrong field name (e.g.
`o.optionId`, which doesn't exist on `CartItemOption`) would fail `pnpm typecheck`, not silently
ship. This is the single risk item the task brief asked to scrutinize most closely, and it checks
out as correct and automatically enforced. **Re-confirmed 13-07-26** against fresh reads of both
`packages/api/src/routes/orders.ts` and `apps/mobile/src/features/orders/hooks/use-checkout.ts` —
unchanged, still correct.

### Step 10 — Delete `apps/mobile/src/features/cart/lib/cart-totals.ts`

Before deleting, confirm no remaining references:

```bash
grep -rn "cart-totals\|cartSubtotalCents\|lineTotalCents" apps/mobile/src apps/mobile
```

Expected: zero references after Step 9's edit. Delete the file and its directory if now empty
(`apps/mobile/src/features/cart/lib/` — check `ls apps/mobile/src/features/cart/lib/` first; if
other files remain in `lib/`, only delete `cart-totals.ts`).

**VALIDATE-verified:** confirmed via direct grep — the only current references to `cart-totals`/
`cartSubtotalCents`/`lineTotalCents` are `cart.tsx`, `checkout.tsx`, and the file itself, all of
which are rewritten by Steps 5 and 9. No other consumer exists. **Re-confirmed 13-07-26** with a
fresh grep — same result.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `git status` shows zero files with unresolved conflict markers (`grep -rl '^<<<<<<<\|^=======\|^>>>>>>>' apps/ packages/` returns empty) | Fully-Automated | Merge completes cleanly (Goal 1) |
| `pnpm typecheck` (root, all packages) exits 0 | Fully-Automated | Type-level correctness of the ported cart shape across all 9 touched/reworked files (Goals 2-4) |
| `pnpm --filter @jojopotato/ui test` exits 0 (dev cart tests + existing UI suite, including `cart-item`/`cart-summary`/`empty-state` tests) | Fully-Automated | Development's canonical UI components remain intact and correctly typed against merged fixtures (Goal 2, Touchpoint 6) |
| `pnpm --filter @jojopotato/api test` exits 0 (44 existing API tests, untouched by this plan) — precondition: local Postgres running (`docker compose up -d` + `db:migrate`) | Hybrid | Backend contract (`POST /orders` et al.) is provably unaffected by the merge (Blast Radius: no `packages/api` changes) |
| Agent-probe: launch app, browse a real branch menu, select a product with size+flavor options, add to cart, confirm cart screen shows the real branch name/pickup estimate and correct line total | Agent-Probe | End-to-end flow proves the ported `addItem`/`MenuItem` mapping (Step 8) and real-branch wiring (Step 5 point 2-3) work together (Goal 6, highest-risk regression) |
| Agent-probe: from the cart screen, tap Checkout, confirm the checkout screen shows the real branch + real subtotal (no `cartSubtotalCents` import remaining), place the order, confirm navigation to the real order confirmation screen with a real `orderId` | Agent-Probe | Proves Step 9's checkout rework preserves the previously-EVL-verified order-placement round trip against the new cart shape (Goal 6) |
| Agent-probe: confirm the coupon input/apply-button is absent from the rendered cart screen (replaced by the static "Coupons coming soon" note) | Agent-Probe | Proves Gap B's UI-disable decision is actually implemented, not just planned (Goal 5) |
| **[VALIDATE-added] Agent-probe: add an item to the cart for Branch A, then (without checking out) open a different Branch B from the Home tab or Branches tab; confirm the cart does not silently carry Branch A's items under Branch B's id** | Agent-Probe | Proves VALIDATE Finding F1's fix is actually implemented — the single-branch-per-order invariant holds for the Home/Branches `setBranch()` callers |
| **[RE-VALIDATE-added] Agent-probe: add an item to the cart for Branch A, then (without checking out) navigate to Branch B's menu and add a product via the product-detail screen (`onAddToCart`); confirm the cart now holds only Branch B's item (Branch A's item is not silently retained)** | Agent-Probe | Proves Finding F5's third `setBranch` call site (`product/[productId].tsx`) is protected by the same Step 3 fix — the invariant holds for every `setBranch()` caller in the app, not just the two Home/Branches call sites |
| Known-gap: cart line rows render with no product image (`imageUrl: undefined` per Step 5 point 5) | Known-Gap | Explicitly accepted cosmetic gap — not silently dropped; recorded here and in Test Infra Improvement Notes. VALIDATE-verified `CartItem` already renders a placeholder for a falsy `imageUrl`. |

## Test Infra Improvement Notes

- Cart line rows lose their product-image thumbnail after this merge (Step 5, point 5) because
  `CartItem`/`Cart` (canonical, from development) do not carry a per-line `imageUrl` snapshot the
  way `productNameSnapshot`/`unitPriceCents` are snapshotted — only the currently-loaded branch
  menu's live catalog has images, and the cart screen doesn't always have that menu loaded. A
  follow-up could add an optional `imageUrl` snapshot field to `CartItem` (touches the canonical
  shared type — out of this plan's scope, needs its own small plan + INNOVATE check with the
  CART-002 owner) or fetch the current branch's menu on the cart screen just to backfill images
  (adds a network call the current design doesn't need).
- No existing automated E2E harness covers the product→cart→checkout→confirmation flow (repo-wide
  gap, already tracked at `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`)
  — this plan's end-to-end verification is agent-probe only for that reason, not a gap introduced by
  this plan.
- **[VALIDATE-added]** `apps/mobile/src/features/menu/lib/api-client.contract.ts` is a compile-time
  regression guard for the menu wire contract (built after EVL cycle 1 caught a field-name drift
  bug). This plan introduces a structurally-analogous seam (`CartItemOption` → `POST /orders` body)
  that is currently protected only by ordinary `tsc` structural typing on `placeOrder`'s parameter,
  not by a dedicated contract fixture like the menu one. This is sufficient (verified — see Step 9),
  but a follow-up could add a matching fixture for symmetry and defense-in-depth given this is
  explicitly the bug class this codebase has already been bitten by once.
- **[RE-VALIDATE-added]** The Agent-Probe rows for this plan (branch-switch-no-mix via Home/Branches,
  and the new branch-switch-product-add-no-mix via the product-detail screen) are the ONLY coverage
  for Finding F1/F5's regression class. If a future change touches `setBranch` again, nothing
  mechanical will catch a re-regression — this is the same "no RN test runner" gap noted above,
  applied specifically to this plan's highest-risk behavioral finding. Worth a small follow-up once
  a mobile-side runner exists: a unit test for `CartSessionProvider`'s `setBranch` clearing behavior
  in isolation (cheap once Jest/Vitest is wired for `apps/mobile`).

## Resume and Execution Handoff

1. **Selected plan file path:** `process/general-plans/active/merge-cart-reconciliation_13-07-26/merge-cart-reconciliation_PLAN_13-07-26.md`
2. **Last completed phase or step:** VALIDATE (re-validated 13-07-26, outer-pvl, V1-V7 complete) — **PASS**. No merge/execution has started yet.
3. **Validate-contract status:** written below — Gate: PASS. Cleared for EXECUTE.
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `process/development-protocols/plan-lifecycle.md`, `process/development-protocols/orchestration.md`, plus fresh direct reads (13-07-26 re-validation pass) of both branches' `packages/types/src/cart.ts`, `apps/mobile/src/features/cart/hooks/use-cart.ts`, `apps/mobile/src/app/{_layout.tsx,component-showcase.tsx,(tabs)/order/cart.tsx}`, `packages/ui/src/components/__tests__/mocks.ts`; this branch's `apps/mobile/src/app/(tabs)/{index.tsx,order/index.tsx,branches/index.tsx,order/{checkout.tsx,product/[productId].tsx}}`, `apps/mobile/src/features/{branches/hooks/use-branches.ts,shared/hooks/use-async-data.ts,orders/hooks/use-checkout.ts,menu/lib/{api-client.ts,api-client.contract.ts}}`, `packages/api/src/routes/orders.ts`, `packages/types/src/{menu,pickup,product-option,order}.ts`, `packages/ui/src/components/{cart-item.tsx}` and dev's `cart-summary.tsx`; plus a fresh `git merge-tree` run and a full-repo grep of every `setBranch`/`CartLine`/`CartProvider` reference in `apps/mobile/src`.
5. **Next step for a fresh agent picking up mid-execution:** This plan is cleared for EXECUTE (Gate: PASS). Run `ENTER EXECUTE MODE` for this plan. Apply Merge Mechanics Steps 1-10 in order (Step 3's `setBranch` fix is mandatory, not optional; Step 8's `setBranch`-then-`addItem` ordering must be preserved per Finding F5), then run the Fully-Automated/Hybrid gates, then the Agent-Probe scenarios listed in Verification Evidence (including the new Finding F5 branch-switch-product-add scenario) before marking this plan VERIFIED (not just CODE DONE — see Phase Completion Rules). If execution has already started despite an earlier BLOCKED state, check `git status` for merge-in-progress state (`.git/MERGE_HEAD` present) and cross-reference which of the 10 Merge Mechanics steps above have been applied by diffing the working tree against the "after" snippets in this plan — confirm the `setBranch` fix specifically, since it is easy to miss without this contract.

## Validate Contract

Status: PASS
Date: 13-07-26
date: 2026-07-13
generated-by: outer-pvl
supersedes: 2026-07-13 (outer-pvl) — re-validation after a PVL supplement cycle confirmed Finding F1's fix; this pass independently re-verified the fix plus every prior claim against real source, found and resolved one new completeness gap (Finding F5), and flipped the gate from BLOCKED to PASS

Parallel strategy: parallel-subagents
Rationale: 2/7 signals present (S1 multi-package scope — `apps/mobile`, `packages/types`,
`packages/ui`; S7 5+ files in blast radius — 9 files) → MEDIUM tier. No schema/auth/billing/API/
deploy surface (S2, S6 absent), single locked decision from prior INNOVATE (S3 absent), not a
phase program (S4 absent). This re-validation pass ran as a single deep-mode investigation (direct
git/source verification of every factual claim in the plan, plus a full-repo grep for every
`setBranch` call site) rather than a literal multi-agent fan-out; findings are organized per the
Layer 1 (4 dimensions) + Layer 2 (per-section) structure `vc-validate-findings` specifies.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| conflict-set | Merge produces zero unresolved conflict markers | Fully-Automated | `grep -rl '^<<<<<<<\|^=======\|^>>>>>>>' apps/ packages/` returns empty | B |
| typecheck | Ported cart shape typechecks across all touched/reworked files | Fully-Automated | `pnpm typecheck` exits 0 | B |
| ui-tests | Development's canonical cart UI components + existing UI suite pass against merged fixtures | Fully-Automated | `pnpm --filter @jojopotato/ui test` exits 0 | B |
| api-tests | Backend `POST /orders` contract is provably unaffected | Hybrid | `pnpm --filter @jojopotato/api test` exits 0 — precondition: local Postgres running (`docker compose up -d` + `db:migrate`), per `process/context/tests/all-tests.md` | B |
| e2e-order-flow | Product select → cart → checkout → confirmation works end-to-end against the real backend on the new cart shape | Agent-Probe | Manual walkthrough per Verification Evidence row 5-6 | B |
| coupon-ui-disabled | Coupon input/apply affordance is absent from the rendered cart screen | Agent-Probe | Manual visual check per Verification Evidence row 7 | B |
| branch-switch-no-mix | Switching branches from Home/Branches tab with existing cart items does not silently mix branches | Agent-Probe | Manual walkthrough per Verification Evidence's Finding-F1 row | A — Step 3 fix independently re-verified byte-for-byte correct against real source in this pass |
| branch-switch-product-add-no-mix | Adding a product from a different branch's product-detail screen while the cart holds another branch's items does not silently mix branches | Agent-Probe | Manual walkthrough per Verification Evidence's Finding-F5 row (new this pass) | B — same Step 3 fix protects this call site automatically; new Agent-Probe row added this pass, not yet physically run |
| cart-line-image-gap | Cart line rows render without a product image | Known-Gap | — (accepted, `CartItem` already handles `imageUrl: undefined` gracefully) | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries only the 3 proving strategies
(Fully-Automated / Hybrid / Agent-Probe). Known-Gap is a named residual row (gap-resolution D),
never a strategy that proves a behavior.

Legacy line form (retained so existing validate-contract consumers still parse):
- Merge/typecheck/UI-tests: `Fully-automated: grep conflict-marker check; pnpm typecheck; pnpm --filter @jojopotato/ui test`
- API-tests: `hybrid: pnpm --filter @jojopotato/api test (precondition: local Postgres running via docker compose up -d + db:migrate)`
- End-to-end order flow, coupon-UI-disabled, branch-switch-no-mix (Home/Branches + product-add paths): `agent-probe: manual walkthroughs per Verification Evidence table`
- Cart line product image: `known-gap: documented in Test Infra Improvement Notes, CartItem already handles undefined imageUrl`

Dimension findings:
- Infra fit: PASS — pure client-side type/state reconciliation, no container/infra/proxy/runtime surface touched; re-confirmed all referenced file paths exist on disk (current branch) or on `origin/development` (merge-in additions).
- Test coverage: CONCERN — tier split is appropriate given the confirmed absence of an RN test runner (`process/context/tests/all-tests.md`); reclassified `api-tests` from Fully-Automated to Hybrid this pass (it has a stated local-Postgres precondition per the test context doc — pre-existing repo convention, not unique to this plan, doesn't change any pass/fail outcome); added the Finding F5 Agent-Probe row. Both corrections applied inline this pass — no outstanding action needed before EXECUTE.
- Breaking changes: PASS — Finding F1's `setBranch` fix independently re-verified byte-for-byte against both branches' real source (current branch's `cartReducer` SET_BRANCH clearing behavior vs. development's non-clearing `setBranch`); the fix restores exact parity. Full-repo grep confirms only 3 `setBranch` callers exist anywhere in `apps/mobile/src`, all 3 protected by the hook-level fix. The `optionId`/`id` field-mapping risk was re-checked field-by-field against `packages/api/src/routes/orders.ts`'s zod schema and confirmed correct and type-system-enforced (`useCheckout().placeOrder` is typed `CreateOrderInput`, not `any`).
- Security surface: PASS — no auth/identity/billing/secrets/trust-boundary logic touched.
- Section — Touchpoint 1 (`cart.ts`): PASS — re-confirmed dev's type shapes verbatim via fresh `git show origin/development:packages/types/src/cart.ts`.
- Section — Touchpoint 2 (`use-cart.ts`, Finding F1 fix): PASS — re-verified the fix is present in the plan's Merge Mechanics Step 3 and Implementation Checklist item 3, and is a correct, complete restoration of the current branch's `cartReducer` SET_BRANCH guarantee.
- Section — Touchpoint 3 (`cart.tsx`): PASS — re-read development's actual `cart.tsx` in full; coupon-UI ternary (Gap B), `handleChangeBranch`'s clear-and-confirm `Alert`, and the dev-only `handleAddFromOtherBranch` deletion target all re-confirmed exactly as described.
- Section — Touchpoint 4 (`_layout.tsx`): PASS — re-confirmed exact match against dev's source (both branches read in full this pass), no `initialCart` prop passed.
- Section — Touchpoint 5 (`component-showcase.tsx`): PASS (Finding F3 resolved) — re-confirmed dev's `ORDER_STATUSES` (6 values, `confirmed`/`ready_for_pickup` naming) vs. this branch's real `OrderStatus` type (7 values: `pending`/`accepted`/`preparing`/`flavoring`/`ready`/`completed`/`cancelled`) — plan's instruction to use this branch's 7-value array is correct; `SAMPLE_CART_ITEM` already matches canonical `CartItem` shape verbatim.
- Section — Touchpoint 6 (`mocks.ts`): PASS (Finding F4 resolved) — re-read both branches' `mocks.ts` in full; confirmed exactly ONE `MOCK_BRANCH` fixture in this file on both sides, dev's version drops `estimatedPrepMinutes`/`isAcceptingPickup` (both required on `PickupBranch`), plan's correction is accurate.
- Section — Step 8 (`product/[productId].tsx`, Gap A + Finding F5): CONCERN → resolved inline this pass — `categoryId` owning-category lookup re-verified mechanically sound against the real `menu.data.categories`/`MenuProduct` shape in `apps/mobile/src/features/menu/lib/api-client.ts`; this file is also a third, previously-uncounted `setBranch` call site (Finding F5), now documented (Public Contracts, Blast Radius, Checklist item 15, new Verification Evidence row).
- Section — Step 9 (`checkout.tsx`): PASS — re-confirmed current `checkout.tsx` matches the plan's quoted "before" code exactly; `CartItemOption.id` → `optionId` mapping re-verified against `packages/api/src/routes/orders.ts`'s zod schema (`selectedOptions: z.array(z.object({ optionId: z.string().uuid() }))`) and `useCheckout().placeOrder`'s `CreateOrderInput`-typed signature (not `any`) — compile-time enforced.
- Section — Step 10 (`cart-totals.ts` deletion): PASS — re-confirmed via fresh grep: only `cart.tsx`, `checkout.tsx`, and the file itself reference `cart-totals`/`cartSubtotalCents`/`lineTotalCents`; both consumers are rewritten by Steps 5/9.
- Section — additional `useCart()` consumers (`(tabs)/index.tsx`, `(tabs)/order/index.tsx`, `(tabs)/branches/index.tsx`, and newly `product/[productId].tsx`): PASS for all four once Finding F5's documentation/test additions are applied (done this pass) — `(tabs)/order/index.tsx` remains genuinely unaffected (`itemCount` only); the other three are all `setBranch` callers protected by the Step 3 fix.

Open gaps:
- Finding F5 (CONCERN, resolved inline this pass) — third `setBranch` call site (`product/[productId].tsx`) now documented in Public Contracts/Blast Radius, and agent-probed via new Checklist item 15 / Verification Evidence row. No further plan-text action needed; the new Agent-Probe row must still be physically run during EXECUTE's verification step (not yet run — this is a re-validation of the plan text, not of executed code).
- Finding F1 (FAIL, resolved) — `setBranch` branch-clear regression — fix independently re-verified byte-for-byte correct in this pass. No further action needed before EXECUTE.
- Findings F3, F4 (CONCERN, resolved) — wording corrections confirmed present in current plan text.
- cart-line-image-gap: known-gap: documented as accepted (see Test Infra Improvement Notes) — not a NEW PLAN REQUIRED item, stays within this plan's scope as an accepted cosmetic gap.
- Minor test-tier reclassification: `api-tests` moved from Fully-Automated to Hybrid (stated Postgres precondition) — does not change any pass/fail outcome, purely a tier-labeling correction.

What this coverage does NOT prove:
- `pnpm typecheck` proves structural type correctness only — it does NOT prove the `setBranch`
  clear-on-switch behavior (Finding F1/F5) works at runtime for any of the three call sites; only the
  two branch-switch Agent-Probe rows prove that, and only once actually run during EXECUTE.
- `pnpm --filter @jojopotato/ui test`/`pnpm --filter @jojopotato/api test` prove their respective
  package's own component/route logic — neither proves the cross-package integration seam (mobile
  cart state → API request body) end-to-end; only the Agent-Probe e2e-order-flow row proves that.
- The Agent-Probe rows are manual, single-run walkthroughs, not regression-proof automated
  coverage — a future change could reintroduce Finding F1/F5's class of bug silently, since there is
  still no RN test runner and no automated E2E harness (tracked in Test Infra Improvement Notes and
  the pre-existing repo-wide backlog note).
- None of the gates prove behavior for a 3rd+ branch in the list beyond the cyclic "next branch"
  `handleChangeBranch` rework (Step 5 point 4) — only manually exercised with whatever real branch
  count exists in the seeded/live data at agent-probe time.
- This re-validation pass verified the PLAN's claims against real source; it did not execute any
  merge or code change. The gate commands and Agent-Probe scenarios listed above have not yet been
  physically run — that happens during EXECUTE/EVL, not during this VALIDATE pass.

Gate: PASS (0 unresolved FAILs, 0 unresolved CONCERNs — Finding F5 resolved inline this pass; Findings F1/F3/F4 from the prior pass all independently re-confirmed resolved)
Accepted by: session (re-validation pass, 13-07-26) — Finding F5 (CONCERN) resolved via inline plan-text correction (Public Contracts, Blast Radius, Checklist item 15, new Verification Evidence row); no separate user acceptance required since no residual gap remains open. Prior BLOCKED gate (Finding F1) is superseded — fix independently re-verified correct against real source in this pass.

## Deviations (recorded at EXECUTE, 13-07-26)

- **component-showcase.tsx — restored `estimatedPrepMinutes`/`isAcceptingPickup` on BOTH `SAMPLE_BRANCH` (20/true) and `SAMPLE_BRANCH_CLOSED` (25/false) fixtures.** Merge Mechanics Step 6 explicitly named only the `ORDER_STATUSES` edit for this file; taking development's version verbatim dropped these two required `PickupBranch` fields, so `pnpm typecheck` failed with TS2739 on both fixtures until restored. **Impact:** none beyond intended — this is the same class of edit as Step 7's `mocks.ts` fixture restore (both fields are non-optional on `PickupBranch`), within the already-touched Touchpoint-5 file, and the F4 note already documented that this two-branch demo carries `20/25` + `true/false` values. No hard-stop class (no auth/billing/schema/API/deploy/secrets). Documented per within-blast-radius deviation rule; the values used are exactly this branch's prior HEAD values.

## Autonomous Goal Block

SESSION GOAL: Merge origin/development's CART-001 mock cart into this branch, keeping development's Cart/CartItem/CartSessionProvider model canonical while porting this branch's real branch/menu/order backend wiring onto it, with zero silent regressions of the already-EVL-verified order-placement flow.
Charter + umbrella plan: N/A — single plan (no phase-program umbrella exists for this task)
Autonomy: Standard /goal autonomous execution rules apply (process/development-protocols/orchestration.md §Autonomous /goal Phase Program Execution) — CONDITIONAL concerns may be applied and proceeded past; irreversible/outward-facing actions still hard-stop.
Hard stop conditions / safety constraints:
- Do not treat `pnpm typecheck`/`pnpm test` passing as sufficient proof of completion — the Agent-Probe rows (branch-switch-no-mix via Home/Branches tab, AND the new branch-switch-product-add-no-mix via the product-detail screen) must be manually exercised per Phase Completion Rules before this plan is VERIFIED, not just CODE DONE.
- No `packages/api/**` changes are in scope for this plan — if EXECUTE discovers a real need to touch the API, stop and return to PLAN/INNOVATE rather than expanding scope silently.
- If `git merge origin/development` produces a conflict set different from the 6 listed files, STOP and re-diff with `git merge-tree` before resolving anything — upstream may have moved since this plan was validated.
- Preserve the `setBranch(branchId)`-then-`addItem(...)` ordering in Step 8's rework (`product/[productId].tsx`) — this ordering is load-bearing for Finding F5's invariant, not incidental.
Next phase: EXECUTE — this plan is cleared (Gate: PASS, re-validated 13-07-26).
Validate contract: inline in this plan file (`## Validate Contract` section above) — Gate: PASS.
Execute start: `git fetch origin development && git merge origin/development` (expect 6 conflicts, re-confirmed 13-07-26), then Merge Mechanics Steps 2-10 in order, then `pnpm typecheck && pnpm --filter @jojopotato/ui test && pnpm --filter @jojopotato/api test` (precondition: local Postgres running) | Agent-Probe: product→cart→checkout→confirmation walkthrough + coupon-UI-absent check + branch-switch-no-mix (Home/Branches tab) + branch-switch-product-add-no-mix (product-detail screen, new) | high-risk pack: no (no auth/billing/schema/API/deploy/secrets surface).
