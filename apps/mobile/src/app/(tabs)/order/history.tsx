import type { Order } from '@jojopotato/types';
import { Button, Card, EmptyState, OrderStatusBadge } from '@jojopotato/ui';
import { formatCurrency, reorderEligibility, summarizeOrderItems } from '@jojopotato/utils';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useOrderHistory } from '@/features/orders/hooks/use-order-history';
import { useReorder } from '@/features/orders/hooks/use-reorder';
import { ScreenLoader, ScreenMessage } from '@/features/shared/components/screen-message';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** Format an ISO date as a short local date (e.g. "Jul 13"). */
function formatPlacedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Order History: the caller's past orders, newest first. */
export default function OrderHistoryScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { data: orders, loading, error, refetch } = useOrderHistory();
  const { branches } = useBranch();
  const { reorder, isReordering } = useReorder();

  if (loading) return <ScreenLoader />;
  if (error) {
    return (
      <ScreenMessage
        title="Couldn't load your orders"
        subtitle={error}
        actionLabel="Retry"
        onAction={refetch}
      />
    );
  }
  if (!orders || orders.length === 0) {
    return (
      <View
        style={[styles.container, styles.emptyContainer, { backgroundColor: theme.background }]}
      >
        <EmptyState
          iconName="receipt-outline"
          title="No orders yet"
          description="When you place an order, it'll show up here so you can track it and reorder in a tap."
          actionLabel="Start an order"
          onAction={() => router.replace('/(tabs)/branches')}
          mode={mode}
        />
      </View>
    );
  }

  const openOrder = (order: Order) =>
    router.push({ pathname: '/(tabs)/order/tracking/[orderId]', params: { orderId: order.id } });

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const branchName = branches.find((b) => b.id === item.branchId)?.name ?? 'Unknown branch';
          const itemsSummary = summarizeOrderItems(item.items);
          return (
            <Pressable accessibilityRole="button" onPress={() => openOrder(item)}>
              <Card>
                <View style={styles.row}>
                  <Text style={[styles.orderNumber, { color: theme.text }]}>
                    {item.orderNumber}
                  </Text>
                  <Text style={[styles.total, { color: theme.text }]}>
                    {formatCurrency(item.totalCents)}
                  </Text>
                </View>
                <Text style={[styles.branch, { color: theme.text }]}>{branchName}</Text>
                {itemsSummary ? (
                  <Text style={[styles.summary, { color: theme.textSecondary }]}>
                    {itemsSummary}
                  </Text>
                ) : null}
                <Text style={[styles.date, { color: theme.textSecondary }]}>
                  {formatPlacedDate(item.placedAt)}
                </Text>
                <View style={styles.badgeRow}>
                  <OrderStatusBadge status={item.status} />
                </View>
                {reorderEligibility(item.status) ? (
                  <View style={styles.reorderRow} onStartShouldSetResponder={() => true}>
                    <Button
                      label="Reorder"
                      size="sm"
                      variant="outline"
                      loading={isReordering}
                      onPress={() => reorder(item)}
                      mode={mode}
                    />
                  </View>
                ) : null}
              </Card>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNumber: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h3 },
  total: { fontFamily: FontFamily.body.bold, fontSize: TypeScale.body },
  branch: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
    marginTop: Spacing.half,
  },
  summary: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    marginTop: Spacing.half,
  },
  date: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    marginTop: Spacing.half,
  },
  badgeRow: { marginTop: Spacing.two },
  reorderRow: { marginTop: Spacing.two, alignItems: 'flex-start' },
});
