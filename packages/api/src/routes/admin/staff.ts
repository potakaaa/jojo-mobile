import { STAFF_ROLES } from '@jojopotato/types';
import { eq, inArray } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import { branches, users } from '../../db/schema/index';
import { serializeAdminStaffSummary } from '../lib/serializers';
import { AdminApiError, handleAdminError } from './lib/errors';

/**
 * Admin Staff management routes (ADM-009, #124). Lists staff-level users and sets
 * or clears their `assignedBranchId` — closing the only production gap in staff
 * onboarding (the seed was previously the only writer of that column). The
 * `requireAdmin` guard + CORS are inherited from the `/api/admin` mount; no handler
 * re-checks role. This is the 12th consumer of the append-only admin aggregator.
 *
 * Role changes are NOT rebuilt here — the existing `POST /api/admin/users/:id/role`
 * route (`users.ts`) is reused byte-for-byte by the Staff screen's UI. This file
 * only owns the list + branch-assignment surface.
 */
const staffRouter: ExpressRouter = Router();

const uuidSchema = z.uuid();

const branchAssignSchema = z.object({
  branchId: z.uuid().nullable(),
});

/**
 * GET /api/admin/staff — every user with role ∈ STAFF_ROLES (staff, admin,
 * super_admin), left-joined to `branches` for the assigned branch name.
 * Customers are never included (WHERE role IN (...), not a client-side filter).
 * No pagination — staff rosters are small (locked decision, YAGNI).
 */
staffRouter.get('/', async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        assignedBranchId: users.assignedBranchId,
        branchName: branches.name,
      })
      .from(users)
      .leftJoin(branches, eq(users.assignedBranchId, branches.id))
      .where(inArray(users.role, [...STAFF_ROLES]));

    res.status(200).json({ staff: rows.map(serializeAdminStaffSummary) });
  } catch (err) {
    handleAdminError(err, res, 'listing staff');
  }
});

/**
 * PATCH /api/admin/staff/:id/branch — set or clear a staff-level user's branch.
 * Guard order (LOCKED, mirrors users.ts's role-route guard-order discipline):
 *   1. Zod body validation           → 400 on invalid shape
 *   2. target user lookup            → 404 if not found
 *   3. target role check             → 400 if role === 'customer'
 *   4. branchId === null             → short-circuit straight to the DB write (clear)
 *   5. branch lookup + isActive check→ 400 "Unknown or inactive branch"
 *   6. DB write + re-join + serialize
 * Branch existence/active status is ALWAYS read fresh from the DB — never
 * trusted from client input (mirrors resolveBranchScope's convention).
 */
staffRouter.patch('/:id/branch', async (req, res) => {
  try {
    const parsed = branchAssignSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AdminApiError(400, 'Invalid request body');
    }

    // A malformed (non-uuid) :id can never be a real target — guard it to a clean
    // 404 (matching rewards.ts's uuid guard) rather than letting the `eq()` lookup
    // hit Postgres's `uuid` column and throw a 22P02 → 500. Part of the target-404
    // resolution step, so the locked guard order (Zod body → target 404 → …) holds.
    if (!uuidSchema.safeParse(req.params.id).success) {
      throw new AdminApiError(404, 'User not found');
    }

    const [target] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, req.params.id));
    if (!target) {
      throw new AdminApiError(404, 'User not found');
    }
    if (target.role === 'customer') {
      throw new AdminApiError(400, 'Target user is not staff-level');
    }

    if (parsed.data.branchId !== null) {
      const [branch] = await db
        .select({ id: branches.id, isActive: branches.is_active })
        .from(branches)
        .where(eq(branches.id, parsed.data.branchId));
      if (!branch || !branch.isActive) {
        throw new AdminApiError(400, 'Unknown or inactive branch');
      }
    }

    await db
      .update(users)
      .set({ assignedBranchId: parsed.data.branchId })
      .where(eq(users.id, req.params.id));

    const [updated] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        assignedBranchId: users.assignedBranchId,
        branchName: branches.name,
      })
      .from(users)
      .leftJoin(branches, eq(users.assignedBranchId, branches.id))
      .where(eq(users.id, req.params.id));

    res.status(200).json({ staff: serializeAdminStaffSummary(updated!) });
  } catch (err) {
    handleAdminError(err, res, 'assigning staff branch');
  }
});

export default staffRouter;
