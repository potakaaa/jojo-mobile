import type { StaffMe } from '@jojopotato/types';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../db/client';
import { branches, orderItems, orders } from '../db/schema/index';
import { resolveBranchScope } from '../lib/require-staff';
import { serializeStaffOrderDetail, serializeStaffOrderSummary } from './lib/serializers';

/**
 * Non-terminal order statuses shown on the staff Active Orders dashboard.
 * `completed` and `cancelled` are terminal and never surface in the list (AC-3).
 */
const ACTIVE_ORDER_STATUSES = ['pending', 'accepted', 'preparing', 'flavoring', 'ready'] as const;

/**
 * Staff routes. The `requireStaff` guard is applied ONCE at mount time in
 * `index.ts` (`app.use('/api/staff', requireStaff(auth), staffRouter)`), so
 * every handler here can assume `req.staffSession` is populated. STAFF-002/003/004
 * only ADD routes to this router — they never re-apply the guard.
 */
const staffRouter: ExpressRouter = Router();

/**
 * Canary: `GET /api/staff/me` → `{ role, assignedBranch }`. Read-only. Returns
 * the caller's OWN branch only — no branch id is accepted from the client, so
 * cross-branch reads are structurally impossible on this endpoint.
 */
staffRouter.get('/me', async (req, res) => {
  const session = req.staffSession!;
  const assignedBranchId = await resolveBranchScope(db, session.userId);

  let assignedBranch: StaffMe['assignedBranch'] = null;
  if (assignedBranchId) {
    const [row] = await db
      .select({ id: branches.id, name: branches.name, slug: branches.slug })
      .from(branches)
      .where(eq(branches.id, assignedBranchId));
    assignedBranch = row ?? null;
  }

  const body: StaffMe = { role: session.role, assignedBranch };
  res.json(body);
});

/**
 * `GET /api/staff/orders` → `{ orders: StaffOrderSummary[] }` (STAFF-002).
 *
 * Branch-scoped list of NON-TERMINAL orders, newest-first. The branch is always
 * resolved fresh via `resolveBranchScope` (never `req.staffSession.assignedBranchId`,
 * which may be stale) and never accepted from the client — cross-branch reads are
 * structurally impossible. Unassigned staff → 403.
 */
staffRouter.get('/orders', async (req, res) => {
  const branchId = await resolveBranchScope(db, req.staffSession!.userId);
  if (!branchId) {
    res.status(403).json({ error: 'No branch assigned' });
    return;
  }

  const orderRows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.branch_id, branchId), inArray(orders.status, [...ACTIVE_ORDER_STATUSES])))
    .orderBy(desc(orders.placed_at));

  const summaries = await Promise.all(
    orderRows.map(async (order) => {
      const items = await db.select().from(orderItems).where(eq(orderItems.order_id, order.id));
      return serializeStaffOrderSummary(order, items);
    }),
  );

  res.json({ orders: summaries });
});

/**
 * `GET /api/staff/orders/:orderId` → `StaffOrderDetail` (flat, no envelope).
 *
 * Read-only order detail (STAFF-002). Branch isolation is enforced: an order
 * belonging to a different branch returns 403 (AC-5), a missing order 404,
 * unassigned staff 403. Includes the full item list with `selectedOptions`.
 */
staffRouter.get('/orders/:orderId', async (req, res) => {
  const branchId = await resolveBranchScope(db, req.staffSession!.userId);
  if (!branchId) {
    res.status(403).json({ error: 'No branch assigned' });
    return;
  }

  const orderId = String(req.params.orderId);
  if (!z.string().uuid().safeParse(orderId).success) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  if (order.branch_id !== branchId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.order_id, order.id));
  res.json(serializeStaffOrderDetail(order, items));
});

export default staffRouter;
