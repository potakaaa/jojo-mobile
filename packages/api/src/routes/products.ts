import { and, asc, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';

import { db } from '../db/client';
import {
  branchProductAvailability,
  branches,
  categories,
  productOptions,
  products,
} from '../db/schema/index';
import {
  serializeMenuCategory,
  serializeMenuProduct,
  type ApiMenuCategory,
  type ApiMenuProduct,
  type ApiProductBranch,
} from './lib/serializers';

export const productsRouter: Router = Router();

// GET /products — home-all-branches: the ALL-BRANCH regular catalog.
//
// Returns every active, NON-deal product across every active, accepting-pickup
// branch, DEDUPLICATED (one row per product no matter how many branches carry
// it), grouped by its real category, in the same
// `{ categories: [{ id, name, products }] }` envelope the branch menu and
// `GET /deals/products` use — so the mobile client reuses the same flatten.
//
// Contrast with `GET /branches/:branchId/menu`, which INNER JOINs
// `branch_product_availability` for ONE branch and therefore HIDES anything that
// branch does not carry. This route is deliberately branch-agnostic by
// construction: it takes no `branchId` query param at all, so the Home grid can
// never fall into the "this branch is empty, show nothing" dead end.
//
// Each product carries `branches: { id, name }[]` — the branches that actually
// carry it right now. That list is filtered to `is_active = true AND
// is_accepting_pickup = true` to MATCH the client's own selectable-branch set
// (`useBranch()` filters to accepting-pickup branches). Naming a branch the
// customer cannot select would both mislead the "Available at N branches"
// subtext and break the branch-switch target lookup. A product carried by no
// such branch is STILL listed, with `branches: []`.
productsRouter.get('/', async (_req, res) => {
  // Active, non-deal products joined to their active category. NO branch
  // availability join — that is exactly the single-branch gate this route exists
  // to avoid.
  const productRows = await db
    .select({ product: products, category: categories })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.category_id))
    .where(
      and(
        eq(products.is_active, true),
        eq(categories.is_active, true),
        eq(products.is_deal, false),
      ),
    )
    .orderBy(asc(categories.sort_order), asc(products.name));

  const productIds = productRows.map((r) => r.product.id);

  if (productIds.length === 0) {
    res.json({ categories: [] });
    return;
  }

  // Active options for every product in ONE query (same batched shape as
  // `branches.ts` / `deals-products.ts`).
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

  // Which branches carry which product — ONE query for the whole catalog, never
  // one per product. Filtered to branches the customer can actually select
  // (active AND accepting pickup), matching `useBranch()`'s client-side filter.
  const availabilityRows = await db
    .select({
      productId: branchProductAvailability.product_id,
      branchId: branches.id,
      branchName: branches.name,
    })
    .from(branchProductAvailability)
    .innerJoin(branches, eq(branches.id, branchProductAvailability.branch_id))
    .where(
      and(
        inArray(branchProductAvailability.product_id, productIds),
        eq(branchProductAvailability.is_available, true),
        eq(branches.is_active, true),
        eq(branches.is_accepting_pickup, true),
      ),
    )
    .orderBy(asc(branches.name));

  const branchesByProduct = new Map<string, ApiProductBranch[]>();
  for (const row of availabilityRows) {
    const list = branchesByProduct.get(row.productId) ?? [];
    list.push({ id: row.branchId, name: row.branchName });
    branchesByProduct.set(row.productId, list);
  }

  // Preserve first-seen category order (rows already sorted by category.sort_order).
  const categoryOrder: string[] = [];
  const categoryById = new Map<string, { id: string; name: string }>();
  const productsByCategory = new Map<string, ApiMenuProduct[]>();

  for (const { product, category } of productRows) {
    if (!productsByCategory.has(category.id)) {
      categoryOrder.push(category.id);
      categoryById.set(category.id, { id: category.id, name: category.name });
      productsByCategory.set(category.id, []);
    }
    productsByCategory.get(category.id)!.push(
      serializeMenuProduct(
        product,
        optionsByProduct.get(product.id) ?? [],
        // Regular (non-deal) catalog: no components, no per-branch `available`
        // flag, no schedule — all three keys stay omitted, exactly as on the
        // regular branch menu.
        undefined,
        undefined,
        undefined,
        // ALWAYS passed (possibly empty) — `branches` is a first-class field of
        // this route's contract, so a product carried nowhere emits `[]`.
        branchesByProduct.get(product.id) ?? [],
      ),
    );
  }

  const menuCategories: ApiMenuCategory[] = categoryOrder.map((categoryId) =>
    serializeMenuCategory(categoryById.get(categoryId)!, productsByCategory.get(categoryId)!),
  );

  res.json({ categories: menuCategories });
});
