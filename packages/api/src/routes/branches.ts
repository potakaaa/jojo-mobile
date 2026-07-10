import { eq } from 'drizzle-orm';
import { Router } from 'express';

import { db } from '../db/client';
import { branches } from '../db/schema/index';

/**
 * `GET /api/branches` — active branches only. Maps snake_case DB columns to the
 * camelCase Public Contract shape; `numeric` lat/lng are parsed to `number`.
 */
export const branchesRouter: Router = Router();

branchesRouter.get('/', async (_req, res) => {
  const rows = await db.select().from(branches).where(eq(branches.is_active, true));
  res.json({
    branches: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      address: row.address,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      phone: row.phone,
      openingHours: row.opening_hours,
      isActive: row.is_active,
      isAcceptingPickup: row.is_accepting_pickup,
      estimatedPrepMinutes: row.estimated_prep_minutes,
    })),
  });
});
