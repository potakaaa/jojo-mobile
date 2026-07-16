---
name: plan:adm-008-coupons-phase-05-admin-ui
description: "ADM-008 Coupons — Phase 05: apps/admin UI for Promotions/Offers/Coupon-issuance"
date: 16-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: phase-05
---

# Phase 05 — apps/admin UI (Promotions / Offers / Coupon Issuance)

**Program:** adm-008-coupons
**Umbrella plan:** process/features/admin-dashboard/active/adm-008-coupons_16-07-26/adm-008-coupons_UMBRELLA_PLAN_16-07-26.md
**Phase status:** ⏳ PLANNED — validate-contract SEEDED (CONDITIONAL) from source plan's outer-pvl VALIDATE pass; needs inner PVL confirmation before EXECUTE
**Report destination:** process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-05-admin-ui_REPORT_{dd-mm-yy}.md (flat in the program task folder)

---

## Purpose

The admin-facing UI surface for the program: Promotions list/create, Offers list/create/detail, and
the "Generate Coupons" issuance flow (bulk N + optional single-customer targeted issuance), plus a
coupon list sub-view under each Offer's detail page. Reuses the existing shared composites
(`data-table`/`form-dialog`/`confirm-dialog`/`query-states`/`page-header`) and follows the P3
TanStack Start nested-detail-route `<Outlet/>` pattern. **Depends on Phase 3** (admin CRUD routes:
`admin-promotions.ts`/`admin-offers.ts`/`admin-coupon-issuance.ts` must exist and be typed before
this phase's hooks/fetch wrappers can be written against them).

---

## Entry Gate

- Phase 3 exit gate passed (`admin-promotions.integration.test.ts`, `admin-offers.integration.test.ts`,
  `admin-coupon-issuance.integration.test.ts` all green; `pnpm --filter @jojopotato/api typecheck`
  clean — Promotion/Offer/Coupon admin routes + `AdminPromotion`/`AdminOffer`/`AdminCoupon`
  types/serializers exist and are stable).

---

## Blast Radius

- `apps/admin/src/config/nav-config.ts` (add 2 nav items)
- `apps/admin/src/features/promotions/**` (new: list + create/edit form-dialog)
- `apps/admin/src/features/offers/**` (new: list + create/edit dialog + detail page with
  "Generate Coupons" action + coupon list sub-view)
- `apps/admin/src/routes/(dashboard)/promotions.tsx` (new, thin `<Outlet/>` layout)
- `apps/admin/src/routes/(dashboard)/promotions.index.tsx` (new, list page)
- `apps/admin/src/routes/(dashboard)/offers.tsx` (new, thin `<Outlet/>` layout)
- `apps/admin/src/routes/(dashboard)/offers.index.tsx` (new, list page)
- `apps/admin/src/routes/(dashboard)/offers.$offerId.tsx` (new, detail page)
- new `apps/admin` component/hook test files (`*.test.tsx`) for the above

---

## Locked Decisions Referenced (do not re-litigate)

- **Naming-collision guard (SPEC Constraints):** nav-config.ts MUST NOT add an item labeled "Deals"
  — the existing item at `id: 'deals'`, `to: '/deals'` (ADM-004 bundle-Deals feature) already owns
  that label. This phase adds "Promotions" (`/promotions`) and "Offers" (`/offers`) only. Coupons
  are reached FROM an Offer's detail page — there is no standalone top-level "Coupons" nav item.
- **TanStack Start nested-detail-route `<Outlet/>` gotcha (durable, P3-established):** a
  `foo.$id.tsx` file auto-nests under `foo.tsx` (shared filename prefix). The parent MUST render
  `<Outlet/>` or the child route mounts nowhere. Apply the layout+index(+detail) split from session
  start for both `promotions` and `offers` — do not build a flat single-file route and discover the
  gotcha the hard way (P3's own history).
- **Shared composite reuse (mandatory, per ADM-004a Phase 3/4a precedent):** `data-table`,
  `form-dialog`, `confirm-dialog`, `query-states`, `page-header` are confirmed available in
  `apps/admin/src/components/**` — reuse them for Promotions/Offers list+dialog UI rather than
  building new one-off components. Do not build a local duplicate of any of these five.
- **Coupon list sub-view (SPEC-derived):** the Offer detail page's coupon list shows code, status,
  user (if targeted), and expires_at, and supports copy (and, per SPEC, export) of generated codes.
  This is a sub-view of the Offer detail page, not a separate route.
- **"Generate Coupons" action inputs (SPEC-derived):** quantity input (bulk), optional
  single-customer picker (targeted issuance — mutually exclusive with bulk quantity > 1, per
  Phase 3's admin-coupon-issuance route contract), optional expiry override.

---

## Implementation Checklist

### Step A — Nav wiring

- [ ] A1. In `apps/admin/src/config/nav-config.ts`, add two new items under the "Management" group:
      `{ id: 'promotions', label: 'Promotions', to: '/promotions' }` and
      `{ id: 'offers', label: 'Offers', to: '/offers' }`. Verify neither `id` nor `label` collides
      with the existing `id: 'deals'` item — do this by reading the real current file, not from
      memory (file has evolved since ADM-004a).

### Step B — Promotions feature + routes

- [ ] B1. Build `apps/admin/src/features/promotions/lib/admin-promotions-api.ts` — fetch wrapper
      (`credentials: 'include'` convention) against Phase 3's `admin-promotions.ts` routes
      (list/get/create — SPEC does not require edit/deactivate for Promotions; confirm against the
      real Phase 3 route surface at RESEARCH time before assuming create-only).
- [ ] B2. Build `apps/admin/src/features/promotions/hooks/use-admin-promotions.ts` — react-query
      list/detail + create mutation, following the `use-admin-branches.ts` pattern.
- [ ] B3. Build `apps/admin/src/features/promotions/components/` — list view (via `data-table`) +
      create form-dialog (via `form-dialog`) with fields: name, description, window (start/end
      dates).
- [ ] B4. Build `apps/admin/src/routes/(dashboard)/promotions.tsx` (thin `<Outlet/>` layout).
- [ ] B5. Build `apps/admin/src/routes/(dashboard)/promotions.index.tsx` (list page, wired to B2/B3).

### Step C — Offers feature + routes

- [ ] C1. Build `apps/admin/src/features/offers/lib/admin-offers-api.ts` — fetch wrapper against
      Phase 3's `admin-offers.ts` routes (list/get/create) AND Phase 3's
      `admin-coupon-issuance.ts` route (generate coupons for an offer).
- [ ] C2. Build `apps/admin/src/features/offers/hooks/use-admin-offers.ts` — react-query
      list/detail + create mutation.
- [ ] C3. Build `apps/admin/src/features/offers/hooks/use-generate-coupons.ts` — react-query
      mutation wrapping the coupon-issuance route; invalidates the offer's coupon-list query on
      success.
- [ ] C4. Build `apps/admin/src/features/offers/components/` — list view (via `data-table`) +
      create/edit dialog (via `form-dialog`) with fields: mechanic, value, min order, caps, window,
      optional Promotion link (dropdown sourced from B2's list query); detail page composing a
      "Generate Coupons" action panel (quantity input, optional single-customer picker, optional
      expiry override — via `form-dialog` or an inline panel) PLUS a coupon list sub-view
      (`data-table` columns: code, status, user if targeted, expires_at) with a copy-code action
      per row.
- [ ] C5. Build `apps/admin/src/routes/(dashboard)/offers.tsx` (thin `<Outlet/>` layout).
- [ ] C6. Build `apps/admin/src/routes/(dashboard)/offers.index.tsx` (list page, wired to C2/C4).
- [ ] C7. Build `apps/admin/src/routes/(dashboard)/offers.$offerId.tsx` (detail page: Offer detail +
      "Generate Coupons" action + coupon list sub-view, wired to C2/C3/C4).

### Step D — Test gates

- [ ] D1. Write `apps/admin` vitest + `@testing-library/react` component tests for the new
      Promotions list + create-dialog components (Fully-Automated, DOM-testable render/interaction
      assertions — not a full route-mount test).
- [ ] D2. Write component tests for the new Offers list + create-dialog + "Generate Coupons" action
      panel (Fully-Automated).
- [ ] D3. Run `pnpm --filter @jojopotato/admin typecheck`.
- [ ] D4. Run `pnpm --filter @jojopotato/admin test` — confirm zero regressions.
- [ ] D5. **Agent-Probe manual walkthrough** (mirrors P3's AC8 pattern — the user verifies UI
      manually per project convention): create Promotion → create Offer (optionally linked to the
      Promotion) → Generate Coupons (bulk N + one targeted) → view the coupon list sub-view → copy a
      code. Confirm nav renders "Promotions"/"Offers" with no "Deals" collision, and the
      `<Outlet/>` layout+index(+detail) split navigates correctly for both features (list → detail
      for Offers).

---

## Exit Gate

```bash
pnpm --filter @jojopotato/admin typecheck
# Expected: 0 errors

pnpm --filter @jojopotato/admin test
# Expected: full suite green, new Promotions/Offers component tests pass, zero regressions
```

- All checklist items (A–D) checked.
- The UI surface of AC1, AC2, AC3, AC4 confirmed reachable end-to-end via the admin dashboard
  (Agent-Probe walkthrough, Step D5).
- Phase report written to report destination above, including the Agent-Probe walkthrough outcome.

---

## Blockers That Would Justify BLOCKED Status

- Phase 3 exit gate not yet passed (hard dependency — no admin CRUD routes to build against).
- Phase 3's real route contracts (request/response shapes, optional-field names for Promotion link,
  quantity/targeted-customer fields on coupon issuance) diverge materially from what this plan
  assumes — investigate and reconcile against the real Phase 3 route source before force-fitting UI
  fields.
- No `apps/admin` browser/E2E runner exists (project-wide known gap, same as ADM-002/ADM-003) — the
  Agent-Probe walkthrough (D5) is manual-only; this is expected, not a blocker, per the program's
  Verification Evidence table (gap-resolution D, named residual).

---

## Phase Loop Progress

- [ ] 1. RESEARCH — research-agent: re-read the REAL current `nav-config.ts`, the REAL current
      Phase 3 admin route contracts (`admin-promotions.ts`/`admin-offers.ts`/
      `admin-coupon-issuance.ts`), confirm Phase 3 landed cleanly and its request/response shapes
      match this plan's field assumptions (Step B1/C1); confirm the shared composites
      (`data-table`/`form-dialog`/`confirm-dialog`/`query-states`/`page-header`) are still present
      and unchanged at their expected paths.
- [ ] 2. INNOVATE — innovate-agent: expected n/a (Locked Decisions above already resolve nav
      naming, route split, and composite reuse; only open call is exact form-field layout, which is
      mechanical UI work, not a design decision).
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: update this phase plan with research findings, or mark
      "n/a — research clean".
- [x] 4. PVL — SEEDED below from source plan's outer-pvl VALIDATE pass. Orchestrator MUST still
      spawn vc-validate-agent for inner PVL re-confirmation before EXECUTE.
- [ ] 5. EXECUTE — all checklist items (A–D) done; test gates green.
- [ ] 6. EVL — all EVL gates green; follow-up stubs registered; EVL HANDOFF SUMMARY written.
- [ ] 7. UPDATE PROCESS — phase report written, umbrella state updated, **commit checkpoint**
      (staging commands + commit summary handed to user — no auto-commit).

**Validate-contract required before execute.**

---

## Touchpoints

- `apps/admin/src/config/nav-config.ts`
- `apps/admin/src/features/promotions/**` (new)
- `apps/admin/src/features/offers/**` (new)
- `apps/admin/src/routes/(dashboard)/promotions.tsx` (new)
- `apps/admin/src/routes/(dashboard)/promotions.index.tsx` (new)
- `apps/admin/src/routes/(dashboard)/offers.tsx` (new)
- `apps/admin/src/routes/(dashboard)/offers.index.tsx` (new)
- `apps/admin/src/routes/(dashboard)/offers.$offerId.tsx` (new)

---

## Public Contracts

- No server-side contract changes in this phase — pure UI consumption of Phase 3's already-locked
  admin route contracts (`admin-promotions.ts`/`admin-offers.ts`/`admin-coupon-issuance.ts`).
- `nav-config.ts`'s `navConfig` array gains 2 new entries (additive); no existing entries are
  modified or removed.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `apps/admin` component tests — Promotions list + create-dialog render/interaction | Fully-Automated | AC1 (UI surface) |
| `apps/admin` component tests — Offers list + create-dialog + Generate-Coupons action panel render/interaction | Fully-Automated | AC2, AC3, AC4 (UI surface) |
| `pnpm --filter @jojopotato/admin typecheck` | Fully-Automated | UI compiles against Phase 3's real route/type contracts |
| `pnpm --filter @jojopotato/admin test` (full suite) | Fully-Automated | Regression bar — zero diffs on existing `apps/admin` suites |
| Agent-Probe manual walkthrough: create Promotion → create Offer → Generate Coupons (bulk + targeted) → view coupon list → copy code; nav-collision + `<Outlet/>` split sanity check | Agent-Probe | Full admin walkthrough (program Verification Evidence row) — UI usability judgment, layered on top of already-Fully-Automated AC1-4 money-correctness coverage, not a substitute for it (per program C-4 reconciliation) |

```bash
pnpm --filter @jojopotato/admin typecheck
pnpm --filter @jojopotato/admin test
```

---

## Test Infra Improvement Notes

(none identified yet)

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-05-admin-ui_PLAN_16-07-26.md`
- Last completed step: none — phase not yet started; depends on Phase 3.
- Validate-contract status: SEEDED (CONDITIONAL) — pending inner PVL re-confirmation.
- Supporting context files loaded: master plan
  `adm-008-coupons_PLAN_16-07-26.md` (Phase 5 checklist steps 20–25, Touchpoints rows, Verification
  Evidence table), phase-02 plan (format template).
- Next step: after Phase 3 exit gate passes, spawn vc-research-agent (or vc-validate-agent directly
  for PVL re-confirmation) for Phase 5.

---

## Validate Contract

Status: CONDITIONAL (SEEDED from source plan's outer-pvl VALIDATE pass, 16-07-26 — re-confirm via
inner PVL before EXECUTE)
Date: 16-07-26
date: 2026-07-16
generated-by: outer-pvl

Test gates (subset of source plan's C3 table relevant to this phase):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| — | `apps/admin` UI compiles/renders | Fully-Automated | `pnpm --filter @jojopotato/admin typecheck` + `pnpm --filter @jojopotato/admin test` | A |
| AC1 (UI surface) | Admin can create a Promotion via the dashboard | Agent-Probe (backed by Fully-Automated component tests for the dialog itself) | Manual walkthrough per this phase's checklist step D5 + `apps/admin` component tests (D1) | A (component tests) / D (walkthrough — named residual, not a substitute for AC1's real Fully-Automated coverage in Phase 3) |
| AC2 (UI surface) | Admin can create an Offer via the dashboard, optionally linked to a Promotion | Agent-Probe (backed by Fully-Automated component tests) | Manual walkthrough (D5) + `apps/admin` component tests (D2) | A / D |
| AC3 (UI surface) | Admin can bulk-generate N coupon codes via the dashboard | Agent-Probe (backed by Fully-Automated component tests) | Manual walkthrough (D5) + `apps/admin` component tests (D2) | A / D |
| AC4 (UI surface) | Admin can issue a single targeted coupon via the dashboard | Agent-Probe (backed by Fully-Automated component tests) | Manual walkthrough (D5) + `apps/admin` component tests (D2) | A / D |

gap-resolution legend: A — proven now. B — fixed in this plan (gate added/corrected by VALIDATE, to
be exercised by EXECUTE). D — backlog/residual (named, not silently dropped — see program C-4
reconciliation: the Agent-Probe walkthrough is a UI-usability layer on top of already-Fully-Automated
money-correctness coverage delivered in Phase 3, never a substitute for it).

Dimension findings (from source plan's VALIDATE pass, Phase 5 row):
- PASS — `nav-config.ts` collision check mechanically verified against the real current file
  (existing item at `id: 'deals'`, `to: '/deals'`); the two new items ("Promotions"/"Offers") do not
  collide.
- PASS — existing shared composites (`data-table`/`form-dialog`/`confirm-dialog`/`query-states`/
  `page-header`) confirmed available per the ADM-004a Phase 3/4a precedent.
- PASS — the TanStack Start nested-detail-route `<Outlet/>` gotcha is correctly anticipated; the
  layout+index+detail split pattern is already locked into this phase's Touchpoints table (Steps
  B4/B5, C5/C6/C7).

Open gaps: none carried as Known-Gap for the money-correctness ACs (AC1-4 are already
Fully-Automated-proven in Phase 3; this phase's coverage is UI-surface only, explicitly labeled as
such above). The Agent-Probe walkthrough residual (gap-resolution D) is a named, expected gap per
project convention (no `apps/admin` browser/E2E runner exists yet — project-wide, not specific to
this phase).

What this coverage does NOT prove:
- This phase's tests do NOT re-prove money correctness (discount calculation, atomic burn,
  collision-free code generation) — that is Phase 2/3's job. This phase proves the UI surface is
  reachable and renders/interacts correctly.
- The Agent-Probe walkthrough is UI usability judgment only, not automated regression protection —
  a future UI regression in this surface would not be caught without a new automated test or a
  repeat manual walkthrough.

Gate: CONDITIONAL (0 unresolved FAILs; all CONCERNs resolved via direct plan-text updates inherited
from the source plan's single-shot VALIDATE pass; residual risk is normal pre-EXECUTE
unproven-until-tested risk, plus the expected-and-named Agent-Probe-only residual on UI usability).
Accepted by: session (autonomous, inherited from source plan's single-shot VALIDATE pass).
