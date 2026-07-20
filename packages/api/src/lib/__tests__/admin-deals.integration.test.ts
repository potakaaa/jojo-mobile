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

    // MENU-003: a deal is only listed when it has >=1 component and every
    // component is available here — so this deal takes the (already available)
    // regular product as its component. This test is about the is_deal filter
    // split, not component count; the component keeps it listable under AC7.
    const dealRes = await createDealWith([{ productId: regularId, quantity: 1 }]);
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

// ─── Auto-seed branch availability on deal create ────────────────────────────

describe('creating a deal seeds branch_product_availability for every active branch', () => {
  it('a newly created deal (fast path) appears in ?isDeal=true menu with no explicit availability write', async () => {
    // Branch must exist BEFORE the deal so create-time seeding covers it.
    const branchId = await seedBranch();

    // MENU-003 (AC7): a zero-component deal is never listed, so give the deal a
    // component that IS available here. Availability is set on the COMPONENT
    // only — never on the deal — which is exactly what this test asserts gets
    // auto-seeded for the deal at create time.
    const componentId = await seedRegularProduct();
    await setAvailability(componentId, branchId, true);

    const dealRes = await createDealWith([{ productId: componentId, quantity: 1 }]);
    const dealId = dealRes.body.deal.id as string;

    // A branch_product_availability row (available) was auto-seeded.
    const [bpa] = await db
      .select()
      .from(schema.branchProductAvailability)
      .where(
        and(
          eq(schema.branchProductAvailability.branch_id, branchId),
          eq(schema.branchProductAvailability.product_id, dealId),
        ),
      );
    expect(bpa!.is_available).toBe(true);

    // End-to-end: the deal is visible on the deals menu without any setAvailability call.
    const dealsMenu = await request(app).get(`/branches/${branchId}/menu?isDeal=true`);
    expect(dealsMenu.status).toBe(200);
    const dealsMenuIds = (dealsMenu.body.categories as { products: { id: string }[] }[]).flatMap(
      (c) => c.products.map((p) => p.id),
    );
    expect(dealsMenuIds).toContain(dealId);
  });

  it('a deal created with components (transactional path) also auto-seeds availability', async () => {
    const branchId = await seedBranch();
    const componentId = await seedRegularProduct();

    const res = await createDealWith([{ productId: componentId, quantity: 1 }]);
    expect(res.status).toBe(201);
    const dealId = res.body.deal.id as string;

    const [bpa] = await db
      .select()
      .from(schema.branchProductAvailability)
      .where(
        and(
          eq(schema.branchProductAvailability.branch_id, branchId),
          eq(schema.branchProductAvailability.product_id, dealId),
        ),
      );
    expect(bpa!.is_available).toBe(true);
  });
});

// ─── Branch selection on deal create (post-merge Fix 4) ──────────────────────

describe('creating a deal with an explicit branchIds selection', () => {
  it('seeds availability ONLY for the selected branches, not the excluded ones', async () => {
    const included = await seedBranch();
    const excluded = await seedBranch();

    const res = await createDeal({ branchIds: [included] });
    expect(res.status).toBe(201);
    const dealId = res.body.deal.id as string;

    const rows = await db
      .select()
      .from(schema.branchProductAvailability)
      .where(eq(schema.branchProductAvailability.product_id, dealId));
    const rowByBranch = new Map(rows.map((r) => [r.branch_id, r.is_available]));
    expect(rowByBranch.get(included)).toBe(true);
    expect(rowByBranch.has(excluded)).toBe(false);
  });

  it('rejects a branchIds selection containing an unknown branch id with 400', async () => {
    const before = await db.select().from(schema.products).where(eq(schema.products.is_deal, true));
    const res = await createDeal({ branchIds: ['00000000-0000-0000-0000-000000000000'] });
    expect(res.status).toBe(400);

    // The deal-product write rolled back — no new deal row landed.
    const after = await db.select().from(schema.products).where(eq(schema.products.is_deal, true));
    expect(after.length).toBe(before.length);
  });

  it('an omitted branchIds field still seeds every active branch (backward compatible)', async () => {
    const b1 = await seedBranch();
    const b2 = await seedBranch();

    const res = await createDeal();
    expect(res.status).toBe(201);
    const dealId = res.body.deal.id as string;

    const rows = await db
      .select()
      .from(schema.branchProductAvailability)
      .where(eq(schema.branchProductAvailability.product_id, dealId));
    const seededBranchIds = new Set(rows.map((r) => r.branch_id));
    expect(seededBranchIds.has(b1)).toBe(true);
    expect(seededBranchIds.has(b2)).toBe(true);
  });

  it('an empty branchIds array creates a deal with no availability rows (invisible)', async () => {
    await seedBranch();

    const res = await createDeal({ branchIds: [] });
    expect(res.status).toBe(201);
    const dealId = res.body.deal.id as string;

    const rows = await db
      .select()
      .from(schema.branchProductAvailability)
      .where(eq(schema.branchProductAvailability.product_id, dealId));
    expect(rows.length).toBe(0);
  });
});

