import type { Order } from '@jojopotato/types';
import { Card, EmptyState, OrderStatusBadge } from '@jojopotato/ui';
import { formatCurrency } from '@jojopotato/utils';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useOrderHistory } from '@/features/orders/hooks/use-order-history';
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
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => openOrder(item)}>
            <Card>
              <View style={styles.row}>
                <Text style={[styles.orderNumber, { color: theme.text }]}>{item.orderNumber}</Text>
                <Text style={[styles.total, { color: theme.text }]}>
                  {formatCurrency(item.totalCents)}
                </Text>
              </View>
              <Text style={[styles.date, { color: theme.textSecondary }]}>
                {formatPlacedDate(item.placedAt)}
              </Text>
              <View style={styles.badgeRow}>
                <OrderStatusBadge status={item.status} />
              </View>
            </Card>
          </Pressable>
        )}
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
  date: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    marginTop: Spacing.half,
  },
  badgeRow: { marginTop: Spacing.two },
});
