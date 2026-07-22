/**
 * Completed Orders screen (staff) — STAFF-003.
 *
 * Shows terminal orders (completed, cancelled, rejected) for the staff's
 * assigned branch, newest-first, via `GET /api/staff/orders/completed`.
 * Row tap navigates to the read-only Order Detail screen (no action buttons
 * since these orders are in a terminal state).
 */

import { Card, ScreenHeader, type ThemeMode } from '@jojopotato/ui';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useCompletedOrders } from '@/features/staff/hooks/use-completed-orders';
import { STAFF_STATUS_CONFIG } from '@/features/staff/lib/staff-status-config';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

function formatPlacedAt(placedAt: string): string {
  const date = new Date(placedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

interface OrderRowProps {
  order: StaffOrderSummary;
  mode: ThemeMode;
  onPress: () => void;
}

function CompletedOrderRow({ order, mode, onPress }: OrderRowProps) {
  const theme = useTheme();
  const cfg = STAFF_STATUS_CONFIG[order.status] ?? null;

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card mode={mode} style={styles.row}>
        <View style={styles.rowTop}>
          <Text style={[styles.orderNumber, { color: theme.text }]}>{order.orderNumber}</Text>
          {cfg ? (
            <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.statusText, { color: cfg.text }]}>{cfg.label}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.itemSummary, { color: theme.textSecondary }]}>
          {order.itemSummary}
        </Text>
        <View style={styles.rowBottom}>
          <Text style={[styles.placedAt, { color: theme.textSecondary }]}>
            {formatPlacedAt(order.placedAt)}
          </Text>
          <Text style={[styles.total, { color: theme.text }]}>
            {formatCurrency(order.totalCents)}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

export default function CompletedOrdersScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode: ThemeMode = scheme === 'dark' ? 'dark' : 'light';
  const router = useRouter();
  const { data: completedOrders, isLoading, isError, isRefetching, refetch } = useCompletedOrders();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScreenHeader title="Completed Orders" onBack={() => router.back()} mode={mode} />

        <ScrollView
          testID="staff-completed-orders-scroll"
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
          {isLoading ? (
            <View style={styles.stateBlock}>
              <ActivityIndicator size="large" color={theme.text} />
            </View>
          ) : isError ? (
            <View style={styles.stateBlock}>
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                Could not load completed orders
              </Text>
            </View>
          ) : !completedOrders || completedOrders.length === 0 ? (
            <View style={styles.stateBlock}>
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                No completed orders yet
              </Text>
            </View>
          ) : (
            completedOrders.map((order) => (
              <CompletedOrderRow
                key={order.id}
                order={order}
                mode={mode}
                onPress={() => router.push(`/(staff)/order-detail/${order.id}`)}
              />
            ))
          )}
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
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
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
  row: {
    gap: Spacing.one,
  },
  rowTop: {
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
    borderRadius: 999,
  },
  statusText: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption,
  },
  itemSummary: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  placedAt: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  total: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
});
