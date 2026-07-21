/**
 * Global jest setup for `apps/mobile` RN component tests (registered via
 * `jest.config.js` `setupFiles`). Installs the module mocks every screen test
 * needs so individual test files never redeclare them.
 *
 * 1. `react-native-reanimated` — this repo's pin (4.5.0 + react-native-worklets
 *    0.10.0) throws `Cannot read properties of undefined (reading 'loadUnpackers')`
 *    at import time under jest, even through the library's own `/mock` export
 *    (which still pulls in the broken worklets initializer chain in v4). A
 *    hand-rolled no-op stub of the APIs actually used (`floating-tab-bar.tsx`
 *    imports reanimated at module scope, and every tab-root screen transitively
 *    imports `getFloatingTabBarClearance` from it) is required and proven working.
 * 2. `expo-router` — a lightweight stub so `router.push`/`useRouter`/
 *    `useIsFocused` resolve without a real navigation container in jsdom.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import { jest } from '@jest/globals';

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const passthrough = (value: unknown) => value;

  // Layout-animation builders (FadeIn/FadeInDown/…) are used as chainable
  // configs on Animated.View `entering`/`exiting` props. The real objects expose
  // fluent modifiers (`.duration()`, `.delay()`, `.springify()`); the mock only
  // needs each to exist and return something chainable, since jsdom never runs
  // the animation. A Proxy returns a self-referential chainable for ANY modifier,
  // so a new modifier at a call site never needs a mock update.
  const makeAnimationBuilder = (): unknown =>
    new Proxy(
      {},
      {
        get: () => () => makeAnimationBuilder(),
      },
    );

  return {
    __esModule: true,
    default: {
      View: RN.View,
      Text: RN.Text,
      ScrollView: RN.ScrollView,
      Image: RN.Image,
      createAnimatedComponent: (Component: unknown) => Component,
    },
    View: RN.View,
    Text: RN.Text,
    ScrollView: RN.ScrollView,
    Image: RN.Image,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: passthrough,
    withSpring: passthrough,
    interpolate: passthrough,
    interpolateColor: passthrough,
    runOnJS: (fn: unknown) => fn,
    // Read by @jojopotato/ui's SwipeableRow (notif-delete-pagination) to skip the
    // spring bounce for reduced-motion users.
    useReducedMotion: () => false,
    // Common entering/exiting animation builders as chainable no-op configs.
    FadeIn: makeAnimationBuilder(),
    FadeOut: makeAnimationBuilder(),
    FadeInDown: makeAnimationBuilder(),
    FadeInUp: makeAnimationBuilder(),
    FadeOutDown: makeAnimationBuilder(),
    FadeOutUp: makeAnimationBuilder(),
    SlideInDown: makeAnimationBuilder(),
    SlideOutDown: makeAnimationBuilder(),
    SlideInUp: makeAnimationBuilder(),
    SlideOutUp: makeAnimationBuilder(),
  };
});

// The better-auth client (`@better-auth/expo` → `@better-auth/core`) ships
// untranspiled ESM that jest's transform whitelist doesn't cover, and pulling the
// real auth stack into a component test is pointless. `api-client.ts` only needs
// `authClient.getCookie()`, so stub the whole module — this unblocks every test
// that transitively imports `@/lib/api-client` (both Rewards and Coupons screens).
jest.mock('@/features/auth/lib/auth-client', () => ({
  authClient: {
    getCookie: () => '',
    useSession: () => ({ data: null, isPending: false }),
    $fetch: jest.fn(),
  },
}));

// `react-native-gesture-handler` — a no-op passthrough so @jojopotato/ui's
// SwipeableRow renders under jsdom (its fluent `Gesture.Pan()` builder + the
// `GestureDetector` wrapper never run a real gesture here). Mirrors the mock in
// `packages/ui/src/test-utils/jest-setup.ts`.
jest.mock('react-native-gesture-handler', () => {
  const RN = require('react-native');
  const chainable: any = new Proxy(() => chainable, { get: () => () => chainable });
  const Gesture = new Proxy({}, { get: () => () => chainable });
  const Passthrough = ({ children }: { children?: unknown }) => children ?? null;
  return {
    __esModule: true,
    Gesture,
    GestureDetector: Passthrough,
    GestureHandlerRootView: RN.View,
  };
});

jest.mock('expo-router', () => {
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    dismiss: jest.fn(),
  };
  const Passthrough = ({ children }: { children?: unknown }) => children ?? null;
  const StackLike = Object.assign(() => null, { Screen: () => null });
  return {
    __esModule: true,
    router,
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/',
    // Every top-level screen moved out of a tab's stack by NAV-005 calls
    // `useHideTabBarWhile(useIsFocused())` to keep the floating tab bar hidden
    // (a top-level route at its own stack root makes `isNestedTabRoute()` false,
    // so the bar would otherwise paint on it). There is no real navigation
    // container in jsdom, so `useIsFocused` is stubbed `true`: a screen being
    // rendered by a test IS the focused screen, which is also the branch that
    // exercises the hide path.
    useIsFocused: () => true,
    Link: Passthrough,
    Stack: StackLike,
    Tabs: StackLike,
    Redirect: () => null,
  };
});
