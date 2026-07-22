/**
 * Order Detail screen (staff) — STAFF-002 + STAFF-003.
 *
 * Shows a single order's items + selected options from `GET /api/staff/orders/:id`
 * (via `useStaffOrderDetail`). Replaces the STAFF-002 inert action placeholders
 * with `LiveOrderActions` — a real mutation-backed button matrix (STAFF-003).
 */

import { Button, Card, ConfirmDialog, ScreenHeader, type ThemeMode } from '@jojopotato/ui';
import type { OrderStatus, StaffOrderDetail, StaffOrderItem } from '@jojopotato/types';
import { resolveReasonLabel } from '@jojopotato/types';
import { formatCurrency } from '@jojopotato/utils';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Palette, Radii, Spacing, TypeScale } from '@/constants/theme';
import { RejectReasonDialog } from '@/features/staff/components/reject-reason-dialog';
import { useRejectOrder } from '@/features/staff/hooks/use-reject-order';
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
  const {
    mutate: rejectMutate,
    isPending: isRejecting,
    isError: isRejectError,
    error: rejectError,
  } = useRejectOrder();
  const status = order.status as OrderStatus;
  const [pendingAction, setPendingAction] = useState<{
    status: OrderStatus;
    label: string;
  } | null>(null);
  // B2: Reject no longer goes through the yes/no ConfirmDialog — it opens a
  // reason picker, because a reject without a reason is no longer a valid request
  // (the server 422s it).
  const [rejectOpen, setRejectOpen] = useState(false);

  function handleTransition(targetStatus: OrderStatus) {
    mutate({ orderId: order.id, status: targetStatus });
  }

  // Opens the themed confirm instead of a raw OS alert. Two-choice semantics are
  // identical: cancel does nothing, confirm runs the same handleTransition.
  function confirmThenTransition(targetStatus: OrderStatus, actionLabel: string) {
    setPendingAction({ status: targetStatus, label: actionLabel });
  }

  // Detect 409 specifically for the inline message copy. Both mutations surface
  // through the same banner — only one of them can be in flight at a time.
  const activeError = (isError ? error : isRejectError ? rejectError : null) as
    (Error & { status?: number }) | null;
  const showError = isError || isRejectError;
  const is409 = showError && activeError?.status === 409;
  const busy = isPending || isRejecting;

  return (
    <View style={styles.actionsWrap}>
      {showError ? (
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
            disabled={busy}
            onPress={() => handleTransition('accepted')}
            style={styles.flex}
          />
          <Button
            testID="staff-reject-button"
            label="Reject"
            variant="accent"
            mode={mode}
            disabled={busy}
            onPress={() => setRejectOpen(true)}
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

      <ConfirmDialog
        visible={pendingAction !== null}
        title={`${pendingAction?.label ?? ''} order?`}
        message={`Are you sure you want to ${(pendingAction?.label ?? '').toLowerCase()} this order?`}
        confirmLabel={pendingAction?.label ?? 'Confirm'}
        cancelLabel="Cancel"
        variant="destructive"
        mode={mode}
        onConfirm={() => {
          const action = pendingAction;
          setPendingAction(null);
          if (action) handleTransition(action.status);
        }}
        onCancel={() => setPendingAction(null)}
      />

      <RejectReasonDialog
        visible={rejectOpen}
        submitting={isRejecting}
        mode={mode}
        onCancel={() => setRejectOpen(false)}
        onSubmit={(reasonCode, note) => {
          setRejectOpen(false);
          rejectMutate({ orderId: order.id, reasonCode, note });
        }}
      />
    </View>
  );
}

/**
 * Step 13b — render the terminal-transition reason on the staff order detail.
 *
 * Without this the reason plumbing would reach the wire and stop there: SPEC B2.6
 * and B3.9 both require staff to actually SEE why an order ended. The label lookup
 * is keyed off `reasonActor` because staff and customer draw from two different
 * code tables, and the same code string could otherwise resolve to the wrong copy.
 */
function OrderReasonBlock({
  order,
  mode,
}: {
  order: Pick<StaffOrderDetail, 'status' | 'reasonCode' | 'reasonNote' | 'reasonActor'>;
  mode: ThemeMode;
}) {
  const theme = useTheme();
  const isTerminalWithReason = order.status === 'rejected' || order.status === 'cancelled';
  const label = resolveReasonLabel(order.reasonCode, order.reasonActor);
  if (!isTerminalWithReason || (!label && !order.reasonNote)) return null;

  const who =
    order.reasonActor === 'customer'
      ? 'Cancelled by the customer'
      : order.status === 'rejected'
        ? 'Rejected by staff'
        : 'Cancelled by staff';

  return (
    // `Card` exposes no `testID` prop and `packages/ui` is out of this plan's
    // blast radius, so the query handle lives on a wrapping View instead of
    // widening a shared primitive for one screen.
    <View testID="order-reason-block">
      <Card mode={mode} style={styles.reasonCard}>
        <Text style={[styles.reasonWho, { color: theme.textSecondary }]}>{who}</Text>
        {label ? <Text style={[styles.reasonLabel, { color: theme.text }]}>{label}</Text> : null}
        {order.reasonNote ? (
          <Text style={[styles.reasonNote, { color: theme.textSecondary }]}>
            {order.reasonNote}
          </Text>
        ) : null}
      </Card>
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

      {/* Why the order ended, when it ended in rejected/cancelled (B2.6 / B3.9) */}
      <OrderReasonBlock order={order} mode={mode} />

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
  reasonCard: {
    gap: Spacing.half,
  },
  reasonWho: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption,
  },
  reasonLabel: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  reasonNote: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
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
    color: Palette.jred,
    textAlign: 'center',
  },
});
