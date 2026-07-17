import { Ionicons } from '@expo/vector-icons';
import { useEffect, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, FontFamily, Palette, Radii, Shadows, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { isNestedTabRoute } from './floating-tab-bar.helpers';

// Cross-tree signal: lets a screen hide the floating tab bar while a full-screen
// overlay (e.g. the checkout confirm drawer) is open, so the bar doesn't paint over
// it. ponytail: tiny external store, not a context provider — one flag, one consumer.
let tabBarHidden = false;
const tabBarListeners = new Set<() => void>();
const getTabBarHidden = () => tabBarHidden;

function setTabBarHidden(next: boolean) {
  if (tabBarHidden === next) return;
  tabBarHidden = next;
  tabBarListeners.forEach((listener) => listener());
}

function subscribeTabBar(listener: () => void) {
  tabBarListeners.add(listener);
  return () => {
    tabBarListeners.delete(listener);
  };
}

/** Hide the floating tab bar while `active` is true; auto-restores on unmount. */
export function useHideTabBarWhile(active: boolean) {
  useEffect(() => {
    setTabBarHidden(active);
    return () => setTabBarHidden(false);
  }, [active]);
}

/**
 * Minimal, locally-declared shape of React Navigation's `BottomTabBarProps`,
 * covering only the fields this component uses. Declared locally (per plan
 * Risk 6 / checklist item 21) because `@react-navigation/bottom-tabs` — the
 * transitive source of the real type via `expo-router` — does not resolve
 * cleanly through the pnpm workspace at typecheck time, and Phase 6 must not
 * add a new explicit dependency.
 */
interface TabBarRoute {
  key: string;
  name: string;
  /**
   * OPTIONAL nested navigation state of this tab's Stack. React Navigation
   * populates it once the tab's nested navigator has history; `index > 0`
   * means a screen is pushed above the tab root. Consumed via `isNestedTabRoute`
   * (Fix A) to hide the floating bar on nested screens. Undefined at root /
   * before the nested navigator initializes; `index` is itself optional to stay
   * assignable from React Navigation's `PartialState` (both treated as "at root").
   */
  state?: { index?: number };
}

interface TabBarDescriptor {
  options: {
    title?: string;
    tabBarAccessibilityLabel?: string;
  };
}

interface BottomTabBarProps {
  state: {
    index: number;
    routes: TabBarRoute[];
  };
  descriptors: Record<string, TabBarDescriptor>;
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    // Optional 2nd param (`{ screen: 'index' }`) is additive, needed for Fix B's
    // reset-to-root call. The real React Navigation `navigate` already accepts a
    // nested-screen params object; this file-internal type just widens to match.
    navigate: (name: string, params?: { screen: string }) => void;
  };
}

/**
 * Custom floating pill tab bar, shared by iOS and Android. Consumed by both
 * `_layout.ios.tsx` and `_layout.android.tsx` via the stable `expo-router`
 * `Tabs` `tabBar` render prop (forwarded from `@react-navigation/bottom-tabs`).
 * Web keeps the platform-native `Tabs` bar via `_layout.web.tsx`, which does not
 * pick up this file because of Metro's platform-extension resolution.
 *
 * iOS previously used `expo-router/unstable-native-tabs` (system Liquid Glass
 * material on iOS 26+); that was replaced with this bar so iOS matches
 * Android's brand-styled floating pill instead of the system tab-bar look.
 *
 * Lives in `src/components/` (outside `app/`) so Expo Router's file-based
 * router does not auto-discover it as a route — the same reason
 * `src/components/coming-soon.tsx` lives here. A `components/` subfolder under
 * `app/` does NOT exclude files from routing; only a leading-underscore name or
 * living outside `app/` does.
 *
 * Visual spec (INNOVATE-locked): a floating, rounded, brand-styled bar with a
 * jyellow pill chip behind the active tab's icon, ink icon color when active,
 * secondary-text color when inactive, and NO vertical float-up-on-select
 * animation (the pill sits in place; the icon column stays vertically fixed).
 *
 * Animation (added 08-07-26): the active jyellow pill chip springs in (scale
 * 0.6 → 1 + opacity fade) via `react-native-reanimated` instead of snapping,
 * and the icon + label colors cross-fade between active (`Palette.ink`) and
 * inactive (`textSecondary`) with `interpolateColor`. Only scale / opacity /
 * color animate — never position — preserving the "NO vertical shift" rule.
 */

