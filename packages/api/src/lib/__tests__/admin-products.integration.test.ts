import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the admin product-catalog surface (ADM-003, Phase 3) —
 * products, options, and per-branch availability — run against a real local
 * Postgres, mirroring `admin-branches.integration.test.ts`'s hermetic self-seeding.
 *
 * Requires a running Postgres reachable via DATABASE_URL with migrations applied:
 *   docker compose up -d           # (or the machine's native Postgres, see all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers validate-contract Test Gates:
 *   AC1 — [HARD] editing a product's base_price (or an option's price_delta) AFTER
 *         an order was placed MUST NOT mutate that order's historical
 *         order_items.unit_price/total_price snapshot rows. Known-Gap is BANNED.
 *   AC3 — product create/read/update/soft-delete; category_id FK validated
 *         (400 on invalid/inactive); base_price round-trips cents→numeric→cents.
 *   AC4 — option create/read/update/soft-delete; option_type enum validated;
 *         price_delta round-trips.
 *   AC5 — branch_product_availability upsert via onConflictDoUpdate is idempotent
 *         (no duplicate rows on repeated PATCH).
 *   AC6 — staff-role session → 403 on any /api/admin/products/* route.
 *   AC7 — soft-delete: deactivate sets the flag false; the row still exists.
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.VITEST = 'true';

type AuthModule = typeof import('../auth');
type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');
type IndexModule = typeof import('../../index');

let auth: AuthModule['auth'];
let db: DbModule['db'];
let schema: SchemaModule;
let app: IndexModule['app'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);

let adminCookies: string[];
let staffCookies: string[];
let customerCookies: string[];

async function signUpAndGetCookie(email: string, password: string): Promise<string[]> {
  await auth.api.signUpEmail({ body: { email, password, name: 'Test User' } });
  const res = await request(app)
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .set('Content-Type', 'application/json');
  const setCookie = res.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.map((c) => c.split(';')[0]!);
}

async function makeUser(
  roleValue: 'customer' | 'staff' | 'admin' | 'super_admin',
): Promise<{ email: string; cookies: string[]; id: string }> {
  const email = `${roleValue}-${unique()}@example.com`;
  const cookies = await signUpAndGetCookie(email, 'sup3r-secret-pw');
  if (roleValue !== 'customer') {
    await db.update(schema.users).set({ role: roleValue }).where(eq(schema.users.email, email));
  }
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  if (!row) throw new Error('Test setup: failed to read back created user');
  return { email, cookies, id: row.id };
}

/** Create an active category through the admin API, returning its id. */
async function seedCategory(overrides: Record<string, unknown> = {}): Promise<string> {
  const suffix = unique();
  const res = await request(app)
    .post('/api/admin/categories')
    .set('Cookie', adminCookies.join('; '))
    .send({ name: `Cat ${suffix}`, slug: `cat-${suffix}`, ...overrides })
    .set('Content-Type', 'application/json');
  expect(res.status).toBe(201);
  return res.body.category.id as string;
}

function productPayload(categoryId: string, overrides: Record<string, unknown> = {}) {
  const suffix = unique();
  return {
    categoryId,
    name: `Product ${suffix}`,
    slug: `product-${suffix}`,
    basePriceCents: 10000,
    ...overrides,
  };
}

function createProduct(categoryId: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/admin/products')
    .set('Cookie', adminCookies.join('; '))
    .send(productPayload(categoryId, overrides))
    .set('Content-Type', 'application/json');
}

/** Create an active, pickup-accepting branch through the admin API, returning its id. */
async function seedBranch(): Promise<string> {
  const suffix = unique();
  const res = await request(app)
    .post('/api/admin/branches')
    .set('Cookie', adminCookies.join('; '))
    .send({
      name: `Branch ${suffix}`,
      slug: `branch-${suffix}`,
      address: '123 Test St',
      latitude: 14.5,
      longitude: 120.9,
      phone: '+639170000000',
      openingHours: '08:00-20:00',
      isAcceptingPickup: true,
    })
    .set('Content-Type', 'application/json');
  expect(res.status).toBe(201);
  return res.body.branch.id as string;
}

function setAvailability(productId: string, branchId: string, isAvailable: boolean) {
  return request(app)
    .patch(`/api/admin/products/${productId}/availability/${branchId}`)
    .set('Cookie', adminCookies.join('; '))
    .send({ isAvailable })
    .set('Content-Type', 'application/json');
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../auth'));
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ app } = await import('../../index'));

  adminCookies = (await makeUser('admin')).cookies;
  staffCookies = (await makeUser('staff')).cookies;
  customerCookies = (await makeUser('customer')).cookies;
});

