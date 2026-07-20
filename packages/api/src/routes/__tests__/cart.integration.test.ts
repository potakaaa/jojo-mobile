/* eslint-disable @typescript-eslint/no-explicit-any -- fetch JSON bodies and the
   getSession stub are loosely typed at the test boundary; assertions narrow them. */
import type { AddressInfo } from 'node:net';

import { and, eq } from 'drizzle-orm';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the session-gated cart routes (CART-003, #99) — the
 * server-persisted per-user cart. Run against a real local Postgres (same DB as
 * `db:migrate`):
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Auth is stubbed at the `auth.api.getSession` seam (an `x-test-user` header selects
 * the caller), mirroring orders.test.ts, so the middleware + handler ownership paths
 * are exercised deterministically. All DB writes (carts, cart_items) are real.
 *
 * Covers the validate-contract Fully-Automated / Hybrid-automated-half gates:
 *   AC1  — cart survives a cacheless re-fetch (persisted, not in-memory)
 *   AC2/AC3 — two independent sessions for the same user see identical cart state
 *   AC4  — cross-user isolation (a user only ever sees their own cart)
 *   AC4-line — line-level ownership (another user's lineId → 403)
 *   AC5  — add / update-quantity / remove / clear each persist
 *   AC6  — branch switch hard-clears items + discount (real change) / no-op (same)
 *   AC7  — unavailable product flagged as a conflict, not silently kept
 *   AC8  — live price reflected on GET /cart after a product price change
 *   AC8-snapshot — a placed order's snapshot price is unchanged by a later edit
 *   AC9  — full add-to-cart → POST /orders round trip via the persisted cart
 *   line-merge — same product+options merges quantity; different options → new line
 *   no-phantom — a failed mutation leaves no phantom item
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';

type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');

let db: DbModule['db'];
let schema: SchemaModule;
let base: string;
let server: ReturnType<express.Express['listen']>;

const uid = () => Math.random().toString(36).slice(2, 10);

// Fixtures.
let userA: string;
let userB: string;
let branchId: string; // active, accepting pickup
let otherBranchId: string; // a second active branch (branch-switch tests)
let productId: string; // active, available at branchId, base 100.00
let sizeOptionId: string; // +20.00 option on productId
let product2Id: string; // active, available at branchId, base 50.00

async function req(
  method: string,
  path: string,
  opts: { user?: string; body?: unknown } = {},
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.user) headers['x-test-user'] = opts.user;
  const res = await fetch(base + path, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const getCart = (user: string) => req('GET', '/cart', { user });
const addItem = (user: string, body: unknown) => req('POST', '/cart/items', { user, body });

/** Reset both users' carts to empty before each test (hermetic per-test state). */
async function resetCarts(): Promise<void> {
  for (const userId of [userA, userB]) {
    const [cart] = await db.select().from(schema.carts).where(eq(schema.carts.user_id, userId));
    if (cart) {
      await db.delete(schema.cartItems).where(eq(schema.cartItems.cart_id, cart.id));
      await db
        .update(schema.carts)
        .set({
          branch_id: branchId,
          discount_source: null,
          discount_ref_id: null,
          discount_label: null,
          discount_amount: null,
        })
        .where(eq(schema.carts.id, cart.id));
    }
  }
}

/** Ensure a product is available (or not) at a branch (upsert the bpa row). */
async function setAvailability(pid: string, bid: string, isAvailable: boolean): Promise<void> {
  await db
    .insert(schema.branchProductAvailability)
    .values({ branch_id: bid, product_id: pid, is_available: isAvailable })
    .onConflictDoUpdate({
      target: [
        schema.branchProductAvailability.branch_id,
        schema.branchProductAvailability.product_id,
      ],
      set: { is_available: isAvailable },
    });
}

beforeAll(async () => {
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  const { cartRouter } = await import('../cart');
  const { ordersRouter } = await import('../orders');
  const { requireSession } = await import('../../middleware/require-session');
  const { auth } = await import('../../lib/auth');

  vi.spyOn(auth.api, 'getSession').mockImplementation((async ({ headers }: any) => {
    const id = headers.get('x-test-user');
    if (!id) return null;
    return { session: { id: `sess-${id}`, userId: id }, user: { id } };
  }) as any);

  const app = express();
  app.use(express.json());
  app.use('/cart', requireSession, cartRouter);
  app.use('/orders', ordersRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const suffix = uid();

  const [ua] = await db
    .insert(schema.users)
    .values({ name: 'Cart User A', email: `cart-a-${suffix}@example.com` })
    .returning();
  userA = ua!.id;
  const [ub] = await db
    .insert(schema.users)
    .values({ name: 'Cart User B', email: `cart-b-${suffix}@example.com` })
    .returning();
  userB = ub!.id;

  const [b1] = await db
    .insert(schema.branches)
    .values({
      name: `CartBranch ${suffix}`,
      slug: `cart-branch-${suffix}`,
      address: '1 St',
      latitude: '14.5',
      longitude: '120.9',
      phone: '+639170000010',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 20,
    })
    .returning();
  branchId = b1!.id;

  const [b2] = await db
    .insert(schema.branches)
    .values({
      name: `CartBranch2 ${suffix}`,
      slug: `cart-branch2-${suffix}`,
      address: '2 St',
      latitude: '14.6',
      longitude: '120.8',
      phone: '+639170000011',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 30,
    })
    .returning();
  otherBranchId = b2!.id;

  const [cat] = await db
    .insert(schema.categories)
    .values({ name: `Cat ${suffix}`, slug: `cat-${suffix}`, sort_order: 0 })
    .returning();
  const categoryId = cat!.id;

  const [p1] = await db
    .insert(schema.products)
    .values({
      category_id: categoryId,
      name: 'Loaded Fries',
      slug: `fries-${suffix}`,
      base_price: '100.00',
    })
    .returning();
  productId = p1!.id;

  const [opt] = await db
    .insert(schema.productOptions)
    .values({
      product_id: productId,
      option_type: 'size',
      name: 'Large',
      price_delta: '20.00',
    })
    .returning();
  sizeOptionId = opt!.id;

  const [p2] = await db
    .insert(schema.products)
    .values({
      category_id: categoryId,
      name: 'Classic Soda',
      slug: `soda-${suffix}`,
      base_price: '50.00',
    })
    .returning();
  product2Id = p2!.id;

  await setAvailability(productId, branchId, true);
  await setAvailability(product2Id, branchId, true);
  await setAvailability(productId, otherBranchId, true);
  await setAvailability(product2Id, otherBranchId, true);

  // Seed both carts pinned to branchId (matches the client's "add to current branch").
  for (const userId of [userA, userB]) {
    await db.insert(schema.carts).values({ user_id: userId, branch_id: branchId });
  }
});

beforeEach(async () => {
  await resetCarts();
  // Reset the mutable product/option prices + availability each test needs stable.
  await db
    .update(schema.products)
    .set({ base_price: '100.00' })
    .where(eq(schema.products.id, productId));
  await db
    .update(schema.products)
    .set({ is_active: true })
    .where(eq(schema.products.id, productId));
  await setAvailability(productId, branchId, true);
});

afterAll(async () => {
  server?.close();
});

describe('CART-003 — persisted cart routes', () => {
  it('AC1: an added item survives a cacheless re-fetch (server-persisted)', async () => {
    const added = await addItem(userA, { productId, quantity: 2, selectedOptions: [] });
    expect(added.status).toBe(200);

    const fresh = await getCart(userA);
    expect(fresh.status).toBe(200);
    expect(fresh.json.cart.items).toHaveLength(1);
    expect(fresh.json.cart.items[0].productId).toBe(productId);
    expect(fresh.json.cart.items[0].quantity).toBe(2);
    expect(fresh.json.cart.items[0].unitPriceCents).toBe(10000);
    expect(fresh.json.cart.subtotalCents).toBe(20000);
  });

  it('AC2/AC3: two independent sessions for the same user see identical cart state', async () => {
    await addItem(userA, { productId, quantity: 1, selectedOptions: [{ optionId: sizeOptionId }] });

    // A "different session" is just another request carrying the same user id.
    const session1 = await getCart(userA);
    const session2 = await getCart(userA);
    expect(session1.json.cart).toEqual(session2.json.cart);
    expect(session2.json.cart.items).toHaveLength(1);
    expect(session2.json.cart.items[0].unitPriceCents).toBe(12000); // 100 + 20
  });

  it('AC4: a user only ever sees their own cart (cross-user isolation)', async () => {
    await addItem(userA, { productId, quantity: 3, selectedOptions: [] });

    const bCart = await getCart(userB);
    expect(bCart.status).toBe(200);
    // B never sees A's item — B's cart is empty.
    expect(bCart.json.cart.items).toHaveLength(0);
    expect(bCart.json.cart.id).not.toBe(undefined);

    // Unauthenticated (no x-test-user) is rejected by requireSession.
    const anon = await req('GET', '/cart');
    expect(anon.status).toBe(401);
  });

  it("AC4-line: PATCH/DELETE on another user's lineId returns 403, never their data", async () => {
    const added = await addItem(userA, { productId, quantity: 1, selectedOptions: [] });
    const lineId = added.json.cart.items[0].lineId as string;

    const patched = await req('PATCH', `/cart/items/${lineId}`, {
      user: userB,
      body: { quantity: 9 },
    });
    expect(patched.status).toBe(403);

    const deleted = await req('DELETE', `/cart/items/${lineId}`, { user: userB });
    expect(deleted.status).toBe(403);

    // A's line is untouched by B's attempts.
    const aCart = await getCart(userA);
    expect(aCart.json.cart.items).toHaveLength(1);
    expect(aCart.json.cart.items[0].quantity).toBe(1);
  });

  it('AC4-line: a nonexistent lineId returns 404', async () => {
    const res = await req('PATCH', `/cart/items/${crypto.randomUUID()}`, {
      user: userA,
      body: { quantity: 2 },
    });
    expect(res.status).toBe(404);
  });

  it('AC5: add / update-quantity / remove / clear each persist', async () => {
    // add
    let cart = (await addItem(userA, { productId, quantity: 1, selectedOptions: [] })).json.cart;
    let lineId = cart.items[0].lineId as string;
    expect((await getCart(userA)).json.cart.items[0].quantity).toBe(1);

    // update-quantity
    await req('PATCH', `/cart/items/${lineId}`, { user: userA, body: { quantity: 5 } });
    expect((await getCart(userA)).json.cart.items[0].quantity).toBe(5);

    // update-quantity to 0 removes the line
    await req('PATCH', `/cart/items/${lineId}`, { user: userA, body: { quantity: 0 } });
    expect((await getCart(userA)).json.cart.items).toHaveLength(0);

    // add again then remove explicitly
    cart = (await addItem(userA, { productId, quantity: 2, selectedOptions: [] })).json.cart;
    lineId = cart.items[0].lineId as string;
    await req('DELETE', `/cart/items/${lineId}`, { user: userA });
    expect((await getCart(userA)).json.cart.items).toHaveLength(0);

    // add two lines then clear all
    await addItem(userA, { productId, quantity: 1, selectedOptions: [] });
    await addItem(userA, { productId: product2Id, quantity: 1, selectedOptions: [] });
    expect((await getCart(userA)).json.cart.items).toHaveLength(2);
    const cleared = await req('DELETE', '/cart', { user: userA });
    expect(cleared.status).toBe(200);
    expect(cleared.json.cart.items).toHaveLength(0);
  });

  it('AC6: switching branch hard-clears items + discount; same branch is a no-op', async () => {
    await addItem(userA, { productId, quantity: 2, selectedOptions: [] });
    await req('POST', '/cart/discount', {
      user: userA,
      body: { source: 'coupon', refId: crypto.randomUUID(), label: '10% OFF', amountCents: 500 },
    });
    let cart = (await getCart(userA)).json.cart;
    expect(cart.items).toHaveLength(1);
    expect(cart.appliedDiscount).toBeDefined();

    // No-op: same branch keeps items + discount.
    const sameBranch = await req('PUT', '/cart/branch', { user: userA, body: { branchId } });
    expect(sameBranch.status).toBe(200);
    expect(sameBranch.json.cart.items).toHaveLength(1);
    expect(sameBranch.json.cart.appliedDiscount).toBeDefined();

    // Real change: items + discount cleared.
    const changed = await req('PUT', '/cart/branch', {
      user: userA,
      body: { branchId: otherBranchId },
    });
    expect(changed.status).toBe(200);
    expect(changed.json.cart.pickupBranchId).toBe(otherBranchId);
    expect(changed.json.cart.items).toHaveLength(0);
    expect(changed.json.cart.appliedDiscount).toBeUndefined();

    // Persisted (fresh fetch confirms).
    cart = (await getCart(userA)).json.cart;
    expect(cart.pickupBranchId).toBe(otherBranchId);
    expect(cart.items).toHaveLength(0);
  });

  it('AC7: an item whose product becomes unavailable is flagged as a conflict', async () => {
    await addItem(userA, { productId, quantity: 1, selectedOptions: [] });

    // Product goes unavailable at the branch.
    await setAvailability(productId, branchId, false);

    const cart = (await getCart(userA)).json.cart;
    expect(cart.items).toHaveLength(1); // not silently dropped
    expect(cart.items[0].conflict).toEqual({ reason: 'unavailable' });
  });

  it('AC8: GET /cart reflects the live price after a product price change', async () => {
    await addItem(userA, { productId, quantity: 2, selectedOptions: [] });
    // Snapshot was 100.00 → 10000c.
    expect((await getCart(userA)).json.cart.items[0].unitPriceCents).toBe(10000);

    // Price rises to 150.00.
    await db
      .update(schema.products)
      .set({ base_price: '150.00' })
      .where(eq(schema.products.id, productId));

    const cart = (await getCart(userA)).json.cart;
    expect(cart.items[0].unitPriceCents).toBe(15000); // live price
    expect(cart.items[0].conflict).toEqual({ reason: 'price_changed' });
    expect(cart.subtotalCents).toBe(30000); // 150 * 2
  });

  it('AC8-snapshot: a placed order keeps its snapshot price after a later product edit', async () => {
    // Build the cart, then place an order from the same items[] the client would send.
    await addItem(userA, { productId, quantity: 2, selectedOptions: [] });

    const orderRes = await req('POST', '/orders', {
      user: userA,
      body: {
        branchId,
        paymentMethod: 'pay_at_branch',
        items: [{ productId, quantity: 2, selectedOptions: [] }],
      },
    });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.json.order.id as string;

    const before = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, orderId));
    expect(before[0]!.unit_price).toBe('100.00');
    expect(before[0]!.total_price).toBe('200.00');

    // Product price changes AFTER placement.
    await db
      .update(schema.products)
      .set({ base_price: '250.00' })
      .where(eq(schema.products.id, productId));

    const after = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, orderId));
    // Historical snapshot MUST be unchanged.
    expect(after[0]!.unit_price).toBe('100.00');
    expect(after[0]!.total_price).toBe('200.00');
    // Proof the edit really happened.
    const [product] = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.id, productId));
    expect(product!.base_price).toBe('250.00');

    // And the live cart DOES reflect the new price (cart vs order divergence).
    const cart = (await getCart(userA)).json.cart;
    expect(cart.items[0].unitPriceCents).toBe(25000);
  });

  it('AC9: full add-to-cart → POST /orders round trip yields a correct order', async () => {
    await addItem(userA, { productId, quantity: 1, selectedOptions: [{ optionId: sizeOptionId }] });
    await addItem(userA, { productId: product2Id, quantity: 3, selectedOptions: [] });

    const cart = (await getCart(userA)).json.cart;
    // 120 (100+20) + 3*50 = 120 + 150 = 270.00 → 27000c.
    expect(cart.subtotalCents).toBe(27000);

    // The client assembles items[] from its (now server-backed) cart.
    const items = cart.items.map((it: any) => ({
      productId: it.productId,
      quantity: it.quantity,
      selectedOptions: it.selectedOptions.map((o: any) => ({ optionId: o.optionId })),
    }));
    const orderRes = await req('POST', '/orders', {
      user: userA,
      body: { branchId, paymentMethod: 'pay_at_branch', items },
    });
    expect(orderRes.status).toBe(201);
    expect(orderRes.json.order.subtotalCents).toBe(27000);
    expect(orderRes.json.order.totalCents).toBe(27000);
    expect(orderRes.json.order.items).toHaveLength(2);
  });

  it('line-merge: same product+options merges quantity; different options make a new line', async () => {
    // Two adds, identical product + no options → one merged line.
    await addItem(userA, { productId, quantity: 1, selectedOptions: [] });
    await addItem(userA, { productId, quantity: 2, selectedOptions: [] });
    let cart = (await getCart(userA)).json.cart;
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(3);

    // Same product WITH an option → distinct new line.
    await addItem(userA, { productId, quantity: 1, selectedOptions: [{ optionId: sizeOptionId }] });
    cart = (await getCart(userA)).json.cart;
    expect(cart.items).toHaveLength(2);
  });

  it('no-phantom: a failed add (invalid option) leaves no phantom item', async () => {
    // Seed one valid line.
    await addItem(userA, { productId, quantity: 1, selectedOptions: [] });
    expect((await getCart(userA)).json.cart.items).toHaveLength(1);

    // A bad option id (does not belong to the product) → 400, transaction rolls back.
    const bad = await addItem(userA, {
      productId,
      quantity: 1,
      selectedOptions: [{ optionId: crypto.randomUUID() }],
    });
    expect(bad.status).toBe(400);

    // Still exactly one line — no phantom partial state.
    expect((await getCart(userA)).json.cart.items).toHaveLength(1);
  });

  it('POST /cart/items ignores any client-supplied price (server always re-prices)', async () => {
    // Even if a caller sends a bogus unitPriceCents, the server prices from the DB.
    const added = await addItem(userA, {
      productId,
      quantity: 1,
      selectedOptions: [],
      unitPriceCents: 1,
      price: 1,
    } as any);
    expect(added.status).toBe(200);
    expect(added.json.cart.items[0].unitPriceCents).toBe(10000);
  });

  it('applies and clears a discount (dumb store)', async () => {
    await addItem(userA, { productId, quantity: 1, selectedOptions: [] });
    const refId = crypto.randomUUID();
    const applied = await req('POST', '/cart/discount', {
      user: userA,
      body: { source: 'deal', refId, label: '₱5 OFF', amountCents: 500 },
    });
    expect(applied.status).toBe(200);
    expect(applied.json.cart.appliedDiscount).toEqual({
      source: 'deal',
      refId,
      label: '₱5 OFF',
      amountCents: 500,
    });
    expect(applied.json.cart.discountTotalCents).toBe(500);
    expect(applied.json.cart.totalCents).toBe(9500);

    const cleared = await req('DELETE', '/cart/discount', { user: userA });
    expect(cleared.status).toBe(200);
    expect(cleared.json.cart.appliedDiscount).toBeUndefined();
    expect(cleared.json.cart.discountTotalCents).toBe(0);
  });
});
