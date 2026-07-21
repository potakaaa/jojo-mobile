import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the admin Staff management surface (ADM-009, #124) — run
 * against a real local Postgres, mirroring `admin-rewards.integration.test.ts`'s
 * hermetic self-seeding (signUpAndGetCookie + inline env + VITEST guard).
 *
 * Requires a running Postgres reachable via DATABASE_URL with migrations applied:
 *   docker compose up -d   (or a native instance — see tests/all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers the validate-contract Test Gates (all Fully-Automated):
 *   AC1 — GET /staff lists staff/admin/super_admin with branch name joined,
 *         null-safe for unassigned, and NEVER includes a customer-role user.
 *   AC2 — PATCH /staff/:id/branch sets a valid active branch, response reflects it.
 *   AC3 — PATCH /staff/:id/branch with branchId:null clears a previously-assigned user.
 *   AC4 — PATCH rejects an inactive OR non-existent branch id, no partial write.
 *   AC5 — PATCH rejects a customer-role target, no row mutation.
 *   AC6 — both routes are admin-role-gated: 401/403 unauth, 403 non-admin (customer AND staff).
 *   AC7 — POST /api/admin/users/:id/role still works unmodified (regression re-check).
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.VITEST = 'true';

type AuthModule = typeof import('../../../lib/auth');
type DbModule = typeof import('../../../db/client');
type SchemaModule = typeof import('../../../db/schema/index');
type IndexModule = typeof import('../../../index');

let auth: AuthModule['auth'];
let db: DbModule['db'];
let schema: SchemaModule;
let app: IndexModule['app'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);
const RANDOM_UUID = '00000000-0000-4000-8000-000000000000';

let adminCookies: string[];
let superAdminCookies: string[];
let staffCookies: string[];
let customerCookies: string[];

// Hermetic fixtures created in beforeAll, cleaned up in afterAll.
let activeBranchId: string;
let activeBranchName: string;
let inactiveBranchId: string;

// Seeded staff-level users for the GET listing assertions.
let staffAssigned: { id: string; email: string };
let staffUnassigned: { id: string; email: string };
let adminUser: { id: string; email: string };
let superAdminUser: { id: string; email: string };
let customerUser: { id: string; email: string };

const createdUserIds: string[] = [];
const createdBranchIds: string[] = [];

async function signUpAndGetCookie(email: string, password: string): Promise<string[]> {
  await auth.api.signUpEmail({ body: { email, password, name: 'Test User' } });
  const res = await request(app)
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .set('Content-Type', 'application/json');
  const setCookie = res.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.map((c) => c.split(';')[0]!);
}

async function makeUser(
  roleValue: 'customer' | 'staff' | 'admin' | 'super_admin',
): Promise<{ email: string; cookies: string[]; id: string }> {
  const email = `${roleValue}-${unique()}@example.com`;
  const cookies = await signUpAndGetCookie(email, 'sup3r-secret-pw');
  if (roleValue !== 'customer') {
    await db.update(schema.users).set({ role: roleValue }).where(eq(schema.users.email, email));
  }
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  if (!row) throw new Error('Test setup: failed to read back created user');
  createdUserIds.push(row.id);
  return { email, cookies, id: row.id };
}

async function seedBranch(isActive: boolean): Promise<{ id: string; name: string }> {
  const suffix = unique();
  const name = `StaffBranch ${suffix}`;
  const [branch] = await db
    .insert(schema.branches)
    .values({
      name,
      slug: `staff-branch-${suffix}`,
      address: '1 St',
      latitude: '14.5',
      longitude: '120.9',
      phone: '+639170000099',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 15,
      is_active: isActive,
    })
    .returning();
  createdBranchIds.push(branch!.id);
  return { id: branch!.id, name };
}

function patchBranch(
  cookies: string[],
  userId: string,
  branchId: string | null,
): Promise<request.Response> {
  return request(app)
    .patch(`/api/admin/staff/${userId}/branch`)
    .set('Cookie', cookies.join('; '))
    .send({ branchId })
    .set('Content-Type', 'application/json');
}

async function readAssignedBranch(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ assignedBranchId: schema.users.assignedBranchId })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return row?.assignedBranchId ?? null;
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../../lib/auth'));
  ({ db } = await import('../../../db/client'));
  schema = await import('../../../db/schema/index');
  ({ app } = await import('../../../index'));

  adminCookies = (await makeUser('admin')).cookies;
  superAdminCookies = (await makeUser('super_admin')).cookies;
  staffCookies = (await makeUser('staff')).cookies;
  customerCookies = (await makeUser('customer')).cookies;

  const active = await seedBranch(true);
  activeBranchId = active.id;
  activeBranchName = active.name;
  const inactive = await seedBranch(false);
  inactiveBranchId = inactive.id;

  // A staff member assigned to the active branch (branch name should join).
  const sa = await makeUser('staff');
  await db
    .update(schema.users)
    .set({ assignedBranchId: activeBranchId })
    .where(eq(schema.users.id, sa.id));
  staffAssigned = { id: sa.id, email: sa.email };

  // A staff member with no branch (both fields must serialize null).
  const su = await makeUser('staff');
  staffUnassigned = { id: su.id, email: su.email };

  const au = await makeUser('admin');
  adminUser = { id: au.id, email: au.email };
  const spu = await makeUser('super_admin');
  superAdminUser = { id: spu.id, email: spu.email };
  const cu = await makeUser('customer');
  customerUser = { id: cu.id, email: cu.email };
});

