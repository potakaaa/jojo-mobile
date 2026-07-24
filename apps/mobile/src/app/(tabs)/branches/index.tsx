import { Ionicons } from '@expo/vector-icons';
import type { PickupBranch } from '@jojopotato/types';
import { BranchListItem, Button, Input, Palette, Radii, Shadows } from '@jojopotato/ui';
import { distanceKm, getIsOpenNow } from '@jojopotato/utils';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance, useRegisterScrollToTop } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, MinTouchTarget, Spacing, TypeScale } from '@/constants/theme';
import { BranchMap, type BranchMapHandle } from '@/features/branches/components/branch-map';
import { useNavigateToBranch } from '@/features/branches/lib/navigate-to-branch';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useUserLocation } from '@/hooks/use-user-location';
import { getBranches } from '@/lib/api-client';

/**
 * Branch Locator (Branches tab root). Fetches active branches, shows open/closed
 * status, sorts by distance (when location granted) or priority (otherwise),
 * filters by name search, and lets the user select a branch and navigate to its
 * detail screen.
 *
 * Native: a full-bleed map base with the branch list in a draggable
 * `@gorhom/bottom-sheet` over it and a floating search pill above the sheet.
 * Web: list-only (expo-maps + the sheet have no web target) — preserved as-is.
 */
