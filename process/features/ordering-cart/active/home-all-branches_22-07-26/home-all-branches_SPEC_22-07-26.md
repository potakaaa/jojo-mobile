---
name: spec:home-all-branches
description: "Home tab shows products from ALL branches (deduped, subtext-labeled), never a dead-end empty state"
date: 22-07-26
feature: ordering-cart
---

# SPEC — Home Tab Shows All-Branch Products

## Summary

Today, the Home tab only shows products carried by whichever branch is currently selected. If that
branch has no items, Home shows "Menu coming soon — This branch has no items available right now"
and every deal card reads "Unavailable at this branch" — even though other branches may have those
exact same products in stock right now. This reads as broken. This change makes Home show products
from every branch at once, with a small caption on each card saying which branch(es) carry it, so
the customer always sees something real to order. Tapping a product from a branch other than the
one currently selected offers to switch pickup branch first — never a silent switch, never a dead
click.

## User Stories / Jobs To Be Done

- As a customer opening the Home tab, I want to see products from ALL branches (not just my
  currently-selected one), so that I'm never shown an empty "coming soon" screen when other
  branches have items ready to order.
- As a customer browsing Home, I want each product card to show which branch (or how many
  branches) carries it, so I know what I'm looking at before I tap in.
- As a customer, I want to see only ONE card per product (not one per branch), so the grid doesn't
  look duplicated or cluttered.
- As a customer who taps a product from a branch that isn't my current pickup branch, I want to be
  asked to confirm the switch (and be told what happens to my cart) before it happens, so I'm never
  surprised by a branch change or a lost cart.
- As a customer browsing the Deals strip (Home) or the Deals tab, I want the same all-branch,
  never-"unavailable" treatment, so deals don't look broken either.

## What The User Wants (Behavioral Outcomes)

- Home's product grid lists every active product across every branch, deduplicated to one card per
  product.
- Each card shows a small subtext: the single carrying branch's name when only one branch carries
  it, or "Available at N branches" when more than one does.
- The category filter chips still work, now filtering across the merged all-branch product list
  (categories are shared/global across branches, so no reconciliation is needed there).
- A branch with zero products no longer produces the "Menu coming soon" dead end on Home — the grid
  always reflects the full catalog, regardless of which branch happens to be selected.
- Tapping a product card that is NOT carried by the currently-selected branch shows a confirmation
  ("This is from {branch name}. Switch your pickup branch?") before doing anything. Confirming:
  switches the selected pickup branch, and if the cart already has items from a different branch,
  clears the cart first (mirroring the existing add-to-cart branch-switch behavior on Product
  Details) — then proceeds to open Product Details for the tapped product, now resolvable because
  the branch has already switched. Cancelling leaves everything unchanged and nothing navigates.
- Tapping a product card that IS carried by the currently-selected branch opens Product Details
  immediately, exactly as today — no confirmation, no behavior change.
- The Home Deals strip shows every active deal across every branch; no deal card ever reads
  "Unavailable at this branch" as a Home-tab dead end. Each deal card gets the same
  branch-count/branch-name subtext treatment as regular products.
- The Deals tab (`(tabs)/deals/index.tsx`) gets the identical all-branch, subtext-labeled,
  never-"unavailable" treatment, since it renders through the same deal-product data and card
  component as the Home strip.
- Deal tapping follows the same switch-then-navigate flow as regular products (L4): the branch
  switch confirmation (when relevant) resolves before entering Deal Details.

## Flow / State Diagram

