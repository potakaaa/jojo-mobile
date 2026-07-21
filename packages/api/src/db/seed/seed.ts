import { eq, sql } from 'drizzle-orm';
import { auth } from '../../lib/auth';
import { rewardCouponCodeGenerator } from '../../lib/reward-coupon-code';
import { db } from '../client';
import {
  branchProductAvailability,
  branches,
  categories,
  coupons,
  dealComponents,
  offerBranches,
  offerProducts,
  offers,
  orderItems,
  orders,
  productOptions,
  products,
  rewards,
  starTransactions,
  userStars,
  users,
} from '../schema/index';
import { seedBranches, seedCategories, seedDealProducts, seedDeals, seedProducts } from './data';

// Relative image paths (resolved against the API origin at render time by the
// mobile app — see apps/mobile/src/lib/image-url.ts). Served statically from
// packages/api/public/images by the `/images` mount in src/index.ts. Products/deals
// without an entry keep image_url = null and render the app's placeholder block.
const PRODUCT_IMAGE_BY_SLUG: Record<string, string> = {
  'classic-fries': '/images/fries-large.webp',
  'cheese-fries': '/images/fries-large.webp',
  'original-corndog': '/images/corndog.webp',
  'double-cheese-corndog': '/images/corndog.webp',
  'spicy-nuggets': '/images/nuggets.webp',
  'classic-nuggets': '/images/nuggets.webp',
  lemonade: '/images/lemonade.webp',
  'fries-corndog-combo': '/images/product-trio.webp',
};

const DEAL_IMAGE_BY_TITLE: Record<string, string> = {
  'First app order: Free lemonade upgrade': '/images/lemonade.webp',
  'Snack break deal: Fries + Lemonade bundle': '/images/product-trio.webp',
  'Buy 1 Take 1 lemonade': '/images/lemonade.webp',
  'Branch-exclusive opening promo': '/images/mascot.webp',
  'Weekend combo deal': '/images/product-trio.webp',
};

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
      image_url: PRODUCT_IMAGE_BY_SLUG[product.slug] ?? null,
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

// Deal-products (ADM-004 deals-as-products): a deal IS a `products` row with
// `is_deal = true`, pinned to the reserved `deals` category the seed already
// provisions (matching DEALS_CATEGORY_SLUG in routes/admin/deals.ts). Ids are
// merged INTO productIdBySlug so seedBranchProductAvailabilityTable picks them up
// with no change to that function. Distinct from seedDealsTable (legacy `offers`).
async function seedDealProductsTable(
  categoryIdBySlug: Map<string, string>,
  productIdBySlug: Map<string, string>,
): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();
  const dealsCategoryId = categoryIdBySlug.get('deals');
  if (!dealsCategoryId) {
    throw new Error('Seed data error: reserved category "deals" is missing — cannot seed deals');
  }
  for (const deal of seedDealProducts) {
    const row = {
      slug: deal.slug,
      name: deal.name,
      description: deal.description,
      category_id: dealsCategoryId,
      base_price: deal.base_price,
      is_deal: true,
      is_reward_eligible: false,
      image_url: PRODUCT_IMAGE_BY_SLUG[deal.slug] ?? null,
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
      throw new Error(`Seed error: upsert of deal-product "${deal.slug}" returned no row`);
    idBySlug.set(inserted.slug, inserted.id);
    productIdBySlug.set(inserted.slug, inserted.id);
  }
  return idBySlug;
}

