import type { Cart, CartItem } from '@jojopotato/types';
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
  starTransactions,
  userStars,
} from '../db/schema/index';
import { requireSession } from '../middleware/require-session';
import { resolveCouponDiscount } from './lib/coupon-apply';
import { resolveAvailableDealProductIds } from './lib/deal-availability';
import { resolveLiveDealProductIds } from './lib/deal-schedule';
import { orderNumberGenerator } from './lib/order-number';
import {
  centsToNumeric,
  numericToCents,
  serializeOrder,
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

/** Carries an HTTP status through a thrown-inside-transaction rollback path. */
class OrderError extends Error {
  constructor(
    readonly status: number,
    message: string,
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
        throw new OrderError(400, 'Branch is not accepting pickup orders right now');
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

    res.status(201).json({ order: result });
  } catch (err) {
    if (err instanceof OrderError) {
      res.status(err.status).json({ error: err.message });
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
