import type { PickupBranch } from '@jojopotato/types';
import { BranchListItem, Input, Palette, Radii, Shadows } from '@jojopotato/ui';
import { distanceKm, getIsOpenNow } from '@jojopotato/utils';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { ApiBranch, mapApiBranch } from '@/features/branches/api';
import { BranchMap } from '@/features/branches/components/branch-map';
import { useSelectedBranch } from '@/features/branches/hooks/use-selected-branch';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useUserLocation } from '@/hooks/use-user-location';
import { apiFetch } from '@/lib/api-fetch';

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
  const { setSelectedBranch } = useSelectedBranch();

  const [branches, setBranches] = useState<PickupBranch[]>([]);
  const [query, setQuery] = useState('');
  const [isFetching, setIsFetching] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await apiFetch<{ branches: ApiBranch[] }>('/api/branches');
        if (!mounted) return;
        setBranches(data.branches.map(mapApiBranch));
        setFetchError(false);
      } catch {
        if (!mounted) return;
        setFetchError(true);
      } finally {
        if (mounted) setIsFetching(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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
    return list.sort((a, b) => a.priority - b.priority);
  }, [branches, showDistance, coords]);

  const filteredBranches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedBranches;
    return sortedBranches.filter((b) => b.name.toLowerCase().includes(q));
  }, [sortedBranches, query]);

  const isLoading = isFetching || locationStatus === 'loading';

  const onOrderPress = (id: string) => {
    setSelectedBranch(id);
    router.push({
      pathname: '/(tabs)/branches/[branchId]',
      params: { branchId: id },
    });
  };

  const renderItem = ({ item }: { item: PickupBranch }) => {
    const isOpen = getIsOpenNow(item.openingHours);
    const isEnabled = isOpen && item.isAcceptingPickup;
    return (
      <BranchListItem
        branch={item}
        isOpen={isOpen}
        showDistance={showDistance}
        isEnabled={isEnabled}
        mode={mode}
        onOrderPress={() => onOrderPress(item.id)}
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
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : fetchError ? (
            <View style={styles.centered}>
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                Could not load branches — please try again
              </Text>
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
        branches={filteredBranches}
        coords={coords}
        onBranchPress={onOrderPress}
        mode={mode}
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

      {/* z2: draggable branch list. Opens at half; drags up to cover the map. */}
      <BottomSheet
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
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : fetchError ? (
          <View style={styles.sheetCentered}>
            <Text style={[styles.message, { color: theme.textSecondary }]}>
              Could not load branches — please try again
            </Text>
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