export default function BranchLocatorScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();
  const { coords, status: locationStatus } = useUserLocation();
  const navigateToBranch = useNavigateToBranch();

  const [query, setQuery] = useState('');

  // Current sheet snap index, mirrored into React state via the sheet's
  // `onChange`. Needed because `BottomSheet`'s imperative handle exposes no
  // getter — the tap-to-collapse handle below has to know where it is starting
  // from in order to step DOWN one snap point.
  const [snapIndex, setSnapIndex] = useState(INITIAL_SNAP_INDEX);

  // Branch list via react-query (matches the rest of the app's data layer). Uses
  // the canonical, UNFILTERED `/branches` endpoint directly — NOT `useBranch()`'s
  // exposed list, which is pre-filtered to open branches and would silently drop
  // closed/pickup-unavailable branches this screen must still show (with a badge).
  const {
    data: branches = [],
    isPending,
    isError: fetchError,
    isRefetching,
    refetch,
  } = useQuery({ queryKey: ['branches', 'all'], queryFn: getBranches });

  // Native-only imperative handles: the map camera and the bottom sheet. Unused
  // on web (the web branch renders neither the map nor the sheet).
  const mapRef = useRef<BranchMapHandle>(null);
  const sheetRef = useRef<BottomSheet>(null);

  /*
    A5 stage 2 — "scroll to top" for the Branches tab.

    This tab has no page-level scroll position: the visible top IS the map, and
    the sheet's own position is the analogous "start of the tab" state. So
    re-tapping the active Branches icon at root drops the sheet back to its peek
    rather than scrolling the `BottomSheetFlatList`. Already at the peek, this is
    a no-op — same as a second tap on an already-topped list elsewhere.
  */
  useRegisterScrollToTop('branches', () => sheetRef.current?.snapToIndex(PEEK_SNAP_INDEX));

  // Retry from the error state: re-run the branches query.
  const onRetry = () => {
    void refetch();
  };

  const showDistance = locationStatus === 'granted' && coords !== null;

  // Sort: distance-ascending when location granted, else priority-ascending.
  const sortedBranches = useMemo(() => {
    const list = branches.map((b) => {
      if (showDistance && coords) {
        return {
          ...b,
          distanceKm: distanceKm(coords.latitude, coords.longitude, b.latitude, b.longitude),
        };
      }
      return b;
    });
    if (showDistance) {
      return list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    return list.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  }, [branches, showDistance, coords]);

  const filteredBranches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedBranches;
    return sortedBranches.filter((b) => b.name.toLowerCase().includes(q));
  }, [sortedBranches, query]);

  // The single closest branch: only meaningful when distance is known (location
  // granted). Picks the min distanceKm over the currently-visible list; null
  // when location is denied, the list is empty, or no branch has a distance.
  const nearestBranchId = useMemo(() => {
    if (!showDistance) return null;
    let nearest: PickupBranch | null = null;
    for (const b of filteredBranches) {
      if (typeof b.distanceKm !== 'number') continue;
      if (nearest === null || b.distanceKm < (nearest.distanceKm ?? Infinity)) {
        nearest = b;
      }
    }
    return nearest?.id ?? null;
  }, [showDistance, filteredBranches]);

  const isLoading = isPending || locationStatus === 'loading';

  const onOrderPress = (id: string) => {
    navigateToBranch(id);
  };

  // Locate-me FAB: snap the map back to the user's current position. No-op if
  // location is unknown. Native only (web renders no map).
  const onLocatePress = () => {
    if (coords) mapRef.current?.focusOn(coords, USER_ZOOM);
  };

  /*
    Custom sheet handle — the SAME visual bar gorhom draws by default, but
    wrapped in a `Pressable` so the sheet can also be collapsed by TAP.

    Why this exists: `@gorhom/bottom-sheet@5.2.14` deliberately refuses to move
    the sheet from a CONTENT drag while the scrollable is refreshable and the
    sheet sits at its top snap — `useGestureEventsHandlersDefault.tsx` early-
    `return`s on `source === CONTENT && refreshable && position === highestSnapPoint`,
    in BOTH `handleOnChange` and `handleOnEnd`. That is what made the expanded
    sheet feel un-collapsible. The refresh wiring is gone (see
    `BottomSheetFlatList` below), but a tap target is still the robust fix: it
    cannot be lost to gesture arbitration between the list, the refresh control,
    and the sheet, on any platform.

    Drag is UNAFFECTED and still primary — gorhom renders `handleComponent`
    INSIDE its handle `GestureDetector`, and a pan only activates on movement,
    so a stationary tap reaches the `Pressable` while a real drag still pans.

    Behaviour: steps DOWN exactly one snap point, rather than jumping straight to
    the floor. Stepping mirrors what dragging does, keeps the useful mid ('50%')
    state reachable on the way down, and never makes one tap swallow the whole
    sheet. At the floor there is nothing left to collapse, so the control reports
    itself disabled instead of silently doing nothing.
  */
  const canCollapseSheet = snapIndex > PEEK_SNAP_INDEX;
  const renderSheetHandle = useCallback(
    () => (
      <Pressable
        testID="branches-sheet-handle"
        accessibilityRole="button"
        accessibilityLabel="Collapse branch list"
        accessibilityHint="Lowers the branch list to show more of the map"
        accessibilityState={{ disabled: !canCollapseSheet }}
        disabled={!canCollapseSheet}
        onPress={() => sheetRef.current?.snapToIndex(Math.max(PEEK_SNAP_INDEX, snapIndex - 1))}
        style={styles.sheetHandleArea}
      >
        <View style={styles.sheetHandle} />
      </Pressable>
    ),
    [canCollapseSheet, snapIndex],
  );

  // Tap a branch card: focus the map on that branch's pin and drop the sheet to
  // its peek so the pin is visible. Native only.
  const onCardPress = (branch: PickupBranch) => {
    mapRef.current?.focusOn({ latitude: branch.latitude, longitude: branch.longitude });
    sheetRef.current?.snapToIndex(PEEK_SNAP_INDEX);
  };

  const renderItem = ({ item }: { item: PickupBranch }) => {
    const isOpen = item.openingHours ? getIsOpenNow(item.openingHours) : false;
    const isEnabled = isOpen && item.isAcceptingPickup;
    return (
      <BranchListItem
        branch={item}
        isOpen={isOpen}
        showDistance={showDistance}
        isEnabled={isEnabled}
        isNearest={item.id === nearestBranchId}
        mode={mode}
        onOrderPress={() => onOrderPress(item.id)}
        onPress={Platform.OS === 'web' ? undefined : () => onCardPress(item)}
      />
    );
  };

  // --- Web: list-only (no map, no sheet) — preserved byte-for-byte. ---
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <Input
            style={styles.search}
            placeholder="Search branches..."
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            mode={mode}
          />

          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator testID="branches-loading" color={theme.accent} />
            </View>
          ) : fetchError && branches.length === 0 ? (
            <View style={styles.centered}>
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                Could not load branches — please try again
              </Text>
              <Button label="Retry" variant="outline" mode={mode} onPress={onRetry} />
            </View>
          ) : filteredBranches.length === 0 ? (
            <View style={styles.centered}>
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                No branches match your search
              </Text>
            </View>
          ) : (
            <FlatList
              testID="branches-list"
              data={filteredBranches}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  testID="branches-refresh"
                  refreshing={isRefetching}
                  onRefresh={() => void refetch()}
                  tintColor={theme.text}
                  colors={[theme.text]}
                />
              }
              renderItem={renderItem}
            />
          )}
        </SafeAreaView>
      </View>
    );
  }

  // --- Native: full-bleed map base + floating search pill + bottom sheet. ---
  return (
    <View style={styles.container}>
      {/* z0: map base */}
      <BranchMap
        ref={mapRef}
        branches={filteredBranches}
        coords={coords}
        isLocationEnabled={locationStatus === 'granted'}
        contentBottomInset={getFloatingTabBarClearance(insets.bottom)}
        onBranchPress={onOrderPress}
      />

      {/* z1 (search pill) sits above the map via absolute positioning; the sheet
          renders last so it stacks on top when expanded. */}
      <View
        pointerEvents="box-none"
        style={[styles.searchPillWrap, { top: insets.top + Spacing.two }]}
      >
        <Input
          style={styles.searchPillInput}
          placeholder="Search branches..."
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          mode={mode}
        />
      </View>

      {/* z1: locate-me FAB, upper-right of the always-visible map band, clear of
          the search pill (top) and the sheet at its 32% peek (bottom). Only
          rendered when location is granted (otherwise there's nowhere to snap). */}
      {showDistance ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Center map on my location"
          onPress={onLocatePress}
          style={({ pressed }) => [
            styles.locateFab,
            { top: insets.top + Spacing.two + LOCATE_FAB_BELOW_SEARCH },
            pressed && styles.locateFabPressed,
          ]}
        >
          <Ionicons name="locate" size={22} color={Palette.ink} />
        </Pressable>
      ) : null}

      {/* z2: draggable branch list. Opens at the 32% floor; drags (or taps, via
          the handle) down to that floor and up to cover the map. */}
      <BottomSheet
        ref={sheetRef}
        index={INITIAL_SNAP_INDEX}
        snapPoints={SNAP_POINTS}
        enableDynamicSizing={false}
        backgroundStyle={styles.sheetBackground}
        handleComponent={renderSheetHandle}
        onChange={(index) => setSnapIndex(index)}
        style={Shadows.offsetMd}
      >
        {/* Fixed header: stays put while the list below drags/scrolls. Sibling
            View above BottomSheetFlatList, both direct children of BottomSheet. */}
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Pickup Branches</Text>
          <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>
            {isLoading
              ? '—'
              : `${filteredBranches.length} ${
                  filteredBranches.length === 1 ? 'branch' : 'branches'
                }${showDistance ? ' · Nearest first' : ' · By location'}`}
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.sheetCentered}>
            <ActivityIndicator testID="branches-loading" color={theme.accent} />
          </View>
        ) : fetchError && branches.length === 0 ? (
          <View style={styles.sheetCentered}>
            <Text style={[styles.message, { color: theme.textSecondary }]}>
              Could not load branches — please try again
            </Text>
            <Button label="Retry" variant="outline" mode={mode} onPress={onRetry} />
          </View>
        ) : filteredBranches.length === 0 ? (
          <View style={styles.sheetCentered}>
            <Text style={[styles.message, { color: theme.textSecondary }]}>
              No branches match your search
            </Text>
          </View>
        ) : (
          <BottomSheetFlatList
            data={filteredBranches}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.sheetList,
              { paddingBottom: getFloatingTabBarClearance(insets.bottom) },
            ]}
            showsVerticalScrollIndicator={false}
            /*
              NO `refreshing`/`onRefresh` here — deliberate, do not re-add.

              gorhom sets `refreshable = onRefresh !== undefined`
              (`createBottomSheetScrollableComponent.tsx`), and its default gesture
              worklet then early-`return`s out of BOTH `handleOnChange` and
              `handleOnEnd` whenever
              `source === CONTENT && refreshable && position === highestSnapPoint`
              (`useGestureEventsHandlersDefault.tsx`). Net effect: wiring
              pull-to-refresh makes the EXPANDED sheet impossible to collapse by
              dragging its list — only the handle keeps working. The two cannot
              coexist at the top snap; being unable to close the sheet is the far
              worse defect, so refresh loses.

              Cost: no pull-to-refresh on the native sheet. Recovery paths remain
              — the error state's Retry button, and leaving/re-entering the tab,
              which refetches the `['branches','all']` query. The WEB `FlatList`
              above is a different code path and KEEPS its `RefreshControl`.
            */
            renderItem={renderItem}
          />
        )}
      </BottomSheet>
    </View>
  );
}