// ─── Visibility indicator counts (ADM-008 post-merge Fix 3) ──────────────────

describe('deal responses carry branch-availability counts for the visibility indicator', () => {
  it('GET /:id reports availableBranchCount matching the seeded active branches', async () => {
    // Branch created BEFORE the deal so create-time seeding covers it → the deal
    // is available at ≥1 active branch, never more than the active-branch total.
    await seedBranch();
    const dealId = await seedDeal();

    const detail = await request(app)
      .get(`/api/admin/deals/${dealId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(detail.status).toBe(200);
    expect(typeof detail.body.deal.availableBranchCount).toBe('number');
    expect(typeof detail.body.deal.activeBranchCount).toBe('number');
    expect(detail.body.deal.availableBranchCount).toBeGreaterThanOrEqual(1);
    expect(detail.body.deal.activeBranchCount).toBeGreaterThanOrEqual(
      detail.body.deal.availableBranchCount,
    );
  });

  it('reports availableBranchCount 0 when a deal has no available branch rows', async () => {
    await seedBranch();
    const dealId = await seedDeal();

    // Zero out every seeded availability row for this deal → invisible everywhere.
    await db
      .update(schema.branchProductAvailability)
      .set({ is_available: false })
      .where(eq(schema.branchProductAvailability.product_id, dealId));

    const detail = await request(app)
      .get(`/api/admin/deals/${dealId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(detail.status).toBe(200);
    expect(detail.body.deal.availableBranchCount).toBe(0);
  });

  it('GET / (list) carries the count fields on every deal row', async () => {
    await seedDeal();
    const list = await request(app).get('/api/admin/deals').set('Cookie', adminCookies.join('; '));
    expect(list.status).toBe(200);
    const deals = list.body.deals as {
      availableBranchCount: unknown;
      activeBranchCount: unknown;
    }[];
    expect(deals.length).toBeGreaterThanOrEqual(1);
    expect(deals.every((d) => typeof d.availableBranchCount === 'number')).toBe(true);
    expect(deals.every((d) => typeof d.activeBranchCount === 'number')).toBe(true);
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

    // MENU-003 (AC5/AC7): placement now requires the deal to have >=1 component,
    // all available at this branch. Orthogonal to this test's subject (price
    // snapshot integrity) — the component just makes the deal orderable at all.
    const componentId = await seedRegularProduct();
    await setAvailability(componentId, branchId, true);

    const dealRes = await createDealWith([{ productId: componentId, quantity: 1 }], {
      basePriceCents: 10000,
    });
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

    // MENU-003 (AC5/AC7): a deal is only orderable with >=1 component, all
    // available here. This test's subject is "no is_deal rejection at
    // placement", which the component leaves intact.
    const componentId = await seedRegularProduct();
    await setAvailability(componentId, branchId, true);

    const dealRes = await createDealWith([{ productId: componentId, quantity: 1 }], {
      basePriceCents: 5000,
    });
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

// ─── DEAL-005 Phase 1 — scheduled window CRUD ────────────────────────────────
//
// The admin authoring surface for `deal_schedules`. AC5 (startsAt >= endsAt → 400)
// is the boundary gate; the rest lock the "at most one row, replace never append"
// invariant and the null/null = no row = always-live default.
describe('DEAL-005 — scheduled window on create/update', () => {
  const ISO_START = '2026-09-01T10:00:00.000Z';
  const ISO_END = '2026-09-30T18:00:00.000Z';

  async function scheduleRows(dealId: string) {
    return db
      .select()
      .from(schema.dealSchedules)
      .where(eq(schema.dealSchedules.deal_product_id, dealId));
  }

  function patchDeal(dealId: string, body: Record<string, unknown>) {
    return request(app)
      .patch(`/api/admin/deals/${dealId}`)
      .set('Cookie', adminCookies.join('; '))
      .send(body)
      .set('Content-Type', 'application/json');
  }

  it('defaults to NO schedule row and serializes startsAt/endsAt as null (always live)', async () => {
    const res = await createDeal();
    expect(res.status).toBe(201);
    expect(res.body.deal.startsAt).toBeNull();
    expect(res.body.deal.endsAt).toBeNull();
    expect(await scheduleRows(res.body.deal.id)).toHaveLength(0);
  });

  it('persists a window supplied at create, as exactly ONE row', async () => {
    const res = await createDeal({ startsAt: ISO_START, endsAt: ISO_END });
    expect(res.status).toBe(201);
    expect(res.body.deal.startsAt).toBe(ISO_START);
    expect(res.body.deal.endsAt).toBe(ISO_END);

    const rows = await scheduleRows(res.body.deal.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.starts_at?.toISOString()).toBe(ISO_START);
    expect(rows[0]!.ends_at?.toISOString()).toBe(ISO_END);
  });

  it('accepts an open-ended window (one bound only)', async () => {
    const res = await createDeal({ startsAt: ISO_START });
    expect(res.status).toBe(201);
    expect(res.body.deal.startsAt).toBe(ISO_START);
    expect(res.body.deal.endsAt).toBeNull();
    expect(await scheduleRows(res.body.deal.id)).toHaveLength(1);
  });

  it('AC5: rejects startsAt >= endsAt at create with 400, writing no deal at all', async () => {
    const equal = await createDeal({ startsAt: ISO_START, endsAt: ISO_START });
    expect(equal.status).toBe(400);
    expect(equal.body.error).toMatch(/endsAt must be after startsAt/);

    const inverted = await createDeal({ startsAt: ISO_END, endsAt: ISO_START });
    expect(inverted.status).toBe(400);
  });

  it('AC5: rejects startsAt >= endsAt on PATCH with 400', async () => {
    const dealId = await seedDeal();
    const res = await patchDeal(dealId, { startsAt: ISO_END, endsAt: ISO_START });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/endsAt must be after startsAt/);
    expect(await scheduleRows(dealId)).toHaveLength(0);
  });

  it('AC5: validates the MERGED window — a partial PATCH cannot invert a stored window', async () => {
    const dealId = await seedDeal({ startsAt: ISO_START, endsAt: ISO_END });
    // Sends only startsAt, pushed past the ALREADY-STORED endsAt.
    const res = await patchDeal(dealId, { startsAt: '2026-10-15T00:00:00.000Z' });
    expect(res.status).toBe(400);

    // The stored window is untouched — the rejected write rolled back.
    const rows = await scheduleRows(dealId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.starts_at?.toISOString()).toBe(ISO_START);
  });

  it('PATCH REPLACES the window rather than appending a second row', async () => {
    const dealId = await seedDeal({ startsAt: ISO_START, endsAt: ISO_END });
    const newStart = '2026-11-01T00:00:00.000Z';
    const newEnd = '2026-11-05T00:00:00.000Z';

    const res = await patchDeal(dealId, { startsAt: newStart, endsAt: newEnd });
    expect(res.status).toBe(200);
    expect(res.body.deal.startsAt).toBe(newStart);
    expect(res.body.deal.endsAt).toBe(newEnd);

    // Still exactly one row — the Phase-1 single-row invariant.
    const rows = await scheduleRows(dealId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.starts_at?.toISOString()).toBe(newStart);
  });

  it('PATCH with both bounds null DELETES the row, returning the deal to always-live', async () => {
    const dealId = await seedDeal({ startsAt: ISO_START, endsAt: ISO_END });
    expect(await scheduleRows(dealId)).toHaveLength(1);

    const res = await patchDeal(dealId, { startsAt: null, endsAt: null });
    expect(res.status).toBe(200);
    expect(res.body.deal.startsAt).toBeNull();
    expect(res.body.deal.endsAt).toBeNull();
    // Always-live is ZERO rows, never an all-null row.
    expect(await scheduleRows(dealId)).toHaveLength(0);
  });

  it('PATCH that omits both window keys leaves the stored window untouched', async () => {
    const dealId = await seedDeal({ startsAt: ISO_START, endsAt: ISO_END });

    const res = await patchDeal(dealId, { name: `Renamed ${unique()}` });
    expect(res.status).toBe(200);
    expect(res.body.deal.startsAt).toBe(ISO_START);
    expect(res.body.deal.endsAt).toBe(ISO_END);
    expect(await scheduleRows(dealId)).toHaveLength(1);
  });

  it('surfaces the window on the detail and list read paths', async () => {
    const dealId = await seedDeal({ startsAt: ISO_START, endsAt: ISO_END });

    const detail = await request(app)
      .get(`/api/admin/deals/${dealId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(detail.status).toBe(200);
    expect(detail.body.deal.startsAt).toBe(ISO_START);
    expect(detail.body.deal.endsAt).toBe(ISO_END);

    const list = await request(app).get('/api/admin/deals').set('Cookie', adminCookies.join('; '));
    expect(list.status).toBe(200);
    const listed = list.body.deals.find((d: { id: string }) => d.id === dealId);
    expect(listed.startsAt).toBe(ISO_START);
    expect(listed.endsAt).toBe(ISO_END);
  });
});
