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
import type { MenuCategory, MenuItem, PickupBranch, RewardsAccount } from '@jojopotato/types';

export const MOCK_CATEGORIES: MenuCategory[] = [
  { id: 'classic', name: 'Classic', sortOrder: 1 },
  { id: 'cheesy', name: 'Cheesy', sortOrder: 2 },
  { id: 'spicy', name: 'Spicy', sortOrder: 3 },
  { id: 'sweet-savory', name: 'Sweet & Savory', sortOrder: 4 },
];

export const MOCK_PRODUCTS: MenuItem[] = [
  {
    id: 'fries-classic',
    name: 'Classic Fries',
    description: 'Golden hand-cut fries with a light dusting of sea salt.',
    priceCents: 9900,
    categoryId: 'classic',
    isAvailable: true,
  },
  {
    id: 'fries-cheddar',
    name: 'Cheddar Loaded Fries',
    description: 'Fries smothered in melty cheddar sauce and crispy bits.',
    priceCents: 14900,
    categoryId: 'cheesy',
    isAvailable: true,
  },
  {
    id: 'corndog-mozzarella',
    name: 'Mozzarella Corndog',
    description: 'Stretchy mozzarella corndog rolled in a crunchy coat.',
    priceCents: 12900,
    categoryId: 'cheesy',
    isAvailable: true,
  },
  {
    id: 'fries-fire',
    name: 'Fire Spice Fries',
    description: 'Fries tossed in a smoky chili-garlic seasoning.',
    priceCents: 13900,
    categoryId: 'spicy',
    isAvailable: true,
  },
  {
    id: 'nuggets-spicy',
    name: 'Spicy Chicken Nuggets',
    description: 'Six crispy nuggets with a kick of cayenne heat.',
    priceCents: 15900,
    categoryId: 'spicy',
    isAvailable: true,
  },
  {
    id: 'corndog-honey',
    name: 'Honey Butter Corndog',
    description: 'Sweet-and-salty honey butter glaze over a classic corndog.',
    priceCents: 12900,
    categoryId: 'sweet-savory',
    isAvailable: true,
  },
  {
    id: 'lemonade-yuzu',
    name: 'Yuzu Lemonade',
    description: 'Bright citrus lemonade with a splash of yuzu.',
    priceCents: 8900,
    categoryId: 'sweet-savory',
    isAvailable: true,
  },
  {
    id: 'nuggets-classic',
    name: 'Classic Chicken Nuggets',
    description: 'Six golden nuggets with your choice of dip.',
    priceCents: 14900,
    categoryId: 'classic',
    isAvailable: false,
  },
];

export const MOCK_BRANCH: PickupBranch = {
  id: 'branch-bgc',
  name: 'Jojo Potato — BGC',
  slug: 'jojo-bgc',
  address: '7th Ave cor 30th St, Bonifacio Global City, Taguig',
  latitude: 14.5509,
  longitude: 121.0512,
  phone: '+63 2 8888 0001',
  openingHours: JSON.stringify({
    mon: { open: '09:00', close: '21:00' },
    tue: { open: '09:00', close: '21:00' },
    wed: { open: '09:00', close: '21:00' },
    thu: { open: '09:00', close: '21:00' },
    fri: { open: '09:00', close: '22:00' },
    sat: { open: '09:00', close: '22:00' },
    sun: { open: '10:00', close: '20:00' },
  }),
  isActive: true,
  isAcceptingPickup: true,
  estimatedPrepMinutes: 15,
  priority: 1,
};

export const MOCK_REWARDS: RewardsAccount = {
  userId: 'mock-user',
  points: 1240,
  tier: 'silver',
};
