---
name: plan:kid-friendly-ui-deals-unification
description: "Phase A kid-friendly UI/UX pass (packages/ui + apps/mobile only) then Phase B deals-model unification (mobile browse repoints to admin is_deal/deal_components model; STAR-004 coupon-apply untouched)"
date: 16-07-26
feature: general
---

# PLAN: Kid-Friendly Mobile UI + Deals Model Unification

**Date**: 16-07-26
**Status**: DRAFT — pending VALIDATE
**Complexity**: COMPLEX (2 phases, single task folder, no umbrella/charter — under the 3-phase
phase-program threshold)

## Overview

Two-phase program per the locked SPEC (`kid-friendly-ui-deals-unification_SPEC_16-07-26.md`,
same task folder). Phase A is a presentational-only kid-friendly UI/UX pass across
`packages/ui` + `apps/mobile` (bigger touch targets/text, calmer Home screen hierarchy, a new
shared `ConfirmDialog` replacing destructive `Alert.alert()` calls, and a restyled — not
behaviorally changed — checkout auto-submit countdown). Phase B unifies the mobile-facing "Deals"
data source onto the admin-managed `products.is_deal` + `deal_components` model (extending the
existing `?isDeal=true` menu route) while leaving STAR-004's static-catalog coupon-apply flow and
the dormant old `deals` table completely untouched. Phase A must be validated (ideally committed)
before Phase B EXECUTE begins — see each phase's Resume and Execution Handoff section.

Read `process/context/all-context.md` and `process/context/tests/all-tests.md` before EXECUTE for
this repo's runner/test conventions (vitest in `packages/api`/`apps/mobile`, jest-expo in
`packages/ui`).

## Phase Completion Rules

- Phase A is `CODE DONE` when all Touchpoints (Phase A) items are implemented and all
  Fully-Automated/Hybrid gates in Verification Evidence (Phase A) are green; it is `VERIFIED`
  only once the Agent-Probe items (AC-A3, AC-A4 copy/visual check, AC-A6 countdown legibility,
  AC-A7 token-literal diff review) have also been performed and the user has confirmed the visual
  result.
- Phase B is `CODE DONE` when all Touchpoints (Phase B) items are implemented and all Phase B
  Verification Evidence gates (all Fully-Automated for this phase) are green — no Agent-Probe
  gate blocks Phase B `VERIFIED`.
- Neither phase may be marked `✅ VERIFIED` without both its own evidence and a clean re-run of its
  Non-Regression Requirements list.

## Acceptance Criteria

This plan implements the locked SPEC's acceptance criteria verbatim — see
`kid-friendly-ui-deals-unification_SPEC_16-07-26.md` §Acceptance Criteria for the full text of
AC-A1 through AC-A7 (Phase A) and AC-B1 through AC-B6 (Phase B). Each is mapped to a concrete gate
in this plan's Verification Evidence (Phase A) / Verification Evidence (Phase B) tables below —
no criterion is left unmapped.

## Implementation Checklist

See the Touchpoints (Phase A) and Touchpoints (Phase B) tables below for the full atomic,
file-by-file checklist (this program's phased delivery plan — Phase A fully precedes Phase B).

Locked SPEC: `kid-friendly-ui-deals-unification_SPEC_16-07-26.md` (same folder). This plan
implements both phases; Phase A must complete (ideally validated + committed) before Phase B
EXECUTE begins, per SPEC Constraints/Q3.

Complexity: **COMPLEX** (2 phases, one task folder, no umbrella/charter needed — under the
3-phase phase-program threshold).

---

## Phase A — Kid-Friendly UI/UX

### Phase A — Scope Lock (from INNOVATE, verbatim)

1. Raise `TypeScale`/`Button`/touch-target values in `packages/ui/src/theme.ts` +
   `packages/ui/src/components/button.tsx` in place. Add ONE new explicit token concept
   (`MinTouchTarget = 48`) as a flagged, documented addition to the locked token table — not a
   reopening of `jojopotato-design-system_08-07-26`.
   - **Decision (open item resolved):** `Button`'s `sm` size (used e.g. by checkout's "Change"
     action) IS treated as interactive, not decorative → raised to the 48px floor too.
2. Home screen (`(tabs)/index.tsx`): visual-hierarchy-only reorder/resize. Same 6 sections, same
   order. No collapse/tabs/new IA.
