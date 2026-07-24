/* eslint-disable @typescript-eslint/no-explicit-any -- fetch JSON bodies and the
   getSession stub are loosely typed at the test boundary; assertions narrow them. */
import type { AddressInfo } from 'node:net';

import { eq } from 'drizzle-orm';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ORDER_NOTIFICATION_TYPES } from '@jojopotato/types';

/**
 * Integration tests for `POST /orders/:orderId/review` (order-completion-celebration).
 * Run against a real local Postgres (same DB as `db:migrate`):
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Auth is stubbed at the `auth.api.getSession` seam (an `x-test-user` header
 * selects the caller), mirroring cart/orders integration tests, so the
 * ownership paths are exercised deterministically. All `reviews` writes are real.
 *
 * These are the proportionate control substituting for the waived 5-artifact risk
 * pack — Known-Gap is BANNED on AC5-AC8 (validate-contract E5):
 *   AC5 — writes a row for an owned completed order; cross-user → 403, no row
 *   AC6 — non-`completed` order → 409, no row
 *   AC7 — second review for same order → 409 (D8), original row unchanged
 *   AC8 — rating out of 1–5 / missing → 422, no row
 *   AC4 — no new OrderNotificationEvent member added (push surface frozen)
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

// Fixtures.
let userA: string;
let userB: string;
let branchId: string;

async function req(
  method: string,
  path: string,
  opts: { user?: string; body?: unknown } = {},
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.user) headers['x-test-user'] = opts.user;
  const res = await fetch(base + path, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** Insert an order owned by `userId` in `status`, returning its id. */
async function makeOrder(
  userId: string,
  status: 'completed' | 'ready' | 'pending' | 'cancelled',
): Promise<string> {
  const [order] = await db
    .insert(schema.orders)
    .values({
      user_id: userId,
      branch_id: branchId,
      order_number: `JP-REV-${uid()}`,
      status,
      subtotal: '100.00',
      total: '100.00',
      payment_method: 'pay_at_branch',
      placed_at: new Date(),
    })
    .returning();
  return order!.id;
}

/** Count review rows for an order (ownership/no-row assertions). */
async function reviewCount(orderId: string): Promise<number> {
  const rows = await db.select().from(schema.reviews).where(eq(schema.reviews.order_id, orderId));
  return rows.length;
}

