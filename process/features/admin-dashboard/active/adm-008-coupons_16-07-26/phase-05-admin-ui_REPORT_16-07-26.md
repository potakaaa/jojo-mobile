---
phase: phase-05-admin-ui
date: 2026-07-16
status: COMPLETE
feature: admin-dashboard
plan: process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-05-admin-ui_PLAN_16-07-26.md
---

# Phase 05 — apps/admin UI (Promotions / Offers / Coupon Issuance) — EXECUTE Report

**TL;DR:** All checklist items A–D done. `apps/admin` typecheck clean (0 errors), test suite
21/21 green (7 files, +5 new component test files, 0 regressions), build succeeds with a clean
TanStack route-tree regeneration. Pure UI consumption of Phase 3's already-locked admin routes —
no schema/auth/API/backend changes. Not committed (handed to user). D5 Agent-Probe walkthrough is
the user's job — checklist below.

---

## What Was Done

### A — Nav (`nav-config.ts`)
Added TWO items under the "Management" group: `{ id: 'promotions', label: 'Promotions', to:
'/promotions', icon: Megaphone }` and `{ id: 'offers', label: 'Offers', to: '/offers', icon:
Ticket }`. Verified against the real current file — no id/label collision (existing ids:
dashboard, branches, categories, products, deals, users, components). The existing `id: 'deals'`
(ADM-004) item is untouched; NO "Deals" item was added. Coupons have no top-level nav item
(reached from an Offer detail page).

### B — Promotions feature + routes
- `features/promotions/lib/admin-promotions-api.ts` — fetch wrapper (`credentials: 'include'`),
  mirrors `admin-branches-api.ts`. `AdminPromotion` interface matches the server serializer
  verbatim. list/get/create (create-only per SPEC — the real route also exposes PATCH, but SPEC
  does not require edit for Promotions).
- `features/promotions/hooks/use-admin-promotions.ts` — react-query list/detail + create mutation
  (invalidates the list on success), mirrors `use-admin-branches.ts`.
- `features/promotions/components/promotion-list.tsx` — consumes shared `DataTable`.
- `features/promotions/components/promotion-form.tsx` — create form (name, description, start/end
  window via `datetime-local`, normalized to ISO).
- `routes/(dashboard)/promotions.tsx` — thin `<Outlet/>` layout.
- `routes/(dashboard)/promotions.index.tsx` — list page (PageHeader + FormDialog + PromotionForm).

### C — Offers feature + routes
- `features/offers/lib/admin-offers-api.ts` — fetch wrapper against `/api/admin/offers` (list /
  get / create / update) AND `/api/admin/coupons` (generate + per-offer list). `AdminOffer` /
  `AdminCoupon` match the server serializers verbatim. `OFFER_TYPE_OPTIONS` mirrors the 6-value
  enum. Money is cents at the boundary.
