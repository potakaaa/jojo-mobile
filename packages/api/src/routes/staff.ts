import type { OrderStatus, StaffMe } from '@jojopotato/types';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../db/client';
import { branches, orderItems, orderStatusEnum, orders } from '../db/schema/index';
import { resolveBranchScope } from '../lib/require-staff';
import { canTransition } from './lib/order-state-machine';
import { serializeStaffOrderDetail, serializeStaffOrderSummary } from './lib/serializers';

/**
 * Non-terminal order statuses shown on the staff Active Orders dashboard.
 * `completed`, `cancelled`, and `rejected` are terminal and never surface in the list.
 */
const ACTIVE_ORDER_STATUSES = ['pending', 'accepted', 'preparing', 'flavoring', 'ready'] as const;

/**
 * Terminal statuses shown on the Completed Orders screen (STAFF-003).
 */
const TERMINAL_ORDER_STATUSES = ['completed', 'cancelled', 'rejected'] as const;

/**
 * All valid OrderStatus values (mirrors the pgEnum for zod validation).
 */
const ORDER_STATUS_VALUES = orderStatusEnum.enumValues;

// ─── Side-effect stubs (STAFF-003) ───────────────────────────────────────────

/**
 * TODO(STAR-001): credit stars when an order is completed.
 * Replace with real star-crediting logic once the rewards system is built.
 */
function creditStarsForOrder(_order: typeof orders.$inferSelect): void {
  void _order; // TODO(STAR-001): replace with real star-crediting logic
}

/**
 * TODO(PUSH-002): dispatch a push notification for the given order event.
 * Replace with real push dispatch once the notifications system is built.
 */
function notifyCustomer(
  _order: typeof orders.$inferSelect,
  _event: 'completed' | 'rejected' | 'cancelled',
): void {
  void _order;
  void _event; // TODO(PUSH-002): replace with real push dispatch
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const patchOrderBodySchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES),
  etaMinutes: z.number().optional(),
});

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
 * `GET /api/staff/orders/completed` → `{ orders: StaffOrderSummary[] }` (STAFF-003).
 *
 * Branch-scoped list of TERMINAL orders (completed/cancelled/rejected), newest-first.
 *
 * IMPORTANT: This route MUST be registered BEFORE `/orders/:orderId` — Express matches
 * routes top-down and would otherwise treat "completed" as an orderId param value.
 */
staffRouter.get('/orders/completed', async (req, res) => {
  const branchId = await resolveBranchScope(db, req.staffSession!.userId);
  if (!branchId) {
    res.status(403).json({ error: 'No branch assigned' });
    return;
  }

  const orderRows = await db
    .select()
    .from(orders)
    .where(
      and(eq(orders.branch_id, branchId), inArray(orders.status, [...TERMINAL_ORDER_STATUSES])),
    )
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

/**
 * `PATCH /api/staff/orders/:orderId` → `{ order: StaffOrderDetail }` (STAFF-003).
 *
 * Transitions an order to the requested status, enforced by the state machine.
 * Branch isolation is enforced: staff can only mutate orders belonging to their
 * assigned branch. This is the critical security invariant (AC-3).
 *
 * Status codes:
 *   200 — transition applied; returns updated StaffOrderDetail.
 *   400 — invalid UUID (treated as not found).
 *   403 — unassigned staff or cross-branch order.
 *   404 — order not found.
 *   409 — illegal transition or terminal source status.
 *   422 — missing or invalid `status` in request body.
 */
staffRouter.patch('/orders/:orderId', async (req, res) => {
  // 1. Resolve branch scope — unassigned staff → 403.
  const branchId = await resolveBranchScope(db, req.staffSession!.userId);
  if (!branchId) {
    res.status(403).json({ error: 'No branch assigned' });
    return;
  }

  // 2. Validate orderId is a UUID.
  const orderId = String(req.params.orderId);
  if (!z.string().uuid().safeParse(orderId).success) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  // 3. Parse + validate request body.
  const parseResult = patchOrderBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({ error: 'Invalid status' });
    return;
  }
  const targetStatus = parseResult.data.status as OrderStatus;
  // etaMinutes is parsed but intentionally ignored per SPEC Constraint #4.

  // 4. Load order — not found → 404; cross-branch → 403.
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  if (order.branch_id !== branchId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // 5. State machine guard — illegal transition or terminal source → 409.
  if (!canTransition(order.status as OrderStatus, targetStatus)) {
    res.status(409).json({ error: 'Invalid status transition' });
    return;
  }

  // 6. Build the UPDATE patch with per-transition side effects.
  const now = new Date();
  const patch: Partial<typeof orders.$inferInsert> = {
    status: targetStatus,
    updated_at: now,
  };

  if (targetStatus === 'accepted') {
    // ETA is anchored to accept time (not placed_at) per plan decision + AC-6.
    const [branch] = await db
      .select({ estimated_prep_minutes: branches.estimated_prep_minutes })
      .from(branches)
      .where(eq(branches.id, branchId));
    const prepMs = (branch?.estimated_prep_minutes ?? 15) * 60 * 1000;
    patch.accepted_at = now;
    patch.estimated_ready_at = new Date(now.getTime() + prepMs);
  } else if (targetStatus === 'ready') {
    patch.ready_at = now;
  } else if (targetStatus === 'completed') {
    patch.completed_at = now;
  } else if (targetStatus === 'cancelled') {
    patch.cancelled_at = now;
  }
  // `rejected`: no dedicated timestamp column (status alone marks terminal).
  // `preparing` / `flavoring`: status change only, no timestamp.

  // 7. Apply the update — compare-and-swap: also guard on current status so a
  //    concurrent PATCH that already advanced the order results in 0 rows matched → 409.
  const [updatedRow] = await db
    .update(orders)
    .set(patch)
    .where(and(eq(orders.id, orderId), eq(orders.status, order.status)))
    .returning({ id: orders.id });

  if (!updatedRow) {
    res.status(409).json({ error: 'Concurrent modification detected; please retry' });
    return;
  }

  // 8. Call side-effect stubs at the correct transition sites.
  const updatedOrder = { ...order, ...patch } as typeof order;
  if (targetStatus === 'completed') {
    creditStarsForOrder(updatedOrder);
    notifyCustomer(updatedOrder, 'completed');
  } else if (targetStatus === 'rejected') {
    notifyCustomer(updatedOrder, 'rejected');
  } else if (targetStatus === 'cancelled') {
    notifyCustomer(updatedOrder, 'cancelled');
  }

  // 9. Re-select the updated order for the response.
  const [refreshedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));
  const items = await db.select().from(orderItems).where(eq(orderItems.order_id, orderId));
  res.json({ order: serializeStaffOrderDetail(refreshedOrder!, items) });
});

export default staffRouter;
