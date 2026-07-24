import type { OrderStatus, StaffMe } from '@jojopotato/types';
import { STAFF_REJECT_REASONS } from '@jojopotato/types';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../db/client';
import {
  branchProductAvailability,
  branches,
  orderItems,
  orderStatusEnum,
  orders,
  products,
} from '../db/schema/index';
import { resolveBranchScope } from '../lib/require-staff';
import { creditStarForCompletedOrder } from '../lib/star-earning';
import {
  dispatchOrderNotification,
  type OrderNotificationEvent,
} from './lib/notification-dispatch';
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
 * Credit a Jojo Star for a completed order (wired as of the dev/star merge —
 * resolves the STAFF-003 star-earn dependency). Delegates to the idempotent
 * `creditStarForCompletedOrder` service (DB-enforced single credit per order; also
 * triggers STAR-003 reward unlock + coupon generation on threshold crossing).
 *
 * Best-effort and fire-and-forget: the order status transition is already committed
 * by the time this runs, so a credit failure must NOT fail the 200 response. We
 * still `await` so any error is caught and logged here rather than surfacing as an
 * unhandled rejection.
 */
async function creditStarsForOrder(order: typeof orders.$inferSelect): Promise<void> {
  try {
    await creditStarForCompletedOrder(order.id);
  } catch (err) {
    console.error(`[staff] failed to credit star for completed order ${order.id}`, err);
  }
}

/**
 * Dispatch a customer push notification for an order transition (PUSH-004 / #75).
 *
 * A thin wrapper over `dispatchOrderNotification` — scoped to exactly the 4
 * transactional events (`accepted`/`preparing`/`ready`/`cancelled`). Awaited at
 * the call site so the notification row is persisted before the PATCH response
 * (deterministic in-app list consistency); `dispatchOrderNotification` never
 * throws, so a push failure can never break the status transition.
 */
async function notifyCustomer(
  order: typeof orders.$inferSelect,
  event: OrderNotificationEvent,
): Promise<void> {
  await dispatchOrderNotification(order, event);
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const patchOrderBodySchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES),
  etaMinutes: z.number().optional(),
});

/**
 * Body schema for the dedicated reject-with-reason route (B2).
 *
 * There is deliberately NO `status` field: the target is always `rejected`, so a
 * client can never redirect this route to another transition (same "make the bad
 * state unrepresentable" rationale as `PATCH /orders/:orderId/complete`). Zod
 * strips unknown keys, so a `status` in the body is silently ignored.
 *
 * `note` is optional EXCEPT when `reasonCode === 'other'`, where a non-empty
 * (non-whitespace) note is required — enforced server-side, independent of any
 * client-side gate (B2.2/B2.8, both HARD).
 */
const REJECT_REASON_CODES = STAFF_REJECT_REASONS.map((r) => r.code) as unknown as [
  string,
  ...string[],
];
const rejectOrderBodySchema = z
  .object({
    reasonCode: z.enum(REJECT_REASON_CODES),
    note: z.string().optional(),
  })
  .refine((b) => b.reasonCode !== 'other' || (b.note ?? '').trim().length > 0, {
    message: 'A note is required when the reason is "other"',
    path: ['note'],
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
 * `GET /api/staff/orders/lookup?code=<pickup-code>` → `StaffOrderDetail` (STAFF-005/PUP-002).
 *
 * Finds an order by its `order_number` (the pickup code the customer speaks
 * aloud), scoped to the caller's branch. Returns the full `StaffOrderDetail`
 * INCLUDING the real `status` (terminal or not) — completion handling is left to
 * the existing detail screen's state-machine actions.
 *
 * SECURITY (SPEC US-3/AC4/AC5 — LOCKED): the lookup is a SINGLE combined WHERE
 * filter on `(branch_id, order_number)` with ONE `!order → 404` branch. A
 * wrong-branch code simply fails the branch filter → identical not-found path as
 * a nonexistent code, so the 404 body is byte-identical for both. Do NOT copy the
 * adjacent `/orders/:orderId` load-then-403 pattern — that leaks order existence
 * across branches.
 *
 * IMPORTANT: This static route MUST be registered BEFORE `/orders/:orderId` —
 * Express matches top-down and would otherwise treat "lookup" as an orderId param.
 *
 * Status codes:
 *   200 — flat `StaffOrderDetail` (same serializer as `/orders/:orderId`).
 *   400 — missing/empty `code` after normalization.
 *   403 — unassigned/no-branch staff.
 *   404 — no order matches this code at the caller's branch (byte-identical for
 *         wrong-branch and nonexistent codes).
 */
staffRouter.get('/orders/lookup', async (req, res) => {
  const branchId = await resolveBranchScope(db, req.staffSession!.userId);
  if (!branchId) {
    res.status(403).json({ error: 'No branch assigned' });
    return;
  }

  const code = String(req.query.code ?? '')
    .trim()
    .toUpperCase();
  if (!code) {
    res.status(400).json({ error: 'Missing code' });
    return;
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.branch_id, branchId), eq(orders.order_number, code)));
  if (!order) {
    res.status(404).json({ error: 'No matching order found for your branch' });
    return;
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.order_id, order.id));
  res.json(serializeStaffOrderDetail(order, items));
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
 * `PATCH /api/staff/orders/:orderId/reject` → `{ order: StaffOrderDetail }` (B2).
 *
 * Staff reject an order WITH a required reason. Deliberately NARROW, mirroring the
 * customer-side `PATCH /orders/:orderId/complete` precedent: the body carries no
 * `status`, so this route can only ever express `pending → rejected`.
 *
 * Registered BEFORE the generic `PATCH /orders/:orderId` so the more specific path
 * always wins — otherwise `/reject` would be captured as an `:orderId` value.
 *
 * Guard ORDER is load-bearing and matches the generic PATCH + `/complete` exactly:
 * branch scope → order lookup → branch match (403) → status (409) → CAS. Checking
 * branch scope before status means a cross-branch order always looks identical
 * (403), never leaking whether it is pending via a 409/403 split.
 *
 * Status codes:
 *   200 — rejected; returns the updated StaffOrderDetail.
 *   403 — unassigned staff or cross-branch order.
 *   404 — order id malformed or not found (indistinguishable — no existence oracle).
 *   409 — order is not currently `pending`, or a concurrent transition won the race.
 *   422 — missing/invalid `reasonCode`, or `reasonCode: 'other'` without a note.
 */
