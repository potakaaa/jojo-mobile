import { Badge, Button, Card, DealCard } from '@jojopotato/ui';
import { buildDirectionsUrl, distanceKm, formatOpeningHours, getIsOpenNow } from '@jojopotato/utils';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import {
  BranchDetailResponse,
  mapApiBranch,
  mapApiBranchDeal,
} from '@/features/branches/api';
import { useSelectedBranch } from '@/features/branches/hooks/use-selected-branch';
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
  const { coords, status: locationStatus } = useUserLocation();
  const { setSelectedBranch } = useSelectedBranch();

  useEffect(() => {
    if (!branchId) return;
    apiFetch<BranchDetailResponse>(`/api/branches/${branchId}`)
      .then(setData)
      .catch(() => setError('Failed to load branch details'))
      .finally(() => setLoading(false));
  }, [branchId]);

  const branch = data ? mapApiBranch(data.branch) : null;
  const deals = data ? data.deals.map(mapApiBranchDeal) : [];
  const isOpen = branch ? getIsOpenNow(branch.openingHours) : false;
  const hoursLines = branch ? formatOpeningHours(branch.openingHours) : [];
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
    Linking.openURL(url);
  };

  const onOrder = () => {
    setSelectedBranch(branch.id);
    router.push('/(tabs)/order');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
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
              <Badge label={isOpen ? 'Open' : 'Closed'} variant={isOpen ? 'success' : 'default'} mode={mode} />
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
    paddingBottom: Spacing.six,
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
