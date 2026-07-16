import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Seed-shape coverage for STAR-004 AC8: the tier-1 reward is bound to a real
 * product and the dev test user gets exactly one `available` reward coupon.
 *
 * Runs `runSeed()` directly (idempotent) against the real local Postgres so the
 * assertions do not depend on the vitest globalSetup ordering vs. the sibling
 * `seed-test-user.test.ts` (which manages jojo@test.com's lifecycle).
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';

type SeedModule = typeof import('../seed');
type DbModule = typeof import('../../client');
type SchemaModule = typeof import('../../schema/index');

let runSeed: SeedModule['runSeed'];
let db: DbModule['db'];
let schema: SchemaModule;

const TEST_EMAIL = 'jojo@test.com';
const TIER_1_NAME = 'Free regular fries or lemonade';
const CLASSIC_FRIES_SLUG = 'classic-fries';

beforeAll(async () => {
  ({ runSeed } = await import('../seed'));
  ({ db } = await import('../../client'));
  schema = await import('../../schema/index');
  await runSeed();
});

describe('seed — STAR-004 reward binding + coupon (AC8)', () => {
  it('binds the tier-1 reward to the classic-fries product', async () => {
    const [product] = await db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(eq(schema.products.slug, CLASSIC_FRIES_SLUG));
    expect(product).toBeDefined();

    const [reward] = await db
      .select({ eligible: schema.rewards.eligible_product_id })
      .from(schema.rewards)
      .where(eq(schema.rewards.name, TIER_1_NAME));
    expect(reward).toBeDefined();
    expect(reward!.eligible).toBe(product!.id);
  });

  it('mints exactly one available reward coupon for jojo@test.com, idempotent on re-seed', async () => {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, TEST_EMAIL));
    expect(user).toBeDefined();

    const [reward] = await db
      .select({ id: schema.rewards.id })
      .from(schema.rewards)
      .where(eq(schema.rewards.name, TIER_1_NAME));

    const couponsBefore = await db
      .select()
      .from(schema.coupons)
      .where(and(eq(schema.coupons.user_id, user!.id), eq(schema.coupons.reward_id, reward!.id)));
    expect(couponsBefore).toHaveLength(1);
    expect(couponsBefore[0]!.status).toBe('available');
    expect(couponsBefore[0]!.code).toMatch(/^JP-RWD-/);

    // Re-seed: the 0006 partial unique index makes the mint a no-op.
    await runSeed();

    const couponsAfter = await db
      .select()
      .from(schema.coupons)
      .where(and(eq(schema.coupons.user_id, user!.id), eq(schema.coupons.reward_id, reward!.id)));
    expect(couponsAfter).toHaveLength(1);
  });
});