staffRouter.patch('/orders/:orderId/reject', async (req, res) => {
  // 1. Resolve branch scope — unassigned staff → 403.
  const branchId = await resolveBranchScope(db, req.staffSession!.userId);
  if (!branchId) {
    res.status(403).json({ error: 'No branch assigned' });
    return;
  }

  // 2. Malformed id is a 404, not a 400 — identical to an unknown order.
  const orderId = String(req.params.orderId);
  if (!z.string().uuid().safeParse(orderId).success) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  // 3. Body validation (includes the "other requires a note" refinement).
  const parseResult = rejectOrderBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({ error: 'Invalid reject reason' });
    return;
  }
  const { reasonCode, note } = parseResult.data;

  // 4. Load order — not found → 404; cross-branch → 403 (BEFORE any status check).
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  if (order.branch_id !== branchId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // 5. Status gate, double-locked like `/complete`. `canTransition` is the shared
  //    pure table (unmodified by this feature — `pending → rejected` was already
  //    legal); the explicit `!== 'pending'` check pins rejection to `pending` even
  //    if the table ever widened.
  const currentStatus = order.status as OrderStatus;
  if (!canTransition(currentStatus, 'rejected') || currentStatus !== 'pending') {
    res.status(409).json({ error: 'Invalid status transition' });
    return;
  }

  const now = new Date();
  const patch: Partial<typeof orders.$inferInsert> = {
    status: 'rejected',
    reason_code: reasonCode,
    reason_note: note?.trim() ? note.trim() : null,
    reason_actor: 'staff',
    updated_at: now,
  };
  // `rejected` has no dedicated timestamp column (status alone marks terminal),
  // matching the generic PATCH's existing handling.

  // 6. Compare-and-swap on the status we read, inside a transaction — a concurrent
  //    transition that already advanced the order matches 0 rows and loses with a
  //    409, never silently overwriting the winner's terminal state or its reason.
  const committed = await db.transaction(async (tx) => {
    const [updatedRow] = await tx
      .update(orders)
      .set(patch)
      .where(and(eq(orders.id, orderId), eq(orders.status, currentStatus)))
      .returning({ id: orders.id });
    return Boolean(updatedRow);
  });

  if (!committed) {
    res.status(409).json({ error: 'Concurrent modification detected; please retry' });
    return;
  }

  // No push notification: `OrderNotificationEvent` has no `rejected` member, so
  // the omission is deliberate and matches the generic PATCH's `rejected` path
  // (see the deferred-rejected-notification backlog note).
  const [refreshedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));
  const items = await db.select().from(orderItems).where(eq(orderItems.order_id, orderId));
  res.json({ order: serializeStaffOrderDetail(refreshedOrder!, items) });
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
    // Additive audit stamp (B2 Decision Summary): this generic route still legally
    // performs pending→cancelled, so it must stamp the actor or `reason_actor`
    // would be ambiguous between "staff did it" and "predates the feature".
    // No reason code/note — this route has no reason input; B2's dedicated
    // `/reject` route is the only place a staff-authored reason is captured.
    patch.reason_actor = 'staff';
  } else if (targetStatus === 'rejected') {
    // Same stamp for the generic route's pending→rejected path. No dedicated
    // timestamp column exists for `rejected` (status alone marks terminal).
    patch.reason_actor = 'staff';
  }
  // `preparing` / `flavoring`: status change only, no timestamp.

  // 7. Apply the update inside a transaction — compare-and-swap on current status
  //    so a concurrent PATCH that already advanced the order results in 0 rows
  //    matched → 409. The star credit for a completion runs OUTSIDE this tx via the
  //    idempotent `creditStarForCompletedOrder` service (which owns its own
  //    transaction + STAR-003 reward unlock), so a credit failure never rolls back
  //    the status flip (`completed` is terminal; the service is DB-idempotent).
  const updatedOrder = { ...order, ...patch } as typeof order;
  const committed = await db.transaction(async (tx) => {
    const [updatedRow] = await tx
      .update(orders)
      .set(patch)
      .where(and(eq(orders.id, orderId), eq(orders.status, order.status)))
      .returning({ id: orders.id });
    if (!updatedRow) return false;

    return true;
  });

  if (!committed) {
    res.status(409).json({ error: 'Concurrent modification detected; please retry' });
    return;
  }

  // 8. Star credit for `completed` + customer push notifications run OUTSIDE the
  //    tx, only after the status flip has durably committed. Push notifications
  //    fire for the 4 transactional events (accepted/preparing/ready/cancelled) —
  //    NOT completed/rejected (PUSH-004; `OrderNotificationEvent` has no
  //    'completed'/'rejected' member, so those are deliberately unpushed, not an
  //    oversight — see the deferred-rejected-notification backlog note).
  if (targetStatus === 'accepted') {
    await notifyCustomer(updatedOrder, 'accepted');
  } else if (targetStatus === 'preparing') {
    await notifyCustomer(updatedOrder, 'preparing');
  } else if (targetStatus === 'ready') {
    await notifyCustomer(updatedOrder, 'ready');
  } else if (targetStatus === 'completed') {
    await creditStarsForOrder(updatedOrder);
  } else if (targetStatus === 'cancelled') {
    await notifyCustomer(updatedOrder, 'cancelled');
  }

  // 9. Re-select the updated order for the response.
  const [refreshedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));
  const items = await db.select().from(orderItems).where(eq(orderItems.order_id, orderId));
  res.json({ order: serializeStaffOrderDetail(refreshedOrder!, items) });
});

