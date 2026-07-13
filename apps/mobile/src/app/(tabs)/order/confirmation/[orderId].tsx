import { Button, Card, OrderStatusBadge } from '@jojopotato/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useOrder } from '@/features/orders/hooks/use-order';
import { ScreenLoader, ScreenMessage } from '@/features/shared/components/screen-message';
import { useTheme } from '@/hooks/use-theme';

/** Format an ISO timestamp as a friendly local time (e.g. "2:45 PM"). */
function formatReadyTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Order Confirmation: the placed order's number, status, and pickup time. */
export default function OrderConfirmationScreen() {
  const theme = useTheme();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { data: order, loading, error, refetch } = useOrder(orderId);

  if (loading) return <ScreenLoader />;
  if (error || !order) {
    return (
      <ScreenMessage
        title="Couldn't load your order"
        subtitle={error ?? 'Order not found.'}
        actionLabel="Retry"
        onAction={refetch}
      />
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.heading, { color: theme.text }]}>Order confirmed!</Text>

      <Card>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Order number</Text>
        <Text style={[styles.orderNumber, { color: theme.text }]}>{order.orderNumber}</Text>
        <View style={styles.badgeRow}>
          <OrderStatusBadge status={order.status} />
        </View>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Ready by</Text>
        <Text style={[styles.readyTime, { color: theme.text }]}>
          {formatReadyTime(order.estimatedReadyAt)}
        </Text>
      </Card>

      <Button
        label="Track order"
        onPress={() =>
          router.push({
            pathname: '/(tabs)/order/tracking/[orderId]',
            params: { orderId: order.id },
          })
        }
      />
      <Button label="Back to home" variant="outline" onPress={() => router.replace('/(tabs)')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  heading: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h1 },
  label: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.bodySmall, marginTop: Spacing.two },
  orderNumber: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h2, marginTop: Spacing.half },
  badgeRow: { marginTop: Spacing.two },
  readyTime: { fontFamily: FontFamily.body.bold, fontSize: TypeScale.h3, marginTop: Spacing.half },
});
