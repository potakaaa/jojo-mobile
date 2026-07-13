import { Card, OrderStatusTimeline } from '@jojopotato/ui';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useOrder } from '@/features/orders/hooks/use-order';
import { ScreenLoader, ScreenMessage } from '@/features/shared/components/screen-message';
import { useTheme } from '@/hooks/use-theme';

/** Order Tracking: the order's status progression via a vertical timeline. */
export default function OrderTrackingScreen() {
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
      <View>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Order number</Text>
        <Text style={[styles.orderNumber, { color: theme.text }]}>{order.orderNumber}</Text>
      </View>
      <Card>
        <OrderStatusTimeline currentStatus={order.status} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  label: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.bodySmall },
  orderNumber: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h2, marginTop: Spacing.half },
});
