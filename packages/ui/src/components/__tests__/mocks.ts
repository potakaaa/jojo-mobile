import type {
  CartItem,
  Coupon,
  Deal,
  Flavor,
  PickupBranch,
  PickupTime,
  Product,
  RewardsAccount,
  RewardsTierProgress,
  Size,
} from '@jojopotato/types';

export const MOCK_PRODUCT: Product = {
  id: 'p1',
  categoryId: 'classic',
  name: 'Classic Fries',
  slug: 'classic-fries',
  description: 'Crispy golden fries',
  imageUrl: null,
  basePrice: 120,
  isActive: true,
  isRewardEligible: false,
};

export const MOCK_DEAL: Deal = {
  id: 'd1',
  title: 'Combo Deal',
  description: 'Fries + drink',
  discountLabel: '-20%',
};

export const MOCK_BRANCH: PickupBranch = {
  id: 'b1',
  name: 'Jojo Potato SM',
  address: '123 Main St',
  latitude: 0,
  longitude: 0,
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
  id: 'line-1',
  productId: 'p1',
  name: 'Classic Fries',
  imageUrl: null,
  basePrice: 120,
  unitPrice: 140,
  quantity: 2,
  selectedOptions: [{ optionId: 's1', optionType: 'size', name: 'Large', priceDelta: 20 }],
};

export const MOCK_FLAVOR: Flavor = { id: 'f1', name: 'Cheese' };
export const MOCK_SIZE: Size = { id: 's1', label: 'Large', priceModifierCents: 2000 };

export const MOCK_PICKUP_TIME: PickupTime = {
  id: 't1',
  label: '12:30 PM',
  isoTime: '2026-07-09T12:30:00Z',
  isAvailable: true,
};
