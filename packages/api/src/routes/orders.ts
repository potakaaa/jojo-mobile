import type { Cart, CartItem, OrderStatus } from '@jojopotato/types';
import { CUSTOMER_CANCEL_REASONS } from '@jojopotato/types';
import { getIsOpenNow } from '@jojopotato/utils';
import { and, count, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../db/client';
import {
  branchProductAvailability,
  branches,
  coupons,
  offerBranches,
  offerProducts,
  offers,
  orderItems,
  orders,
  productOptions,
  products,
  reviews,
  starTransactions,
  userStars,
} from '../db/schema/index';
import { creditStarForCompletedOrder } from '../lib/star-earning';
import { requireSession } from '../middleware/require-session';
import { isUniqueViolation } from './admin/lib/errors';
import { resolveCouponDiscount } from './lib/coupon-apply';
import { resolveAvailableDealProductIds } from './lib/deal-availability';
import { dispatchNewOrderStaffNotification } from './lib/notification-dispatch';
import { resolveLiveDealProductIds } from './lib/deal-schedule';
import { dispatchOrderNotification } from './lib/notification-dispatch';
import { orderNumberGenerator } from './lib/order-number';
import { canTransition } from './lib/order-state-machine';
import {
  centsToNumeric,
  numericToCents,
  serializeOrder,
  serializeReview,
  type SelectedOption,
} from './lib/serializers';

export const ordersRouter: Router = Router();

const MAX_ORDER_NUMBER_ATTEMPTS = 5;
const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 50;

const createOrderSchema = z.object({
  branchId: z.string().uuid(),
  paymentMethod: z.enum(['pay_at_branch', 'online_payment']),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
        selectedOptions: z.array(z.object({ optionId: z.string().uuid() })).default([]),
      }),
    )
    .min(1),
  // Optional reward/deal code (STAR-004). When present, the coupon is
  // re-validated + atomically consumed inside the placement transaction; omitting
  // it leaves the non-coupon path a pure no-op (discount_total stays 0.00).
  couponCode: z.string().optional(),
  // Optional applied deal. The server NEVER accepts a discount amount — only a
  // deal id — and recomputes the real discount from the DB row (server authority).
  dealId: z.string().uuid().optional(),
});

/**
 * Body schema for `PATCH /orders/:orderId/cancel` (B3).
 *
 * BOTH fields optional — a customer may cancel with no reason at all. There is
 * deliberately NO "other requires a note" refinement here (that gate belongs to the
 * staff reject route only; SPEC B3.5 leaves the customer path un-gated). There is
 * also no `status` field, so the target is always `cancelled` by construction.
 */
const CANCEL_REASON_CODES = CUSTOMER_CANCEL_REASONS.map((r) => r.code) as unknown as [
  string,
  ...string[],
];
const cancelOrderBodySchema = z.object({
  reasonCode: z.enum(CANCEL_REASON_CODES).optional(),
  note: z.string().optional(),
});

/**
 * Body for `POST /orders/:orderId/review` (order-completion-celebration). A
 * single overall rating (int 1–5) plus an optional short comment. `comment` is
 * trimmed and length-bounded; a blank comment is normalized to null at the
 * handler. An out-of-range / missing `rating` fails here → 422 (AC8), before any
 * DB work — the DB `CHECK (rating BETWEEN 1 AND 5)` is the defense-in-depth
 * backstop against a direct SQL write.
 */
const submitReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

/**
 * Carries an HTTP status through a thrown-inside-transaction rollback path.
 *
 * `reason` is an optional machine-readable code surfaced to the client as an
 * additive `reason` field alongside the existing human-readable `error` string.
 * Omitted for throws that have no distinct code to communicate.
 */
class OrderError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly reason?: string,
  ) {
    super(message);
    this.name = 'OrderError';
  }
}

/**
 * Real server-side discount in cents, computed from the RAW `deals.discount_value`
 * decimal string (never a client-sent amount, never `serializeDeal`'s converted
 * value). Both clamps are MANDATORY: `Math.min(computed, subtotalCents)` caps the
 * discount at the subtotal; `Math.max(0, …)` floors it at zero so a negative/garbage
 * raw value can never produce a negative discount (which would make total > subtotal).
 */
function computeDealDiscountCents(
  dealType: 'percentage_discount' | 'fixed_discount',
  discountValue: string,
  subtotalCents: number,
): number {
  const computed =
    dealType === 'fixed_discount'
      ? Math.round(Number(discountValue) * 100)
      : Math.round((subtotalCents * Number(discountValue)) / 100);
  return Math.max(0, Math.min(computed, subtotalCents));
}