afterAll(() => {
  logSpy?.mockRestore();
});

// ─── AC1: snapshot-integrity (HARD, Known-Gap banned) ────────────────────────

describe('AC1 — order price snapshot integrity', () => {
  it('does not mutate order_items.unit_price/total_price when base_price is edited after placement', async () => {
    const categoryId = await seedCategory();
    const branchId = await seedBranch();
    const productRes = await createProduct(categoryId, { basePriceCents: 10000 });
    expect(productRes.status).toBe(201);
    const productId = productRes.body.product.id as string;

    // Make the product available at the branch (required to place an order).
    const availRes = await setAvailability(productId, branchId, true);
    expect(availRes.status).toBe(200);

    // Place an order as the customer — this snapshots the price at placement time.
    const orderRes = await request(app)
      .post('/orders')
      .set('Cookie', customerCookies.join('; '))
      .send({
        branchId,
        paymentMethod: 'pay_at_branch',
        items: [{ productId, quantity: 2, selectedOptions: [] }],
      })
      .set('Content-Type', 'application/json');
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.order.id as string;

    // Capture the historical snapshot rows.
    const before = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, orderId));
    expect(before).toHaveLength(1);
    expect(before[0]!.unit_price).toBe('100.00');
    expect(before[0]!.total_price).toBe('200.00');

    // Edit the product's base_price via the admin route (₱100 → ₱250).
    const patchRes = await request(app)
      .patch(`/api/admin/products/${productId}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ basePriceCents: 25000 })
      .set('Content-Type', 'application/json');
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.product.basePriceCents).toBe(25000);

    // The historical order_items snapshot MUST be unchanged.
    const after = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, orderId));
    expect(after).toHaveLength(1);
    expect(after[0]!.unit_price).toBe('100.00');
    expect(after[0]!.total_price).toBe('200.00');
    expect(after[0]!.unit_price).toBe(before[0]!.unit_price);
    expect(after[0]!.total_price).toBe(before[0]!.total_price);

    // And the live product row DID change (proves the edit really happened).
    const [product] = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.id, productId));
    expect(product!.base_price).toBe('250.00');
  });

  it('does not mutate a placed order when an option price_delta is edited afterward', async () => {
    const categoryId = await seedCategory();
    const branchId = await seedBranch();
    const productRes = await createProduct(categoryId, { basePriceCents: 10000 });
    const productId = productRes.body.product.id as string;
    await setAvailability(productId, branchId, true);

    // Create an option with a ₱20 delta.
    const optRes = await request(app)
      .post(`/api/admin/products/${productId}/options`)
      .set('Cookie', adminCookies.join('; '))
      .send({ optionType: 'size', name: 'Large', priceDeltaCents: 2000 })
      .set('Content-Type', 'application/json');
    expect(optRes.status).toBe(201);
    const optionId = optRes.body.option.id as string;

    // Place an order selecting the option: unit = 100 + 20 = 120, qty 1.
    const orderRes = await request(app)
      .post('/orders')
      .set('Cookie', customerCookies.join('; '))
      .send({
        branchId,
        paymentMethod: 'pay_at_branch',
        items: [{ productId, quantity: 1, selectedOptions: [{ optionId }] }],
      })
      .set('Content-Type', 'application/json');
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.order.id as string;

    const before = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, orderId));
    expect(before[0]!.unit_price).toBe('120.00');

    // Edit the option's price_delta (₱20 → ₱99).
    const patchRes = await request(app)
      .patch(`/api/admin/products/${productId}/options/${optionId}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ priceDeltaCents: 9900 })
      .set('Content-Type', 'application/json');
    expect(patchRes.status).toBe(200);

    const after = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, orderId));
    expect(after[0]!.unit_price).toBe('120.00');
    expect(after[0]!.total_price).toBe(before[0]!.total_price);
  });
});

// ─── AC3: product CRUD + FK validation + price round-trip ─────────────────────

