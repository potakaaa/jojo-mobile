import type {
  CartItem,
  Coupon,
  Deal,
  Flavor,
  MenuItem,
  PickupBranch,
  PickupTime,
  RewardsAccount,
  RewardsTierProgress,
  Size,
} from '@jojopotato/types';

/** `MenuItem`-shaped product mock (`ProductCard` renders the cents `MenuItem` shape). */
export const MOCK_PRODUCT: MenuItem = {
  id: 'p1',
  name: 'Classic Fries',
  description: 'Crispy golden fries',
  priceCents: 12000,
  categoryId: 'classic',
  isAvailable: true,
};

/** Alias kept for the merged `CartItem` test, which imports `MOCK_MENU_ITEM`. */
export const MOCK_MENU_ITEM: MenuItem = MOCK_PRODUCT;

export const MOCK_DEAL: Deal = {
  id: 'd1',
  title: 'Combo Deal',
  description: 'Fries + drink',
  discountLabel: '-20%',
};

export const MOCK_BRANCH: PickupBranch = {
  id: 'b1',
  name: 'Jojo Potato SM',
  slug: 'jojo-sm',
  address: '123 Main St',
  latitude: 0,
  longitude: 0,
  phone: '+63 2 8888 0000',
  openingHours: JSON.stringify({ mon: { open: '09:00', close: '21:00' } }),
  isActive: true,
  isAcceptingPickup: true,
  estimatedPrepMinutes: 15,
  priority: 1,
  isOpen: true,
};

export const MOCK_REWARDS: RewardsAccount = {
  userId: 'u1',
  points: 120,
  tier: 'silver',
};

export const MOCK_PROGRESS: RewardsTierProgress = {
  currentPoints: 120,
  pointsToNextTier: 80,
  nextTier: 'gold',
};

export const MOCK_COUPON: Coupon = {
  id: 'c1',
  code: 'JOJO10',
  title: '10% off',
  discountLabel: '-10%',
  isRedeemed: false,
};

export const MOCK_CART_ITEM: CartItem = {
  lineId: 'line-1',
  menuItemId: 'p1',
  quantity: 2,
  productNameSnapshot: 'Classic Fries',
  unitPriceCents: 12000,
  selectedOptions: [],
};

export const MOCK_FLAVOR: Flavor = { id: 'f1', name: 'Cheese' };
export const MOCK_SIZE: Size = { id: 's1', label: 'Large', priceModifierCents: 2000 };

export const MOCK_PICKUP_TIME: PickupTime = {
  id: 't1',
  label: '12:30 PM',
  isoTime: '2026-07-09T12:30:00Z',
  isAvailable: true,
};