// POST /orders — create a pickup order. Fully isolated transaction: server-side
// price recompute, DB-unique order_number via onConflictDoNothing retry loop,
// denormalized item snapshots.
ordersRouter.post('/', requireSession, async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid order payload', details: parsed.error.issues });
    return;
  }
  const body = parsed.data;

  // Online payment has no processor wired yet — it is visible-but-disabled in the
  // client, and rejected here so it can never actually be placed.
  if (body.paymentMethod === 'online_payment') {
    res.status(400).json({ error: 'Online payment is not available yet' });
    return;
  }

  // Single-active-discount rule: the cart model allows exactly ONE discount source
  // at a time. A deal and a reward coupon must never both apply on one order, so
  // reject the request up front (before any discount math / DB work) when both are
  // present. `couponCode` counts as present only when it is a non-empty string —
  // an empty/whitespace value is treated as absent (same as omitting it).
  const hasCoupon = body.couponCode !== undefined && body.couponCode.trim() !== '';
  if (body.dealId && hasCoupon) {
    res.status(400).json({
      error: 'Only one discount can be applied per order — remove the deal or the coupon.',
    });
    return;
  }

  const userId = req.user!.id;

  try {
    const result = await db.transaction(async (tx) => {
      // Branch must exist and be accepting pickup — read inside the tx so
      // estimated_prep_minutes reflects state at placement time.
      const [branch] = await tx.select().from(branches).where(eq(branches.id, body.branchId));
      if (!branch || !branch.is_active) {
        throw new OrderError(400, 'Branch not found');
      }
      if (!branch.is_accepting_pickup) {
        throw new OrderError(
          400,
          'Branch is not accepting pickup orders right now',
          'NOT_ACCEPTING_PICKUP',
        );
      }
      // Opening-hours gate: live server-clock evaluation, no grace window.
      // Runs AFTER the is_accepting_pickup check so a branch that is both
      // not-accepting AND closed reports NOT_ACCEPTING_PICKUP (existing
      // behavior). The message never names a reopen time — no reopen-time
      // derivation helper exists, and guessing one is worse than omitting it.
      if (!getIsOpenNow(branch.opening_hours, new Date())) {
        throw new OrderError(400, 'This branch is closed right now.', 'BRANCH_CLOSED');
      }

      const productIds = [...new Set(body.items.map((i) => i.productId))];

      // Products must be active AND available at this branch.
      const availableRows = await tx
        .select({ product: products })
        .from(products)
        .innerJoin(
          branchProductAvailability,
          and(
            eq(branchProductAvailability.product_id, products.id),
            eq(branchProductAvailability.branch_id, body.branchId),
            eq(branchProductAvailability.is_available, true),
          ),
        )
        .where(and(inArray(products.id, productIds), eq(products.is_active, true)));

      const productById = new Map(availableRows.map((r) => [r.product.id, r.product]));

      // Active options for the referenced products, for validation + price/snapshot.
      const optionRows = await tx
        .select()
        .from(productOptions)
        .where(
          and(inArray(productOptions.product_id, productIds), eq(productOptions.is_active, true)),
        );
      const optionById = new Map(optionRows.map((o) => [o.id, o]));

      let subtotalCents = 0;
      const itemInserts: (typeof orderItems.$inferInsert)[] = [];
      // Cents-based cart lines used for the server-side coupon recompute (LD5) —
      // the discount is derived from THESE server-priced lines, never from a
      // client-supplied amount.
      const cartLines: CartItem[] = [];

      for (const line of body.items) {
        const product = productById.get(line.productId);
        if (!product) {
          throw new OrderError(400, `Product ${line.productId} is not available at this branch`);
        }

        let unitPriceCents = Math.round(Number(product.base_price) * 100);
        const selectedSnapshot: SelectedOption[] = [];

        for (const sel of line.selectedOptions) {
          const option = optionById.get(sel.optionId);
          if (!option || option.product_id !== product.id) {
            throw new OrderError(
              400,
              `Option ${sel.optionId} does not belong to product ${product.id}`,
            );
          }
          const deltaCents = Math.round(Number(option.price_delta) * 100);
          unitPriceCents += deltaCents;
          selectedSnapshot.push({
            optionId: option.id,
            optionType: option.option_type as SelectedOption['optionType'],
            name: option.name,
            priceDeltaCents: deltaCents,
          });
        }

        const lineTotalCents = unitPriceCents * line.quantity;
        subtotalCents += lineTotalCents;

        itemInserts.push({
          order_id: '', // filled after the order row exists
          product_id: product.id,
          product_name_snapshot: product.name,
          quantity: line.quantity,
          unit_price: centsToNumeric(unitPriceCents),
          total_price: centsToNumeric(lineTotalCents),
          selected_options: selectedSnapshot,
        });

        cartLines.push({
          lineId: product.id,
          menuItemId: product.id,
          quantity: line.quantity,
          productNameSnapshot: product.name,
          unitPriceCents,
          selectedOptions: selectedSnapshot.map((o) => ({
            id: o.optionId,
            optionType: o.optionType,
            name: o.name,
            priceDeltaCents: o.priceDeltaCents,
          })),
        });
      }

      // AC6 (ADM-008 LD6): a coupon code cannot be combined with a Deal product
      // (ADM-004 deals-as-products, `products.is_deal = true`). Enforced HERE,
      // inside the placement transaction (product rows are already loaded above),
      // before any discount math or write. The dealId-XOR-couponCode guard before
      // the transaction covers the legacy discount-deal case; this covers the
      // deals-as-products case (a deal-product in the cart + a coupon code).
      if (
        hasCoupon &&
        body.items.some((line) => productById.get(line.productId)?.is_deal === true)
      ) {
        throw new OrderError(400, 'Coupon codes cannot be combined with Deal products.');
      }

      // MENU-003 (AC5 — trust boundary, money safety): a deal-product is only
      // orderable when EVERY one of its components is available at this branch.
      // The deal-product's OWN availability is already enforced above (it would
      // be missing from `productById` and have thrown at the per-line check);
      // this is the component layer that check never covered, which is how an
      // order for a deal the branch cannot fulfil could be placed until now.
      //
      // Server-side and unconditional — nothing the client sends can satisfy it.
      // Runs on `tx` (not `db`) so it reads the same snapshot as the write, and
      // BEFORE any discount math or insert, so an `OrderError` throw rolls the
      // whole placement back through the existing transaction semantics — no
      // order row, no charge, no new rollback logic needed.
      //
      // Batched over ALL deal lines in the cart in ONE helper call — a cart may
      // contain several different deals, and every one of them is checked.
      const dealProductsById = new Map<string, (typeof availableRows)[number]['product']>();
      for (const line of body.items) {
        const product = productById.get(line.productId);
        if (product?.is_deal === true) dealProductsById.set(product.id, product);
      }
      if (dealProductsById.size > 0) {
        const availableDealIds = await resolveAvailableDealProductIds(tx, body.branchId, [
          ...dealProductsById.keys(),
        ]);
        for (const [dealProductId, product] of dealProductsById) {
          if (!availableDealIds.has(dealProductId)) {
            throw new OrderError(
              400,
              `Deal "${product.name}" is no longer fully available at this branch`,
            );
          }
        }

        // DEAL-005 (AC6 — trust boundary): a deal's scheduled window is re-checked
        // against NOW at placement, not against when the item was added to the
        // cart. A window that closed while the cart sat open is rejected here.
        //
        // Calls the SAME `isDealScheduleLive()` helper (via `resolveLiveDealProductIds`)
        // as the menu read path (Execute-Agent Instruction E1) — never a re-derived
        // boundary comparison — so a deal is orderable for exactly the instants it
        // is browsable. Deals with ZERO schedule rows are always live, so this is a
        // guaranteed no-op for every pre-DEAL-005 deal (AC3 no-backfill guarantee).
        //
        // Runs on `tx` and BEFORE any discount math or insert, so the throw rolls
        // the whole placement back through the existing transaction semantics.
        const liveDealIds = await resolveLiveDealProductIds(
          tx,
          [...dealProductsById.keys()],
          new Date(),
        );
        for (const [dealProductId, product] of dealProductsById) {
          if (!liveDealIds.has(dealProductId)) {
            throw new OrderError(
              400,
              `Deal "${product.name}" is not currently available (its scheduled window is closed)`,
            );
          }
        }
      }

      // ─── DORMANT (ADM-004 deals-as-products pivot / ADM-008 test debt) ─────
      // This server-authoritative deal-apply block targets the LEGACY discount-
      // shaped `deals`/`orders.deal_id` mechanism, which is now DORMANT: the
      // ADM-004 re-plan replaced standalone discount deals with deals-as-products
      // (`products.is_deal` + `deal_components`), so no live caller sends `dealId`
      // today (the mobile cart's apply-deal path reads the dormant public
      // `GET /deals` route only). Left in place UNTOUCHED for ADM-008 (coupon
      // domain) to potentially resume in a modified form; `orders.test.ts`'s
      // ~15 deal-apply cases now exercise this caller-less path as deliberate
      // regression insurance, not dead-code rot. Do NOT delete without ADM-008
      // sign-off.
      // Server-authoritative deal apply. Runs AFTER the subtotal is known and
      // BEFORE the order insert, inside this same transaction, so any rejection
      // throws and rolls back the whole placement (atomic — no partial order).
      let discountCents = 0;
      if (body.dealId) {
        // Lock the deal row FIRST (SELECT … FOR UPDATE) so concurrent placements
        // of the SAME deal serialize against the usage-limit checks below — two
        // simultaneous orders cannot both pass a limit only one should.
        const [deal] = await tx
          .select()
          .from(offers)
          .where(and(eq(offers.id, body.dealId), eq(offers.is_active, true)))
          .for('update');
        if (!deal) {
          throw new OrderError(400, 'Deal not found or inactive');
        }

        // Complex deal types cannot compute a real discount — reject BEFORE any
        // math so a guessed/zero discount is never persisted with a deal_id.
        if (deal.deal_type !== 'percentage_discount' && deal.deal_type !== 'fixed_discount') {
          throw new OrderError(400, 'This deal cannot be applied at checkout yet');
        }

        // 6-step eligibility, 1:1 with the client engine's order/reasons. First
        // failure throws (400) and aborts the transaction.
        const now = new Date();

        // 1. window (is_active already guaranteed by the FOR UPDATE filter).
        if (deal.start_at > now || deal.end_at < now) {
          throw new OrderError(400, 'This deal is not currently available');
        }

        // 2. branch scope — empty offer_branches = branch-agnostic.
        const dealBranchRows = await tx
          .select()
          .from(offerBranches)
          .where(eq(offerBranches.offer_id, deal.id));
        if (
          dealBranchRows.length > 0 &&
          !dealBranchRows.some((r) => r.branch_id === body.branchId)
        ) {
          throw new OrderError(400, 'This deal is not available at your selected branch');
        }

        // 3. product-in-cart — empty offer_products = all products.
        const dealProductRows = await tx
          .select()
          .from(offerProducts)
          .where(eq(offerProducts.offer_id, deal.id));
        if (
          dealProductRows.length > 0 &&
          !dealProductRows.some((r) => productIds.includes(r.product_id))
        ) {
          throw new OrderError(400, 'Your cart has no item eligible for this deal');
        }

        // 4. minimum order amount (vs the actual server-computed subtotal).
        if (subtotalCents < numericToCents(deal.minimum_order_amount)) {
          throw new OrderError(400, "Order subtotal is below this deal's minimum");
        }

        // 5. per-user usage limit — counted AFTER the FOR UPDATE lock so concurrent
        // same-deal placements serialize (decision 1).
        if (deal.usage_limit_per_user !== null) {
          const [row] = await tx
            .select({ n: count() })
            .from(orders)
            .where(and(eq(orders.deal_id, deal.id), eq(orders.user_id, userId)));
          if ((row?.n ?? 0) >= deal.usage_limit_per_user) {
            throw new OrderError(400, 'You have reached the usage limit for this deal');
          }
        }

        // 6. total usage limit.
        if (deal.total_usage_limit !== null) {
          const [row] = await tx
            .select({ n: count() })
            .from(orders)
            .where(eq(orders.deal_id, deal.id));
          if ((row?.n ?? 0) >= deal.total_usage_limit) {
            throw new OrderError(400, 'This deal has reached its total usage limit');
          }
        }

        // Real discount, computed from the raw DB value and clamped to [0, subtotal].
        discountCents = computeDealDiscountCents(
          deal.deal_type,
          deal.discount_value ?? '0',
          subtotalCents,
        );
      }

      // Coupon recompute (STAR-004). Re-resolve + re-validate the code server-side
      // against the freshly-priced cart (defense in depth — LD5). On any failure
      // (unknown code, ineligible, or the eligible item was removed since apply)
      // the WHOLE placement is rejected: we never silently place at full price.
      // A reward coupon and a deal are independent discount sources; when both are
      // present their amounts sum, clamped to the subtotal below.
      let couponDiscountCents = 0;
      let rewardCouponIdToConsume: string | null = null;
      let rewardLabel = '';
      // Star Expendable: how many stars this reward costs (0 for offer coupons /
      // no coupon). Captured from the resolver so the loyalty ledger + balance
      // decrement below spend the exact amount.
      let requiredStars = 0;
      // Distinguishes coupon family: only a reward coupon writes the "Redeemed
      // reward" loyalty-ledger row (the atomic burn stays shared by both families).
      let couponIsReward = false;
      if (body.couponCode !== undefined) {
        const cart: Cart = { id: 'order-cart', items: cartLines, pickupBranchId: body.branchId };
        const resolution = await resolveCouponDiscount(tx, {
          code: body.couponCode.trim(),
          userId,
          pickupBranchId: body.branchId,
          cart,
          // Single-use is enforced by the UPDATE guard below (409), not here.
          allowUsedReward: true,
        });
        if (!resolution.ok) {
          throw new OrderError(resolution.status, resolution.message);
        }
        couponDiscountCents = resolution.discount.amountCents;
        rewardCouponIdToConsume = resolution.rewardCouponId;
        rewardLabel = resolution.discount.label;
        couponIsReward = resolution.discount.source === 'reward';
        requiredStars = resolution.requiredStars ?? 0;
      }

      // Unified discount: deal + reward-coupon amounts, dual-clamped to [0, subtotal].
      // The `Math.max(0, …)` floor is defense-in-depth — a corrupt/negative raw
      // discount_value (only reachable by direct SQL now that admin Zod forbids a
      // non-positive value) can never push the discount below 0 and make the total
      // exceed the subtotal.
      const discountTotalCents = Math.max(
        0,
        Math.min(discountCents + couponDiscountCents, subtotalCents),
      );
      const orderTotalCents = subtotalCents - discountTotalCents;

      const placedAt = new Date();
      const estimatedReadyAt = new Date(
        placedAt.getTime() + branch.estimated_prep_minutes * 60_000,
      );

      // Insert with a fresh order_number, retrying on unique-conflict. Because
      // onConflictDoNothing returns an empty set (never throws), the surrounding
      // transaction is never left in Postgres's aborted state.
      let createdOrder: typeof orders.$inferSelect | undefined;
      for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
        const orderNumber = orderNumberGenerator.generate(placedAt);
        const [inserted] = await tx
          .insert(orders)
          .values({
            user_id: userId,
            branch_id: body.branchId,
            deal_id: body.dealId ?? null,
            // Persist the consumed reward coupon so the order keeps its audit link
            // (serializeOrder returns couponId). null for non-coupon placements.
            coupon_id: rewardCouponIdToConsume,
            order_number: orderNumber,
            subtotal: centsToNumeric(subtotalCents),
            discount_total: centsToNumeric(discountTotalCents),
            total: centsToNumeric(orderTotalCents),
            payment_method: body.paymentMethod,
            estimated_ready_at: estimatedReadyAt,
            placed_at: placedAt,
          })
          .onConflictDoNothing({ target: orders.order_number })
          .returning();
        if (inserted) {
          createdOrder = inserted;
          break;
        }
      }

      if (!createdOrder) {
        console.error(
          `[orders] order_number generation exhausted ${MAX_ORDER_NUMBER_ATTEMPTS} attempts for user ${userId}`,
        );
        throw new OrderError(500, 'Could not allocate a unique order number, please retry');
      }

      // Consume a reward coupon AFTER the order row exists (so order_id on the
      // redeemed ledger row is real) but INSIDE the same transaction (atomic:
      // a later failure rolls back the consume too). The state-machine guard
      // `UPDATE ... WHERE status='available'` is the double-spend defense (AC6):
      // a concurrent/replayed placement finds 0 rows and the whole placement is
      // rejected — never two successful redemptions, never an insert-based dedupe.
      if (rewardCouponIdToConsume !== null) {
        const consumed = await tx
          .update(coupons)
          .set({
            status: 'used',
            // ADM-008 LD2: claim-on-redeem. A bulk-issued coupon (user_id NULL) is
            // claimed to the placing user via COALESCE; an already-owned coupon
            // keeps its owner. Paired with the `(user_id IS NULL OR user_id = me)`
            // guard below so a bulk and a targeted coupon can never double-claim.
            user_id: sql`coalesce(${coupons.user_id}, ${userId})`,
            used_at: new Date(),
          })
          .where(
            and(
              eq(coupons.id, rewardCouponIdToConsume),
              eq(coupons.status, 'available'),
              or(isNull(coupons.user_id), eq(coupons.user_id, userId)),
            ),
          )
          .returning({ id: coupons.id });
        if (consumed.length === 0) {
          throw new OrderError(409, 'This reward has already been redeemed.');
        }
        // Loyalty ledger is REWARD-only: an offer coupon is not a reward redemption,
        // so it must not write a "Redeemed reward" star_transactions row (that would
        // pollute the customer's loyalty history). The burn above stays shared.
        if (couponIsReward) {
          // Atomic star decrement: UPDATE with a balance guard so two concurrent
          // orders can't both pass the resolver pre-check and both subtract stars.
          // `lifetime_stars` stays monotonic (D6) — only `current_stars` decreases.
          const updatedUserStars = await tx
            .update(userStars)
            .set({
              current_stars: sql`${userStars.current_stars} - ${requiredStars}`,
              updated_at: new Date(),
            })
            .where(
              and(
                eq(userStars.user_id, userId),
                sql`${userStars.current_stars} >= ${requiredStars}`,
              ),
            )
            .returning({ id: userStars.id });
          if (updatedUserStars.length === 0 && requiredStars > 0) {
            throw new OrderError(400, "You don't have enough stars to redeem this reward.");
          }
          await tx.insert(starTransactions).values({
            user_id: userId,
            order_id: createdOrder.id,
            type: 'redeemed',
            stars: -requiredStars,
            description: `Redeemed reward: ${rewardLabel}`,
          });
        }
      }

      const insertedItems = await tx
        .insert(orderItems)
        .values(itemInserts.map((item) => ({ ...item, order_id: createdOrder!.id })))
        .returning();

      return serializeOrder(createdOrder, insertedItems);
    });

    // Notify the branch's staff of the new order (push-notifications-fixes,
    // AC1–AC4). Awaited AFTER the transaction commits (so the order is durable
    // before the push fans out) and BEFORE the 201 (so the AC1/AC3 integration
    // assertions are deterministic). `result` IS `serializeOrder(...)` output
    // (`ApiOrder`, camelCase `id`/`orderNumber`/`branchId`) — passed directly,
    // never the raw snake_case order row (E4). The dispatch swallows internally
    // and never throws, so a staff-push failure can never turn this 201 into a
    // 500 (AC2).
    await dispatchNewOrderStaffNotification(result);

    res.status(201).json({ order: result });
  } catch (err) {
    if (err instanceof OrderError) {
      res
        .status(err.status)
        .json({ error: err.message, ...(err.reason ? { reason: err.reason } : {}) });
      return;
    }
    console.error('[orders] unexpected error creating order', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// GET /orders — caller's order history, newest first, simple cursor pagination.
ordersRouter.get('/', requireSession, async (req, res) => {
  const userId = req.user!.id;

  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_HISTORY_LIMIT)
    : DEFAULT_HISTORY_LIMIT;

  const cursor = typeof req.query.cursor === 'string' ? new Date(req.query.cursor) : null;
  const hasCursor = cursor !== null && !Number.isNaN(cursor.getTime());

  const whereClause = hasCursor
    ? and(eq(orders.user_id, userId), lt(orders.placed_at, cursor))
    : eq(orders.user_id, userId);

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

  const serialized = page.map((o) => serializeOrder(o, itemsByOrder.get(o.id) ?? []));
  const nextCursor = hasMore ? page[page.length - 1]!.placed_at.toISOString() : null;

  res.json({ orders: serialized, nextCursor });
});

/**
 * PATCH /orders/:orderId/complete — customer self-confirms pickup.
 *
 * Deliberately NARROW: the request body carries no `status` field and is ignored
 * entirely, so this route can only ever express `ready → completed` for an order
 * the caller owns. A generic customer `PATCH { status }` would put a target
 * status in a client-writable body, making safety depend on a zod literal never
 * regressing; here the bad state is unrepresentable by construction.
 *
 * Registered BEFORE `GET /:orderId` so the more specific path always wins, even
 * though the methods differ today.
 *
 * Responses:
 *   200 — `{ order: ApiOrder }` (the CUSTOMER serializer, not the staff one).
 *   403 — the order is not the caller's.
 *   404 — order id malformed or not found.
 *   409 — current status is not `ready`, or a concurrent transition won the race.
 */
ordersRouter.patch('/:orderId/complete', requireSession, async (req, res) => {
  const userId = req.user!.id;

  // 1. Malformed id is NOT a 400 — it is indistinguishable from "no such order"
  //    to the caller, matching `GET /:orderId` exactly (no existence oracle).
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

  // 2. OWNERSHIP BEFORE STATUS — load-bearing ordering. If the status gate ran
  //    first, a non-owner could distinguish "someone else's ready order" (409)
  //    from "someone else's pending order" (403) and probe an order's state
  //    across the trust boundary. Checking ownership first makes every
  //    non-owned order look identical: 403, always.
  if (order.user_id !== userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // 3. Status gate, double-locked. `canTransition` is the shared pure table
  //    (unmodified by this feature — `ready → completed` was already legal);
  //    the explicit `!== 'ready'` check is belt-and-braces, since the table
  //    alone would silently admit a future source status if it ever widened,
  //    while the SPEC pins customer self-completion to `ready` only.
  const currentStatus = order.status as OrderStatus;
  if (!canTransition(currentStatus, 'completed') || currentStatus !== 'ready') {
    res.status(409).json({ error: 'Invalid status transition' });
    return;
  }

  const now = new Date();
  const patch: Partial<typeof orders.$inferInsert> = {
    status: 'completed',
    completed_at: now,
    updated_at: now,
  };

  // 4. Compare-and-swap on the status we read, inside a transaction (carried
  //    over from the staff PATCH). A customer tap racing a staff transition
  //    matches 0 rows and loses with a 409 — never a silent overwrite of the
  //    winner's terminal state.
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

  // 5. Star credit runs AFTER the transaction commits (staff precedent): the
  //    service owns its own transaction and is DB-idempotent, and `completed`
  //    is terminal — so a credit failure must never roll back a durable status
  //    flip nor 500 a request whose write already landed. Log and move on.
  //
  //    No push notification here: `OrderNotificationEvent` has no `completed`
  //    member, so the omission is deliberate, matching the staff path.
  try {
    await creditStarForCompletedOrder(orderId);
  } catch (err) {
    console.error(`[orders] failed to credit star for completed order ${orderId}`, err);
  }

  const [refreshedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));
  const items = await db.select().from(orderItems).where(eq(orderItems.order_id, orderId));
  res.json({ order: serializeOrder(refreshedOrder!, items) });
});

/**
 * PATCH /orders/:orderId/cancel — customer cancels their own PENDING order (B3).
 *
 * Deliberately NARROW, mirroring `/complete` above: the request body carries no
 * `status` field, so this route can only ever express `pending → cancelled` for an
 * order the caller owns. Both reason fields are OPTIONAL — unlike the staff reject
 * route, B3 has no "other requires a note" gate (SPEC B3.5, deliberately un-gated).
 *
 * The cancel window is PENDING-ONLY. That is a route-level narrowing, not a state
 * machine change: `order-state-machine.ts` still legally permits staff to cancel an
 * `accepted`/`preparing`/… order. See the cross-reference note in that file before
 * ever widening this window.
 *
 * Registered BEFORE `GET /:orderId` so the more specific path always wins.
 *
 * Responses:
 *   200 — `{ order: ApiOrder }` (the CUSTOMER serializer).
 *   403 — the order is not the caller's.
 *   404 — order id malformed or not found (indistinguishable — no existence oracle).
 *   409 — current status is not `pending`, or a concurrent transition won the race.
 *   422 — `reasonCode` present but not one of the locked customer codes.
 */
ordersRouter.patch('/:orderId/cancel', requireSession, async (req, res) => {
  const userId = req.user!.id;

  // 1. Malformed id is NOT a 400 — indistinguishable from "no such order",
  //    matching `/complete` and `GET /:orderId` exactly.
  const orderId = String(req.params.orderId);
  if (!z.string().uuid().safeParse(orderId).success) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  // 2. Body validation. Both fields optional; an unrecognised code is a 422 rather
  //    than being silently dropped, so a client typo can never persist a garbage
  //    reason the UI cannot resolve back to a label.
  const parsed = cancelOrderBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Invalid cancel reason' });
    return;
  }
  const { reasonCode, note } = parsed.data;

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  // 3. OWNERSHIP BEFORE STATUS — load-bearing ordering, identical to `/complete`.
  //    If the status gate ran first, a non-owner could distinguish "someone else's
  //    pending order" (409 vs 403) and probe an order's state across the trust
  //    boundary. Ownership first makes every non-owned order look identical: 403.
  if (order.user_id !== userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // 4. Status gate, double-locked. `canTransition` is the shared pure table
  //    (unmodified — `pending → cancelled` was already legal); the explicit
  //    `!== 'pending'` check pins CUSTOMER self-cancellation to `pending` only,
  //    even though the table admits wider staff-side sources.
  const currentStatus = order.status as OrderStatus;
  if (!canTransition(currentStatus, 'cancelled') || currentStatus !== 'pending') {
    res.status(409).json({ error: 'Invalid status transition' });
    return;
  }

  const now = new Date();
  const patch: Partial<typeof orders.$inferInsert> = {
    status: 'cancelled',
    cancelled_at: now,
    reason_code: reasonCode ?? null,
    reason_note: note?.trim() ? note.trim() : null,
    reason_actor: 'customer',
    updated_at: now,
  };

  // 5. Compare-and-swap on the status we read, inside a transaction. A customer tap
  //    racing a staff `accepted` transition matches 0 rows and loses with a 409 —
  //    never a silent overwrite, and never a half-written reason on the loser's row.
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

  const [refreshedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));

  // 6. Push notification runs AFTER the commit (staff precedent). We call the
  //    EXPORTED `dispatchOrderNotification` directly — `notifyCustomer` is a bare,
  //    module-private helper inside `staff.ts` and is not importable from here.
  //    `OrderNotificationEvent` already includes 'cancelled', so no type widening.
  //    `dispatchOrderNotification` never throws, so a push failure can never break
  //    a durably-committed status flip.
  await dispatchOrderNotification(refreshedOrder!, 'cancelled');

  const items = await db.select().from(orderItems).where(eq(orderItems.order_id, orderId));
  res.json({ order: serializeOrder(refreshedOrder!, items) });
});