describe('AC3 — product CRUD, category FK, price round-trip', () => {
  it('creates a product and round-trips base_price with no drift', async () => {
    const categoryId = await seedCategory();
    const res = await createProduct(categoryId, { basePriceCents: 12345 });
    expect(res.status).toBe(201);
    expect(res.body.product.basePriceCents).toBe(12345);
    expect(res.body.product.categoryId).toBe(categoryId);

    const [row] = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.id, res.body.product.id));
    expect(row!.base_price).toBe('123.45');

    // Read-back through the API round-trips to the exact cents value.
    const get = await request(app)
      .get(`/api/admin/products/${res.body.product.id}`)
      .set('Cookie', adminCookies.join('; '));
    expect(get.status).toBe(200);
    expect(get.body.product.basePriceCents).toBe(12345);
  });

  it('rejects a product create with a non-existent category_id (400)', async () => {
    const res = await createProduct('00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid or inactive category');
  });

  it('rejects a product create against an inactive category (400)', async () => {
    const categoryId = await seedCategory();
    await request(app)
      .patch(`/api/admin/categories/${categoryId}/deactivate`)
      .set('Cookie', adminCookies.join('; '));

    const res = await createProduct(categoryId);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid or inactive category');
  });

  it('updates only supplied fields and rejects a duplicate slug with 409', async () => {
    const categoryId = await seedCategory();
    const created = await createProduct(categoryId, { slug: `p-a-${unique()}` });
    const id = created.body.product.id as string;
    const originalName = created.body.product.name as string;

    const patch = await request(app)
      .patch(`/api/admin/products/${id}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ basePriceCents: 5000 })
      .set('Content-Type', 'application/json');
    expect(patch.status).toBe(200);
    expect(patch.body.product.basePriceCents).toBe(5000);
    expect(patch.body.product.name).toBe(originalName);

    const takenSlug = `p-taken-${unique()}`;
    await createProduct(categoryId, { slug: takenSlug });
    const collide = await request(app)
      .patch(`/api/admin/products/${id}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ slug: takenSlug })
      .set('Content-Type', 'application/json');
    expect(collide.status).toBe(409);
  });

  it('filters the product list by ?categoryId=', async () => {
    const catA = await seedCategory();
    const catB = await seedCategory();
    const a = await createProduct(catA);
    const b = await createProduct(catB);

    const res = await request(app)
      .get(`/api/admin/products?categoryId=${catA}`)
      .set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(200);
    const ids = (res.body.products as { id: string }[]).map((p) => p.id);
    expect(ids).toContain(a.body.product.id);
    expect(ids).not.toContain(b.body.product.id);
  });

  it('404s an unknown/malformed product id', async () => {
    const unknown = await request(app)
      .get('/api/admin/products/00000000-0000-0000-0000-000000000000')
      .set('Cookie', adminCookies.join('; '));
    expect(unknown.status).toBe(404);

    const malformed = await request(app)
      .get('/api/admin/products/not-a-uuid')
      .set('Cookie', adminCookies.join('; '));
    expect(malformed.status).toBe(404);
  });
});

// ─── AC4: product option CRUD + enum validation ──────────────────────────────

