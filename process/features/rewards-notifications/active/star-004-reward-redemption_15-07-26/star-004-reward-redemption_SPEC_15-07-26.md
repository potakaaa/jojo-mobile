---
name: spec:star-004-reward-redemption
description: "Product-discovery SPEC for STAR-004 — redeeming a Jojo Stars reward coupon in the cart/checkout flow (in-app only, GitHub issue #29 ACs 1-4)"
date: 15-07-26
feature: rewards-notifications
---

# STAR-004 — Reward Redemption Flow (In-App)

## Summary

Right now, when a customer's Jojo Stars balance crosses a reward tier, the app mints a coupon
behind the scenes — but there is no way to actually use it. This SPEC covers letting a customer
type their reward coupon's code into the cart's existing "Enter coupon code" box, see the reward
applied as a free item, and have that reward permanently and correctly consumed once they place
the order. It also adds a small way for the customer to see their unused reward code on the
Rewards screen, since there's currently no in-app UI that shows it to them at all. Redeeming a
reward in person at a branch counter (staff-side validation) is explicitly NOT part of this round
— it is called out as deferred, tracked separately.

## User Stories / Jobs To Be Done

- As a customer who has unlocked a reward, I want to see my reward's coupon code somewhere in the
  app, so that I know I have something to redeem and can copy the code into my cart.
- As a customer checking out, I want to enter my reward code in the cart and see the matching item
  become free, so that I get the value of my loyalty stars without confusion about what happened.
- As a customer, I want my reward to only be spent once I actually complete an order, not the
  moment I type the code in, so that if I abandon my cart or the app restarts, I haven't lost my
  reward for nothing.
- As a customer, I want the app to stop me (with a clear message) if I try to reuse a reward code,
  apply it to an order that doesn't have the eligible item in the cart, or use a reward that isn't
  tied to a real item yet, so that I'm never confused about why something didn't work.
- As the business, we want reward redemption enforced on the server (not just hidden client-side),
  so that a customer can't redeem the same reward twice by any means, including replaying a
  request.

## What The User Wants (Behavioral Outcomes)

- The Rewards screen shows any reward coupon(s) the customer currently has available, including
  the redeemable code, in a way they can read and copy.
- In the cart, the customer can type a reward's code into the same "Enter coupon code" field
  already used for deal codes. On success, the cart shows the reward applied as a discount line
  (the eligible item's price zeroed) exactly the way a deal discount displays today.
- If the code is invalid, expired, already used, or refers to a reward whose eligible item isn't
  in the cart, the customer sees a clear rejection message and nothing changes in their cart.
- If the reward's eligible product was never configured (still true for 3 of 4 seeded rewards
  today), applying that reward's code is rejected with a clear "not yet redeemable" style message
  — it never silently succeeds or crashes.
- Applying a reward code to the cart does NOT burn the reward. The customer can add the code,
  remove it, close the app, or abandon the cart entirely, and the reward remains available for a
  future attempt.
- Only when the customer completes checkout (places the order) does the reward actually get
  consumed: the app marks the coupon used, timestamps it, and their star history shows a
  "redeemed" entry for that reward.
- If a customer somehow manages to trigger checkout twice for the same reward (e.g., a slow
  network causing a double-submit), the second attempt is rejected server-side — a reward can
  never be spent twice.
- Staff-facing in-store reward redemption (a staff member manually validating and marking a
  physical/verbal reward code as used at the counter) is out of scope this round; the customer can
  only redeem through the in-app cart/checkout path described above.

## Flow / State Diagram