/** Ionicons filled/-outline name pairs, matching `_layout.web.tsx` exactly. */
const ICONS: Record<
  string,
  { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }
> = {
  index: { active: 'home', inactive: 'home-outline' },
  order: { active: 'bag', inactive: 'bag-outline' },
  rewards: { active: 'star', inactive: 'star-outline' },
  branches: { active: 'location', inactive: 'location-outline' },
  account: { active: 'person', inactive: 'person-outline' },
};

/** Ionicons wrapped for animated (interpolated) `color` via Reanimated style. */
const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);

/** Diameter (dp) of the circular icon chip — shared by `BAR_CONTENT_HEIGHT` and `styles.iconChip`. */
const ICON_CHIP_SIZE = 36;

/**
 * On-screen vertical content height of the floating bar (dp), computed from the
 * real styles below so screens never guess a magic number:
 *   iconChip height (ICON_CHIP_SIZE) + tab gap (Spacing.half) + one caption text
 *   line (~1.2 × TypeScale.caption ≈ 15) + bar paddingVertical top+bottom
 *   (Spacing.one × 2).
 * Currently 36 + 2 + 15 + 8 = 61.
 */
const BAR_CONTENT_HEIGHT = ICON_CHIP_SIZE + Spacing.half + 15 + Spacing.one * 2;

/**
 * The floating bar's OWN dead footprint (dp) from the screen's bottom edge —
 * device-independent, so it can be a static export. The bar is absolutely
 * positioned at `bottom: insets.bottom + Spacing.two`, so its footprint is the
 * bar content height PLUS that offset PLUS extra breathing room (Spacing.four)
 * so content isn't flush against the bar. Currently 61 + 8 + 16 = 85.
 *
 * This term is real ONLY where the bar actually renders (tab-root screens). On a
 * pushed/nested screen the bar is hidden, so reserving it is dead space — see
 * `resolveTabBarClearance` in `./floating-tab-bar.helpers`, which nested screens
 * use to reserve the device safe-area inset WITHOUT this footprint.
 */
export const TAB_BAR_FOOTPRINT = BAR_CONTENT_HEIGHT + Spacing.two + Spacing.four;

/**
 * Total bottom clearance (dp) an iOS/Android TAB-ROOT screen's scrollable
 * content must reserve so its last row clears this floating bar: the bar's own
 * footprint PLUS the device safe-area inset.
 *
 * These are two DIFFERENT concerns fused into one number for the tab-root case,
 * where both happen to apply. Do not reuse this on a nested screen to get the
 * safe-area inset — that reserves ~85dp of dead bar height for a bar that isn't
 * rendered there. Nested screens call
 * `resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insetsBottom)` instead, which
 * keeps the inset and drops the footprint.
 *
 * `insets.bottom` is device-dependent, so this must be a function (it cannot be
 * baked into a static export). Screens pass `useSafeAreaInsets().bottom`.
 * iOS/Android only: the web tab bar reserves its own space natively.
 */
export const getFloatingTabBarClearance = (insetsBottom: number): number =>
  TAB_BAR_FOOTPRINT + insetsBottom;

interface TabItemProps {
  isActive: boolean;
  label: string;
  iconActive?: keyof typeof Ionicons.glyphMap;
  iconInactive?: keyof typeof Ionicons.glyphMap;
  activeColor: string;
  labelActiveColor: string;
  inactiveColor: string;
  accessibilityLabel?: string;
  onPress: () => void;
}

/**
 * One tab cell. Extracted into its own component so Reanimated hooks
 * (`useSharedValue` / `useAnimatedStyle`) are called at a stable position per
 * tab rather than inside a `.map()` loop (rules-of-hooks safe).
 */
