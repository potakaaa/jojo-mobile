/* eslint-disable @typescript-eslint/no-explicit-any -- fetch JSON bodies are
   loosely typed at the test boundary; assertions narrow them per case. */
import type { AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration tests for the public GET /deals route. Run against a real local
 * Postgres (same DB as `db:migrate`):
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * HERMETIC RULE: the shared DB carries seeded active deals. Every assertion here
 * checks presence/absence of THIS test's own uniquely-suffixed fixtures by id —
 * NEVER a global array length or global emptiness.
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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ids created in setup, referenced by assertions
let agnosticPercentDealId: string;
let scopedFixedDealId: string;
let expiredDealId: string;
let inactiveDealId: string;
let scopedBranchId: string;
let otherBranchId: string;

beforeAll(async () => {
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  const { dealsRouter } = await import('../deals');

  const app = express();
  app.use(express.json());
  app.use('/deals', dealsRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const suffix = uid();
  const now = Date.now();

  const [scopedBranch] = await db
    .insert(schema.branches)
    .values({
      name: `Deal Scope Branch ${suffix}`,
      slug: `deal-scope-${suffix}`,
      address: '1 Deal St',
      latitude: '14.500000',
      longitude: '120.900000',
      phone: '+639170000010',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 20,
    })
    .returning();
  scopedBranchId = scopedBranch!.id;

  const [otherBranch] = await db
    .insert(schema.branches)
    .values({
      name: `Deal Other Branch ${suffix}`,
      slug: `deal-other-${suffix}`,
      address: '2 Deal Ave',
      latitude: '14.600000',
      longitude: '120.950000',
      phone: '+639170000011',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 20,
    })
    .returning();
  otherBranchId = otherBranch!.id;

  // Branch-agnostic, active, in-window percentage_discount (value stays un-scaled).
  const [agnostic] = await db
    .insert(schema.offers)
    .values({
      title: `Agnostic 20% ${suffix}`,
      deal_type: 'percentage_discount',
      discount_value: '20.00',
      minimum_order_amount: '15.00',
      start_at: new Date(now - HOUR),
      end_at: new Date(now + DAY),
      is_active: true,
    })
    .returning();
  agnosticPercentDealId = agnostic!.id;

  // Branch-scoped, active, in-window fixed_discount (value → cents).
  const [scopedFixed] = await db
    .insert(schema.offers)
    .values({
      title: `Scoped ₱50 ${suffix}`,
      deal_type: 'fixed_discount',
      discount_value: '50.00',
      minimum_order_amount: '0',
      start_at: new Date(now - HOUR),
      end_at: new Date(now + DAY),
      is_active: true,
    })
    .returning();
  scopedFixedDealId = scopedFixed!.id;
  await db
    .insert(schema.offerBranches)
    .values({ offer_id: scopedFixedDealId, branch_id: scopedBranchId });

  // Expired (end_at in the past), otherwise active + agnostic.
  const [expired] = await db
    .insert(schema.offers)
    .values({
      title: `Expired ${suffix}`,
      deal_type: 'percentage_discount',
      discount_value: '10.00',
      start_at: new Date(now - 2 * DAY),
      end_at: new Date(now - DAY),
      is_active: true,
    })
    .returning();
  expiredDealId = expired!.id;

  // Inactive, otherwise in-window + agnostic.
  const [inactive] = await db
    .insert(schema.offers)
    .values({
      title: `Inactive ${suffix}`,
      deal_type: 'percentage_discount',
      discount_value: '10.00',
      start_at: new Date(now - HOUR),
      end_at: new Date(now + DAY),
      is_active: false,
    })
    .returning();
  inactiveDealId = inactive!.id;
});

afterAll(async () => {
  server?.close();
});

describe('GET /deals', () => {
  it('returns a { deals: <array> } envelope and excludes own expired/inactive fixtures (structural empty proof)', async () => {
    const { status, json } = await get('/deals');
    expect(status).toBe(200);
    expect(Array.isArray(json.deals)).toBe(true);
    const ids = json.deals.map((d: any) => d.id);
    expect(ids).not.toContain(expiredDealId);
    expect(ids).not.toContain(inactiveDealId);
  });

  it('excludes own expired and inactive fixtures, includes own in-window active agnostic fixture by id', async () => {
    const { json } = await get('/deals');
    const ids = json.deals.map((d: any) => d.id);
    expect(ids).toContain(agnosticPercentDealId);
    expect(ids).not.toContain(expiredDealId);
    expect(ids).not.toContain(inactiveDealId);
  });

  it('own branch-agnostic fixture present for any branchId; own scoped fixture only for its branch; excludes own scoped fixture for another branch', async () => {
    const scoped = await get(`/deals?branchId=${scopedBranchId}`);
    const scopedIds = scoped.json.deals.map((d: any) => d.id);
    expect(scopedIds).toContain(agnosticPercentDealId);
    expect(scopedIds).toContain(scopedFixedDealId);

    const other = await get(`/deals?branchId=${otherBranchId}`);
    const otherIds = other.json.deals.map((d: any) => d.id);
    expect(otherIds).toContain(agnosticPercentDealId);
    expect(otherIds).not.toContain(scopedFixedDealId);
  });

  it('no branchId returns own agnostic fixture and excludes own scoped fixture', async () => {
    const { json } = await get('/deals');
    const ids = json.deals.map((d: any) => d.id);
    expect(ids).toContain(agnosticPercentDealId);
    expect(ids).not.toContain(scopedFixedDealId);
  });

  it('money: percentage value NOT scaled; fixed value is cents; minimumOrderAmount is cents; serialized field names match ApiDeal', async () => {
    const { json } = await get(`/deals?branchId=${scopedBranchId}`);
    const agnostic = json.deals.find((d: any) => d.id === agnosticPercentDealId);
    const scoped = json.deals.find((d: any) => d.id === scopedFixedDealId);

    // percentage_discount: 20 stays 20 (NOT 2000); minimumOrderAmount → cents.
    expect(agnostic.discountValue).toBe(20);
    expect(agnostic.minimumOrderAmount).toBe(1500);
    expect(agnostic.discountLabel).toBe('20% OFF');

    // fixed_discount: "50.00" → 5000 cents.
    expect(scoped.discountValue).toBe(5000);
    expect(scoped.discountLabel).toBe('₱50 OFF');

    // Field-name guard for the client's un-validated `as Deal[]` cast.
    for (const key of [
      'id',
      'title',
      'discountLabel',
      'dealType',
      'discountValue',
      'minimumOrderAmount',
      'startAt',
      'endAt',
      'isActive',
      'eligibleProductIds',
      'eligibleBranchIds',
    ]) {
      expect(agnostic).toHaveProperty(key);
    }
    expect(scoped.eligibleBranchIds).toContain(scopedBranchId);
  });

  it('invalid branchId query returns 400 not 500', async () => {
    const { status, json } = await get('/deals?branchId=not-a-uuid');
    expect(status).toBe(400);
    expect(json.error).toBe('Invalid branchId');
  });
});

describe('GET /deals/:id', () => {
  it('returns 200 { deal } with matching id and exact ApiDeal field names', async () => {
    const { status, json } = await get(`/deals/${agnosticPercentDealId}`);
    expect(status).toBe(200);
    expect(json.deal.id).toBe(agnosticPercentDealId);
    for (const key of [
      'id',
      'title',
      'discountLabel',
      'dealType',
      'discountValue',
      'minimumOrderAmount',
      'startAt',
      'endAt',
      'isActive',
      'eligibleProductIds',
      'eligibleBranchIds',
    ]) {
      expect(json.deal).toHaveProperty(key);
    }
  });

  it('money parity: agnostic percentage un-scaled + label + min→cents; scopedFixed cents + label', async () => {
    const agnostic = await get(`/deals/${agnosticPercentDealId}`);
    expect(agnostic.json.deal.discountValue).toBe(20);
    expect(agnostic.json.deal.discountLabel).toBe('20% OFF');
    expect(agnostic.json.deal.minimumOrderAmount).toBe(1500);

    const scoped = await get(`/deals/${scopedFixedDealId}`);
    expect(scoped.json.deal.discountValue).toBe(5000);
    expect(scoped.json.deal.discountLabel).toBe('₱50 OFF');
  });

  it('returns a branch-scoped deal regardless of branch context (no branch-filter — decision 2)', async () => {
    const { status, json } = await get(`/deals/${scopedFixedDealId}`);
    expect(status).toBe(200);
    expect(json.deal.id).toBe(scopedFixedDealId);
    expect(json.deal.eligibleBranchIds).toContain(scopedBranchId);
  });

  it('returns 200 for an expired-but-active deal (no window filter — decision 4)', async () => {
    const { status, json } = await get(`/deals/${expiredDealId}`);
    expect(status).toBe(200);
    expect(json.deal.id).toBe(expiredDealId);
    expect(json.deal.isActive).toBe(true);
  });

  it('returns 404 { error } for an inactive deal', async () => {
    const { status, json } = await get(`/deals/${inactiveDealId}`);
    expect(status).toBe(404);
    expect(json.error).toBe('Deal not found');
  });

  it('returns 404 for an unknown valid-format uuid', async () => {
    const { status } = await get('/deals/00000000-0000-4000-8000-000000000000');
    expect(status).toBe(404);
  });

  it('returns 404 (not 500) for a malformed id', async () => {
    const { status, json } = await get('/deals/not-a-uuid');
    expect(status).toBe(404);
    expect(json.error).toBe('Deal not found');
  });
});
