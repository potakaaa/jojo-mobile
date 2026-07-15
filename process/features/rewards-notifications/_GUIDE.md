# rewards-notifications

<!-- Part of Jojo Potato -->

## Scope

Loyalty/rewards program and push notifications for the Jojo Potato mobile app. Covers rewards
accrual/unlock/redemption (STAR-001..004), the Deals feature, and push notification delivery (order
status, promotions). No notifications provider is decided yet (see `process/context/all-context.md`).

## Key Source Files

### Backend (live as of STAR-003, 14-07-26)

- `packages/api/src/lib/star-earning.ts` — `creditStarForCompletedOrder(orderId)` + `reverseStarForRefundedOrder(orderId)` + `isOrderEligibleForStar(order)`. Idempotent earn via partial unique index on `star_transactions (order_id, type) WHERE order_id IS NOT NULL` + `onConflictDoNothing`. Unlock logic runs INSIDE the credit transaction on the credited path only: queries `rewards WHERE is_active AND required_stars <= lifetime_stars`, inserts a `coupons` row per newly-crossed tier via ON CONFLICT `(user_id, reward_id) WHERE reward_id IS NOT NULL` DO NOTHING. Returns `{ credited, unlockedRewardIds }`.
- `packages/api/src/lib/star-earning-config.ts` — `STAR_EARNING_MINIMUM_CENTS = 0` + `getStarEarningMinimumCents()` getter (ADM-005 seam).
- `packages/api/src/lib/reward-coupon-code.ts` — `generateRewardCouponCode()` → `JP-RWD-XXXX` (spyable `rewardCouponCodeGenerator` object); bounded savepoint-based collision retry in the caller.
- `packages/api/src/lib/reward-unlock-notify.ts` — `notifyRewardUnlocked(userId, rewardIds)`: post-commit best-effort `notifications` row per unlock (`type='reward_unlocked'`, `target_screen='/(tabs)/rewards'`); failure swallowed; `TODO(PUSH-002/003)` seam.
- `packages/api/src/routes/rewards.ts` — 3 session-gated read-only GET endpoints (`/summary`, `/available`, `/history`), mounted `app.use('/rewards', requireSession, rewardsRouter)`. All scoped to `req.user!.id`. See §Read API below.
- `packages/api/src/db/schema/coupons.ts` — partial unique index `coupons_user_reward_unique` on `(user_id, reward_id) WHERE reward_id IS NOT NULL` (migration 0008, renumbered from 0006 in the 15-07-26 development merge).
- `packages/api/src/db/schema/star_transactions.ts` — partial unique index on `(order_id, type) WHERE order_id IS NOT NULL` (migration 0007, renumbered from 0005 in the 15-07-26 development merge).
- `packages/api/drizzle/0007_nosy_genesis.sql` — star_transactions idempotency index (was 0005).
- `packages/api/drizzle/0008_windy_dexter_bennett.sql` — coupons reward-unlock idempotency index (was 0006).
- `packages/api/src/db/seed/seed.ts` — `REWARD_ROADMAP` 4-tier escalating seed (5/10/15/20 stars, all `free_item`, `is_active:true`); `seedRewardsTable()` converges to the roadmap idempotently.
- `packages/types/src/rewards.ts` — real star model: `StarTransactionType`, `UserStars` (`currentStars`, `lifetimeStars`), `StarTransaction`, `Reward`, `RewardsSummary`.
- `packages/types/src/coupons.ts` — `CouponStatus` union (`available|used|expired`) + `DbCoupon` interface (DB-facing; distinct from the UI `Coupon` shape). Existing UI `Coupon` shape unchanged.
- `packages/api/src/lib/__tests__/star-earning.integration.test.ts` — 99 hermetic vitest tests: 10 STAR-001 earn/reverse/idempotency cases + 10 STAR-003 unlock/battle-pass/edge cases + `rewards.integration.test.ts` 12 read-API tests.

### Mobile (live as of STAR-002, 14-07-26)

