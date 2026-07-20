---
name: note:menu-003-admin-invisible-deal-indicator
description: "No admin-facing indicator that a deal is invisible to customers due to an unavailable component or zero components (accepted gap from MENU-003)"
date: 17-07-26
feature: admin-dashboard
---

# Admin has no indicator for a deal that is invisible to customers (MENU-003 gap)

**Status:** accepted gap, filed by MENU-003 (issue #98). Not a defect in MENU-003 — an
explicitly out-of-scope item from its locked SPEC.

## TL;DR

MENU-003 made deals disappear from a branch's Deals list when any component is unavailable
there, and everywhere when a deal has zero components. Both are correct and user-decided. But
the admin UI gives **no signal that either happened** — a deal can be silently invisible to
every customer while the admin screen shows it as a normal, active deal.

## What MENU-003 changed

A deal-product is now listed at a branch only when:

1. it has **at least one** component, AND
2. **every** component is available there (`branch_product_availability.is_available = true`
   AND `products.is_active = true`).

Order placement enforces the same rule server-side (AC5).

## The gap

There is no admin-facing equivalent of ADM-008 Fix 3's `availableBranchCount` /
`activeBranchCount` fields for either invisibility cause:

- **Component-down invisibility** — one ingredient toggled off at a branch silently pulls
  every deal that uses it from that branch's list. The admin Deals screen still shows the
  deal as active with a healthy branch count, because the deal's OWN
  `branch_product_availability` rows are untouched. Nothing in the UI traces the deal's
  visibility through its components.
- **Zero-component invisibility** — a deal with no `deal_components` rows is hidden at every
  branch, with no error, no warning, and no indicator. This one is sharper: the create flow
  is a 2-step wizard (details, then items), so a deal that is saved but never gets components
  attached is invisible everywhere and looks completely normal in the admin list.

The SPEC named the zero-component case as a known, accepted cost of the "hide everywhere"
decision, and explicitly deferred the indicator work.

## Concrete evidence found during MENU-003 EXECUTE

Four pre-existing tests in `packages/api/src/lib/__tests__/admin-deals.integration.test.ts`
seeded deals via a raw `createDeal()` test helper (a direct `POST /api/admin/deals` call with
no `components[]`) and asserted they were listed and orderable. All four went red under the new
rule and were updated to attach one available component (a mechanical test-data adaptation to a
SPEC-locked behavior change, not a product fix).

**Correction (this UPDATE PROCESS pass, 17-07-26):** an earlier draft of this note claimed
zero-component creation was "the natural default of the current create flow." That is **wrong**
and has been corrected. The orchestrator verified `apps/admin/src/features/deals/components/
deal-create-wizard.tsx` directly: the wizard is double-guarded against a componentless save —
the step-1→2 advance path early-returns when `items.length === 0` (line 135), and the final
Create button is `disabled={items.length === 0 || !priceValid}` (line 414). **A deal with zero
components cannot be created through the admin UI.** The only way to reach the zero-component
state is a raw API call bypassing the wizard entirely — exactly what the test helper does, and
exactly why the tests, not the product, hit this path. The real risk is therefore lower than
originally stated: it requires someone calling the API directly (a script, a future integration,
or a bug in a future admin surface), not an admin accidentally clicking through the wizard.
The **component-down invisibility** case above (toggling an ingredient off after a deal is
live) remains the more realistic and higher-probability gap of the two — it needs no API
bypass, just normal availability-editor use.

## Suggested direction (not a decision)

Any of these would close it; none are specified or approved:

- Extend the admin deal serializer with a derived "customer-visible at N of M branches" count
  that walks components, alongside the existing `availableBranchCount`/`activeBranchCount`.
- Reuse `apps/admin`'s existing `StatusBadge` + `lib/entity-status.ts` derivations (ADM-008
  Fix 3) to render an explicit "Invisible — no components" / "Invisible at N branches —
  component unavailable" state on the Deals list and manage pages.
- A create-flow warning when a deal is saved with zero components.

Note the deals-vs-offers scoping asymmetry documented in ADM-008 Fix 3 still applies: an
empty `offer_branches` means "valid everywhere", but a missing/false
`branch_product_availability` row means "visible nowhere". Deals are the only entity with the
"invisible everywhere" trap, and MENU-003 adds a second way to fall into it.

## Partial update (20-07-26, DEAL-005 Phase 2 UPDATE PROCESS pass)

DEAL-005 (Phase 1 + Phase 2, issue #127) added two NEW ways a deal can be invisible to customers
— scheduled-but-not-yet-started and expired (Phase 1's absolute window), plus outside-recurring-
hours (Phase 2) — and shipped a `Scheduled`/`Live`/`Expired` badge (`windowPhase()`/
`dealStatus()` in `apps/admin/src/lib/entity-status.ts`) plus an additive `Recurring` badge,
both rendered on `deal-list.tsx` and `deals.$dealId.tsx`. **These two gaps are now CLOSED** — an
admin can see at a glance whether a deal is scheduled, live, expired, or currently outside its
recurring hours.

**What remains uncovered — the original component-availability and zero-component cases
described above are UNCHANGED and still open.** DEAL-005's badges derive purely from the deal's
own absolute window and recurrence columns; they have no visibility into
`branch_product_availability` on the deal's components, and no signal for a deal with zero
`deal_components` rows. The two gap classes are now clearly distinguishable:

- **Time-window invisibility (Scheduled/Live/Expired/Recurring)** — closed by DEAL-005's badges.
- **Component-availability invisibility (this note's original scope)** — still open, still the
  higher-probability real-world case (toggling an ingredient off needs no API bypass).
- **Zero-component invisibility (this note's original scope)** — still open, but confirmed
  lower-risk than originally stated (requires a raw API call bypassing the wizard's own guards).

## References

- Plan: `process/features/ordering-cart/active/menu-003-branch-availability_17-07-26/menu-003-branch-availability_PLAN_17-07-26.md`
  (Section 8, step 17)
- SPEC: same folder, `menu-003-branch-availability_SPEC_17-07-26.md` — Out Of Scope +
  Constraints (the locked zero-component-hide decision)
- Related: ADM-008 Fix 3 (`availableBranchCount`/`activeBranchCount`, `StatusBadge`,
  `lib/entity-status.ts`) — the existing precedent this would extend
- Related: DEAL-005 Phase 1
  (`process/features/admin-dashboard/completed/deal-005-scheduled-deals_20-07-26/`) and Phase 2
  (`process/features/admin-dashboard/active/deal-005-recurring-schedules_20-07-26/`) — closed the
  time-window invisibility gap via `Scheduled`/`Live`/`Expired`/`Recurring` badges; component-
  availability and zero-component invisibility remain open
