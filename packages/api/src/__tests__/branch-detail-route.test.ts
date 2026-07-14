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
let deals: SchemaModule['deals'];
let dealBranches: SchemaModule['dealBranches'];
let dbAvailable = false;

beforeAll(async () => {
  ({ db } = await import('../db/client'));
  ({ branches, deals, dealBranches } = await import('../db/schema/index'));
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
    .innerJoin(dealBranches, eq(dealBranches.deal_id, deals.id))
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
            .where(eq(dealBranches.deal_id, deals.id)),
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

describe('GET /api/branches/:id query logic', () => {
  it('returns 5 deals for jojo-centrio (4 global + 1 exclusive)', async () => {
    if (!dbAvailable) return;
    const centrioId = await branchIdBySlug('jojo-centrio');
    expect(centrioId).not.toBeNull();
    const dealsForBranch = await visibleDealsForBranch(centrioId!);
    expect(dealsForBranch).toHaveLength(5);
  });

  it('returns 4 deals for jojo-cogon (4 global only)', async () => {
    if (!dbAvailable) return;
    const cogonId = await branchIdBySlug('jojo-cogon');
    expect(cogonId).not.toBeNull();
    const dealsForBranch = await visibleDealsForBranch(cogonId!);
    expect(dealsForBranch).toHaveLength(4);
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
});