/*
  Snap points, smallest first.

  `'32%'` is the FLOOR, and that is a device-verified decision — do not lower it.
  A `'12%'` peek was added below it and then REVERTED: on a real device 12% put
  the sheet's fixed `sheetHeader` ("Pickup Branches" + the branch-count line)
  BEHIND the floating tab bar, clipping the title into unreadability. `'32%'` is
  the smallest snap that keeps the drag handle, the title, AND the subtitle all
  fully clear of the tab bar. Anything smaller must be re-measured against
  `getFloatingTabBarClearance(insets.bottom)` on hardware before it ships.

  The sheet is NEVER dismissable: `enablePanDownToClose` is deliberately absent
  (see the `<BottomSheet>` call site), so dragging down bottoms out at `'32%'`
  instead of removing the list. Dismissing would strand the customer on a bare
  map with no way back to the branch list.
*/
const SNAP_POINTS = ['32%', '50%', '92%'];

/**
 * Opening snap point: `'32%'` — handle + fixed header + first branch card
 * visible. This is index `0` because `'32%'` is now the first entry; the
 * on-screen opening position is unchanged from when a smaller peek sat below it.
 */
const INITIAL_SNAP_INDEX = 0;

/** Lowest snap point — the peek. Used by "reset this tab" and by card taps. */
const PEEK_SNAP_INDEX = 0;

