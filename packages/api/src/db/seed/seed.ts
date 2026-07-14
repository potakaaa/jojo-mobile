import { eq } from 'drizzle-orm';
import { auth } from '../../lib/auth';
import { db } from '../client';
import {
  branchProductAvailability,
  branches,
  categories,
  dealBranches,
  dealProducts,
  deals,
  orderItems,
  orders,
  productOptions,
  products,
  rewards,
  users,
} from '../schema/index';
import { seedBranches, seedCategories, seedDeals, seedProducts } from './data';

const STAFF_EMAIL = 'staff-branch1@jojopotato.local';

/**
 * Seed one `staff` user scoped to the first seeded branch (STAFF-001 testability).
 *
 * Uses `auth.api.signUpEmail` so better-auth creates BOTH the `users` row AND
 * the `account` credential entry — a bare `db.insert(users)` would create an
 * orphan row that cannot authenticate. `role`/`assignedBranchId` are then set
 * directly (both are server-owned; `role` is `input:false` in better-auth).
 * Idempotent: a duplicate email hits the unique constraint and is skipped.
 */
async function seedStaffUser(branchIdBySlug: Map<string, string>): Promise<void> {
  const [firstBranchId] = branchIdBySlug.values();
  if (!firstBranchId) {
    throw new Error('Seed error: cannot seed staff user — no branches were seeded');
  }

  // Never seed a reusable dev credential into a production database.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed error: refusing to seed the staff test user while NODE_ENV=production');
  }
  // Prefer an env-provided password so the fallback dev credential is never the only option.
  const staffPassword = process.env.STAFF_SEED_PASSWORD ?? 'staff-dev-password';

  try {
    await auth.api.signUpEmail({
      body: { email: STAFF_EMAIL, password: staffPassword, name: 'Branch 1 Staff' },
    });
  } catch {
    // User already exists (email unique constraint) — fall through to the update
    // so re-seeding still guarantees the correct role/branch assignment.
  }

  // Verify the update actually hit a row: if signUpEmail failed for a NON-duplicate
  // reason (e.g. password policy, transient auth error), no user exists and the
  // update silently affects 0 rows — surface that instead of reporting success.
  const [updated] = await db
    .update(users)
    .set({ role: 'staff', assignedBranchId: firstBranchId })
    .where(eq(users.email, STAFF_EMAIL))
    .returning({ id: users.id });
  if (!updated) {
    throw new Error(
      'Seed error: staff user was not created — signUpEmail failed for a non-duplicate reason',
    );
  }
}

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

// Dev-only customer that OWNS the STAFF-002 sample orders. Deliberately separate
// from TEST_USER (jojo@test.com): the `seed-test-user.test.ts` unit test deletes
// jojo@test.com in its teardown, and an FK from sample orders to that row would
// break the delete (orders_user_id_users_id_fk). Sample orders reference this
// dedicated account instead, so the test owns jojo@test.com's lifecycle cleanly.
// Password is 8+ chars (better-auth minimum). Never seeded in production.
const DEMO_CUSTOMER = {
  email: 'orders-demo@jojopotato.local',
  password: 'orders-demo-pass1',
  name: 'Orders Demo Customer',
} as const;

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

// Seeds the dev-only demo customer that owns the STAFF-002 sample orders, via
// better-auth's sign-up API (so better-auth owns the scrypt hash — never a raw
// insert). Fail-closed under NODE_ENV=production. Idempotent: skip create when the
// row already exists. Returns the resolved user id for the orders FK.
async function seedDemoCustomer(): Promise<string> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed the demo customer credential under NODE_ENV=production.');
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_CUSTOMER.email));
  if (existing) return existing.id;

  await auth.api.signUpEmail({
    body: {
      email: DEMO_CUSTOMER.email,
      password: DEMO_CUSTOMER.password,
      name: DEMO_CUSTOMER.name,
    },
  });

  const [created] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_CUSTOMER.email));
  if (!created) {
    throw new Error('Seed error: demo customer not found after signUpEmail');
  }
  return created.id;
}

// Synthetic sample orders for STAFF-002 QA (dev only). Fixed order_numbers give
// idempotency: orders upsert via ON CONFLICT (order_number) DO NOTHING, and each
// order's items are delete-then-reinserted so re-seeding converges to the same
// end-state. Statuses span the 5 non-terminal states so the staff dashboard shows
// varied pills; placed_at is spaced so newest-first sort is visible.
const SAMPLE_ORDERS = [
  { number: 'JP-260713-S001', status: 'pending' as const, minutesAgo: 1 },
  { number: 'JP-260713-S002', status: 'accepted' as const, minutesAgo: 4 },
  { number: 'JP-260713-S003', status: 'preparing' as const, minutesAgo: 8 },
  { number: 'JP-260713-S004', status: 'flavoring' as const, minutesAgo: 13 },
  { number: 'JP-260713-S005', status: 'ready' as const, minutesAgo: 19 },
];

