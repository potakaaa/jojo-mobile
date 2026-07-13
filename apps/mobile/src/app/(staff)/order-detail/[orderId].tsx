/**
 * Order Detail screen (staff) — STAFF-002. READ-ONLY.
 *
 * Shows a single order's items + selected options from `GET /api/staff/orders/:id`
 * (via `useStaffOrderDetail`). The action buttons are INERT placeholders for the
 * STAFF-003 status-mutation work — every `onPress` is a no-op. No write endpoint
 * exists yet.
 */

import { Ionicons } from '@expo/vector-icons';
import { Button, Card, type ThemeMode } from '@jojopotato/ui';
import type { StaffOrderDetail, StaffOrderItem } from '@jojopotato/types';
import { formatCurrency } from '@jojopotato/utils';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useStaffOrderDetail } from '@/features/staff/hooks/use-staff-order-detail';
import {
  STAFF_STATUS_CONFIG,
  type StaffOrderStatus,
} from '@/features/staff/lib/staff-status-config';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

function formatPlacedAt(placedAt: string): string {
  const date = new Date(placedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function isStaffStatus(status: string): status is StaffOrderStatus {
  return status in STAFF_STATUS_CONFIG;
}

const OPTION_TYPE_LABEL: Record<StaffOrderItem['selectedOptions'][number]['optionType'], string> = {
  size: 'Size',
  flavor: 'Flavor',
  add_on: 'Add-on',
};

// ─── Inert action buttons (STAFF-003 surface — all no-ops) ──────────────────
function InertOrderActions({ status, mode }: { status: string; mode: ThemeMode }) {
  // STAFF-003: wire real mutations here. These buttons are intentionally inert.
  const noop = () => {
    // STAFF-003: no-op placeholder — no write endpoint exists yet.
  };

  if (status === 'pending') {
    return (
      <View style={styles.actionRow}>
        <Button label="Accept" variant="primary" mode={mode} onPress={noop} style={styles.flex} />
        <Button label="Reject" variant="accent" mode={mode} onPress={noop} style={styles.flex} />
      </View>
    );
  }
  if (status === 'accepted' || status === 'preparing') {
    return <Button label="Mark Flavoring" variant="ink" mode={mode} onPress={noop} />;
  }
  if (status === 'flavoring') {
    return <Button label="Mark Ready" variant="primary" mode={mode} onPress={noop} />;
  }
  if (status === 'ready') {
    return <Button label="Mark Picked Up" variant="primary" mode={mode} onPress={noop} />;
  }
  return null;
}

function OrderItemRow({ item, mode }: { item: StaffOrderItem; mode: ThemeMode }) {
  const theme = useTheme();
  return (
    <Card mode={mode} style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Text style={[styles.itemName, { color: theme.text }]}>
          {item.quantity}× {item.productName}
        </Text>
        <Text style={[styles.itemPrice, { color: theme.text }]}>
          {formatCurrency(item.totalPriceCents)}
        </Text>
      </View>
      {item.selectedOptions.map((option) => (
        <Text key={option.optionId} style={[styles.optionText, { color: theme.textSecondary }]}>
          {OPTION_TYPE_LABEL[option.optionType]}: {option.name}
        </Text>
      ))}
    </Card>
  );
}

export default function OrderDetailScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const router = useRouter();
  const mode: ThemeMode = scheme === 'dark' ? 'dark' : 'light';
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { data: order, isLoading, isError } = useStaffOrderDetail(orderId ?? '');

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {order ? order.orderNumber : 'Order Detail'}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {isLoading ? (
            <View style={styles.stateBlock}>
              <ActivityIndicator size="large" color={theme.text} />
            </View>
          ) : isError || !order ? (
            <View style={styles.stateBlock}>
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                Order not found
              </Text>
              <Button label="Back" variant="outline" mode={mode} onPress={() => router.back()} />
            </View>
          ) : (
            <OrderDetailBody order={order} mode={mode} />
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function OrderDetailBody({ order, mode }: { order: StaffOrderDetail; mode: ThemeMode }) {
  const theme = useTheme();
  const cfg = isStaffStatus(order.status) ? STAFF_STATUS_CONFIG[order.status] : null;

  return (
    <>
      {/* Order header: number, placed-at, status pill */}
      <Card mode={mode} style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <Text style={[styles.orderNumber, { color: theme.text }]}>{order.orderNumber}</Text>
          {cfg ? (
            <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.statusText, { color: cfg.text }]}>{cfg.label}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.metaText, { color: theme.textSecondary }]}>
          {formatPlacedAt(order.placedAt)}
        </Text>
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Total</Text>
          <Text style={[styles.totalValue, { color: theme.text }]}>
            {formatCurrency(order.totalCents)}
          </Text>
        </View>
      </Card>

      {/* Items */}
      <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Items</Text>
      {order.items.map((item) => (
        <OrderItemRow key={`${item.productId}-${item.productName}`} item={item} mode={mode} />
      ))}

      {/* Inert STAFF-003 action buttons */}
      <View style={styles.actionsBlock}>
        <InertOrderActions status={order.status} mode={mode} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
  },
  headerTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
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
    gap: Spacing.three,
  },
  stateText: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
    textAlign: 'center',
  },
  summaryCard: {
    gap: Spacing.two,
  },
  summaryTop: {
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
  metaText: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
  },
  totalValue: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  sectionLabel: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption,
  },
  itemCard: {
    gap: Spacing.half,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  itemPrice: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  optionText: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
  actionsBlock: {
    marginTop: Spacing.two,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
});
