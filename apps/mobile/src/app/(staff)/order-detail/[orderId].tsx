/**
 * Order Detail screen (staff) — STAFF-002 + STAFF-003.
 *
 * Shows a single order's items + selected options from `GET /api/staff/orders/:id`
 * (via `useStaffOrderDetail`). Replaces the STAFF-002 inert action placeholders
 * with `LiveOrderActions` — a real mutation-backed button matrix (STAFF-003).
 */

import { Button, Card, ScreenHeader, type ThemeMode } from '@jojopotato/ui';
import type { OrderStatus, StaffOrderDetail, StaffOrderItem } from '@jojopotato/types';
import { formatCurrency } from '@jojopotato/utils';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useStaffOrderDetail } from '@/features/staff/hooks/use-staff-order-detail';
import { useUpdateOrderStatus } from '@/features/staff/hooks/use-update-order-status';
import { STAFF_STATUS_CONFIG } from '@/features/staff/lib/staff-status-config';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

function formatPlacedAt(placedAt: string): string {
  const date = new Date(placedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

const OPTION_TYPE_LABEL: Record<StaffOrderItem['selectedOptions'][number]['optionType'], string> = {
  size: 'Size',
  flavor: 'Flavor',
  add_on: 'Add-on',
};

// ─── Live action buttons (STAFF-003) ─────────────────────────────────────────

interface LiveOrderActionsProps {
  order: Pick<StaffOrderDetail, 'id' | 'status'>;
  mode: ThemeMode;
}

/**
 * Status-appropriate action buttons per SPEC button matrix.
 *
 * Button set by status:
 *   pending     → Accept + Reject (with confirm alert)
 *   accepted    → Start Preparing
 *   preparing   → Mark Flavoring
 *   flavoring   → Mark Ready
 *   ready       → Mark Picked Up + Cancel (with confirm alert)
 *   terminal    → nothing (completed / cancelled / rejected)
 *
 * While a mutation is pending: the tapped button shows loading and all buttons
 * are disabled. On 409 or other error: inline message rendered; no navigation.
 *
 * AC-8 KNOWN-GAP-AC-8-LIST-REFRESH: the Active Orders back-list cache is correctly
 * invalidated (`['staff','orders']`), but the visual refresh is only verifiable once
 * the STAFF-002 mock `active-orders.tsx` screen is replaced with live data.
 */
function LiveOrderActions({ order, mode }: LiveOrderActionsProps) {
  const { mutate, isPending, isError, error } = useUpdateOrderStatus();
  const status = order.status as OrderStatus;

  function handleTransition(targetStatus: OrderStatus) {
    mutate({ orderId: order.id, status: targetStatus });
  }

  function confirmThenTransition(targetStatus: OrderStatus, actionLabel: string) {
    Alert.alert(
      `${actionLabel} order?`,
      `Are you sure you want to ${actionLabel.toLowerCase()} this order?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionLabel,
          style: 'destructive',
          onPress: () => handleTransition(targetStatus),
        },
      ],
    );
  }

  // Detect 409 specifically for the inline message copy.
  const errorStatus = (error as (Error & { status?: number }) | null)?.status;
  const is409 = isError && errorStatus === 409;

  return (
    <View style={styles.actionsWrap}>
      {isError ? (
        <Text style={styles.errorText}>
          {is409
            ? 'Order status has changed — pull down to refresh'
            : 'Something went wrong. Please try again.'}
        </Text>
      ) : null}

      {status === 'pending' && (
        <View style={styles.actionRow}>
          <Button
            label={isPending ? 'Saving…' : 'Accept'}
            variant="primary"
            mode={mode}
            disabled={isPending}
            onPress={() => handleTransition('accepted')}
            style={styles.flex}
          />
          <Button
            label="Reject"
            variant="accent"
            mode={mode}
            disabled={isPending}
            onPress={() => confirmThenTransition('rejected', 'Reject')}
            style={styles.flex}
          />
        </View>
      )}

      {status === 'accepted' && (
        <Button
          label={isPending ? 'Saving…' : 'Start Preparing'}
          variant="ink"
          mode={mode}
          disabled={isPending}
          onPress={() => handleTransition('preparing')}
        />
      )}

      {status === 'preparing' && (
        <Button
          label={isPending ? 'Saving…' : 'Mark Flavoring'}
          variant="ink"
          mode={mode}
          disabled={isPending}
          onPress={() => handleTransition('flavoring')}
        />
      )}

      {status === 'flavoring' && (
        <Button
          label={isPending ? 'Saving…' : 'Mark Ready'}
          variant="primary"
          mode={mode}
          disabled={isPending}
          onPress={() => handleTransition('ready')}
        />
      )}

      {status === 'ready' && (
        <View style={styles.actionColumn}>
          <Button
            label={isPending ? 'Saving…' : 'Mark Picked Up'}
            variant="primary"
            mode={mode}
            disabled={isPending}
            onPress={() => handleTransition('completed')}
          />
          <Button
            label="Cancel"
            variant="outline"
            mode={mode}
            disabled={isPending}
            onPress={() => confirmThenTransition('cancelled', 'Cancel')}
          />
        </View>
      )}

      {/* Terminal statuses (completed / cancelled / rejected): no actions */}
    </View>
  );
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
        <ScreenHeader
          title={order ? order.orderNumber : 'Order Detail'}
          onBack={() => router.back()}
          mode={mode}
        />

        <ScrollView contentContainerStyle={styles.content}>
          {isLoading ? (
            <View style={styles.stateBlock}>
              <ActivityIndicator size="large" color={theme.text} />
            </View>
          ) : isError ? (
            <View style={styles.stateBlock}>
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                Could not load order
              </Text>
              <Button label="Back" variant="outline" mode={mode} onPress={() => router.back()} />
            </View>
          ) : !order ? (
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
  const cfg = STAFF_STATUS_CONFIG[order.status as OrderStatus] ?? null;

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

      {/* Live STAFF-003 action buttons */}
      <LiveOrderActions order={order} mode={mode} />
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
  actionsWrap: {
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionColumn: {
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  errorText: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    color: '#E81E26',
    textAlign: 'center',
  },
});