describe('AC4 — product option CRUD, enum validation, price_delta round-trip', () => {
  async function seedProduct(): Promise<string> {
    const categoryId = await seedCategory();
    const res = await createProduct(categoryId);
    return res.body.product.id as string;
  }

  it('creates/reads options and round-trips price_delta', async () => {
    const productId = await seedProduct();
    const create = await request(app)
      .post(`/api/admin/products/${productId}/options`)
      .set('Cookie', adminCookies.join('; '))
      .send({ optionType: 'add_on', name: 'Cheese', priceDeltaCents: 1550 })
      .set('Content-Type', 'application/json');
    expect(create.status).toBe(201);
    expect(create.body.option.priceDeltaCents).toBe(1550);
    expect(create.body.option.optionType).toBe('add_on');

    const list = await request(app)
      .get(`/api/admin/products/${productId}/options`)
      .set('Cookie', adminCookies.join('; '));
    expect(list.status).toBe(200);
    expect(list.body.options).toHaveLength(1);
    expect(list.body.options[0].priceDeltaCents).toBe(1550);
  });

  it('rejects an invalid option_type with 400 (server-side enum validation)', async () => {
    const productId = await seedProduct();
    const res = await request(app)
      .post(`/api/admin/products/${productId}/options`)
      .set('Cookie', adminCookies.join('; '))
      .send({ optionType: 'topping', name: 'Nope', priceDeltaCents: 0 })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  it('updates an option', async () => {
    const productId = await seedProduct();
    const create = await request(app)
      .post(`/api/admin/products/${productId}/options`)
      .set('Cookie', adminCookies.join('; '))
      .send({ optionType: 'flavor', name: 'Original' })
      .set('Content-Type', 'application/json');
    const optionId = create.body.option.id as string;

    const patch = await request(app)
      .patch(`/api/admin/products/${productId}/options/${optionId}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ name: 'Spicy', priceDeltaCents: 500 })
      .set('Content-Type', 'application/json');
    expect(patch.status).toBe(200);
    expect(patch.body.option.name).toBe('Spicy');
    expect(patch.body.option.priceDeltaCents).toBe(500);
  });
});

// ─── AC5: availability upsert idempotency ────────────────────────────────────

describe('AC5 — branch availability upsert (onConflictDoUpdate, idempotent)', () => {
  it('repeated PATCH upserts one row, never duplicates, and toggles value', async () => {
    const categoryId = await seedCategory();
    const branchId = await seedBranch();
    const productRes = await createProduct(categoryId);
    const productId = productRes.body.product.id as string;

    const first = await setAvailability(productId, branchId, true);
    expect(first.status).toBe(200);
    expect(first.body.availability.isAvailable).toBe(true);

    const second = await setAvailability(productId, branchId, true);
    expect(second.status).toBe(200);

    const third = await setAvailability(productId, branchId, false);
    expect(third.status).toBe(200);
    expect(third.body.availability.isAvailable).toBe(false);

    // Exactly ONE row for this branch+product pair (no duplicates from upserts).
    const rows = await db
      .select()
      .from(schema.branchProductAvailability)
      .where(
        and(
          eq(schema.branchProductAvailability.product_id, productId),
          eq(schema.branchProductAvailability.branch_id, branchId),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.is_available).toBe(false);
  });

  it('lists availability rows for a product', async () => {
    const categoryId = await seedCategory();
    const branchId = await seedBranch();
    const productRes = await createProduct(categoryId);
    const productId = productRes.body.product.id as string;
    await setAvailability(productId, branchId, true);

    const res = await request(app)
      .get(`/api/admin/products/${productId}/availability`)
      .set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.availability).toHaveLength(1);
    expect(res.body.availability[0].branchId).toBe(branchId);
  });

  it('404s an upsert against a non-existent branch', async () => {
    const categoryId = await seedCategory();
    const productRes = await createProduct(categoryId);
    const productId = productRes.body.product.id as string;
    const res = await setAvailability(productId, '00000000-0000-0000-0000-000000000000', true);
    expect(res.status).toBe(404);
  });
});

// ─── AC7: soft-delete for products and options ───────────────────────────────

describe('AC7 — soft-delete (no hard DELETE)', () => {
  it('soft-deactivates a product; the row survives', async () => {
    const categoryId = await seedCategory();
    const created = await createProduct(categoryId);
    const id = created.body.product.id as string;

    const res = await request(app)
      .patch(`/api/admin/products/${id}/deactivate`)
      .set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.product.isActive).toBe(false);

    const [row] = await db.select().from(schema.products).where(eq(schema.products.id, id));
    expect(row).toBeDefined();
    expect(row!.is_active).toBe(false);
  });

  it('soft-deactivates an option; the row survives', async () => {
    const categoryId = await seedCategory();
    const productRes = await createProduct(categoryId);
    const productId = productRes.body.product.id as string;
    const optRes = await request(app)
      .post(`/api/admin/products/${productId}/options`)
      .set('Cookie', adminCookies.join('; '))
      .send({ optionType: 'size', name: 'Small' })
      .set('Content-Type', 'application/json');
    const optionId = optRes.body.option.id as string;

    const res = await request(app)
      .patch(`/api/admin/products/${productId}/options/${optionId}/deactivate`)
      .set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.option.isActive).toBe(false);

    const [row] = await db
      .select()
      .from(schema.productOptions)
      .where(eq(schema.productOptions.id, optionId));
    expect(row).toBeDefined();
    expect(row!.is_active).toBe(false);
  });
});

// ─── AC6: requireAdmin guard ─────────────────────────────────────────────────

describe('AC6 — requireAdmin guard on /api/admin/products/*', () => {
  it('rejects an unauthenticated request with 403', async () => {
    const res = await request(app).get('/api/admin/products');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects a staff-role session on GET with 403 (proves requireAdmin, not requireStaff)', async () => {
    const res = await request(app)
      .get('/api/admin/products')
      .set('Cookie', staffCookies.join('; '));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects a staff-role session on POST with 403', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .set('Cookie', staffCookies.join('; '))
      .send({
        categoryId: '00000000-0000-0000-0000-000000000000',
        name: 'x',
        slug: 'x',
        basePriceCents: 1,
      })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(403);
  });
});
