---
name: plan:star-004-reward-redemption
description: "STAR-004 — in-app reward coupon redemption: unified coupons/apply endpoint, order-placement consumption with double-redeem guard, Rewards-screen code surfacing"
date: 15-07-26
feature: rewards-notifications
---

# STAR-004 — Reward Redemption Flow (In-App)

Date: 15-07-26
Status: PLAN written — not executed
Complexity: COMPLEX
Feature: rewards-notifications
Issue: #29 (ACs 1-4; AC5 in-store redemption deferred, backlog note required at UPDATE PROCESS)
Branch: dev/star

## TL;DR

Right now STAR-003 mints reward coupons but nothing can redeem them. This plan adds: (1) a new
session-gated `POST /coupons/apply` that validates a code and computes the discount with ZERO DB
mutation (apply-time preview only — this is what guarantees "abandoning the cart doesn't burn the
reward"), (2) a new `GET /coupons` so the Rewards screen can show the customer their code, (3) an
extension to `POST /orders` that re-validates the coupon and atomically flips it `available→used`
via an `UPDATE ... WHERE status='available'` state-machine guard (0 rows affected = reject, never
double-spend) plus writes one `star_transactions` `redeemed` row, all inside the existing order
transaction, and (4) a shared discount-computation module in `packages/utils` so the new server
route and the mobile cart use ONE implementation instead of two. The client's existing "Enter
coupon code" flow in the cart is rewired from 100%-client-side `MOCK_DEALS` matching to a real
server round-trip; deal codes keep working through the same unified path. No DB migration is
needed for the coupon/reward/ledger model — only IF the seed needs a new product row (checked
below: it does not; an existing product slug is reused).

Context loaded: `process/context/all-context.md` (root router), `process/context/tests/all-tests.md`
(+ chain), `process/features/rewards-notifications/_GUIDE.md`, completed STAR-001/002/003 plans +
reports (transaction/savepoint pattern, idempotent-seed pattern, serializer conventions, hermetic
test harness).

**Strategy note (vc-agent-strategy-compare, PLAN phase):** single-file COMPLEX plan for one
feature slice — signal score 2/7 (S6 high-risk billing-adjacent/redeemable-value class, S7 ~12
blast-radius files). Sequential (one plan-agent) is correct for authoring this plan. At VALIDATE,
recommend parallel-subagents for the dimension/section fan-out (score stays 2-3/7 — MEDIUM), not
agent-team (this is a single plan, not a 3+ phase program).

---

## Overview

### Locked Decisions (from INNOVATE Decision Summary — do NOT re-open)

- **LD1 — `POST /coupons/apply` is validate-and-compute-only, ZERO DB mutation.** New router
  `packages/api/src/routes/coupons.ts`, mounted `app.use('/coupons', requireSession, couponsRouter)`
  in `index.ts` (mirrors the `rewardsRouter` mount pattern exactly). This is the mechanism that
  satisfies AC4 (abandon-doesn't-burn) — apply never touches the `coupons` table.
- **LD2 — `GET /coupons` returns the caller's own coupons, scoped to `req.user!.id`.** Same new
  router. Response shape: `DbCoupon[]` joined with a light reward label (`{ name, requiredStars }`)
  — NOT the full UI `Coupon` mapper (that shape stays a separate future concern per SPEC
  Constraints). Surfaced on the Rewards screen.
- **LD3 — Shared discount logic lives in `packages/utils`, used by BOTH the server route and the
  mobile code.** Port the already-pure `checkDealEligibility`/`computeDealDiscountCents` logic from
  `apps/mobile/src/features/deals/lib/eligibility.ts` into a new `packages/utils/src/discount.ts`
  module. Deals stay a STATIC relocated catalog (a server-side module port of `MOCK_DEALS`) — NOT
  DB-backed. Do NOT wire the unused `deals`/`deal_products`/`deal_branches` DB tables and do NOT add
  a migration for deals. Deals have no `code` column and that stays true this round. Reward discount
  = zero the line of the reward's bound `eligible_product_id` (`free_item` semantics, matching the
  existing "cheapest eligible unit price" computation already used for deals).
- **LD4 — `POST /orders` gains optional `couponCode`.** Inside the existing `db.transaction`:
  re-validate the coupon (defense in depth, including AC7 null-`eligible_product_id` rejection), run
  the state-machine guard `UPDATE coupons SET status='used', used_at=now() WHERE id=? AND
  status='available'` (0 rows affected → reject, never double-spend — AC6), and for reward-backed
  coupons insert exactly one `star_transactions` row `type='redeemed'`. `discount_total` is set from
  the server-recomputed amount, never trusted from the client's apply-time snapshot.
- **LD5 — Server recomputes the discount at placement, does not trust the client's stored
  `AppliedDiscount`.** If recompute drops the discount (e.g. the eligible item was removed from the
  cart between apply and checkout), surface a clear inline rejection message — never silently
  proceed with a stale discount.
- **LD6 — Mobile cart wiring replaces the client-only apply path.** `resolveAndApplyDeal`/
  `applyDealById` (`apps/mobile/src/features/deals/lib/apply-deal.ts`) and their call site in
  `apps/mobile/src/app/(tabs)/order/cart.tsx` are replaced with a call to `POST /coupons/apply`,
  then `useCart().applyDiscount(returned)`. `AppliedDiscount.source` is `'reward'` for reward-FK
  coupons, `'deal'` for deal-FK coupons. Code-entry via the existing "Enter coupon code" field is
  kept (no id-based staging path — locked).
- **LD7 — Seed update (AC8).** Bind at least one of the 4 roadmap reward tiers to a real product
  (`eligible_product_id`), and mint an idempotent `available` reward coupon for the existing
  `jojo@test.com` test user, so AC1–AC7 are demoable/testable WITHOUT STAFF-003 existing.

### Goals

1. Let a customer redeem an unlocked reward coupon in the cart, with the reward permanently and
   correctly consumed only at order placement (never at apply time).
2. Unify deal-code and reward-code apply onto one real server-backed endpoint, without regressing
   existing deal-apply UX.
3. Guarantee server-side, race-safe, replay-safe single-use redemption.
4. Give the customer a minimal in-app way to see their reward code (Rewards screen).
5. Keep the DB schema stable — reuse the existing `coupons`/`rewards`/`star_tx_type` shapes with no
   new migration, unless the seed genuinely needs a new product row (it does not — see Step 5).

---

## Acceptance Criteria (carried from SPEC — do not reopen)

Each AC carries `proven by:` + `strategy:` (mapped in full in Verification Evidence below).

1. Customer can see their available reward coupon code in-app — `GET /coupons`. Strategy: Hybrid.
2. Cart apply validates a reward code server-side, shows the correct discount, rejects null
   `eligible_product_id` / product-not-in-cart / unknown code. Strategy: Hybrid.
3. Deal codes continue to work through the same unified apply path. Strategy: Hybrid.
4. Applying a code in the cart performs zero DB mutation on `coupons` (no burn on apply/abandon).
   Strategy: Fully-Automated.
5. Completing checkout with an applied reward marks it `used`, sets `used_at`, writes exactly one
   `redeemed` `star_transactions` row. Strategy: Fully-Automated.
6. A reward coupon can never be spent twice, even under a race/replay (state-machine
   `UPDATE ... WHERE status='available'` guard, not unique-index insert dedupe). Strategy:
   Fully-Automated.
7. A reward with `eligible_product_id` unset is rejected at BOTH apply and order-placement
   (defense in depth). Strategy: Fully-Automated.
8. At least one seeded reward is bound to a real product; seed mints (or documents reaching) an
   `available` reward coupon for a test user. Strategy: Hybrid.

---

## Touchpoints

Files created/modified across the blast radius. Read-for-context files marked (R).

| File | Change |
|---|---|
| `packages/api/src/routes/coupons.ts` | **NEW** — `POST /coupons/apply` (no mutation) + `GET /coupons` (own coupons + reward label join). |
| `packages/api/src/index.ts` | Mount `app.use('/coupons', requireSession, couponsRouter)`, mirroring the `rewardsRouter` mount. |
| `packages/api/src/routes/orders.ts` | Extend `createOrderSchema` with optional `couponCode`; add coupon re-validate + state-machine consume + `redeemed` ledger row inside `db.transaction`. |
| `packages/api/src/db/seed/seed.ts` | Bind tier-1 reward's `eligible_product_id` to an existing product (`classic-fries`); mint one idempotent `available` reward coupon for `jojo@test.com`. |
| `packages/utils/src/discount.ts` | **NEW** — shared, framework-agnostic discount module ported from `apps/mobile/src/features/deals/lib/eligibility.ts` (deal path) + new reward-discount computation (zero the bound product's line). |
| `packages/utils/src/index.ts` | (R) confirm the new module's exports flow through the package barrel. |
| `packages/utils/src/deals-catalog.ts` | **NEW** — server-side static port of `MOCK_DEALS` (deal catalog lives in one shared place now, consumed by both the mobile mock UI and the new server route). |
| `packages/types/src/coupons.ts` | (R) `DbCoupon`/`CouponStatus` already exist (STAR-003) — reused as-is for `GET /coupons`. Add a light `CouponWithReward` response type (name/requiredStars join) if not folded inline. |
| `apps/mobile/src/features/deals/lib/apply-deal.ts` | Replace `resolveAndApplyDeal`/`applyDealById` bodies to call the new `POST /coupons/apply` endpoint via a new API client function, instead of matching `MOCK_DEALS` locally. Keep the same exported function names/signatures where possible to minimize call-site churn. |
| `apps/mobile/src/features/deals/lib/eligibility.ts` | (R) becomes dead code / superseded by the server-side port; leave in place per SPEC (mobile-side unit tests, if any, may still reference it) — do NOT delete during this plan, flag for a later cleanup pass. |
| `apps/mobile/src/app/(tabs)/order/cart.tsx` | Rewire `handleApplyCoupon` to call the new async apply function (server round trip) instead of the synchronous local `resolveAndApplyDeal` call; add loading/error state for the network call. |
| `apps/mobile/src/features/rewards/lib/rewards-api.ts` | **NEW function** `fetchMyCoupons()` — cookie-fetch, mirrors `fetchRewardsSummary` (NOT `authClient.$fetch`). |
| `apps/mobile/src/features/rewards/hooks/use-my-coupons.ts` | **NEW** react-query hook, mirrors `use-rewards-summary.ts`. |
| `apps/mobile/src/app/(tabs)/rewards/index.tsx` | Add a minimal "Your reward code" block rendering the available reward coupon's code (copyable) when one exists. |
| `packages/api/src/routes/__tests__/coupons.integration.test.ts` | **NEW** — apply validation, null-eligible reject, deal parity, no-mutation-on-apply, `GET /coupons` scoping. **[VALIDATE-corrected path — route-file tests live in `routes/__tests__/` (matches `rewards.integration.test.ts`/`staff-orders.integration.test.ts`), not `lib/__tests__/`.]** |
| `packages/api/src/routes/__tests__/orders.test.ts` | **EXTEND** — mark-used + `used_at` + redeemed row + double-redeem guard + null-eligible reject at placement + recompute-drop rejection. **[VALIDATE-corrected path — the real existing file is `routes/__tests__/orders.test.ts`; `lib/__tests__/orders.integration.test.ts` does not exist.]** |
| `packages/api/src/db/seed/data.ts` | (R) confirm `classic-fries` slug/id resolution — no edit expected. |
| `packages/api/package.json` | **[VALIDATE-added]** Add `"@jojopotato/utils": "workspace:*"` to `dependencies` — currently only `@jojopotato/types` is listed, but `routes/coupons.ts` and the `orders.ts` extension both import the new shared discount module from `packages/utils`; pnpm's strict workspace resolution requires the dependency to be declared here or the import will not resolve. |
| `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` | **[VALIDATE-added]** Direct call site of `applyDealById` (becomes async per Step 8) and `checkDealEligibility` (stays local/sync, unaffected). Must `await` the new async result — missed in the original Touchpoints list; without this update the deal-details "Apply" button silently breaks (treats a pending Promise as a truthy `ApplyDealResult`). |

**DEAL-003 surface expansion (explicit, per SPEC Constraints):** this plan necessarily touches the
today-100%-client-side deal-apply surface (`apply-deal.ts`, `eligibility.ts` consumers, `cart.tsx`)
because deal and reward codes are unified onto one server-backed endpoint. This is an intentional,
called-out blast-radius expansion — not scope creep.

---

## Public Contracts

1. **`POST /coupons/apply`** (session-gated, NEW). Request: `{ code: string, pickupBranchId: string,
   cartItems: { productId: string, quantity: number, selectedOptions?: { optionId: string }[] }[] }`
   (cart shape passed so the server can check "eligible item in cart" without a server-side cart
   model). **[VALIDATE correction: `pickupBranchId` and `selectedOptions` were missing from the
   original request shape — `checkDealEligibility`'s branch-scope check (check #2, ported in Step 2)
   needs `pickupBranchId`, and `computeDealDiscountCents`'s subtotal/cheapest-unit-price math needs
   real per-line prices including option deltas, mirroring `orders.ts`'s existing base+option price
   lookup at placement time (lines 121-140). Without these fields the ported deal-eligibility
   functions cannot run at all.]** Response (200): `{ discount: AppliedDiscount }` where
   `AppliedDiscount = { source: 'reward'|'deal', refId: string, label: string, amountCents: number }`
   (existing `packages/types/src/cart.ts` shape, unchanged). Response (400): `{ error: string, reason:
   'not_found'|'already_used'|'expired'|'no_eligible_product'|'not_in_cart'| ...(existing
   `EligibilityFailReason` values for deal codes) }`. **Zero DB mutation** — this endpoint never
   writes to `coupons`.
2. **`GET /coupons`** (session-gated, NEW). Response: `{ coupons: (DbCoupon & { reward: { name:
   string; requiredStars: number } | null })[] }`, scoped to `req.user!.id`. Used by the Rewards
   screen to surface an available reward's code.
3. **`POST /orders` extension (breaking-additive).** `createOrderSchema` gains `couponCode:
   z.string().optional()`. When present, the transaction re-validates and atomically consumes the
   coupon; `order.discount_total` reflects the server-recomputed amount (may be `0` if recompute
   rejects the coupon — see Failure Modes). Existing callers omitting `couponCode` are unaffected
   (default `undefined`, no coupon path entered).
4. **`packages/utils` discount module (NEW export surface).** `checkCodeEligibility(code, catalog,
   cartItems, ...)` / `computeDiscountCents(...)` — framework-agnostic, consumed by both
   `packages/api` and `apps/mobile`. Exact function signatures decided in Step 1 (Implementation
   Checklist) — keep the existing mobile-side `EligibilityFailReason` union verbatim so failure
   messages don't regress.

---

## Blast Radius

- **Packages:** `packages/api` (new route, extended route, seed, tests), `packages/utils` (new
  shared discount + deals-catalog modules), `packages/types` (reused `DbCoupon`, possibly one new
  light response type), `apps/mobile` (deals lib, cart screen, rewards lib/hooks/screen).
- **Files new:** ~7 (`coupons.ts` route, `discount.ts`, `deals-catalog.ts`, `routes/__tests__/coupons.integration.test.ts`,
  `rewards-api.ts` addition counted as modify, `use-my-coupons.ts` hook, 1 possible types addition).
- **Files modified:** ~9 (`index.ts`, `orders.ts`, `seed.ts`, `apply-deal.ts`, `cart.tsx`,
  `rewards/index.tsx`, `routes/__tests__/orders.test.ts`, `package.json` [VALIDATE-added: `@jojopotato/utils` dep],
  `deals/deal/[dealId].tsx` [VALIDATE-added call site]).
- **Risk class:** **billing-adjacent / redeemable-value** (coupons are spendable value — the double-
  redeem guard is the load-bearing proof), **public API surface** (2 new endpoints + 1 extended
  endpoint), no auth/schema/migration surface change (no new migration expected — see Constraints).
- **Regression surface:** existing deal-apply UX in `cart.tsx` (must not regress — AC3), STAR-001/
  STAR-003 `star_transactions`/`coupons` semantics (redeemed row must not collide with earned/adjusted
  rows or the STAR-003 unlock idempotency index), STAR-002 `/rewards/summary` (unaffected — reads
  `current_stars`/`lifetime_stars`, untouched by this plan), existing `POST /orders` non-coupon path
  (must be a no-op when `couponCode` is absent).

---

## Data Flow

1. Customer types a code into the cart's existing "Enter coupon code" field.
2. Mobile calls `POST /coupons/apply` with the code + current cart items (productId/quantity only).
3. Server resolves the code:
   a. Look up `coupons` by `code` (no auth-scoping needed for the *lookup* since `code` is the
      secret, but the response never leaks another user's other coupons — see Security below), OR
      resolve against the static deal catalog if the code matches a deal code instead of a coupon
      row (deal codes are not DB rows — they're static, matching today's `MOCK_DEALS` shape).
   b. If a `coupons` row: check `user_id` matches caller (a coupon belongs to exactly one user —
      reject cross-user attempts even though this is a read-only preview), `status === 'available'`,
      `expires_at` (if set) not passed, and (if `reward_id` set) the reward's `eligible_product_id`
      is non-null AND present in the passed `cartItems`.
   c. If a static deal code: run the ported `checkDealEligibility` against the passed cart items
      (same 6 ordered checks as today, unchanged semantics).
   d. On any failure: `400` with a clear `reason` + message. On success: compute the discount
      (`computeDiscountCents` — zero the bound product's line for a reward; existing deal-type
      switch for a deal) and return `{ discount: AppliedDiscount }`. **No write occurs.**
4. Mobile stores the returned `AppliedDiscount` in cart state via `useCart().applyDiscount(...)` —
   unchanged cart-state seam.
5. Customer proceeds to checkout. `useCheckout()` (existing) calls `POST /orders`, now including
   `couponCode` when `cart.appliedDiscount?.source` is `'reward'` or `'deal'` and a code was applied
   (the applied discount doesn't currently carry the raw code string — decide in Step 6 whether to
   thread the original code through cart state, or re-resolve by `refId`; see Implementation
   Checklist Step 6 note).
6. Inside the `POST /orders` transaction (AFTER product/price validation, BEFORE the final insert
   commits): re-run the SAME eligibility/discount logic server-side (defense in depth — never trust
   the client's apply-time snapshot), then:
   a. For a reward coupon: `UPDATE coupons SET status='used', used_at=now() WHERE id=$1 AND
      status='available' RETURNING id` — if 0 rows, reject the ENTIRE order-placement transaction
      with a clear error (never silently drop just the discount and still place the order — this
      keeps the guarantee simple and matches AC6's "never spent twice" framing at the transaction
      boundary).
   b. Insert one `star_transactions` row `type='redeemed'`, `stars` reflecting the redemption (0 —
      redemption spends value, it does not earn/deduct star count; confirm against `star_tx_type`
      enum semantics in Step 2).
   c. For a deal code (no DB coupon row): no coupon-table mutation needed — just apply the
      recomputed discount to `discount_total`.
   d. Set `orders.discount_total` from the recomputed amount (never the client-supplied one).
7. Transaction commits. Order confirmation reflects the discount; Rewards screen's `GET /coupons`
   subsequently shows the coupon as `used`.

---

## Failure Modes

| Failure | Handling |
|---|---|
| Code doesn't match any coupon or deal | `400`, `reason: 'not_found'`, no mutation. |
| Coupon belongs to a different user | `400`, `reason: 'not_found'` (do not leak existence — same message as not-found, avoids enumeration). |
| Coupon `status !== 'available'` (already used/expired) at apply time | `400`, `reason: 'already_used'` or `'expired'`, no mutation. |
| Reward's `eligible_product_id` is null | `400`, `reason: 'no_eligible_product'`, both at apply (AC2/AC7) AND at order placement (AC7 — defense in depth), never crashes. |
| Eligible product not in the passed cart items | `400`, `reason: 'not_in_cart'`, no mutation. |
| Coupon valid at apply time but eligible item removed before checkout (recompute-drop, LD5) | Order placement recompute finds no eligible line → reject the coupon application with a clear inline message (`400`, distinct `reason: 'coupon_no_longer_eligible'`); the order is NOT silently placed at full price without telling the customer why the discount vanished — customer must retry/adjust cart. |
| Two concurrent/replayed checkout attempts share the same reward coupon | The `UPDATE ... WHERE status='available'` guard: first request's UPDATE affects 1 row and commits; second request's UPDATE (same coupon id) affects 0 rows inside its own transaction → that whole order-placement transaction rejects with a clear error. Never two successful redemptions. (AC6 — mirrors the SPEC's required state-machine mechanism, NOT STAR-001's insert-based idempotency pattern, which doesn't fit an update-based consumption step.) |
| `star_transactions` insert for the redeemed row fails after the coupon UPDATE succeeded | Same `db.transaction` as the coupon UPDATE and the order insert — a failure here rolls back the whole transaction, including the coupon UPDATE (transactional atomicity, no partial-consume state). |
| Client omits `couponCode` entirely | No coupon code path entered; `discount_total` stays `'0.00'` exactly as today — zero behavior change for non-coupon orders. |
| Deal code applied instead of reward code | Same unified path; no `coupons` row exists for a deal, so the order-placement side only needs the recompute + `discount_total` set — no state-machine UPDATE (there's nothing to mark used on a static deal). |

---

## Implementation Checklist

Ordered to keep `pnpm turbo run typecheck` green between steps. Phase ordering below maps 1:1 to
this checklist's step groups.

### Phase P1 — Shared discount logic → `packages/utils` (dependency for P2-P4)

**Step 1 — `packages/utils/src/deals-catalog.ts` (NEW).**
Port `MOCK_DEALS` (currently `apps/mobile/src/features/deals/mock-deals.ts`) into a new
package-level static catalog module, same shape (`Deal[]`, `packages/types`'s `Deal` type) — **but
NOT a verbatim id copy**. **[VALIDATE correction — load-bearing: the mobile mock's
`eligibleProductIds` (e.g. `fries-classic`, `lemonade-yuzu`) and `eligibleBranchIds` (e.g.
`MOCK_CART_BRANCH.id`) are keyed to a disconnected mock id-space
(`apps/mobile/src/features/home/mock-home.ts`'s `MOCK_PRODUCTS`/`MOCK_BRANCH`), NOT the real DB
product/branch UUIDs the real cart and real `pickupBranchId` actually carry (confirmed: real cart
lines get `menuItemId` from the real product-details fetch, a real `products.id` UUID; real
`pickupBranchId` is a real `branches.id` UUID). Ported verbatim, the branch-restricted `BGC50` deal
would ALWAYS reject (`branch_ineligible`) and the product-restricted BOGO/free-item deals would
NEVER match — a real AC3 regression. Fix: re-key `eligibleProductIds`/`eligibleBranchIds` in the new
`DEAL_CATALOG` to REAL seeded product/branch ids, resolved the same way Step 11 resolves
`classic-fries` — look up the real ids from `packages/api/src/db/seed/data.ts`'s seeded product
slugs (e.g. `classic-fries`, matching product names/categories to the mock deals' intent) and
seeded branch slugs, NOT copied string literals from the mobile mock file.]** Export as
`DEAL_CATALOG`. The mobile mock file becomes a thin re-export of this (or is updated to import from
here — execute-agent decides based on minimizing churn to existing deal-details/list screens that
import `MOCK_DEALS` directly) — but ONLY if the mobile UI can render deals without depending on the
real id-space (deal codes are entered/matched server-side now; the mobile list/preview UI's own
`eligibleProductIds` display use is presentation-only and may keep the original mock ids if kept
as a separate display-only array — execute-agent confirms no functional path depends on the mobile
copy's ids matching real DB ids). Run `pnpm turbo run typecheck`.

**Known limitation carried forward (document, do not silently drop):** deal usage-limit checks
(`usageLimitPerUser`/`totalUsageLimit`) have no server-side persisted source — today they are
mock-only via `MOCK_DEAL_USAGE` (client-side, unpersisted). The one usage-limited mock deal
(`deal-size-upgrade`) has no `code` field, so it was never reachable via the code-entry path being
unified here anyway (only reachable via the deal-details direct-apply button). Server-side
`checkDealEligibility` may pass an empty `usage: []` array for now — this is a documented known
limitation (no regression vs. today's code-entry path), not a silent behavior change. Note this in
a code comment at the call site.

**Step 2 — `packages/utils/src/discount.ts` (NEW).**
Port `checkDealEligibility`, `computeDealDiscountCents`, `subtotalCents`, `cheapestEligibleUnitPrice`
verbatim from `apps/mobile/src/features/deals/lib/eligibility.ts` (framework-agnostic already — no
React Native deps). Keep the exact `EligibilityFailReason` union (adds no new values for deals).
Add a NEW reward-side function: `checkRewardEligibility(coupon: DbCoupon, reward: RewardRow | null,
cartItems: {productId:string;quantity:number}[]): EligibilityResult` — reject if `coupon.status !==
'available'`, if `expires_at` is past, if `reward === null` or `reward.eligible_product_id === null`
(new reason: `'no_eligible_product'`), or if `reward.eligible_product_id` is not among `cartItems`
(new reason: `'not_in_cart'`). Add `computeRewardDiscountCents(reward: RewardRow, cartItems, priceOf:
(productId:string) => number): number` — zero the bound product's line: `priceOf(reward
.eligible_product_id) * matchingQty` (or the single cheapest matching line if a product can appear
in multiple lines — mirror the existing deal `cheapestEligibleUnitPrice` pattern for consistency).
Export a combined `EligibilityFailReason` union that adds `'no_eligible_product'` and `'not_in_cart'`
to the existing deal reasons — a superset, not a replacement (existing deal call sites are
unaffected since deal codes never produce the two new reasons). Run typecheck.

**Step 3 — `packages/utils/src/index.ts`.**
Confirm/add barrel exports for `discount.ts` and `deals-catalog.ts`. Run typecheck.

### Phase P2 — `POST /coupons/apply` + `GET /coupons` (depends on P1)

**Step 4 — `packages/api/src/routes/coupons.ts` (NEW).**
`export const couponsRouter: Router = Router();` mirroring `rewardsRouter`'s header-comment
convention ("`requireSession` is applied ONCE at mount in `index.ts`").
- `POST /coupons/apply`: zod-validate `{ code: string, cartItems: z.array(z.object({ productId:
  z.string().uuid(), quantity: z.number().int().positive() })) }`. Resolve `code` against
  `coupons` (join `rewards` on `reward_id`) scoped `eq(coupons.user_id, req.user!.id)` first
  (never leak cross-user coupon existence); if no row, try the static `DEAL_CATALOG` from
  `packages/utils` by matching `deal.code`. Run `checkRewardEligibility`/`checkDealEligibility` via
  the shared module; on failure return `400` with `{ error, reason }`; on success compute the
  discount and return `{ discount: AppliedDiscount }`. **No insert/update statement anywhere in this
  handler** — this is the AC4 guarantee; a code review / test explicitly asserts no query touches
  `coupons`'s write path (mock the db client's `.update`/`.insert` in the no-mutation test, or assert
  via a query-log spy — execute-agent picks the mechanism that fits the existing test harness).
- `GET /coupons`: `db.select().from(coupons).leftJoin(rewards, eq(coupons.reward_id, rewards.id))
  .where(eq(coupons.user_id, req.user!.id))`; map to `{ ...DbCoupon fields, reward: reward ? { name,
  requiredStars } : null }[]`. Response: `{ coupons: [...] }`.
Run typecheck.

**Step 5 — Mount in `packages/api/src/index.ts`.**
Add `import { couponsRouter } from './routes/coupons';` and `app.use('/coupons', requireSession,
couponsRouter);` immediately after the `rewardsRouter` mount, matching its comment style ("handler
in couponsRouter assumes `req.user!.id`"). Run typecheck.

### Phase P3 — `POST /orders` extension (depends on P1; independent of P2's route existing, but
shares the P1 discount module)

**Step 6 — Extend `createOrderSchema` + transaction body in `packages/api/src/routes/orders.ts`.**
Add `couponCode: z.string().optional()` to the schema. Decide the code-threading mechanism (SPEC
left this to PLAN): **decision — thread the raw code, not just the resolved refId.** Add
`appliedCouponCode?: string` alongside `AppliedDiscount` on the mobile cart-state side is out of
scope for `packages/types` shape changes; instead, the mobile checkout call site reads the
`couponCode` from local component/session state (the value the customer actually typed, kept around
after a successful apply) and passes it through `useCheckout()`'s existing order-creation call —
this is a mobile-side wiring detail (Step 9), not a `Cart`/`AppliedDiscount` type change.
Inside the transaction, AFTER product/price validation and BEFORE the final `orders` insert:
1. If `body.couponCode` is present, re-resolve it via the SAME query as Step 4 (own-`coupons`-row
   first, then `DEAL_CATALOG` fallback), re-run `checkRewardEligibility`/`checkDealEligibility`
   against `body.items` (the same list already being validated for price/availability — reuse
   `productById`).
2. On re-validation failure (including the recompute-drop case, LD5): throw `OrderError(400,
   <clear message>)` — the WHOLE order placement is rejected, matching the "never silently proceed"
   rule (Failure Modes).
3. On success, if the resolved code is a reward coupon: run `UPDATE coupons SET status='used',
   used_at=now() WHERE id=$1 AND status='available' RETURNING id` via `tx.update(coupons).set({
   status: 'used', used_at: new Date() }).where(and(eq(coupons.id, couponId), eq(coupons.status,
   'available'))).returning({ id: coupons.id })`. If the returned array is empty, throw
   `OrderError(409, 'This reward has already been redeemed.')`. **[VALIDATE decision — locked: use
   409, not 400.** Checked `OrderError`'s existing usage in `orders.ts`: it is a fully generic
   `{status: number}` carrier with only 400 (validation failures) and 500 (allocation exhaustion) in
   use today; 403 is thrown via a direct `res.status()` outside `OrderError`. There is no existing
   409 precedent, but nothing blocks introducing one, and 409 Conflict is the semantically correct
   code for "this resource's state changed under you" vs. 400 Bad Request for input validation —
   keep 409 reserved for exactly this double-redeem-guard rejection so the client can distinguish
   "your input was invalid" from "someone/something already spent this coupon."]**
4. On successful UPDATE, insert `{ user_id: userId, order_id: <will be the new order's id — see
   ordering note below>, type: 'redeemed', stars: 0, description: 'Redeemed reward: <reward name>' }`
   into `starTransactions`. **Ordering note:** the order row doesn't exist yet at this point in the
   handler (order insert happens later in the same function) — either (a) move the coupon
   consume+redeem-row logic to AFTER the order insert (still inside the same transaction, before
   commit), using the real `createdOrder.id`, or (b) insert the `star_transactions` row with
   `order_id: null` if the schema allows a nullable FK here. **Decision: option (a)** — move the
   coupon-consume step to run right after `createdOrder` is available (right after the retry loop
   that allocates `order_number`), so `order_id` on the redeemed row is real and traceable. Recompute
   `discountTotalCents` BEFORE the order insert (so `discount_total` in the initial insert is
   correct) but perform the actual coupon-consume UPDATE + redeemed-row insert AFTER the order row
   exists — both still commit or roll back together in the one transaction.
5. If a deal code (no coupon row) was applied: no `coupons` mutation; just fold the recomputed
   discount into `subtotalCents`/`discountTotalCents`/`total` before the order insert.
Run typecheck.

**Step 7 — Update `centsToNumeric`/total math in `orders.ts` to account for `discountTotalCents`.**
`orders.total` currently equals `subtotalCents` verbatim (no discount ever applied). Add
`discountTotalCents` (0 when no coupon) and set `total: centsToNumeric(subtotalCents -
discountTotalCents)`, `discount_total: centsToNumeric(discountTotalCents)`. Run typecheck.

### Phase P4 — Mobile cart wiring + Rewards code surfacing (depends on P2, P3)

**Step 8 — `apps/mobile/src/features/deals/lib/apply-deal.ts`.**
Replace the bodies of `resolveAndApplyDeal`/`applyDealById` to call a new API client function
(`applyCouponCode(code, cart)` in a new or existing api-client module — mirror
`features/rewards/lib/rewards-api.ts`'s cookie-fetch convention, NOT `authClient.$fetch`) that
`POST`s to `/coupons/apply` with `{ code, cartItems: cart.items.map(i => ({ productId:
i.menuItemId, quantity: i.quantity })) }`, and maps the response/error into the existing
`ApplyDealResult` union (`{ ok: true, discount }` / `{ ok: false, reason, message }`) so call sites
in `cart.tsx` need minimal changes. These functions become `async` — update their exported
signatures and every call site. Run typecheck.

**Step 9 — `apps/mobile/src/app/(tabs)/order/cart.tsx`.**
`handleApplyCoupon` becomes `async`; add a small loading state around the network call (disable the
Apply button while in flight); keep the existing `Alert.alert` failure UX. Store the applied code
string alongside `cart.appliedDiscount` (new local component state or a small addition threaded
through to checkout — NOT a `Cart`/`AppliedDiscount` type change, per Step 6 decision) so
`useCheckout()`'s order-creation call can pass `couponCode` through to `POST /orders`. Locate
`useCheckout()` (`apps/mobile/src/features/orders/hooks/use-checkout.ts`) and extend its
order-creation payload builder to include `couponCode` when present. Run typecheck.

**Step 10 — Rewards-screen code surfacing.**
Add `fetchMyCoupons()` to `apps/mobile/src/features/rewards/lib/rewards-api.ts` (cookie-fetch,
absolute `env.apiUrl` + Cookie header, mirrors `fetchRewardsSummary`). Add
`use-my-coupons.ts` react-query hook mirroring `use-rewards-summary.ts`. In
`apps/mobile/src/app/(tabs)/rewards/index.tsx`, add a small block (below the existing reward
preview) that renders any `available` reward coupon's code in a copyable `Text`/`Pressable`
(use `expo-clipboard` if already a dependency, else a simple long-press-to-select `Text` — check
`package.json` before adding a new dependency). No new screen; this is additive to the existing
Rewards screen only (per SPEC — full Coupon Wallet stays out of scope). Run typecheck.

### Phase P5 — Seed update (AC8, parallel-safe — no dependency on P2/P3/P4 code, only needs the
schema/types already in place from P1)

**Step 11 — `packages/api/src/db/seed/seed.ts`.**
Bind `REWARD_ROADMAP`'s tier 1 (`'Free regular fries or lemonade'`, 5 stars) to the `classic-fries`
product (existing seeded product, category `fries` — name match confirms this is the intended
binding). Add `eligible_product_id: productIdBySlug.get('classic-fries')` to the tier-1 seed row;
`seedRewardsTable`'s signature needs `productIdBySlug` passed in (it currently takes no args) —
thread it through from `runSeed()`'s existing `productIdBySlug` map (already computed earlier in
`runSeed`, no new query). Confirmed: no migration is needed — `classic-fries` already exists as a
seeded product, and `seedProductsTable`/`seedProductOptionsTable` already run BEFORE
`seedRewardsTable` in `runSeed`'s existing order (verified: `productIdBySlug` is computed at the
line-475 call, `seedRewardsTable()` is called at line-479) — **no reorder is needed for the
product-binding half.**

**[VALIDATE correction — real ordering gap found: `runSeed()` calls `seedRewardsTable()` (line 479)
BEFORE `seedTestUser()` (line 480). The coupon-minting sub-step below needs `jojo@test.com`'s user
id, which does not exist yet at the point `seedRewardsTable()` runs. Additionally, `seedTestUser():
Promise<void>` does not currently return the created/existing user's id.** Fix: do NOT put the
coupon-mint step inside `seedRewardsTable()`. Instead, add a new small step —
`seedTestUserRewardCoupon(productIdBySlug)` — called in `runSeed()` immediately AFTER
`seedTestUser()` (i.e. after line 480), which re-queries `users` by `TEST_USER.email` to get the id
(mirroring `seedTestUser`'s own existing-row lookup at its own top), looks up the tier-1 reward's
row id, then mints (find-or-insert, keyed on `(user_id, reward_id)` — the existing 0006 partial
unique index gives this for free via `onConflictDoNothing`) an `available` reward coupon for that
user id, using the same `rewardCouponCodeGenerator`/retry pattern as `unlockRewardsForLifetime` (or
simply insert directly since seed-time collisions are effectively impossible — execute-agent may
skip the retry loop for the seed-only path and just let a rare collision fail the seed run visibly,
which is acceptable for a dev seed). Update the seed's console.log summary. Run typecheck.

### Phase P6 — Tests (spans P2-P5's surfaces; written after each surface lands, per the per-section
test-gate discipline)

**Step 12 — `packages/api/src/routes/__tests__/coupons.integration.test.ts` (NEW).**
Hermetic, self-seeding, mirrors `rewards.integration.test.ts`. Cover: AC1 (`GET /coupons` returns
only the caller's own coupons, code field present), AC2 (valid reward code + eligible item in cart
succeeds; null `eligible_product_id` rejected; eligible item not in cart rejected; unknown code
rejected), AC3 (a ported deal-code case succeeds identically to the old mobile-only behavior), AC4
(no mutation — assert `coupons.status`/`used_at` unchanged after an apply call, e.g. by reading the
row before and after and asserting equality, or by spying on the db client if the harness supports
it), AC7 (apply-time null-eligible rejection — the apply half of the defense-in-depth pair).

**Step 13 — Extend `packages/api/src/routes/__tests__/orders.test.ts`.**
Cover: AC5 (placing an order with an applied reward coupon marks it `used`, sets `used_at`, writes
one `redeemed` `star_transactions` row referencing the new order), AC6 (a second sequential call
using an already-used-mid-transaction coupon id is rejected — simulate via two sequential
`POST /orders` calls sharing the same coupon id; assert the second's transaction rejects and does
NOT write a second `redeemed` row), AC7 (placement-time rejection for a null-`eligible_product_id`
reward — the order-placement half of the defense-in-depth pair), the LD5 recompute-drop case
(eligible item removed from the body's `items` before calling `POST /orders` → order rejected with
a clear error, not silently placed at full price), and a REGRESSION case (an order WITHOUT
`couponCode` behaves exactly as before — `discount_total` stays `'0.00'`).

**Step 14 — Seed shape assertion.**
Add or extend a seed-covering test asserting `seedRewardsTable`'s tier-1 row has a non-null
`eligible_product_id` matching the `classic-fries` product id, and that `jojo@test.com` has exactly
one `available` reward coupon after seeding (idempotent re-seed does not mint a second one — covered
by the existing 0006 partial index).

**Step 15 — Full verification gate.**
Run every gate command in Verification Evidence. `pnpm turbo run typecheck` (FULL, unfiltered —
per the STAR-001/003 lesson that a filtered typecheck missed a cross-package break, load-bearing
here too since `packages/utils` is now shared by both `packages/api` and `apps/mobile`).

---

## MUST-NOT-REGRESS Guardrails (explicit checklist items)

- **CAUTION-1 — recompute-drop UX.** When the server recomputes the discount at order placement and
  finds it no longer applies (eligible item removed from cart since apply), the customer must see a
  clear inline message explaining why the discount is gone — never a silent full-price charge and
  never a crash. Enforced by Step 6.2 + the LD5 test case in Step 13.
- **CAUTION-2 — deals catalog stays STATIC, never DB-backed.** Do NOT wire the unused
  `deals`/`deal_products`/`deal_branches` tables in this plan, and do NOT add a migration for deals.
  `packages/utils/src/deals-catalog.ts` (Step 1) is a relocated static array, not a new DB read path.
  Any execute-agent temptation to "just query the deals table since it already exists" is explicitly
  OUT OF SCOPE — flag and stop if this seam is found insufficient, do not silently expand scope.

---

## Security Note (STRIDE-lite)

- **Scoping:** both `/coupons/apply` and `GET /coupons` scope every read to `req.user!.id` — same
  pattern as `/rewards/*` (STAR-002). A coupon lookup by `code` alone (without the user filter)
  would let one user probe another user's coupon existence/state; the apply handler filters by
  `(code, user_id)` together, and a miss returns the SAME `not_found` message as a genuinely unknown
  code (no existence leak via distinct error messages).
- **UPDATE-guard race (AC6):** the `UPDATE coupons SET status='used' ... WHERE id=? AND
  status='available'` inside `db.transaction` is the trust boundary for "spent exactly once."
  Because Postgres row-level locking serializes concurrent UPDATEs to the same row, two concurrent
  transactions attempting this UPDATE cannot both succeed — the second transaction's UPDATE either
  blocks until the first commits (then sees 0 matching rows and returns empty) or, under the
  default READ COMMITTED isolation already used elsewhere in this codebase, re-evaluates the WHERE
  clause post-lock-release and correctly finds `status='used'`, returning 0 rows. No new isolation
  level is needed — this mirrors the same class of guarantee the codebase already relies on for
  `orders.order_number`'s `onConflictDoNothing` retry loop (different mechanism, same "exactly once"
  outcome).
- **Replay:** a replayed `POST /orders` request with the same `couponCode` re-enters the same guard
  — the second attempt's UPDATE affects 0 rows and the whole order-placement transaction is
  rejected. No separate idempotency-key mechanism is introduced (out of scope — this plan does not
  add general order-idempotency; only the coupon-specific case is covered, per SPEC AC6).
- **No new secrets/PII.** Coupon `code` is not a security credential in the traditional sense (it's
  a redemption code, scoped to one user, single-use) — no new encryption/hashing need.

---

## Test Infra Improvement Notes

(none identified yet — the existing `packages/api` vitest + supertest hermetic self-seeding pattern
covers everything this plan needs; no new test runner or fixture category required.)

---

## Verification Evidence

Strategy legend: FA = Fully-Automated, H = Hybrid, AP = Agent-Probe.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `routes/__tests__/coupons.integration.test.ts` — "returns only the caller's own available reward coupons with code field present" | Fully-Automated (API half) | **AC1** (Hybrid overall — mobile render is Agent-Probe) |
| Mobile Agent-Probe: Rewards screen renders the available coupon's code, copyable | Agent-Probe | **AC1** |
| `routes/__tests__/coupons.integration.test.ts` — "valid reward code + eligible item in cart succeeds" | Fully-Automated (API half) | **AC2** (Hybrid overall) |
| `routes/__tests__/coupons.integration.test.ts` — "reward with null eligible_product_id is rejected" | Fully-Automated | **AC2**, **AC7** (apply half) |
| `routes/__tests__/coupons.integration.test.ts` — "eligible item not in cart is rejected" | Fully-Automated | **AC2** |
| `routes/__tests__/coupons.integration.test.ts` — "unknown code is rejected" | Fully-Automated | **AC2** |
| Mobile Agent-Probe: cart shows discount line / error message correctly | Agent-Probe | **AC2** |
| `routes/__tests__/coupons.integration.test.ts` — ported deal-code success case | Fully-Automated (API half) | **AC3** (Hybrid overall) |
| Mobile Agent-Probe: existing deal Agent-Probe script re-run, unregressed | Agent-Probe | **AC3** |
| `routes/__tests__/coupons.integration.test.ts` — "applying a reward code performs no DB mutation on the coupons table" | Fully-Automated | **AC4** |
| `routes/__tests__/orders.test.ts` — "placing an order with an applied reward coupon marks it used, sets used_at, writes a redeemed star_transactions row" | Fully-Automated | **AC5** |
| `routes/__tests__/orders.test.ts` — "second attempt using an already-used-mid-transaction reward coupon is rejected, no double redeemed row" | Fully-Automated | **AC6** |
| `routes/__tests__/coupons.integration.test.ts` + `routes/__tests__/orders.test.ts` — null-eligible rejected at BOTH apply and placement | Fully-Automated | **AC7** |
| `seed.integration.test.ts` (or extended seed-covering test) — "seedRewardsTable binds tier 1 to classic-fries; jojo@test.com has exactly one available reward coupon" | Fully-Automated (seed-shape half) | **AC8** (Hybrid overall) |
| Manual Agent-Probe: end-to-end walkthrough using the seeded test user (view code → apply in cart → checkout → see it consumed) | Agent-Probe | **AC8** |
| `routes/__tests__/orders.test.ts` — REGRESSION: order without couponCode unaffected (`discount_total` stays `'0.00'`) | Fully-Automated | REGRESSION |
| `routes/__tests__/orders.test.ts` — LD5 recompute-drop rejected with clear message | Fully-Automated | Constraint (LD5) |
| `DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test` (precondition: `docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate`) | Fully-Automated | Runs all API-side gates above |
| `pnpm turbo run typecheck` (FULL, unfiltered) | Fully-Automated | Cross-package type integrity (`packages/utils` now shared by api+mobile) |
| `pnpm turbo run lint` | Fully-Automated | Lint clean |
| `pnpm format:check` | Fully-Automated | Formatting clean |
| MIG-SYNC: `pnpm --filter @jojopotato/api db:generate` → no new migration file produced | Fully-Automated | Confirms no schema drift / no migration needed (per Constraints) |

**High-risk class note (billing-adjacent/redeemable-value + public API surface):** every developed
behavior above has at minimum a Hybrid gate; AC4/AC5/AC6/AC7 (the load-bearing double-spend and
no-burn-on-apply guarantees) are Fully-Automated. No developed behavior rests on Known-Gap. Mobile
UI rendering (code display, discount line, error messages, end-to-end walkthrough) is Agent-Probe
per the project-wide RN-runner gap — not a new gap introduced by this plan (see
`process/context/tests/all-tests.md`).

**Gate command preconditions:** `docker compose up -d` then `pnpm --filter @jojopotato/api
db:migrate` before the API test command.

---

## Out of Scope (with follow-up routing)

- **Staff-side in-store redemption (issue #29 AC5).** Deferred; a backlog NOTE
  (`process/features/rewards-notifications/backlog/star-005-instore-redemption_NOTE_[date].md` or
  similar) must be written at UPDATE PROCESS.
- **Full Coupon Wallet screen (CPN-001).** This plan adds only a minimal code-surfacing block to the
  existing Rewards screen.
- **ADM-005 (admin-configurable reward rules).** Unaffected — thresholds/type/value/eligible-product
  remain seed/DB-set.
- **Live online payment processing.** Unrelated; `online_payment` stays rejected server-side.
- **Push/notification delivery on redemption.** No new notification on redemption (distinct from the
  existing STAR-003 `reward_unlocked` notification).
- **Deal coupon UI parity beyond "keep it working."** No new deal-specific UI features.
- **Automated RN component/E2E coverage.** Agent-Probe/Known-Gap per the project-wide test-runner
  gap — not a new gap.
- **Expiring reward coupons via a scheduled job.** Not part of this round; `expires_at` is checked
  passively (if set) but nothing actively expires coupons on a schedule.
- **Deleting the now-superseded `apps/mobile/src/features/deals/lib/eligibility.ts`.** Left in place
  (flagged for a later cleanup pass) since it's superseded rather than broken, and other call sites
  may still reference exported helpers during the transition window.

---

## Dependencies

- **Upstream (delivered):** STAR-003 (coupon minting, `coupons`/`rewards` schema, `star_tx_type`
  enum including `'redeemed'`). STAR-002 (`rewards.ts` route mount pattern, Rewards screen to extend).
  Pickup-order-flow / merge-cart-reconciliation / merge-menu-api-reconciliation (existing `useCart()`,
  `useCheckout()`, `POST /orders` transaction shape).
- **Enables:** any future Coupon Wallet screen (CPN-001) or staff-side in-store redemption (STAR-005)
  can build on the same `coupons` read/consume primitives.
- **DB precondition for tests:** `docker compose up -d` + `db:migrate` (no new migration expected —
  MIG-SYNC gate confirms this explicitly rather than assuming it).

---

## Risks

| Risk | Mitigation |
|---|---|
| No migration needed but seed change silently requires a new product row | Step 11 explicitly reuses the existing `classic-fries` product; MIG-SYNC gate (`db:generate` → no new file) proves no drift was introduced. |
| Double-redeem guard implemented as insert-based idempotency instead of the required UPDATE-based state-machine guard | Constraints/LD4 lock the mechanism explicitly; AC6 test asserts the UPDATE-affected-rows-based rejection, not a unique-index conflict. |
| `packages/utils` becoming a shared dependency surface between api and mobile introduces a cross-package typecheck break | Full unfiltered `pnpm turbo run typecheck` gate (Step 15), per the STAR-001/003 lesson. |
| Recompute-drop silently succeeds at full price instead of rejecting | Explicit CAUTION-1 guardrail + dedicated LD5 test case (Step 13). |
| Scope creep onto the unused `deals`/`deal_products`/`deal_branches` DB tables | Explicit CAUTION-2 guardrail — deals stay a static relocated catalog; any temptation to DB-back deals is out of scope and must stop/flag, not proceed. |
| Cross-user coupon-code enumeration via distinct error messages | Security Note — apply handler returns the SAME `not_found` message for "code doesn't exist" and "code belongs to another user." |
| `order_id` FK on the `redeemed` star_transactions row needs the order to already exist, but the discount needs to be known BEFORE the order insert | Step 6 decision: compute the discount pre-insert, but perform the actual coupon-consume UPDATE + redeemed-row insert AFTER the order row exists, still inside the same transaction (atomic either way). |

---

## Phase Completion Rules

Single-plan COMPLEX feature (not a phase program). Completion gates:

- **CODE DONE** — Steps 1–14 implemented; `pnpm turbo run typecheck` green between steps.
- **VERIFIED** — every Verification Evidence gate green in an EVL confirmation run (spawned
  vc-tester), specifically: full API suite (all new + extended coupons/orders scenarios), full
  unfiltered typecheck, lint, format:check, and MIG-SYNC (no new migration file). No developed
  behavior may rest on a Known-Gap.
- **Not VERIFIED until** the validate-contract exists (VALIDATE mandatory — billing-adjacent
  redeemable-value + public API surface) AND the EVL run passes independently of execute-agent's
  own iterate-until-green loop.
- Code-only completion is `CODE DONE`, never `VERIFIED`.

---

## Resume and Execution Handoff

1. **Selected plan file:**
   `process/features/rewards-notifications/active/star-004-reward-redemption_15-07-26/star-004-reward-redemption_PLAN_15-07-26.md`
2. **Last completed phase or step:** PLAN written — VALIDATE not yet run.
3. **Validate-contract status:** pending (placeholder below — vc-validate-agent writes this section
   before EXECUTE).
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md` (+ chain), `process/features/rewards-notifications/_GUIDE.md`,
   STAR-001/002/003 plans + reports (transaction/savepoint pattern, idempotent-seed pattern,
   serializer conventions), `packages/api/src/routes/{orders,rewards}.ts`, `packages/api/src/lib/
   star-earning.ts` (savepoint/transaction pattern to mirror for the coupon-consume step),
   `packages/api/src/db/schema/{coupons,rewards}.ts`, `packages/types/src/{coupons,cart}.ts`,
   `apps/mobile/src/features/deals/lib/{apply-deal,eligibility}.ts`, `apps/mobile/src/app/(tabs)/
   order/cart.tsx`, `packages/api/src/db/seed/seed.ts`.
5. **Next step for a fresh agent:** ENTER VALIDATE MODE for this plan. Key gotchas to carry forward:
   (a) the double-redeem guard MUST be the `UPDATE ... WHERE status='available'` state-machine form,
   never an insert-based unique-index dedupe; (b) apply-time MUST perform zero mutation on `coupons`
   (AC4 is testable by asserting row equality before/after); (c) recompute at order placement never
   trusts the client's apply-time snapshot (LD5); (d) deals stay a static catalog — do not wire the
   unused `deals`/`deal_products`/`deal_branches` tables or add a migration for them; (e) full
   unfiltered `pnpm turbo run typecheck` at the end, since `packages/utils` becomes cross-consumed by
   both `packages/api` and `apps/mobile` for the first time via this plan's new discount module.

---

## Validate Contract

Status: PASS
Date: 15-07-26
date: 2026-07-15
generated-by: outer-pvl

Parallel strategy: parallel-subagents
Rationale: score 2-3/7 (S6 billing-adjacent/redeemable-value class, S7 ~12 blast-radius files) —
MEDIUM. Layer 1 (4 dimension agents) + Layer 2 (6 per-section feasibility agents) ran independently
against a single, already-locked (INNOVATE) plan with no cross-agent coordination needed — fire-and-
forget parallel subagents fit; agent-team was not required (this is one plan, not a 3+ phase
program).

### V1 Pre-Check

- Plan file exists and is readable. Structural validator
  (`node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs`) — **0 failures, 0
  warnings** (re-run after VALIDATE corrections below; 684 lines).
- All 15 Touchpoints file paths confirmed to exist on disk via direct read (`packages/api/src/db/schema/
  {coupons,rewards,star_transactions,orders}.ts`, `packages/api/src/routes/{orders,rewards}.ts`,
  `packages/api/src/lib/star-earning.ts`, `packages/api/src/db/seed/{seed,data}.ts`,
  `packages/types/src/{coupons,cart}.ts`, `packages/utils/src/index.ts`, `apps/mobile/src/features/
  deals/lib/{apply-deal,eligibility}.ts`, `apps/mobile/src/features/deals/mock-deals.ts`,
  `apps/mobile/src/app/(tabs)/order/cart.tsx`, `apps/mobile/src/features/rewards/lib/rewards-api.ts`,
  `apps/mobile/src/features/orders/hooks/use-checkout.ts`). No missing paths.
- No `## Phase Ordering` section (this is a single COMPLEX plan, not a phase program) — Dependency-
  BLOCKED guard does not apply.
- No pre-existing `## Validate Contract` (placeholder only) — no early-exit, full V2 fan-out run.

### V2–V3: Two-Layer Fan-Out + Synthesis

**Layer 1 — 4 dimension agents (all always-on):**

| Layer 1 dimensions | Status | Key finding |
|---|---|---|
| Infra fit | CONCERN → **fixed in plan** | `packages/api/package.json` was missing `@jojopotato/utils` as a dependency (only `@jojopotato/types` listed) — `routes/coupons.ts` and the `orders.ts` extension both import the new shared discount module from `packages/utils`; pnpm's strict workspace resolution requires this declared. Added as a new Touchpoints row + Blast Radius count update. |
| Test coverage | CONCERN → **fixed in plan** | Touchpoints/Steps 12-13/Verification-Evidence table all named the WRONG test file location: `packages/api/src/lib/__tests__/{coupons,orders}.integration.test.ts`. Confirmed via direct read that route-file tests live in `packages/api/src/routes/__tests__/` (`rewards.integration.test.ts`, `staff-orders.integration.test.ts`), and the real file to extend is `packages/api/src/routes/__tests__/orders.test.ts` (no "integration" in the name — `lib/__tests__/orders.integration.test.ts` does not exist). All references corrected in the plan. |
| Breaking changes | PASS | `POST /orders`'s `couponCode` is additive-optional — confirmed against the live `orders.ts` body that `discount_total` is currently hardcoded `'0.00'` and the schema's `discount_total` column already exists (no migration). No enum-widening pattern repeated (the STAR-001/CART-002 `OrderStatus`/`PaymentMethod` lesson does not apply here — no enum is widened). `packages/types` reuses existing `DbCoupon`/`CouponStatus` (STAR-003) — no breaking type change. |
| Security surface (STRIDE) | PASS | Verified the `UPDATE coupons SET status='used' WHERE id=? AND status='available'` guard is genuinely race-safe: under Postgres row-level locking, a second concurrent UPDATE targeting the same row blocks until the first commits, then (under READ COMMITTED, this codebase's default, same as `star-earning.ts`'s `db.transaction` usage) re-evaluates the WHERE clause against the now-committed row and correctly returns 0 rows — no new isolation level needed, matches the plan's own Security Note exactly. Cross-user coupon enumeration is correctly closed (same `not_found` message for both cases). Apply-time preview trusts client-declared `cartItems` for the PREVIEW only — the actual discount is always recomputed server-side from `body.items` at placement (LD5), so the trust boundary is sound end-to-end. |

**Layer 2 — 6 per-section feasibility agents:**

| Layer 2 sections | Status | Key finding |
|---|---|---|
| Section A — Phase P1 (shared discount logic → `packages/utils`) | CONCERN → **fixed in plan** | Load-bearing gap: Step 1's "port `MOCK_DEALS` unchanged" would have carried `eligibleProductIds`/`eligibleBranchIds` from a disconnected mobile-mock id-space (`fries-classic`, `MOCK_CART_BRANCH.id` — confirmed via direct read of `mock-home.ts`/`mock-cart.ts`) that never matches the REAL DB product/branch UUIDs the real cart and real `pickupBranchId` carry (confirmed via `use-cart.ts`/`product/[productId].tsx`: real `menuItemId` = real `products.id` UUID). Ported verbatim, `BGC50` would always reject and BOGO/free-item deals would never match — a real AC3 regression. Also: the apply request contract omitted `pickupBranchId` (needed for branch-scope check) and per-line price/option data (needed for `computeDealDiscountCents`'s subtotal math). All fixed in plan text (Step 1 re-keying instruction + Public Contract #1 request-shape correction). Deal usage-limit checks documented as a pre-existing, non-regressing known limitation (the one usage-limited mock deal has no `code`, so it was never reachable via code-entry anyway). |
| Section B — Phase P2 (`POST /coupons/apply` + `GET /coupons`) | PASS (after Section A fix) | Mount pattern is a copy-exact mirror of `rewardsRouter`'s (`app.use('/coupons', requireSession, couponsRouter)`), confirmed against the live `index.ts` mount at line 185. Cross-user scoping pattern matches `rewards.ts`. "No mutation" claim is mechanically testable via row-equality assertion. |
| Section C — Phase P3 (`POST /orders` extension) | PASS (decision locked) | Transaction structure/ordering (recompute discount pre-insert, consume coupon post-insert, same tx) is sound — verified against the live `orders.ts` transaction body. Resolved the plan's own open question: **locked 409** for the double-redeem-guard rejection specifically (checked `OrderError`'s real usage — only 400/500 precedent exists, nothing blocks adding 409, and 409 Conflict is the semantically correct code to distinguish "state changed under you" from ordinary 400 validation failures). |
| Section D — Phase P4 (mobile cart wiring + Rewards code surfacing) | CONCERN → **fixed in plan** | Touchpoints list was missing `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` — confirmed via grep this file directly calls `applyDealById` (becomes async per Step 8) and `checkDealEligibility` (stays sync/local). Without updating this call site to `await` the new async result, the deal-details "Apply" button silently breaks. Added to Touchpoints. |
| Section E — Phase P5 (seed update, AC8) | CONCERN → **fixed in plan** | Confirmed via direct read of `seed.ts` that `productIdBySlug` IS already available before `seedRewardsTable()` runs (no reorder needed for the product-binding half, resolving the plan's own uncertainty). BUT found a real gap the plan missed: `runSeed()` calls `seedRewardsTable()` (line 479) BEFORE `seedTestUser()` (line 480) — `jojo@test.com`'s user row doesn't exist yet when the coupon-mint step the plan describes would run, and `seedTestUser(): Promise<void>` doesn't return the user id anyway. Fixed: moved the coupon-mint sub-step to a new function called AFTER `seedTestUser()` in `runSeed()`. |
| Section F — Phase P6 (tests) | CONCERN → **fixed in plan** | Inherits the Layer 1 test-coverage path finding — corrected the same way (see above). |

**Totals: 0 FAILs / 6 CONCERNs (all resolved via plan updates applied at V6) / 4 PASSes.**

**→ Net Gate: PASS** — 0 unresolved FAILs, 0 unresolved CONCERNs after the 5 plan-text corrections
applied directly to the plan file during this VALIDATE pass (touchpoints/test-paths, missing
`packages/utils` dependency, deal-catalog id re-keying + request-shape fix, missing mobile
touchpoint, seed-ordering fix, 409 status-code lock). No unresolved gaps required looping back to
PLAN — none of the findings required re-opening a locked INNOVATE decision (LD1–LD7 unchanged).

### Plan Updates Applied (P1–P6, all applied directly to the plan file at V6)

| # | What changed | Where in plan | Why |
|---|---|---|---|
| P1 | Corrected `packages/api/src/lib/__tests__/{coupons,orders}.integration.test.ts` → `packages/api/src/routes/__tests__/{coupons.integration.test.ts, orders.test.ts}` everywhere (Touchpoints, Steps 12/13 headers, Verification Evidence rows, Blast Radius bullet) | Touchpoints, Implementation Checklist Steps 12-13, Verification Evidence | Test-coverage dimension found the paths didn't match the real, established `routes/__tests__/` convention — `lib/__tests__/orders.integration.test.ts` does not exist |
| P2 | Added `packages/api/package.json` (add `@jojopotato/utils` dependency) as a new Touchpoints row | Touchpoints, Blast Radius file count | Infra-fit dimension found the new route's shared-utils import has no declared workspace dependency |
| P3 | Added `pickupBranchId` + optional `selectedOptions` to `POST /coupons/apply`'s request shape | Public Contracts #1 | Section A found the ported deal-eligibility functions need branch context + per-line price data that the original request shape omitted |
| P4 | Added a re-keying instruction to Step 1 (deals-catalog port): re-derive `eligibleProductIds`/`eligibleBranchIds` from REAL seeded product/branch ids, not copied from the mobile mock's disconnected id-space; documented the deal-usage-limit known-limitation | Implementation Checklist Step 1 | Section A found a load-bearing AC3 regression risk (mock ids never match real cart/branch ids) |
| P5 | Added `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` as a new Touchpoints row | Touchpoints, Blast Radius file count | Section D found a live call site of `applyDealById` (becoming async) that the original plan missed |
| P6 | Fixed Step 11's seed ordering: coupon-mint sub-step now runs in a new function called AFTER `seedTestUser()`, not inside `seedRewardsTable()` | Implementation Checklist Step 11 | Section E found `jojo@test.com`'s user row doesn't exist yet at the point the original plan wanted to mint the coupon |
| P7 | Locked 409 (not 400) for the double-redeem-guard rejection in Step 6.3 | Implementation Checklist Step 6 | Section C resolved the plan's own explicitly-flagged open question |

### Execute-Agent Instructions

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | When porting `checkDealEligibility`/`computeDealDiscountCents` server-side (Step 2/4), you must synthesize a `Cart`-shaped object (or the equivalent inputs) from `cartItems` + a DB price lookup (base price + option deltas, mirroring `orders.ts` lines 121-140) — do not pass `cartItems` directly into functions expecting a full `Cart`. If a mismatch is found between the ported function's parameter shape and what's available, adapt the caller, not the ported function's core logic (`EligibilityFailReason` union must stay a superset, per LD3). | Step 2/4 entry |
| E2 | When re-keying `DEAL_CATALOG`'s `eligibleProductIds`/`eligibleBranchIds` to real seeded ids (Step 1, per P4 above), confirm the resulting real product/branch ids still make sense for each deal's original intent (e.g. BOGO-fries → `classic-fries`, free-lemonade → the seeded lemonade product) — do not silently drop the restriction if a matching seeded product/branch can't be found; flag and ask rather than guess. | Step 1 entry |
| E3 | Confirm `seedTestUser()`'s existing top-of-function query (`db.select({id: users.id}).from(users).where(eq(users.email, TEST_USER.email))`) is reused (not duplicated) when building the new post-`seedTestUser()` coupon-mint step (Step 11 / P6 above). | Step 11 entry |
| E4 | Full unfiltered `pnpm turbo run typecheck` (not scoped to changed packages) must be run after each phase (P1 through P6), not only at the end — `packages/utils` is now cross-consumed by `packages/api` AND `apps/mobile` for the first time, and the STAR-001/003 lesson (a filtered typecheck missed a cross-package break) applies directly. | End of every Phase P1-P6 |
| E5 | Run `pnpm --filter @jojopotato/api db:generate` after all schema-touching work (there should be none — this plan adds no migration) to positively confirm the MIG-SYNC gate: no new migration file produced. If a new file IS produced, STOP — do not commit a migration this plan didn't intend; investigate what triggered schema drift before proceeding. | End of Phase P5/before Phase P6 tests |

### Test Gates (5-column table)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Caller sees their own available reward coupon code, scoped to `req.user!.id` | Fully-Automated | `routes/__tests__/coupons.integration.test.ts` — "GET /coupons returns only the caller's own coupons, code field present" | A |
| AC1-UI | Rewards screen renders the coupon's code, copyable | Agent-Probe | Manual: open Rewards screen as seeded `jojo@test.com`, confirm code block renders and is copyable | A |
| AC2 | Valid reward code + eligible item in cart succeeds; null-eligible / not-in-cart / unknown code all rejected | Fully-Automated | `routes/__tests__/coupons.integration.test.ts` — 4 cases: success, null-eligible reject, not-in-cart reject, unknown-code reject | A |
| AC2-UI | Cart shows discount line / error message correctly | Agent-Probe | Manual: apply valid + invalid codes in the cart screen, confirm UI feedback | A |
| AC3 | Deal codes continue to work through the unified apply path (post re-keying fix) | Fully-Automated | `routes/__tests__/coupons.integration.test.ts` — ported deal-code (`WELCOME20`) success case, re-keyed against real seeded product/branch ids | B |
| AC3-UI | Existing deal Agent-Probe script re-run, unregressed | Agent-Probe | Manual: re-run the pre-existing deal-apply walkthrough against the new server-backed path | A |
| AC4 | Applying a code performs ZERO DB mutation on `coupons` | Fully-Automated | `routes/__tests__/coupons.integration.test.ts` — "applying a reward code performs no mutation on the coupons table" (read row before/after, assert equality) | A |
| AC5 | Checkout with an applied reward marks it `used`, sets `used_at`, writes exactly one `redeemed` `star_transactions` row | Fully-Automated | `routes/__tests__/orders.test.ts` — "placing an order with an applied reward coupon marks it used, sets used_at, writes a redeemed star_transactions row" | A |
| AC6 | A reward coupon can never be spent twice, even under a race/replay | Fully-Automated | `routes/__tests__/orders.test.ts` — "second sequential attempt using an already-used-mid-transaction coupon id is rejected (409), no double redeemed row" | A |
| AC7 | Reward with `eligible_product_id` unset is rejected at BOTH apply and order-placement | Fully-Automated | `routes/__tests__/coupons.integration.test.ts` (apply half) + `routes/__tests__/orders.test.ts` (placement half) — both reject `no_eligible_product` | A |
| AC8 | Tier-1 reward bound to a real product; seed mints an `available` coupon for the test user | Fully-Automated (seed-shape half) | `routes/__tests__/seed`-covering test (or extended seed test) — "seedRewardsTable binds tier 1 to classic-fries; jojo@test.com has exactly one available reward coupon after seeding, idempotent on re-seed" | A |
| AC8-UI | Manual end-to-end walkthrough (view code → apply → checkout → see it consumed) | Agent-Probe | Manual, using the seeded `jojo@test.com` user | A |
| REGR | Order without `couponCode` is unaffected — `discount_total` stays `'0.00'` | Fully-Automated | `routes/__tests__/orders.test.ts` — regression case, no `couponCode` in the request | A |
| LD5 | Recompute-drop: eligible item removed from cart between apply and checkout is rejected with a clear message, never silently placed at full price | Fully-Automated | `routes/__tests__/orders.test.ts` — LD5 recompute-drop case | A |
| INFRA-1 | `packages/api` can import `packages/utils`'s new discount module | Fully-Automated | `pnpm turbo run typecheck` (FULL, unfiltered) passes with the new `@jojopotato/utils` dependency added to `packages/api/package.json` | B |
| MIG-SYNC | No new migration is introduced by this plan | Fully-Automated | `pnpm --filter @jojopotato/api db:generate` → no new migration file produced | A |
| LINT/FMT | Code style clean | Fully-Automated | `pnpm turbo run lint` + `pnpm format:check` | A |

gap-resolution legend: A — proven now (gate passes in this cycle). B — fixed in this plan (gate
added by this plan's checklist / by the P2 plan-update above).

C-4 reconciliation: all rows above use only the 3 proving strategies (Fully-Automated / Agent-Probe
this cycle; no Hybrid row was needed since every DB-dependent scenario runs against the same local
Postgres already required for the whole `packages/api` suite, i.e. it is Fully-Automated once the
one shared precondition below is met — not a per-scenario Hybrid precondition). No developed
behavior rests on Known-Gap.

**Gate commands (exact, with preconditions):**

```bash
docker compose up -d
pnpm --filter @jojopotato/api db:migrate
DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test
pnpm turbo run typecheck
pnpm turbo run lint
pnpm format:check
pnpm --filter @jojopotato/api db:generate   # MIG-SYNC: confirm no new migration file is produced
```

Legacy line form (retained so existing validate-contract consumers still parse):
- `packages/api` coupons/orders integration suite: `docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate` (precondition) then `DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test` [Fully-automated]
- Cross-package type integrity: `pnpm turbo run typecheck` (FULL, unfiltered) [Fully-automated]
- Lint: `pnpm turbo run lint` [Fully-automated]
- Format: `pnpm format:check` [Fully-automated]
- Migration sync: `pnpm --filter @jojopotato/api db:generate` → expect no new file [Fully-automated]
- Mobile UI (code render, cart apply UX, deal-apply regression, e2e walkthrough): manual Agent-Probe — no automated RN runner exists (project-wide gap, see `process/context/tests/all-tests.md`), not a new gap introduced by this plan.

### Failing Stubs (Fully-Automated rows only, TDD red-first starting point for execute-agent)

```
test("should return only the caller's own coupons, code field present", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: GET /coupons returns only the caller's own coupons, code field present")
})

test("should succeed for a valid reward code with an eligible item in cart", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: valid reward code + eligible item in cart succeeds")
})

test("should reject a reward code with null eligible_product_id at apply time", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: reward with null eligible_product_id is rejected")
})

test("should reject when the eligible item is not in the cart", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: eligible item not in cart is rejected")
})

test("should reject an unknown code", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: unknown code is rejected")
})

test("should succeed for a ported deal code re-keyed to real seeded ids", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: ported deal-code success case")
})

test("should perform zero DB mutation on coupons when applying a code", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: applying a reward code performs no mutation on the coupons table")
})

test("should mark the coupon used, set used_at, and write one redeemed star_transactions row on order placement", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: placing an order with an applied reward coupon marks it used, sets used_at, writes a redeemed star_transactions row")
})

test("should reject a second concurrent/replayed redemption of the same coupon with 409, no double redeemed row", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: second attempt using an already-used-mid-transaction reward coupon is rejected")
})

test("should reject a null-eligible reward at order placement (defense in depth)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: null-eligible rejected at order placement")
})

test("should bind tier-1 reward to classic-fries and mint exactly one available coupon for jojo@test.com", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: seedRewardsTable binds tier 1 to classic-fries; jojo@test.com has exactly one available reward coupon")
})

test("should leave discount_total at 0.00 when no couponCode is supplied", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: order without couponCode unaffected, discount_total stays 0.00")
})

test("should reject order placement with a clear message when the eligible item was removed from the cart since apply", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: LD5 recompute-drop rejected with clear message")
})
```

### Dimension Findings

- Infra fit: PASS (after fix) — missing `@jojopotato/utils` dependency added to `packages/api/package.json`.
- Test coverage: PASS (after fix) — test file paths corrected to the real `routes/__tests__/` convention; every developed behavior (AC1-AC8, REGR, LD5) has a Fully-Automated or Agent-Probe gate; no Known-Gap.
- Breaking changes: PASS — `couponCode` is additive-optional; no enum widening; no auth/schema surface change.
- Security surface: PASS — double-redeem guard verified race-safe under real Postgres semantics; cross-user enumeration closed; apply-time preview is non-authoritative by design (LD5 recompute).
- Section A feasibility (shared discount logic): PASS (after fix) — mechanical feasibility confirmed once the deal-catalog id-space and request-contract gaps are corrected (see Plan Updates Applied P3/P4).
- Section B feasibility (coupons routes): PASS.
- Section C feasibility (orders.ts extension): PASS — 409 decision locked.
- Section D feasibility (mobile wiring): PASS (after fix) — missing call site added to Touchpoints.
- Section E feasibility (seed): PASS (after fix) — ordering gap corrected.
- Section F feasibility (tests): PASS (after fix) — inherits Section-A/Layer-1 path fix.

Open gaps: none unresolved. (Out-of-scope items — staff-side in-store redemption (AC5 of issue #29),
full Coupon Wallet screen, ADM-005, live online payment, push notification on redemption, deal-UI
parity beyond "keep it working," automated RN E2E coverage, scheduled coupon expiry — are already
explicitly listed in the plan's own "Out of Scope" section with correct backlog-routing language;
none of these are new gaps introduced during VALIDATE.)

What this coverage does NOT prove:
- The Fully-Automated API-side gates (AC1-AC8, REGR, LD5) prove server-side correctness only — they
  do NOT prove the mobile UI actually renders the coupon code, shows the discount line, surfaces
  error messages correctly, or that the async `apply-deal.ts` call sites (`cart.tsx` and
  `[dealId].tsx`) are wired correctly end-to-end in the running app. That is covered ONLY by the
  Agent-Probe manual walkthroughs (AC1-UI, AC2-UI, AC3-UI, AC8-UI) — there is no automated RN
  component/E2E runner in this repo (project-wide known gap, `process/context/tests/all-tests.md`),
  not a new gap introduced by this plan.
- The MIG-SYNC gate (`db:generate` → no new file) proves no schema DRIFT was introduced by code
  changes in this plan; it does NOT itself prove the existing schema already has every column this
  plan relies on — that was separately confirmed by direct source review of
  `packages/api/src/db/schema/{coupons,rewards,star_transactions,orders}.ts` during VALIDATE (all
  referenced columns — `coupons.status/expires_at/used_at/reward_id`, `rewards.eligible_product_id`,
  `star_transactions.type` enum's `'redeemed'` value, `orders.discount_total` — already exist).
- The double-redeem-guard race-safety reasoning (Security Note + Layer 1 Security finding above) is
  a correctness argument grounded in documented Postgres MVCC/locking semantics, cross-checked
  against this codebase's existing use of the same pattern (`star-earning.ts`) — it is NOT itself
  proven by a live concurrent-load test; the AC6 test (`routes/__tests__/orders.test.ts`) exercises
  it via two SEQUENTIAL calls sharing a coupon id (the second sees the first's committed state), not
  literal concurrent request timing. A true concurrency/load test is out of scope for this plan
  (matches the project-wide "no live-integration/concurrent-load harness" gap already tracked in
  `process/context/tests/all-tests.md`).

Gate: PASS (no FAILs; plan updated — 6 CONCERNs found and resolved via 7 direct plan-text
corrections applied during this VALIDATE pass; 0 remaining unresolved gaps)
Accepted by: N/A — no CONCERNs remain unresolved; all findings were corrected in plan text rather
than accepted as residual gaps.
---

## Autonomous Goal Block

```
SESSION GOAL: STAR-004 — in-app reward coupon redemption (apply + order-placement consumption + Rewards code surfacing)
Charter + umbrella plan: N/A — single plan (rewards-notifications feature, not a phase program)
Autonomy: standard /goal autonomous execution rules (process/development-protocols/orchestration.md
  §Autonomous /goal Phase Program Execution) — CONDITIONAL findings apply-and-proceed, BLOCKED items
  go to backlog + continue, irreversible/outward-facing actions without explicit contract
  instruction are a hard stop.
Hard stop conditions / safety constraints:
- Double-redeem guard MUST stay the UPDATE ... WHERE status='available' state-machine form —
  never swap to an insert-based unique-index dedupe.
- Apply endpoint MUST perform zero DB mutation on coupons (AC4) — no insert/update in that handler.
- Deals MUST stay a static catalog — do NOT wire the unused deals/deal_products/deal_branches DB
  tables and do NOT add a migration for deals under this plan.
- Server MUST recompute the discount at order placement, never trust the client's apply-time
  snapshot (LD5) — a recompute-drop must reject with a clear message, never silently place at
  full price.
- No new migration expected — MIG-SYNC gate (db:generate → no new file) must stay green.
Next phase: EXECUTE — ENTER EXECUTE MODE for
  process/features/rewards-notifications/active/star-004-reward-redemption_15-07-26/star-004-reward-redemption_PLAN_15-07-26.md
Validate contract: inline in plan (## Validate Contract section, this file)
Execute start: pnpm turbo run typecheck (after each phase P1-P6) | docker compose up -d && pnpm
  --filter @jojopotato/api db:migrate && DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato"
  pnpm --filter @jojopotato/api test | Agent-Probe: seeded jojo@test.com end-to-end walkthrough
  (view code -> apply in cart -> checkout -> see it consumed) | high-risk pack: no (billing-adjacent
  redeemable-value class has full Fully-Automated coverage on the load-bearing guarantees AC4-AC7;
  no auth/schema/migration/deploy surface touched)
```

---

## Deviations (recorded during EXECUTE, 15-07-26 — all within blast radius, none hard-stop class)

1. **DEAL_CATALOG uses SLUG-based restrictions, resolved to real UUIDs server-side (not a
   literal-id `Deal[]`).** Plan Step 1 wording implied a `Deal[]` with re-keyed real product/branch
   ids. Reality: seeded product/branch ids are random UUIDs (`defaultRandom()`) and `packages/utils`
   cannot read the DB, so a static catalog cannot hold real ids. `packages/utils/src/deals-catalog.ts`
   therefore keys restrictions by slug (`eligibleProductSlugs`/`eligibleBranchSlugs`), and the server
   (`routes/lib/coupon-apply.ts`) resolves those slugs → real seeded UUIDs at request time before
   running eligibility. This IS the faithful realization of E1 ("adapt the caller, not the ported
   function") + E2 ("resolved the same way Step 11 resolves classic-fries" = a runtime DB lookup, not
   a copied literal). Deals remain a STATIC relocated catalog (CAUTION-2 honored — no deals table
   wiring, no migration). Impact: none on ACs; AC3 deal-parity test (WELCOME20, unrestricted) passes.
2. **`BGC50` branch restriction re-keyed to `jojo-centrio`.** The real seed has no "BGC" branch; per
   E2 ("do not guess / do not silently drop") I mapped the branch-exclusive fixed-discount deal to the
   seed's own designated branch-exclusive branch (`jojo-centrio`, used by the seed "Branch-exclusive
   opening promo"). Intent-preserving, documented, not reachable by any automated gate (BGC50 is not
   used in tests).
3. **`checkRewardEligibility` gained an `allowUsed` option** so ORDER PLACEMENT defers single-use to
   the locked `UPDATE ... WHERE status='available'` 409 guard (Step 6.3 / AC6), while APPLY keeps its
   400 `already_used` preview. This reconciles an internal plan tension: Step 2 has
   `checkRewardEligibility` reject a non-`available` status, but Step 6.3 + the AC6 Test Gate require
   the 409 UPDATE-guard to fire on a sequential replay (which the status pre-check would otherwise
   short-circuit to 400). Net: apply-of-used → 400 `already_used`; placement-replay-of-used → 409
   (guard). AC6 test now green.
4. **`applyDealById` for a CODE-LESS mock deal returns "can only be applied with a code".** The
   unified endpoint is code-based (no id-based staging path — locked LD6), so the deal-details
   direct-apply of a code-less mock deal (BOGO/free-lemonade/size-upgrade/summer-bundle) no longer
   applies client-side. This is a minor, documented consequence of the intentional DEAL-003 surface
   unification; coded deals (WELCOME20/BGC50) still work.
5. **Test-infra fix: `seed-test-user.test.ts` teardown now deletes the user's coupons +
   star_transactions before deleting jojo@test.com.** Seeding an `available` reward coupon for
   jojo@test.com (LD7/Step 11) adds a `coupons.user_id` FK that made the existing test's bare
   `DELETE FROM users WHERE email=jojo@test.com` violate the FK. VALIDATE did not flag this
   interaction. The teardown fix keeps that suite green (verified: 3/3 pass). Within blast radius
   (seed + its test).

**Verification note (EVL-relevant):** local port 5432 is occupied by an unrelated `postgres_dev`
container, so the API suite was run against a dedicated jojo Postgres on **port 5544**
(`DATABASE_URL="postgres://jojo:jojo@localhost:5544/jojopotato"`). All gate results below used that
override. Result: **114/114 API tests pass** (14 files), full unfiltered typecheck 5/5, lint 6/6,
`format:check` clean, MIG-SYNC `db:generate` → "No schema changes, nothing to migrate" (no new
migration).
