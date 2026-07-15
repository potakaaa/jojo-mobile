// Seed data constants for local/dev/demo databases.
//
// Convention (not enforced by schema, established here): a deal with no matching
// `deal_products` rows applies to every product, and one with no matching
// `deal_branches` rows applies to every branch. Deal discount values, windows, and
// scoping below are invented placeholder demo values — the PRD (§6.8) names these
// five deals but specifies no mechanics.

export type SeedBranch = {
  slug: string;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  phone: string;
  opening_hours: string;
  is_active: boolean;
  is_accepting_pickup: boolean;
  estimated_prep_minutes: number;
  priority: number;
};

// Cagayan de Oro (CDO) demo branches, ordered by proximity to the dev user's
// location (~8.4765, 124.6449). Coordinates are real, address-verified CDO
// landmarks. The four rows deliberately cover every branch-state combination so
// the locator + "nearest branch" UI can be exercised: fully open (Cogon,
// Centrio), open-but-pickup-paused (SM Downtown), and closed (Limketkai).
export const seedBranches: SeedBranch[] = [
  {
    // Nearest to the dev user — priority 1.
    slug: 'jojo-cogon',
    name: 'Jojo Potato - Cogon',
    address: 'C.M. Recto Ave, Cogon, Cagayan de Oro, Misamis Oriental',
    latitude: '8.477600',
    longitude: '124.647300',
    phone: '+63 88 856 1001',
    opening_hours: JSON.stringify({
      mon: { open: '09:00', close: '21:00' },
      tue: { open: '09:00', close: '21:00' },
      wed: { open: '09:00', close: '21:00' },
      thu: { open: '09:00', close: '21:00' },
      fri: { open: '09:00', close: '22:00' },
      sat: { open: '09:00', close: '22:00' },
      sun: { open: '10:00', close: '20:00' },
    }),
    is_active: true,
    is_accepting_pickup: true,
    estimated_prep_minutes: 15,
    priority: 1,
  },
  {
    slug: 'jojo-centrio',
    name: 'Jojo Potato - Centrio',
    address: 'Ayala Centrio Mall, Corrales cor. Claro M. Recto Ave, Cagayan de Oro',
    latitude: '8.484800',
    longitude: '124.650600',
    phone: '+63 88 856 1002',
    opening_hours: JSON.stringify({
      mon: { open: '10:00', close: '21:00' },
      tue: { open: '10:00', close: '21:00' },
      wed: { open: '10:00', close: '21:00' },
      thu: { open: '10:00', close: '21:00' },
      fri: { open: '10:00', close: '22:00' },
      sat: { open: '10:00', close: '22:00' },
      sun: { open: '10:00', close: '21:00' },
    }),
    is_active: true,
    is_accepting_pickup: true,
    estimated_prep_minutes: 15,
    priority: 2,
  },
  {
    // Open branch, but pickup paused (demo) — orthogonal to is_active.
    slug: 'jojo-sm-downtown',
    name: 'Jojo Potato - SM Downtown',
    address: 'SM CDO Downtown Premier, Claro M. Recto Ave cor. Osmeña St, Cagayan de Oro',
    latitude: '8.485040',
    longitude: '124.653960',
    phone: '+63 88 856 1003',
    opening_hours: JSON.stringify({
      mon: { open: '10:00', close: '22:00' },
      tue: { open: '10:00', close: '22:00' },
      wed: { open: '10:00', close: '22:00' },
      thu: { open: '10:00', close: '22:00' },
      fri: { open: '10:00', close: '22:00' },
      sat: { open: '10:00', close: '22:00' },
      sun: { open: '10:00', close: '22:00' },
    }),
    is_active: true,
    is_accepting_pickup: false,
    estimated_prep_minutes: 20,
    priority: 3,
  },
  {
    // Closed branch (demo) — whole branch offline; excluded from GET /api/branches.
    slug: 'jojo-limketkai',
    name: 'Jojo Potato - Limketkai',
    address: 'Limketkai Center, Lapasan, Cagayan de Oro, Misamis Oriental',
    latitude: '8.481970',
    longitude: '124.656570',
    phone: '+63 88 856 1004',
    opening_hours: JSON.stringify({
      mon: { open: '10:00', close: '21:00' },
      tue: { open: '10:00', close: '21:00' },
      wed: { open: '10:00', close: '21:00' },
      thu: { open: '10:00', close: '21:00' },
      fri: { open: '10:00', close: '21:00' },
      sat: { open: '10:00', close: '21:00' },
      sun: { open: '10:00', close: '21:00' },
    }),
    is_active: false,
    is_accepting_pickup: true,
    estimated_prep_minutes: 15,
    priority: 4,
  },
];

