import type { AdminAnalytics, AdminTopSellingProduct } from '@jojopotato/types';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  notInArray,
  sum,
} from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import {
  branches,
  coupons,
  orderItems,
  orderStatusEnum,
  orders,
  products,
  starTransactions,
} from '../../db/schema/index';
import { numericToCents } from '../lib/serializers';
import { AdminApiError, handleAdminError } from './lib/errors';
import { manilaDateRangeToUtc } from './lib/analytics-range';

/**
 * Admin analytics view (ADM-007, #45) — READ-ONLY aggregation over existing data.
 * A single `GET /api/admin/analytics?from=&to=[&branchId=]` returns all eight #45
 * metrics in one `{ resource }` payload. GET only: no writes, no schema change, no
 * migration. Guard/CORS are inherited from the `/api/admin` mount; no handler
 * re-checks role. This is the 11th consumer of the append-only aggregator pattern.
 *
 * TIMEZONE (D3): `from`/`to` are interpreted as Asia/Manila calendar dates (fixed
 * +08:00, no DST) and converted to a half-open UTC instant interval. This
 * INTENTIONALLY differs from `routes/admin/orders.ts` (Phase 6, ADM-006), which
 * uses UTC start-of-day for its `dateFrom`/`dateTo` filters — admins reading
 * business-day analytics think in local days, whereas the orders list's UTC-day
 * boundary was never revisited. Both are deliberate; see the phase-7 plan D3 and
 * the phase-6 plan D6. (Execute-Agent Instruction E5.)
 *
 * MONEY: all aggregates are integer cents. `orders`/`order_items` money is
 * `numeric(10,2)` pesos; each row is converted once via `numericToCents`
 * (round-half-up on ×100), then summed as integers — never float peso math, never
 * a divide-by-zero (AOV/rate are null when their denominator is 0).
 */
const adminAnalyticsRouter: ExpressRouter = Router();

/** Order statuses excluded from every demand metric (D2). Mutable (not `as const`)
 * so drizzle's `notInArray` accepts it. */
const EXCLUDED_STATUSES: (typeof orderStatusEnum.enumValues)[number][] = ['cancelled', 'rejected'];

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const querySchema = z.object({
  from: dateSchema,
  to: dateSchema,
  branchId: z.string().uuid().optional(),
});

/**
 * `GET /api/admin/analytics` → `{ resource: AdminAnalytics }`.
 *
 * `from`/`to` required (`YYYY-MM-DD`, Manila days); `from <= to`; optional
 * `branchId` scopes the branch-dependent metrics (star/reward metrics are
 * program-wide — those tables carry no branch — surfaced via `branchScoped`).
 */
