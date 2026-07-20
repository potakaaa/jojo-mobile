import type { Order } from '@jojopotato/types';
import { Button, Card, EmptyState, OrderStatusBadge, ScreenHeader, Toast } from '@jojopotato/ui';
import { formatCurrency, reorderEligibility, summarizeOrderItems } from '@jojopotato/utils';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useOrderHistory } from '@/features/orders/hooks/use-order-history';
import { useReorder } from '@/features/orders/hooks/use-reorder';
import { useNavigateToOrderTracking } from '@/features/orders/lib/navigate-to-tracking';
import { ScreenLoader, ScreenMessage } from '@/features/shared/components/screen-message';
import { useToast } from '@/features/shared/hooks/use-toast';
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
  // Aliased: `error` is already taken by useOrderHistory above.
  const { reorder, isReordering, error: reorderError } = useReorder();
  const { toast, showToast, hideToast } = useToast();
  const insets = useSafeAreaInsets();
  const navigateToOrderTracking = useNavigateToOrderTracking();

  // The hook reports the failure as data; deciding to show it as a toast is this
  // screen's call. Must sit above the early returns below (rules of hooks).
  useEffect(() => {
    if (reorderError) showToast(reorderError, 'error');
  }, [reorderError, showToast]);

  /*
    All FOUR return paths (loading / error / empty / list) render the SAME header
    inside the SAME safe-area wrapper. The native header used to cover every
    branch for free; with `headerShown:false` (see ./_layout.tsx) an unwrapped
    early return would lose both its status-bar clearance and its only way back.
  */
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <ScreenHeader title="Order History" onBack={() => router.back()} mode={mode} />
          <ScreenLoader />
        </SafeAreaView>
      </View>
    );
  }
  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <ScreenHeader title="Order History" onBack={() => router.back()} mode={mode} />
          <ScreenMessage
            title="Couldn't load your orders"
            subtitle={error}
            actionLabel="Retry"
            onAction={refetch}
          />
        </SafeAreaView>
      </View>
    );
  }
  if (!orders || orders.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <ScreenHeader title="Order History" onBack={() => router.back()} mode={mode} />
          <View style={[styles.container, styles.emptyContainer]}>
            <EmptyState
              iconName="receipt-outline"
              title="No orders yet"
              description="When you place an order, it'll show up here so you can track it and reorder in a tap."
              actionLabel="Start an order"
              onAction={() => router.replace('/(tabs)/branches')}
              mode={mode}
            />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const openOrder = (order: Order) => navigateToOrderTracking(order.id);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/*
        'top' AND 'bottom' (NAV-003): this screen previously had NO SafeAreaView
        and no device inset at all — its list bottom padding was a static
        Spacing.six. 'top' is required for the ScreenHeader now the native header
        is off; 'bottom' supplies the device inset that was missing. The static
        `paddingBottom: Spacing.six` on styles.content stays — breathing room is a
        different concern from the device inset, so the two are NOT a double-count.
        No bottom CTA and no resolveTabBarClearance call exist here: this
        SafeAreaView is the only inset source for the list content. The Toast below
        is absolutely positioned (see toast.tsx), so RN positions it relative to
        this SafeAreaView's outer/padding-box edge, not its inset content box —
        `insets.bottom` still has to be added to its own offset explicitly, same as
        every other Toast call site in the app, or it renders flush against the
        home indicator regardless of this SafeAreaView's own bottom padding.
      */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScreenHeader title="Order History" onBack={() => router.back()} mode={mode} />
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const branchName =
              branches.find((b) => b.id === item.branchId)?.name ?? 'Unknown branch';
            const itemsSummary = summarizeOrderItems(item.items);
            return (
              <Pressable accessibilityRole="button" onPress={() => openOrder(item)}>
                <Card mode={mode}>
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
                    <OrderStatusBadge status={item.status} mode={mode} />
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

        <Toast
          visible={toast.visible}
          message={toast.message}
          severity={toast.severity}
          mode={mode}
          bottomOffset={insets.bottom + Spacing.four}
          onDismiss={hideToast}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
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