```
Home tab mounts
   |
   v
Load ALL-branch product catalog (merged/deduped) ---- one card per product,
   |                                                    subtext = branch name(s)
   v
Customer taps a product card
   |
   v
Is this product carried by the currently-selected branch?
   |                                   |
  YES                                  NO
   |                                   |
   v                                   v
Open Product Details            Show ConfirmDialog:
immediately (no dialog,         "This is from {branch}.
unchanged today)                 Switch your pickup branch?"
                                        |
                        +---------------+----------------+
                        |                                |
                     Cancel                           Confirm
                        |                                |
                        v                                v
                 Nothing changes.               Does the cart already
                 Stay on Home.                   hold items from a
                                                  different branch?
                                                        |
                                        +---------------+---------------+
                                        |                               |
                                       YES                              NO
                                        |                               |
                                        v                               v
                                Clear cart, then                  Just switch
                                switch selected                   selected branch
                                branch                                  |
                                        |                               |
                                        +---------------+---------------+
                                                        |
                                                        v
                                        Branch is now switched.
                                        Open Product Details for the
                                        tapped product (now resolves
                                        against the new branch's menu).

Same shape applies to: Home Deals strip tap -> Deal Details,
                        Deals tab card tap -> Deal Details.
```

## Acceptance Criteria (Testable Outcomes)

1. **AC1 — All-branch merge, deduped.** Home's product grid shows one card per distinct product
   across the full active catalog, regardless of which branch is currently selected, even when the
   selected branch carries zero products.
   proven by: new pure unit tests for the merge/dedup derivation (mirrors the existing
   `filter-products-by-category.ts` TDD pattern — a real test that fails if dedup or merge logic
   regresses to a passthrough or a per-branch duplicate).
   strategy: Fully-Automated

2. **AC2 — Branch-count subtext, single branch.** When a product is carried by exactly one branch,
   its card subtext shows that branch's name.
   proven by: unit test on the subtext-formatting derivation.
   strategy: Fully-Automated

3. **AC3 — Branch-count subtext, multiple branches.** When a product is carried by 2+ branches, its
   card subtext reads "Available at N branches" (N = the real count).
   proven by: unit test on the subtext-formatting derivation.
   strategy: Fully-Automated

4. **AC4 — No dead "Menu coming soon" state.** With a branch selected that itself carries zero
   products, Home's product grid still renders the full all-branch catalog — the "Menu coming soon"
   empty state defined in this SPEC's scope no longer fires for that reason. (A genuine
   zero-products-in-the-whole-catalog state, e.g. no active products anywhere, is a separate,
   still-valid empty state — out of scope to redesign here.)
   proven by: unit/component test asserting the grid renders products when the selected branch's
   own menu is empty but other branches carry items.
   strategy: Fully-Automated

5. **AC5 — Same-branch tap opens directly.** Tapping a product card carried by the currently
   selected branch opens Product Details immediately, with no confirmation dialog — unchanged from
   today's behavior.
   proven by: component test asserting no dialog renders and navigation fires directly for a
   same-branch product tap.
   strategy: Hybrid

6. **AC6 — Cross-branch tap shows confirmation, cancel is a no-op.** Tapping a product card carried
   by a branch other than the currently selected one shows a confirm dialog naming that branch.
   Cancelling leaves the selected branch, the cart, and the current screen unchanged — no
   navigation occurs.
   proven by: component test asserting the dialog appears with the correct branch name and that
   cancel results in zero branch/cart/navigation mutation.
   strategy: Hybrid

7. **AC7 — Cross-branch tap, confirm switches and navigates.** Confirming the cross-branch dialog
   switches the selected pickup branch, clears the cart first if it held items from a different
   branch (matching the existing Product Details add-to-cart branch-switch precedent), and then
   opens Product Details for the tapped product — which resolves successfully because the branch
   has already switched before navigation (per the locked ordering decision, L4).
   proven by: component test asserting branch switch, conditional cart clear, and navigation all
   fire in the confirmed order.
   strategy: Hybrid

8. **AC8 — Deals strip is never "unavailable."** On Home, the deals strip renders every active deal
   across all branches; no deal card shows the "Unavailable at this branch" badge as a result of the
   currently-selected branch's own availability. Each deal card shows the same branch-name /
   "Available at N branches" subtext as regular products.
   proven by: component test on the Home deals strip asserting no card renders in the unavailable
   state purely due to branch mismatch, and that subtext reflects the real carrying-branch count.
   strategy: Hybrid