/** Zoom used when the locate-me FAB re-centres on the user (street-ish, wider
 * than a single-pin focus so nearby branches stay in frame). */
const USER_ZOOM = 15;

/** Vertical gap from the top of the search pill down to the locate-me FAB, so
 * the FAB sits clearly below the pill in the map band. */
const LOCATE_FAB_BELOW_SEARCH = 64;

/** FAB diameter (dp). borderRadius = size/2 makes it a circle (RN has no % radius). */
const LOCATE_FAB_SIZE = 48;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
  },
  search: {
    marginTop: Spacing.three,
    marginBottom: Spacing.three,
  },
  list: {
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  message: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
    textAlign: 'center',
  },
  // Native floating search pill (comic/flat brand style) over the map.
  searchPillWrap: {
    position: 'absolute',
    left: Spacing.four,
    right: Spacing.four,
  },
  searchPillInput: {
    borderRadius: Radii['2xl'],
    ...Shadows.offsetMd,
  },
  // Locate-me FAB: on-brand cream circle with 2px ink outline + comic hard
  // shadow, pinned to the right edge of the map band under the search pill.
  locateFab: {
    position: 'absolute',
    right: Spacing.four,
    width: LOCATE_FAB_SIZE,
    height: LOCATE_FAB_SIZE,
    borderRadius: LOCATE_FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.cream,
    borderWidth: 2,
    borderColor: Palette.ink,
    ...Shadows.offsetMd,
  },
  locateFabPressed: {
    // Nudge into the shadow on press for the flat "comic" pressed feel.
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  // Bottom-sheet visuals (cream bg, ink handle, comic radius/shadow).
  sheetBackground: {
    backgroundColor: Palette.cream,
    borderTopLeftRadius: Radii['2xl'],
    borderTopRightRadius: Radii['2xl'],
    borderWidth: 2,
    borderColor: Palette.ink,
  },
  // Tap target around the drag indicator. `MinTouchTarget` (48dp) clears the
  // 44dp floor; the indicator itself stays visually small and centred inside it.
  sheetHandleArea: {
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHandle: {
    backgroundColor: Palette.ink,
    width: 44,
    // Explicit now that this screen renders the indicator itself rather than
    // handing the style to gorhom's default handle (which supplied both).
    height: 4,
    borderRadius: 2, // = height / 2 → pill
  },
  // Fixed sheet header (title + live count/sort line) above the draggable list.
  sheetHeader: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Palette.neutral100,
  },
  sheetTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
    color: Palette.ink,
  },
  sheetSubtitle: {
    marginTop: Spacing.half,
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
  },
  sheetList: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  sheetCentered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
});
