import { and, asc, eq } from 'drizzle-orm';
import { Router } from 'express';

import { db } from '../db/client';
import {
  branchProductAvailability,
  branches,
  categories,
  productOptions,
  products,
} from '../db/schema/index';

/**
 * Menu routes:
 *   GET /api/menu?branchId=<uuid>                 — categories + branch-available products
 *   GET /api/menu/products/:productId?branchId=   — single product detail + options
 *
 * `branchId` is ALWAYS validated against the active-branches list before any
 * menu query runs — never trust an arbitrary client-supplied id (INNOVATE
 * security follow-up). Invalid/inactive branchId -> 400. All DB rows are mapped
 * from snake_case columns to the camelCase Public Contract shape, with `numeric`
 * money columns parsed to `number`.
 */
export const menuRouter: Router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True only when `branchId` is a well-formed uuid of an existing ACTIVE branch. */
async function isActiveBranch(branchId: string): Promise<boolean> {
  if (!branchId || !UUID_RE.test(branchId)) return false;
  const [row] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.id, branchId), eq(branches.is_active, true)));
  return Boolean(row);
}

menuRouter.get('/', async (req, res) => {
  const branchId = String(req.query.branchId ?? '');
  if (!(await isActiveBranch(branchId))) {
    res.status(400).json({ error: 'Missing or invalid branchId' });
    return;
  }

  // Active categories, ordered by sort_order.
  const categoryRows = await db
    .select()
    .from(categories)
    .where(eq(categories.is_active, true))
    .orderBy(asc(categories.sort_order));

  // Active products available at this branch, joined against availability.
  const productRows = await db
    .select({
      id: products.id,
      categoryId: products.category_id,
      name: products.name,
      slug: products.slug,
      description: products.description,
      imageUrl: products.image_url,
      basePrice: products.base_price,
      isActive: products.is_active,
      isRewardEligible: products.is_reward_eligible,
    })
    .from(products)
    .innerJoin(
      branchProductAvailability,
      and(
        eq(branchProductAvailability.product_id, products.id),
        eq(branchProductAvailability.branch_id, branchId),
        eq(branchProductAvailability.is_available, true),
      ),
    )
    .where(eq(products.is_active, true))
    .orderBy(asc(products.name));

  const productsByCategory = new Map<string, typeof productRows>();
  for (const row of productRows) {
    const list = productsByCategory.get(row.categoryId) ?? [];
    list.push(row);
    productsByCategory.set(row.categoryId, list);
  }

  res.json({
    categories: categoryRows.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      sortOrder: category.sort_order,
      isActive: category.is_active,
      products: (productsByCategory.get(category.id) ?? []).map((product) => ({
        id: product.id,
        categoryId: product.categoryId,
        name: product.name,
        slug: product.slug,
        description: product.description,
        imageUrl: product.imageUrl,
        basePrice: Number(product.basePrice),
        isActive: product.isActive,
        isRewardEligible: product.isRewardEligible,
      })),
    })),
  });
});

menuRouter.get('/products/:productId', async (req, res) => {
  const branchId = String(req.query.branchId ?? '');
  if (!(await isActiveBranch(branchId))) {
    res.status(400).json({ error: 'Missing or invalid branchId' });
    return;
  }

  const { productId } = req.params;
  if (!UUID_RE.test(productId)) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.is_active, true)));

  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  // isAvailable: active AND available at this branch.
  const [[availabilityRow], optionRows] = await Promise.all([
    db
      .select({ isAvailable: branchProductAvailability.is_available })
      .from(branchProductAvailability)
      .where(
        and(
          eq(branchProductAvailability.product_id, productId),
          eq(branchProductAvailability.branch_id, branchId),
          eq(branchProductAvailability.is_available, true),
        ),
      ),
    db
      .select()
      .from(productOptions)
      .where(and(eq(productOptions.product_id, productId), eq(productOptions.is_active, true)))
      .orderBy(asc(productOptions.sort_order)),
  ]);

  res.json({
    id: product.id,
    categoryId: product.category_id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    imageUrl: product.image_url,
    basePrice: Number(product.base_price),
    isActive: product.is_active,
    isRewardEligible: product.is_reward_eligible,
    isAvailable: Boolean(availabilityRow),
    options: optionRows.map((option) => ({
      id: option.id,
      productId: option.product_id,
      optionType: option.option_type,
      name: option.name,
      priceDelta: Number(option.price_delta),
      isActive: option.is_active,
      sortOrder: option.sort_order,
    })),
  });
});
