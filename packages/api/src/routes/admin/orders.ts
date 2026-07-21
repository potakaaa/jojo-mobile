import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import { branches, orderItems, orderStatusEnum, orders, users } from '../../db/schema/index';
import {
  serializeAdminOrderDetail,
  serializeAdminOrderSummary,
  type AdminOrderSummary,
} from '../lib/serializers';
import { handleAdminError } from './lib/errors';

/**
 * Admin Orders view (ADM-006, #44) — READ-ONLY cross-branch order oversight.
 * `GET` handlers ONLY: no status transition, no mutation of any kind (D1). Status
 * changes remain a staff action via the STAFF-003 state machine. Guard/CORS are
 * inherited from the `/api/admin` mount; no handler re-checks role. This is the
 * 10th consumer of the append-only admin aggregator pattern.
 *
 * Composes the existing staff serializers (D4) and exposes exactly the PII field
 * set locked in D2 (customer name + phone only — never email/auth internals). Admin
 * sees ALL branches; `branchId` is a filter, not a scoping restriction (PRD §19
 * grants admin unrestricted "view orders").
 */
const adminOrdersRouter: ExpressRouter = Router();

const uuidSchema = z.string().uuid();
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;

/** A date-only or ISO datetime string that `new Date()` can parse. */
const isoDateSchema = z
  .string()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), { message: 'Invalid date' });

/**
 * List-query filters (D6 date semantics applied in the handler). `limit` and
 * `cursor` are parsed leniently OUTSIDE this schema — mirroring the customer
 * order-history pattern verbatim (orders.ts:490-495, D3): an unparseable cursor is
 * treated as "no cursor", an out-of-range limit is clamped rather than rejected.
 * Malformed branch/status/date values, by contrast, 400 (safeParse failure).
 */
const listQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  status: z.enum(orderStatusEnum.enumValues).optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
});

/** UTC start-of-day for a parsed date (D6: dateFrom is an inclusive start-of-day). */
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `GET /api/admin/orders` → `{ orders: AdminOrderSummary[], nextCursor }`.
 *
 * Cursor-paginated (newest-first on `placed_at`), filterable by branch / status /
 * date range — all AND-composed. Items + customer + branch are batch-loaded to
 * avoid N+1 queries. Only `id`/`name`/`phoneNumber` are read from `users` (PII
 * boundary D2 — email + auth columns are never selected).
 */
adminOrdersRouter.get('/', async (req, res) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query', details: parsed.error.issues });
      return;
    }
    const q = parsed.data;

    // limit — coerced + clamped (verbatim customer-history pattern, D3).
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_LIST_LIMIT)
      : DEFAULT_LIST_LIMIT;

    // cursor — ISO placed_at; an unparseable value is ignored (no cursor).
    const cursor = typeof req.query.cursor === 'string' ? new Date(req.query.cursor) : null;
    const hasCursor = cursor !== null && !Number.isNaN(cursor.getTime());

    const conditions = [];
    if (q.branchId) conditions.push(eq(orders.branch_id, q.branchId));
    if (q.status) conditions.push(eq(orders.status, q.status));
    if (q.dateFrom) conditions.push(gte(orders.placed_at, startOfUtcDay(new Date(q.dateFrom))));
    // D6: dateTo is an inclusive end-of-day → strictly before the next UTC midnight.
    if (q.dateTo) {
      conditions.push(
        lt(orders.placed_at, new Date(startOfUtcDay(new Date(q.dateTo)).getTime() + ONE_DAY_MS)),
      );
    }
    if (hasCursor) conditions.push(lt(orders.placed_at, cursor));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const orderRows = await db
      .select()
      .from(orders)
      .where(whereClause)
      .orderBy(desc(orders.placed_at))
      .limit(limit + 1);

    const hasMore = orderRows.length > limit;
    const page = hasMore ? orderRows.slice(0, limit) : orderRows;

    const orderIds = page.map((o) => o.id);
    const itemRows = orderIds.length
      ? await db.select().from(orderItems).where(inArray(orderItems.order_id, orderIds))
      : [];
    const itemsByOrder = new Map<string, typeof itemRows>();
    for (const item of itemRows) {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrder.set(item.order_id, list);
    }

    const userIds = [...new Set(page.map((o) => o.user_id))];
    const branchIds = [...new Set(page.map((o) => o.branch_id))];
    // PII boundary (D2): SELECT only id/name/phoneNumber from users — never email
    // or any better-auth credential/session column.
    const userRows = userIds.length
      ? await db
          .select({ id: users.id, name: users.name, phoneNumber: users.phoneNumber })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
    const branchRows = branchIds.length
      ? await db
          .select({ id: branches.id, name: branches.name })
          .from(branches)
          .where(inArray(branches.id, branchIds))
      : [];
    const userById = new Map(userRows.map((u) => [u.id, u]));
    const branchById = new Map(branchRows.map((b) => [b.id, b]));

    const serialized: AdminOrderSummary[] = page.map((o) =>
      serializeAdminOrderSummary(
        o,
        itemsByOrder.get(o.id) ?? [],
        userById.get(o.user_id) ?? { name: 'Unknown', phoneNumber: null },
        branchById.get(o.branch_id) ?? { name: 'Unknown' },
      ),
    );
    const nextCursor = hasMore ? page[page.length - 1]!.placed_at.toISOString() : null;

    res.json({ orders: serialized, nextCursor });
  } catch (err) {
    handleAdminError(err, res, 'listing orders');
  }
});

/**
 * `GET /api/admin/orders/:orderId` → `{ order: AdminOrderDetail }`. 404 on a
 * malformed id or a missing row. Same staff-detail snapshot shape plus the admin
 * field set (branch, customer name/phone, discount context).
 */
adminOrdersRouter.get('/:orderId', async (req, res) => {
  try {
    const orderId = String(req.params.orderId);
    if (!uuidSchema.safeParse(orderId).success) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const items = await db.select().from(orderItems).where(eq(orderItems.order_id, order.id));
    const [customer] = await db
      .select({ name: users.name, phoneNumber: users.phoneNumber })
      .from(users)
      .where(eq(users.id, order.user_id));
    const [branch] = await db
      .select({ name: branches.name })
      .from(branches)
      .where(eq(branches.id, order.branch_id));

    const serialized = serializeAdminOrderDetail(
      order,
      items,
      customer ?? { name: 'Unknown', phoneNumber: null },
      branch ?? { name: 'Unknown' },
    );

    res.json({ order: serialized });
  } catch (err) {
    handleAdminError(err, res, 'loading order');
  }
});

export default adminOrdersRouter;
