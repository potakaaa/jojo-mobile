/**
 * Pure route-classification helpers for the floating tab bar.
 *
 * This module MUST NOT import `react-native`, `react-native-reanimated`,
 * `@expo/vector-icons`, or any React Native runtime. It is imported by a
 * vitest node-env unit test (`__tests__/floating-tab-bar.helpers.test.ts`),
 * which crashes if `react-native-reanimated` is transitively pulled in — so
 * the classifier is kept out of `floating-tab-bar.tsx` (which imports RN +
 * reanimated at top level) and lives here where it stays mechanically testable.
 */

/**
 * Minimal shape of a bottom-tab route's OPTIONAL nested navigation state.
 * React Navigation populates `route.state` (a nested `NavigationState`) on a
 * tab route once that tab's nested navigator has navigation history; `index`
 * is the focused route index within that nested stack. `state` is `undefined`
 * until the nested navigator initializes; `index` is itself optional because a
 * React Navigation `PartialState` (rehydrated / not-yet-committed nav state) can
 * carry an `undefined` index. Both cases are treated as "at root" by
 * `isNestedTabRoute`.
 */
export interface NestedRouteLike {
  state?: { index?: number };
}

/**
 * True when the given focused-tab route is showing a pushed (nested) screen
 * rather than its stack root. Root, not-yet-initialized (`state` undefined), or
 * a partial state with no committed `index` → `false` (safe default: the
 * floating bar shows at the tab root).
 */
export function isNestedTabRoute(route: NestedRouteLike): boolean {
  return route.state != null && route.state.index != null && route.state.index > 0;
}

/**
 * Bottom clearance (dp) a screen must reserve, with the two terms it is made of
 * kept SEPARATE — this split is the whole point of the function:
 *
 * - `footprint` — the floating tab bar's own on-screen dead height. Only real
 *   when the bar is actually rendered, i.e. on a tab ROOT screen. On a pushed
 *   (nested) screen the bar is hidden, so reserving this is dead space.
 * - `insetsBottom` — the DEVICE safe-area inset (home indicator / gesture bar).
 *   Always real, on every screen, bar or no bar. Never conditional.
 *
 * The historical bug this fixes: `getFloatingTabBarClearance` returns both terms
 * fused into one number, so a nested screen could only drop the dead bar height
 * by also dropping its device inset — pushing CTAs flush against the home
 * indicator. Callers now choose the branch explicitly.
 */
export function resolveTabBarClearance(
  isNested: boolean,
  footprint: number,
  insetsBottom: number,
): number {
  return isNested ? insetsBottom : footprint + insetsBottom;
}
