import { Badge, Button, Card, DealCard, Toast } from '@jojopotato/ui';
import {
  buildDirectionsUrl,
  distanceKm,
  formatOpeningHours,
  getIsOpenNow,
} from '@jojopotato/utils';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { BranchDetailResponse, mapApiBranch, mapApiBranchDeal } from '@/features/branches/api';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useToast } from '@/features/shared/hooks/use-toast';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useUserLocation } from '@/hooks/use-user-location';
import { apiFetch } from '@/lib/api-fetch';

/**
 * Branch Details screen. Receives only a `branchId` route param, fetches the
 * combined `{ branch, deals }` payload from the API, and renders branch info,
 * distance (when location granted), opening hours, deals, a directions link,
 * and an Order CTA gated on open + accepting-pickup status.
 */
export default function BranchDetailsScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';

  const { branchId } = useLocalSearchParams<{ branchId: string }>();
  const [data, setData] = useState<BranchDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingBranchId, setLoadingBranchId] = useState(branchId);
  const { coords, status: locationStatus } = useUserLocation();
  const { setSelectedBranch } = useBranch();
  const insets = useSafeAreaInsets();
  const { toast, showToast, hideToast } = useToast();

  // Reset to the loading state when the branch param changes. React's
  // adjust-state-on-prop-change pattern (run in render, not an effect) so a stale
  // branch's data/error never flashes and no cascading-render issue arises.
  if (branchId !== loadingBranchId) {
    setLoadingBranchId(branchId);
    setData(null);
    setError(null);
    setLoading(true);
  }

  useEffect(() => {
    if (!branchId) return;
    // Track the active request: when branchId changes (or the screen unmounts)
    // an in-flight response must be ignored so a stale branch can't overwrite the
    // current one.
    let active = true;
    apiFetch<BranchDetailResponse>(`/api/branches/${branchId}`)
      .then((res) => {
        if (active) setData(res);
      })
      .catch(() => {
        if (active) setError('Failed to load branch details');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branchId]);

  const branch = data ? mapApiBranch(data.branch) : null;
  const deals = data ? data.deals.map(mapApiBranchDeal) : [];
  const isOpen = branch && branch.openingHours ? getIsOpenNow(branch.openingHours) : false;
  const hoursLines = branch && branch.openingHours ? formatOpeningHours(branch.openingHours) : [];
  const distance =
    branch && locationStatus === 'granted' && coords
      ? distanceKm(coords.latitude, coords.longitude, branch.latitude, branch.longitude)
      : null;
  const canOrder = isOpen && branch?.isAcceptingPickup === true;

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (error || !branch) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <Text style={[styles.message, { color: theme.textSecondary }]}>
          {error ?? 'Branch not found'}
        </Text>
        <Button label="Go back" variant="outline" mode={mode} onPress={() => router.back()} />
      </View>
    );
  }

  const onGetDirections = () => {
    const platform: 'ios' | 'android' | 'web' =
      Platform.OS === 'web' ? 'web' : Platform.OS === 'ios' ? 'ios' : 'android';
    const url = buildDirectionsUrl(branch.latitude, branch.longitude, branch.name, platform);
    // openURL rejects when no handler exists for the scheme (e.g. maps app
    // missing, or an unsupported scheme on web) — catch it so it never surfaces
    // as an unhandled rejection, and tell the user via the shared toast.
    Linking.openURL(url).catch(() =>
      showToast('No maps app is available to show directions.', 'error'),
    );
  };

  const onOrder = () => {
    setSelectedBranch(branch);
    router.push('/(tabs)/order');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: getFloatingTabBarClearance(insets.bottom) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.name, { color: theme.text }]}>{branch.name}</Text>

          <Card mode={mode} style={styles.infoCard}>
            <Text style={[styles.body, { color: theme.textSecondary }]}>{branch.address}</Text>
            <Text style={[styles.body, { color: theme.textSecondary }]}>{branch.phone}</Text>

            {distance !== null ? (
              <Text style={[styles.body, { color: theme.textSecondary }]}>
                {distance.toFixed(1)} km away
              </Text>
            ) : null}

            <View style={styles.statusRow}>
              <Badge
                label={isOpen ? 'Open' : 'Closed'}
                variant={isOpen ? 'success' : 'default'}
                mode={mode}
              />
              <Text style={[styles.body, { color: theme.textSecondary }]}>
                ~{branch.estimatedPrepMinutes} min
              </Text>
            </View>

            <Badge
              label={branch.isAcceptingPickup ? 'Accepting Pickup' : 'Not Accepting Pickup'}
              variant={branch.isAcceptingPickup ? 'success' : 'danger'}
              mode={mode}
            />
          </Card>

          <Card mode={mode} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Opening Hours</Text>
            {hoursLines.map((line, i) => (
              <Text key={i} style={[styles.body, { color: theme.textSecondary }]}>
                {line}
              </Text>
            ))}
          </Card>

          <Button
            label="Get Directions"
            variant="outline"
            mode={mode}
            iconName="navigate"
            onPress={onGetDirections}
            style={styles.directions}
          />

          {deals.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Deals</Text>
              <View style={styles.dealsList}>
                {deals.map((deal) => (
                  <DealCard key={deal.id} deal={deal} mode={mode} validUntil={deal.validUntil} />
                ))}
              </View>
            </View>
          ) : null}

          <Button
            label="Order from this branch"
            mode={mode}
            disabled={!canOrder}
            onPress={onOrder}
            style={styles.cta}
          />
        </ScrollView>

        <Toast
          visible={toast.visible}
          message={toast.message}
          severity={toast.severity}
          mode={mode}
          bottomOffset={insets.bottom + Spacing.four}
          onDismiss={hideToast}
        />
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
  scrollContent: {
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  name: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h1,
  },
  body: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.body,
  },
  infoCard: {
    gap: Spacing.two,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  sectionTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  directions: {
    alignSelf: 'flex-start',
    marginTop: Spacing.two,
  },
  dealsList: {
    gap: Spacing.three,
  },
  message: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
    textAlign: 'center',
  },
  cta: {
    marginTop: Spacing.four,
  },
});