3. New shared `packages/ui` `ConfirmDialog` component. Phased highest-risk-first:
   customer-facing destructive call sites in scope this phase; `(staff)/order-detail/[orderId].tsx`
   is explicitly DEFERRED (staff aren't the "kid" audience) — tracked as a backlog item, not silently
   dropped.
4. Checkout countdown: **RESTYLE ONLY** — extend 5s → 10s, large progress ring/bar + color-coded
   urgency + bigger "Modify" button. Auto-submit-on-timeout behavior is UNCHANGED (SPEC Q1 locked
   default). MUST use plain state-driven animation (`Animated.timing` / interpolated
   width/opacity or a manual `useEffect` tick) — NOT reanimated `Entering`/`Exiting`/`Layout`
   props — to stay Fully-Automated-testable and sidestep the reanimated jest-mock gap. If this
   turns out to be infeasible without reanimated layout primitives, STOP and flag before writing
   code (contingency, not silent fallback).
5. Bounded extras folded into the above items (not separate checklist sections): `Button`'s
   `iconName ? <Ionicons name={iconName} size={20} .../>` glyph size bump; a contrast-value
   verification pass (no new hex values) on existing neutral-text-on-cream combos; flavor/size
   option-selector chip touch-target bump only.
6. Zero changes to `packages/api`, `packages/types` business logic, schema, navigation structure,
   or screen count/order (SPEC Constraints, Out of Scope).

## Touchpoints (Phase A)

| File | Change |
|---|---|
| `packages/ui/src/theme.ts` | Add `MinTouchTarget = 48` token (flagged new addition to the locked table); raise `TypeScale.bodySmall`/`caption` per AC-A2 floor (14px is already the floor — verify no informational text below it; raise only what's currently below 14px in touched components; do not blanket-rewrite `TypeScale` values that already satisfy AC-A2). |
| `packages/ui/src/components/button.tsx` | Raise `buttonSm`/`labelSm` padding + `styles.button` `paddingVertical`/`paddingHorizontal` so both `md` and `sm` sizes meet the 48px floor including border; bump `Ionicons` icon `size={20}` → confirm/raise per extras item 5. |
| `packages/ui/src/components/confirm-dialog.tsx` (NEW) | New shared plain-language confirmation component: title, body, two labeled actions (`confirmLabel`/`cancelLabel`), `mode: ThemeMode`, `variant?: 'default' | 'destructive'` for the confirm button's color. Built on RN's core `Modal`/`Pressable` primitives — do NOT add a new dependency. **Correction at VALIDATE:** `Modal` has no existing precedent inside `packages/ui` today (grep-verified: zero usages); `apps/mobile` has exactly one prior `Modal` usage (`(tabs)/rewards/index.tsx`, a different package). This will be the first `Modal` usage in `packages/ui` — RN's `Modal` is a core built-in with no known jest-expo compatibility issue, so this does not block feasibility, but the plan's original "already used elsewhere in packages/ui" claim was inaccurate. |
| `packages/ui/src/components/__tests__/confirm-dialog.test.tsx` (NEW) | New jest-expo test: renders title/body, both actions call the correct callback, dismiss-on-cancel does not call confirm. |
| `packages/ui/src/index.ts` | Export `ConfirmDialog` (+ its prop type). |
| `apps/mobile/src/app/(tabs)/index.tsx` | Home screen: re-order/resize existing 6 sections for visual hierarchy per SPEC AC-A3 diagram (active-order + branch card visually dominant; promo/rewards/deals/menu grid shrink in size/spacing/weight). No render-tree restructuring, no conditional collapse logic. |
| `apps/mobile/src/app/(tabs)/order/cart.tsx` | **CORRECTED at VALIDATE (grep-verified, no "Clear cart" alert exists):** replace the file's 2 real destructive (2-button) `Alert.alert()` calls with `ConfirmDialog` — "Replace applied discount?" (Cancel/Replace) and "Change branch?" (Cancel/Change & clear). The other 3 `Alert.alert()` calls in this file ("Deal removed", "Cart updated", "Cannot apply code") are single-button informational notices — leave as plain `Alert.alert()`, out of AC-A4's scope. |
| `apps/mobile/src/app/(tabs)/branches/[branchId].tsx` | **CORRECTED at VALIDATE:** this file's only `Alert.alert()` ("Could not open maps") is a single-button informational notice, not a destructive confirm — **no ConfirmDialog work applies to this file in Phase A.** The real branch-switch destructive confirms live in `order/cart.tsx` (`handleChangeBranch` — see corrected row above) and `order/product/[productId].tsx` (see row below). Remove this row from the executed checklist unless a genuinely destructive alert is found here during EXECUTE re-grep. |
| `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` | **CORRECTED at VALIDATE:** both `Alert.alert()` calls in this file ("Cannot apply deal", "Coming soon") are single-button informational notices, not destructive confirms — **no ConfirmDialog work applies to this file in Phase A.** Reorder-conflict is a separate inline-row UI (`useReorderConflicts`, rendered in `order/cart.tsx`), not an `Alert.alert()` here. Remove this row from the executed checklist; note Phase B rewrites this screen's data model entirely regardless. |
| `apps/mobile/src/app/(tabs)/order/product/[productId].tsx` | Replace destructive `Alert.alert()` call (if one blocks a real user action — confirm exact call site during EXECUTE) with `ConfirmDialog`. |
| `apps/mobile/src/features/orders/hooks/use-reorder.ts` | **CORRECTED at VALIDATE:** this file's only `Alert.alert()` ("Couldn't reorder") is a single-button error notice, not a destructive confirm — **no ConfirmDialog work applies to this file in Phase A.** No destructive reorder-conflict alert exists anywhere in the codebase (conflicts are shown as inline rows, not a dialog). Remove this row from the executed checklist. |
| `apps/mobile/src/app/(tabs)/account/index.tsx` (customer sign-out) | **CORRECTED at VALIDATE (grep-verified):** sign-out currently has **no `Alert.alert()` confirmation at all** (plain `Button onPress={signOut}`) — this checklist item is an intentional NEW addition of a confirm gate (consistent with AC-A4's SPEC-named example "sign out"), not a restyle of an existing dialog. Gate the existing `signOut` call behind `ConfirmDialog`. Staff sign-out (`(staff)/index.tsx`) is explicitly OUT of scope this phase (staff aren't the "kid" audience, mirrors the order-detail deferral). |
| `apps/mobile/src/features/auth/__tests__/account-screen.test.tsx` (NEW touchpoint, found at VALIDATE) | **MUST update** the existing `'fires signOut when Log out is pressed'` test (line 70-77) — pressing "Log out" now opens `ConfirmDialog` first; update the test to press through the dialog's confirm action and still assert `signOut` was called, plus add a case asserting `signOut` is NOT called when cancel is pressed. This test was NOT in the original Touchpoints list and would otherwise silently break. |
| `apps/mobile/src/app/(staff)/order-detail/[orderId].tsx` | **NO CHANGE this phase** — explicitly deferred per scope lock item 3. Add a one-line backlog note only if not already tracked. |
| `apps/mobile/src/app/(tabs)/order/checkout.tsx` | Restyle auto-submit countdown: extend timer constant 5000ms → 10000ms; replace small text countdown with a large progress ring/bar (plain `Animated.timing` driving a width/scale interpolation — NOT `FadeIn`/`SlideInDown`/reanimated layout props); color-coded urgency (e.g. green→amber→red as time runs out); bigger "Modify (Ns)" button using the raised `Button` `sm`/`md` sizes. No change to the underlying state machine that triggers submission at 0. |
| `apps/mobile/src/features/menu/components/option-group-selector.tsx` (or wherever flavor/size chip selectors render — confirm exact file at EXECUTE time) | Touch-target bump only on chip rows (padding/minHeight), no flow change. |

## Public Contracts (Phase A)

- New export: `ConfirmDialog` from `@jojopotato/ui` (new public prop shape, additive — no
  existing export signature changes).
- New token: `MinTouchTarget` from `packages/ui/src/theme.ts` (additive export).
- No API/schema/route contract changes (SPEC-locked constraint).
- `Button` prop shape unchanged (no new required props); internal style constants change only.

## Blast Radius (Phase A)

- **Packages touched:** `packages/ui` (theme + button + new component + index export),
  `apps/mobile` (Home screen, 4-6 screens' `Alert.alert()` call sites, checkout screen, option
  selector chips).
- **File count estimate:** ~10-12 files (1 theme, 1 button, 1 new component + 1 new test, 1 index
  export, 1 Home screen, 4-6 `Alert.alert()` replacement call sites, 1 checkout screen, 1 option
  selector). Under 15 — MEDIUM blast radius, no schema/API/auth surface.
- **Risk class:** none of the SPEC's high-risk classes (no auth/billing/schema/API/migration
  surface) — this is a presentational-layer-only change per the Constraints.
- **No packages/api, packages/types business-logic, or navigation-structure files touched.**
- **Corrected at VALIDATE — true shared-token consumer counts (breaking-change dimension):**
  `TypeScale` is imported by 68 files across all of `packages/ui`'s components plus nearly the entire
  `apps/mobile` screen tree (grep-verified) — far beyond this section's "~10-12 files" framing.
  `Button` is consumed by 27 files, similarly wider. This is NOT a blocker for `Button`/`MinTouchTarget`
  changes: they are in-place style/padding adjustments with an unchanged public prop contract, so every
  consumer benefits automatically with zero code change — the "~10-12 files" count refers only to
  files AUTHORED/edited this phase, not files affected by the visual result. It IS a real constraint for
  `TypeScale`: **EXECUTE MUST NOT change the raw `TypeScale.bodySmall`/`caption` values in `theme.ts`**
  (they already satisfy AC-A2 once the "decorative/very-low-priority text" exemption is applied) — any
  AC-A2 violation found in a touched component must be fixed by correcting which `TypeScale` key that
  component's literal references, never by lowering the shared constant, since a constant change would
  silently reflow all 68 consumers with zero test coverage protecting against layout regressions.

### Phase A — Non-Regression Requirements (must stay green)

- All 23 existing `packages/ui` jest-expo component tests (corrected count at VALIDATE, was stated as
  21 — `find packages/ui/src -name "*.test.*"` confirms 23) — unchanged behavior for every component
  except `Button`, whose visual output changes but public prop contract does not. **Zero snapshot tests
  exist in this package (grep-verified) — no hardcoded-pixel/snapshot regression risk from the
  touch-target/typography bump.**
- All 8 existing `apps/mobile` jest/vitest test files (corrected count at VALIDATE, was stated as 4 —
  `find apps/mobile/src -name "*.test.*"` confirms 8: `floating-tab-bar.helpers`,
  `account-edit-profile-screen`, `account-screen`, `birthday`, `branches-screen`, `menu-to-home-view`,
  `notification-factory`, `runner-smoke`). None are dedicated cart/checkout render tests (no such file
  exists), so AC-A5's "ordering/cart/checkout" framing is largely a typecheck/lint/logic-test
  guarantee for this phase, not a render-level one — do not delete or weaken any assertion; if a
  snapshot must change because of the deliberate visual change, update it explicitly and note it in
  the EXECUTE report (moot this phase: zero snapshot tests exist, grep-verified).
  `account-screen.test.tsx` requires an update per the corrected sign-out touchpoint row above.
- `pnpm --filter @jojopotato/mobile typecheck` and `pnpm --filter @jojopotato/mobile lint` clean.
- `pnpm --filter @jojopotato/ui typecheck`/`test` (jest-expo) clean.
- Zero test deletions that reduce ordering/cart/checkout coverage (AC-A5, hard SPEC requirement).

## Verification Evidence (Phase A)

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| New `packages/ui` jest-expo test asserting `Button` (`md` and `sm`) rendered dimensions ≥ 48×48 incl. border | Fully-Automated | AC-A1 |
| Agent-Probe visual walkthrough of redesigned screens confirming tap targets read as easy-to-hit | Agent-Probe | AC-A1 (secondary confirmation) |
| `packages/ui` jest-expo style assertions on updated `TypeScale`/touched component text sizes (no informational text < 14px) | Fully-Automated | AC-A2 |
| Agent-Probe visual scan of redesigned screens for readability | Agent-Probe | AC-A2 (Hybrid confirmation) |
| Agent-Probe walkthrough of Home tab confirming ≤2 competing primary elements above the fold, all 6 sections still reachable by scroll | Agent-Probe | AC-A3 (no automated visual-hierarchy assertion exists — documented, not claimed automated) |
| New `confirm-dialog.test.tsx` (renders, both actions call correct handler, cancel does not confirm) | Fully-Automated | AC-A4 (component contract) |
| New `apps/mobile` jest test per touched screen (cart clear, branch-switch, sign-out, reorder-conflict) asserting `ConfirmDialog` renders and both choices invoke the correct existing handler unchanged | Fully-Automated | AC-A4 (per-screen wiring) |
| Agent-Probe visual/copy check of replaced confirmations | Agent-Probe | AC-A4 (Hybrid confirmation) |
| Full `pnpm --filter @jojopotato/mobile test` + `typecheck` + `lint` re-run green, zero test deletions | Fully-Automated | AC-A5 |
| Existing checkout tests remain green post-restyle (timer constant + progress UI changed, submission trigger logic untouched) | Fully-Automated (bounded by the reanimated-mock known-gap — see below) | AC-A6 |
| Agent-Probe re-confirm of countdown legibility/urgency at 10s at larger type sizes | Agent-Probe | AC-A6 (secondary confirmation) |
| Manual diff review during VALIDATE confirming no new literal hex/px values introduced in touched files (only theme-token references) | Hybrid | AC-A7 |

**Known-gap tier (documented, not silently claimed automated) — CORRECTED at VALIDATE with grep
evidence:** `checkout.tsx` currently imports `FadeIn`/`FadeOut`/`SlideInDown`/`SlideOutDown` (reanimated
layout-animation, wrapping the confirm drawer's mount/unmount — lines ~310-397) AND `Easing`/
`cancelAnimation`/`useSharedValue`/`withTiming`/`useAnimatedStyle` (reanimated core, scoped exclusively
to the existing timer-bar mechanism, lines ~173-190) — both sets are confirmed by
`apps/mobile/src/test-utils/jest-setup.ts`'s own doc comment to be **missing** from the jest reanimated
mock, so any jest test that renders `checkout.tsx` crashes today, pre-existing, unrelated to this plan.
This plan's item 4 replaces the timer-bar's reanimated-core usage with plain RN `Animated`/`useEffect`
tick, which is feasible and removes that half of the dependency — but the drawer's OUTER wrapper
(`entering={FadeIn}`/`exiting={SlideOutDown}` etc.) is NOT touched by this plan's scope and will
continue to reference the exact reanimated exports absent from the mock. **Net: this plan does not
introduce a new crash risk (confirmed via `find apps/mobile/src -name "*.test.*"`: zero existing test
files render `checkout.tsx` today, so nothing currently exercises or is broken by this gap) — it is a
pre-existing, non-blocking residual, not eliminated by this plan.** Fixing the jest mock remains a
reasonable optional PLAN item, not mandated — descoped to keep Phase A bounded, per SPEC Constraints
wording.

## Test Infra Improvement Notes (Phase A)

(none identified yet — carried forward: the reanimated jest-mock gap in
`apps/mobile/src/test-utils/jest-setup.ts` remains open; closing it is optional future work, not
required by this plan.)

## Resume and Execution Handoff (Phase A)

1. Selected plan file path: this file, `## Phase A` section.
2. Last completed phase/step: PLAN (this document) — Phase A not yet validated or executed.
3. Validate-contract status: pending — placeholder below, vc-validate-agent writes it before
   EXECUTE.
4. Supporting context files loaded: `process/context/all-context.md`,
   `packages/ui/src/theme.ts`, `packages/ui/src/components/button.tsx`,
   `process/general-plans/active/jojopotato-design-system_08-07-26/` (token source of truth),
   `process/general-plans/active/shared-ui-component-library_09-07-26/` (component library
   conventions).
5. Next step for a fresh agent: run `grep -rn "Alert.alert" apps/mobile/src` to confirm the exact
   full call-site list (this plan lists the SPEC-known ones; EXECUTE must re-confirm since "any
   other destructive action found during EXECUTE" is explicitly in AC-A4's scope), then proceed
   through the Touchpoints table top to bottom, running the Verification Evidence gates
   per-section as each file group completes (per-section test-gate discipline).

---

## Phase B — Deals Model Unification

**Gate: Phase B EXECUTE must not begin until Phase A is validated (ideally committed) per SPEC
Constraints/Q3 sequencing lock.**

### Phase B — Scope Lock (from INNOVATE, verbatim)

1. **Read path:** extend the EXISTING `?isDeal=true` menu response
   (`packages/api/src/routes/branches.ts` + `routes/lib/serializers.ts`'s `serializeMenuProduct`)
   to also populate `deal_components`. No new route. Confirmed via read: `serializeMenuProduct`
   currently does NOT set `isDeal`/`components` on `ApiMenuProduct` even though
   `packages/types/src/menu.ts`'s client-side `Product` interface already scaffolds both fields —
   this is the exact gap to close. Use the existing `Product`/`DealComponent` shape from
   `packages/types/src/menu.ts` verbatim — do not invent a parallel type.
2. **Mobile-side repoint (file-by-file disposition):**
   - `use-deals.ts` — MODIFY: repoint from `getDeals()` to `getMenu(branchId, {isDeal: true})`;
     flatten the returned `Category[]` → a single `Product[]` list for the Deals list screen.
   - `use-deal.ts` — MODIFY: no per-product endpoint exists; derive the single deal from the
     cached `?isDeal=true` menu query (mirror the existing derive-from-list pattern already used by
     `use-product-details.ts`). Retire the `GET /deals/:id` call inside this hook.
   - `apps/mobile/src/app/(tabs)/deals/index.tsx` — MODIFY: same UI shell (`DealCard`/
     `EmptyState`/`ScreenLoader` reused), swap `useDeals()`'s `Deal[]` for the new flattened
     `Product[]`; render `Product.name`/`basePriceCents` instead of the old `Deal` shape's fields.
   - `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` — MODIFY: same screen shell, new
     `Product`-shaped data via `useDeal(dealId)`; CTA changes from "Apply deal" to a plain
     "Add to cart" (`useCart().addItem()` — no discount math, no eligibility check). The current
     "Terms"/eligibility-reason card does NOT map to a plain product — **explicit redesign
     decision:** replace it with a "What's inside" card listing `components[]`
     (`componentName` × `quantity`), not a silent field-swap or deletion.
   - `apps/mobile/src/features/deals/lib/apply-deal.ts` — RETIRE-BUT-DO-NOT-DELETE this phase.
     Leave file in place, unused by the new deal-product add-to-cart flow. No import changes
     needed elsewhere (confirm at EXECUTE time that nothing outside the deals feature imports it).
   - `apps/mobile/src/features/deals/lib/eligibility.ts` — RETIRE-BUT-DO-NOT-DELETE this phase.
     **Do NOT remove or edit** — `apps/mobile/src/app/(tabs)/order/cart.tsx` still imports this
     file for the OLD-model deal-in-cart display path, which is explicitly out of this plan's
     scope. Confirmed via INNOVATE: `packages/api`'s `coupon-apply.ts` imports
     `checkDealEligibility`/`computeDealDiscountCents` from `@jojopotato/utils`'s own
     `packages/utils/src/discount.ts` — a SEPARATE copy — so this mobile file is not a live
     server dependency; the risk here is purely the `cart.tsx` mobile import, not a server break.
   - `apps/mobile/src/features/deals/hooks/use-deal-usage.ts` — RETIRE-BUT-DO-NOT-DELETE this
     phase, same reasoning (leave in place, unused by new flow).
   - `apps/mobile/src/features/deals/lib/coupon-api.ts` — UNTOUCHED. This is STAR-004's live
     coupon-apply transport, completely orthogonal to this repoint.
3. **Cart-add flow:** plain `useCart().addItem()` call for a deal-product — no discount math, no
   eligibility check. Optional (not required) polish: stash `isDeal: true` on the `CartItem` at
   add-time (data already available client-side from `Product.isDeal`) to show a "Deal" badge on
   the cart line — list as optional, do not block the phase on it.
4. **Handoff spec disposition:** add a "SUPERSEDED — see [this plan's path]" banner at the TOP of
   `process/features/admin-dashboard/active/admin-dashboard_14-07-26/deals-mobile-repoint_HANDOFF_15-07-26.md`
   — do not rewrite its body (its schema explanation stays useful background); only its "retire
   these files outright" instruction is stale/dangerous given the `cart.tsx` → `eligibility.ts`
   dependency found during INNOVATE.
5. **Never touch:** the OLD `deals`/`deal_products`/`deal_branches` tables/routes, or
   `coupons.deal_id`/`orders.deal_id` columns (reserved for future ADM-008) — stay fully dormant,
   untouched.

## Touchpoints (Phase B)

| File | Change |
|---|---|
| `packages/api/src/routes/lib/serializers.ts` | `serializeMenuProduct(product, options)` gains an optional 3rd param `components?: DealComponentRow[]` (or a lookup map passed in like `optionsByProduct`); when present, sets `isDeal: product.is_deal` and `components: components.map(...)` on the returned `ApiMenuProduct`. `ApiMenuProduct` interface gains `isDeal?: boolean` and `components?: ApiDealComponent[]` (additive). |
| `packages/api/src/routes/lib/serializers.ts` | Add `ApiDealComponent` interface (`componentProductId`, `componentName`, `quantity`) mirroring `packages/types/src/menu.ts`'s `DealComponent`, if not already defined for the admin-deals boundary (check for an existing `AdminDealComponent` to reuse/mirror rather than duplicate). **CORRECTED at VALIDATE (grep-verified):** `AdminDealComponent` already exists in this exact file (~line 489, shape: `componentProductId`/`componentName`/`quantity`) — byte-identical to the shape needed here. EXECUTE MUST reuse `AdminDealComponent` directly (e.g. `type ApiDealComponent = AdminDealComponent`, or just use `AdminDealComponent` inline) rather than declaring a duplicate interface. |
| `packages/api/src/routes/branches.ts` | Menu handler: when `isDealMenu === true`, also query `deal_components` (join on `deal_product_id` for the returned product IDs, joined to the component's own `products` row for `name`) and build a `componentsByProduct` map; pass it into `serializeMenuProduct` alongside `optionsByProduct`. When `isDealMenu === false` (the default/regular menu), skip the extra query entirely (no behavior/perf change to the existing non-deal path). **CORRECTED at VALIDATE:** `packages/api/src/routes/admin/deals.ts`'s existing `fetchComponents(dealProductId)` (~lines 125-134) is the exact single-product reference query to batch-ify here — same 3-column select (`componentProductId`/`componentName` via `products.name`/`quantity`) and same `innerJoin(products, eq(products.id, dealComponents.component_product_id))`; widen `eq(dealComponents.deal_product_id, dealProductId)` to `inArray(dealComponents.deal_product_id, productIds)` then group into the map — do not invent a new query shape. |
| `packages/api/src/routes/__tests__/branches.test.ts` (confirm exact filename via `find` at EXECUTE time — may be `menu.integration.test.ts` or similar) | NEW test case: `GET /branches/:id/menu?isDeal=true` on a seeded `is_deal=true` product with attached `deal_components` returns `isDeal: true` and populated `components[]`; regular (non-`isDeal`) menu call for the same branch still excludes the deal product entirely and never sets `isDeal`/`components` on regular products. |
| `apps/mobile/src/features/deals/hooks/use-deals.ts` | MODIFY per scope-lock item 2 — repoint to `getMenu(branchId, {isDeal:true})`, flatten to `Product[]`. |
| `apps/mobile/src/features/deals/hooks/use-deal.ts` | MODIFY — derive from cached `?isDeal=true` menu query by product id, mirroring `use-product-details.ts`'s pattern. |
| `apps/mobile/src/app/(tabs)/deals/index.tsx` | MODIFY — render from `Product[]`, not `Deal[]`. |
| `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` | MODIFY — render from `Product`, "What's inside" components card replaces Terms/eligibility card, CTA becomes plain "Add to cart". **CORRECTED at VALIDATE (grep-verified):** the CURRENT file imports `applyDealById`/`isComplexDealType` (from `apply-deal.ts`), `checkDealEligibility` (from `eligibility.ts`), `useDealUsage` (from `use-deal-usage.ts`), and `setAppliedCouponCode` — ALL become dead imports once the CTA is a plain add-to-cart and MUST be removed as part of this rewrite (would otherwise fail lint/typecheck). Use the existing `productToMenuItem(product, isAvailable)` helper (`apps/mobile/src/features/cart/lib/product-to-menu-item.ts`, already built for exactly this `Product`→`MenuItem` conversion) + `useCart().addItem(menuItem, [])` for the new CTA — no new conversion utility needed. |
| `apps/mobile/src/lib/api-client.ts` | **CORRECTED at VALIDATE (grep-verified, original claim was FALSE):** `getMenu(branchId: string): Promise<MenuResponse>` currently takes ONLY `branchId` — there is NO second params object and NO `isDeal` query-string support today. This IS a required code change, not verify-only: extend the signature to `getMenu(branchId: string, options?: { isDeal?: boolean }): Promise<MenuResponse>` and conditionally append `?isDeal=true` to the request path, mirroring this same file's existing `getDeals(branchId?)` conditional-query-string pattern (~lines 110-115). Also note: `apps/mobile/src/features/menu/hooks/use-menu.ts`'s `useMenu()` hook is parameterless (branch-context-driven via `useBranch()`) and is NOT the right call site — `use-deals.ts`/`use-deal.ts` must call the `getMenu` function directly inside their own `useQuery`, mirroring today's `useDeals()`'s direct `getDeals()` call pattern (not routed through `useMenu()`). |
| `apps/mobile/src/features/deals/lib/apply-deal.ts`, `eligibility.ts`, `use-deal-usage.ts` | NO CODE CHANGE — leave in place per RETIRE-BUT-DO-NOT-DELETE. Note their disposition explicitly in the EXECUTE report (not a silent no-op). |
| `apps/mobile/src/features/deals/lib/coupon-api.ts` | NO CHANGE — untouched. |
| `process/features/admin-dashboard/active/admin-dashboard_14-07-26/deals-mobile-repoint_HANDOFF_15-07-26.md` | Add a "SUPERSEDED — see [this plan's path]" banner at the top only. |

## Public Contracts (Phase B)

- `ApiMenuProduct` (server boundary type, `packages/api/src/routes/lib/serializers.ts`) gains
  additive optional fields `isDeal?: boolean` / `components?: ApiDealComponent[]` — existing
  consumers unaffected (regular menu responses omit or set `isDeal: false`/no `components`, per
  the "skip query when not `isDealMenu`" rule).
- `packages/types/src/menu.ts`'s `Product`/`DealComponent` client types are UNCHANGED (already
  scaffolded correctly) — this phase makes the server actually populate what the client already
  expects.
- No changes to `GET /branches/:id/menu`'s route signature or query-param contract (`?isDeal=true`
  already exists) — only its response body gains fields for the deal-menu case.
- Old `GET /deals`, `GET /deals/:id` routes remain mounted, unchanged, dormant-for-mobile-use (no
  longer called by the repointed hooks, but not removed/deprecated per AC-B5).
- `POST /coupons/apply` (STAR-004) contract completely unchanged — zero touch.
- `POST /api/admin/deals*` (admin CRUD) contract completely unchanged — zero touch.

## Blast Radius (Phase B)

- **Packages touched:** `packages/api` (serializer + branches route + 1 new test), `apps/mobile`
  (2 hooks, 2 screens; `apply-deal.ts`/`eligibility.ts`/`use-deal-usage.ts`/`coupon-api.ts` are
  READ-ONLY/untouched, listed for disposition clarity only), `process/features/admin-dashboard`
  (1 doc banner edit).
- **File count estimate:** ~7 files actually modified (serializer, branches route, 1 new/modified
  test file, 2 mobile hooks, 2 mobile screens) + 1 doc banner. Under 15 — MEDIUM blast radius.
- **Risk class:** touches a public API route's response shape (additive only) — flagged per SPEC
  as requiring the AC-B3/AC-B4 hard non-regression gates on the two adjacent live flows (coupon
  redemption, admin CRUD) even though this plan's own changes don't touch either surface.
- **Explicitly NOT touched (verified, not just assumed):** `deals`/`deal_products`/
  `deal_branches` schema and routes; `coupons.deal_id`/`orders.deal_id` columns;
  `packages/utils/src/deals-catalog.ts` (STAR-004 static catalog); `packages/utils/src/discount.ts`
  (server-side coupon-apply eligibility/discount math); `packages/api/src/routes/admin/deals.ts`
  (admin CRUD).

### Phase B — Non-Regression Requirements (must stay green, zero modifications required to pass)

- `packages/api/src/routes/__tests__/deals.test.ts` (OLD model, 302 lines) — unmodified, green.
- `packages/api/src/lib/__tests__/admin-deals.integration.test.ts` (NEW model, 860 lines,
  AC1-AC11) — unmodified, green (AC-B4).
- `packages/api/src/routes/__tests__/coupons.integration.test.ts` (STATIC catalog, 340 lines,
  AC1-AC4 incl. AC3 deal parity / AC4 zero mutation) — unmodified, green (AC-B3). If any
  modification turns out to be unavoidable, it must be called out explicitly as a deliberate,
  reviewed change in the EXECUTE report — never an incidental break.
- All existing menu/branches route tests (whatever the exact filename is — confirm via `find` at
  EXECUTE time) covering the regular (non-`isDeal`) menu path — unmodified, green; the new
  `deal_components` query must not fire or affect output for `isDealMenu === false`.
- `pnpm --filter @jojopotato/api typecheck`/`test`, `pnpm --filter @jojopotato/mobile
  typecheck`/`test`/`lint` all clean.

## Verification Evidence (Phase B)

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Presence check: superseded banner added to `deals-mobile-repoint_HANDOFF_15-07-26.md` | Fully-Automated (grep during VALIDATE) | AC-B1 |
| New `packages/api` supertest: `GET /branches/:id/menu?isDeal=true` on a seeded `is_deal` product with `deal_components` returns populated `isDeal`/`components[]`; regular menu excludes the deal product and omits the fields | Fully-Automated | AC-B2 |
| New `apps/mobile` test(s) on repointed `use-deals.ts`/`use-deal.ts`/Deals list+detail screens confirming render from the new `Product`-shaped data (including the "What's inside" components card) | Fully-Automated | AC-B2 |
| Full `coupons.integration.test.ts` suite (AC1-AC4) re-run green with zero modifications | Fully-Automated | AC-B3 |
| Full `admin-deals.integration.test.ts` suite (AC1-AC11) re-run green with zero modifications | Fully-Automated | AC-B4 |
| Presence check: this SPEC's explicit statement that old `deals`/`deal_products`/`deal_branches` stay dormant untouched (option (a)) | Fully-Automated (presence check, not a runtime test — satisfied by this SPEC/PLAN text existing) | AC-B5 |
| `deals.test.ts` suite status explicitly reported as "green" in the EXECUTE report (kept, unmodified) | Fully-Automated | AC-B6 |

## Test Infra Improvement Notes (Phase B)

(none identified yet)

## Resume and Execution Handoff (Phase B)

1. Selected plan file path: this file, `## Phase B` section.
2. Last completed phase/step: PLAN (this document) — Phase B not yet validated or executed;
   **Phase A must reach at least a validated/committed state first** per sequencing lock.
3. Validate-contract status: pending — placeholder below, vc-validate-agent writes it before
   EXECUTE (run separately from Phase A's contract, after Phase A's EXECUTE/commit).
4. Supporting context files loaded: `packages/types/src/menu.ts`,
   `packages/api/src/routes/lib/serializers.ts`, `packages/api/src/routes/branches.ts`,
   `apps/mobile/src/features/deals/**`,
   `process/features/admin-dashboard/active/admin-dashboard_14-07-26/deals-mobile-repoint_HANDOFF_15-07-26.md`,
   `process/features/rewards-notifications/active/star-004-reward-redemption_15-07-26/` (STAR-004
   non-regression source of truth).
5. Next step for a fresh agent: confirm Phase A is committed/validated; re-run
   `find apps/mobile/src -name "*.test.*"` and `find packages/api/src/routes/__tests__ -type f` to
   reconfirm exact test file names before touching anything (filenames referenced above are
   best-effort from RESEARCH/INNOVATE, not guaranteed exact); then proceed through the Touchpoints
   table top to bottom, running each Verification Evidence gate as its file group completes.

---

## Validate Contract (Phase A)

Status: CONDITIONAL
Date: 16-07-26
date: 2026-07-16
generated-by: outer-pvl

Parallel strategy: sequential (single-agent two-layer analysis; below the 2-3 signal MEDIUM
threshold — one package domain (`packages/ui` + `apps/mobile`), ~12-15 files, no phase-program
classification, no schema/API/auth surface)
Rationale: Signal score 1/7 (S7 file-count borderline only; S1/S2/S3/S4/S5/S6 all absent) —
sequential/direct analysis is proportionate; a multi-agent fan-out would not have found anything
a single grep-first pass didn't already surface.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-A1 | `Button` (`md`/`sm`) and interactive controls render at ≥48×48 incl. border | Fully-Automated | new `packages/ui/src/components/__tests__/button.test.tsx` case asserting rendered dimensions | B |
| AC-A1 (secondary) | Redesigned screens read as easy-to-hit | Agent-Probe | manual walkthrough of touched screens | D |
| AC-A2 | No informational text <14px in touched components; shared `TypeScale` constants unchanged | Fully-Automated | new `packages/ui` style assertions on touched components + `grep -n "bodySmall: 14" -n "caption: 12" packages/ui/src/theme.ts` (both must still match, confirming no constant drift) | B |
| AC-A2 (secondary) | Visual readability scan | Agent-Probe | manual scan of redesigned screens | D |
| AC-A3 | Home tab ≤2 competing primary elements above the fold; all 6 sections still reachable by scroll | Agent-Probe | manual Home-tab walkthrough (no automated visual-hierarchy assertion exists in this repo) | D |
| AC-A4 (component contract) | `ConfirmDialog` renders title/body, both actions call correct callback, cancel does not confirm | Fully-Automated | new `packages/ui/src/components/__tests__/confirm-dialog.test.tsx` | A |
| AC-A4 (per-screen wiring, CORRECTED scope) | `cart.tsx`'s 2 real destructive alerts ("Replace applied discount?", "Change branch?") and `product/[productId].tsx`'s 1 real destructive alert ("Switch branch?") render `ConfirmDialog` and both choices invoke the unchanged existing handler | Fully-Automated | new `apps/mobile` jest tests, one per corrected call site (3 total, not the original 4-6 file estimate) | B |
| AC-A4 (sign-out, NEW addition not a restyle) | `account/index.tsx` gates `signOut` behind `ConfirmDialog`; updated `account-screen.test.tsx` asserts confirm→signOut and cancel→no-signOut | Fully-Automated | updated `apps/mobile/src/features/auth/__tests__/account-screen.test.tsx` (existing "fires signOut when Log out is pressed" case must be rewritten, not silently left failing) | B |
| AC-A4 (secondary) | Visual/copy check of replaced/added confirmations | Agent-Probe | manual check | D |
| AC-A5 | Zero behavioral regression; full mobile test+typecheck+lint green, zero test deletions | Fully-Automated | `pnpm --filter @jojopotato/mobile test && pnpm --filter @jojopotato/mobile typecheck && pnpm --filter @jojopotato/mobile lint` | A |
| AC-A5 (packages/ui) | `packages/ui` typecheck/test stay clean (23 existing tests, corrected count) | Fully-Automated | `pnpm --filter @jojopotato/ui typecheck && pnpm --filter @jojopotato/ui test` | A |
| AC-A6 | Countdown restyle (5s→10s, progress ring/bar, color-coded urgency, bigger Modify button) via plain RN `Animated`/`useEffect` tick, not reanimated core/layout APIs; auto-submit trigger logic unchanged | Fully-Automated (bounded — see Known Gaps) | `pnpm --filter @jojopotato/mobile test` (no render-level test exists or is added for `checkout.tsx` this phase — pre-existing gap, not introduced by this plan) | D |
| AC-A6 (secondary) | Countdown legibility/urgency at 10s re-confirmed at larger type sizes | Agent-Probe | manual re-confirm | D |
| AC-A7 | No new literal hex/px values in touched files; only theme-token references | Hybrid | manual diff review during EXECUTE close-out (no automated token-literal linter exists in this repo) | D |

gap-resolution legend: A = proven now · B = fixed in this plan (gate added by this plan's checklist) · C = deferred to a named later phase/plan · D = backlog test-building stub (named residual; keep-active; continue)

Failing stub (AC-A1, Fully-Automated):
```
test("should render Button md/sm sizes at >=48x48 including border", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: Button md/sm touch target >=48x48")
})
```

Failing stub (AC-A4 component contract, Fully-Automated):
```
test("should render title/body and call the correct handler for each action; cancel never confirms", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: ConfirmDialog component contract")
})
```

Failing stub (AC-A4 per-screen wiring, Fully-Automated):
```
test("should render ConfirmDialog for cart.tsx 'Replace applied discount?' and invoke unchanged handler on each choice", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: cart.tsx discount-replace ConfirmDialog wiring")
})
test("should render ConfirmDialog for cart.tsx 'Change branch?' and invoke unchanged handler on each choice", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: cart.tsx branch-change ConfirmDialog wiring")
})
test("should render ConfirmDialog for product/[productId].tsx 'Switch branch?' and invoke unchanged handler on each choice", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: product screen branch-switch ConfirmDialog wiring")
})
```

Failing stub (AC-A4 sign-out, Fully-Automated):
```
test("should open ConfirmDialog on Log out press, call signOut only on confirm, and never on cancel", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: account sign-out ConfirmDialog gate")
})
```

Legacy line form (retained so existing validate-contract consumers still parse):
- `packages/ui` Button/ConfirmDialog: Fully-automated: `pnpm --filter @jojopotato/ui test` | `pnpm --filter @jojopotato/ui typecheck`
- `apps/mobile` screens/hooks (cart, product, account, checkout, Home, option-selector): Fully-automated: `pnpm --filter @jojopotato/mobile test` | `pnpm --filter @jojopotato/mobile typecheck` | `pnpm --filter @jojopotato/mobile lint`
- AC-A7 token-literal diff: Hybrid: manual diff review during EXECUTE close-out + precondition that touched files are diffed against origin/development
- AC-A3 Home hierarchy / AC-A1/A2/A4/A6 secondary confirmations: agent-probe: manual walkthrough per Verification Evidence (Phase A) table

Dimension findings:
- Infra fit: PASS — no container/infra/runtime/deploy surface touched; packages/ui + apps/mobile only, existing build/test tooling, zero new dependencies (RN core `Modal`/`Animated` only).
- Test coverage: CONCERN — packages/ui test count was misstated (21 vs actual 23) and apps/mobile test count was misstated (4 vs actual 8, none of which are dedicated cart/checkout render tests) — both corrected in-plan this pass; zero snapshot tests exist anywhere in scope, which fully de-risks the touch-target/typography bump against hardcoded-pixel regressions; the new `ConfirmDialog` test plan is concrete and executable (props surface + named call sites), with one factual correction applied (no prior `Modal` usage exists in `packages/ui`).
- Breaking changes: CONCERN — `TypeScale` has 68 real consumers and `Button` has 27 (both far beyond the plan's original "~10-12 files" framing); `Button`/`MinTouchTarget` changes are safe by construction (unchanged prop contract, additive style-only), but `TypeScale`'s shared constants must NOT change (added as a hard execute-agent instruction + automated grep gate) to avoid a silent 68-file reflow with zero protecting test coverage.
- Security surface: PASS — no auth/billing/schema/secrets/trust-boundary surface touched; the new sign-out confirm step is a UX-safety improvement, not a regression.
- Section feasibility (Phase A, single section): CONCERN — mechanical feasibility is otherwise solid (all named files exist, index-export pattern is trivial to extend, checkout's plain-animation constraint is feasible for the piece actually being redesigned), but the Touchpoints table contained 4 factually incorrect Alert.alert() call-site descriptions (cart.tsx "Clear cart" claim, branches/[branchId].tsx branch-switch claim, deal/[dealId].tsx reorder-conflict/apply-deal claim, use-reorder.ts destructive-alert claim) plus one row targeting a nonexistent alert entirely (sign-out, which requires ADDING new behavior, not restyling) with a downstream test file (`account-screen.test.tsx`) omitted from Touchpoints. All 5 corrected in-plan this pass with exact grep-verified call sites.

Open gaps:
- `checkout.tsx`'s drawer-wrapper reanimated layout-animation exports (`FadeIn`/`FadeOut`/`SlideInDown`/`SlideOutDown`) remain outside the jest mock's coverage (pre-existing, not introduced or fixed by this plan; no test currently renders this screen, so it is a non-blocking residual — tracked, not silently claimed automated).
- AC-A7 (no new token literals) has no automated linter in this repo — Hybrid manual diff review is the ceiling until a token-literal ESLint rule is built (optional future work, not mandated this phase).
- AC-A3 (Home visual hierarchy) has no automated visual-hierarchy assertion in this repo — Agent-Probe is the ceiling, consistent with the SPEC's own framing.

What this coverage does NOT prove:
- The `Button`/`ConfirmDialog`/typography Fully-Automated gates prove component-level contract and dimension correctness in jest-expo/RTL — they do NOT prove real-device tap-target ergonomics, actual on-screen legibility at real brightness/DPI, or cross-platform (iOS/Android/web) rendering parity; those remain Agent-Probe.
- The `pnpm --filter @jojopotato/mobile test` full-suite gate proves no *existing* logic/component regression — it does NOT prove `checkout.tsx` itself renders correctly under jest (no test exercises that render path, before or after this plan).
- The AC-A2 grep guard (`bodySmall: 14`/`caption: 12` unchanged) proves the shared constant wasn't touched — it does NOT prove every one of the 68 real `TypeScale` consumers was manually re-reviewed for correct key usage; only touched components in this plan's checklist are audited.
- The AC-A7 Hybrid manual diff proves no NEW literal hex/px was introduced in touched files this session — it does NOT prove the full app has zero legacy literal values elsewhere (out of scope, pre-existing).

Gate: CONDITIONAL (concerns noted and resolved via in-plan corrections applied this session; no
unresolved FAILs)
Accepted by: session (autonomous single-pass VALIDATE run per orchestrator delegation — task
explicitly instructed "Run V1-V7 ... and write the contract" with no interactive mid-task
checkpoint available). Accepted concerns: (1) corrected Alert.alert call-site mismatches across
5 Touchpoints rows — plan text updated in this pass; (2) TypeScale shared-constant risk — resolved
via added execute-agent instruction + automated grep gate; (3) test-count inaccuracies (21→23,
4→8) — corrected in-plan; (4) Modal-precedent claim — corrected in-plan; (5) checkout known-gap
phrasing — corrected in-plan for precision. None of these required re-scoping or blocked EXECUTE.

## Validate Contract (Phase B)

Status: CONDITIONAL
Date: 16-07-26
date: 2026-07-16
generated-by: outer-pvl

Parallel strategy: sequential (single-agent two-layer analysis)
Rationale: Signal score 3/7 (S2 API-surface change present, S6 public-API high-risk class present,
S7 file-count ~7-8 files present; S1/S3/S4/S5 absent) — this crosses into the nominal MEDIUM (2-3)
parallel-subagent threshold, but the work is one tightly-coupled thread through 2 packages (not
independent parallelizable directions — api serializer/route change and mobile hook/screen change
must be reasoned about together, since the mobile side's correctness depends on the exact server
field names). A single grep-first pass was fully sufficient to find every real issue this pass
(confirmed below) — matches the "fit over tier" guidance: sequential/direct analysis is
proportionate here, a fan-out would not have surfaced anything a single focused pass didn't already
find.

Pre-validate baseline (real, run this session — not assumed):
- `pnpm install` was required first — a stale workspace symlink caused `Cannot find package
  '@jojopotato/utils'` in `packages/api` (pre-existing environment issue, NOT caused by Phase A or
  this plan; resolved before establishing the baseline).
- `pnpm --filter @jojopotato/api test`: **271/271 passing, 22/22 test files green** (incl.
  `deals.test.ts` 13/13, `coupons.integration.test.ts` 8/8, `admin-deals.integration.test.ts`
  40/40 — all three of Phase B's named hard non-regression suites, confirmed green BEFORE Phase B
  starts).
- `pnpm --filter @jojopotato/mobile test`: **37/37 vitest + 19/19 jest, 10/10 test files green**
  (confirms Phase A's execution, currently uncommitted in the working tree, is itself in a clean,
  green state — consistent with the task's "Phase A EXECUTE-complete and EVL-confirmed" framing).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-B1 | Superseded banner added to `deals-mobile-repoint_HANDOFF_15-07-26.md`, marking it non-executable as-is | Fully-Automated | `grep -l "SUPERSEDED" process/features/admin-dashboard/active/admin-dashboard_14-07-26/deals-mobile-repoint_HANDOFF_15-07-26.md` (new checklist item, not yet applied) | B |
| AC-B2 (API side) | `GET /branches/:id/menu?isDeal=true` on a seeded `is_deal` product with `deal_components` returns populated `isDeal`/`components[]`; regular menu excludes the deal product and omits both fields | Fully-Automated | new case in `packages/api/src/routes/__tests__/branches.test.ts` (confirmed exact filename this pass — see Corrections below) | B |
| AC-B2 (mobile side) | Repointed `use-deals.ts`/`use-deal.ts`/Deals list+detail screens render from the new `Product`-shaped data, incl. the "What's inside" components card | Fully-Automated | new `apps/mobile` test(s) on the repointed hooks/screens (no such tests exist yet) | B |
| AC-B3 | STAR-004 coupon-apply flow (`POST /coupons/apply`, double-redeem guard, zero-mutation guarantee) keeps working unchanged | Fully-Automated | `pnpm --filter @jojopotato/api test -- coupons.integration` — **confirmed 8/8 GREEN in this session's baseline run, zero modifications made** | A |
| AC-B4 | Admin deals CRUD (incl. the create-with-components wizard, snapshot-integrity guarantee, and the AC7 menu-filter case that already exercises this exact route) keeps working unchanged | Fully-Automated | `pnpm --filter @jojopotato/api test -- admin-deals.integration` — **confirmed 40/40 GREEN in this session's baseline run, zero modifications made** | A |
| AC-B5 | Old `deals`/`deal_products`/`deal_branches` tables and `GET /deals`/`GET /deals/:id` routes stay dormant/untouched (explicit statement, not left ambiguous) | Fully-Automated (presence check) | `grep -n "Resolution recorded" kid-friendly-ui-deals-unification_SPEC_16-07-26.md` — **confirmed present this session** (SPEC §Open Questions Q2: "(a) ... left dormant/untouched") | A |
| AC-B6 | `deals.test.ts` (OLD model, public `/deals` routes) suite status explicitly reported — green and unmodified (kept, not retired) | Fully-Automated | `pnpm --filter @jojopotato/api test -- routes/__tests__/deals.test` — **confirmed 13/13 GREEN in this session's baseline run** | A |

gap-resolution legend: A = proven now · B = fixed in this plan (gate added by this plan's checklist) · C = deferred to a named later phase/plan · D = backlog test-building stub (named residual; keep-active; continue)

Failing stub (AC-B1, Fully-Automated):
```
test("should mark deals-mobile-repoint_HANDOFF as superseded", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: superseded banner on deals-mobile-repoint_HANDOFF_15-07-26.md")
})
```

Failing stub (AC-B2 API side, Fully-Automated):
```
test("should return isDeal:true and populated components[] for GET /branches/:id/menu?isDeal=true on a seeded is_deal product with deal_components; regular menu excludes the deal product and omits both fields", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: menu isDeal=true serializer + branches.ts query")
})
```

Failing stub (AC-B2 mobile side, Fully-Automated):
```
test("should render Deals list/detail screens from the repointed Product-shaped data (use-deals.ts/use-deal.ts), including the What's inside components card", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: mobile deals repoint to is_deal/deal_components model")
})
```

Legacy line form (retained so existing validate-contract consumers still parse):
- `packages/api` menu route + serializer (AC-B1, AC-B2 API side): Fully-automated: `pnpm --filter @jojopotato/api test`
- `packages/api` non-regression (AC-B3, AC-B4, AC-B6): Fully-automated: `pnpm --filter @jojopotato/api test` (271/271 confirmed green this session, pre-Phase-B)
- `apps/mobile` deals hooks/screens (AC-B2 mobile side): Fully-automated: `pnpm --filter @jojopotato/mobile test` | `pnpm --filter @jojopotato/mobile typecheck` | `pnpm --filter @jojopotato/mobile lint`
- AC-B5 SPEC presence check: Fully-automated: `grep` on the locked SPEC file (confirmed present this session)

Dimension findings:
- Infra fit: PASS — no container/infra/runtime/deploy surface touched; `packages/api` (existing Express route + Drizzle query) and `apps/mobile` (existing react-query hooks) only, zero new dependencies. Local Postgres confirmed running (`docker compose ps`); a pre-existing stale `pnpm` workspace-link issue (`Cannot find package '@jojopotato/utils'`) was found and fixed this session via `pnpm install` — unrelated to this plan, but flagged since it silently made 12/22 API test files unrunnable before the fix.
- Test coverage: PASS (with one documentation gap corrected in-pass, not a functional risk) — all 6 Phase B acceptance criteria have a concrete Fully-Automated gate (no Agent-Probe/Known-Gap used for Phase B, per the plan's own Phase Completion Rules). Three of the six gates (AC-B3, AC-B4, AC-B6) are EXISTING suites, empirically confirmed green this session (271/271 API tests overall) BEFORE any Phase B code changes — a real, current baseline, not an assumption. **Correction applied:** the plan's Blast Radius section did not flag that `admin-deals.integration.test.ts` ALREADY contains a test (AC7, lines 473-502) that exercises the EXACT route this phase modifies (`GET /branches/:id/menu` + `?isDeal=true`) — verified this test only asserts product-ID membership (`toContain`/`not.toContain`), never full-object equality, so adding new optional `isDeal`/`components` fields to `ApiMenuProduct` cannot break it; the "zero modifications needed" claim holds, but this was worth surfacing explicitly rather than leaving it a coincidence.
- Breaking changes: CONCERN, corrected in-plan this pass — the Phase B Touchpoints row for `apps/mobile/src/lib/api-client.ts` claimed `getMenu(branchId, {isDeal:true})` "already supports the `isDeal` query param... no change expected, verify only." **This claim was grep-verified FALSE**: `getMenu(branchId: string): Promise<MenuResponse>` takes only one argument today and builds no query string at all. This is a real, small, mechanical gap (not a design flaw) — fixed in-plan this pass by rewriting the Touchpoints row to require the actual signature change, pointing to this same file's existing `getDeals(branchId?)` conditional-query-string pattern as the template to mirror, and clarifying that `use-menu.ts`'s parameterless `useMenu()` hook is the wrong call site (must call `getMenu` directly, like `useDeals()` calls `getDeals()` today). `ApiMenuProduct`'s own contract change (gaining `isDeal?`/`components?`) remains genuinely additive and safe — existing consumers (mobile menu screens, `branches.test.ts`) read only the fields they already expect.
- Security surface: PASS — no auth/billing/secrets/trust-boundary surface touched; read-only additive field on an already-public route, no new endpoint, no permission change.
- Section feasibility (Phase B, single section): CONCERN, corrected in-plan this pass — mechanical feasibility is otherwise solid and, in several places, BETTER than the plan text implied: `?isDeal=true` filtering on `GET /branches/:id/menu` **already exists in the live route today** (`branches.ts` line 104/123, confirmed by direct read — not something this phase adds), `packages/types/src/menu.ts`'s `Product.isDeal`/`components` fields are **already scaffolded exactly as the plan claims** (confirmed by direct read), and `packages/api/src/routes/admin/deals.ts` already has both a reusable `AdminDealComponent` type (byte-identical shape to the plan's proposed new `ApiDealComponent`) and a reusable single-product `fetchComponents()` query to batch-ify — both now called out explicitly as reuse targets to avoid duplication. Two real gaps were found and corrected in-plan: (1) the `api-client.ts` `getMenu()` signature gap above; (2) the `deal/[dealId].tsx` rewrite's Touchpoints row didn't mention that the CURRENT file's imports of `applyDealById`/`isComplexDealType`/`checkDealEligibility`/`useDealUsage`/`setAppliedCouponCode` all become dead once the CTA is a plain add-to-cart and must be removed (would otherwise fail lint/typecheck) — now called out explicitly, along with naming the existing `productToMenuItem()` converter + `useCart().addItem()` as the concrete, already-built implementation path (no new utility needed). Conflicts found: none — the RETIRE-BUT-DO-NOT-DELETE disposition for `apply-deal.ts`/`eligibility.ts`/`use-deal-usage.ts` is CONFIRMED correct by direct grep: `order/cart.tsx` genuinely still imports all three (`useDealUsage`, `resolveAndApplyDeal` from `apply-deal.ts`, `checkDealEligibility` from `eligibility.ts`) for its OLD-model cart-line display path, and `coupon-apply.ts` (server-side) imports `checkDealEligibility`/`computeDealDiscountCents` from `@jojopotato/utils`'s OWN `packages/utils/src/discount.ts` — a separate copy, confirmed by direct read — so retiring the mobile files carries zero server-side risk. Highest-risk edit + mitigation: the `branches.ts` menu-handler change (adding the conditional `deal_components` batch query) — mitigated by (a) the existing `isDealMenu` boolean already gating the query path (so the regular-menu perf/behavior is provably unaffected when false), and (b) the new test case explicitly asserting the regular menu path never sets `isDeal`/`components` on regular products, locking this in as a regression gate rather than an implicit assumption.

Open gaps:
- None deferred to backlog for Phase B — both CONCERNs found (api-client.ts signature, deal/[dealId].tsx dead imports) were corrected directly in this plan's Touchpoints table this pass, not left as execute-agent judgment calls.
- Minor stylistic ambiguity (non-blocking, EXECUTE's call): the plan's Public Contracts section hedges between "regular menu responses omit `isDeal`/`components`" and "...or set `isDeal: false`" — either is acceptable per the additive contract, but EXECUTE must pick ONE and make the new `branches.test.ts` case assert exactly that choice (not leave it ambiguous in the actual test).

What this coverage does NOT prove:
- The new `GET /branches/:id/menu?isDeal=true` supertest proves the server correctly serializes `isDeal`/`components` for a seeded deal-product and correctly omits them for a regular product — it does NOT prove behavior under a deal-product with a LARGE component list (N+1 query shape at scale) or a deal-product with a component that is itself inactive/unavailable (edge case not named in the plan's AC-B2 scenario).
- The re-run of `coupons.integration.test.ts`/`admin-deals.integration.test.ts`/`deals.test.ts` proves no REGRESSION was introduced by Phase B's changes — it does NOT re-validate those suites' own original acceptance criteria from first principles (that was done when each suite was originally built).
- The new `apps/mobile` test(s) on the repointed Deals screens prove the hooks/screens render correctly from the new `Product`-shaped data in a jest/RTL harness — they do NOT prove real-device navigation from Home→Deals→Detail→Cart end-to-end (no E2E/navigation runner exists in this repo, project-wide known gap, unrelated to this plan).
- The AC-B5 SPEC presence-check grep proves the disposition statement EXISTS in the locked SPEC — it does NOT independently re-verify that the old `deals`/`deal_products`/`deal_branches` schema is actually still dormant in the live DB (that was confirmed separately via direct schema/route reads during this VALIDATE pass, not via the grep gate itself).

Gate: CONDITIONAL (concerns found and resolved via in-plan corrections applied this session; no
unresolved FAILs)
Accepted by: session (autonomous single-pass VALIDATE run per orchestrator delegation — task
explicitly instructed "Run V1-V7 ... and write the contract" with no interactive mid-task
checkpoint available). Accepted concerns: (1) `api-client.ts`'s `getMenu()` signature gap — plan
text corrected this pass to require the actual code change; (2) `deal/[dealId].tsx`'s dead-import
cleanup was unnamed — plan text corrected this pass to name the exact imports to remove and the
exact existing utility (`productToMenuItem`) to use instead; (3) `ApiDealComponent`/
`AdminDealComponent` duplication risk — plan text corrected this pass to mandate reuse. None of
these required re-scoping, and none touch the plan's core direction (SPEC Q2 option (b)) or its
hard non-regression gates, all three of which are empirically confirmed green in this session's
baseline (271/271 API tests).

## Autonomous Goal Block

SESSION GOAL: Ship the kid-friendly mobile UI/UX pass (Phase A) — bigger touch targets, calmer
Home hierarchy, a shared ConfirmDialog replacing ad-hoc Alert.alert() confirms, and a restyled
(not behaviorally changed) checkout countdown — across `packages/ui` + `apps/mobile` only.
Charter + umbrella plan: N/A — single COMPLEX plan, 2 phases, one task folder, under the 3-phase
phase-program threshold (no umbrella/charter).
Autonomy: standard RIPER-5 autonomy rules — CONDITIONAL findings proceed with accepted concerns
on record (see above); BLOCKED items go to backlog; irreversible/outward-facing actions without
explicit contract instruction are a hard stop.
Hard stop conditions / safety constraints:
- Zero changes to packages/api, packages/types business logic, schema, navigation structure, or
  screen count/order (SPEC Constraints, Out of Scope) — Phase A is presentational-layer only.
- Do NOT change the shared `TypeScale.bodySmall`/`caption` raw values in `packages/ui/src/theme.ts`
  — only correct individual component literal key usage if an AC-A2 violation is found.
- Checkout auto-submit-on-timeout trigger logic must remain byte-for-byte unchanged — only the
  presentation (progress ring/bar, timing constant, button size) may change.
- `(staff)/order-detail/[orderId].tsx` sign-out/destructive-alert is explicitly deferred — do not
  touch it this phase.
- Phase B EXECUTE must not begin until Phase A reaches at least a validated/committed state
  (sequencing lock, SPEC Constraints/Q3).
Next phase: EXECUTE Phase A (this plan's `## Phase A` section) — Phase B's own validate-contract
is written separately after Phase A is committed.
Validate contract: inline in this plan file, `## Validate Contract (Phase A)` section above.
Execute start: `pnpm --filter @jojopotato/mobile test && pnpm --filter @jojopotato/mobile typecheck
&& pnpm --filter @jojopotato/mobile lint` (fully-auto commands) | manual Agent-Probe walkthrough
per Verification Evidence (Phase A) table (AC-A1/A2/A3/A4/A6 secondary confirmations) | AC-A7
token-literal diff review (Hybrid) | high-risk pack: no (no high-risk class present).

## Next Step

Phase A validate-contract is written above (Gate: CONDITIONAL, concerns resolved via in-plan
corrections this pass). Phase A's code changes exist in the working tree (per `git status`,
uncommitted) — reported EXECUTE-complete/EVL-confirmed; recommend a commit checkpoint before Phase B
EXECUTE begins, per the sequencing lock (SPEC Constraints/Q3: "at least a validated/committed
state").

Phase B validate-contract is now also written above (Gate: CONDITIONAL, concerns found and
resolved via in-plan corrections this same VALIDATE pass — see `## Validate Contract (Phase B)`).
Both phases are validated; nothing blocks EXECUTE on validation grounds. Say **ENTER EXECUTE MODE**
for Phase A first (sequencing lock), then Phase B once Phase A is committed.
