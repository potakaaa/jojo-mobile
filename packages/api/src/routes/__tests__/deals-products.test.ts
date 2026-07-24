/* eslint-disable @typescript-eslint/no-explicit-any -- fetch JSON bodies and the
   getSession stub are loosely typed at the test boundary; assertions narrow them. */
import type { AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the DEAL-004 all-branch deal listing route
 * `GET /deals/products`. Run against a real local Postgres (same DB as
 * `db:migrate`):
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * HERMETIC RULE: the shared DB carries seeded deal-products. Every assertion here
 * checks presence/absence of THIS test's own uniquely-suffixed fixtures by id —
 * NEVER a global array length or global emptiness.
 *
 * The app mounts the routers in the SAME ORDER as production `index.ts`
 * (`/deals/products` BEFORE `/deals`) so the E1 route-precedence test exercises
 * the real ordering, not a test-only arrangement. The `/orders` + session stub
 * cover the AC3 placement-rejection half (reuses the existing `orders.ts`
 * placement path — no new placement code).
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

/**
 * Opening hours that read as OPEN at every instant of every day.
 * `POST /orders` gates placement on `getIsOpenNow(branch.opening_hours)`, which
 * JSON-parses this column; a bare `HH:MM`-range string is not JSON and reads as
 * closed, which would reject every order placed below. A `close` of `'00:00'`
 * means end-of-day (24:00) per `getIsOpenNow`'s documented convention, so this
 * is open all day, every weekday, whatever day CI lands on.
 * File-local by design — this file shares no test-helper module with the other
 * suites carrying the same constant.
 */
const ALWAYS_OPEN_HOURS = JSON.stringify({
  sun: { open: '00:00', close: '00:00' },
  mon: { open: '00:00', close: '00:00' },
  tue: { open: '00:00', close: '00:00' },
  wed: { open: '00:00', close: '00:00' },
  thu: { open: '00:00', close: '00:00' },
  fri: { open: '00:00', close: '00:00' },
  sat: { open: '00:00', close: '00:00' },
});

async function get(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function post(
  path: string,
  opts: { user?: string; body?: unknown } = {},
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.user) headers['x-test-user'] = opts.user;
  const res = await fetch(base + path, {
    method: 'POST',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** ids of the deal-products the listing returns (flattened across categories). */
async function dealIds(query = ''): Promise<{ ids: string[]; json: any }> {
  const { status, json } = await get(`/deals/products${query}`);
  expect(status).toBe(200);
  const ids = json.categories.flatMap((c: any) => c.products).map((p: any) => p.id);
  return { ids, json };
}

function findDeal(json: any, id: string): any {
  return json.categories.flatMap((c: any) => c.products).find((p: any) => p.id === id);
}

// Fixtures, referenced by assertions.
let categoryId: string;
let branchAId: string;
let branchBId: string;
let userId: string;

let branchAName: string;
let branchBName: string;
let closedBranchId: string;
let closedBranchName: string;

let fullyAvailableDealId: string; // 1 component, available at A & B
let unavailableAtADealId: string; // 1 component, DOWN at A, UP at B
let nowhereAvailableDealId: string; // zero components → fulfillable nowhere
let closedOnlyDealId: string; // fulfillable only at an active-but-closed branch

beforeAll(async () => {
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  const { dealsProductsRouter } = await import('../deals-products');
  const { dealsRouter } = await import('../deals');
  const { branchesRouter } = await import('../branches');
  const { ordersRouter } = await import('../orders');
  const { auth } = await import('../../lib/auth');

  // Deterministic session stub: x-test-user header -> that user id; absent -> 401.
  vi.spyOn(auth.api, 'getSession').mockImplementation((async ({ headers }: any) => {
    const id = headers.get('x-test-user');
    if (!id) return null;
    return { session: { id: `sess-${id}`, userId: id }, user: { id } };
  }) as any);

  const app = express();
  app.use(express.json());
  app.use('/branches', branchesRouter);
  // SAME ORDER as production index.ts — /deals/products BEFORE /deals (E1).
  app.use('/deals/products', dealsProductsRouter);
  app.use('/deals', dealsRouter);
  app.use('/orders', ordersRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const suffix = uid();

  const [user] = await db
    .insert(schema.users)
    .values({ name: 'DEAL004 User', email: `deal004-${suffix}@example.com` })
    .returning();
  userId = user!.id;

  const makeBranch = async (
    label: string,
    opts: { isAcceptingPickup?: boolean } = {},
  ): Promise<string> => {
    const [branch] = await db
      .insert(schema.branches)
      .values({
        name: `DEAL004 ${label} ${suffix}`,
        slug: `deal004-${label.toLowerCase()}-${suffix}`,
        address: `${label} St`,
        latitude: '14.550000',
        longitude: '120.980000',
        phone: '+639170000009',
        opening_hours: ALWAYS_OPEN_HOURS,
        estimated_prep_minutes: 15,
        is_accepting_pickup: opts.isAcceptingPickup ?? true,
      })
      .returning();
    return branch!.id;
  };
  branchAName = `DEAL004 A ${suffix}`;
  branchBName = `DEAL004 B ${suffix}`;
  closedBranchName = `DEAL004 Closed ${suffix}`;
  branchAId = await makeBranch('A');
  branchBId = await makeBranch('B');
  // Active, but NOT accepting pickup — the customer cannot select it, so it must
  // never appear in a deal's `branches[]` (home-all-branches, VALIDATE P2).
  closedBranchId = await makeBranch('Closed', { isAcceptingPickup: false });

  const [category] = await db
    .insert(schema.categories)
    .values({ name: `DEAL004 Deals ${suffix}`, slug: `deal004-deals-${suffix}`, sort_order: 3 })
    .returning();
  categoryId = category!.id;

  const makeComponent = async (label: string): Promise<string> => {
    const [product] = await db
      .insert(schema.products)
      .values({
        category_id: categoryId,
        name: `DEAL004 Component ${label} ${suffix}`,
        slug: `deal004-component-${label}-${suffix}`,
        base_price: '2.00',
        is_active: true,
      })
      .returning();
    return product!.id;
  };

  const makeDeal = async (label: string, componentIds: string[]): Promise<string> => {
    const [deal] = await db
      .insert(schema.products)
      .values({
        category_id: categoryId,
        name: `DEAL004 Deal ${label} ${suffix}`,
        slug: `deal004-deal-${label}-${suffix}`,
        base_price: '9.00',
        is_deal: true,
      })
      .returning();
    // `values([])` throws in drizzle — a zero-component deal simply gets no rows.
    if (componentIds.length > 0) {
      await db.insert(schema.dealComponents).values(
        componentIds.map((componentProductId) => ({
          deal_product_id: deal!.id,
          component_product_id: componentProductId,
          quantity: 1,
        })),
      );
    }
    return deal!.id;
  };

  const setAvailability = async (branchId: string, productId: string, isAvailable: boolean) => {
    await db
      .insert(schema.branchProductAvailability)
      .values({ branch_id: branchId, product_id: productId, is_available: isAvailable });
  };

  // Fully-available deal: 1 component, available at both A and B.
  const comp1 = await makeComponent('1');
  fullyAvailableDealId = await makeDeal('fully-available', [comp1]);
  await setAvailability(branchAId, comp1, true);
  await setAvailability(branchBId, comp1, true);
  await setAvailability(branchAId, fullyAvailableDealId, true);
  await setAvailability(branchBId, fullyAvailableDealId, true);

  // Unavailable-at-A deal: 1 component DOWN at A, UP at B. The deal-product
  // itself is available at both, so only the component decides availability.
  const comp2 = await makeComponent('2');
  unavailableAtADealId = await makeDeal('unavailable-at-a', [comp2]);
  await setAvailability(branchAId, comp2, false);
  await setAvailability(branchBId, comp2, true);
  await setAvailability(branchAId, unavailableAtADealId, true);
  await setAvailability(branchBId, unavailableAtADealId, true);

  // home-all-branches fixtures.
  // A zero-component deal is fulfillable NOWHERE (MENU-003 locked decision), so
  // its `branches[]` must be empty — while the deal itself is still listed.
  nowhereAvailableDealId = await makeDeal('nowhere', []);

  // Fulfillable ONLY at the active-but-closed branch: proves the accepting-pickup
  // filter, not merely the is_active one.
  const comp3 = await makeComponent('3');
  closedOnlyDealId = await makeDeal('closed-only', [comp3]);
  await setAvailability(closedBranchId, comp3, true);
  await setAvailability(branchAId, comp3, false);
  await setAvailability(branchBId, comp3, false);
});

afterAll(async () => {
  server?.close();
});

describe('GET /deals/products', () => {
  // AC1 — deals list requires no branch selection.
  it('with no branchId returns deals with available:true (no branch gate)', async () => {
    const { ids, json } = await dealIds();
    expect(ids).toContain(fullyAvailableDealId);
    expect(ids).toContain(unavailableAtADealId);
    // No branch => everything is available.
    expect(findDeal(json, fullyAvailableDealId).available).toBe(true);
    expect(findDeal(json, unavailableAtADealId).available).toBe(true);
  });

  it('returns the deal-menu shape (isDeal + components populated) for each deal', async () => {
    const { json } = await dealIds();
    const deal = findDeal(json, fullyAvailableDealId);
    expect(deal.isDeal).toBe(true);
    expect(Array.isArray(deal.components)).toBe(true);
    expect(deal.components.length).toBe(1);
  });

  // AC2 — all-branch visibility: the same deal appears at every branch.
  it('same deal appears when fetched from two different branches', async () => {
    const atA = await dealIds(`?branchId=${branchAId}`);
    const atB = await dealIds(`?branchId=${branchBId}`);
    expect(atA.ids).toContain(fullyAvailableDealId);
    expect(atB.ids).toContain(fullyAvailableDealId);
  });

  // AC3 (route half) — flag-not-hide: an unfulfillable deal is PRESENT with
  // available:false, never dropped.
  it('flags a component-unavailable deal available:false at that branch (not hidden)', async () => {
    const atA = await dealIds(`?branchId=${branchAId}`);
    // The deal is STILL in the list (flag-not-hide).
    expect(atA.ids).toContain(unavailableAtADealId);
    expect(findDeal(atA.json, unavailableAtADealId).available).toBe(false);
    // The fully-available sibling stays available.
    expect(findDeal(atA.json, fullyAvailableDealId).available).toBe(true);
  });

  it('flags the same deal available:true at a branch that can fulfil it', async () => {
    const atB = await dealIds(`?branchId=${branchBId}`);
    expect(atB.ids).toContain(unavailableAtADealId);
    expect(findDeal(atB.json, unavailableAtADealId).available).toBe(true);
  });

  it('rejects an invalid branchId with 400 (not 500)', async () => {
    const { status, json } = await get('/deals/products?branchId=not-a-uuid');
    expect(status).toBe(400);
    expect(json.error).toBe('Invalid branchId');
  });

  // E1 — Express route precedence: /deals/products must resolve to the
  // products-list handler, NOT be captured by /deals/:id (which would 404 or
  // return the single-deal { deal } shape).
  it('E1: GET /deals/products resolves to the products-list handler, not /deals/:id', async () => {
    const { status, json } = await get('/deals/products');
    expect(status).toBe(200);
    // products-list shape has `categories`; the /deals/:id single-deal shape
    // would have `{ deal }` (or a 404 { error }). Prove we hit the right handler.
    expect(Array.isArray(json.categories)).toBe(true);
    expect(json.deal).toBeUndefined();
    expect(json.error).toBeUndefined();
  });

  it('E1: a non-uuid path under /deals/products (e.g. /deals/products/notanid) 404s, not a deal result', async () => {
    // /deals/products has no /:id handler, so an extra segment falls through to
    // Express's default 404 — never a { deal } result from /deals/:id.
    const { status, json } = await get('/deals/products/notanid');
    expect(status).toBe(404);
    expect(json?.deal).toBeUndefined();
  });
});

// home-all-branches — the additive `branches[]` field. `available` is asserted
// UNCHANGED throughout (regression lock: this plan only ADDS a field).
describe('GET /deals/products — branches[] (home-all-branches)', () => {
  /** Branch display names on a deal's `branches[]`, sorted for order-insensitivity. */
  function names(deal: any): string[] {
    return (deal.branches as { name: string }[]).map((b) => b.name).sort();
  }

  it('lists every accepting-pickup branch that can fulfil the deal', async () => {
    const { json } = await dealIds();
    const deal = findDeal(json, fullyAvailableDealId);

    expect(names(deal)).toEqual([branchAName, branchBName].sort());
  });

  it('lists only the branches that can actually fulfil a partly-unavailable deal', async () => {
    const { json } = await dealIds();
    const deal = findDeal(json, unavailableAtADealId);

    // Component is DOWN at A, UP at B → exactly one carrying branch.
    expect(names(deal)).toEqual([branchBName]);
    expect(deal.branches).toEqual([{ id: branchBId, name: branchBName }]);
  });

  it('returns branches: [] for a deal no branch can fulfil, and still lists it', async () => {
    const { ids, json } = await dealIds();

    expect(ids).toContain(nowhereAvailableDealId);
    expect(findDeal(json, nowhereAvailableDealId).branches).toEqual([]);
  });

  it('excludes an active-but-not-accepting-pickup branch from branches[]', async () => {
    const { ids, json } = await dealIds();

    const everyBranchName = json.categories
      .flatMap((c: any) => c.products)
      .flatMap((p: any) => (p.branches as { name: string }[]).map((b) => b.name));
    expect(everyBranchName).not.toContain(closedBranchName);

    // The deal only that branch could fulfil is still listed, with an empty list.
    expect(ids).toContain(closedOnlyDealId);
    expect(findDeal(json, closedOnlyDealId).branches).toEqual([]);
  });

  it('leaves the existing per-branch `available` flag unchanged', async () => {
    const atA = await dealIds(`?branchId=${branchAId}`);

    // Regression lock: `available` still reflects the SELECTED branch only...
    expect(findDeal(atA.json, unavailableAtADealId).available).toBe(false);
    expect(findDeal(atA.json, fullyAvailableDealId).available).toBe(true);
    // ...while `branches[]` independently reports where it CAN be fulfilled.
    expect(names(findDeal(atA.json, unavailableAtADealId))).toEqual([branchBName]);
  });
});

// AC3 (placement half) — reuses the existing orders.ts placement path (no new
// placement code). Placing a deal whose component is unavailable at the branch is
// rejected server-side. The comprehensive MENU-003 placement matrix lives in
// orders.test.ts (AC5, HARD); this is a focused DEAL-004 confirmation that the
// flag surfaced by GET /deals/products lines up with the placement verdict.
describe('POST /orders — component-unavailable deal rejected at placement', () => {
  const orderBody = (branchId: string, productId: string) => ({
    branchId,
    paymentMethod: 'pay_at_branch' as const,
    items: [{ productId, quantity: 1, selectedOptions: [] }],
  });

  it('rejects placing the deal at branch A where its component is unavailable', async () => {
    const { status } = await post('/orders', {
      user: userId,
      body: orderBody(branchAId, unavailableAtADealId),
    });
    expect(status).toBe(400);
  });

  it('accepts placing the deal at branch B where its component is available', async () => {
    const { status } = await post('/orders', {
      user: userId,
      body: orderBody(branchBId, unavailableAtADealId),
    });
    expect(status).toBe(201);
  });
});
