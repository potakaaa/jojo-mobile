/* eslint-disable @typescript-eslint/no-explicit-any -- fetch JSON bodies are
   loosely typed at the test boundary; assertions narrow them per case. */
import type { AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration tests for the public branch/menu routes. Run against a real local
 * Postgres (same DB as `db:migrate`):
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
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

// ids created in setup, referenced by assertions
let activeBranchId: string;
let inactiveBranchId: string;
let farBranchId: string;
let productName: string;
let regularProductId: string;
let dealName: string;

beforeAll(async () => {
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  const { branchesRouter } = await import('../branches');

  const app = express();
  app.use(express.json());
  app.use('/branches', branchesRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const suffix = uid();

  const [active] = await db
    .insert(schema.branches)
    .values({
      name: `Near Branch ${suffix}`,
      slug: `near-${suffix}`,
      address: '1 Near St',
      latitude: '14.500000',
      longitude: '120.900000',
      phone: '+639170000001',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 20,
    })
    .returning();
  activeBranchId = active!.id;

  const [far] = await db
    .insert(schema.branches)
    .values({
      name: `Far Branch ${suffix}`,
      slug: `far-${suffix}`,
      address: '2 Far Ave',
      latitude: '10.300000',
      longitude: '123.900000',
      phone: '+639170000002',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 30,
    })
    .returning();
  farBranchId = far!.id;

  const [inactive] = await db
    .insert(schema.branches)
    .values({
      name: `Inactive Branch ${suffix}`,
      slug: `inactive-${suffix}`,
      address: '3 Closed Rd',
      latitude: '14.600000',
      longitude: '120.950000',
      phone: '+639170000003',
      opening_hours: '08:00-20:00',
      is_active: false,
    })
    .returning();
  inactiveBranchId = inactive!.id;

  const [category] = await db
    .insert(schema.categories)
    .values({ name: `Fries ${suffix}`, slug: `fries-${suffix}`, sort_order: 1 })
    .returning();

  productName = `Loaded Fries ${suffix}`;
  const [product] = await db
    .insert(schema.products)
    .values({
      category_id: category!.id,
      name: productName,
      slug: `loaded-fries-${suffix}`,
      base_price: '5.00',
    })
    .returning();
  regularProductId = product!.id;

  await db.insert(schema.productOptions).values([
    {
      product_id: product!.id,
      option_type: 'size',
      name: 'Large',
      price_delta: '1.50',
      sort_order: 1,
    },
    {
      product_id: product!.id,
      option_type: 'flavor',
      name: 'Cheese',
      price_delta: '0.00',
      sort_order: 1,
    },
  ]);

  // Available at the near branch only.
  await db
    .insert(schema.branchProductAvailability)
    .values({ branch_id: activeBranchId, product_id: product!.id, is_available: true });

  // ADM-004 deals-as-products (Phase B): a deal-product (`is_deal = true`) whose
  // "what's inside" is the regular Loaded Fries × 2, available at the near
  // branch. Exercises the `?isDeal=true` menu filter + `deal_components`
  // resolution. Reuses the regular product as the deal's single component.
  dealName = `Combo Deal ${suffix}`;
  const [deal] = await db
    .insert(schema.products)
    .values({
      category_id: category!.id,
      name: dealName,
      slug: `combo-deal-${suffix}`,
      base_price: '9.99',
      is_deal: true,
    })
    .returning();

  await db.insert(schema.dealComponents).values({
    deal_product_id: deal!.id,
    component_product_id: product!.id,
    quantity: 2,
  });

  await db
    .insert(schema.branchProductAvailability)
    .values({ branch_id: activeBranchId, product_id: deal!.id, is_available: true });
});

afterAll(async () => {
  server?.close();
});

describe('GET /branches', () => {
  it('returns active branches and excludes inactive ones', async () => {
    const { status, json } = await get('/branches');
    expect(status).toBe(200);
    const ids = json.branches.map((b: any) => b.id);
    expect(ids).toContain(activeBranchId);
    expect(ids).not.toContain(inactiveBranchId);
  });

  it('adds distanceKm and sorts nearest-first when lat/lng supplied', async () => {
    const { status, json } = await get('/branches?lat=14.5&lng=120.9');
    expect(status).toBe(200);
    const near = json.branches.findIndex((b: any) => b.id === activeBranchId);
    const far = json.branches.findIndex((b: any) => b.id === farBranchId);
    expect(near).toBeGreaterThanOrEqual(0);
    expect(far).toBeGreaterThanOrEqual(0);
    expect(near).toBeLessThan(far);
    expect(typeof json.branches[near].distanceKm).toBe('number');
    expect(json.branches[near].distanceKm).toBeLessThan(1);
  });
});

describe('GET /branches/:branchId', () => {
  it('returns branch detail with cents-free numeric fields', async () => {
    const { status, json } = await get(`/branches/${activeBranchId}`);
    expect(status).toBe(200);
    expect(json.branch.id).toBe(activeBranchId);
    expect(json.branch.estimatedPrepMinutes).toBe(20);
    expect(json.branch.isAcceptingPickup).toBe(true);
  });

  it('404s an inactive branch', async () => {
    const { status } = await get(`/branches/${inactiveBranchId}`);
    expect(status).toBe(404);
  });

  it('404s an unknown branch', async () => {
    const { status } = await get('/branches/00000000-0000-0000-0000-000000000000');
    expect(status).toBe(404);
  });

  it('404s a malformed branch id (no 500)', async () => {
    const { status } = await get('/branches/not-a-uuid');
    expect(status).toBe(404);
  });
});

describe('GET /branches/:branchId/menu', () => {
  it('returns categories → products → options grouped by option_type, in cents', async () => {
    const { status, json } = await get(`/branches/${activeBranchId}/menu`);
    expect(status).toBe(200);
    expect(json.branchId).toBe(activeBranchId);

    const product = json.categories
      .flatMap((c: any) => c.products)
      .find((p: any) => p.name === productName);
    expect(product).toBeDefined();
    expect(product.basePriceCents).toBe(500);
    expect(product.options.size).toHaveLength(1);
    expect(product.options.size[0].priceDeltaCents).toBe(150);
    expect(product.options.flavor).toHaveLength(1);
    expect(product.options.add_on).toEqual([]);
  });

  it('excludes deal-products and omits isDeal/components on the regular menu', async () => {
    const { status, json } = await get(`/branches/${activeBranchId}/menu`);
    expect(status).toBe(200);

    const products = json.categories.flatMap((c: any) => c.products);

    // The deal-product never appears mixed into the regular menu.
    expect(products.find((p: any) => p.name === dealName)).toBeUndefined();

    // Regular products carry NEITHER key (omitted entirely, not `isDeal: false`).
    const regular = products.find((p: any) => p.name === productName);
    expect(regular).toBeDefined();
    expect(regular).not.toHaveProperty('isDeal');
    expect(regular).not.toHaveProperty('components');
  });
});

describe('GET /branches/:branchId/menu?isDeal=true', () => {
  it('returns only deal-products with isDeal:true and populated components[]', async () => {
    const { status, json } = await get(`/branches/${activeBranchId}/menu?isDeal=true`);
    expect(status).toBe(200);
    expect(json.branchId).toBe(activeBranchId);

    const products = json.categories.flatMap((c: any) => c.products);

    const deal = products.find((p: any) => p.name === dealName);
    expect(deal).toBeDefined();
    expect(deal.isDeal).toBe(true);
    expect(deal.basePriceCents).toBe(999);
    expect(deal.components).toHaveLength(1);
    expect(deal.components[0]).toMatchObject({
      componentProductId: regularProductId,
      componentName: productName,
      quantity: 2,
    });

    // The regular (non-deal) product is filtered out of the deals menu.
    expect(products.find((p: any) => p.name === productName)).toBeUndefined();
  });
});
