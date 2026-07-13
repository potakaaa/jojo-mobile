import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration tests for `GET /api/branches` — run against a real local Postgres
 * (same DB `db:migrate` targets). Requires:
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Fixtures are self-contained (unique `zz-test-branches-*` slugs) and cleaned up
 * in afterAll — seed data is not relied upon or mutated.
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';

type SchemaModule = typeof import('../../db/schema/index');
type DbModule = typeof import('../../db/client');

let db: DbModule['db'];
let branches: SchemaModule['branches'];
let server: Server;
let baseUrl: string;

const RUN_SUFFIX = randomUUID().slice(0, 8);
const SLUG_ACTIVE = `zz-test-branches-active-${RUN_SUFFIX}`;
const SLUG_INACTIVE = `zz-test-branches-inactive-${RUN_SUFFIX}`;
let activeId = '';
let inactiveId = '';

async function insertBranch(slug: string, isActive: boolean): Promise<string> {
  const [row] = await db
    .insert(branches)
    .values({
      name: `Test ${slug}`,
      slug,
      address: '1 Test St',
      latitude: '10.000000',
      longitude: '123.000000',
      phone: '+63 32 000 0000',
      opening_hours: JSON.stringify({ mon: { open: '09:00', close: '21:00' } }),
      is_active: isActive,
    })
    .onConflictDoUpdate({ target: branches.slug, set: { is_active: isActive } })
    .returning({ id: branches.id });
  return row!.id;
}

beforeAll(async () => {
  ({ db } = await import('../../db/client'));
  ({ branches } = await import('../../db/schema/index'));
  const { branchesRouter } = await import('../branches');

  activeId = await insertBranch(SLUG_ACTIVE, true);
  inactiveId = await insertBranch(SLUG_INACTIVE, false);

  const app = express();
  app.use('/api/branches', branchesRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await db.delete(branches).where(eq(branches.slug, SLUG_ACTIVE));
  await db.delete(branches).where(eq(branches.slug, SLUG_INACTIVE));
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /api/branches', () => {
  it('returns only active branches, in the camelCase contract shape', async () => {
    const res = await fetch(`${baseUrl}/api/branches`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      branches: { id: string; isActive: boolean; latitude: number; slug: string }[];
    };

    const ids = body.branches.map((b) => b.id);
    expect(ids).toContain(activeId);
    expect(ids).not.toContain(inactiveId);

    const active = body.branches.find((b) => b.id === activeId)!;
    expect(active.isActive).toBe(true);
    expect(typeof active.latitude).toBe('number');
    expect(active.slug).toBe(SLUG_ACTIVE);
  });
});