adminAnalyticsRouter.get('/', async (req, res) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AdminApiError(400, 'Invalid query parameters');
    }
    const { from, to, branchId } = parsed.data;

    const range = manilaDateRangeToUtc(from, to);
    if (!range) {
      throw new AdminApiError(400, 'Invalid date');
    }
    if (from > to) {
      throw new AdminApiError(400, 'from must be on or before to');
    }
    const { lower, upper } = range;

    // ── Query 1 — the in-range, non-cancelled/rejected base order set (D2). ──
    const baseWhere = and(
      gte(orders.placed_at, lower),
      lt(orders.placed_at, upper),
      notInArray(orders.status, EXCLUDED_STATUSES),
      ...(branchId ? [eq(orders.branch_id, branchId)] : []),
    );
    const baseRows = await db
      .select({
        id: orders.id,
        branchId: orders.branch_id,
        userId: orders.user_id,
        status: orders.status,
        total: orders.total,
        couponId: orders.coupon_id,
        dealId: orders.deal_id,
      })
      .from(orders)
      .where(baseWhere);

    const baseIds = baseRows.map((r) => r.id);
    const orderCount = baseRows.length;

    // ── Query 2 — order ids carrying an is_deal bundle line (D1 signal c). ──
    const bundleRows = baseIds.length
      ? await db
          .selectDistinct({ orderId: orderItems.order_id })
          .from(orderItems)
          .innerJoin(products, eq(products.id, orderItems.product_id))
          .where(and(inArray(orderItems.order_id, baseIds), eq(products.is_deal, true)))
      : [];
    const bundleOrderIds = new Set(bundleRows.map((r) => r.orderId));

    // ── Query 3 — branch names (all branches, or just the scoped one). ──
    const branchRows = await db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(branchId ? eq(branches.id, branchId) : undefined)
      .orderBy(asc(branches.name));

    // ── Query 4 — stars earned in range (program-wide, D5). ──
    const [starsRow] = await db
      .select({ total: sum(starTransactions.stars) })
      .from(starTransactions)
      .where(
        and(
          eq(starTransactions.type, 'earned'),
          gte(starTransactions.created_at, lower),
          lt(starTransactions.created_at, upper),
        ),
      );
    const starsEarned = Number(starsRow?.total ?? 0);

    // ── Query 5 — reward coupons minted (unlocked) / burned (redeemed), D4. ──
    const [unlockedRow] = await db
      .select({ c: count() })
      .from(coupons)
      .where(
        and(
          isNotNull(coupons.reward_id),
          gte(coupons.created_at, lower),
          lt(coupons.created_at, upper),
        ),
      );
    const [redeemedRow] = await db
      .select({ c: count() })
      .from(coupons)
      .where(
        and(isNotNull(coupons.reward_id), gte(coupons.used_at, lower), lt(coupons.used_at, upper)),
      );
    const rewardsUnlocked = Number(unlockedRow?.c ?? 0);
    const rewardsRedeemed = Number(redeemedRow?.c ?? 0);

    // ── Query 6 — top-selling products across the base order set (D8a). ──
    const topRows = baseIds.length
      ? await db
          .select({
            productId: products.id,
            productName: products.name,
            quantity: sum(orderItems.quantity),
            revenue: sum(orderItems.total_price),
          })
          .from(orderItems)
          .innerJoin(products, eq(products.id, orderItems.product_id))
          .where(inArray(orderItems.order_id, baseIds))
          .groupBy(products.id, products.name)
          // Rank by quantity DESC; `products.name` ASC is a stable tiebreak so
          // quantity ties order deterministically (the plan specifies no other
          // tie rule — name-asc keeps the response repeatable).
          .orderBy(desc(sum(orderItems.quantity)), asc(products.name))
          .limit(10)
      : [];
    const topSellingProducts: AdminTopSellingProduct[] = topRows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      quantitySold: Number(r.quantity ?? 0),
      revenueCents: numericToCents(r.revenue ?? '0'),
    }));

    // ── Query 7 — new-vs-returning (D8b). A user is "new" iff their earliest
    // COUNTED order across all time (D2 filter applied — Execute-Agent E1) falls
    // inside the range; otherwise "returning". The status filter matches the base
    // set, so a user whose only prior order was cancelled/rejected is NEW. ──
    const baseUserIds = [...new Set(baseRows.map((r) => r.userId))];
    const historyRows = baseUserIds.length
      ? await db
          .select({ userId: orders.user_id, placedAt: orders.placed_at })
          .from(orders)
          .where(
            and(inArray(orders.user_id, baseUserIds), notInArray(orders.status, EXCLUDED_STATUSES)),
          )
      : [];
    const earliestByUser = new Map<string, number>();
    for (const row of historyRows) {
      const t = row.placedAt.getTime();
      const current = earliestByUser.get(row.userId);
      if (current === undefined || t < current) earliestByUser.set(row.userId, t);
    }
    let newCount = 0;
    let returningCount = 0;
    const lowerMs = lower.getTime();
    const upperMs = upper.getTime();
    for (const userId of baseUserIds) {
      const earliest = earliestByUser.get(userId);
      if (earliest !== undefined && earliest >= lowerMs && earliest < upperMs) newCount += 1;
      else returningCount += 1;
    }

    // ── In-TS aggregation of the base set (count / AOV / deals split / repeat). ──
    let sumTotalCents = 0;
    let withDealsCount = 0;
    let withDealsSum = 0;
    let withoutDealsCount = 0;
    let withoutDealsSum = 0;
    const countByBranch = new Map<string, number>();
    // user_id → completed-order count (for the repeat-rate numerator).
    const completedByUser = new Map<string, number>();

    for (const row of baseRows) {
      const cents = numericToCents(row.total);
      sumTotalCents += cents;

      // D1 boolean union — an order matching more than one signal counts ONCE
      // (Execute-Agent Instruction E2).
      const hasDeal = row.couponId !== null || row.dealId !== null || bundleOrderIds.has(row.id);
      if (hasDeal) {
        withDealsCount += 1;
        withDealsSum += cents;
      } else {
        withoutDealsCount += 1;
        withoutDealsSum += cents;
      }

      countByBranch.set(row.branchId, (countByBranch.get(row.branchId) ?? 0) + 1);

      if (row.status === 'completed') {
        completedByUser.set(row.userId, (completedByUser.get(row.userId) ?? 0) + 1);
      }
    }

    const averageOrderValueCents = orderCount === 0 ? null : Math.round(sumTotalCents / orderCount);

    const ordersPerBranch = branchRows.map((b) => ({
      branchId: b.id,
      branchName: b.name,
      orderCount: countByBranch.get(b.id) ?? 0,
    }));

    // Repeat purchase rate (D2 denominator, completed-only numerator per #45 AC4).
    const denominator = baseUserIds.length;
    let numerator = 0;
    for (const c of completedByUser.values()) {
      if (c >= 2) numerator += 1;
    }
    const rate = denominator === 0 ? null : numerator / denominator;

    const resource: AdminAnalytics = {
      range: { from, to, timezone: 'Asia/Manila' },
      ordersPerBranch,
      averageOrderValueCents,
      orderCount,
      dealsSplit: {
        withDeals: { count: withDealsCount, sumTotalCents: withDealsSum },
        withoutDeals: { count: withoutDealsCount, sumTotalCents: withoutDealsSum },
      },
      repeatPurchaseRate: { numerator, denominator, rate },
      starsEarned,
      rewardsUnlocked,
      rewardsRedeemed,
      topSellingProducts,
      newVsReturning: { newCount, returningCount },
      branchScoped: branchId !== undefined,
    };

    res.json({ resource });
  } catch (err) {
    handleAdminError(err, res, 'computing analytics');
  }
});

export default adminAnalyticsRouter;
