import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the admin deals surface (ADM-004 — deals-as-products) —
 * is_deal=true products + the `deal_components` junction — run against a real
 * local Postgres, mirroring `admin-products.integration.test.ts`'s hermetic
 * self-seeding (`makeUser(role)`).
 *
 * Requires a running Postgres reachable via DATABASE_URL with migrations applied:
 *   docker compose up -d           # (or the machine's native Postgres, see all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers validate-contract Test Gates AC1-AC11 (AC12 is Agent-Probe UI, no runner):
 *   AC1  — migration 0007 additive: is_deal defaults false, no regular row mutated
 *   AC2  — create deal-product (isDeal true), server-pinned Deals category → 201
 *   AC3  — attach component + quantity; duplicate attach → 409
 *   AC4  — self-reference → 400; deal-of-deals (component is_deal=true) → 400
 *   AC5  — detach component → 204; non-attached pair → 404
 *   AC6  — staff/customer roles → 403 on all /api/admin/deals/* write routes
 *   AC7  — GET /branches/:id/menu excludes deals by default; ?isDeal=true = deals only
 *   AC8  — admin products list excludes deals by default; admin deals list = deals only
 *   AC9  — [HARD] base_price edit after order placement never mutates order_items snapshot
 *   AC10 — a deal-product is orderable via normal POST /orders (no is_deal rejection)
 *   AC11 — staff can toggle a deal-product's per-branch availability like any product
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

// ── Regular-product + category + branch helpers (for components / ordering) ──
async function seedCategory(): Promise<string> {
  const suffix = unique();
  const res = await request(app)
    .post('/api/admin/categories')
    .set('Cookie', adminCookies.join('; '))
    .send({ name: `Cat ${suffix}`, slug: `cat-${suffix}` })
    .set('Content-Type', 'application/json');
  expect(res.status).toBe(201);
  return res.body.category.id as string;
}

async function seedRegularProduct(overrides: Record<string, unknown> = {}): Promise<string> {
  const categoryId = await seedCategory();
  const suffix = unique();
  const res = await request(app)
    .post('/api/admin/products')
    .set('Cookie', adminCookies.join('; '))
    .send({
      categoryId,
      name: `Product ${suffix}`,
      slug: `product-${suffix}`,
      basePriceCents: 10000,
      ...overrides,
    })
    .set('Content-Type', 'application/json');
  expect(res.status).toBe(201);
  return res.body.product.id as string;
}

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

/** Admin availability upsert — works for any product (regular or deal). */
function setAvailability(productId: string, branchId: string, isAvailable: boolean) {
  return request(app)
    .patch(`/api/admin/products/${productId}/availability/${branchId}`)
    .set('Cookie', adminCookies.join('; '))
    .send({ isAvailable })
    .set('Content-Type', 'application/json');
}

// ── Deal payload + create helper ──
function dealPayload(overrides: Record<string, unknown> = {}) {
  const suffix = unique();
  return {
    name: `Deal ${suffix}`,
    slug: `deal-${suffix}`,
    basePriceCents: 15000,
    ...overrides,
  };
}

function createDeal(overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/admin/deals')
    .set('Cookie', adminCookies.join('; '))
    .send(dealPayload(overrides))
    .set('Content-Type', 'application/json');
}

async function seedDeal(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await createDeal(overrides);
  expect(res.status).toBe(201);
  return res.body.deal.id as string;
}

