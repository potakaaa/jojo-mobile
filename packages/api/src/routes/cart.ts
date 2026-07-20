import { and, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../db/client';
import { branches, cartItems, carts, productOptions, products } from '../db/schema/index';
import { resolveCartLineValidity, type CartLineForValidation } from './lib/cart-revalidation';
import type { Queryer } from './lib/coupon-apply';
import {
  centsToNumeric,
  numericToCents,
  serializeCart,
  type SelectedOption,
} from './lib/serializers';

export const cartRouter: Router = Router();

type CartRow = typeof carts.$inferSelect;
type CartItemRow = typeof cartItems.$inferSelect;

/** Carries an HTTP status through a thrown-inside-transaction rollback path. */
class CartError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CartError';
  }
}

// ─── Request schemas ─────────────────────────────────────────────────────────
//
// `POST /cart/items` deliberately has NO price field — the server always re-prices
// from the live product + option rows (defense in depth: the cart's displayed price
// is always honest, and a future caller can never start trusting a client price).
// Zod strips any unknown key, so a `price`/`unitPriceCents` in the body is ignored.
const addItemSchema = z.object({
  productId: z.string().uuid(),
  selectedOptions: z.array(z.object({ optionId: z.string().uuid() })).default([]),
  quantity: z.number().int().positive().default(1),
  notes: z.string().optional(),
});

// quantity <= 0 removes the line (matches the client hook's updateQuantity semantics).
const updateQuantitySchema = z.object({ quantity: z.number().int() });

const branchSchema = z.object({ branchId: z.string().uuid() });