9. **AC9 — Deals tab matches.** The Deals tab (`(tabs)/deals/index.tsx`) renders the same all-branch,
   subtext-labeled, never-"unavailable"-due-to-branch-mismatch treatment as the Home strip, since
   both consume the same deal-product data and card component.
   proven by: component test on the Deals tab asserting the same behavior as AC8.
   strategy: Hybrid

10. **AC10 — Category filter still works post-merge.** Selecting a category chip on Home filters the
    merged all-branch product list to that category; categories are global/shared across branches so
    no per-branch reconciliation is needed.
    proven by: unit test asserting the category filter derivation operates correctly against the
    merged (not per-branch) product list.
    strategy: Fully-Automated

11. **AC11 — Cross-branch order placement remains impossible.** Nothing in this change allows a
    customer to place an order mixing products from two branches — server-side validation in
    `POST /orders` (unchanged by this SPEC) continues to reject any line not available at the
    order's branch. This is a non-regression guarantee, not new UI.
    proven by: existing `packages/api` order-placement branch-availability test coverage (unchanged,
    re-run as a regression check — no new test required, since no server behavior changes).
    strategy: Fully-Automated

12. **AC12 — On-device visual/interaction walkthrough.** Real-device confirmation that: the merged
    grid renders correctly in light and dark mode, the confirm-dialog copy reads naturally, the
    branch-switch-then-navigate flow lands cleanly on Product Details with no flash of "not
    available," and the Deals strip/tab read correctly with the new subtext.
    proven by: user-run Agent-Probe walkthrough — this app has no RN E2E/navigation runner
    (standing, already-documented project-wide gap; not new debt).
    strategy: Agent-Probe

## Out Of Scope

- Choosing HOW the all-branch product data is fetched (a new aggregate API route vs. client-side
  fan-out across branches, etc.) — that is an INNOVATE/PLAN decision, not a SPEC decision.
- Any change to `POST /orders` or server-side order placement validation (already correctly
  branch-scoped and unaffected by this change — see AC11).
- Product Details itself becoming all-branch-aware (e.g. showing which branches carry the product,
  or letting the customer pick a branch from inside Product Details). Product Details stays
  branch-scoped exactly as today; L4's switch-before-navigate ordering is precisely what keeps this
  screen's data layer untouched.
- Making the "Available at N branches" subtext interactive (tappable to see/filter by which
  branches) — informational-only for this pass.
- Redesigning the "no products in the entire catalog" empty state (a real state, distinct from the
  "this branch alone is empty" state this SPEC eliminates) — it is unchanged and still valid.
- Any change to the Order tab's branch-scoped menu browsing (`(tabs)/order/index.tsx`) — that
  screen remains intentionally single-branch, since it is where the customer commits to ordering
  from their selected branch. Only Home (browse/discovery) and the Deals surfaces change.
- Migrating any remaining `Alert.alert` usage elsewhere in the app — this SPEC only requires that
  NEW confirmation UI added here use `ConfirmDialog`/`Toast`, consistent with the in-flight
  `mobile-alert-toast-consistency` migration; it does not touch that plan's existing scope.
- Adding automated coverage for on-device navigation/gesture timing — remains Agent-Probe per the
  standing project-wide gap (see AC12); not a scope item to "fix" here.

## Constraints

- **L1 (locked):** Exactly one card per product, deduplicated across branches. Subtext = branch
  name when carried by exactly one branch; "Available at N branches" when carried by 2+.
- **L2 (locked):** Tapping a product not carried by the currently-selected branch triggers a
  confirm-then-switch flow (never silent, never merely browse-only/inert).
- **L3 (locked):** The Home deals strip is in scope — no card on Home may read "Unavailable at this
  branch" as a result of this change.
