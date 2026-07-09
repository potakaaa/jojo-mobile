import * as UI from '../../index';

/**
 * AC1 barrel-import smoke check: every one of the 16 named components is
 * exported from the package entrypoint and is a function (a React component).
 */
const EXPECTED_COMPONENTS = [
  'Button',
  'Card',
  'Badge',
  'Input',
  'ProductCard',
  'DealCard',
  'BranchCard',
  'RewardProgressCard',
  'StarProgressBar',
  'OrderStatusBadge',
  'OrderStatusTimeline',
  'CouponCard',
  'CartItem',
  'FlavorSelector',
  'SizeSelector',
  'PickupTimeBadge',
] as const;

test('exports every named component from @jojopotato/ui', () => {
  for (const name of EXPECTED_COMPONENTS) {
    expect(typeof (UI as Record<string, unknown>)[name]).toBe('function');
  }
});
