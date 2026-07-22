/* eslint-disable @typescript-eslint/no-explicit-any -- fetch JSON bodies are
   loosely typed at the test boundary; assertions narrow them. */
import type { AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration tests for the home-all-branches all-branch catalog route
 * `GET /products`. Run against a real local Postgres (same DB as `db:migrate`):
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * HERMETIC RULE: the shared DB carries seeded products. Every assertion checks
 * presence/absence of THIS test's own uniquely-suffixed fixtures BY ID — never a
 * global array length and never global emptiness.
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

async function get(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** Flatten the `{ categories: [{ products }] }` envelope to a flat product list. */
function flatten(json: any): any[] {
  return json.categories.flatMap((c: any) => c.products);
}

function find(json: any, id: string): any {
  return flatten(json).find((p: any) => p.id === id);
}

/** The names on a product's `branches[]`, sorted for order-insensitive assertions. */
function branchNames(product: any): string[] {
  return (product.branches as { name: string }[]).map((b) => b.name).sort();
}

// Fixtures.
let categoryId: string;
let categoryName: string;
let openBranchAId: string;
let openBranchAName: string;
let openBranchBId: string;
let openBranchBName: string;
let closedBranchId: string;
let closedBranchName: string;

let twoBranchProductId: string; // available at open A and open B
let oneBranchProductId: string; // available at open A only
let noBranchProductId: string; // no branch_product_availability row anywhere
let closedOnlyProductId: string; // only carried by an active-but-not-accepting branch
let flaggedUnavailableProductId: string; // has a row at A, but is_available=false
let inactiveProductId: string; // is_active = false
let dealProductId: string; // is_deal = true
let inactiveCategoryProductId: string; // active product under an inactive category

beforeAll(async () => {
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  const { productsRouter } = await import('../products');
  const { branchesRouter } = await import('../branches');

  const app = express();
  app.use(express.json());
  app.use('/products', productsRouter);
  // Mounted only so the single-branch menu can be asserted UNCHANGED below —
  // this plan must not alter `GET /branches/:branchId/menu` (the Order tab
  // depends on its single-branch contract).
  app.use('/branches', branchesRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const suffix = uid();

  const makeBranch = async (
    label: string,
    opts: { isActive?: boolean; isAcceptingPickup?: boolean } = {},
  ): Promise<{ id: string; name: string }> => {
    const name = `HAB ${label} ${suffix}`;
    const [branch] = await db
      .insert(schema.branches)
      .values({
        name,
        slug: `hab-${label.toLowerCase()}-${suffix}`,
        address: `${label} St`,
        latitude: '14.550000',
        longitude: '120.980000',
        phone: '+639170000010',
        opening_hours: '08:00-20:00',
        estimated_prep_minutes: 15,
        is_active: opts.isActive ?? true,
        is_accepting_pickup: opts.isAcceptingPickup ?? true,
      })
      .returning();
    return { id: branch!.id, name };
  };

  ({ id: openBranchAId, name: openBranchAName } = await makeBranch('OpenA'));
  ({ id: openBranchBId, name: openBranchBName } = await makeBranch('OpenB'));
  // Active, but NOT accepting pickup — the customer cannot select it, so it must
  // never appear in any product's `branches[]`.
  ({ id: closedBranchId, name: closedBranchName } = await makeBranch('Closed', {
    isAcceptingPickup: false,
  }));

  categoryName = `HAB Category ${suffix}`;
  const [category] = await db
    .insert(schema.categories)
    .values({ name: categoryName, slug: `hab-category-${suffix}`, sort_order: 7 })
    .returning();
  categoryId = category!.id;

  const [inactiveCategory] = await db
    .insert(schema.categories)
    .values({
      name: `HAB Inactive Category ${suffix}`,
      slug: `hab-inactive-category-${suffix}`,
      sort_order: 8,
      is_active: false,
    })
    .returning();

  const makeProduct = async (
    label: string,
    opts: { isActive?: boolean; isDeal?: boolean; categoryId?: string } = {},
  ): Promise<string> => {
    const [product] = await db
      .insert(schema.products)
      .values({
        category_id: opts.categoryId ?? categoryId,
        name: `HAB ${label} ${suffix}`,
        slug: `hab-${label.toLowerCase()}-${suffix}`,
        base_price: '3.50',
        is_active: opts.isActive ?? true,
        is_deal: opts.isDeal ?? false,
      })
      .returning();
    return product!.id;
  };

  const setAvailability = async (branchId: string, productId: string, isAvailable: boolean) => {
    await db
      .insert(schema.branchProductAvailability)
      .values({ branch_id: branchId, product_id: productId, is_available: isAvailable });
  };

  twoBranchProductId = await makeProduct('TwoBranch');
  await setAvailability(openBranchAId, twoBranchProductId, true);
  await setAvailability(openBranchBId, twoBranchProductId, true);

  oneBranchProductId = await makeProduct('OneBranch');
  await setAvailability(openBranchAId, oneBranchProductId, true);

  noBranchProductId = await makeProduct('NoBranch');
  // deliberately NO branch_product_availability rows

  closedOnlyProductId = await makeProduct('ClosedOnly');
  await setAvailability(closedBranchId, closedOnlyProductId, true);

  flaggedUnavailableProductId = await makeProduct('FlaggedOff');
  await setAvailability(openBranchAId, flaggedUnavailableProductId, false);

  inactiveProductId = await makeProduct('Inactive', { isActive: false });
  await setAvailability(openBranchAId, inactiveProductId, true);

  dealProductId = await makeProduct('DealProduct', { isDeal: true });
  await setAvailability(openBranchAId, dealProductId, true);

  inactiveCategoryProductId = await makeProduct('InInactiveCategory', {
    categoryId: inactiveCategory!.id,
  });
  await setAvailability(openBranchAId, inactiveCategoryProductId, true);

  // One option row, to prove the grouped-options shape survives the new route.
  await db.insert(schema.productOptions).values({
    product_id: twoBranchProductId,
    option_type: 'size',
    name: `HAB Large ${suffix}`,
    price_delta: '1.00',
    sort_order: 1,
  });
});

afterAll(async () => {
  server?.close();
});

describe('GET /products — all-branch catalog', () => {
  // AC1 — one card per product regardless of how many branches carry it.
  it('returns each product exactly ONCE even when several branches carry it', async () => {
    const { status, json } = await get('/products');
    expect(status).toBe(200);

    const occurrences = flatten(json).filter((p: any) => p.id === twoBranchProductId);
    expect(occurrences).toHaveLength(1);
  });

  // AC1/AC4 — the listing is branch-agnostic: it takes no branchId at all, so a
  // product carried only by one branch is present regardless of selection.
  it('lists products from every branch in a single branch-agnostic response', async () => {
    const { json } = await get('/products');
    const ids = flatten(json).map((p: any) => p.id);

    expect(ids).toContain(twoBranchProductId);
    expect(ids).toContain(oneBranchProductId);
  });

  // AC2 — single carrying branch → exactly that branch, by name.
  it('carries a single-branch product with exactly one entry in branches[]', async () => {
    const { json } = await get('/products');
    const product = find(json, oneBranchProductId);

    expect(product.branches).toEqual([{ id: openBranchAId, name: openBranchAName }]);
  });

  // AC3 — multiple carrying branches → all of them, so "Available at N branches"
  // can use a REAL count, not a boolean-derived stand-in.
  it('carries every carrying branch for a multi-branch product', async () => {
    const { json } = await get('/products');
    const product = find(json, twoBranchProductId);

    expect(product.branches).toHaveLength(2);
    expect(branchNames(product)).toEqual([openBranchAName, openBranchBName].sort());
  });

  // AC4 — a product no branch carries is STILL listed, with an empty array. The
  // Home grid must never hide it just because nobody stocks it right now.
  it('lists a product with no availability rows at all, with branches: []', async () => {
    const { json } = await get('/products');
    const product = find(json, noBranchProductId);

    expect(product).toBeDefined();
    expect(product.branches).toEqual([]);
  });

  it('lists a product whose only availability row is is_available=false, with branches: []', async () => {
    const { json } = await get('/products');
    const product = find(json, flaggedUnavailableProductId);

    expect(product).toBeDefined();
    expect(product.branches).toEqual([]);
  });

  // VALIDATE correction P2 — the branches[] set must match the client's own
  // selectable-branch set (`useBranch()` keeps accepting-pickup branches only).
  it('excludes an active-but-not-accepting-pickup branch from branches[]', async () => {
    const { json } = await get('/products');

    // The closed branch never appears anywhere in the response...
    const everyBranchName = flatten(json).flatMap((p: any) =>
      (p.branches as { name: string }[]).map((b) => b.name),
    );
    expect(everyBranchName).not.toContain(closedBranchName);

    // ...so a product only IT carries is listed with an empty branches array,
    // not with a branch the customer could never pick.
    const product = find(json, closedOnlyProductId);
    expect(product).toBeDefined();
    expect(product.branches).toEqual([]);
  });

  it('excludes deal-products (is_deal = true)', async () => {
    const { json } = await get('/products');
    expect(flatten(json).map((p: any) => p.id)).not.toContain(dealProductId);
  });

  it('excludes inactive products', async () => {
    const { json } = await get('/products');
    expect(flatten(json).map((p: any) => p.id)).not.toContain(inactiveProductId);
  });

  it('excludes products whose category is inactive', async () => {
    const { json } = await get('/products');
    expect(flatten(json).map((p: any) => p.id)).not.toContain(inactiveCategoryProductId);
  });

  // AC10 — categories stay REAL (not one synthetic bucket like /deals/products),
  // so the Home category filter keeps working over the merged list.
  it('groups products under their real category, not a synthetic bucket', async () => {
    const { json } = await get('/products');
    const category = json.categories.find((c: any) => c.id === categoryId);

    expect(category).toBeDefined();
    expect(category.name).toBe(categoryName);
    expect(category.products.map((p: any) => p.id)).toContain(twoBranchProductId);
  });

  it('keeps the regular-menu product shape (cents price, grouped options, no deal keys)', async () => {
    const { json } = await get('/products');
    const product = find(json, twoBranchProductId);

    expect(product.basePriceCents).toBe(350);
    expect(product.options.size).toHaveLength(1);
    expect(product.options.size[0].priceDeltaCents).toBe(100);
    expect(product.options.flavor).toEqual([]);
    expect(product.options.add_on).toEqual([]);
    // Regular catalog → the deal-only keys stay omitted entirely.
    expect(product.isDeal).toBeUndefined();
    expect(product.components).toBeUndefined();
    expect(product.available).toBeUndefined();
  });
});

describe('GET /branches/:branchId/menu — unchanged by the all-branch route', () => {
  // Non-regression: the single-branch menu is still branch-gated (it HIDES what
  // the branch does not carry) and still emits NO `branches` key.
  it('still hides a product the branch does not carry, and omits branches[]', async () => {
    const { status, json } = await get(`/branches/${openBranchBId}/menu`);
    expect(status).toBe(200);

    const ids = flatten(json).map((p: any) => p.id);
    // Branch B carries the two-branch product...
    expect(ids).toContain(twoBranchProductId);
    // ...and does NOT carry the one-branch (A-only) product — still hidden here,
    // which is exactly why the Home grid needed a separate all-branch route.
    expect(ids).not.toContain(oneBranchProductId);

    expect(find(json, twoBranchProductId).branches).toBeUndefined();
  });
});
