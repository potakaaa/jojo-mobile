import { eq } from 'drizzle-orm';
import { db } from '../client';
import {
  branchProductAvailability,
  branches,
  categories,
  dealBranches,
  dealProducts,
  deals,
  productOptions,
  products,
  users,
} from '../schema/index';
import { auth } from '../../lib/auth';
import { seedBranches, seedCategories, seedDeals, seedProducts } from './data';

// Hardcoded dev-only test credential (per locked SPEC decision — intentionally
// NOT env-driven). Only ever seeded outside production; see seedTestUser()'s
// fail-closed NODE_ENV guard. Creation goes through better-auth so it owns the
// scrypt hash — never a raw users/account insert.
// NOTE: password is `jojo1234` (8 chars), not `jojo123` (7): better-auth enforces
// a default 8-char minimum, so the SPEC's `jojo123` is rejected at signUpEmail.
// Lengthening the dev credential by one char is the in-blast-radius fix; the
// alternative (lowering emailAndPassword.minPasswordLength) would weaken policy
// for all real users and is out of scope.
const TEST_USER = { email: 'jojo@test.com', password: 'jojo1234', name: 'Jojo Test' } as const;

async function seedBranchesTable(): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();
  for (const branch of seedBranches) {
    const [row] = await db
      .insert(branches)
      .values(branch)
      .onConflictDoUpdate({
        target: branches.slug,
        set: { ...branch, updated_at: new Date() },
      })
      .returning({ id: branches.id, slug: branches.slug });
    if (!row) throw new Error(`Seed error: upsert of branch "${branch.slug}" returned no row`);
    idBySlug.set(row.slug, row.id);
  }
  return idBySlug;
}

async function seedCategoriesTable(): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();
  for (const category of seedCategories) {
    const [row] = await db
      .insert(categories)
      .values(category)
      .onConflictDoUpdate({
        target: categories.slug,
        set: { ...category, updated_at: new Date() },
      })
      .returning({ id: categories.id, slug: categories.slug });
    if (!row) throw new Error(`Seed error: upsert of category "${category.slug}" returned no row`);
    idBySlug.set(row.slug, row.id);
  }
  return idBySlug;
}

async function seedProductsTable(
  categoryIdBySlug: Map<string, string>,
): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();
  for (const product of seedProducts) {
    const categoryId = categoryIdBySlug.get(product.categorySlug);
    if (!categoryId) {
      throw new Error(
        `Seed data error: product "${product.slug}" references unknown category "${product.categorySlug}"`,
      );
    }
    const row = {
      slug: product.slug,
      name: product.name,
      description: product.description,
      category_id: categoryId,
      base_price: product.base_price,
      is_reward_eligible: product.is_reward_eligible,
    };
    const [inserted] = await db
      .insert(products)
      .values(row)
      .onConflictDoUpdate({
        target: products.slug,
        set: { ...row, updated_at: new Date() },
      })
      .returning({ id: products.id, slug: products.slug });
    if (!inserted)
      throw new Error(`Seed error: upsert of product "${product.slug}" returned no row`);
    idBySlug.set(inserted.slug, inserted.id);
  }
  return idBySlug;
}

// product_options has no unique constraint in the migration (unlike
// branches/categories/products), so ON CONFLICT has no target to key off. A
// delete-then-insert per product gives the same idempotent end-state on every
// run. Possible future follow-up: add UNIQUE(product_id, option_type, name) —
// out of scope here.
async function seedProductOptionsTable(productIdBySlug: Map<string, string>): Promise<void> {
  for (const product of seedProducts) {
    const productId = productIdBySlug.get(product.slug);
    if (!productId) {
      throw new Error(`Seed data error: options for unknown product "${product.slug}"`);
    }
    await db.delete(productOptions).where(eq(productOptions.product_id, productId));
    if (product.options.length > 0) {
      await db.insert(productOptions).values(
        product.options.map((option) => ({
          product_id: productId,
          option_type: option.option_type,
          name: option.name,
          price_delta: option.price_delta,
          sort_order: option.sort_order,
        })),
      );
    }
  }
}

async function seedBranchProductAvailabilityTable(
  branchIdBySlug: Map<string, string>,
  productIdBySlug: Map<string, string>,
): Promise<void> {
  for (const branchId of branchIdBySlug.values()) {
    for (const productId of productIdBySlug.values()) {
      await db
        .insert(branchProductAvailability)
        .values({ branch_id: branchId, product_id: productId, is_available: true })
        .onConflictDoUpdate({
          target: [branchProductAvailability.branch_id, branchProductAvailability.product_id],
          set: { is_available: true, updated_at: new Date() },
        });
    }
  }
}