```
Reward coupon lifecycle (this SPEC covers steps 3-6; step 1-2 already exist from STAR-003):

  [1: unlocked]          [2: seen]              [3: applied]         [4: consumed]
  STAR-003 mints    -->  Customer views    -->  Customer enters -->  Order placed:
  coupon row,            code on Rewards        code in cart;        coupon marked
  status=available       screen (NEW)            cart shows           used + used_at;
                                                  reward discount      star_transactions
                                                  (client-side          gets a 'redeemed'
                                                  preview only,         row (NEW)
                                                  no DB write)
                                                       |
                                                       v
                                               [abandon / remove]
                                               Cart cleared or code
                                               removed -> coupon
                                               STAYS status=available
                                               (NEW: no burn on apply)


Cart "Enter coupon code" flow (happy path):

  Customer types code
          |
          v
  Server validates code -----> invalid / expired / used / no-eligible-product
          |                          |
          | valid                   v
          v                   Reject with clear message; cart unchanged
  Server computes discount
  (zeroes eligible item's
  line, using reward's
  reward_type/reward_value/
  eligible_product_id)
          |
          v
  Cart shows AppliedDiscount
  (source: 'reward' or 'deal'
  depending on code type)
          |
          v
  Customer proceeds to checkout
          |
          v
  POST /orders includes the
  applied coupon reference
          |
          v
  Server re-validates the coupon
  is still 'available' AND
  atomically flips it to 'used'
  (state-machine guard: affects
  0 rows if already used/expired
  -> reject order-level attempt
  or drop the discount, see
  Acceptance Criteria)
          |
          v
  used_at set; star_transactions
  gets a 'redeemed' row; order
  total reflects the discount


Double-redemption guard (race / replay):

  Request A: PATCH status='available'->'used' WHERE id=X AND status='available'  -- succeeds, 1 row
  Request B (same coupon, near-simultaneous or replayed): same UPDATE -- 0 rows affected -> rejected
```

## Acceptance Criteria (Testable Outcomes)

1. **Customer can see their available reward coupon code in-app.**
   A session-gated `GET /coupons`-style endpoint returns the authenticated customer's own coupons
   (including `code`, `status`, and which reward/deal it's tied to); the Rewards screen surfaces at
   least the available reward coupon(s) with a visible, copyable code.
   proven by: `coupons.integration.test.ts` — "returns only the caller's own available reward
   coupons with code field present" (new suite, hermetic, mirrors `rewards.integration.test.ts`
   pattern) + mobile Agent-Probe walkthrough (screen renders the code).
   strategy: Hybrid (API automated; mobile render is Agent-Probe — project-wide RN-runner gap).

2. **Cart apply validates a reward code server-side and shows the correct discount.**
   Entering a valid, unused reward code (bound to a product currently in the cart) in the cart's
   "Enter coupon code" field results in the cart showing that item's price zeroed via an
   `AppliedDiscount`. Entering a reward code whose `eligible_product_id` is unset, or whose product
   is not in the cart, is rejected with a clear message and no cart mutation.
   proven by: `coupon-apply.integration.test.ts` — cases: "valid reward code + eligible item in
   cart succeeds", "reward with null eligible_product_id is rejected", "eligible item not in cart
   is rejected", "unknown code is rejected" (new suite) + mobile Agent-Probe (visual discount line,
   error message rendering).
   strategy: Hybrid (server validation + discount computation automated; mobile UI rendering is
   Agent-Probe).

3. **Deal codes continue to work through the same unified apply path.**
   Existing deal-code apply behavior (eligibility checks, discount computation, cart display) is
   unchanged from the customer's point of view after the apply path is unified to a server
   round-trip — deal codes are not regressed.
   proven by: `coupon-apply.integration.test.ts` — deal-code cases ported from
   `apps/mobile/src/features/deals/lib/__tests__/eligibility` unit coverage (or equivalent, moved
   server-side) + regression check against existing deal Agent-Probe script.
   strategy: Hybrid (server-side deal eligibility automated; visual cart parity is Agent-Probe).

4. **Applying a code in the cart does not consume the reward.**
   After a customer applies a reward code in the cart and then removes it, closes the cart, or
   abandons the session without completing checkout, the coupon's `status` remains `available` and
   its `used_at` remains null.
   proven by: `coupon-apply.integration.test.ts` — "applying a reward code performs no DB mutation
   on the coupons table" (assert no UPDATE/INSERT touches `coupons` during the apply-only call).
   strategy: Fully-Automated.

5. **Completing checkout with an applied reward marks it used and writes the ledger row.**
   When a customer places an order (`POST /orders`) that has a reward coupon applied, on success:
   the coupon's `status` becomes `used` and `used_at` is set to the placement time, AND exactly one
   new `star_transactions` row is written for that user with `type='redeemed'` referencing the
   redemption (order total reflects the discount already computed at apply time or recomputed
   consistently at placement — see Open Questions/Constraints for exact recompute policy).
   proven by: `orders.integration.test.ts` (extended) — "placing an order with an applied reward
   coupon marks it used, sets used_at, and writes a redeemed star_transactions row" (hermetic,
   self-seeding, mirrors `star-earning.integration.test.ts` transactional pattern).
   strategy: Fully-Automated.