afterAll(async () => {
  // FK-safe teardown: clear branch refs off our users, then delete the branches.
  if (createdUserIds.length > 0) {
    await db
      .update(schema.users)
      .set({ assignedBranchId: null })
      .where(inArray(schema.users.id, createdUserIds));
  }
  if (createdBranchIds.length > 0) {
    await db.delete(schema.branches).where(inArray(schema.branches.id, createdBranchIds));
  }
  logSpy?.mockRestore();
  vi.restoreAllMocks();
});

describe('GET /api/admin/staff (AC1)', () => {
  it('lists staff/admin/super_admin with branch name joined, null-safe for unassigned', async () => {
    const res = await request(app).get('/api/admin/staff').set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.staff)).toBe(true);

    const byId = (id: string) =>
      res.body.staff.find((s: { id: string }) => s.id === id) as
        | {
            id: string;
            name: string;
            email: string;
            role: string;
            assignedBranchId: string | null;
            branchName: string | null;
          }
        | undefined;

    // Assigned staff → branch name joined, name/email present.
    const assigned = byId(staffAssigned.id);
    expect(assigned).toBeDefined();
    expect(assigned!.role).toBe('staff');
    expect(assigned!.email).toBe(staffAssigned.email);
    expect(typeof assigned!.name).toBe('string');
    expect(assigned!.assignedBranchId).toBe(activeBranchId);
    expect(assigned!.branchName).toBe(activeBranchName);

    // Unassigned staff → both branch fields null.
    const unassigned = byId(staffUnassigned.id);
    expect(unassigned).toBeDefined();
    expect(unassigned!.assignedBranchId).toBeNull();
    expect(unassigned!.branchName).toBeNull();

    // admin + super_admin are included.
    expect(byId(adminUser.id)).toBeDefined();
    expect(byId(adminUser.id)!.role).toBe('admin');
    expect(byId(superAdminUser.id)).toBeDefined();
    expect(byId(superAdminUser.id)!.role).toBe('super_admin');
  });

  it('never includes a customer-role user', async () => {
    const res = await request(app).get('/api/admin/staff').set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(200);
    const found = res.body.staff.find((s: { id: string }) => s.id === customerUser.id);
    expect(found).toBeUndefined();
    // Nothing in the list is ever a customer.
    for (const s of res.body.staff as { role: string }[]) {
      expect(['staff', 'admin', 'super_admin']).toContain(s.role);
    }
  });
});

