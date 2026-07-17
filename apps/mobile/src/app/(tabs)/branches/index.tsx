import { Ionicons } from '@expo/vector-icons';
import type { PickupBranch } from '@jojopotato/types';
import { BranchListItem, Button, Input, Palette, Radii, Shadows } from '@jojopotato/ui';
import { distanceKm, getIsOpenNow } from '@jojopotato/utils';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { BranchMap, type BranchMapHandle } from '@/features/branches/components/branch-map';
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

  const [query, setQuery] = useState('');

  // Branch list via react-query (matches the rest of the app's data layer). Uses
  // the canonical, UNFILTERED `/branches` endpoint directly — NOT `useBranch()`'s
  // exposed list, which is pre-filtered to open branches and would silently drop
  // closed/pickup-unavailable branches this screen must still show (with a badge).
  const {
    data: branches = [],
    isPending,
    isError: fetchError,
    refetch,
  } = useQuery({ queryKey: ['branches', 'all'], queryFn: getBranches });

  // Native-only imperative handles: the map camera and the bottom sheet. Unused
  // on web (the web branch renders neither the map nor the sheet).
  const mapRef = useRef<BranchMapHandle>(null);
  const sheetRef = useRef<BottomSheet>(null);

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
    router.push({
      pathname: '/(tabs)/branch/[branchId]',
      params: { branchId: id },
    });
  };

  // Locate-me FAB: snap the map back to the user's current position. No-op if
  // location is unknown. Native only (web renders no map).
  const onLocatePress = () => {
    if (coords) mapRef.current?.focusOn(coords, USER_ZOOM);
  };

  // Tap a branch card: focus the map on that branch's pin and drop the sheet to
  // its peek (index 0) so the pin is visible. Native only.
  const onCardPress = (branch: PickupBranch) => {
    mapRef.current?.focusOn({ latitude: branch.latitude, longitude: branch.longitude });
    sheetRef.current?.snapToIndex(0);
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
          ) : fetchError ? (
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
              data={filteredBranches}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
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

      {/* z2: draggable branch list. Opens at half; drags up to cover the map. */}
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={SNAP_POINTS}
        enableDynamicSizing={false}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
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
        ) : fetchError ? (
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
            renderItem={renderItem}
          />
        )}
      </BottomSheet>
    </View>
  );
}

/** Bottom peek by default (index 0): handle + fixed header + first branch card visible; drags up to half, then near-full cover. */
const SNAP_POINTS = ['32%', '50%', '92%'];

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
  sheetHandle: {
    backgroundColor: Palette.ink,
    width: 44,
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
