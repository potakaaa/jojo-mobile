---
name: backlog:offer-usage-limits-unenforced-coupon-path
description: "offers.usage_limit_per_user and offers.total_usage_limit are never enforced on the coupon redemption path — the resolver passes an empty usage array; per-code single-use is still enforced via the atomic burn, but a bulk-issued code's total_usage_limit and a targeted customer's usage_limit_per_user are silent no-ops"
date: 17-07-26
metadata:
  node_type: memory
  type: backlog
  feature: admin-dashboard
---

# Offer usage-limit fields unenforced on the coupon redemption path (D6)

**Priority:** Medium — real, deliberately-descoped gap (not a regression, not new). Descoped
explicitly in the ADM-008 POST-MERGE FIX 6 (`adm-008-free-mechanics`) SPEC as D6, and the user
re-confirmed this descope on 17-07-26 during the fix batch's closing review.

**Problem:**

`offers.usage_limit_per_user` and `offers.total_usage_limit` exist as columns and are set by the
admin Offer create/edit form, but `resolveCouponDiscount()` calls `checkDealEligibility()` with an
empty `usage: []` array on the coupon path — the eligibility engine's own usage-limit checks
therefore always see zero prior usage and never reject on this basis.

**What IS enforced (so this is not a total gap):** per-code single-use is still real — each
individual coupon code has its own atomic burn (`UPDATE ... WHERE status = 'available'`), so the
SAME code cannot be redeemed twice regardless of `usage_limit_per_user`/`total_usage_limit`. What is
NOT enforced: an offer's aggregate limits across MULTIPLE bulk-issued codes (e.g. "no more than 100
total redemptions across all codes for this offer" or "this customer may redeem at most 1 code from
this offer even if they hold 2 different codes").

**Root cause:** the coupon-redemption resolver was never wired to read/pass real usage history into
the shared eligibility engine — this is a real adjacent gap, but affects ALL offer-coupon mechanics
equally (not specific to the free-mechanic work this fix batch targeted), so bundling it into an
already-HIGH-risk money-path change was explicitly avoided (SPEC D6: "it affects all coupon
mechanics equally, not just free ones; bundling it here widens a money-path change unnecessarily").

**Fix (scoped as its own future small-to-medium plan):**
1. Track per-offer, per-user redemption counts (likely a query against existing `orders`/`coupons`
   rows keyed by `offer_id` + `user_id`, or a new dedicated usage-tracking table if query cost is a
   concern at scale).
2. Wire `resolveCouponDiscount()` to pass real usage into `checkDealEligibility()`'s usage-limit
   checks instead of an empty array.
3. Add exact-count regression tests for both `usage_limit_per_user` and `total_usage_limit`
   rejection paths, at both preview and placement (money-adjacent — Known-Gap should not be used
   for this once picked up).

**Not urgent today:** per-code single-use already prevents the most obvious abuse (redeeming the
same code twice); this gap only matters for offers that rely on the aggregate limit fields as an
additional control layer, which is not yet a live product requirement.
