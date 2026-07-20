import { Badge, Button, Card, DealCard, ScreenHeader, Toast } from '@jojopotato/ui';
import {
  buildDirectionsUrl,
  distanceKm,
  formatOpeningHours,
  getIsOpenNow,
} from '@jojopotato/utils';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
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

import { TAB_BAR_FOOTPRINT, useHideTabBarWhile } from '@/components/floating-tab-bar';
import { resolveTabBarClearance } from '@/components/floating-tab-bar.helpers';
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

  /*
    Hide the floating tab bar on this screen — it is the ROOT of its own
    top-level stack now (NAV-005), so `isNestedTabRoute()` is false and the bar
    would otherwise paint here. Gated on FOCUS, not just mount: the screen stays
    mounted in the Tabs navigator after the user navigates away (e.g. the Order
    CTA pushes into the Order tab), and an always-true flag would leave the bar
    hidden on the destination. See ../cart/index.tsx for the full note.

    Placed ABOVE the loading / error early returns below: hooks must run in the
    same order on every render, so it cannot sit after a conditional return.
  */
  useHideTabBarWhile(useIsFocused());

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

  /*
    Loading / error early returns get the SAME header + top inset as the loaded
    branch below. The native header used to cover them for free; with
    `headerShown:false` (see ./_layout.tsx) the loading branch would have NO way
    back at all, and the error branch's existing "Go back" Button would sit under
    the status bar. No 'bottom' edge: neither branch has a bottom CTA or a
    clearance call — their content is centered.
  */
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <ScreenHeader title="Branch Details" onBack={() => router.back()} mode={mode} />
          <View style={[styles.container, styles.centered]}>
            <ActivityIndicator color={theme.accent} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (error || !branch) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <ScreenHeader title="Branch Details" onBack={() => router.back()} mode={mode} />
          <View style={[styles.container, styles.centered]}>
            <Text style={[styles.message, { color: theme.textSecondary }]}>
              {error ?? 'Branch not found'}
            </Text>
            <Button label="Go back" variant="outline" mode={mode} onPress={() => router.back()} />
          </View>
        </SafeAreaView>
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
      {/*
        The floating tab bar is hidden here via useHideTabBarWhile(useIsFocused())
        above — see ../cart/index.tsx for the full note.

        TOP edge only (NAV-003). 'top' is still required — more so now, since this
        stack runs `headerShown:false` and the ScreenHeader below would otherwise
        sit under the status bar. 'bottom' is deliberately GONE, resolving the
        double-count NAV-001's EXECUTE report flagged: the device bottom inset now
        arrives exactly ONCE, via the resolveTabBarClearance(true, …) call on the
        scroll content below.
      */}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Branch Details" onBack={() => router.back()} mode={mode} />
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            Platform.OS !== 'web' && {
              // `true` selects the no-footprint branch: the floating bar is HIDDEN on this
              // screen (via useHideTabBarWhile above), so reserving its ~85dp footprint
              // would be dead space. NOTE: the helper's param is named `isNested` and this
              // screen is now the ROOT of its own top-level stack, not a nested tab screen
              // (NAV-005) — what the branch actually selects is "bar not rendered here",
              // which is true either way. The name is not renamed on purpose: the helper is
              // shared with other call sites and a unit test (NAV-001 owns it).
              //
              // `+ Spacing.four` restores styles.scrollContent's own paddingVertical:
              // paddingBottom overrides that shorthand's bottom half, so without it the
              // content would end exactly at the home-indicator boundary with no gap.
              // The clearance term supplies the device inset; this term is the design's
              // breathing room. Same split as notifications/cart/checkout.
              paddingBottom:
                resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom) + Spacing.four,
            },
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

            {isOpen ? (
              <Badge
                label={branch.isAcceptingPickup ? 'Accepting Pickup' : 'Not Accepting Pickup'}
                variant={branch.isAcceptingPickup ? 'success' : 'danger'}
                mode={mode}
              />
            ) : null}
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
    // NO paddingHorizontal here: <ScreenHeader> is a direct child and brings its own
    // (Spacing.four). Padding this wrapper too would indent the header twice, offsetting
    // it against every other client screen (Product Details, Cart, Checkout, …), whose
    // wrappers are unpadded. The children that need the gutter carry it themselves —
    // scrollContent below, and `centered` for the loading/error branches.
  },
  scrollContent: {
    gap: Spacing.two,
    // BRN-006: split the former `paddingVertical: Spacing.four` so the top gap under
    // <ScreenHeader> isn't oversized. `paddingTop: Spacing.three` matches the sibling
    // ScreenHeader screens (cart/index, cart/checkout); `paddingBottom` stays
    // Spacing.four (the inline clearance override below re-adds it on native).
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    // paddingHorizontal moved down from `safeArea` (NAV-003) so the gutter applies to the
    // scroll body only, not to <ScreenHeader> (which pads itself).
    paddingHorizontal: Spacing.four,
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
