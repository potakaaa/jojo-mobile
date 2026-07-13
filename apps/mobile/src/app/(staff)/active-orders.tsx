/**
 * MOCK PREVIEW — Active Orders screen (staff dashboard).
 *
 * This is a VISUAL MOCK for STAFF-002 preview only. It uses hardcoded sample
 * data, makes NO API calls for order data, performs NO mutations, and is clearly
 * separable from the real implementation. Replace this entire file when
 * STAFF-002 lands.
 *
 * The only network call present (`useStaffMe`) already exists in the shell for
 * the branch name — it is not added here.
 */

import { Badge, Button, Card, type ThemeMode } from '@jojopotato/ui';
import { formatCurrency } from '@jojopotato/utils';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Palette, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useStaffMe } from '@/features/staff/hooks/use-staff-me';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

// ─── Real DB order status enum (from packages/api/src/db/schema/orders.ts) ──
// NOTE: types/OrderStatus (@jojopotato/types) is out of sync with the DB orders
// enum — reconcile in STAFF-002/003. Do NOT use OrderStatusBadge from
// @jojopotato/ui for staff views; it uses a different status set
// (confirmed/ready_for_pickup vs accepted/flavoring/ready).
type DbOrderStatus = 'pending' | 'accepted' | 'preparing' | 'flavoring' | 'ready';

// ─── Mock data ────────────────────────────────────────────────────────────────
// MOCK DATA — STAFF-002 preview only, no API
interface MockLineItem {
  qty: number;
  name: string;
  option: string;
}

interface MockOrder {
  id: string;
  orderNumber: string;
  status: DbOrderStatus;
  placedAgo: string;
  /** Total in cents (e.g. 24000 = ₱240.00). Passed to formatCurrency. */
  totalCents: number;
  items: MockLineItem[];
}

const MOCK_ORDERS: MockOrder[] = [
  {
    id: 'm1',
    orderNumber: '#A1048',
    status: 'pending',
    placedAgo: 'Just now',
    totalCents: 28000,
    items: [
      { qty: 2, name: 'Loaded Fries', option: 'Cheese' },
      { qty: 1, name: 'Crispy Chicken', option: 'Spicy' },
    ],
  },
  {
    id: 'm2',
    orderNumber: '#A1047',
    status: 'accepted',
    placedAgo: '3 min ago',
    totalCents: 14000,
    items: [
      { qty: 1, name: 'Classic Fries', option: 'Original' },
      { qty: 1, name: 'Soda', option: 'Cola' },
    ],
  },
  {
    id: 'm3',
    orderNumber: '#A1046',
    status: 'preparing',
    placedAgo: '7 min ago',
    totalCents: 32000,
    items: [{ qty: 3, name: 'Loaded Fries', option: 'Bacon & Cheese' }],
  },
  {
    id: 'm4',
    orderNumber: '#A1045',
    status: 'flavoring',
    placedAgo: '12 min ago',
    totalCents: 19500,
    items: [
      { qty: 2, name: 'Twister Fries', option: 'Sour Cream' },
      { qty: 1, name: 'Iced Tea', option: 'Lemon' },
    ],
  },
  {
    id: 'm5',
    orderNumber: '#A1043',
    status: 'ready',
    placedAgo: '18 min ago',
    totalCents: 24000,
    items: [{ qty: 2, name: 'Loaded Fries', option: 'Cheese' }],
  },
];

// ─── Status pill config ───────────────────────────────────────────────────────
// NOTE: types/OrderStatus (@jojopotato/types) is out of sync with the DB orders
// enum — reconcile in STAFF-002/003.
const STATUS_CONFIG: Record<DbOrderStatus, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: Palette.jorange, text: Palette.ink },
  accepted: { label: 'Accepted', bg: Palette.jyellow, text: Palette.ink },
  preparing: { label: 'Preparing', bg: Palette.jgold, text: Palette.ink },
  flavoring: { label: 'Flavoring', bg: Palette.jbrown, text: Palette.cream },
  ready: { label: 'Ready', bg: Palette.green, text: Palette.cream },
};

// ─── Action buttons per status ────────────────────────────────────────────────
// MOCK — buttons are inert. They do NOT call any API or mutate any state.
// Replace with real dispatch calls in STAFF-002.
function OrderActions({ status, mode }: { status: DbOrderStatus; mode: ThemeMode }) {
  const noop = () => {
    // MOCK: no-op — STAFF-002 will wire real mutations here
  };

  if (status === 'pending') {
    return (
      <View style={actionStyles.row}>
        <Button
          label="Accept"
          variant="primary"
          mode={mode}
          onPress={noop}
          style={actionStyles.flex}
        />
        <Button
          label="Reject"
          variant="accent"
          mode={mode}
          onPress={noop}
          style={actionStyles.flex}
        />
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

const actionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
});

// ─── Single order card ────────────────────────────────────────────────────────
function OrderCard({ order, mode }: { order: MockOrder; mode: ThemeMode }) {
  const theme = useTheme();
  const cfg = STATUS_CONFIG[order.status];

  return (
    <Card mode={mode} style={styles.card}>
      {/* Header: order number + status pill */}
      <View style={styles.cardHeader}>
        <Text style={[styles.orderNumber, { color: theme.text }]}>{order.orderNumber}</Text>
        <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.statusText, { color: cfg.text }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Meta: placed-ago + total */}
      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: theme.textSecondary }]}>{order.placedAgo}</Text>
        <Text style={[styles.totalText, { color: theme.text }]}>
          {formatCurrency(order.totalCents)}
        </Text>
      </View>

      {/* Line items */}
      <View style={styles.itemList}>
        {order.items.map((item, idx) => (
          <Text key={idx} style={[styles.itemText, { color: theme.textSecondary }]}>
            {`${item.qty}× ${item.name} · ${item.option}`}
          </Text>
        ))}
      </View>

      {/* Action buttons — INERT MOCK */}
      <OrderActions status={order.status} mode={mode} />
    </Card>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ActiveOrdersScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode: ThemeMode = scheme === 'dark' ? 'dark' : 'light';
  const { data, isLoading, error } = useStaffMe();

  const branchName = isLoading
    ? null
    : error || !data
      ? 'Branch unavailable'
      : data.assignedBranch
        ? data.assignedBranch.name
        : 'No branch assigned';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Branch context */}
          <View style={styles.branchRow}>
            {isLoading ? (
              <ActivityIndicator size="small" color={theme.text} />
            ) : (
              <Text style={[styles.branchName, { color: theme.textSecondary }]}>{branchName}</Text>
            )}
            <Badge label={`${MOCK_ORDERS.length} active`} mode={mode} />
          </View>

          {/* Mock notice */}
          <View style={[styles.mockBanner, { borderColor: theme.border }]}>
            <Text style={[styles.mockText, { color: theme.textSecondary }]}>
              MOCK PREVIEW — sample data only. STAFF-002 will replace this.
            </Text>
          </View>

          {/* Order list — newest/most-urgent first (already sorted in MOCK_ORDERS) */}
          {MOCK_ORDERS.map((order) => (
            <OrderCard key={order.id} order={order} mode={mode} />
          ))}
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
    padding: Spacing.four,
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
  mockBanner: {
    borderWidth: 1,
    borderRadius: Radii.sm,
    padding: Spacing.two,
    borderStyle: 'dashed',
  },
  mockText: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
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
  itemList: {
    gap: Spacing.half,
  },
  itemText: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
});