6. **A reward coupon can never be spent twice, even under a race or replay.**
   Two concurrent (or sequentially replayed) checkout attempts referencing the same reward coupon
   result in exactly one success and one rejection — never two successful redemptions of the same
   coupon. The guard is a state-machine transition (`UPDATE ... WHERE status='available'`, reject
   if 0 rows affected), not a unique-index dedupe-on-insert.
   proven by: `orders.integration.test.ts` (extended) — "second concurrent order attempt using an
   already-used-mid-transaction reward coupon is rejected with a clear error and does not double-
   write star_transactions" (simulate via sequential calls sharing the coupon id; assert second
   call's transaction throws/rolls back before any side effect).
   strategy: Fully-Automated.

7. **A reward whose `eligible_product_id` is unset is never redeemable, at any stage.**
   Both the cart-apply step (AC2) and the checkout/order-placement step reject a reward coupon
   whose backing reward has a null `eligible_product_id`, with a clear, non-crashing error.
   proven by: `coupon-apply.integration.test.ts` + `orders.integration.test.ts` — "reward with
   unset eligible_product_id is rejected at apply" and "...rejected at order placement" (defense
   in depth — both layers checked, not just the earlier one).
   strategy: Fully-Automated.

8. **At least one seeded reward is bound to a real product so the flow is demoable.**
   The dev seed (`seed.ts`) is updated so at least one of the 4 roadmap reward tiers has a
   non-null `eligible_product_id` pointing at a real seeded product, and the seed mints (or the
   seed instructions document how to reach) an `available` reward coupon for a test user so AC1-6
   can be exercised end-to-end without requiring STAFF-003 to be built first.
   proven by: `seed.integration.test.ts` (or existing seed-covering test) — "seedRewardsTable binds
   at least one reward to a real product id" + manual Agent-Probe end-to-end walkthrough using the
   seeded test user.
   strategy: Hybrid (seed data-shape assertion automated; full manual walkthrough is Agent-Probe).

## Out Of Scope