const discountSchema = z.object({
  source: z.enum(['coupon', 'deal', 'reward']),
  refId: z.string().uuid(),
  label: z.string(),
  amountCents: z.number().int().nonnegative(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Atomic find-or-create for the caller's single cart. The `carts.user_id` UNIQUE
 * constraint guarantees one row per user; `onConflictDoNothing` + a follow-up select
 * makes concurrent first-touches converge on that one row (never a duplicate, never a
 * unique-violation 500). There is no `:cartId` route param anywhere, so this is the
 * ONLY way a cart is addressed — structurally eliminating cross-user cart access.
 */
async function getOrCreateCart(q: Queryer, userId: string): Promise<CartRow> {
  await q.insert(carts).values({ user_id: userId }).onConflictDoNothing();
  const [cart] = await q.select().from(carts).where(eq(carts.user_id, userId));
  if (!cart) throw new CartError(500, 'Could not resolve cart');
  return cart;
}

/** Map a stored cart_items row to the shape `resolveCartLineValidity` expects. */
function toValidationLine(item: CartItemRow): CartLineForValidation {
  return {
    lineId: item.id,
    productId: item.product_id,
    selectedOptionIds: ((item.selected_options as SelectedOption[]) ?? []).map((o) => o.optionId),
    storedUnitPriceCents: numericToCents(item.unit_price),
  };
}

/** Sorted option-id key — the app-level line identity (ported `lineIdFor`). */
function optionKey(optionIds: string[]): string {
  return [...optionIds].sort().join('+');
}

/**
 * Read the caller's fresh cart (fetch-or-create), re-validate every line against the
 * live product/branch/price state, serialize, and respond. Called by GET and after
 * every mutation (post-commit, so it always reflects the just-written state).
 */
async function loadAndRespond(res: import('express').Response, userId: string): Promise<void> {
  const cart = await getOrCreateCart(db, userId);
  const items = await db.select().from(cartItems).where(eq(cartItems.cart_id, cart.id));
  const validity = await resolveCartLineValidity(db, cart.branch_id, items.map(toValidationLine));
  res.json({ cart: serializeCart(cart, items, validity) });
}

/**
 * Resolve a `:lineId` to a cart_items row that MUST belong to the caller's cart.
 * 404 when the line does not exist; 403 when it exists but belongs to another user's
 * cart (AC4 line-level ownership — never trust `:lineId` alone). This is the first
 * customer-facing `:id`-scoped mutate route in the codebase, so this check is written
 * fresh (no prior pattern to copy) and locked by the AC4-line test.
 */
async function requireOwnedLine(
  q: Queryer,
  callerCartId: string,
  lineId: string,
): Promise<CartItemRow> {
  const [line] = await q.select().from(cartItems).where(eq(cartItems.id, lineId));
  if (!line) throw new CartError(404, 'Cart item not found');
  if (line.cart_id !== callerCartId) throw new CartError(403, 'Forbidden');
  return line;
}

/** Uniform CartError → HTTP response. */
function handleCartError(res: import('express').Response, err: unknown, context: string): void {
  if (err instanceof CartError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(`[cart] unexpected error ${context}`, err);
  res.status(500).json({ error: 'Cart request failed' });
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /cart — fetch-or-create the caller's cart, re-validated + live-priced.
cartRouter.get('/', async (req, res) => {
  try {
    await loadAndRespond(res, req.user!.id);
  } catch (err) {
    handleCartError(res, err, 'reading cart');
  }
});

// POST /cart/items — add a line (server-priced), merging into an existing line with
// the same product + same selected options (app-level, ported lineIdFor).
cartRouter.post('/items', async (req, res) => {
  const parsed = addItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid cart item payload', details: parsed.error.issues });
    return;
  }
  const body = parsed.data;
  const userId = req.user!.id;

  try {
    await db.transaction(async (tx) => {
      const cart = await getOrCreateCart(tx, userId);

      // Product must exist and be active (needed for name + live price snapshot).
      const [product] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, body.productId), eq(products.is_active, true)));
      if (!product) {
        throw new CartError(400, 'Product is not available');
      }

      // Server-side price: live base price + each active, product-owned option delta.
      let unitPriceCents = Math.round(Number(product.base_price) * 100);
      const selectedSnapshot: SelectedOption[] = [];
      const optionIds = body.selectedOptions.map((s) => s.optionId);
      const optionRows = optionIds.length
        ? await tx
            .select()
            .from(productOptions)
            .where(and(inArray(productOptions.id, optionIds), eq(productOptions.is_active, true)))
        : [];
      const optionById = new Map(optionRows.map((o) => [o.id, o]));
      for (const sel of body.selectedOptions) {
        const option = optionById.get(sel.optionId);
        if (!option || option.product_id !== product.id) {
          throw new CartError(400, `Option ${sel.optionId} is not valid for this product`);
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

      // Line-merge: same product + same option set → bump quantity, else new line.
      const newKey = optionKey(optionIds);
      const existingLines = await tx
        .select()
        .from(cartItems)
        .where(and(eq(cartItems.cart_id, cart.id), eq(cartItems.product_id, product.id)));
      const match = existingLines.find(
        (l) =>
          optionKey(((l.selected_options as SelectedOption[]) ?? []).map((o) => o.optionId)) ===
          newKey,
      );

      if (match) {
        await tx
          .update(cartItems)
          .set({ quantity: match.quantity + body.quantity, updated_at: new Date() })
          .where(eq(cartItems.id, match.id));
      } else {
        await tx.insert(cartItems).values({
          cart_id: cart.id,
          product_id: product.id,
          quantity: body.quantity,
          product_name_snapshot: product.name,
          unit_price: centsToNumeric(unitPriceCents),
          selected_options: selectedSnapshot,
          ...(body.notes === undefined ? {} : { notes: body.notes }),
        });
      }

      await tx.update(carts).set({ updated_at: new Date() }).where(eq(carts.id, cart.id));
    });

    await loadAndRespond(res, userId);
  } catch (err) {
    handleCartError(res, err, 'adding cart item');
  }
});

// PATCH /cart/items/:lineId — update quantity (qty <= 0 removes the line).
cartRouter.patch('/items/:lineId', async (req, res) => {
  const lineId = String(req.params.lineId);
  if (!z.string().uuid().safeParse(lineId).success) {
    res.status(404).json({ error: 'Cart item not found' });
    return;
  }
  const parsed = updateQuantitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid quantity payload', details: parsed.error.issues });
    return;
  }
  const userId = req.user!.id;

  try {
    await db.transaction(async (tx) => {
      const cart = await getOrCreateCart(tx, userId);
      await requireOwnedLine(tx, cart.id, lineId);

      if (parsed.data.quantity <= 0) {
        await tx.delete(cartItems).where(eq(cartItems.id, lineId));
      } else {
        await tx
          .update(cartItems)
          .set({ quantity: parsed.data.quantity, updated_at: new Date() })
          .where(eq(cartItems.id, lineId));
      }
      await tx.update(carts).set({ updated_at: new Date() }).where(eq(carts.id, cart.id));
    });

    await loadAndRespond(res, userId);
  } catch (err) {
    handleCartError(res, err, 'updating cart item');
  }
});

// DELETE /cart/items/:lineId — remove one line.
cartRouter.delete('/items/:lineId', async (req, res) => {
  const lineId = String(req.params.lineId);
  if (!z.string().uuid().safeParse(lineId).success) {
    res.status(404).json({ error: 'Cart item not found' });
    return;
  }
  const userId = req.user!.id;

  try {
    await db.transaction(async (tx) => {
      const cart = await getOrCreateCart(tx, userId);
      await requireOwnedLine(tx, cart.id, lineId);
      await tx.delete(cartItems).where(eq(cartItems.id, lineId));
      await tx.update(carts).set({ updated_at: new Date() }).where(eq(carts.id, cart.id));
    });

    await loadAndRespond(res, userId);
  } catch (err) {
    handleCartError(res, err, 'removing cart item');
  }
});

// DELETE /cart — clear all items + discount.
cartRouter.delete('/', async (req, res) => {
  const userId = req.user!.id;
  try {
    await db.transaction(async (tx) => {
      const cart = await getOrCreateCart(tx, userId);
      await tx.delete(cartItems).where(eq(cartItems.cart_id, cart.id));
      await tx
        .update(carts)
        .set({
          discount_source: null,
          discount_ref_id: null,
          discount_label: null,
          discount_amount: null,
          updated_at: new Date(),
        })
        .where(eq(carts.id, cart.id));
    });

    await loadAndRespond(res, userId);
  } catch (err) {
    handleCartError(res, err, 'clearing cart');
  }
});

// PUT /cart/branch — set/switch the pickup branch. A real change hard-clears items +
// discount (mirrors the client setBranch); the same branch is a no-op.
cartRouter.put('/branch', async (req, res) => {
  const parsed = branchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid branch payload', details: parsed.error.issues });
    return;
  }
  const userId = req.user!.id;

  try {
    await db.transaction(async (tx) => {
      const cart = await getOrCreateCart(tx, userId);
      if (cart.branch_id === parsed.data.branchId) {
        return; // no-op: same branch (matches the client setBranch early-return)
      }

      const [branch] = await tx
        .select({ id: branches.id })
        .from(branches)
        .where(eq(branches.id, parsed.data.branchId));
      if (!branch) {
        throw new CartError(400, 'Branch not found');
      }

      await tx.delete(cartItems).where(eq(cartItems.cart_id, cart.id));
      await tx
        .update(carts)
        .set({
          branch_id: parsed.data.branchId,
          discount_source: null,
          discount_ref_id: null,
          discount_label: null,
          discount_amount: null,
          updated_at: new Date(),
        })
        .where(eq(carts.id, cart.id));
    });

    await loadAndRespond(res, userId);
  } catch (err) {
    handleCartError(res, err, 'switching branch');
  }
});

// POST /cart/discount — apply the single active discount (dumb store; the server does
// NOT re-derive the amount — POST /orders is the authority at placement, and never
// reads carts.discount_*).
cartRouter.post('/discount', async (req, res) => {
  const parsed = discountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid discount payload', details: parsed.error.issues });
    return;
  }
  const userId = req.user!.id;

  try {
    await db.transaction(async (tx) => {
      const cart = await getOrCreateCart(tx, userId);
      await tx
        .update(carts)
        .set({
          discount_source: parsed.data.source,
          discount_ref_id: parsed.data.refId,
          discount_label: parsed.data.label,
          discount_amount: centsToNumeric(parsed.data.amountCents),
          updated_at: new Date(),
        })
        .where(eq(carts.id, cart.id));
    });

    await loadAndRespond(res, userId);
  } catch (err) {
    handleCartError(res, err, 'applying discount');
  }
});

// DELETE /cart/discount — clear the active discount.
cartRouter.delete('/discount', async (req, res) => {
  const userId = req.user!.id;
  try {
    await db.transaction(async (tx) => {
      const cart = await getOrCreateCart(tx, userId);
      await tx
        .update(carts)
        .set({
          discount_source: null,
          discount_ref_id: null,
          discount_label: null,
          discount_amount: null,
          updated_at: new Date(),
        })
        .where(eq(carts.id, cart.id));
    });

    await loadAndRespond(res, userId);
  } catch (err) {
    handleCartError(res, err, 'clearing discount');
  }
});
