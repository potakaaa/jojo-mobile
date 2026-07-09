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
};

export const seedBranches: SeedBranch[] = [
  {
    slug: 'jojo-poblacion',
    name: 'Jojo Potato - Poblacion',
    address: 'J. Panganiban St, Poblacion, Cebu City, Cebu',
    latitude: '10.315700',
    longitude: '123.891500',
    phone: '+63 32 234 5601',
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
  },
  {
    // Closed branch — whole branch offline.
    slug: 'jojo-mabolo',
    name: 'Jojo Potato - Mabolo',
    address: 'Gorordo Ave, Mabolo, Cebu City, Cebu',
    latitude: '10.323400',
    longitude: '123.904200',
    phone: '+63 32 234 5602',
    opening_hours: JSON.stringify({
      mon: { open: '09:00', close: '21:00' },
      tue: { open: '09:00', close: '21:00' },
      wed: { open: '09:00', close: '21:00' },
      thu: { open: '09:00', close: '21:00' },
      fri: { open: '09:00', close: '21:00' },
      sat: { open: '09:00', close: '21:00' },
      sun: { open: '09:00', close: '21:00' },
    }),
    is_active: false,
    is_accepting_pickup: true,
    estimated_prep_minutes: 15,
  },
  {
    // Open branch, but pickup paused (e.g. kitchen backlog) — orthogonal to is_active.
    slug: 'jojo-it-park',
    name: 'Jojo Potato - IT Park',
    address: 'Asiatown IT Park, Lahug, Cebu City, Cebu',
    latitude: '10.330500',
    longitude: '123.905800',
    phone: '+63 32 234 5603',
    opening_hours: JSON.stringify({
      mon: { open: '10:00', close: '23:00' },
      tue: { open: '10:00', close: '23:00' },
      wed: { open: '10:00', close: '23:00' },
      thu: { open: '10:00', close: '23:00' },
      fri: { open: '10:00', close: '00:00' },
      sat: { open: '10:00', close: '00:00' },
      sun: { open: '10:00', close: '23:00' },
    }),
    is_active: true,
    is_accepting_pickup: false,
    estimated_prep_minutes: 20,
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
    description: '20% off your whole order at the IT Park branch, for a limited time.',
    deal_type: 'percentage_discount',
    discount_value: '20.00',
    minimum_order_amount: '0',
    windowDays: 7,
    usage_limit_per_user: null,
    total_usage_limit: null,
    productSlugs: [],
    branchSlugs: ['jojo-it-park'],
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