- **L4 (locked):** The branch switch must complete BEFORE navigating to Product Details. Reason:
  `useNavigateToProduct` accepts an optional `branchId` param, but `(tabs)/product/index.tsx` never
  reads route params for branch resolution — it resolves the product from `useMenu()`'s
  currently-selected-branch cache. Switching first (not passing branchId through) keeps Product
  Details' data layer completely untouched by this SPEC.
- **L5 (locked):** The Deals tab (`(tabs)/deals/index.tsx`) is in scope by construction — it shares
  `useDealProducts()` and `DealCard` with the Home strip, so the presentation change applies to both
  automatically.
- **L6 (locked):** Any new confirmation/toast UI in this feature must reuse `packages/ui`'s existing
  `ConfirmDialog` and `Toast` primitives (the same pattern already used by
  `(tabs)/product/index.tsx`'s existing add-to-cart branch-switch flow). Do NOT use React Native's
  `Alert.alert` — a repo-wide migration away from it is already in flight
  (`process/general-plans/active/mobile-alert-toast-consistency_17-07-26/`).
- Server-side order placement (`POST /orders`) already rejects any line unavailable at the order's
  branch — this SPEC must not weaken that boundary (see AC11).
- All new/changed `packages/ui` components must take a required `mode: ThemeMode` prop (no
  default) and pass the `guard:theme-mode` script — this repo's universal theming convention.
- Categories are global rows (no `branch_id`) — category ids are already stable across branches, so
  the merged category filter (AC10) needs no per-branch reconciliation logic.
- Test tiers, per the repo's established convention: pure derivations (dedup, subtext formatting,
  category filter over the merged list) get real Fully-Automated vitest coverage; confirm-dialog
  wiring and screen composition get Hybrid jest-expo component tests; on-device tap→switch→land
  timing is Agent-Probe only (standing project-wide no-RN-E2E-runner gap — do not treat as new
  debt, do not file a new backlog note for it).

## Open Questions

**All resolved this pass — none open.**

- *Does the "Available at N branches" subtext link or filter to those branches?* — Resolved:
  informational-only for this pass. Recorded under Out Of Scope.
- *Does Product Details itself show all-branch availability?* — Resolved: no, it stays
  branch-scoped exactly as today. L4's switch-before-navigate ordering makes this unnecessary.
  Recorded under Out Of Scope.
- *What is the current seed/dev branch count, for INNOVATE to judge fan-out cost?* — Resolved: 4
  seeded branches (`packages/api/src/db/seed/data.ts`): Jojo Potato - Cogon, Jojo Potato - Centrio,
  Jojo Potato - SM Downtown, Jojo Potato - Limketkai. Recorded under Background below.

## Background / Research Findings

- **Deals half is already mostly built (DEAL-004).** `GET /deals/products` (`packages/api/src/
  routes/deals-products.ts`) already returns every active deal-product across ALL branches in one
  call, "flag-not-hide": when a `branchId` is passed, each deal carries `available: boolean` (true =
  every component fulfillable at that branch) but is never dropped from the list. `useDealProducts()`
  and the Home deals strip already consume this route today — the strip's current
  "Unavailable at this branch" badge (`packages/ui/src/components/deal-card.tsx`, `available===false`
  → dimmed card + badge) is exactly the presentation this SPEC's L3 requires removing/replacing with
  the branch-count subtext. **`available` is a single boolean, not a branch list or count** — so
  rendering "Available at N branches" for deals needs either (a) a new field on this route's response
  carrying the real carrying-branch set/count, or (b) a client-side reconciliation against a
  separately-fetched all-branch-availability signal. This SPEC deliberately does NOT choose between
  these — it is an INNOVATE/PLAN decision — but AC3/AC8 require the real count to be correct, not a
  boolean-derived stand-in.
