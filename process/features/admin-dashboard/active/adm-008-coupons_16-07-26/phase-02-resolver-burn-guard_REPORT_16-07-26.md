---
phase: phase-02-resolver-burn-guard
date: 2026-07-16
status: COMPLETE
feature: admin-dashboard
plan: process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-02-resolver-burn-guard_PLAN_16-07-26.md
---

# Phase 02 — Resolver + Burn + orders.ts Guard — EXECUTE Report

**TL;DR:** All checklist items A–D done. `resolveCouponDiscount()` gained the LD1 Branch-1
`reward_id IS NOT NULL` fix + a real DB-backed offer-coupon branch (static `deals-catalog.ts`
deleted, zero remaining importers). `orders.ts` burn UPDATE now claims-on-redeem via `COALESCE`,
and a new `is_deal` + `couponCode` → 400 guard was added inside the placement transaction.
AC5/AC6/AC7/AC8 are each proven by real passing tests — no Known-Gap. Exit gate green:
`api typecheck` = 0 errors, `api test` = **279/279** (0 regressions).

---

## What Was Done

### Step A — Resolver (`packages/api/src/routes/lib/coupon-apply.ts`)

**A1 — LD1 Branch-1 fix (required).** The reward-coupon lookup was scoped only to `(code, user_id)`,
so a TARGETED offer-coupon (user_id set, reward_id NULL) matched it first and hit
`checkRewardEligibility(reward=null)` → wrong `no_eligible_product` 400. Fix: added
`isNotNull(coupons.reward_id)` to the Branch-1 `WHERE`, confining it to true reward-coupons; an
offer-coupon now falls through to the new branch.

```diff
   const [couponRow] = await dbc
     .select({ coupon: coupons, rewardName: rewards.name, rewardEligibleProductId: rewards.eligible_product_id })
     .from(coupons)
     .leftJoin(rewards, eq(coupons.reward_id, rewards.id))
-    .where(and(eq(coupons.code, code), eq(coupons.user_id, userId)));
+    .where(and(eq(coupons.code, code), eq(coupons.user_id, userId), isNotNull(coupons.reward_id)));
```

**A2 — new offer-coupon branch.** Replaced the static `DEAL_CATALOG` branch with a real branch that
matches `code` against `coupons` rows where `offer_id IS NOT NULL`, inner-joins `offers` for the
discount mechanic, enforces ownership (bulk `user_id NULL` = claimable by anyone; targeted = owner
only, else `not_found`), applies the same reason-code contract (`already_used`/`expired` — with the
`allowUsedReward` deferral for placement, identical to reward coupons), then runs offer eligibility
(window/branch/product/minimum, surfacing `not_in_window`/`branch_ineligible`/`below_minimum_order`
etc.) via the shared engine. It reuses `serializeDeal(offer, branchIds, productIds)` to build the
cents-based `Deal` (the same polymorphic money rule the public `GET /deals` uses — no duplicated
money conversion) and `computeDealDiscountCents` for the amount. The matched coupon's `id` is
returned as the existing `rewardCouponId` field so the generic atomic burn in `orders.ts` consumes
it unchanged.

```ts
const [offerCouponRow] = await dbc
  .select({ coupon: coupons, offer: offers })
  .from(coupons)
  .innerJoin(offers, eq(coupons.offer_id, offers.id))
  .where(and(eq(coupons.code, code), isNotNull(coupons.offer_id)));
if (offerCouponRow) {
  const { coupon, offer } = offerCouponRow;
  if (coupon.user_id !== null && coupon.user_id !== userId) return { ok:false, status:400, reason:'not_found', ... };
  if (!allowUsedReward && coupon.status === 'used') return { ok:false, status:400, reason:'already_used', ... };
  if (coupon.status === 'expired') return { ok:false, status:400, reason:'expired', ... };
  if (coupon.expires_at !== null && coupon.expires_at.getTime() < Date.now()) return { ok:false, status:400, reason:'expired', ... };
  const productIds = (await dbc.select(...).from(offerProducts).where(eq(offerProducts.offer_id, offer.id))).map(r=>r.id);
  const branchIds  = (await dbc.select(...).from(offerBranches).where(eq(offerBranches.offer_id, offer.id))).map(r=>r.id);
  const deal = serializeDeal(offer, branchIds, productIds);
  const result = checkDealEligibility(deal, cart, pickupBranchId, []);
  if (!result.eligible) return { ok:false, status:400, reason:result.reason, message:result.message };
  return { ok:true, rewardCouponId: coupon.id, discount:{ source:'deal', refId: offer.id, label: offer.title, amountCents: computeDealDiscountCents(deal, cart) } };
}
```

**A3 — retire `deals-catalog.ts`.** Repo-wide importer scan
(`grep -rn "deals-catalog|findCatalogDealByCode|catalogDealToDeal|DEAL_CATALOG|CatalogDeal"`) found
the ONLY consumers were `coupon-apply.ts` (this branch removed) and the barrel re-export in
`packages/utils/src/index.ts`. `apps/mobile` has its OWN `checkDealEligibility`/
`computeDealDiscountCents` in `features/deals/lib/eligibility.ts` — it never imported the utils
catalog. **Decision: DELETED** `packages/utils/src/deals-catalog.ts` (166 lines) and removed the
`export * from './deals-catalog';` barrel line. No dead code left, no backlog note needed.