/**
 * POST /orders/:orderId/review — the customer leaves a single overall rating
 * (1–5) + optional comment for an order they own that has reached `completed`.
 *
 * The gate ORDERING is copied VERBATIM from `PATCH /:orderId/complete` (the
 * ownership-boundary precedent): malformed id → 404 (no existence oracle), load
 * order → 404, OWNERSHIP → 403 BEFORE any state gate, then not-`completed` → 409.
 * Body validation (422) runs only after all four gates, so a non-owner never
 * learns anything about the order (or their own body) beyond a flat 403.
 *
 * D8 (no edit / one review per order) is enforced at TWO layers: a pre-`SELECT`
 * for an existing review (the friendly common-case 409) AND a catch that maps
 * the `reviews.order_id` unique-violation to 409 as the atomic race backstop
 * (via `isUniqueViolation`, which unwraps drizzle's `err.cause.code === '23505'`
 * — a top-level-only check would silently 500). A duplicate never surfaces as a
 * 500 and never mutates the original row.
 *
 * Registered BEFORE `GET /:orderId` so the more specific path always wins.
 *
 * Responses:
 *   200 — `{ review: ApiReview }` on success.
 *   403 — the order is not the caller's.
 *   404 — order id malformed or not found.
 *   409 — the order is not `completed`, or a review already exists for it.
 *   422 — `rating` is out of 1–5 or missing (Zod validation failure).
 */
