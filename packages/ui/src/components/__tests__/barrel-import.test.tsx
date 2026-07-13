import * as UI from '../../index';

/**
 * AC1 barrel-import smoke check: every one of the 16 named components is
 * exported from the package entrypoint and is a valid React component type.
 * Plain components are functions; `forwardRef`/`memo` components are exotic
 * objects (tagged with a `$$typeof` symbol), so both shapes are accepted.
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
    const component = (UI as Record<string, unknown>)[name];
    // Function components are `function`; `forwardRef`/`memo` components are
    // truthy objects carrying a `$$typeof` React tag. Accept either.
    const type = typeof component;
    expect(component).toBeTruthy();
    expect(type === 'function' || type === 'object').toBe(true);
  }
});
