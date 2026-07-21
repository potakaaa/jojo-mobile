import { and, eq, gt } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import { orders, users } from '../../db/schema/index';
import { dispatchMarketingNotificationIfAllowed } from '../lib/notification-dispatch';
import { handleAdminError } from './lib/errors';

/**
 * Admin marketing-notification routes (PUSH-005 / #82, AC7).
 *
 * `requireAdmin` + CORS are applied ONCE at the `/api/admin` mount in `index.ts`
 * and inherited here, so NO handler re-checks role. Append-only aggregator
 * convention — never restructure the parent.
 *
 * `POST /branch-promo` is an admin-authored, one-shot command (D4/D5) — NOT a
 * scheduler-polled or DB-state trigger. It dispatches exactly once per submission
 * to the branch's recent-order, opted-in audience; there is no window/poll, so it
 * is never re-sent on a scheduler tick.
 */
const adminNotificationsRouter: ExpressRouter = Router();

/** Recent-order lookback for the branch-promo audience (D5): 90 days. */
const RECENT_ORDER_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

const branchPromoSchema = z.object({
  branchId: z.uuid(),
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
});

// POST /branch-promo — one-shot promo to a branch's recent, opted-in customers.
// Audience (D5): DISTINCT users who placed an order at :branchId within the last
// 90 days, INTERSECT users with marketingOptIn=true. Each is guard-dispatched
// (opt-in re-checked + quiet-hours + cap). Responds { dispatched } — the count
// actually messaged (guard returned 'sent').
adminNotificationsRouter.post('/branch-promo', async (req, res) => {
  try {
    const parsed = branchPromoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid branch-promo payload', details: parsed.error.issues });
      return;
    }
    const { branchId, title, body } = parsed.data;

    const now = new Date();
    const cutoff = new Date(now.getTime() - RECENT_ORDER_LOOKBACK_MS);

    // DISTINCT recent-order customers at this branch who are opted in.
    const audience = await db
      .selectDistinct({ userId: orders.user_id })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.user_id))
      .where(
        and(
          eq(orders.branch_id, branchId),
          gt(orders.placed_at, cutoff),
          eq(users.marketingOptIn, true),
        ),
      );

    let dispatched = 0;
    for (const { userId } of audience) {
      const result = await dispatchMarketingNotificationIfAllowed(
        userId,
        'branch_promo',
        { title, body, targetScreen: 'deal_details', targetParams: { branchId } },
        { now: () => now },
      );
      if (result === 'sent') dispatched += 1;
    }

    res.status(200).json({ dispatched });
  } catch (err) {
    handleAdminError(err, res, 'dispatching branch promo');
  }
});

export default adminNotificationsRouter;
