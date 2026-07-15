import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * AC-1 (PUSH-004 / #75) — device token registration.
 *
 * A device token is registered ONCE per physical device; re-registering the same
 * device with a rotated token UPDATES the same row (upsert on `(user_id,
 * device_id)`) rather than inserting a duplicate.
 *
 * Hermetic: seeds its OWN customer user and cleans up in afterAll.
 * Runs against a real local Postgres (docker compose up -d + db:migrate).
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.VITEST = 'true';

type AuthModule = typeof import('../../lib/auth');
type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');
type IndexModule = typeof import('../../index');

let auth: AuthModule['auth'];
let db: DbModule['db'];
let schema: SchemaModule;
let app: IndexModule['app'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);
const suffix = unique();

let userId: string;
let userCookies: string[];

async function signUpAndGetCookie(email: string, password: string): Promise<string[]> {
  await auth.api.signUpEmail({ body: { email, password, name: 'Test User' } });
  const res = await request(app)
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .set('Content-Type', 'application/json');
  const setCookie = res.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.map((c: string) => c.split(';')[0]!);
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../lib/auth'));
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ app } = await import('../../index'));

  const email = `dt-user-${suffix}@example.com`;
  userCookies = await signUpAndGetCookie(email, 'sup3r-secret-pw');
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  userId = row!.id;
});

afterAll(async () => {
  await db.delete(schema.deviceTokens).where(eq(schema.deviceTokens.user_id, userId));
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  logSpy?.mockRestore();
});

async function tokensForDevice(deviceId: string) {
  return db
    .select()
    .from(schema.deviceTokens)
    .where(
      and(eq(schema.deviceTokens.user_id, userId), eq(schema.deviceTokens.device_id, deviceId)),
    );
}

describe('POST /notifications/device-tokens — AC-1', () => {
  it('registers a token (single row with the posted values)', async () => {
    const deviceId = `device-${suffix}-a`;
    const res = await request(app)
      .post('/notifications/device-tokens')
      .set('Cookie', userCookies.join('; '))
      .send({ deviceId, pushToken: 'ExponentPushToken[AAA]', platform: 'ios' });
    expect(res.status).toBe(200);

    const rows = await tokensForDevice(deviceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.push_token).toBe('ExponentPushToken[AAA]');
    expect(rows[0]!.platform).toBe('ios');
  });

  it('re-registering the SAME device with a rotated token updates the same row (no duplicate)', async () => {
    const deviceId = `device-${suffix}-b`;
    await request(app)
      .post('/notifications/device-tokens')
      .set('Cookie', userCookies.join('; '))
      .send({ deviceId, pushToken: 'ExponentPushToken[OLD]', platform: 'android' });

    const [before] = await tokensForDevice(deviceId);
    expect(before!.push_token).toBe('ExponentPushToken[OLD]');

    await request(app)
      .post('/notifications/device-tokens')
      .set('Cookie', userCookies.join('; '))
      .send({ deviceId, pushToken: 'ExponentPushToken[NEW]', platform: 'android' });

    const rows = await tokensForDevice(deviceId);
    // STILL exactly one row — updated in place, not duplicated.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.push_token).toBe('ExponentPushToken[NEW]');
    // Same row identity (upsert, not insert).
    expect(rows[0]!.id).toBe(before!.id);
  });

  it('a different device id creates a separate row', async () => {
    const deviceA = `device-${suffix}-c1`;
    const deviceB = `device-${suffix}-c2`;
    await request(app)
      .post('/notifications/device-tokens')
      .set('Cookie', userCookies.join('; '))
      .send({ deviceId: deviceA, pushToken: 'ExponentPushToken[C1]', platform: 'ios' });
    await request(app)
      .post('/notifications/device-tokens')
      .set('Cookie', userCookies.join('; '))
      .send({ deviceId: deviceB, pushToken: 'ExponentPushToken[C2]', platform: 'ios' });

    expect(await tokensForDevice(deviceA)).toHaveLength(1);
    expect(await tokensForDevice(deviceB)).toHaveLength(1);
  });

  it('rejects a malformed payload with 422', async () => {
    const res = await request(app)
      .post('/notifications/device-tokens')
      .set('Cookie', userCookies.join('; '))
      .send({ deviceId: '', pushToken: '', platform: '' });
    expect(res.status).toBe(422);
  });

  it('requires a session (401 without a cookie)', async () => {
    const res = await request(app)
      .post('/notifications/device-tokens')
      .send({ deviceId: 'x', pushToken: 'y', platform: 'ios' });
    expect(res.status).toBe(401);
  });
});
