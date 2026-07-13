import type { Server } from 'node:http';

import { and, eq } from 'drizzle-orm';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration tests for the menu routes — real local Postgres. Requires:
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Self-contained fixtures (unique `zz-test-menu-*` slugs), cleaned up in
 * afterAll. Covers: active-only + sort-ordered categories; branch-availability
 * filtering in BOTH mismatch directions; branchId validation -> 400; product
 * detail + options; a mid-test availability flip (AC11 API half).
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';

type SchemaModule = typeof import('../../db/schema/index');
type DbModule = typeof import('../../db/client');

let db: DbModule['db'];
let schema: SchemaModule;
let server: Server;
let baseUrl: string;

// Fixture ids captured at insert time.
const ids = {
  branchActive: '',
  branchInactive: '',
  catWithProducts: '',
  catEmpty: '',
  catInactive: '',
  prodAvailable: '',
  prodNotAvailableHere: '',
  prodInactiveButAvailable: '',
  prodFlip: '',
  prodInInactiveCat: '',
  prodWithFlavor: '',
};

const P = 'zz-test-menu-';

beforeAll(async () => {
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  const { menuRouter } = await import('../menu');
  const { branches, categories, products, productOptions, branchProductAvailability } = schema;

  const insertBranch = async (slug: string, isActive: boolean) => {
    const [row] = await db
      .insert(branches)
      .values({
        name: `Test ${slug}`,
        slug,
        address: '1 Test St',
        latitude: '10.000000',
        longitude: '123.000000',
        phone: '+63 32 000 0000',
        opening_hours: '{}',
        is_active: isActive,
      })
      .onConflictDoUpdate({ target: branches.slug, set: { is_active: isActive } })
      .returning({ id: branches.id });
    return row!.id;
  };

  const insertCategory = async (slug: string, sortOrder: number, isActive: boolean) => {
    const [row] = await db
      .insert(categories)
      .values({ name: `Test ${slug}`, slug, sort_order: sortOrder, is_active: isActive })
      .onConflictDoUpdate({
        target: categories.slug,
        set: { sort_order: sortOrder, is_active: isActive },
      })
      .returning({ id: categories.id });
    return row!.id;
  };

  const insertProduct = async (
    slug: string,
    categoryId: string,
    isActive: boolean,
    basePrice = '89.00',
  ) => {
    const [row] = await db
      .insert(products)
      .values({
        category_id: categoryId,
        name: `Test ${slug}`,
        slug,
        description: 'Test product',
        base_price: basePrice,
        is_active: isActive,
      })
      .onConflictDoUpdate({
        target: products.slug,
        set: { is_active: isActive, category_id: categoryId },
      })
      .returning({ id: products.id });
    return row!.id;
  };

  const setAvailability = async (branchId: string, productId: string, isAvailable: boolean) => {
    await db
      .insert(branchProductAvailability)
      .values({ branch_id: branchId, product_id: productId, is_available: isAvailable })
      .onConflictDoUpdate({
        target: [branchProductAvailability.branch_id, branchProductAvailability.product_id],
        set: { is_available: isAvailable, updated_at: new Date() },
      });
  };

  ids.branchActive = await insertBranch(`${P}branch-active`, true);
  ids.branchInactive = await insertBranch(`${P}branch-inactive`, false);

  // Non-sequential sort_order, inserted out of order to prove ORDER BY sort_order.
  ids.catEmpty = await insertCategory(`${P}cat-empty`, 9101, true);
  ids.catWithProducts = await insertCategory(`${P}cat-products`, 9100, true);
  ids.catInactive = await insertCategory(`${P}cat-inactive`, 9102, false);

  ids.prodAvailable = await insertProduct(`${P}available`, ids.catWithProducts, true, '89.00');
  ids.prodNotAvailableHere = await insertProduct(`${P}not-here`, ids.catWithProducts, true);
  ids.prodInactiveButAvailable = await insertProduct(`${P}inactive`, ids.catWithProducts, false);
  ids.prodFlip = await insertProduct(`${P}flip`, ids.catWithProducts, true);
  ids.prodInInactiveCat = await insertProduct(`${P}in-inactive-cat`, ids.catInactive, true);
  ids.prodWithFlavor = await insertProduct(`${P}with-flavor`, ids.catWithProducts, true, '69.00');

  // Availability at the active branch:
  await setAvailability(ids.branchActive, ids.prodAvailable, true);
  await setAvailability(ids.branchActive, ids.prodNotAvailableHere, false); // direction 1: active globally, NOT available here
  await setAvailability(ids.branchActive, ids.prodInactiveButAvailable, true); // direction 2: available here, but globally inactive
  await setAvailability(ids.branchActive, ids.prodFlip, true);
  await setAvailability(ids.branchActive, ids.prodInInactiveCat, true);
  await setAvailability(ids.branchActive, ids.prodWithFlavor, true);

  // Options on prodWithFlavor: a flavor group (out-of-order sort + one inactive).
  await db.insert(productOptions).values([
    {
      product_id: ids.prodWithFlavor,
      option_type: 'flavor',
      name: 'Cheese-filled',
      price_delta: '15.00',
      sort_order: 1,
    },
    {
      product_id: ids.prodWithFlavor,
      option_type: 'flavor',
      name: 'Classic',
      price_delta: '0',
      sort_order: 0,
    },
    {
      product_id: ids.prodWithFlavor,
      option_type: 'add_on',
      name: 'Gone',
      price_delta: '5.00',
      sort_order: 2,
      is_active: false,
    },
  ]);

  const app = express();
  app.use('/api/menu', menuRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  const { branches, categories, products, productOptions, branchProductAvailability } = schema;
  const productIds = [
    ids.prodAvailable,
    ids.prodNotAvailableHere,
    ids.prodInactiveButAvailable,
    ids.prodFlip,
    ids.prodInInactiveCat,
    ids.prodWithFlavor,
  ];
  for (const pid of productIds) {
    await db.delete(productOptions).where(eq(productOptions.product_id, pid));
    await db.delete(branchProductAvailability).where(eq(branchProductAvailability.product_id, pid));
  }
  for (const pid of productIds) {
    await db.delete(products).where(eq(products.id, pid));
  }
  for (const cid of [ids.catWithProducts, ids.catEmpty, ids.catInactive]) {
    await db.delete(categories).where(eq(categories.id, cid));
  }
  for (const bid of [ids.branchActive, ids.branchInactive]) {
    await db.delete(branches).where(eq(branches.id, bid));
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

type MenuBody = {
  categories: {
    id: string;
    sortOrder: number;
    products: { id: string; basePrice: number }[];
  }[];
};

describe('GET /api/menu', () => {
  it('rejects a missing branchId with 400', async () => {
    const res = await fetch(`${baseUrl}/api/menu`);
    expect(res.status).toBe(400);
  });

  it('rejects a malformed branchId with 400', async () => {
    const res = await fetch(`${baseUrl}/api/menu?branchId=not-a-uuid`);
    expect(res.status).toBe(400);
  });

  it('rejects a well-formed but inactive branchId with 400', async () => {
    const res = await fetch(`${baseUrl}/api/menu?branchId=${ids.branchInactive}`);
    expect(res.status).toBe(400);
  });

  it('returns only active categories in sort_order, with branch-filtered products', async () => {
    const res = await fetch(`${baseUrl}/api/menu?branchId=${ids.branchActive}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as MenuBody;

    const testCats = body.categories.filter((c) =>
      [ids.catWithProducts, ids.catEmpty, ids.catInactive].includes(c.id),
    );
    // Inactive category excluded.
    expect(testCats.map((c) => c.id)).not.toContain(ids.catInactive);
    // Correct order: catWithProducts (9100) before catEmpty (9101).
    const withIdx = body.categories.findIndex((c) => c.id === ids.catWithProducts);
    const emptyIdx = body.categories.findIndex((c) => c.id === ids.catEmpty);
    expect(withIdx).toBeGreaterThanOrEqual(0);
    expect(emptyIdx).toBeGreaterThan(withIdx);

    const withProducts = body.categories.find((c) => c.id === ids.catWithProducts)!;
    const productIdsReturned = withProducts.products.map((p) => p.id);
    // Included: available + flip + with-flavor.
    expect(productIdsReturned).toContain(ids.prodAvailable);
    expect(productIdsReturned).toContain(ids.prodFlip);
    expect(productIdsReturned).toContain(ids.prodWithFlavor);
    // Excluded — direction 1 (globally active but not available at this branch).
    expect(productIdsReturned).not.toContain(ids.prodNotAvailableHere);
    // Excluded — direction 2 (available here but globally inactive).
    expect(productIdsReturned).not.toContain(ids.prodInactiveButAvailable);
    // basePrice mapped to a number.
    const available = withProducts.products.find((p) => p.id === ids.prodAvailable)!;
    expect(typeof available.basePrice).toBe('number');
    expect(available.basePrice).toBe(89);

    // Empty active category still returned with an empty products array.
    const empty = body.categories.find((c) => c.id === ids.catEmpty)!;
    expect(empty.products).toEqual([]);
  });
});

type DetailBody = {
  id: string;
  basePrice: number;
  isAvailable: boolean;
  options: { name: string; priceDelta: number; sortOrder: number; optionType: string }[];
};

describe('GET /api/menu/products/:productId', () => {
  it('400 for an invalid branchId', async () => {
    const res = await fetch(`${baseUrl}/api/menu/products/${ids.prodWithFlavor}?branchId=bad`);
    expect(res.status).toBe(400);
  });

  it('404 for a non-existent product id', async () => {
    const random = '00000000-0000-4000-8000-000000000000';
    const res = await fetch(`${baseUrl}/api/menu/products/${random}?branchId=${ids.branchActive}`);
    expect(res.status).toBe(404);
  });

  it('404 for a malformed product id', async () => {
    const res = await fetch(`${baseUrl}/api/menu/products/not-a-uuid?branchId=${ids.branchActive}`);
    expect(res.status).toBe(404);
  });

  it('404 for a globally-inactive product', async () => {
    const res = await fetch(
      `${baseUrl}/api/menu/products/${ids.prodInactiveButAvailable}?branchId=${ids.branchActive}`,
    );
    expect(res.status).toBe(404);
  });

  it('returns detail with only active options, sorted by sort_order', async () => {
    const res = await fetch(
      `${baseUrl}/api/menu/products/${ids.prodWithFlavor}?branchId=${ids.branchActive}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as DetailBody;
    expect(body.id).toBe(ids.prodWithFlavor);
    expect(body.isAvailable).toBe(true);
    expect(typeof body.basePrice).toBe('number');
    // Inactive option excluded; remaining sorted by sort_order.
    expect(body.options.map((o) => o.name)).toEqual(['Classic', 'Cheese-filled']);
    expect(typeof body.options[0]!.priceDelta).toBe('number');
  });

  it('reflects a mid-session availability flip without a restart (AC11 API half)', async () => {
    const { branchProductAvailability } = schema;
    const url = `${baseUrl}/api/menu/products/${ids.prodFlip}?branchId=${ids.branchActive}`;

    const before = (await (await fetch(url)).json()) as DetailBody;
    expect(before.isAvailable).toBe(true);

    // Flip availability off directly in the DB.
    await db
      .update(branchProductAvailability)
      .set({ is_available: false })
      .where(
        and(
          eq(branchProductAvailability.branch_id, ids.branchActive),
          eq(branchProductAvailability.product_id, ids.prodFlip),
        ),
      );

    const after = (await (await fetch(url)).json()) as DetailBody;
    expect(after.isAvailable).toBe(false);
  });
});