export type SeedCategory = {
  slug: string;
  name: string;
  sort_order: number;
};

export const seedCategories: SeedCategory[] = [
  { slug: 'fries', name: 'Fries', sort_order: 0 },
  { slug: 'corndogs', name: 'Corndogs', sort_order: 1 },
  { slug: 'nuggets', name: 'Nuggets', sort_order: 2 },
  { slug: 'lemonade', name: 'Lemonade', sort_order: 3 },
  { slug: 'combos', name: 'Combos', sort_order: 4 },
  // Reserved category — intentionally seeded with no products of its own.
  { slug: 'deals', name: 'Deals', sort_order: 5 },
];

export type SeedProductOption = {
  option_type: 'size' | 'flavor' | 'add_on';
  name: string;
  price_delta: string;
  sort_order: number;
};

export type SeedProduct = {
  slug: string;
  name: string;
  description: string;
  categorySlug: string;
  base_price: string;
  is_reward_eligible: boolean;
  options: SeedProductOption[];
};

export const seedProducts: SeedProduct[] = [
  {
    slug: 'classic-fries',
    name: 'Classic Fries',
    description: 'Crispy golden fries, lightly salted.',
    categorySlug: 'fries',
    base_price: '89.00',
    is_reward_eligible: true,
    options: [
      { option_type: 'size', name: 'Regular', price_delta: '0', sort_order: 0 },
      { option_type: 'size', name: 'Large', price_delta: '30.00', sort_order: 1 },
    ],
  },
  {
    slug: 'cheese-fries',
    name: 'Cheese Fries',
    description: 'Classic fries topped with melted cheese sauce.',
    categorySlug: 'fries',
    base_price: '109.00',
    is_reward_eligible: false,
    options: [
      { option_type: 'size', name: 'Regular', price_delta: '0', sort_order: 0 },
      { option_type: 'size', name: 'Large', price_delta: '30.00', sort_order: 1 },
      { option_type: 'add_on', name: 'Extra Cheese Sauce', price_delta: '20.00', sort_order: 2 },
    ],
  },
  {
    slug: 'original-corndog',
    name: 'Original Corndog',
    description: 'Classic corndog on a stick.',
    categorySlug: 'corndogs',
    base_price: '69.00',
    is_reward_eligible: true,
    options: [
      { option_type: 'flavor', name: 'Classic', price_delta: '0', sort_order: 0 },
      { option_type: 'flavor', name: 'Cheese-filled', price_delta: '15.00', sort_order: 1 },
    ],
  },
  {
    slug: 'double-cheese-corndog',
    name: 'Double Cheese Corndog',
    description: 'Corndog stuffed and coated with extra cheese.',
    categorySlug: 'corndogs',
    base_price: '95.00',
    is_reward_eligible: false,
    options: [],
  },
  {
    slug: 'spicy-nuggets',
    name: 'Spicy Nuggets',
    description: 'Crispy chicken nuggets with a spicy kick.',
    categorySlug: 'nuggets',
    base_price: '99.00',
    is_reward_eligible: false,
    options: [
      { option_type: 'size', name: 'Regular (6pc)', price_delta: '0', sort_order: 0 },
      { option_type: 'size', name: 'Large (10pc)', price_delta: '45.00', sort_order: 1 },
    ],
  },
  {
    slug: 'classic-nuggets',
    name: 'Classic Nuggets',
    description: 'Crispy chicken nuggets, original flavor.',
    categorySlug: 'nuggets',
    base_price: '99.00',
    is_reward_eligible: true,
    options: [
      { option_type: 'size', name: 'Regular (6pc)', price_delta: '0', sort_order: 0 },
      { option_type: 'size', name: 'Large (10pc)', price_delta: '45.00', sort_order: 1 },
    ],
  },
  {
    slug: 'lemonade',
    name: 'Lemonade',
    description: 'Freshly squeezed lemonade.',
    categorySlug: 'lemonade',
    base_price: '59.00',
    is_reward_eligible: true,
    options: [
      { option_type: 'size', name: 'Regular', price_delta: '0', sort_order: 0 },
      { option_type: 'size', name: 'Large', price_delta: '20.00', sort_order: 1 },
      { option_type: 'flavor', name: 'Original', price_delta: '0', sort_order: 2 },
      { option_type: 'flavor', name: 'Strawberry', price_delta: '15.00', sort_order: 3 },
    ],
  },
  {
    slug: 'fries-corndog-combo',
    name: 'Fries + Corndog Combo',
    description: 'Classic fries paired with an original corndog.',
    categorySlug: 'combos',
    base_price: '139.00',
    is_reward_eligible: false,
    options: [],
  },
];