- `apps/mobile/src/app/(tabs)/rewards/index.tsx` — real Rewards screen (replaced `<ComingSoon>`): `StarProgressBar` tracker, stars-needed label, reward preview, available rewards list, reverse-chron history, `<RewardsTerms>`. Loading/error/empty states handled.
- `apps/mobile/src/features/rewards/lib/rewards-api.ts` — cookie-fetch functions (`fetchRewardsSummary`, `fetchAvailableRewards`, `fetchRewardsHistory`); mirrors `staff-api.ts` pattern (absolute `env.apiUrl` + `Cookie: authClient.getCookie()`; throws on non-OK; NOT `authClient.$fetch`).
- `apps/mobile/src/features/rewards/hooks/{use-rewards-summary,use-rewards-history,use-available-rewards}.ts` — react-query hooks; rely on global `refetchOnWindowFocus: true` for AC5.
- `packages/ui/src/components/star-progress-bar.tsx` — props `{ currentStars, requiredStars }`; width = `clamp(currentStars/requiredStars, 0, 1)`; caption "N stars to your reward" / "Reward unlocked". Exports `StarProgress` type.
- `packages/ui/src/components/reward-progress-card.tsx` — props `{ currentStars, requiredStars }` (stars-shaped; old `RewardsAccount`/`TIER_LABEL` bronze/silver/gold model dropped). Exports `RewardProgress` type.
- `packages/ui/src/components/rewards-terms.tsx` — `<RewardsTerms mode?>` — real T&C text from PRD §6.10 (non-lorem).

## Read API (`/rewards/*`)

All endpoints require a valid session cookie (`requireSession` at mount). All scope on `req.user!.id`.

| Endpoint | Response shape | Notes |
|---|---|---|
| `GET /rewards/summary` | `RewardsSummary` | `currentStars`, `lifetimeStars`, `requiredStars` (MIN active reward), `isUnlocked`, `reward` (the target reward or null) |
| `GET /rewards/available` | `{ rewards: Reward[] }` | All `is_active=true` rewards, asc by `required_stars` |
| `GET /rewards/history` | `{ transactions: StarTransaction[], nextCursor }` | Caller's `star_transactions` desc by `created_at`; cursor-paginated (default 20, max 50) |

**Known semantic gap (backlog):** `/summary` targets `MIN active reward required_stars` and uses `current_stars` for progress — under battle-pass, should use `lifetime_stars` toward the next UNCLAIMED tier. See `backlog/rewards-progress-bar-battle-pass-semantics_NOTE_14-07-26.md`.

## Battle-Pass Model

- Progress dimension: `lifetime_stars` (monotonic, never decremented on refund)
- Each active reward tier unlocks ONCE per user when `lifetime_stars >= required_stars`
- Unlock is idempotent via `coupons (user_id, reward_id) WHERE reward_id IS NOT NULL` partial unique index + `ON CONFLICT DO NOTHING`
- A refund decrements `current_stars` only; lifetime stays monotonic; unlocked tiers are NOT revoked
- Multi-tier crossing in a single credit is handled generically (all tiers at/below new lifetime are checked)

## STAFF-003 Wiring Seam

The earn + unlock chain is **decoupled and unwired**. STAFF-003 must call these services from the live staff order-status endpoint:

```typescript
// In the staff PATCH /orders/:id/status endpoint (mark-completed path):
// TODO(STAFF-003): await creditStarForCompletedOrder(order.id)

// In the staff PATCH /orders/:id/status endpoint (refund path):
// TODO(STAFF-003): await reverseStarForRefundedOrder(order.id)
```

Both TODO seams are in the `star-earning.ts` module header. See `backlog/staff-003-star-earn-wiring-dependency_NOTE_14-07-26.md`.

## Known Product Decision (C2 gap)

`lifetime_stars` on refund: PRD §6.10 is silent on whether a refund should decrement `lifetime_stars`. Current implementation: **lifetime stays monotonic** (reversal touches `current_stars` only). EDGE tests lock this behavior. If the product owner decides lifetime should also decrement: one-line change in `reverseStarForRefundedOrder` + one test update.

## Test Suite

`packages/api` vitest: 99 tests total. Run:
```bash
docker compose up -d
pnpm --filter @jojopotato/api db:migrate
DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test
```

`packages/ui` jest-expo: covers `star-progress-bar`, `reward-progress-card`, `rewards-terms`. Run:
```bash
pnpm --filter @jojopotato/ui test
```

## Delivery History