### Step B — Field-source renames (already satisfied by Phase 1)

B1 (`coupons.ts` `GET /coupons`) and B2 (`serializers.ts` `serializeCoupon`/
`serializeCouponWithLabel`) were **already completed by Phase 1's atomic rename** — both files
already read `coupon.offer_id` (wire field name `dealId` frozen per LD7B) and `DealRow` is already
`InferSelectModel<typeof offers>`. Phase 1 had to do this to keep typecheck green. No new edit was
required this phase; verified by reading the real files + a clean typecheck.

### Step C — `packages/api/src/routes/orders.ts`

**C1** — read the real current file first (post-Phase-1, post-`490d271`, post-migration-0009
`coupon_id`). Confirmed the dormant deal-apply block already uses `offers`/`offerBranches`/
`offerProducts` (Phase 1 repointed the queries).

**C2 — claim-on-redeem burn UPDATE:**

```diff
   .update(coupons)
-  .set({ status: 'used', used_at: new Date() })
-  .where(and(eq(coupons.id, rewardCouponIdToConsume), eq(coupons.status, 'available')))
+  .set({ status: 'used', user_id: sql`coalesce(${coupons.user_id}, ${userId})`, used_at: new Date() })
+  .where(and(
+    eq(coupons.id, rewardCouponIdToConsume),
+    eq(coupons.status, 'available'),
+    or(isNull(coupons.user_id), eq(coupons.user_id, userId)),
+  ))
   .returning({ id: coupons.id });
```

**C3 — `is_deal` guard (LD6/AC6)** added after the item loop, inside the placement transaction,
before any write:

```ts
if (hasCoupon && body.items.some((line) => productById.get(line.productId)?.is_deal === true)) {
  throw new OrderError(400, 'Coupon codes cannot be combined with Deal products.');
}
```

**C4 — dormant comment rename:** `deal_branches` → `offer_branches`, `deal_products` →
`offer_products` in the two inline dormant-block step comments (mechanism unchanged; `orders.deal_id`
column name intentionally left `deal_id` per LD7A).

### Step D — Tests (all real, no Known-Gap)

- `coupons.integration.test.ts` (couponsRouter): seeded an active agnostic 20% offer + an
  out-of-window offer + 5 offer-coupons (bulk / targeted / expired-status / used-status /
  offer-out-of-window). Replaced the retired AC3 `WELCOME20` catalog test with the offer-coupon
  suite: bulk apply preview (source `deal`, 200c), **targeted apply (LD1 Branch-1 fix regression)**,
  non-owner `not_found`, and the AC7 reason codes `expired`/`already_used`/`not_in_window`. Added
  offer-coupon cleanup by `offer_id` (catches the bulk `user_id NULL` row) then parent offers.
  13 tests.
- `orders.test.ts` (ordersRouter): AC5 order half — targeted offer-coupon placement (subtotal 1300,
  20% = 260 discount, total 1040, coupon `used`+`user_id` claimed, `order.couponId` linked) THEN
  re-use → **409**. AC6 — `is_deal` product + `couponCode` → 400, no order, coupon untouched. D4 —
  a NEW bulk (`user_id NULL`) two-racer concurrency case (two different users, same code) asserting
  exactly `[201, 409]` and the coupon claimed to the winner, added **alongside** the existing
  `43e9c13` reward-coupon race test. 34 tests (was 31).
- D3 regression — all pre-existing reward-coupon tests (apply + placement + AC6/AC7) still pass
  unmodified.

---

## What Was Skipped or Deferred

- **High-risk 5-artifact evidence pack** — the umbrella declares this required "before finalize
  (Phase 1 through Phase 4 collectively)", not as a per-phase-2 exit condition. Phase 2's own exit
  gate (typecheck + test + ACs) is met. The pack remains owed at program finalize. Surfaced as a
  CONCERN, not a blocker.

---

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Typecheck | `pnpm --filter @jojopotato/api typecheck` | **0 errors** |
| Utils typecheck | `pnpm --filter @jojopotato/utils typecheck` | **0 errors** |
| Full API suite | `pnpm --filter @jojopotato/api test` | **279 passed (279), 22 files, 0 regressions** |
| Format | `prettier --check` (5 touched files) | **clean** (1 test file auto-formatted) |

Per-AC proof:
- **AC5** — `coupons.integration.test.ts` bulk + targeted apply preview (Branch-1 fix) + `orders.test.ts`
  placement-burns-once + re-use-409. ✅ real passing.