describe('PATCH /api/admin/staff/:id/branch — set/clear (AC2, AC3)', () => {
  it('sets a valid active branch and reflects it in the response (AC2)', async () => {
    const target = await makeUser('staff');
    const res = await patchBranch(adminCookies, target.id, activeBranchId);
    expect(res.status).toBe(200);
    expect(res.body.staff.assignedBranchId).toBe(activeBranchId);
    expect(res.body.staff.branchName).toBe(activeBranchName);
    expect(res.body.staff.id).toBe(target.id);

    expect(await readAssignedBranch(target.id)).toBe(activeBranchId);
  });

  it('clears a previously-assigned user when branchId:null is sent (AC3)', async () => {
    const target = await makeUser('staff');
    await db
      .update(schema.users)
      .set({ assignedBranchId: activeBranchId })
      .where(eq(schema.users.id, target.id));

    const res = await patchBranch(adminCookies, target.id, null);
    expect(res.status).toBe(200);
    expect(res.body.staff.assignedBranchId).toBeNull();
    expect(res.body.staff.branchName).toBeNull();

    expect(await readAssignedBranch(target.id)).toBeNull();
  });
});

describe('PATCH /api/admin/staff/:id/branch — rejections (AC4, AC5)', () => {
  it('rejects a deactivated branch id with no write (AC4)', async () => {
    const target = await makeUser('staff');
    await db
      .update(schema.users)
      .set({ assignedBranchId: activeBranchId })
      .where(eq(schema.users.id, target.id));

    const res = await patchBranch(adminCookies, target.id, inactiveBranchId);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Unknown or inactive branch');

    // Row unchanged.
    expect(await readAssignedBranch(target.id)).toBe(activeBranchId);
  });

  it('rejects a non-existent branch uuid with no write (AC4)', async () => {
    const target = await makeUser('staff');
    await db
      .update(schema.users)
      .set({ assignedBranchId: activeBranchId })
      .where(eq(schema.users.id, target.id));

    const res = await patchBranch(adminCookies, target.id, RANDOM_UUID);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Unknown or inactive branch');

    expect(await readAssignedBranch(target.id)).toBe(activeBranchId);
  });

  it('rejects a customer-role target with no row mutation (AC5)', async () => {
    const target = await makeUser('customer');
    const res = await patchBranch(adminCookies, target.id, activeBranchId);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Target user is not staff-level');

    // Customer's assignedBranchId is untouched (stays null).
    expect(await readAssignedBranch(target.id)).toBeNull();
  });

  it('404s a non-existent target user', async () => {
    const res = await patchBranch(adminCookies, RANDOM_UUID, activeBranchId);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('User not found');
  });

  it('404s a malformed :id (non-uuid falls through to a clean not-found)', async () => {
    const res = await patchBranch(adminCookies, 'not-a-uuid', activeBranchId);
    expect(res.status).toBe(404);
  });

  it('400s an invalid body shape (branchId missing / wrong type)', async () => {
    const target = await makeUser('staff');
    const res = await request(app)
      .patch(`/api/admin/staff/${target.id}/branch`)
      .set('Cookie', adminCookies.join('; '))
      .send({ branchId: 42 })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request body');
  });
});

describe('admin-role gating on both routes (AC6)', () => {
  it('rejects unauthenticated requests on GET and PATCH (401/403)', async () => {
    const get = await request(app).get('/api/admin/staff');
    expect([401, 403]).toContain(get.status);

    const patch = await request(app)
      .patch(`/api/admin/staff/${staffUnassigned.id}/branch`)
      .send({ branchId: null })
      .set('Content-Type', 'application/json');
    expect([401, 403]).toContain(patch.status);
  });

  it('rejects customer and staff sessions with 403 on read and write', async () => {
    for (const cookies of [customerCookies, staffCookies]) {
      const get = await request(app).get('/api/admin/staff').set('Cookie', cookies.join('; '));
      expect(get.status).toBe(403);

      const patch = await patchBranch(cookies, staffUnassigned.id, null);
      expect(patch.status).toBe(403);
    }
  });
});

describe('POST /api/admin/users/:id/role still works unmodified (AC7 regression)', () => {
  it('a super_admin can still promote another user via the reused role route', async () => {
    const target = await makeUser('customer');
    const res = await request(app)
      .post(`/api/admin/users/${target.id}/role`)
      .set('Cookie', superAdminCookies.join('; '))
      .send({ role: 'staff' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.resource).toMatchObject({ id: target.id, role: 'staff' });

    const [row] = await db
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, target.id));
    expect(row!.role).toBe('staff');
  });
});