| Plan | Status | What it delivered |
|---|---|---|
| `completed/star-001-star-earning_14-07-26/` | VERIFIED (STAR-001) | Idempotent earn + refund-reversal services, migration 0007 (renumbered from 0005), real rewards types, 10 integration tests |
| `completed/star-002-rewards-screen_14-07-26/` | CODE DONE (STAR-002) | Rewards read API (`/rewards/*`), mobile data layer, real Rewards screen, T&C component, regression fix (points→stars), seed one 5-star reward; 89 API tests, 51 UI tests |
| `completed/star-003-reward-unlock_14-07-26/` | VERIFIED (STAR-003) | Battle-pass unlock + coupon gen inside STAR-001 credit tx, migration 0008 (renumbered from 0006), coupon-code gen, notification helper, 4-tier roadmap seed, 99 API tests (10 new); `DbCoupon`/`CouponStatus` types |

## Related Context

- `process/context/all-context.md` — overall repo structure and tech stack
- `process/features/staff-dashboard/_GUIDE.md` — STAFF-003 will own the endpoint wiring that calls these services

## Deals Feature (also lives in this folder)

**Status as of 14-07-26: Deals feature real-API COMPLETE; push notifications UI-only (backend not
wired).** See `process/context/all-context.md` §"Deals feature (backend wiring COMPLETE, 14-07-26)"
for the full delivery narrative (DEAL-001/002/003, #22/#23/#24). The original screens-only, mock-data
Deals plan (`completed/deals-screens_13-07-26/`, PR #68) shipped first, then was entirely superseded
by `completed/deals-api-integration_13-07-26/`, a 3-phase program that replaced the mock deal source
with real backend wiring end-to-end. Push notifications UI (`active/push-notifications-ui_14-07-26/`)
is in progress. STAR-004 (in-app reward redemption) reuses this Deals apply path — deal and reward
codes are unified onto the server-backed `POST /coupons/apply` endpoint.

### Deals Key Source Files

- `apps/mobile/src/app/(tabs)/deals/` -- Deals list + details screens (real API, not a tab)
- `apps/mobile/src/features/deals/` -- `useDeals()`/`useDeal()` hooks, deal-apply logic (`apply-deal.ts` → `POST /coupons/apply`)
- `packages/api/src/routes/deals.ts` -- public `GET /deals` / `GET /deals/:id` routes
- `packages/api/src/routes/lib/serializers.ts` -- `serializeDeal` boundary serializer
- `packages/types/src/deals.ts` -- `Deal` type (cents-native, see VALUE-UNIT NOTE)

### Deals Related Context

- `process/features/rewards-notifications/completed/deals-api-integration_13-07-26/` -- the 3-phase
  program that delivered the real Deals backend wiring; current canonical Deals implementation
- `process/features/rewards-notifications/completed/deals-screens_13-07-26/` -- the earlier
  screens-only mock-data Deals plan (PR #68), archived as superseded by the program above

## Open Work

| Task ID | Scope | Blocked by |
|---|---|---|
| STAFF-003 wiring | Staff order-complete/refund endpoints calling `creditStarForCompletedOrder`/`reverseStarForRefundedOrder` (STAFF-003 delivered the endpoint but the star-earn seam may still be a no-op stub — reconcile) | Nothing — both service + endpoint exist |
| Rewards bar battle-pass semantics | `/summary` should return `lifetime_stars` + next unclaimed tier (see backlog NOTE) | Nothing — STAR-003 delivered |
| ADM-005 | Admin config-table minimum (replace `getStarEarningMinimumCents()` constant with a DB read) | Nothing — seam exists |
| Coupon redemption at checkout (STAR-004) | DELIVERED on `dev/star` — `POST /coupons/apply` preview + order-placement coupon consume + cart/checkout wiring | Done (merged 15-07-26) |
| Push delivery (PUSH-002/003) | Dispatch push notification on `reward_unlocked` (TODO seam in `reward-unlock-notify.ts`) | Notifications provider decision |
| `reward_unlocked` NotificationType | Add to `packages/types/src/notifications.ts` (see backlog NOTE) | Build when notifications UI is built |

## Folder Contents

```
process/features/rewards-notifications/
  active/       -- in-progress plans (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans (star-001/002/003 all here)
  backlog/      -- deferred/future plans and NOTEs
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
