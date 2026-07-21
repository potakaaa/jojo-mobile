/**
 * Global jest setup for `packages/ui` component tests (registered via
 * `jest.config.js` `setupFiles`). Installs the `react-native-reanimated` +
 * `react-native-gesture-handler` mocks that `SwipeableRow` (the first
 * gesture/animation-driven component in this package) needs to render under jest.
 *
 * The reanimated mock is ported from `apps/mobile/src/test-utils/jest-setup.ts`
 * (this repo's pin — reanimated 4.5.0 + react-native-worklets 0.10.0 — throws
 * `loadUnpackers` undefined at import time under jest, even via the library's own
 * `/mock` export). Dropped: the apps/mobile-only `auth-client`/`expo-router`
 * mocks (this package imports neither). Added: `useReducedMotion` (SwipeableRow
 * reads it) which the apps/mobile mock lacks, plus a `react-native-gesture-handler`
 * no-op passthrough (`GestureDetector` renders children; `Gesture.*()` returns a
 * chainable stub so the fluent gesture builder never throws in jsdom).
 */

/* eslint-disable @typescript-eslint/no-require-imports */

// `jest` is a global here (provided by @types/jest), matching how the existing
// packages/ui component tests reference it — no `@jest/globals` import (that
// module isn't resolvable in this package's tsconfig).

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const passthrough = (value: unknown) => value;

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
    // SwipeableRow reads this to skip the spring bounce; the apps/mobile mock lacks it.
    useReducedMotion: () => false,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const RN = require('react-native');
  // Captures each constructed `Gesture.Pan()` builder's onBegin/onUpdate/onEnd
  // callbacks so a test can drive a synthetic swipe release (the mock never runs
  // a real gesture in jsdom). `swipeable-row.test.tsx` reads `__panHandlers` to
  // invoke onEnd with a controlled translation/velocity and assert onFullSwipe.
  const panHandlers: Array<Record<string, (...args: unknown[]) => unknown>> = [];
  const makePan = () => {
    const handlers: Record<string, (...args: unknown[]) => unknown> = {};
    const builder: any = {
      activeOffsetX: () => builder,
      runOnJS: () => builder,
      onBegin: (fn: (...args: unknown[]) => unknown) => {
        handlers.onBegin = fn;
        return builder;
      },
      onUpdate: (fn: (...args: unknown[]) => unknown) => {
        handlers.onUpdate = fn;
        return builder;
      },
      onEnd: (fn: (...args: unknown[]) => unknown) => {
        handlers.onEnd = fn;
        return builder;
      },
    };
    panHandlers.push(handlers);
    return builder;
  };
  // A self-referential chainable for any non-Pan gesture, so any fluent modifier
  // returns the same stub. Non-Pan callbacks are never invoked in jsdom.
  const chainable: any = new Proxy(() => chainable, { get: () => () => chainable });
  const Gesture = new Proxy(
    {},
    { get: (_t, prop) => (prop === 'Pan' ? makePan : () => chainable) },
  );
  const Passthrough = ({ children }: { children?: unknown }) => children ?? null;
  return {
    __esModule: true,
    Gesture,
    GestureDetector: Passthrough,
    GestureHandlerRootView: RN.View,
    __panHandlers: panHandlers,
  };
});
