import { Badge, BrandWordmark, Button, Card, Toast, type ThemeMode } from '@jojopotato/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useToast } from '@/features/shared/hooks/use-toast';
import { useNewOrderToast } from '@/features/staff/hooks/use-new-order-toast';
import { useStaffBranchSettings } from '@/features/staff/hooks/use-staff-branch-settings';
import { useStaffMe } from '@/features/staff/hooks/use-staff-me';
import { useStaffOrders } from '@/features/staff/hooks/use-staff-orders';
import { deriveDashboardCounts } from '@/features/staff/lib/dashboard-counts';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

// Nav card config. All five cards navigate to their real staff screens; the
// live dashboard stat block above them (STAFF-005) shows branch-scoped order
// counts, accepting-pickup state, and current prep time.
const NAV_CARDS = [
  {
    title: 'Active Orders',
    subtitle: 'View orders',
    navigateTo: '/(staff)/active-orders' as const,
  },
  {
    title: 'Completed Orders',
    subtitle: 'View history',
    navigateTo: '/(staff)/completed-orders' as const,
  },
  {
    title: 'Product Availability',
    subtitle: 'Manage product availability',
    navigateTo: '/(staff)/product-availability' as const,
  },
  {
    title: 'Branch Pickup Settings',
    subtitle: 'Configure pickup settings',
    navigateTo: '/(staff)/branch-pickup-settings' as const,
  },
  {
    title: 'Enter Pickup Code',
    subtitle: 'Look up an order by code',
    navigateTo: '/(staff)/pickup-lookup' as const,
  },
] as const;

/**
 * Staff dashboard home (STAFF-001 shell + STAFF-005 stat block). Branch name
 * comes from the auth-gated `GET /api/staff/me`; the live stat block composes
 * `useStaffOrders` (10s poll) + `useStaffBranchSettings` into branch-scoped
 * counts via `deriveDashboardCounts`. All five nav cards navigate to their real
 * staff screens.
 */
export default function StaffDashboard() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode: ThemeMode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { data, isLoading, error, refetch: refetchStaffMe } = useStaffMe();
  const { data: orders, refetch: refetchOrders } = useStaffOrders();
  const { data: branchSettings, refetch: refetchBranchSettings } = useStaffBranchSettings();
  const router = useRouter();

  // Raise a warning toast when a genuinely-new order arrives on a poll. `orders`
  // is the raw query data (undefined while loading), so the first poll seeds the
  // baseline without toasting; only later polls with a new id fire.
  const { toast, showToast, hideToast } = useToast();
  useNewOrderToast(orders, showToast);

  // One pull-to-refresh gesture refetches every mounted dashboard query
  // (mirrors the customer Home screen's whole-screen idiom). try/finally always
  // clears `refreshing` even if one refetch rejects; each widget renders its own
  // fallback so a partial failure never blanks the screen.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchStaffMe(), refetchOrders(), refetchBranchSettings()]);
    } finally {
      setRefreshing(false);
    }
  };

  const counts = deriveDashboardCounts(orders ?? []);
  const otherActive =
    counts.activeByStatus.accepted +
    counts.activeByStatus.preparing +
    counts.activeByStatus.flavoring +
    counts.activeByStatus.ready;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView
          testID="staff-dashboard-scroll"
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.text}
              colors={[theme.text]}
            />
          }
        >
          <View style={styles.header}>
            <BrandWordmark mode={mode} size={TypeScale.h1} />
            <Badge label="Staff" mode={mode} />
          </View>

          <View style={styles.branchBlock}>
            <Text style={[styles.branchLabel, { color: theme.textSecondary }]}>Your branch</Text>
            {isLoading ? (
              <ActivityIndicator color={theme.text} />
            ) : error || !data ? (
              <Text style={[styles.branchName, { color: theme.textSecondary }]}>
                Branch unavailable
              </Text>
            ) : data.assignedBranch ? (
              <Text style={[styles.branchName, { color: theme.text }]}>
                {data.assignedBranch.name}
              </Text>
            ) : (
              <Text style={[styles.branchName, { color: theme.textSecondary }]}>
                No branch assigned
              </Text>
            )}
          </View>

          <Card mode={mode} style={styles.statCard}>
            <Text style={[styles.statCardTitle, { color: theme.text }]}>Branch at a glance</Text>

            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.text }]}>
                  {counts.awaitingAcceptance}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                  Awaiting acceptance
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.text }]}>{otherActive}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>In progress</Text>
              </View>
            </View>

            <View style={styles.statMetaRow}>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Pickup</Text>
              {branchSettings ? (
                <Badge
                  label={branchSettings.isAcceptingPickup ? 'Accepting' : 'Not accepting'}
                  variant={branchSettings.isAcceptingPickup ? 'success' : 'danger'}
                  mode={mode}
                />
              ) : (
                <Text style={[styles.statMetaValue, { color: theme.textSecondary }]}>—</Text>
              )}
            </View>

            <View style={styles.statMetaRow}>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Prep time</Text>
              <Text style={[styles.statMetaValue, { color: theme.text }]}>
                {branchSettings ? `${branchSettings.estimatedPrepMinutes} min` : '—'}
              </Text>
            </View>
          </Card>

          <View style={styles.cards}>
            {NAV_CARDS.map((card) => (
              <Pressable
                key={card.title}
                onPress={() => router.push(card.navigateTo)}
                accessibilityRole="button"
              >
                <Card mode={mode} style={styles.card}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>{card.title}</Text>
                  <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
                    {card.subtitle}
                  </Text>
                </Card>
              </Pressable>
            ))}
          </View>

          <Button label="Sign out" variant="outline" mode={mode} onPress={() => void signOut()} />
        </ScrollView>
      </SafeAreaView>

      {/* Screen-root new-order toast (STAFF live freshness). Staff screens are
          pushed (no floating tab bar), so the offset is just the safe-area inset. */}
      <Toast
        visible={toast.visible}
        message={toast.message}
        severity={toast.severity}
        mode={mode}
        bottomOffset={insets.bottom + Spacing.four}
        onDismiss={hideToast}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  branchBlock: {
    gap: Spacing.one,
  },
  branchLabel: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  branchName: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
  },
  statCard: {
    gap: Spacing.three,
  },
  statCardTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  statRow: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  statItem: {
    flex: 1,
    gap: Spacing.half,
  },
  statValue: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h1,
  },
  statLabel: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  statMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statMetaValue: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  cards: {
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.half,
  },
  cardTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  cardSubtitle: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
});