function TabItem({
  isActive,
  label,
  iconActive,
  iconInactive,
  activeColor,
  labelActiveColor,
  inactiveColor,
  accessibilityLabel,
  onPress,
}: TabItemProps) {
  // 0 = inactive, 1 = active. Springs on activation for a subtle pill "pop".
  const progress = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(isActive ? 1 : 0, {
      damping: 15,
      stiffness: 180,
      mass: 0.6,
    });
  }, [isActive, progress]);

  // Yellow pill background: scale + opacity only (centered → no vertical shift).
  const chipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.6, 1]) }],
  }));

  const iconColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [inactiveColor, activeColor]),
  }));

  const labelColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [inactiveColor, labelActiveColor]),
  }));

  // Glyph swap (outline ↔ filled) is discrete; color cross-fades over it.
  const iconName = isActive ? iconActive : iconInactive;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={isActive ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      android_ripple={{ color: 'rgba(28,23,20,0.08)', borderless: true }}
      style={styles.tab}
    >
      <View style={styles.iconChip}>
        <Animated.View style={[styles.chipBg, chipStyle]} />
        {iconName ? (
          <AnimatedIonicons
            name={iconName}
            size={20}
            color={inactiveColor}
            style={iconColorStyle}
          />
        ) : null}
      </View>
      <Animated.Text style={[styles.label, labelColorStyle]} numberOfLines={1}>
        {label}
      </Animated.Text>
    </Pressable>
  );
}

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  const hidden = useSyncExternalStore(subscribeTabBar, getTabBarHidden);

  // Fix A: hide the whole floating bar when the focused tab is showing a pushed
  // (nested) screen, so the bar paints only on the 5 tab-root screens. Composed
  // (OR) with the external-store `hidden` flag so the checkout overlay case
  // (`useHideTabBarWhile`) still hides the bar even at a tab root.
  const focusedTab = state.routes[state.index];
  const isFocusedTabNested = focusedTab != null && isNestedTabRoute(focusedTab);
  const isHidden = hidden || isFocusedTabNested;

  // Fade the bar out/in when it should hide (overlay toggle or a nested screen)
  // instead of popping. pointerEvents blocks taps while hidden.
  const barOpacity = useSharedValue(1);
  useEffect(() => {
    barOpacity.value = withTiming(isHidden ? 0 : 1, { duration: 200 });
  }, [isHidden, barOpacity]);
  const barFadeStyle = useAnimatedStyle(() => ({ opacity: barOpacity.value }));

  return (
    <Animated.View
      pointerEvents={isHidden ? 'none' : 'auto'}
      accessibilityElementsHidden={isHidden}
      importantForAccessibility={isHidden ? 'no-hide-descendants' : 'auto'}
      style={[
        styles.bar,
        {
          bottom: insets.bottom + Spacing.two,
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
        Shadows.offsetMd,
        barFadeStyle,
      ]}
    >
      {/*
        Filter to the known 5-tab allowlist (`ICONS` keys) before rendering.
        `<Tabs>` auto-appends every undeclared file-system child of `(tabs)/` to
        `state.routes` (e.g. the non-tab `deals/` stack), and this custom tab bar
        ignores `href:null`/`tabBarButton` — so without this filter, `deals`
        would render as an unstyled 6th tab button. Reachability of `deals` is
        via `router.push` only. See deals-screens plan Decision #1 / step 5b.
      */}
      {state.routes.map((route, i) => {
        if (!(route.name in ICONS)) return null;
        const isActive = state.index === i;
        const options = descriptors[route.key]?.options ?? {};
        const label = typeof options.title === 'string' ? options.title : route.name;
        const iconPair = ICONS[route.name];

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (event.defaultPrevented) return;

          if (isActive) {
            // Fix B: re-tapping the already-active tab resets that tab's stack
            // to its root (`index`) screen. React Navigation's navigate-to-
            // existing semantics pop back to `index` when it is already in the
            // nested stack, freeing the user from a cross-tab push (e.g. the
            // Home "Active Order" banner → order/tracking trap).
            navigation.navigate(route.name, { screen: 'index' });
          } else {
            navigation.navigate(route.name);
          }
        };

        return (
          <TabItem
            key={route.key}
            isActive={isActive}
            label={label}
            iconActive={iconPair?.active}
            iconInactive={iconPair?.inactive}
            activeColor={Palette.ink}
            labelActiveColor={colors.text}
            inactiveColor={colors.textSecondary}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
          />
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.full,
    borderWidth: 2,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
  },
  iconChip: {
    width: ICON_CHIP_SIZE,
    height: ICON_CHIP_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.full,
    backgroundColor: 'transparent',
  },
  chipBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Radii.full,
    backgroundColor: Palette.jyellow,
  },
  label: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.caption,
  },
});
