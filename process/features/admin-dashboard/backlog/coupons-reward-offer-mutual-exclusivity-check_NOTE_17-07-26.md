---
name: backlog:coupons-reward-offer-mutual-exclusivity-check
description: "coupons.reward_id and coupons.offer_id have no DB CHECK enforcing mutual exclusivity — a dual-FK row would silently take the reward branch and skip the offer guard entirely, including the free-mechanic guard"
date: 17-07-26
metadata:
  node_type: memory
  type: backlog
  feature: admin-dashboard
---

# Coupons reward_id / offer_id mutual-exclusivity DB CHECK

**STATUS: USER-APPROVED FOLLOW-UP — execute next.** This is not a mere backlog idea; the user
reviewed this finding as part of the ADM-008 POST-MERGE FIX 6 (`adm-008-free-mechanics`) HIGH-risk
evidence-pack review on 17-07-26 and explicitly upgraded it from "accepted residual risk" to
"do this next." Route through a normal small RIPER-5 cycle (schema-adjacent — VALIDATE required,
not a quick fix).

**Priority:** High (user-approved, next in queue) — money-adjacent trust-boundary gap, not
currently exploitable via any live write path, but closing it removes a structural landmine before
more offer-coupon money-path work is layered on top.

**Problem:**

`coupons` has two nullable FK columns, `reward_id` and `offer_id`. Nothing in the schema or the
application layer enforces that at most one of them is non-null on any given row. The resolver
(`packages/api/src/routes/lib/coupon-apply.ts`, ~lines 152-160) checks `reward_id IS NOT NULL`
FIRST and takes the reward-coupon branch if it matches — so a hypothetical dual-FK row (both
`reward_id` and `offer_id` set) would silently be treated as a REWARD coupon and the entire
offer-coupon code path — including the free-mechanic guard/dispatch this fix batch just built,
the b1t1/bundle permanent deny, and the value-less-discount reject (F4) — would never run for it.

**Root cause:** no `CHECK` constraint or app-layer validation was ever written for this invariant.
It was flagged as finding 3 in the post-P1 adversarial review of the free-mechanics fix
(`adm-008-free-mechanics_PLAN_16-07-26.md` §Post-P1 Review Findings & Dispositions) and originally
descoped as "no live write path creates such a row — defense-in-depth only." The user's own review
of the risk-evidence pack upgraded this from accepted-risk to an approved fix.

**User's stated semantics (locked, 17-07-26):** one coupon row = one identity. A coupon is either a
reward coupon OR an offer coupon, never both. An admin who wants a customer to receive both a
reward benefit and an offer benefit should mint TWO separate coupons, not one dual-purpose row.

**Fix (scoped, small):**
1. New migration `0015`: add a Postgres `CHECK` constraint on `coupons` enforcing
   `(reward_id IS NOT NULL AND offer_id IS NULL) OR (reward_id IS NULL AND offer_id IS NOT NULL) OR (reward_id IS NULL AND offer_id IS NULL)`
   (a coupon may legitimately have neither set pre-issuance/targeting, per existing nullable-both
   convention — confirm against current row population before locking the exact predicate).
2. Matching API-layer guards: wherever a coupon row is created or updated with both FKs (bulk
   generate, targeted issuance, any future admin coupon-edit surface), reject with a clear 400 if
   both would be non-null after the write.
3. Add a regression test asserting the DB rejects a raw dual-FK insert (defense-in-depth is only
   real if it is tested).

**Not urgent from a live-exploit standpoint** (still true) — no current write path in
`packages/api/src/routes/admin/coupons.ts` sets both FKs on one row. This is a proactive
close-the-gap fix, not a live-bug fix.
