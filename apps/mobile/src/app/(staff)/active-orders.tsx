/**
 * Active Orders screen (staff dashboard) — STAFF-002.
 *
 * Real, branch-scoped, polling order feed from `GET /api/staff/orders`
 * (via `useStaffOrders`, 10s poll). Read-only: tapping a card pushes the
 * read-only Order Detail screen. No status mutations happen here (STAFF-003).
 */

import { Badge, Card, ScreenHeader, Toast, type ThemeMode } from '@jojopotato/ui';
import type { StaffOrderSummary } from '@jojopotato/types';
import { formatCurrency } from '@jojopotato/utils';
import { useRouter } from 'expo-router';
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

import { FontFamily, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useToast } from '@/features/shared/hooks/use-toast';
import { useNewOrderToast } from '@/features/staff/hooks/use-new-order-toast';
import { useStaffMe } from '@/features/staff/hooks/use-staff-me';
import { useStaffOrders } from '@/features/staff/hooks/use-staff-orders';
import {
  STAFF_STATUS_CONFIG,
  type StaffOrderStatus,
} from '@/features/staff/lib/staff-status-config';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** Format an ISO placed-at timestamp as a short relative label ("Just now", "3 min ago", "2 h ago"). */
function formatPlacedAgo(placedAt: string): string {
  const placed = new Date(placedAt).getTime();
  if (Number.isNaN(placed)) return '';
  const diffMs = Date.now() - placed;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ago`;
}

/** A status is a known staff status when it has a config entry (non-terminal). */
function isStaffStatus(status: string): status is StaffOrderStatus {
  return status in STAFF_STATUS_CONFIG;
}

// ─── Single order card ────────────────────────────────────────────────────────
function OrderCard({
  order,
  mode,
  onPress,
}: {
  order: StaffOrderSummary;
  mode: ThemeMode;
  onPress: () => void;
}) {
  const theme = useTheme();
  const cfg = isStaffStatus(order.status) ? STAFF_STATUS_CONFIG[order.status] : null;

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card mode={mode} style={styles.card}>
        {/* Header: order number + status pill */}
        <View style={styles.cardHeader}>
          <Text style={[styles.orderNumber, { color: theme.text }]}>{order.orderNumber}</Text>
          {cfg ? (
            <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.statusText, { color: cfg.text }]}>{cfg.label}</Text>
            </View>
          ) : null}
        </View>

        {/* Meta: placed-ago + total */}
        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: theme.textSecondary }]}>
            {formatPlacedAgo(order.placedAt)}
          </Text>
          <Text style={[styles.totalText, { color: theme.text }]}>
            {formatCurrency(order.totalCents)}
          </Text>
        </View>

        {/* Server-computed item summary */}
        <Text style={[styles.itemText, { color: theme.textSecondary }]}>{order.itemSummary}</Text>
      </Card>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ActiveOrdersScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const router = useRouter();
  const mode: ThemeMode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();
  const { data: staffMe, isLoading: staffLoading, error: staffError } = useStaffMe();
  const {
    data: ordersData,
    isLoading: ordersLoading,
    error: ordersError,
    isRefetching,
    refetch,
  } = useStaffOrders();
  const orders = ordersData ?? [];

  // Raise a warning toast when a genuinely-new order arrives on a poll. Pass the
  // RAW data (undefined while loading) so the first poll seeds the baseline
  // without toasting; only later polls with a new id fire.
  const { toast, showToast, hideToast } = useToast();
  useNewOrderToast(ordersData, showToast);

  const branchName = staffLoading
    ? null
    : staffError || !staffMe
      ? 'Branch unavailable'
      : staffMe.assignedBranch
        ? staffMe.assignedBranch.name
        : 'No branch assigned';

  const showInitialSpinner = ordersLoading && orders.length === 0;
  const showError = Boolean(ordersError) && orders.length === 0;
  const showEmpty = !ordersLoading && !ordersError && orders.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Compact brand header — matches the shell instead of a tall native header */}
        <ScreenHeader title="Active Orders" onBack={() => router.back()} mode={mode} />
        <ScrollView
          testID="staff-active-orders-scroll"
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={theme.text}
              colors={[theme.text]}
            />
          }
        >
          {/* Branch context */}
          <View style={styles.branchRow}>
            {staffLoading ? (
              <ActivityIndicator size="small" color={theme.text} />
            ) : (
              <Text style={[styles.branchName, { color: theme.textSecondary }]}>{branchName}</Text>
            )}
            <Badge label={`${orders.length} active`} mode={mode} />
          </View>

          {showInitialSpinner ? (
            <View style={styles.stateBlock}>
              <ActivityIndicator size="large" color={theme.text} />
            </View>
          ) : showError ? (
            <View style={styles.stateBlock}>
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                Could not load orders. Pull back and retry.
              </Text>
            </View>
          ) : showEmpty ? (
            <View style={styles.stateBlock}>
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                No active orders right now
              </Text>
            </View>
          ) : (
            orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                mode={mode}
                onPress={() => router.push(`/(staff)/order-detail/${order.id}`)}
              />
            ))
          )}
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
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  branchName: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  stateBlock: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
  },
  stateText: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
    textAlign: 'center',
  },
  card: {
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderNumber: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  statusPill: {
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.full,
  },
  statusText: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  totalText: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  itemText: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
});