// deals.title has no unique constraint, so idempotency is app-level:
// find-by-title, then update or insert. start_at/end_at are computed from
// "now" on every run so re-seeding never leaves a stale/expired deal.
async function seedDealsTable(): Promise<Map<string, string>> {
  const idByTitle = new Map<string, string>();
  const now = new Date();
  for (const deal of seedDeals) {
    const row = {
      title: deal.title,
      description: deal.description,
      deal_type: deal.deal_type,
      discount_value: deal.discount_value,
      minimum_order_amount: deal.minimum_order_amount,
      start_at: now,
      end_at: new Date(now.getTime() + deal.windowDays * 24 * 60 * 60 * 1000),
      usage_limit_per_user: deal.usage_limit_per_user,
      total_usage_limit: deal.total_usage_limit,
    };
    const [existing] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(eq(deals.title, deal.title));

    const [dealRow] = existing
      ? await db
          .update(deals)
          .set({ ...row, updated_at: new Date() })
          .where(eq(deals.id, existing.id))
          .returning({ id: deals.id, title: deals.title })
      : await db.insert(deals).values(row).returning({ id: deals.id, title: deals.title });

    if (!dealRow) throw new Error(`Seed error: upsert of deal "${deal.title}" returned no row`);
    idByTitle.set(dealRow.title, dealRow.id);
  }
  return idByTitle;
}

async function seedDealScopingTables(
  dealIdByTitle: Map<string, string>,
  productIdBySlug: Map<string, string>,
  branchIdBySlug: Map<string, string>,
): Promise<void> {
  for (const deal of seedDeals) {
    const dealId = dealIdByTitle.get(deal.title);
    if (!dealId) {
      throw new Error(`Seed data error: unknown deal "${deal.title}"`);
    }

    for (const productSlug of deal.productSlugs) {
      const productId = productIdBySlug.get(productSlug);
      if (!productId) {
        throw new Error(
          `Seed data error: deal "${deal.title}" references unknown product "${productSlug}"`,
        );
      }
      await db
        .insert(dealProducts)
        .values({ deal_id: dealId, product_id: productId })
        .onConflictDoNothing({
          target: [dealProducts.deal_id, dealProducts.product_id],
        });
    }

    for (const branchSlug of deal.branchSlugs) {
      const branchId = branchIdBySlug.get(branchSlug);
      if (!branchId) {
        throw new Error(
          `Seed data error: deal "${deal.title}" references unknown branch "${branchSlug}"`,
        );
      }
      await db
        .insert(dealBranches)
        .values({ deal_id: dealId, branch_id: branchId })
        .onConflictDoNothing({
          target: [dealBranches.deal_id, dealBranches.branch_id],
        });
    }
  }
}

// Seeds the dev-only test account via better-auth's own sign-up API so the
// scrypt hash is owned by better-auth (never a raw insert). Fail-closed: refuses
// to run under NODE_ENV=production. Idempotent: find-first by email, skip create
// when the row already exists. Exported so the isolated unit test can exercise it
// directly (the other seed helpers are internal and driven through runSeed()).
export async function seedTestUser(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a known test credential under NODE_ENV=production.');
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, TEST_USER.email));
  if (existing) return;

  await auth.api.signUpEmail({
    body: {
      email: TEST_USER.email,
      password: TEST_USER.password,
      name: TEST_USER.name,
    },
  });
}

export async function runSeed(): Promise<void> {
  const branchIdBySlug = await seedBranchesTable();
  const categoryIdBySlug = await seedCategoriesTable();
  const productIdBySlug = await seedProductsTable(categoryIdBySlug);
  await seedProductOptionsTable(productIdBySlug);
  await seedBranchProductAvailabilityTable(branchIdBySlug, productIdBySlug);
  const dealIdByTitle = await seedDealsTable();
  await seedDealScopingTables(dealIdByTitle, productIdBySlug, branchIdBySlug);
  await seedTestUser();

  console.log('Seed complete:');
  console.log(`  branches: ${branchIdBySlug.size}`);
  console.log(`  categories: ${categoryIdBySlug.size}`);
  console.log(`  products: ${productIdBySlug.size}`);
  console.log(`  deals: ${dealIdByTitle.size}`);
  console.log(`  test user: ${TEST_USER.email}`);
}
