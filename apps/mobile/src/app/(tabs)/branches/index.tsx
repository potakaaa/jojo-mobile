import type { PickupBranch } from '@jojopotato/types';
import { BranchListItem } from '@jojopotato/ui';
import { distanceKm, getIsOpenNow } from '@jojopotato/utils';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, Radii, Spacing, TypeScale } from '@/constants/theme';
import { ApiBranch, mapApiBranch } from '@/features/branches/api';
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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <TextInput
          style={[
            styles.search,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text },
          ]}
          placeholder="Search branches..."
          placeholderTextColor={theme.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
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
            contentContainerStyle={[
              styles.list,
              Platform.OS !== 'web' && {
                paddingBottom: getFloatingTabBarClearance(insets.bottom),
              },
            ]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isOpen = getIsOpenNow(item.openingHours);
              const isEnabled = isOpen && item.isAcceptingPickup;
              return (
                <BranchListItem
                  branch={item}
                  isOpen={isOpen}
                  showDistance={showDistance}
                  isEnabled={isEnabled}
                  mode={mode}
                  onOrderPress={() => {
                    setSelectedBranch(item.id);
                    router.push({
                      pathname: '/(tabs)/branches/[branchId]',
                      params: { branchId: item.id },
                    });
                  }}
                />
              );
            }}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

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
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 2,
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.body,
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
});
