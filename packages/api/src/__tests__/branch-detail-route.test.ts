import { and, eq, gte, lte, notExists, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration test for the `GET /api/branches/:id` deal-selection query logic,
 * run against a real local Postgres (the same DB the `db:migrate` + `db:seed`
 * flow uses).
 *
 * Requires a running Postgres reachable via DATABASE_URL (default:
 * postgres://jojo:jojo@localhost:5432/jojopotato) with migrations applied and
 * the branches/deals/deal_branches tables seeded:
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
 *   pnpm --filter @jojopotato/api db:seed
 *
 * This exercises the exact Drizzle queries the route handler runs: Query A
 * (deals explicitly mapped to a branch) UNION Query B (global deals with no
 * deal_branches rows), filtered active + within window. The HTTP layer itself
 * (supertest against a live server port) is a documented known-gap (`api-http`)
 * — see the plan's Verification Evidence table.
 *
 * If the DB is unreachable, the suite is skipped rather than failing, so the
 * `pnpm --filter @jojopotato/api test` gate stays runnable without Postgres.
 * This is a Hybrid gate: green only means "query logic verified against a live
 * seeded DB"; a skipped run is not a pass.
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';

type DbModule = typeof import('../db/client');
type SchemaModule = typeof import('../db/schema/index');

let db: DbModule['db'];
let branches: SchemaModule['branches'];
// ADM-008: schema symbols renamed deals→offers, dealBranches→offerBranches.
// Bind to the same local names (aliased) so the mirror-query body below is
// unchanged apart from the .deal_id → .offer_id column rename.
let deals: SchemaModule['offers'];
let dealBranches: SchemaModule['offerBranches'];
let dbAvailable = false;

beforeAll(async () => {
  ({ db } = await import('../db/client'));
  ({ offers: deals, offerBranches: dealBranches } = await import('../db/schema/index'));
  ({ branches } = await import('../db/schema/index'));
  try {
    // Cheap connectivity + migration probe: if this select throws (no DB, or
    // migrations weren't applied), skip.
    await db.select().from(branches).limit(1);
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  // Close the module-scoped pool opened in beforeAll so no DB connections leak
  // past the suite. Runs regardless of dbAvailable — the pool is created by the
  // db/client import (which succeeds even when the connectivity probe fails).
  // `db.$client` is the underlying pg Pool.
  await db?.$client.end();
});

/** Look up a branch UUID by its seed slug. Returns null when not found. */
async function branchIdBySlug(slug: string): Promise<string | null> {
  const rows = await db.select().from(branches).where(eq(branches.slug, slug));
  return rows[0]?.id ?? null;
}

/**
 * Mirror of the route handler's deal selection: Query A (explicit) + Query B
 * (global), merged + deduped by id.
 */
async function visibleDealsForBranch(branchId: string) {
  const now = new Date();

  const explicitRows = await db
    .select({ deal: deals })
    .from(deals)
    .innerJoin(dealBranches, eq(dealBranches.offer_id, deals.id))
    .where(
      and(
        eq(dealBranches.branch_id, branchId),
        eq(deals.is_active, true),
        lte(deals.start_at, now),
        gte(deals.end_at, now),
      ),
    );

  const globalRows = await db
    .select()
    .from(deals)
    .where(
      and(
        notExists(
          db
            .select({ one: sql`1` })
            .from(dealBranches)
            .where(eq(dealBranches.offer_id, deals.id)),
        ),
        eq(deals.is_active, true),
        lte(deals.start_at, now),
        gte(deals.end_at, now),
      ),
    );

  const byId = new Map<string, (typeof globalRows)[number]>();
  for (const r of explicitRows) byId.set(r.deal.id, r.deal);
  for (const r of globalRows) byId.set(r.id, r);
  return [...byId.values()];
}

// The 4 seeded branch-agnostic deals + the 1 seeded branch-exclusive deal, by
// title. Presence-checked by identity (not an exact array length) since the
// shared dev/test DB also carries hermetic fixture deals inserted by other
// suites (e.g. `deals.test.ts`) — see that file's HERMETIC RULE docstring.
const SEEDED_GLOBAL_DEAL_TITLES = [
  'First app order: Free lemonade upgrade',
  'Snack break deal: Fries + Lemonade bundle',
  'Buy 1 Take 1 lemonade',
  'Weekend combo deal',
];
const SEEDED_EXCLUSIVE_DEAL_TITLE = 'Branch-exclusive opening promo';

describe('GET /api/branches/:id query logic', () => {
  it('includes all 4 seeded global deals + the 1 seeded exclusive deal for jojo-centrio', async () => {
    if (!dbAvailable) return;
    const centrioId = await branchIdBySlug('jojo-centrio');
    expect(centrioId).not.toBeNull();
    const dealsForBranch = await visibleDealsForBranch(centrioId!);
    const titles = dealsForBranch.map((d) => d.title);
    for (const title of SEEDED_GLOBAL_DEAL_TITLES) expect(titles).toContain(title);
    expect(titles).toContain(SEEDED_EXCLUSIVE_DEAL_TITLE);
  });

  it('includes all 4 seeded global deals for jojo-cogon (exclusive deal not mapped here)', async () => {
    if (!dbAvailable) return;
    const cogonId = await branchIdBySlug('jojo-cogon');
    expect(cogonId).not.toBeNull();
    const dealsForBranch = await visibleDealsForBranch(cogonId!);
    const titles = dealsForBranch.map((d) => d.title);
    for (const title of SEEDED_GLOBAL_DEAL_TITLES) expect(titles).toContain(title);
  });

  it('Centrio exclusive deal is absent from jojo-cogon response', async () => {
    if (!dbAvailable) return;
    const cogonId = await branchIdBySlug('jojo-cogon');
    expect(cogonId).not.toBeNull();
    const dealsForBranch = await visibleDealsForBranch(cogonId!);
    const titles = dealsForBranch.map((d) => d.title);
    // The branch-exclusive deal is mapped only to jojo-centrio via deal_branches.
    expect(titles).not.toContain('Branch-exclusive opening promo');
  });

  it('returns branch fields for jojo-sm-downtown', async () => {
    if (!dbAvailable) return;
    const rows = await db.select().from(branches).where(eq(branches.slug, 'jojo-sm-downtown'));
    const branchRow = rows[0];
    expect(branchRow).toBeDefined();
    expect(typeof branchRow!.id).toBe('string');
    expect(typeof branchRow!.name).toBe('string');
    expect(branchRow!.slug).toBe('jojo-sm-downtown');
    // SM Downtown is open but pickup-paused (is_accepting_pickup: false).
    expect(branchRow!.is_accepting_pickup).toBe(false);
  });

  // AC10b wire-freeze (Locked Decision 7B): the GET /api/branches/:id
  // `{ branch, deals: [...] }` array items are the source rows spread verbatim
  // (`...d`), so the ADM-008 deals→offers TABLE rename must NOT rename the row's
  // public column fields. Assert the frozen deal-item field set still surfaces on
  // a returned row post-rename — the offers table kept its `deal_*` column names.
  it('deals array items expose the frozen public field set after the offers rename (AC10b)', async () => {
    if (!dbAvailable) return;
    const centrioId = await branchIdBySlug('jojo-centrio');
    expect(centrioId).not.toBeNull();
    const dealsForBranch = await visibleDealsForBranch(centrioId!);
    const sample = dealsForBranch[0];
    expect(sample).toBeDefined();
    for (const key of [
      'id',
      'title',
      'deal_type',
      'discount_value',
      'is_active',
      'start_at',
      'end_at',
    ]) {
      expect(sample).toHaveProperty(key);
    }
  });
});
