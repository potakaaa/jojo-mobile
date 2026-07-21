import { and, asc, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../db/client';
import { dealComponents, productOptions, products } from '../db/schema/index';
import { resolveAvailableDealProductIds } from './lib/deal-availability';
import {
  serializeMenuProduct,
  type AdminDealComponent,
  type ApiMenuProduct,
} from './lib/serializers';

const uuidSchema = z.string().uuid();

export const dealsProductsRouter: Router = Router();

// GET /deals/products?branchId=<uuid?> — DEAL-004 all-branch deal listing.
//
// Returns EVERY active bundle-product deal (`products.is_deal = true`) in a flat
// `{ categories: [{ id, name, products }] }` shape (same envelope as the regular
// `/branches/:branchId/menu` response so the mobile hook can reuse `getMenu`'s
// category→product flatten). Unlike `?isDeal=true` on the menu route, this route:
//
//  1. is ALL-BRANCH — `branchId` is OPTIONAL. Deals are catalog-wide; a branch is
//     NOT required to see them (AC1). No `branch_product_availability` INNER JOIN
//     gates the listing.
//  2. FLAGS-NOT-HIDES unfulfillable deals — when `branchId` is present, each deal
//     carries `available: boolean` (true = the branch can fulfil every component;
//     false = a component is unavailable there) but is NEVER dropped (AC3). When
//     `branchId` is absent, every deal is `available: true`.
//
// `resolveAvailableDealProductIds` (READ ONLY, shared with the menu + placement
// paths) is the single source of the availability verdict — never re-implemented
// here — so list and money path can never disagree (MENU-003 invariant).
dealsProductsRouter.get('/', async (req, res) => {
  const rawBranchId = req.query.branchId;
  const branchId =
    typeof rawBranchId === 'string' && rawBranchId.length > 0 ? rawBranchId : undefined;

  if (branchId !== undefined && !uuidSchema.safeParse(branchId).success) {
    res.status(400).json({ error: 'Invalid branchId' });
    return;
  }

  // Every active deal-product, joined to its (active) category. NO branch
  // availability join — deals are all-branch (AC1/AC2). Ordered category-first
  // then by name, matching the regular menu's ordering.
  const productRows = await db
    .select({ product: products })
    .from(products)
    .where(and(eq(products.is_active, true), eq(products.is_deal, true)))
    .orderBy(asc(products.name));

  const productIds = productRows.map((r) => r.product.id);

  if (productIds.length === 0) {
    res.json({ categories: [] });
    return;
  }

  // Active options for all deal-products in one query (deals rarely carry
  // options, but the serializer expects the grouped shape either way).
  const optionRows = await db
    .select()
    .from(productOptions)
    .where(and(inArray(productOptions.product_id, productIds), eq(productOptions.is_active, true)))
    .orderBy(asc(productOptions.sort_order));

  const optionsByProduct = new Map<string, typeof optionRows>();
  for (const option of optionRows) {
    const list = optionsByProduct.get(option.product_id) ?? [];
    list.push(option);
    optionsByProduct.set(option.product_id, list);
  }

  // Each deal-product's `deal_components` ("what's inside"), resolved to the
  // component's own display name — one batch query (same shape as the menu route,
  // widened to `inArray`). Drives the `components[]` display field.
  const componentRows = await db
    .select({
      dealProductId: dealComponents.deal_product_id,
      componentProductId: dealComponents.component_product_id,
      componentName: products.name,
      quantity: dealComponents.quantity,
    })
    .from(dealComponents)
    .innerJoin(products, eq(products.id, dealComponents.component_product_id))
    .where(inArray(dealComponents.deal_product_id, productIds))
    .orderBy(asc(products.name));

  const componentsByProduct = new Map<string, AdminDealComponent[]>();
  for (const row of componentRows) {
    const list = componentsByProduct.get(row.dealProductId) ?? [];
    list.push({
      componentProductId: row.componentProductId,
      componentName: row.componentName,
      quantity: row.quantity,
    });
    componentsByProduct.set(row.dealProductId, list);
  }

  // Branch selected → resolve which deals the branch can fulfil (READ ONLY,
  // shared helper). Branch absent → every deal is available.
  const availableDealIds = branchId
    ? await resolveAvailableDealProductIds(db, branchId, productIds)
    : undefined;

  // FLAG-NOT-HIDE: EVERY deal-product is returned. `available` is only computed;
  // no deal is ever `continue`'d out (contrast with the MENU-003 menu path).
  const apiProducts: ApiMenuProduct[] = productRows.map(({ product }) =>
    serializeMenuProduct(
      product,
      optionsByProduct.get(product.id) ?? [],
      componentsByProduct.get(product.id) ?? [],
      // No branch → true for all; branch present → true iff fulfillable.
      availableDealIds === undefined ? true : availableDealIds.has(product.id),
    ),
  );

  // All deals collapse into one synthetic "Deals" category — the mobile Deals
  // tab renders a flat list, not the multi-category menu grid.
  res.json({
    categories: [{ id: 'deals', name: 'Deals', products: apiProducts }],
  });
});