/**
 * Seed ~5 varied-status active orders for the first seeded branch (STAFF-002 QA).
 * Idempotent via fixed order_numbers + ON CONFLICT (order_number) DO UPDATE; items
 * are delete-then-reinserted. Requires a real product UUID for the order_items FK
 * (NOT NULL) — derived from `productIdBySlug`, never hardcoded. The conflict SET
 * re-points `user_id` to the demo customer so a single re-seed migrates any
 * existing local DB whose sample orders were previously owned by jojo@test.com.
 */
async function seedSampleOrders(
  branchIdBySlug: Map<string, string>,
  productIdBySlug: Map<string, string>,
  demoUserId: string,
): Promise<void> {
  const [firstBranchId] = branchIdBySlug.values();
  if (!firstBranchId) {
    throw new Error('Seed error: cannot seed sample orders — no branches were seeded');
  }
  const [firstProductId] = productIdBySlug.values();
  if (!firstProductId) {
    throw new Error('Seed error: cannot seed sample orders — no products were seeded');
  }

  const now = Date.now();
  for (const sample of SAMPLE_ORDERS) {
    const placedAt = new Date(now - sample.minutesAgo * 60_000);

    await db
      .insert(orders)
      .values({
        user_id: demoUserId,
        branch_id: firstBranchId,
        order_number: sample.number,
        status: sample.status,
        subtotal: '10.00',
        discount_total: '0',
        total: '10.00',
        payment_method: 'pay_at_branch',
        placed_at: placedAt,
      })
      .onConflictDoUpdate({
        target: orders.order_number,
        // Re-point ownership (and refresh mutable fields) so a re-seed migrates
        // pre-existing sample orders off jojo@test.com onto the demo customer.
        set: {
          user_id: demoUserId,
          branch_id: firstBranchId,
          status: sample.status,
          placed_at: placedAt,
          updated_at: new Date(),
        },
      });

    const [orderRow] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.order_number, sample.number));
    if (!orderRow) {
      throw new Error(`Seed error: sample order "${sample.number}" not found after upsert`);
    }

    // Delete-then-reinsert items so re-seeding converges to a fixed set.
    await db.delete(orderItems).where(eq(orderItems.order_id, orderRow.id));
    await db.insert(orderItems).values([
      {
        order_id: orderRow.id,
        product_id: firstProductId,
        product_name_snapshot: 'Loaded Fries',
        quantity: 2,
        unit_price: '5.00',
        total_price: '10.00',
        selected_options: [
          { optionId: 'opt-flavor-1', optionType: 'flavor', name: 'BBQ Ranch', priceDeltaCents: 0 },
        ],
      },
    ]);
  }
}

// The single MVP reward (STAR-002 / PRD §6.10): 5 stars unlocks a free item.
// `reward_value` is null — the reward is a free regular fries/lemonade, not a
// monetary discount. Admin-configurable thresholds are ADM-005 (out of scope).
const MVP_REWARD = {
  name: 'Free regular fries or lemonade',
  required_stars: 5,
  reward_type: 'free_item',
  reward_value: null,
  is_active: true,
} as const;

// rewards.name has no unique constraint, so idempotency is app-level: find the
// active reward by name, then update or insert. Re-seeding converges to exactly
// one active 5-star reward.
async function seedRewardsTable(): Promise<void> {
  const [existing] = await db
    .select({ id: rewards.id })
    .from(rewards)
    .where(eq(rewards.name, MVP_REWARD.name));

  if (existing) {
    await db
      .update(rewards)
      .set({ ...MVP_REWARD, updated_at: new Date() })
      .where(eq(rewards.id, existing.id));
  } else {
    await db.insert(rewards).values(MVP_REWARD);
  }
}

export async function runSeed(): Promise<void> {
  const branchIdBySlug = await seedBranchesTable();
  await seedStaffUser(branchIdBySlug);
  const categoryIdBySlug = await seedCategoriesTable();
  const productIdBySlug = await seedProductsTable(categoryIdBySlug);
  await seedProductOptionsTable(productIdBySlug);
  await seedBranchProductAvailabilityTable(branchIdBySlug, productIdBySlug);
  const dealIdByTitle = await seedDealsTable();
  await seedDealScopingTables(dealIdByTitle, productIdBySlug, branchIdBySlug);
  await seedRewardsTable();
  await seedTestUser();

  // Sample orders are owned by a dedicated demo customer (NOT jojo@test.com), so
  // the seed-test-user unit test can delete jojo@test.com without hitting the
  // orders.user_id FK. seedDemoCustomer() returns the owning id directly.
  const demoUserId = await seedDemoCustomer();
  await seedSampleOrders(branchIdBySlug, productIdBySlug, demoUserId);

  console.log('Seed complete:');
  console.log(`  branches: ${branchIdBySlug.size}`);
  console.log(`  staff users: 1 (${STAFF_EMAIL})`);
  console.log(`  categories: ${categoryIdBySlug.size}`);
  console.log(`  products: ${productIdBySlug.size}`);
  console.log(`  deals: ${dealIdByTitle.size}`);
  console.log(`  rewards: 1 (${MVP_REWARD.name}, ${MVP_REWARD.required_stars} stars)`);
  console.log(`  test user: ${TEST_USER.email}`);
  console.log(`  demo customer: ${DEMO_CUSTOMER.email} (owns sample orders)`);
  console.log(`  sample orders: ${SAMPLE_ORDERS.length}`);
}
