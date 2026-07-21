import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../db/client';
import { offerBranches, offerProducts, offers } from '../db/schema/index';
import { serializeDeal } from './lib/serializers';

const uuidSchema = z.string().uuid();

// ─── DEAL-004 old-model status (AC7 / AC10) ──────────────────────────────────
//
// This router (`GET /deals`, `GET /deals/:id`) reads the OLD discount-object
// `offers` model. As of DEAL-004 it is NO LONGER a customer BROWSE surface — the
// mobile Deals tab/detail/Home strip read the bundle-product model via
// `GET /deals/products`. This file is KEPT (not deleted) because `GET /deals/:id`
// is still a LIVE dependency of the FROZEN STAR-004 coupon-display path
// (`(tabs)/cart/index.tsx`'s `useDeal(appliedDiscount.refId)` for an OFFER-coupon
// label). See the `/deals` mount comment in `index.ts` for the full rationale.
//
// AC10 — `offer_branches` (renamed from the legacy `deal_branches`, ADM-008
// migration 0011) is DELIBERATELY RETAINED, NOT dropped by DEAL-004. It scopes
// promotional OFFERS/coupons to branches (used by `GET /deals` branch filtering
// above + the `GET /api/branches/:id` branch-detail deals UNION). It is unrelated
// to the bundle-product deal model (`products.is_deal` + `deal_components`), which
// is intentionally ALL-BRANCH (no per-branch offer FK). No `offer_branches`
// migration lands in DEAL-004 (OD3-A). The offers/coupon authoring engine that
// owns this table is ADM-008 (GitHub #86); any change to `offer_branches` belongs
// there, not here.

export const dealsRouter: Router = Router();

// GET /deals?branchId=<uuid?> — public read of active, in-window promotional
// deals. A deal is included iff it is active, `now` falls within [start_at,
// end_at], AND it is branch-agnostic (no deal_branches rows) OR scoped to the
// requested branch. Absent/empty `branchId` → branch-agnostic deals only.
dealsRouter.get('/', async (req, res) => {
  const rawBranchId = req.query.branchId;
  const branchId =
    typeof rawBranchId === 'string' && rawBranchId.length > 0 ? rawBranchId : undefined;

  if (branchId !== undefined && !uuidSchema.safeParse(branchId).success) {
    res.status(400).json({ error: 'Invalid branchId' });
    return;
  }

  const now = new Date();

  // Active + currently in-window deals (SQL-level filter).
  const dealRows = await db
    .select()
    .from(offers)
    .where(and(eq(offers.is_active, true), lte(offers.start_at, now), gte(offers.end_at, now)));

  if (dealRows.length === 0) {
    res.json({ deals: [] });
    return;
  }

  const dealIds = dealRows.map((d) => d.id);

  // Flatten the branch/product join tables into per-deal id maps.
  const branchRows = await db
    .select()
    .from(offerBranches)
    .where(inArray(offerBranches.offer_id, dealIds));
  const productRows = await db
    .select()
    .from(offerProducts)
    .where(inArray(offerProducts.offer_id, dealIds));

  const branchMap = new Map<string, string[]>();
  for (const row of branchRows) {
    const list = branchMap.get(row.offer_id) ?? [];
    list.push(row.branch_id);
    branchMap.set(row.offer_id, list);
  }

  const productMap = new Map<string, string[]>();
  for (const row of productRows) {
    const list = productMap.get(row.offer_id) ?? [];
    list.push(row.product_id);
    productMap.set(row.offer_id, list);
  }

  // Branch-scope filter (JS): keep branch-agnostic deals always; keep scoped
  // deals only when a matching branchId was requested.
  const kept = dealRows.filter((d) => {
    const branchIds = branchMap.get(d.id) ?? [];
    return branchIds.length === 0 || (branchId !== undefined && branchIds.includes(branchId));
  });

  res.json({
    deals: kept.map((d) => serializeDeal(d, branchMap.get(d.id) ?? [], productMap.get(d.id) ?? [])),
  });
});

// GET /deals/:id — public single-deal read. Returns the deal regardless of
// branch scope or window (client eligibility renders branch_ineligible /
// not_in_window against it — Phase 2 decisions 2 & 4). Filters is_active = true
// only; missing/inactive/malformed id → 404 (mirrors branches.ts :branchId).
dealsRouter.get('/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!uuidSchema.safeParse(id).success) {
    res.status(404).json({ error: 'Deal not found' });
    return;
  }

  const [deal] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.id, id), eq(offers.is_active, true)));

  if (!deal) {
    res.status(404).json({ error: 'Deal not found' });
    return;
  }

  const branchRows = await db.select().from(offerBranches).where(eq(offerBranches.offer_id, id));
  const productRows = await db.select().from(offerProducts).where(eq(offerProducts.offer_id, id));

  res.json({
    deal: serializeDeal(
      deal,
      branchRows.map((r) => r.branch_id),
      productRows.map((r) => r.product_id),
    ),
  });
});