// ─── STAFF-004: Product availability + branch settings ───────────────────────

/**
 * Zod schemas for STAFF-004 endpoints.
 */
const patchProductAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

const patchBranchSettingsSchema = z
  .object({
    estimatedPrepMinutes: z.number().int().min(1).max(120),
  })
  .strict();

/**
 * `GET /api/staff/products` → `{ products: StaffProduct[] }` (STAFF-004).
 *
 * Returns all globally-active products with branch-level availability overlaid.
 * Uses a LEFT JOIN on `branch_product_availability` — an absent row means the
 * product is available at this branch (COALESCE to `true`).
 *
 * IMPORTANT: The customer-facing menu endpoint uses an INNER JOIN with
 * `is_available = true`, so an absent `bpa` row makes the product INVISIBLE
 * to customers — the LEFT JOIN default here is staff-only (for toggling).
 */
staffRouter.get('/products', async (req, res) => {
  const branchId = await resolveBranchScope(db, req.staffSession!.userId);
  if (!branchId) {
    res.status(403).json({ error: 'No branch assigned' });
    return;
  }

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      categoryId: products.category_id,
      basePrice: products.base_price,
      isAvailable: branchProductAvailability.is_available,
    })
    .from(products)
    .leftJoin(
      branchProductAvailability,
      and(
        eq(branchProductAvailability.branch_id, branchId),
        eq(branchProductAvailability.product_id, products.id),
      ),
    )
    .where(eq(products.is_active, true))
    .orderBy(asc(products.name));

  const staffProducts = rows.map((row) => ({
    id: row.id,
    name: row.name,
    categoryId: row.categoryId,
    basePrice: row.basePrice,
    // COALESCE: absent bpa row (null) → available
    isAvailable: row.isAvailable ?? true,
  }));

  res.json({ products: staffProducts });
});