function attachComponent(dealId: string, componentProductId: string, quantity?: number) {
  return request(app)
    .post(`/api/admin/deals/${dealId}/components`)
    .set('Cookie', adminCookies.join('; '))
    .send(quantity === undefined ? { componentProductId } : { componentProductId, quantity })
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

// ─── AC1: migration 0007 additive ────────────────────────────────────────────

describe('AC1 — migration 0007 adds is_deal defaulting false without mutating existing rows', () => {
  it('a regular product created via the admin API is is_deal=false', async () => {
    const productId = await seedRegularProduct();

    const [row] = await db.select().from(schema.products).where(eq(schema.products.id, productId));
    expect(row!.is_deal).toBe(false);

    const detail = await request(app)
      .get(`/api/admin/products/${productId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(detail.status).toBe(200);
    expect(detail.body.product.isDeal).toBe(false);
  });

  it('creating a deal does not flip any existing regular product to is_deal=true', async () => {
    const regularId = await seedRegularProduct();
    await seedDeal();

    const [row] = await db.select().from(schema.products).where(eq(schema.products.id, regularId));
    expect(row!.is_deal).toBe(false);
  });
});

// ─── AC2: create deal-product ────────────────────────────────────────────────

describe('AC2 — create deal-product (isDeal true), server-pinned Deals category', () => {
  it('creates a deal-product with isDeal true and returns 201', async () => {
    const res = await createDeal({ basePriceCents: 19900 });
    expect(res.status).toBe(201);
    const deal = res.body.deal;
    expect(deal.id).toBeTruthy();
    expect(deal.isDeal).toBe(true);
    expect(deal.basePriceCents).toBe(19900);
    expect(deal.isActive).toBe(true);
    expect(deal.components).toEqual([]);
  });

  it('server-pins the deal to the reserved "deals" category (admin never supplies it)', async () => {
    const dealId = await seedDeal();
    const detail = await request(app)
      .get(`/api/admin/deals/${dealId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(detail.status).toBe(200);

    const [category] = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.id, detail.body.deal.categoryId));
    expect(category!.slug).toBe('deals');
  });

  it('reactivates the reserved Deals category if it was deactivated (menu filters by is_active)', async () => {
    // Seed once so the category exists, then deactivate it directly.
    await seedDeal();
    await db
      .update(schema.categories)
      .set({ is_active: false })
      .where(eq(schema.categories.slug, 'deals'));

    // Next create must self-heal the category back to active.
    const res = await createDeal();
    expect(res.status).toBe(201);

    const [category] = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.slug, 'deals'));
    expect(category!.is_active).toBe(true);
  });

  it('rejects a create with a missing name (400, Zod before Postgres)', async () => {
    const res = await request(app)
      .post('/api/admin/deals')
      .set('Cookie', adminCookies.join('; '))
      .send({ slug: `deal-${unique()}`, basePriceCents: 1000 })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate slug with 409', async () => {
    const slug = `deal-${unique()}`;
    const first = await createDeal({ slug });
    expect(first.status).toBe(201);
    const dup = await createDeal({ slug });
    expect(dup.status).toBe(409);
  });

  it('PATCH updates a deal field and round-trips base_price', async () => {
    const dealId = await seedDeal();
    const res = await request(app)
      .patch(`/api/admin/deals/${dealId}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ name: 'Renamed Deal', basePriceCents: 12345 })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.deal.name).toBe('Renamed Deal');
    expect(res.body.deal.basePriceCents).toBe(12345);
  });

  it('PATCH on a regular product id (not a deal) returns 404', async () => {
    const regularId = await seedRegularProduct();
    const res = await request(app)
      .patch(`/api/admin/deals/${regularId}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ name: 'x' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });

  it('GET /:id on a regular product id (not a deal) returns 404', async () => {
    const regularId = await seedRegularProduct();
    const res = await request(app)
      .get(`/api/admin/deals/${regularId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(404);
  });
});

// ─── AC3: component attach + quantity + duplicate reject ──────────────────────

describe('AC3 — attach a component with quantity; duplicate attach → 409', () => {
  it('attaches a component (writes deal_components) with quantity and rejects a duplicate with 409', async () => {
    const dealId = await seedDeal();
    const componentId = await seedRegularProduct();

    const first = await attachComponent(dealId, componentId, 3);
    expect(first.status).toBe(201);
    expect(first.body.attached).toBe(true);

    const rows = await db
      .select()
      .from(schema.dealComponents)
      .where(
        and(
          eq(schema.dealComponents.deal_product_id, dealId),
          eq(schema.dealComponents.component_product_id, componentId),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quantity).toBe(3);

    const dup = await attachComponent(dealId, componentId, 1);
    expect(dup.status).toBe(409);

    // Detail response surfaces the component with its name + quantity.
    const detail = await request(app)
      .get(`/api/admin/deals/${dealId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(detail.status).toBe(200);
    const comp = (
      detail.body.deal.components as { componentProductId: string; quantity: number }[]
    ).find((c) => c.componentProductId === componentId);
    expect(comp).toBeTruthy();
    expect(comp!.quantity).toBe(3);
  });

  it('defaults quantity to 1 when omitted', async () => {
    const dealId = await seedDeal();
    const componentId = await seedRegularProduct();
    const res = await attachComponent(dealId, componentId);
    expect(res.status).toBe(201);

    const [row] = await db
      .select()
      .from(schema.dealComponents)
      .where(eq(schema.dealComponents.deal_product_id, dealId));
    expect(row!.quantity).toBe(1);
  });

  it('404s attaching a non-existent component product', async () => {
    const dealId = await seedDeal();
    const res = await attachComponent(dealId, '00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('404s attaching to a non-existent deal', async () => {
    const componentId = await seedRegularProduct();
    const res = await attachComponent('00000000-0000-0000-0000-000000000000', componentId);
    expect(res.status).toBe(404);
  });
});

// ─── AC4: self-reference + deal-of-deals reject ──────────────────────────────

describe('AC4 — self-reference and deal-of-deals attachment rejected with 400', () => {
  it('rejects a self-reference (component === deal) with 400', async () => {
    const dealId = await seedDeal();
    const res = await attachComponent(dealId, dealId);
    expect(res.status).toBe(400);
  });

  it('rejects attaching a component whose product is itself a deal (deal-of-deals) with 400', async () => {
    const dealId = await seedDeal();
    const otherDealId = await seedDeal();
    const res = await attachComponent(dealId, otherDealId);
    expect(res.status).toBe(400);

    // Nothing was written.
    const rows = await db
      .select()
      .from(schema.dealComponents)
      .where(eq(schema.dealComponents.deal_product_id, dealId));
    expect(rows).toHaveLength(0);
  });
});

// ─── AC5: detach + not-found ─────────────────────────────────────────────────

describe('AC5 — detach a component (204) + 404 on a non-attached pair', () => {
  it('detaches an attached component with 204 and 404s a second detach', async () => {
    const dealId = await seedDeal();
    const componentId = await seedRegularProduct();
    await attachComponent(dealId, componentId);

    const del = await request(app)
      .delete(`/api/admin/deals/${dealId}/components/${componentId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(del.status).toBe(204);

    const rows = await db
      .select()
      .from(schema.dealComponents)
      .where(
        and(
          eq(schema.dealComponents.deal_product_id, dealId),
          eq(schema.dealComponents.component_product_id, componentId),
        ),
      );
    expect(rows).toHaveLength(0);

    const again = await request(app)
      .delete(`/api/admin/deals/${dealId}/components/${componentId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(again.status).toBe(404);
  });
});

// ─── AC6: requireAdmin authz ─────────────────────────────────────────────────

describe('AC6 — requireAdmin guard on /api/admin/deals/*', () => {
  it('rejects an unauthenticated request with 403', async () => {
    const res = await request(app).get('/api/admin/deals');
    expect(res.status).toBe(403);
  });

  it('rejects a staff-role session on GET with 403', async () => {
    const res = await request(app).get('/api/admin/deals').set('Cookie', staffCookies.join('; '));
    expect(res.status).toBe(403);
  });

  it('rejects a staff-role session on POST create with 403', async () => {
    const res = await request(app)
      .post('/api/admin/deals')
      .set('Cookie', staffCookies.join('; '))
      .send(dealPayload())
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(403);
  });

  it('rejects a customer-role session on PATCH with 403', async () => {
    const dealId = await seedDeal();
    const res = await request(app)
      .patch(`/api/admin/deals/${dealId}`)
      .set('Cookie', customerCookies.join('; '))
      .send({ name: 'x' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(403);
  });

  it('rejects a staff-role session on component attach with 403', async () => {
    const dealId = await seedDeal();
    const res = await request(app)
      .post(`/api/admin/deals/${dealId}/components`)
      .set('Cookie', staffCookies.join('; '))
      .send({ componentProductId: '00000000-0000-0000-0000-000000000000' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(403);
  });
});

// ─── AC7: menu ?isDeal filter both directions ────────────────────────────────

describe('AC7 — GET /branches/:id/menu excludes deals by default; ?isDeal=true returns only deals', () => {
  it('default menu excludes deal-products; ?isDeal=true returns only deal-products', async () => {
    const branchId = await seedBranch();

    // A regular product and a deal-product, both available at the branch.
    const regularId = await seedRegularProduct();
    await setAvailability(regularId, branchId, true);

    const dealRes = await createDeal();
    const dealId = dealRes.body.deal.id as string;
    await setAvailability(dealId, branchId, true);

    // Default menu: regular product present, deal absent.
    const menu = await request(app).get(`/branches/${branchId}/menu`);
    expect(menu.status).toBe(200);
    const menuProductIds = (menu.body.categories as { products: { id: string }[] }[]).flatMap((c) =>
      c.products.map((p) => p.id),
    );
    expect(menuProductIds).toContain(regularId);
    expect(menuProductIds).not.toContain(dealId);

    // ?isDeal=true: deal present, regular absent.
    const dealsMenu = await request(app).get(`/branches/${branchId}/menu?isDeal=true`);
    expect(dealsMenu.status).toBe(200);
    const dealsMenuIds = (dealsMenu.body.categories as { products: { id: string }[] }[]).flatMap(
      (c) => c.products.map((p) => p.id),
    );
    expect(dealsMenuIds).toContain(dealId);
    expect(dealsMenuIds).not.toContain(regularId);
  });
});

// ─── AC8: admin products/deals lists mutually exclusive ──────────────────────

describe('AC8 — admin products list excludes deals by default; deals list is deals-only', () => {
  it('products list excludes deals by default and includes them only with ?isDeal=true', async () => {
    const regularId = await seedRegularProduct();
    const dealId = await seedDeal();

    const products = await request(app)
      .get('/api/admin/products')
      .set('Cookie', adminCookies.join('; '));
    expect(products.status).toBe(200);
    const productIds = (products.body.products as { id: string }[]).map((p) => p.id);
    expect(productIds).toContain(regularId);
    expect(productIds).not.toContain(dealId);

    const productsAsDeals = await request(app)
      .get('/api/admin/products?isDeal=true')
      .set('Cookie', adminCookies.join('; '));
    const asDealIds = (productsAsDeals.body.products as { id: string }[]).map((p) => p.id);
    expect(asDealIds).toContain(dealId);
    expect(asDealIds).not.toContain(regularId);
  });

  it('deals list returns only deal-products (never a regular product)', async () => {
    const regularId = await seedRegularProduct();
    const dealId = await seedDeal();

    const deals = await request(app).get('/api/admin/deals').set('Cookie', adminCookies.join('; '));
    expect(deals.status).toBe(200);
    const dealIds = (deals.body.deals as { id: string; isDeal: boolean }[]).map((d) => d.id);
    expect(dealIds).toContain(dealId);
    expect(dealIds).not.toContain(regularId);
    expect((deals.body.deals as { isDeal: boolean }[]).every((d) => d.isDeal === true)).toBe(true);
  });

  it('deals ?isActive=false returns only inactive deals', async () => {
    const activeId = await seedDeal();
    const toDeactivate = await seedDeal();
    await request(app)
      .patch(`/api/admin/deals/${toDeactivate}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ isActive: false })
      .set('Content-Type', 'application/json');

    const res = await request(app)
      .get('/api/admin/deals?isActive=false')
      .set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(200);
    const ids = (res.body.deals as { id: string }[]).map((d) => d.id);
    expect(ids).toContain(toDeactivate);
    expect(ids).not.toContain(activeId);
  });
});

// ─── AC9: snapshot integrity (HARD, Known-Gap banned) ────────────────────────

describe('AC9 — editing a deal-product base_price after order placement never mutates order_items snapshot', () => {
  it('does not mutate order_items.unit_price/total_price when a deal-product base_price is edited after placement', async () => {
    const branchId = await seedBranch();
    const dealRes = await createDeal({ basePriceCents: 10000 });
    const dealId = dealRes.body.deal.id as string;
    await setAvailability(dealId, branchId, true);

    // Place an order containing the deal-product (snapshots price at placement).
    const orderRes = await request(app)
      .post('/orders')
      .set('Cookie', customerCookies.join('; '))
      .send({
        branchId,
        paymentMethod: 'pay_at_branch',
        items: [{ productId: dealId, quantity: 2, selectedOptions: [] }],
      })
      .set('Content-Type', 'application/json');
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.order.id as string;

    const before = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, orderId));
    expect(before).toHaveLength(1);
    expect(before[0]!.unit_price).toBe('100.00');
    expect(before[0]!.total_price).toBe('200.00');

    // Edit the deal-product's base_price via the admin deals route (₱100 → ₱250).
    const patchRes = await request(app)
      .patch(`/api/admin/deals/${dealId}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ basePriceCents: 25000 })
      .set('Content-Type', 'application/json');
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.deal.basePriceCents).toBe(25000);

    // Historical snapshot MUST be unchanged.
    const after = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, orderId));
    expect(after).toHaveLength(1);
    expect(after[0]!.unit_price).toBe('100.00');
    expect(after[0]!.total_price).toBe('200.00');
    expect(after[0]!.unit_price).toBe(before[0]!.unit_price);
    expect(after[0]!.total_price).toBe(before[0]!.total_price);

    // The live deal-product row DID change (proves the edit really happened).
    const [product] = await db.select().from(schema.products).where(eq(schema.products.id, dealId));
    expect(product!.base_price).toBe('250.00');
  });
});

// ─── AC10: deal-product orderable via normal checkout ────────────────────────

describe('AC10 — a deal-product is orderable via normal POST /orders with no is_deal rejection', () => {
  it('places an order containing a deal-product like any other product', async () => {
    const branchId = await seedBranch();
    const dealRes = await createDeal({ basePriceCents: 5000 });
    const dealId = dealRes.body.deal.id as string;
    await setAvailability(dealId, branchId, true);

    const orderRes = await request(app)
      .post('/orders')
      .set('Cookie', customerCookies.join('; '))
      .send({
        branchId,
        paymentMethod: 'pay_at_branch',
        items: [{ productId: dealId, quantity: 1, selectedOptions: [] }],
      })
      .set('Content-Type', 'application/json');
    expect(orderRes.status).toBe(201);
    expect(orderRes.body.order.items).toHaveLength(1);
    expect(orderRes.body.order.items[0].productId).toBe(dealId);
    expect(orderRes.body.order.totalCents).toBe(5000);
  });
});

// ─── AC11: staff can toggle a deal-product's availability ─────────────────────

describe('AC11 — staff can toggle a deal-product per-branch availability like any product', () => {
  it('lists the deal-product for staff and toggles its availability with 200', async () => {
    const branchId = await seedBranch();
    const branchStaff = await makeUser('staff');
    await db
      .update(schema.users)
      .set({ assignedBranchId: branchId })
      .where(eq(schema.users.id, branchStaff.id));

    const dealRes = await createDeal();
    const dealId = dealRes.body.deal.id as string;

    // Staff product list includes the deal-product (is_deal-blind, as required).
    const list = await request(app)
      .get('/api/staff/products')
      .set('Cookie', branchStaff.cookies.join('; '));
    expect(list.status).toBe(200);
    const staffProductIds = (list.body.products as { id: string }[]).map((p) => p.id);
    expect(staffProductIds).toContain(dealId);

    // Staff can toggle its per-branch availability.
    const toggle = await request(app)
      .patch(`/api/staff/products/${dealId}/availability`)
      .set('Cookie', branchStaff.cookies.join('; '))
      .send({ isAvailable: true })
      .set('Content-Type', 'application/json');
    expect(toggle.status).toBe(200);

    const [row] = await db
      .select()
      .from(schema.branchProductAvailability)
      .where(
        and(
          eq(schema.branchProductAvailability.branch_id, branchId),
          eq(schema.branchProductAvailability.product_id, dealId),
        ),
      );
    expect(row!.is_available).toBe(true);
  });
});

// ─── Enhancement E1: transactional create-with-components ─────────────────────
//
// Covers validate-contract E1 Test Gates AC-E1..AC-E5, AC-E7 (AC-E6 is Agent-Probe
// wizard UI, no runner). Exercises the OPTIONAL `components` field on
// `POST /api/admin/deals` — the deal-product and all `deal_components` rows are
// written in one transaction; any failure rolls back the whole create (no orphan).

function createDealWith(
  components: { productId: string; quantity: number }[],
  overrides: Record<string, unknown> = {},
) {
  return request(app)
    .post('/api/admin/deals')
    .set('Cookie', adminCookies.join('; '))
    .send(dealPayload({ components, ...overrides }))
    .set('Content-Type', 'application/json');
}

describe('AC-E1 — should create a deal-product and all deal_components rows atomically in one transaction', () => {
  it('creates the is_deal product AND every component row, and returns them in the response', async () => {
    const c1 = await seedRegularProduct();
    const c2 = await seedRegularProduct();

    const res = await createDealWith([
      { productId: c1, quantity: 2 },
      { productId: c2, quantity: 1 },
    ]);
    expect(res.status).toBe(201);

    const dealId = res.body.deal.id as string;
    expect(res.body.deal.isDeal).toBe(true);

    // The response carries the just-attached components (not `[]`).
    const respComponentIds = (res.body.deal.components as { componentProductId: string }[]).map(
      (c) => c.componentProductId,
    );
    expect(respComponentIds).toContain(c1);
    expect(respComponentIds).toContain(c2);

    // All deal_components rows exist with the supplied quantities.
    const rows = await db
      .select()
      .from(schema.dealComponents)
      .where(eq(schema.dealComponents.deal_product_id, dealId));
    expect(rows).toHaveLength(2);
    const qtyById = new Map(rows.map((r) => [r.component_product_id, r.quantity]));
    expect(qtyById.get(c1)).toBe(2);
    expect(qtyById.get(c2)).toBe(1);
  });
});

describe('AC-E2 — should roll back the entire create (zero orphan product row) when one components entry is invalid', () => {
  it('rolls back when one component productId does not resolve (no orphan deal-product)', async () => {
    const good = await seedRegularProduct();
    const slug = `deal-${unique()}`;

    const res = await createDealWith(
      [
        { productId: good, quantity: 1 },
        { productId: '00000000-0000-0000-0000-000000000000', quantity: 1 },
      ],
      { slug },
    );
    expect(res.status).toBe(404);

    // No deal-product row was created — the whole transaction rolled back.
    const orphan = await db.select().from(schema.products).where(eq(schema.products.slug, slug));
    expect(orphan).toHaveLength(0);
  });

  it('rolls back when a component is itself a deal (no orphan deal-product)', async () => {
    const good = await seedRegularProduct();
    const otherDeal = await seedDeal();
    const slug = `deal-${unique()}`;

    const res = await createDealWith(
      [
        { productId: good, quantity: 1 },
        { productId: otherDeal, quantity: 1 },
      ],
      { slug },
    );
    expect(res.status).toBe(400);

    const orphan = await db.select().from(schema.products).where(eq(schema.products.slug, slug));
    expect(orphan).toHaveLength(0);
  });

  it('rolls back on a duplicate productId within the components array (no orphan deal-product)', async () => {
    const dup = await seedRegularProduct();
    const slug = `deal-${unique()}`;

    const res = await createDealWith(
      [
        { productId: dup, quantity: 1 },
        { productId: dup, quantity: 2 },
      ],
      { slug },
    );
    expect(res.status).toBe(409);

    const orphan = await db.select().from(schema.products).where(eq(schema.products.slug, slug));
    expect(orphan).toHaveLength(0);
    // And no stray deal_components rows leaked either.
    const links = await db
      .select()
      .from(schema.dealComponents)
      .where(eq(schema.dealComponents.component_product_id, dup));
    expect(links).toHaveLength(0);
  });
});

describe('AC-E3 — should behave identically to the shipped create path when components is omitted', () => {
  it('creates a deal-product with an empty components array when components is omitted (AC2 re-run)', async () => {
    const res = await createDeal({ basePriceCents: 19900 });
    expect(res.status).toBe(201);
    const deal = res.body.deal;
    expect(deal.id).toBeTruthy();
    expect(deal.isDeal).toBe(true);
    expect(deal.basePriceCents).toBe(19900);
    expect(deal.isActive).toBe(true);
    expect(deal.components).toEqual([]);
  });

  it('treats an explicit empty components array like the shipped single-insert path', async () => {
    const res = await createDealWith([]);
    expect(res.status).toBe(201);
    expect(res.body.deal.components).toEqual([]);
  });
});

describe('AC-E4 — should reject malformed components array entries with a validation error before any DB write', () => {
  it('rejects a non-uuid productId with 400 (Zod before Postgres)', async () => {
    const res = await request(app)
      .post('/api/admin/deals')
      .set('Cookie', adminCookies.join('; '))
      .send(dealPayload({ components: [{ productId: 'not-a-uuid', quantity: 1 }] }))
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  it('rejects a quantity below 1 with 400', async () => {
    const good = await seedRegularProduct();
    const res = await request(app)
      .post('/api/admin/deals')
      .set('Cookie', adminCookies.join('; '))
      .send(dealPayload({ components: [{ productId: good, quantity: 0 }] }))
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  it('rejects a non-integer quantity with 400', async () => {
    const good = await seedRegularProduct();
    const res = await request(app)
      .post('/api/admin/deals')
      .set('Cookie', adminCookies.join('; '))
      .send(dealPayload({ components: [{ productId: good, quantity: 1.5 }] }))
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  it('rejects a components entry missing productId with 400', async () => {
    const res = await request(app)
      .post('/api/admin/deals')
      .set('Cookie', adminCookies.join('; '))
      .send(dealPayload({ components: [{ quantity: 1 }] }))
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });
});

describe('AC-E5 — should reject a components entry whose product is itself is_deal=true', () => {
  it('rejects a deal-of-deals component at create with 400', async () => {
    const otherDeal = await seedDeal();
    const res = await createDealWith([{ productId: otherDeal, quantity: 1 }]);
    expect(res.status).toBe(400);
  });
});
