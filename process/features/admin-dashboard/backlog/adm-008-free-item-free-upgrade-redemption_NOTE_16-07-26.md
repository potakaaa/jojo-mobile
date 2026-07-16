---
name: backlog:adm-008-free-item-free-upgrade-redemption
description: "free_item and free_upgrade Offer mechanics are selectable in admin but do not discount at checkout — redemption math + target-product scoping is unimplemented"
date: 16-07-26
metadata:
  node_type: memory
  type: backlog
  feature: admin-dashboard
---

# ADM-008 — free_item / free_upgrade redemption math not implemented

**Priority:** Medium — not a regression (both mechanics predate ADM-008 as inert/dormant), but now
user-facing again via the Offer create form, so the gap is more visible than before.

**Problem:**

`packages/utils/src/discount.ts`'s `computeDealDiscountCents()` (lines ~179-185) returns `0` for
`free_item` and `free_upgrade` mechanics — no discount is computed. Offers of these two mechanics
also have no per-mechanic target-product scoping UI (which product is "free" / "upgraded" is not
capturable anywhere in the admin Offer form or schema).

As of Phase 5's follow-up fix (`ab53caf`), the Offer create form's Mechanic dropdown is restricted
to the 4 coupon-based types: `percentage_discount`, `fixed_discount`, `free_item`, `free_upgrade`
(only `buy_one_take_one`/`bundle` were dropped, as deal/bundle-style and non-discounting). This
means an admin CAN create a Promotion → Offer → Coupon with mechanic `free_item` or `free_upgrade`,
issue codes for it, and a customer CAN apply that coupon at checkout — but the discount computed
will be `0` (no error, no rejection — just silently no monetary effect), because
`computeDealDiscountCents()` has no case for these mechanics.

**Root cause:** ADM-008's scope (per the Program Goal Charter) was resolver + burn + admin CRUD for
the money-correctness-critical mechanics (`percentage_discount`, `fixed_discount`) — `free_item`/
`free_upgrade` redemption math and target-product scoping were never in the 5-phase plan's AC list
and were not implemented.

**Fix options:**
1. Implement full redemption math for `free_item` (100% off one unit of a designated product) and
   `free_upgrade` (delta between two designated products), plus admin UI to pick the target
   product(s) per Offer — this is real money-path work requiring its own SPEC/plan/VALIDATE cycle
   (small phase), since Known-Gap is banned for money-correctness per the program's own charter.
2. Short-term: remove `free_item`/`free_upgrade` from the admin Mechanic dropdown entirely (same
   treatment as `buy_one_take_one`/`bundle`) until option 1 lands, closing the silent-zero-discount
   gap immediately with a one-line UI change.

**Recommendation:** option 2 now (cheap, closes the user-facing gap), option 1 as a future phase
when there's product demand for free-item/free-upgrade promotions.

**Not a regression:** money-correctness ACs actually delivered by ADM-008 (AC3, AC5, AC6, AC11 —
percentage/fixed discount, resolver, is_deal guard, burn) are all proven by real passing Fully-
Automated tests, per the program's Known-Gap ban. This gap is scoped OUTSIDE those ACs.

---

## Other ADM-008 open items carried forward (cross-reference, not duplicated in full)

- **400-vs-422 malformed coupon-generation payload:** currently 400, matches existing ADM-004
  admin-CRUD convention (see umbrella plan §Locked, non-reopened SPEC Open Questions). Left as-is —
  not a defect, just a documented convention choice.
- **`deal_components` CHECK constraints deferred** (ADM-004, unrelated to the coupons rename):
  `process/features/admin-dashboard/backlog/adm-004-deal-components-check-constraints-deferred_NOTE_16-07-26.md`
- **`products.is_deal` partial index deferred** (ADM-004, unrelated to the coupons rename):
  `process/features/admin-dashboard/backlog/adm-004-is-deal-partial-index-deferred_NOTE_16-07-26.md`
