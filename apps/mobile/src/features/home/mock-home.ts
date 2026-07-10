/**
 * PLACEHOLDER / MOCK DATA — NOT real menu, branch, or rewards data.
 *
 * Structurally inspired by jojopotato.ph menu content (Flavored Fries, Korean
 * Corndogs, Chicken Nuggets, Flavored Lemonade), but every value here is an
 * original placeholder authored for this foundation-stage build — nothing is
 * scraped or copied. Replace this whole module with real API-backed data once a
 * backend is chosen (see process/context/all-context.md Open Questions).
 *
 * Typed against the real shared domain shapes in `@jojopotato/types` so the
 * Home screen renders against the same contracts the eventual API will satisfy.
 */
import type { Category, PickupBranch, Product, RewardsAccount } from '@jojopotato/types';

/**
 * Mock categories. `products` is intentionally empty — the Home grid renders
 * from `MOCK_PRODUCTS` below; these only feed the category chip row.
 */
export const MOCK_CATEGORIES: Category[] = [
  { id: 'classic', name: 'Classic', slug: 'classic', sortOrder: 1, isActive: true, products: [] },
  { id: 'cheesy', name: 'Cheesy', slug: 'cheesy', sortOrder: 2, isActive: true, products: [] },
  { id: 'spicy', name: 'Spicy', slug: 'spicy', sortOrder: 3, isActive: true, products: [] },
  {
    id: 'sweet-savory',
    name: 'Sweet & Savory',
    slug: 'sweet-savory',
    sortOrder: 4,
    isActive: true,
    products: [],
  },
];

// `basePrice` is in whole PHP units (was `priceCents`/100). The sold-out mock
// product carries `isActive: false`, which the grid maps to `isAvailable`.
export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'fries-classic',
    categoryId: 'classic',
    name: 'Classic Fries',
    slug: 'classic-fries',
    description: 'Golden hand-cut fries with a light dusting of sea salt.',
    imageUrl: null,
    basePrice: 99,
    isActive: true,
    isRewardEligible: false,
  },
  {
    id: 'fries-cheddar',
    categoryId: 'cheesy',
    name: 'Cheddar Loaded Fries',
    slug: 'cheddar-loaded-fries',
    description: 'Fries smothered in melty cheddar sauce and crispy bits.',
    imageUrl: null,
    basePrice: 149,
    isActive: true,
    isRewardEligible: false,
  },
  {
    id: 'corndog-mozzarella',
    categoryId: 'cheesy',
    name: 'Mozzarella Corndog',
    slug: 'mozzarella-corndog',
    description: 'Stretchy mozzarella corndog rolled in a crunchy coat.',
    imageUrl: null,
    basePrice: 129,
    isActive: true,
    isRewardEligible: false,
  },
  {
    id: 'fries-fire',
    categoryId: 'spicy',
    name: 'Fire Spice Fries',
    slug: 'fire-spice-fries',
    description: 'Fries tossed in a smoky chili-garlic seasoning.',
    imageUrl: null,
    basePrice: 139,
    isActive: true,
    isRewardEligible: false,
  },
  {
    id: 'nuggets-spicy',
    categoryId: 'spicy',
    name: 'Spicy Chicken Nuggets',
    slug: 'spicy-chicken-nuggets',
    description: 'Six crispy nuggets with a kick of cayenne heat.',
    imageUrl: null,
    basePrice: 159,
    isActive: true,
    isRewardEligible: false,
  },
  {
    id: 'corndog-honey',
    categoryId: 'sweet-savory',
    name: 'Honey Butter Corndog',
    slug: 'honey-butter-corndog',
    description: 'Sweet-and-salty honey butter glaze over a classic corndog.',
    imageUrl: null,
    basePrice: 129,
    isActive: true,
    isRewardEligible: false,
  },
  {
    id: 'lemonade-yuzu',
    categoryId: 'sweet-savory',
    name: 'Yuzu Lemonade',
    slug: 'yuzu-lemonade',
    description: 'Bright citrus lemonade with a splash of yuzu.',
    imageUrl: null,
    basePrice: 89,
    isActive: true,
    isRewardEligible: false,
  },
  {
    id: 'nuggets-classic',
    categoryId: 'classic',
    name: 'Classic Chicken Nuggets',
    slug: 'classic-chicken-nuggets',
    description: 'Six golden nuggets with your choice of dip.',
    imageUrl: null,
    basePrice: 149,
    isActive: false,
    isRewardEligible: false,
  },
];

export const MOCK_BRANCH: PickupBranch = {
  id: 'branch-bgc',
  name: 'Jojo Potato — BGC',
  address: '7th Ave cor 30th St, Bonifacio Global City, Taguig',
  latitude: 14.5509,
  longitude: 121.0512,
  isOpen: true,
};

export const MOCK_REWARDS: RewardsAccount = {
  userId: 'mock-user',
  points: 1240,
  tier: 'silver',
};