export type SeedDeal = {
  title: string;
  description: string;
  deal_type:
    | 'percentage_discount'
    | 'fixed_discount'
    | 'buy_one_take_one'
    | 'free_item'
    | 'free_upgrade'
    | 'bundle';
  discount_value: string | null;
  minimum_order_amount: string;
  windowDays: number;
  usage_limit_per_user: number | null;
  total_usage_limit: number | null;
  /** Empty = applies to every product. */
  productSlugs: string[];
  /** Empty = applies to every branch. */
  branchSlugs: string[];
};

export const seedDeals: SeedDeal[] = [
  {
    title: 'First app order: Free lemonade upgrade',
    description: 'Get a free size upgrade on Lemonade with your first app order.',
    deal_type: 'free_upgrade',
    discount_value: null,
    minimum_order_amount: '0',
    windowDays: 30,
    usage_limit_per_user: 1,
    total_usage_limit: null,
    productSlugs: ['lemonade'],
    branchSlugs: [],
  },
  {
    title: 'Snack break deal: Fries + Lemonade bundle',
    description: 'Classic Fries and a Lemonade together at a bundled discount.',
    deal_type: 'bundle',
    discount_value: '20.00',
    minimum_order_amount: '0',
    windowDays: 30,
    usage_limit_per_user: null,
    total_usage_limit: null,
    productSlugs: ['classic-fries', 'lemonade'],
    branchSlugs: [],
  },
  {
    title: 'Buy 1 Take 1 lemonade',
    description: 'Buy one Lemonade, take one free.',
    deal_type: 'buy_one_take_one',
    discount_value: null,
    minimum_order_amount: '0',
    windowDays: 14,
    usage_limit_per_user: 1,
    total_usage_limit: null,
    productSlugs: ['lemonade'],
    branchSlugs: [],
  },
  {
    title: 'Branch-exclusive opening promo',
    description: '20% off your whole order at the Centrio branch, for a limited time.',
    deal_type: 'percentage_discount',
    discount_value: '20.00',
    minimum_order_amount: '0',
    windowDays: 7,
    usage_limit_per_user: null,
    total_usage_limit: null,
    productSlugs: [],
    branchSlugs: ['jojo-centrio'],
  },
  {
    title: 'Weekend combo deal',
    // Schema has no recurrence field, so a single active window stands in for
    // "every weekend" rather than a recurring Fri-Sun rule.
    description: '15% off the Fries + Corndog Combo.',
    deal_type: 'percentage_discount',
    discount_value: '15.00',
    minimum_order_amount: '0',
    windowDays: 90,
    usage_limit_per_user: null,
    total_usage_limit: null,
    productSlugs: ['fries-corndog-combo'],
    branchSlugs: [],
  },
];

export type SeedReward = {
  name: string;
  required_stars: number;
  reward_type: 'free_item' | 'fixed_discount' | 'percentage_discount';
  /** Decimal-peso string for discount rewards; null for free-item rewards. */
  reward_value: string | null;
  /** Product slug the reward unlocks (free-item rewards only); null otherwise. */
  eligibleProductSlug: string | null;
};

// Redeemable rewards catalog (Rewards tab). free_item rewards point at a real
// seeded product; fixed/percentage rewards carry a reward_value and no product.
// Idempotency is app-level (find-by-name) since `rewards` has no unique column.
export const seedRewards: SeedReward[] = [
  {
    name: 'Free Regular Fries',
    required_stars: 5,
    reward_type: 'free_item',
    reward_value: null,
    eligibleProductSlug: 'classic-fries',
  },
  {
    name: 'Free Lemonade',
    required_stars: 4,
    reward_type: 'free_item',
    reward_value: null,
    eligibleProductSlug: 'lemonade',
  },
  {
    name: 'Free Corndog',
    required_stars: 6,
    reward_type: 'free_item',
    reward_value: null,
    eligibleProductSlug: 'original-corndog',
  },
  {
    name: '₱50 Off Your Order',
    required_stars: 8,
    reward_type: 'fixed_discount',
    reward_value: '50.00',
    eligibleProductSlug: null,
  },
  {
    name: '15% Off',
    required_stars: 10,
    reward_type: 'percentage_discount',
    reward_value: '15.00',
    eligibleProductSlug: null,
  },
];