// deal_components has a composite unique on (deal_product_id, component_product_id),
// so the pair is a valid ON CONFLICT target — quantity is refreshed on re-seed.
async function seedDealComponentsTable(productIdBySlug: Map<string, string>): Promise<void> {
  for (const deal of seedDealProducts) {
    const dealProductId = productIdBySlug.get(deal.slug);
    if (!dealProductId) {
      throw new Error(`Seed data error: components for unknown deal-product "${deal.slug}"`);
    }
    for (const component of deal.components) {
      const componentProductId = productIdBySlug.get(component.componentSlug);
      if (!componentProductId) {
        throw new Error(
          `Seed data error: deal-product "${deal.slug}" references unknown component "${component.componentSlug}"`,
        );
      }
      await db
        .insert(dealComponents)
        .values({
          deal_product_id: dealProductId,
          component_product_id: componentProductId,
          quantity: component.quantity,
        })
        .onConflictDoUpdate({
          target: [dealComponents.deal_product_id, dealComponents.component_product_id],
          set: { quantity: component.quantity },
        });
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
      image_url: DEAL_IMAGE_BY_TITLE[deal.title] ?? null,
    };
    const [existing] = await db
      .select({ id: offers.id })
      .from(offers)
      .where(eq(offers.title, deal.title));

    const [dealRow] = existing
      ? await db
          .update(offers)
          .set({ ...row, updated_at: new Date() })
          .where(eq(offers.id, existing.id))
          .returning({ id: offers.id, title: offers.title })
      : await db.insert(offers).values(row).returning({ id: offers.id, title: offers.title });

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
        .insert(offerProducts)
        .values({ offer_id: dealId, product_id: productId })
        .onConflictDoNothing({
          target: [offerProducts.offer_id, offerProducts.product_id],
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
        .insert(offerBranches)
        .values({ offer_id: dealId, branch_id: branchId })
        .onConflictDoNothing({
          target: [offerBranches.offer_id, offerBranches.branch_id],
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

// Battle-pass reward roadmap (STAR-003): a uniform 5-star-cadence escalating
// roadmap. Tier 1 stays at 5 stars = the previous single MVP reward, so
// STAR-002's `/rewards/summary` (MIN active reward) is unchanged and does not
// regress. All `free_item` with `reward_value: null` (free item, not a monetary
// discount) — no new reward_type semantics. Admin-configurable thresholds are
// ADM-005 (unlock reads thresholds LIVE, so ADM-005 slots in without touching
// unlock logic).
const REWARD_ROADMAP = [
  { name: 'Free regular fries or lemonade', required_stars: 5, reward_type: 'free_item', reward_value: null }, // prettier-ignore
  { name: 'Free large fries', required_stars: 10, reward_type: 'free_item', reward_value: null },
  { name: 'Free combo meal', required_stars: 15, reward_type: 'free_item', reward_value: null },
  { name: 'Free premium loaded fries', required_stars: 20, reward_type: 'free_item', reward_value: null }, // prettier-ignore
] as const;

// The roadmap tier bound to a real product (STAR-004 AC8): tier 1 ("Free regular
// fries or lemonade", 5 stars) is bound to the seeded `classic-fries` product so
// its reward coupon is redeemable end-to-end without STAFF-003. No migration —
// `rewards.eligible_product_id` already exists, and `classic-fries` is a seeded
// product.
const REWARD_ELIGIBLE_PRODUCT_SLUG_BY_NAME: Record<string, string> = {
  'Free regular fries or lemonade': 'classic-fries',
  'Free large fries': 'cheese-fries',
  'Free combo meal': 'fries-corndog-combo',
  'Free premium loaded fries': 'cheese-fries',
};

// rewards.name has no unique constraint, so idempotency is app-level: for each
// roadmap tier, find the reward by name, then update-or-insert (active). Re-seeding
// converges to exactly these N active tiers. NOTE: this only upserts by name — any
// PRE-EXISTING extra active rewards in a shared local dev DB are left as-is
// (acceptable for a dev seed; the hermetic per-run `_test` DB used by the gates is
// unaffected, and the self-seeding test suite uses `seedRewardTier`, not `db:seed`).
async function seedRewardsTable(productIdBySlug: Map<string, string>): Promise<void> {
  for (const tier of REWARD_ROADMAP) {
    const [existing] = await db
      .select({ id: rewards.id })
      .from(rewards)
      .where(eq(rewards.name, tier.name));

    const eligibleSlug = REWARD_ELIGIBLE_PRODUCT_SLUG_BY_NAME[tier.name];
    const eligibleProductId = eligibleSlug ? (productIdBySlug.get(eligibleSlug) ?? null) : null;
    const row = { ...tier, is_active: true, eligible_product_id: eligibleProductId };
    if (existing) {
      await db
        .update(rewards)
        .set({ ...row, updated_at: new Date() })
        .where(eq(rewards.id, existing.id));
    } else {
      await db.insert(rewards).values(row);
    }
  }
}

// Mint an `available` reward coupon for the dev test user (STAR-004 AC8), so the
// apply → checkout → consume flow is demoable/testable WITHOUT STAFF-003. Called
// AFTER seedTestUser() (which creates jojo@test.com) — the test user's row does
// not exist until then. Idempotent via the 0006 `coupons_user_reward_unique`
// partial index (`onConflictDoNothing` carrying the matching `where` predicate,
// per the STAR-001/003 E1 lesson: the bare target-only form throws on a partial
// index). Fail-soft: if the test user or tier-1 reward is absent (e.g. prod guard
// skipped seedTestUser), there is nothing to mint.
async function seedTestUserRewardCoupon(): Promise<void> {
  // Reuse seedTestUser()'s own by-email lookup shape (E3) to resolve the id.
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, TEST_USER.email));
  if (!user) return;

  const [reward] = await db
    .select({ id: rewards.id })
    .from(rewards)
    .where(eq(rewards.name, REWARD_ROADMAP[0].name));
  if (!reward) return;

  await db
    .insert(coupons)
    .values({ user_id: user.id, reward_id: reward.id, code: rewardCouponCodeGenerator.generate() })
    .onConflictDoNothing({
      target: [coupons.user_id, coupons.reward_id],
      where: sql`${coupons.reward_id} IS NOT NULL`,
    });
}

async function resolveTestUserId(): Promise<string> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, TEST_USER.email));
  if (!row) throw new Error('Seed error: jojo@test.com not found after seedTestUser');
  return row.id;
}

// Complete jojo@test.com's customer profile so the app routes straight to the
// tabs (not onboarding) and the Account screen shows real data. birthday is a
// pg `date` column → 'YYYY-MM-DD' string; onboardedAt flips the nav gate.
async function seedTestUserProfile(jojoId: string): Promise<void> {
  await db
    .update(users)
    .set({
      name: 'Jojo Dela Cruz',
      birthday: '1998-03-15',
      address: 'Unit 4B, C.M. Recto Ave, Cogon, Cagayan de Oro',
      onboardedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, jojoId));
}

// Upsert jojo's star balance. user_stars.user_id is UNIQUE, so ON CONFLICT keys
// off it. current_stars 7 unlocks the 4/5/6-star rewards but not the 8/10-star ones.
async function seedUserStarsRow(jojoId: string): Promise<void> {
  await db
    .insert(userStars)
    .values({ user_id: jojoId, current_stars: 7, lifetime_stars: 25 })
    .onConflictDoUpdate({
      target: userStars.user_id,
      set: { current_stars: 7, lifetime_stars: 25, updated_at: new Date() },
    });
}

type JojoOrderItemSpec = {
  slug: string;
  name: string;
  quantity: number;
  unitPrice: string;
  options?: {
    optionId: string;
    optionType: 'size' | 'flavor' | 'add_on';
    name: string;
    priceDeltaCents: number;
  }[];
};

type JojoOrderSpec = {
  number: string;
  status: 'completed' | 'ready' | 'preparing' | 'accepted' | 'cancelled' | 'rejected';
  minutesAgo: number;
  items: JojoOrderItemSpec[];
};

// jojo@test.com's order history + in-flight + edge-state orders. Spans past
// completed orders (populate History + justify stars), live states (tracking
// variety), and cancelled/rejected edges. Prices match the seeded product base
// prices; discount_total is 0 so total == subtotal.
const JOJO_ORDERS: JojoOrderSpec[] = [
  {
    number: 'JP-260701-J001',
    status: 'completed',
    minutesAgo: 14 * 24 * 60,
    items: [
      {
        slug: 'classic-fries',
        name: 'Classic Fries',
        quantity: 2,
        unitPrice: '89.00',
        options: [
          { optionId: 'opt-size-large', optionType: 'size', name: 'Large', priceDeltaCents: 3000 },
        ],
      },
      { slug: 'lemonade', name: 'Lemonade', quantity: 1, unitPrice: '59.00' },
    ],
  },
  {
    number: 'JP-260703-J002',
    status: 'completed',
    minutesAgo: 12 * 24 * 60,
    items: [
      {
        slug: 'fries-corndog-combo',
        name: 'Fries + Corndog Combo',
        quantity: 1,
        unitPrice: '139.00',
      },
    ],
  },
  {
    number: 'JP-260705-J003',
    status: 'completed',
    minutesAgo: 10 * 24 * 60,
    items: [
      { slug: 'spicy-nuggets', name: 'Spicy Nuggets', quantity: 1, unitPrice: '99.00' },
      { slug: 'lemonade', name: 'Lemonade', quantity: 1, unitPrice: '59.00' },
    ],
  },
  {
    number: 'JP-260708-J004',
    status: 'completed',
    minutesAgo: 7 * 24 * 60,
    items: [
      { slug: 'original-corndog', name: 'Original Corndog', quantity: 3, unitPrice: '69.00' },
    ],
  },
  {
    number: 'JP-260714-J005',
    status: 'ready',
    minutesAgo: 20,
    items: [
      { slug: 'classic-fries', name: 'Classic Fries', quantity: 1, unitPrice: '89.00' },
      { slug: 'lemonade', name: 'Lemonade', quantity: 1, unitPrice: '59.00' },
    ],
  },
  {
    number: 'JP-260714-J006',
    status: 'preparing',
    minutesAgo: 10,
    items: [{ slug: 'spicy-nuggets', name: 'Spicy Nuggets', quantity: 2, unitPrice: '99.00' }],
  },
  {
    number: 'JP-260714-J007',
    status: 'accepted',
    minutesAgo: 5,
    items: [
      {
        slug: 'fries-corndog-combo',
        name: 'Fries + Corndog Combo',
        quantity: 1,
        unitPrice: '139.00',
      },
    ],
  },
  {
    number: 'JP-260710-J008',
    status: 'cancelled',
    minutesAgo: 5 * 24 * 60,
    items: [{ slug: 'lemonade', name: 'Lemonade', quantity: 1, unitPrice: '59.00' }],
  },
  {
    number: 'JP-260711-J009',
    status: 'rejected',
    minutesAgo: 4 * 24 * 60,
    items: [{ slug: 'classic-fries', name: 'Classic Fries', quantity: 1, unitPrice: '89.00' }],
  },
];

/**
 * Effective per-unit price in cents: the product base price plus the sum of the
 * item's selected-option price deltas (e.g. the +₱30 Large size adjustment).
 */
function itemUnitPriceCents(item: JojoOrderItemSpec): number {
  const optionDeltaCents = (item.options ?? []).reduce((sum, o) => sum + o.priceDeltaCents, 0);
  return Math.round(Number(item.unitPrice) * 100) + optionDeltaCents;
}

/** Sum item line totals (effective unit price × quantity) to a 2-decimal peso string. */
function orderSubtotal(items: JojoOrderItemSpec[]): string {
  const cents = items.reduce((sum, item) => sum + itemUnitPriceCents(item) * item.quantity, 0);
  return (cents / 100).toFixed(2);
}

/**
 * Seed jojo@test.com's orders (History + tracking + star sources). Idempotent via
 * fixed order_numbers (ON CONFLICT (order_number) DO UPDATE) + delete-then-reinsert
 * items. Per-status timestamps are derived from placed_at. Returns the ids of the
 * `completed` orders so star_transactions can tie earned stars to real orders.
 */
async function seedJojoOrders(
  jojoId: string,
  branchId: string,
  productIdBySlug: Map<string, string>,
): Promise<string[]> {
  const now = Date.now();
  const completedOrderIds: string[] = [];

  for (const spec of JOJO_ORDERS) {
    const placedAt = new Date(now - spec.minutesAgo * 60_000);
    const acceptedAt = new Date(placedAt.getTime() + 2 * 60_000);
    const readyAt = new Date(placedAt.getTime() + 15 * 60_000);
    const completedAt = new Date(placedAt.getTime() + 25 * 60_000);
    const cancelledAt = new Date(placedAt.getTime() + 3 * 60_000);
    const estimatedReadyAt = new Date(placedAt.getTime() + 15 * 60_000);
    const subtotal = orderSubtotal(spec.items);

    const timestamps = {
      accepted_at:
        spec.status === 'completed' ||
        spec.status === 'ready' ||
        spec.status === 'preparing' ||
        spec.status === 'accepted'
          ? acceptedAt
          : null,
      ready_at: spec.status === 'completed' || spec.status === 'ready' ? readyAt : null,
      completed_at: spec.status === 'completed' ? completedAt : null,
      cancelled_at: spec.status === 'cancelled' ? cancelledAt : null,
      estimated_ready_at:
        spec.status === 'ready' || spec.status === 'preparing' || spec.status === 'accepted'
          ? estimatedReadyAt
          : null,
    };

    await db
      .insert(orders)
      .values({
        user_id: jojoId,
        branch_id: branchId,
        order_number: spec.number,
        status: spec.status,
        subtotal,
        discount_total: '0',
        total: subtotal,
        payment_method: 'pay_at_branch',
        payment_status: 'unpaid',
        placed_at: placedAt,
        ...timestamps,
      })
      .onConflictDoUpdate({
        target: orders.order_number,
        set: {
          user_id: jojoId,
          branch_id: branchId,
          status: spec.status,
          subtotal,
          discount_total: '0',
          total: subtotal,
          placed_at: placedAt,
          ...timestamps,
          updated_at: new Date(),
        },
      });

    const [orderRow] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.order_number, spec.number));
    if (!orderRow) {
      throw new Error(`Seed error: jojo order "${spec.number}" not found after upsert`);
    }
    if (spec.status === 'completed') completedOrderIds.push(orderRow.id);

    await db.delete(orderItems).where(eq(orderItems.order_id, orderRow.id));
    await db.insert(orderItems).values(
      spec.items.map((item) => {
        const productId = productIdBySlug.get(item.slug);
        if (!productId) {
          throw new Error(
            `Seed data error: jojo order item references unknown product "${item.slug}"`,
          );
        }
        const perUnitCents = itemUnitPriceCents(item);
        return {
          order_id: orderRow.id,
          product_id: productId,
          product_name_snapshot: item.name,
          quantity: item.quantity,
          unit_price: (perUnitCents / 100).toFixed(2),
          total_price: ((perUnitCents * item.quantity) / 100).toFixed(2),
          selected_options: item.options ?? [],
        };
      }),
    );
  }
  return completedOrderIds;
}

