import { and, desc, eq, ilike, inArray, lt, or } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import { branches, orderItems, orders, userStars, users } from '../../db/schema/index';
import {
  serializeAdminCustomerDetail,
  serializeAdminCustomerSummary,
  serializeAdminOrderSummary,
  type AdminOrderSummary,
} from '../lib/serializers';
import { handleAdminError } from './lib/errors';

/**
 * Admin Customer Management (ADM-010, #125) — READ-ONLY customer directory.
 * `GET` handlers ONLY: no create/update/delete of any kind (SPEC "Out Of Scope").
 * Guard/CORS are inherited from the `/api/admin` mount; no handler re-checks role.
 * This is the 13th consumer of the append-only admin aggregator pattern.
 *
 * Scoped to `role = 'customer'` ONLY — staff/admin/super_admin accounts are the
 * separate ADM-009 Staff surface and are never listed here nor reachable via the
 * detail route (a non-customer id 404s, indistinguishable from a nonexistent id,
 * to avoid id-enumeration + role leakage). Exposes the full PII field set locked
 * in SPEC D1 (name/email/phone/birthday/address/verification flags/favorite
 * branch/onboarded-at) — this is a dedicated customer-lookup module, unlike
 * ADM-006's narrower orders surface. Auth-internal columns never appear.
 */
const adminCustomersRouter: ExpressRouter = Router();

const uuidSchema = z.string().uuid();
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;

/**
 * `GET /api/admin/customers` → `{ customers: AdminCustomerSummary[], nextCursor }`.
 *
 * Cursor-paginated (newest-signup-first on `createdAt`), optional `q=` free-text
 * search across name/email/phone (ILIKE, OR-combined, AND-composed with the
 * role scope so a search can never surface a non-customer row). `limit`/`cursor`
 * are parsed leniently OUTSIDE Zod (verbatim ADM-006 pattern — an unparseable
 * cursor is treated as "no cursor", an out-of-range limit is clamped, not 400).
 */
adminCustomersRouter.get('/', async (req, res) => {
  try {
    // limit — coerced + clamped (verbatim ADM-006 pattern).
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_LIST_LIMIT)
      : DEFAULT_LIST_LIMIT;

    // cursor — ISO createdAt; an unparseable value is ignored (no cursor).
    const cursor = typeof req.query.cursor === 'string' ? new Date(req.query.cursor) : null;
    const hasCursor = cursor !== null && !Number.isNaN(cursor.getTime());

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const conditions = [eq(users.role, 'customer')];
    if (q.length > 0) {
      // `phoneNumber` is nullable — ILIKE against NULL evaluates to NULL (not a
      // match), which is the correct, desired behavior, not a bug to guard against.
      conditions.push(
        or(
          ilike(users.name, `%${q}%`),
          ilike(users.email, `%${q}%`),
          ilike(users.phoneNumber, `%${q}%`),
        )!,
      );
    }
    if (hasCursor) conditions.push(lt(users.createdAt, cursor));

    const rows = await db
      .select()
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1]!.createdAt.toISOString() : null;

    res.json({ customers: page.map(serializeAdminCustomerSummary), nextCursor });
  } catch (err) {
    handleAdminError(err, res, 'listing customers');
  }
});

/**
 * `GET /api/admin/customers/:id` → `{ customer: AdminCustomerDetail }`. 404 on a
 * malformed id, a missing row, OR a row whose `role !== 'customer'` — all three
 * return the SAME generic body so a staff id and a nonexistent id are
 * indistinguishable (id-enumeration + role-leak prevention). Composes the full
 * D1 profile + star balance + the customer's last 10 orders (via the ADM-006
 * `serializeAdminOrderSummary`, reused verbatim).
 */
adminCustomersRouter.get('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!uuidSchema.safeParse(id).success) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user || user.role !== 'customer') {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    // Star balance — may be absent (a user who never earned/spent a star has no row).
    const [starsRow] = await db.select().from(userStars).where(eq(userStars.user_id, id));

    // Favorite branch name (if set).
    let favoriteBranchName: string | null = null;
    if (user.favoriteBranchId) {
      const [branch] = await db
        .select({ name: branches.name })
        .from(branches)
        .where(eq(branches.id, user.favoriteBranchId));
      favoriteBranchName = branch?.name ?? null;
    }

    // Last 10 orders for this customer, newest-first.
    const orderRows = await db
      .select()
      .from(orders)
      .where(eq(orders.user_id, id))
      .orderBy(desc(orders.placed_at))
      .limit(10);

    const orderIds = orderRows.map((o) => o.id);
    const itemRows = orderIds.length
      ? await db.select().from(orderItems).where(inArray(orderItems.order_id, orderIds))
      : [];
    const itemsByOrder = new Map<string, typeof itemRows>();
    for (const item of itemRows) {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrder.set(item.order_id, list);
    }

    // Each order may be at a different branch than the customer's favorite — batch
    // load every distinct branch name (mirrors ADM-006's list-route batch pattern).
    const branchIds = [...new Set(orderRows.map((o) => o.branch_id))];
    const branchRows = branchIds.length
      ? await db
          .select({ id: branches.id, name: branches.name })
          .from(branches)
          .where(inArray(branches.id, branchIds))
      : [];
    const branchById = new Map(branchRows.map((b) => [b.id, b]));

    const recentOrders: AdminOrderSummary[] = orderRows.map((o) =>
      serializeAdminOrderSummary(
        o,
        itemsByOrder.get(o.id) ?? [],
        { name: user.name, phoneNumber: user.phoneNumber },
        { name: branchById.get(o.branch_id)?.name ?? 'Unknown' },
      ),
    );

    res.json({
      customer: serializeAdminCustomerDetail(
        user,
        starsRow ?? null,
        favoriteBranchName,
        recentOrders,
      ),
    });
  } catch (err) {
    handleAdminError(err, res, 'loading customer');
  }
});

export default adminCustomersRouter;