/**
 * `PATCH /api/staff/products/:productId/availability` → `{ productId, isAvailable }` (STAFF-004).
 *
 * Upserts a `branch_product_availability` row for the given product at the
 * staff member's assigned branch. Only affects the CALLER's branch — cross-branch
 * writes are structurally impossible (branch is always session-derived).
 *
 * Status codes:
 *   200 — availability updated.
 *   403 — unassigned staff.
 *   404 — productId not a valid UUID OR product not found / not active.
 *   422 — missing or invalid `isAvailable` in request body.
 */
staffRouter.patch('/products/:productId/availability', async (req, res) => {
  const branchId = await resolveBranchScope(db, req.staffSession!.userId);
  if (!branchId) {
    res.status(403).json({ error: 'No branch assigned' });
    return;
  }

  const productId = String(req.params.productId);
  if (!z.string().uuid().safeParse(productId).success) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const parseResult = patchProductAvailabilitySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({ error: 'Invalid body', details: parseResult.error.issues });
    return;
  }
  const { isAvailable } = parseResult.data;

  // Guard: verify the branch still exists before the UPSERT to avoid a FK-
  // violation 500 if the branch was removed after resolveBranchScope returned.
  const [branchRow] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.id, branchId));
  if (!branchRow) {
    res.status(404).json({ error: 'Branch not found' });
    return;
  }

  // Verify the product exists and is globally active.
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.is_active, true)));
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  // UPSERT: create or update the branch-level availability row.
  await db
    .insert(branchProductAvailability)
    .values({
      branch_id: branchId,
      product_id: productId,
      is_available: isAvailable,
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [branchProductAvailability.branch_id, branchProductAvailability.product_id],
      set: { is_available: isAvailable, updated_at: new Date() },
    });

  res.json({ productId, isAvailable });
});

/**
 * `GET /api/staff/branch` → `{ isAcceptingPickup, estimatedPrepMinutes }` (STAFF-004).
 *
 * Returns the operational settings for the staff member's assigned branch.
 * Read-only — use PATCH /api/staff/branch to update.
 */
staffRouter.get('/branch', async (req, res) => {
  const branchId = await resolveBranchScope(db, req.staffSession!.userId);
  if (!branchId) {
    res.status(403).json({ error: 'No branch assigned' });
    return;
  }

  const [branch] = await db
    .select({
      isAcceptingPickup: branches.is_accepting_pickup,
      estimatedPrepMinutes: branches.estimated_prep_minutes,
    })
    .from(branches)
    .where(eq(branches.id, branchId));

  if (!branch) {
    res.status(404).json({ error: 'Branch not found' });
    return;
  }

  res.json({
    isAcceptingPickup: branch.isAcceptingPickup,
    estimatedPrepMinutes: branch.estimatedPrepMinutes,
  });
});

/**
 * `PATCH /api/staff/branch` → `{ isAcceptingPickup, estimatedPrepMinutes }` (STAFF-004).
 *
 * Updates the estimated prep time for the staff member's assigned branch.
 * Pickup acceptance (`is_accepting_pickup`) is admin-only — use the admin branches
 * API to change it. Cross-branch writes are structurally impossible (branch is
 * always session-derived).
 *
 * Status codes:
 *   200 — settings updated; returns updated values.
 *   403 — unassigned staff.
 *   422 — missing or invalid `estimatedPrepMinutes`.
 */
staffRouter.patch('/branch', async (req, res) => {
  const branchId = await resolveBranchScope(db, req.staffSession!.userId);
  if (!branchId) {
    res.status(403).json({ error: 'No branch assigned' });
    return;
  }

  const parseResult = patchBranchSettingsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({ error: 'Invalid body', details: parseResult.error.issues });
    return;
  }
  const { estimatedPrepMinutes } = parseResult.data;

  const patch: Partial<typeof branches.$inferInsert> = {
    updated_at: new Date(),
    estimated_prep_minutes: estimatedPrepMinutes,
  };

  await db.update(branches).set(patch).where(eq(branches.id, branchId));

  // Re-select after update for the response.
  const [updated] = await db
    .select({
      isAcceptingPickup: branches.is_accepting_pickup,
      estimatedPrepMinutes: branches.estimated_prep_minutes,
    })
    .from(branches)
    .where(eq(branches.id, branchId));

  if (!updated) {
    res.status(404).json({ error: 'Branch not found' });
    return;
  }

  res.json({
    isAcceptingPickup: updated.isAcceptingPickup,
    estimatedPrepMinutes: updated.estimatedPrepMinutes,
  });
});

export default staffRouter;