- **AC6** — `orders.test.ts` `is_deal` + `couponCode` → 400. ✅ real passing.
- **AC7** — `coupons.integration.test.ts` `expired` / `already_used` / `not_in_window` / `not_found`. ✅ real passing.
- **AC8** — full reward-coupon suite re-run + full 279-test suite, 0 regressions. ✅ real passing.
- **Claim-on-redeem atomicity** — `orders.test.ts` bulk two-racer `[201, 409]`, claimed to winner. ✅ real passing.

Exact final gate output:
```
 Test Files  22 passed (22)
      Tests  279 passed (279)
   Duration  57.75s
```

---

## Plan Deviations (all within-blast-radius; none hard-stop class)

1. **B1/B2 pre-completed by Phase 1.** The plan listed them as Phase-2 edits; Phase 1's rename
   already applied them (required for typecheck). Verified, no new change. Consistent with the
   umbrella's Option-A phase-boundary correction (Phase 1 = full mechanical rename incl. consumers).
2. **D1 "apply+order+re-apply" split across two test files.** `couponsRouter` and `ordersRouter`
   live in separate hermetic test apps; the coupons test mounts only `/coupons`, the orders test only
   `/orders`. Apply-preview + Branch-1 proof went in `coupons.integration.test.ts`; the real
   order-placement + re-use-rejection went in `orders.test.ts` (the file D4 itself names as the home
   of order-placement tests). AC5 is fully proven by real passing tests across both files.
3. **Retired the AC3 `WELCOME20` catalog-parity test.** Direct, necessary consequence of A3 deleting
   `DEAL_CATALOG` — replaced by the DB-backed offer-coupon apply tests. Both test files are in the
   plan's blast radius.
4. **Bulk-race loser asserts 409, not a literal `already_used` 400.** The plan's "already_used
   rejection" wording maps to the existing single-use burn guard, which throws `409` when the
   `WHERE status='available'` UPDATE finds 0 rows (same mechanism/assertion as the existing reward
   race test). Under placement the resolver runs with `allowUsedReward:true`, so the loser is always
   caught by the burn guard (409), never the resolver's 400.

---

## Test Infra Gaps Found

- None new. `apps/mobile` still has no RN runner (pre-existing, project-wide) — not exercised by this
  API-only phase.

---

## Closeout Packet

- **Selected plan:** `phase-02-resolver-burn-guard_PLAN_16-07-26.md`
- **Finished:** Steps A (A1/A2/A3), C (C1–C4), D (D1–D6). Step B verified pre-satisfied by Phase 1.
- **Verified:** api typecheck 0 errors; full 279-test suite green (incl. all new AC5/6/7/8 +
  concurrency cases); prettier clean.
- **Unverified / owed:** program-level high-risk 5-artifact evidence pack (finalize gate, not Phase-2).
- **Cleanup remaining:** none in-code. Commit is handed to the user (no auto-commit, per program rule).
- **Blast radius (exact):** `coupon-apply.ts`, `orders.ts`, `coupons.integration.test.ts`,
  `orders.test.ts` (modified); `deals-catalog.ts` (deleted); `packages/utils/src/index.ts` (barrel
  line removed). `+377 / −216`.
- **Best next state:** `Ready for UPDATE PROCESS archival` for this phase (EVL confirmation +
  user-driven commit checkpoint first).

### Suggested commit (hand to user — do NOT auto-commit)
```bash
git add packages/api/src/routes/lib/coupon-apply.ts \
        packages/api/src/routes/orders.ts \
        packages/api/src/routes/__tests__/coupons.integration.test.ts \
        packages/api/src/routes/__tests__/orders.test.ts \
        packages/utils/src/index.ts \
        packages/utils/src/deals-catalog.ts
git commit -m "feat(coupons): ADM-008 P2 offer-coupon resolver + claim-on-redeem burn + is_deal guard

- coupon-apply: LD1 Branch-1 reward_id IS NOT NULL fix + real offer-coupon branch
- retire static deals-catalog.ts (zero remaining importers)
- orders: COALESCE claim-on-redeem burn + is_deal-XOR-couponCode 400 guard
- tests: offer-coupon apply/order/re-apply (AC5), is_deal 400 (AC6), reason codes
  (AC7), bulk two-racer claim concurrency; full api suite 279/279"
```

---

## Forward Preview

### Test Infra Found
- `coupons.integration.test.ts` mounts only `couponsRouter`; `orders.test.ts` mounts only
  `ordersRouter`. Any future test needing BOTH routes in one flow must mount both or split (as done
  here).

### Blast Radius Changes
- `packages/utils/src/deals-catalog.ts` no longer exists — future work must not reference
  `DEAL_CATALOG`/`findCatalogDealByCode`/`catalogDealToDeal`/`CatalogDeal`.
- `resolveCouponDiscount()` now resolves reward-coupons AND offer-coupons; both burn through the
  same generic `rewardCouponId` path in `orders.ts`.

### Commands to Stay Green
```bash
pnpm --filter @jojopotato/api typecheck
pnpm --filter @jojopotato/api test    # requires local Postgres :5432 + db:migrate
```

### Dependency Changes
- None. No new packages, no schema change (Phase 1 owned migration 0011). Removed one internal
  module (`deals-catalog.ts`) + its barrel export.