// Seed jojo's star ledger. Idempotent: delete this user's transactions first, then
// insert a consistent-looking set (earned rows tied to completed orders + a welcome
// bonus + one redeemed). The user_stars row is the authoritative balance; these
// rows are the display ledger.
async function seedStarTransactionsRows(
  jojoId: string,
  completedOrderIds: string[],
): Promise<void> {
  await db.delete(starTransactions).where(eq(starTransactions.user_id, jojoId));

  const rows: {
    user_id: string;
    order_id: string | null;
    type: 'earned' | 'redeemed';
    stars: number;
    description: string;
  }[] = [
    { user_id: jojoId, order_id: null, type: 'earned', stars: 5, description: 'Welcome bonus' },
  ];
  for (const orderId of completedOrderIds) {
    rows.push({
      user_id: jojoId,
      order_id: orderId,
      type: 'earned',
      stars: 5,
      description: 'Stars earned from order',
    });
  }
  rows.push({
    user_id: jojoId,
    order_id: null,
    type: 'redeemed',
    stars: 18,
    description: 'Redeemed reward',
  });

  await db.insert(starTransactions).values(rows);
}

export async function runSeed(): Promise<void> {
  const branchIdBySlug = await seedBranchesTable();
  await seedStaffUser(branchIdBySlug);
  const categoryIdBySlug = await seedCategoriesTable();
  const productIdBySlug = await seedProductsTable(categoryIdBySlug);
  await seedProductOptionsTable(productIdBySlug);
  // Before bpa seeding: seedDealProductsTable merges deal ids into productIdBySlug,
  // so deal-products get their availability rows from the same loop.
  const dealProductIdBySlug = await seedDealProductsTable(categoryIdBySlug, productIdBySlug);
  await seedDealComponentsTable(productIdBySlug);
  await seedBranchProductAvailabilityTable(branchIdBySlug, productIdBySlug);
  const dealIdByTitle = await seedDealsTable();
  await seedDealScopingTables(dealIdByTitle, productIdBySlug, branchIdBySlug);
  await seedRewardsTable(productIdBySlug);
  await seedTestUser();
  // Mint the test user's reward coupon AFTER seedTestUser() creates the row.
  await seedTestUserRewardCoupon();

  // Rich customer data attached to jojo@test.com: completed profile (routes to
  // tabs, populates Account), star balance, orders (History/tracking/star sources),
  // and the star ledger. All idempotent. (The battle-pass reward coupon is minted
  // by seedTestUserRewardCoupon above — the dropped spend-to-redeem coupon wallet
  // is not seeded.)
  const [firstBranchId] = branchIdBySlug.values();
  if (!firstBranchId) throw new Error('Seed error: no branches seeded for jojo orders');
  const jojoId = await resolveTestUserId();
  await seedTestUserProfile(jojoId);
  await seedUserStarsRow(jojoId);
  const completedOrderIds = await seedJojoOrders(jojoId, firstBranchId, productIdBySlug);
  await seedStarTransactionsRows(jojoId, completedOrderIds);

  // Sample orders are owned by a dedicated demo customer (NOT jojo@test.com), so
  // the seed-test-user unit test can delete jojo@test.com without hitting the
  // orders.user_id FK. seedDemoCustomer() returns the owning id directly.
  const demoUserId = await seedDemoCustomer();
  await seedSampleOrders(branchIdBySlug, productIdBySlug, demoUserId);

  console.log('Seed complete:');
  console.log(`  branches: ${branchIdBySlug.size}`);
  console.log(`  staff users: 1 (${STAFF_EMAIL})`);
  console.log(`  categories: ${categoryIdBySlug.size}`);
  console.log(
    `  products: ${productIdBySlug.size} (incl. ${dealProductIdBySlug.size} deal-products)`,
  );
  console.log(`  deals: ${dealIdByTitle.size}`);
  console.log(
    `  rewards: ${REWARD_ROADMAP.length} (roadmap: ${REWARD_ROADMAP.map((r) => `${r.required_stars}★`).join(', ')})`,
  );
  console.log(`  test user: ${TEST_USER.email} (profile completed, + 1 available reward coupon)`);
  console.log(`  jojo orders: ${JOJO_ORDERS.length} (completed: ${completedOrderIds.length})`);
  console.log(`  jojo stars: current 7 / lifetime 25`);
  console.log(`  demo customer: ${DEMO_CUSTOMER.email} (owns sample orders)`);
  console.log(`  sample orders: ${SAMPLE_ORDERS.length}`);
}