- `features/offers/hooks/use-admin-offers.ts` — list/detail + create/update mutations.
- `features/offers/hooks/use-generate-coupons.ts` — per-offer coupon list query + generate
  mutation (invalidates the offer's coupon-list query on success).
- `features/offers/components/offer-list.tsx` — shared `DataTable`; polymorphic value column
  (% for percentage, ₱ for fixed, — for complex); Manage → detail, Edit → dialog.
- `features/offers/components/offer-form.tsx` — create/edit dialog: title, description, mechanic
  (6-value select), polymorphic discount value (₱/% label, hidden for the 4 complex types), min
  order, usage caps, window, optional Promotion link dropdown (sourced from the promotions list).
- `features/offers/components/generate-coupons-panel.tsx` — quantity (bulk), targeted toggle
  (pins quantity to 1 + reveals Customer ID), optional expiry override. Enforces the route
  contract (targeted ⇒ quantity === 1) client-side AND relies on the server `.refine`.
- `features/offers/components/coupon-list.tsx` — shared `DataTable`: code, status, recipient
  (targeted userId vs "Bulk"), expiry, per-row copy-code action.
- `routes/(dashboard)/offers.tsx` — thin `<Outlet/>` layout (detail route mounts into it).
- `routes/(dashboard)/offers.index.tsx` — list page (create/edit dialog wired).
- `routes/(dashboard)/offers.$offerId.tsx` — detail page: offer summary + GenerateCouponsPanel +
  CouponList sub-view.

### D — Tests
5 new `@testing-library/react` + vitest component test files (jsdom, no route-mount):
- `promotion-list.test.tsx` (rows / empty / loading)
- `promotion-form.test.tsx` (valid submit payload / empty-name guard)
- `offer-list.test.tsx` (rows + polymorphic value / Manage+Edit callbacks / empty)
- `offer-form.test.tsx` (PHP→cents conversion / complex-mechanic hides value field)
- `generate-coupons-panel.test.tsx` (bulk N / targeted pins quantity=1 + reveals customer field /
  targeted-without-id blocked)

## Composite-Reuse Confirmation (no duplicates built)
Reused the 5 shared composites, built ZERO local duplicates:
- `DataTable` — PromotionList, OfferList, CouponList
- `FormDialog` — promotions.index, offers.index
- `PageHeader` — every list + detail page
- `QueryStates` — offers.$offerId detail
- `ConfirmDialog` — available but not needed this phase (no destructive/price-change action; Offers
  have no deactivate endpoint in the Phase 3 route surface). No one-off confirm dialog was built.

## Test Gate Outcomes (exact output)
```
=== TYPECHECK ===  pnpm --filter @jojopotato/admin typecheck
> tsc --noEmit        (0 errors)

=== TEST ===  pnpm --filter @jojopotato/admin test
 Test Files  7 passed (7)
      Tests  21 passed (21)

=== BUILD ===  pnpm --filter @jojopotato/admin build
✓ built  (route tree regenerated clean — chunks emitted for
 promotions.index, offers.index, offers._offerId)
```
Prettier: all touched files pass `prettier --check` (2 test/form files + the offers detail route
were `--write`-normalized during EXECUTE).

## Plan Deviations
- **None hard-stop.** All changes are within `apps/admin` blast radius (pure UI, no
  schema/auth/API/backend surface). Implementation notes:
  1. **Promotions UI is create-only** — the real `admin/promotions.ts` route exposes PATCH, but
     SPEC/plan (B1) scope Promotions to list/get/create for the UI. No edit action built. Matches
     plan intent.
  2. **Offer discount-value field is polymorphic and uniformly ×100** — the admin boundary stores
     the raw value ×100 as `discountValueCents` (`centsToNumeric`/`numericToCents` round-trip), so
     a percentage entered as `10` → `discountValueCents 1000` → server `"10.00"` → read back as 10%.
     Same math (×100) for fixed pesos. The input label switches ₱/% by mechanic; the field is
     hidden for the 4 complex mechanics (no scalar value). Correct against the real Phase 3 contract.

## Test Infra Gaps Found
- No `apps/admin` browser/E2E runner exists (project-wide known gap, same as ADM-002/003/004) — the
  D5 Agent-Probe walkthrough is manual-only, per the program Verification Evidence table
  (gap-resolution D, named residual). Not a blocker.
- Component tests bypass jsdom's native `required`-field gating via `fireEvent.submit(form)` for the
  two negative-path tests (validating the components' own JS guard branch, which is the belt to the
  native `required` suspenders).

## Closeout Packet
- **Selected plan:** `process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-05-admin-ui_PLAN_16-07-26.md`
- **Finished:** All A–D checklist items; 15 new source files + 5 new test files + 1 nav-config edit.
- **Verified:** typecheck 0 errors, 21/21 tests, build clean (route tree regenerated), Prettier clean.
- **Unverified:** D5 Agent-Probe manual walkthrough (user's job — no admin E2E runner). Phase 2
  (resolver/burn) has since landed, so "Generate Coupons" → redemption end-to-end is now exercisable.
- **Remaining:** none — UPDATE PROCESS complete; program shipped via `feat/deals_unification`.
- **High-risk pack:** N/A for Phase 5 — pure UI consumption, no schema/auth/billing/API surface.
  The program's high-risk evidence pack applies to Phases 1–4 (schema migration + public API +
  discount logic), not this UI phase.
- **Best next state:** Phase 5 CODE-COMPLETE / EVL-green; program held OPEN in `active/` for
  follow-up exploration (not archived).

## Follow-up Stubs Created
- None. No new backlog artifacts required (the admin-E2E-runner gap is pre-existing and already
  tracked project-wide).

## D5 — Agent-Probe Manual Walkthrough Checklist (for the USER)
Run against the admin dev server (`pnpm --filter @jojopotato/admin dev`, port 3100) with the API up
and a super_admin session. What to click / what to expect:

1. **Nav sanity** — Sidebar → "Management" group now shows **Promotions** and **Offers** (Megaphone
   + Ticket icons). The existing **Deals** item is still there and unchanged (no collision, no
   duplicate "Deals").
2. **Create a Promotion** — Promotions → "New promotion" → fill name + description + start/end →
   Create. Expect: dialog closes, the promotion appears in the list.
3. **Create an Offer linked to it** — Offers → "New offer" → title, mechanic = "Percentage
   discount", value = 10, min order = 50, window, **Promotion = the one you just made** → Create.
   Expect: dialog closes, offer appears with "Percentage discount" + "10%" in the Value column.
4. **List → detail navigation** — Offers → "Manage" on the offer. Expect: URL → `/offers/{id}`, the
   detail page paints (offer summary + Generate panel + empty "Issued coupons" list). (This proves
   the `<Outlet/>` layout+index+detail split works — no blank screen.)
5. **Generate Coupons (bulk)** — On the detail page, Quantity = 5 → Generate. Expect: "Issued 5
   coupons." and 5 rows in the Issued-coupons list, all "Bulk" recipient.
6. **Generate Coupons (targeted)** — Check "Issue to a specific customer" → quantity locks to 1 and
   disables → paste a real customer UUID → Generate. Expect: "Issued 1 coupon." and a new row with
   recipient "Targeted · {first8}…".
7. **Copy a code** — Click "Copy" on any coupon row. Expect: the code is on your clipboard
   (paste to confirm).
```

## Forward Preview

### Test Infra Found
- `apps/admin` vitest + `@testing-library/react` (jsdom) is the component-test surface. Negative-path
  form tests must submit the form directly (`fireEvent.submit`) to bypass jsdom native `required`
  gating. No route-mount / E2E runner — component tests render presentational components with props.

### Blast Radius Changes
- Additive only within `apps/admin`: 2 nav entries, 2 new feature folders
  (`features/{promotions,offers}`), 5 new routes under `(dashboard)/`. Zero backend/schema/type
  changes. `routeTree.gen.ts` regenerated by the build.

### Commands to Stay Green
```
pnpm --filter @jojopotato/admin typecheck
pnpm --filter @jojopotato/admin test
pnpm --filter @jojopotato/admin build
```

### Dependency Changes
- None. No new packages. Uses existing `@tanstack/react-query`, `@tanstack/react-router`,
  `lucide-react`, `radix-ui`.