- **Staff-side in-store redemption (issue #29 AC5).** A staff member manually validating and
  marking a reward as used at the counter (independent of the customer's own device/session) is
  explicitly deferred. A backlog item must be written for this (`STAR-005` or similar) once this
  SPEC's plan is archived.
- **Full Coupon Wallet screen (CPN-001).** This SPEC adds only a minimal surfacing of the
  customer's own reward code(s) on the existing Rewards screen — not a dedicated wallet/coupons
  list screen, coupon history browsing, or coupon management UI.
- **ADM-005 (admin-configurable reward rules).** Reward thresholds, `reward_type`,
  `reward_value`, and `eligible_product_id` remain seed/DB-set, not admin-editable through this
  work.
- **Live online payment processing.** Unrelated to this SPEC; `online_payment` remains disabled
  server-side as before.
- **Push/notification delivery on redemption.** No new notification is added when a reward is
  redeemed (distinct from the existing `reward_unlocked` notification from STAR-003).
- **Deal coupon UI parity beyond "keep it working."** No new deal-specific UI features are added
  by this SPEC — the unification is about the underlying apply path, not new deal functionality.
- **Automated RN component/E2E coverage for the mobile cart-apply and Rewards-screen UI.** This
  remains an Agent-Probe / Known-Gap per the project-wide test-runner gap (see
  `process/context/tests/all-tests.md`); it is not a new gap introduced by this SPEC.
- **Expiring reward coupons via a scheduled job.** `expires_at` handling (if any) beyond what
  already exists is not part of this round.

## Constraints

- No new database migration is required for the coupon or reward data model — `coupons`,
  `rewards`, and `star_tx_type` already carry every field/enum value this flow needs
  (`coupons.status/used_at`, `rewards.eligible_product_id/reward_type/reward_value`,
  `star_tx_type='redeemed'`). A migration IS required only if the seed change needs a new product
  row that doesn't already exist — check before assuming zero migration.
- The double-redemption guard must be implemented as a state-machine transition
  (`UPDATE coupons SET status='used' ... WHERE id=? AND status='available'`, reject on 0 rows
  affected), matching the pattern already used successfully elsewhere in this codebase — not a
  unique-index insert-based dedupe (that pattern doesn't fit an update-based consumption step).
- The redemption/consumption step (mark used, write `star_transactions` `redeemed` row) must happen
  inside the same order-placement transaction as `POST /orders`, mirroring the transactional
  isolation pattern already used by `creditStarForCompletedOrder` (savepoint-based retry where
  applicable).
- Cart apply/remove of a coupon code must NOT write to the `coupons` table at all — only order
  placement may mutate coupon state. This is the mechanism that guarantees "abandoned cart doesn't
  burn the reward" (AC4).
- The existing single-active-discount cart model (`Cart.appliedDiscount`, one at a time) is not
  being redesigned by this SPEC — a reward code and a deal code are still mutually exclusive at the
  cart level, same as deals are today.
- The apply endpoint work necessarily touches the DEAL-003 surface (today's 100% client-side
  `apply-deal.ts` / `MOCK_DEALS` mock), since deal and reward codes are being unified onto one
  server-backed endpoint. This is an intentional, called-out blast-radius expansion, not scope
  creep — INNOVATE/PLAN must account for it.
- `DbCoupon` (packages/types) and the UI-facing `Coupon` shape remain distinct; whatever new
  read endpoint is added for AC1 should decide (in PLAN) whether it returns `DbCoupon`-shaped data
  or introduces a light mapper — this SPEC does not mandate a schema/mapper choice, only that the
  code is visibly surfaced to the customer.
- Testing must follow the existing hermetic, self-seeding vitest+supertest integration pattern in
  `packages/api` (mirroring `rewards.integration.test.ts` / `star-earning.integration.test.ts`) —
  no new test runner is being introduced by this work.
- Mobile UI verification for this feature follows the same Agent-Probe/Known-Gap convention used
  by every prior STAR/STAFF plan — no new automated RN runner is in scope here.

## Open Questions

None — all decisions needed to write this SPEC were either locked by the user or resolved with a
stated default below (per the user's instruction to resolve remaining sub-decisions rather than
leave them open):

- **Resolved:** `AppliedDiscount.source` for a redeemed reward coupon is `'reward'`; for a
  deal-backed coupon it stays `'deal'` (or `'coupon'` if the unified endpoint is handling a
  code that isn't tied to either a reward or a deal — this distinction is set by the server based
  on which FK (`reward_id` vs `deal_id`) is populated on the resolved coupon/deal). This is a
  requirements-level default; the exact endpoint response contract is PLAN's job.
- **Resolved (recommendation only, not locked):** the single coupon-apply endpoint should be
  shaped as a validate-and-compute-only call (e.g. `POST /coupons/apply` — no DB mutation, returns
  the `AppliedDiscount` to store client-side), with the actual consumption (mark used / used_at /
  star_transactions write) folded into `POST /orders` at placement time. This satisfies AC4 and
  AC5/AC6 cleanly. The exact route shape, request/response schema, and whether it's one endpoint
  or two is left to INNOVATE/PLAN — this SPEC only requires the behavioral split (apply = no
  mutation, checkout = mutation) described in Acceptance Criteria and Constraints.
- Deferred to backlog (not blocking this SPEC): staff-side in-store redemption (AC5 of issue #29) —
  a backlog NOTE must be written when this plan is archived at UPDATE PROCESS.

## Background / Research Findings

- **Data model is ready, no migration needed for the coupon/reward/ledger shapes.** `coupons` has
  `id, user_id, deal_id, reward_id, code, status(available|used|expired), expires_at, used_at,
  created_at`. `rewards` has `reward_type, reward_value, eligible_product_id` (joined via
  `coupons.reward_id`, not stored on coupons). `star_tx_type` enum already includes `'redeemed'`.
- **No coupon read or redeem API exists today.** `packages/api/src/index.ts` mounts only
  `branchesRouter`, `ordersRouter`, `rewardsRouter` (read-only), `staffRouter`. Coupons are only
  ever INSERTED today, by the STAR-003 unlock logic inside `star-earning.ts`.
- **`POST /orders` has zero coupon awareness today.** `createOrderSchema` has no
  `couponId`/`couponCode` field; `discount_total` is hardcoded `'0.00'` in the order-creation path.
  This is the hook point where the checkout-side consumption (AC5, AC6) must be added.
- **Transactional pattern to mirror:** `star-earning.ts`'s `creditStarForCompletedOrder` — an
  idempotent insert inside one `db.transaction`, with a bounded savepoint-based retry for
  `ON CONFLICT` collisions. The redemption double-guard should instead be an `UPDATE ... WHERE
  status='available'` state-machine guard (reject on 0 rows affected) — a different mechanism than
  the insert-based idempotency used for star-earning, because redemption is a state transition on
  an existing row, not a fresh insert.
- **`AppliedDiscount` (packages/types/src/cart.ts) is already forward-compatible:** its `source`
  field is a union of `'coupon' | 'deal' | 'reward'` — the `'reward'` value exists in the type
  today even though nothing produces it yet.
- **Today's apply path is 100% client-side and deal-only.** `apps/mobile/src/features/deals/lib/
  apply-deal.ts` resolves a typed code against `MOCK_DEALS` (a hardcoded mock array) and computes
  the discount entirely on-device via `checkDealEligibility`/`computeDealDiscountCents`. There is
  no server involvement in applying a code today, for either deals or rewards.
  `apps/mobile/src/app/(tabs)/order/cart.tsx` wires this through the cart's existing "Enter coupon
  code" `TextInput` + Apply `Button`, calling `resolveAndApplyDeal` and then
  `useCart().applyDiscount(...)`.
  This SPEC's locked decision #4 requires unifying deal and reward apply onto ONE real server
  endpoint, which necessarily expands blast radius onto this existing DEAL-003-owned client code
  (not just adding new reward-specific code) — called out explicitly in Constraints.
  `useCart()`'s `applyDiscount`/`clearDiscount` already accept an arbitrary `AppliedDiscount`
  regardless of its source, so the cart-state seam itself needs no shape change.
  `DbCoupon` (packages/types/src/coupons.ts, added STAR-003) and the pre-existing UI-facing
  `Coupon` type are distinct shapes with no mapper today — relevant for whichever endpoint AC1's
  `GET /coupons` uses to shape its response.
- **STAFF-003 is not built, so stars are never credited in live production today** — the entire
  earn→unlock chain exists but is unwired from any real staff endpoint
  (`backlog/staff-003-star-earn-wiring-dependency_NOTE_14-07-26.md`). This means an end-to-end
  "earn → unlock → redeem" walkthrough needs either STAFF-003 to land first, or (as the user
  specified) a seed-level shortcut that hands a test user an already-`available` reward coupon
  bound to a real product, so AC1-AC8 are demoable/testable without depending on STAFF-003.
- **PRD alignment.** §6.10 (Recommended MVP Rule): "Reward coupon can be redeemed on a future order
  or in-store." §8.3 (Reward Unlock Flow) step 7-8: "User redeems reward on next order. Reward is
  marked as used." This SPEC covers the "on a future order" (in-app) half of that sentence; the
  "in-store" half is the deferred AC5 from issue #29.
  §8.3 step 6 ("User views reward in Coupon Wallet") is satisfied minimally by surfacing the code
  on the existing Rewards screen (AC1) rather than building the full Coupon Wallet screen
  (out of scope, see above).
  §7 nav structure is unaffected — no new tab or route group is implied by this SPEC.
- **Test infra confirmed:** `packages/api` uses vitest + supertest, hermetic self-seeding
  integration tests (99 tests as of STAR-003, see `rewards.integration.test.ts` /
  `star-earning.integration.test.ts` for the exact pattern to mirror). `apps/mobile` has a pure-TS
  vitest runner (node env) but no RN component/E2E runner — mobile UI verification for cart-apply
  and the Rewards-screen code display stays Agent-Probe/Known-Gap, consistent with every prior
  STAR/STAFF plan in this feature area.
- **User-locked scope decisions carried in verbatim** (see task prompt): in-app only this round
  (issue #29 ACs 1-4, AC5 deferred + backlog note required); free_item redemption requires a bound
  `eligible_product_id` and zeroes that specific product's cart line; add a minimal `GET /coupons`
  read endpoint and surface the code on the Rewards screen (full Coupon Wallet stays out of
  scope); unify deal AND reward coupon apply/remove under one real server-backed endpoint
  (consumption still happens at order placement, not apply time), explicitly expanding blast
  radius onto the DEAL-003 surface.