ordersRouter.post('/:orderId/review', requireSession, async (req, res) => {
  const userId = req.user!.id;

  // 1. Malformed id → 404, matching `GET /:orderId` / `PATCH .../complete`
  //    exactly (no existence oracle across the trust boundary).
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

  // 2. OWNERSHIP BEFORE STATE — load-bearing ordering (E4). If the state gate
  //    ran first, a non-owner could distinguish a stranger's completed order
  //    (409 duplicate / 200) from a non-completed one (409 state) and probe an
  //    order's state across the trust boundary. Checking ownership first makes
  //    every non-owned order look identical: 403, always.
  if (order.user_id !== userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // 3. Only a completed order can be reviewed.
  if (order.status !== 'completed') {
    res.status(409).json({ error: 'You can only review a completed order' });
    return;
  }

  // 4. Body validation → 422 (runs AFTER the ownership/state gates so nothing
  //    about the request body can precede the trust-boundary decision).
  const parsed = submitReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Invalid review', details: parsed.error.issues });
    return;
  }
  const comment =
    parsed.data.comment !== undefined && parsed.data.comment.length > 0
      ? parsed.data.comment
      : null;

  // 5. D8 layer 1 — friendly pre-check for the common case (a review already
  //    exists). The unique-constraint catch below is the atomic race backstop.
  const [existing] = await db.select().from(reviews).where(eq(reviews.order_id, orderId));
  if (existing) {
    res.status(409).json({ error: 'This order has already been reviewed' });
    return;
  }

  try {
    const [inserted] = await db
      .insert(reviews)
      .values({ order_id: orderId, user_id: userId, rating: parsed.data.rating, comment })
      .returning();
    res.status(200).json({ review: serializeReview(inserted!) });
  } catch (err) {
    // D8 layer 2 — a concurrent/replayed submission racing the pre-check maps the
    // `reviews.order_id` unique-violation to a clean 409 (never a leaked 500).
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: 'This order has already been reviewed' });
      return;
    }
    console.error(`[orders] failed to submit review for order ${orderId}`, err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// GET /orders/:orderId — full order; 404 if missing, 403 if not the caller's.
ordersRouter.get('/:orderId', requireSession, async (req, res) => {
  const userId = req.user!.id;

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
  if (order.user_id !== userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.order_id, order.id));
  res.json({ order: serializeOrder(order, items) });
});