- **Regular products have no equivalent all-branch route.** `GET /branches/:branchId/menu` INNER
  JOINs `branch_product_availability` scoped to exactly one branch — a product not available there is
  hidden entirely, not flagged. Achieving AC1 (all-branch merge) for regular products therefore
  requires either a new aggregate route (mirroring `GET /deals/products`'s shape) or a client-side
  fan-out across the known branch list. This SPEC states the outcome only; INNOVATE picks the
  mechanism.
- **Categories are global.** `packages/api/src/db/schema/categories.ts` has no `branch_id` column —
  category ids are stable across every branch, so AC10 (category filter over the merged list) needs
  no id-reconciliation step.
- **Server-side placement guard already exists and is untouched.** `POST /orders` validates every
  line against `branch_product_availability` for the order's `branchId` inside the placement
  transaction — a cross-branch cart can never place today, and nothing in this SPEC changes that
  (AC11).
- **The confirm-then-switch pattern already exists once in this codebase** —
  `(tabs)/product/index.tsx`'s `handleAdd`/`confirmBranchSwitch`, triggered when the customer tries
  to add-to-cart a product from a different branch than the one already in their cart: shows
  `ConfirmDialog variant="destructive"` → on confirm, `clearCart()` + `setBranch()` + `addItem()` +
  a `Toast`. L2 introduces a NEW trigger point (tapping a Home/Deals card, before Product Details
  even opens) for this SAME underlying pattern — not a new pattern. Existing regression tests for
  the current pattern: `apps/mobile/src/features/cart/__tests__/cart-branch-switch.test.tsx`,
  `apps/mobile/src/features/menu/__tests__/product-branch-switch.test.tsx`.
- **`ProductCard` (`packages/ui/src/components/product-card.tsx`) has no subtext/caption slot** —
  props today are `product`, `imageSource?`, `onPress?`, `mode`. AC2/AC3's subtext needs either a new
  optional prop on `ProductCard` (preferred, per this repo's "extend packages/ui before building a
  local one-off" convention) or a Home-local wrapper component. INNOVATE/PLAN decision, not fixed
  here.
- **`useNavigateToProduct()` already accepts an optional `branchId` param** but
  `(tabs)/product/index.tsx` never reads it for data resolution — Product Details resolves the
  product from `useMenu()`'s cache for whichever branch is CURRENTLY selected at render time. This
  is the concrete mechanism behind L4: passing `branchId` through navigation would not work without
  also rewiring Product Details' data layer, so switching the branch first (leaving Product Details
  untouched) is the required ordering, not merely a style preference.
- **`mode: ThemeMode` is a required prop, no default, on all 27+ `packages/ui` themed components** —
  any new/changed component in this feature must follow that convention and pass
  `guard:theme-mode` (`apps/mobile/scripts/check-theme-mode.mjs`).
- **Test tier precedent:** pure derivation logic (e.g. `filter-products-by-category.ts`) gets real
  TDD-first Fully-Automated vitest coverage in this repo (proven non-vacuous — breaking the logic
  turns real tests red); confirm-dialog wiring and screen composition get Hybrid jest-expo component
  tests (`test-utils/render.tsx` + `jest-setup.ts` fixtures); on-device tap→navigate timing is
  Agent-Probe only — a standing, already-documented project-wide gap
  (`process/context/tests/all-tests.md` §Known Gaps: no Detox/Maestro/Playwright runner exists) —
  this SPEC does not add new debt by naming AC12 Agent-Probe.
- **Seed/dev branch count (for INNOVATE's fan-out cost judgment):** 4 branches in
  `packages/api/src/db/seed/data.ts`: Jojo Potato - Cogon, Jojo Potato - Centrio, Jojo Potato -
  SM Downtown, Jojo Potato - Limketkai (plus one seeded closed/demo branch excluded from
  `GET /api/branches`).
- **User's stated trigger for this request:** with a branch selected that carries no items, Home
  today renders "Menu coming soon — This branch has no items available right now" and the deals
  strip shows cards stamped "Unavailable at this branch" — considered broken by the user, since
  other branches may carry the exact same products right now.