beforeAll(async () => {
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  const { ordersRouter } = await import('../orders');

  const { auth } = await import('../../lib/auth');
  vi.spyOn(auth.api, 'getSession').mockImplementation((async ({ headers }: any) => {
    const id = headers.get('x-test-user');
    if (!id) return null;
    return { session: { id: `sess-${id}`, userId: id }, user: { id } };
  }) as any);

  const app = express();
  app.use(express.json());
  app.use('/orders', ordersRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const suffix = uid();

  const [ua] = await db
    .insert(schema.users)
    .values({ name: 'Review User A', email: `rev-a-${suffix}@example.com` })
    .returning();
  userA = ua!.id;
  const [ub] = await db
    .insert(schema.users)
    .values({ name: 'Review User B', email: `rev-b-${suffix}@example.com` })
    .returning();
  userB = ub!.id;

  const [b1] = await db
    .insert(schema.branches)
    .values({
      name: `RevBranch ${suffix}`,
      slug: `rev-branch-${suffix}`,
      address: '1 St',
      latitude: '14.5',
      longitude: '120.9',
      phone: '+639170000020',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 20,
    })
    .returning();
  branchId = b1!.id;
});

// Hermetic: clear any review rows created by prior tests (fresh orders per test
// mean no order_id collision, but keep the table clean regardless).
beforeEach(async () => {
  await db.delete(schema.reviews);
});

afterAll(async () => {
  server?.close();
});

describe('order-completion-celebration — POST /orders/:orderId/review', () => {
  it('AC5: writes a review row for an owned completed order (happy path)', async () => {
    const orderId = await makeOrder(userA, 'completed');

    const res = await req('POST', `/orders/${orderId}/review`, {
      user: userA,
      body: { rating: 5, comment: 'Great fries!' },
    });

    expect(res.status).toBe(200);
    expect(res.json.review.orderId).toBe(orderId);
    expect(res.json.review.userId).toBe(userA);
    expect(res.json.review.rating).toBe(5);
    expect(res.json.review.comment).toBe('Great fries!');
    expect(typeof res.json.review.createdAt).toBe('string');
    expect(await reviewCount(orderId)).toBe(1);
  });

  it('AC5: a rating-only review persists a null comment', async () => {
    const orderId = await makeOrder(userA, 'completed');

    const res = await req('POST', `/orders/${orderId}/review`, {
      user: userA,
      body: { rating: 4 },
    });

    expect(res.status).toBe(200);
    expect(res.json.review.comment).toBeNull();
    expect(await reviewCount(orderId)).toBe(1);
  });

  it('AC5: a cross-user caller gets 403 and NO row is written (ownership before state)', async () => {
    const orderId = await makeOrder(userA, 'completed');

    const res = await req('POST', `/orders/${orderId}/review`, {
      user: userB,
      body: { rating: 5, comment: 'not mine' },
    });

    expect(res.status).toBe(403);
    // No review row for anyone — the boundary blocked before any write.
    expect(await reviewCount(orderId)).toBe(0);
  });

  it('AC5: an unauthenticated caller is rejected by requireSession (401)', async () => {
    const orderId = await makeOrder(userA, 'completed');
    const res = await req('POST', `/orders/${orderId}/review`, { body: { rating: 5 } });
    expect(res.status).toBe(401);
    expect(await reviewCount(orderId)).toBe(0);
  });

  it('AC5: a malformed order id → 404 (no existence oracle)', async () => {
    const res = await req('POST', `/orders/not-a-uuid/review`, {
      user: userA,
      body: { rating: 5 },
    });
    expect(res.status).toBe(404);
  });

  it('AC5: a well-formed but nonexistent order id → 404', async () => {
    const res = await req('POST', `/orders/${crypto.randomUUID()}/review`, {
      user: userA,
      body: { rating: 5 },
    });
    expect(res.status).toBe(404);
  });

  it('AC6: reviewing a ready order → 409, no row', async () => {
    const orderId = await makeOrder(userA, 'ready');

    const res = await req('POST', `/orders/${orderId}/review`, {
      user: userA,
      body: { rating: 5 },
    });

    expect(res.status).toBe(409);
    expect(await reviewCount(orderId)).toBe(0);
  });

  it('AC6: reviewing a pending order → 409, no row', async () => {
    const orderId = await makeOrder(userA, 'pending');
    const res = await req('POST', `/orders/${orderId}/review`, {
      user: userA,
      body: { rating: 3 },
    });
    expect(res.status).toBe(409);
    expect(await reviewCount(orderId)).toBe(0);
  });

  it('AC7: a second review for the same order → 409, original row unchanged (D8)', async () => {
    const orderId = await makeOrder(userA, 'completed');

    const first = await req('POST', `/orders/${orderId}/review`, {
      user: userA,
      body: { rating: 5, comment: 'first' },
    });
    expect(first.status).toBe(200);
    const firstReviewId = first.json.review.id as string;

    const second = await req('POST', `/orders/${orderId}/review`, {
      user: userA,
      body: { rating: 1, comment: 'changed my mind' },
    });
    expect(second.status).toBe(409);

    // Exactly one row, unchanged from the first submission.
    const rows = await db.select().from(schema.reviews).where(eq(schema.reviews.order_id, orderId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(firstReviewId);
    expect(rows[0]!.rating).toBe(5);
    expect(rows[0]!.comment).toBe('first');
  });

  it('AC8: rating above 5 → 422, no row', async () => {
    const orderId = await makeOrder(userA, 'completed');
    const res = await req('POST', `/orders/${orderId}/review`, {
      user: userA,
      body: { rating: 6 },
    });
    expect(res.status).toBe(422);
    expect(await reviewCount(orderId)).toBe(0);
  });

  it('AC8: rating below 1 → 422, no row', async () => {
    const orderId = await makeOrder(userA, 'completed');
    const res = await req('POST', `/orders/${orderId}/review`, {
      user: userA,
      body: { rating: 0 },
    });
    expect(res.status).toBe(422);
    expect(await reviewCount(orderId)).toBe(0);
  });

  it('AC8: a non-integer rating → 422, no row', async () => {
    const orderId = await makeOrder(userA, 'completed');
    const res = await req('POST', `/orders/${orderId}/review`, {
      user: userA,
      body: { rating: 3.5 },
    });
    expect(res.status).toBe(422);
    expect(await reviewCount(orderId)).toBe(0);
  });

  it('AC8: a missing rating → 422, no row', async () => {
    const orderId = await makeOrder(userA, 'completed');
    const res = await req('POST', `/orders/${orderId}/review`, {
      user: userA,
      body: { comment: 'no rating' },
    });
    expect(res.status).toBe(422);
    expect(await reviewCount(orderId)).toBe(0);
  });

  it('AC4: no new OrderNotificationEvent member was added by the review feature', () => {
    // The completion push surface stays frozen: only the 4 original order kinds.
    expect([...ORDER_NOTIFICATION_TYPES].sort()).toEqual([
      'order_accepted',
      'order_cancelled',
      'order_preparing',
      'order_ready',
    ]);
  });
});
