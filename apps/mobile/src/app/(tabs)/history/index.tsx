import { Ionicons } from '@expo/vector-icons';
import type { Order } from '@jojopotato/types';
import {
  Button,
  Card,
  EmptyState,
  getOrderStatusColor,
  OrderStatusBadge,
  ScreenHeader,
  Toast,
} from '@jojopotato/ui';
import { formatCurrency, reorderEligibility, summarizeOrderItems } from '@jojopotato/utils';
import { router, useIsFocused } from 'expo-router';
import { type ReactNode, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHideTabBarWhile } from '@/components/floating-tab-bar';
import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useOrderHistory } from '@/features/orders/hooks/use-order-history';
import {
  formatOrderTimestamp,
  groupOrdersByDate,
} from '@/features/orders/lib/group-orders-by-date';
import { useReorder } from '@/features/orders/hooks/use-reorder';
import { useNavigateToOrderTracking } from '@/features/orders/lib/navigate-to-tracking';
import { ScreenLoader, ScreenMessage } from '@/features/shared/components/screen-message';
import { useToast } from '@/features/shared/hooks/use-toast';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** Order History: the caller's past orders, grouped by date, newest first. */
export default function OrderHistoryScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useOrderHistory();
  const orders = useMemo(() => data?.pages.flatMap((p) => p.orders) ?? [], [data]);
  const sections = useMemo(() => groupOrdersByDate(orders, new Date()), [orders]);
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
    Hide the floating tab bar on this screen — it is the ROOT of its own
    top-level stack now (NAV-005), so `isNestedTabRoute()` is false and the bar
    would otherwise paint here. Gated on FOCUS, not just mount: the screen stays
    mounted in the Tabs navigator after the user navigates away (e.g. Reorder
    pushes to Cart), and an always-true flag would leave the bar hidden on the
    destination. See ../cart/index.tsx for the full note.

    Placed ABOVE all four early returns below: hooks must run in the same order
    on every render, so it cannot sit after a conditional return.
  */
  useHideTabBarWhile(useIsFocused());

  /*
    All FOUR return paths (loading / error / empty / list) render the SAME header
    inside the SAME safe-area wrapper. The native header used to cover every
    branch for free; with `headerShown:false` (see ./_layout.tsx) an unwrapped
    early return would lose both its status-bar clearance and its only way back.
  */
  if (isPending) {
    return (
      <Screen theme={theme} mode={mode}>
        <ScreenLoader />
      </Screen>
    );
  }
  // Full error screen only on an INITIAL-load failure (no data yet). A FAILED
  // REFRESH / load-more keeps `isError` true but retains prior pages in `data`, so
  // gating on `orders.length === 0` keeps the already-loaded list visible instead
  // of blanking it (SPEC: a failed refresh never blanks loaded orders — AC2/AC9).
  if (isError && orders.length === 0) {
    return (
      <Screen theme={theme} mode={mode}>
        <ScreenMessage
          title="Couldn't load your orders"
          subtitle={error?.message ?? 'Something went wrong'}
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      </Screen>
    );
  }
  if (orders.length === 0) {
    return (
      <Screen theme={theme} mode={mode}>
        <View style={styles.emptyContainer}>
          <EmptyState
            iconName="receipt-outline"
            title="No orders yet"
            description="When you place an order, it'll show up here so you can track it and reorder in a tap."
            actionLabel="Start an order"
            onAction={() => router.replace('/(tabs)/branches')}
            mode={mode}
          />
        </View>
      </Screen>
    );
  }

  const openOrder = (order: Order) => navigateToOrderTracking(order.id);
  const orderCountLabel = `${orders.length} order${orders.length === 1 ? '' : 's'} · newest first`;

  return (
    <Screen theme={theme} mode={mode}>
      {/*
        'top' AND 'bottom' insets are supplied by <Screen>; the Toast below is
        absolutely positioned (see toast.tsx) relative to the SafeAreaView's
        padding-box edge, so `insets.bottom` still has to be added to its own
        offset explicitly, same as every other Toast call site in the app.
      */}
      <SectionList
        testID="order-history-list"
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled
        ListHeaderComponent={
          <Text style={[styles.countLabel, { color: theme.textSecondary }]}>{orderCountLabel}</Text>
        }
        refreshControl={
          <RefreshControl
            testID="order-history-refresh"
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={theme.text}
            colors={[theme.text]}
          />
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
            <Text style={[styles.sectionCount, { color: theme.textSecondary }]}>
              {section.data.length}
            </Text>
          </View>
        )}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator color={theme.text} />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <OrderHistoryCard
            order={item}
            branchName={branches.find((b) => b.id === item.branchId)?.name ?? 'Unknown branch'}
            mode={mode}
            theme={theme}
            onPress={() => openOrder(item)}
            onReorder={() => reorder(item)}
            isReordering={isReordering}
          />
        )}
      />

      <Toast
        visible={toast.visible}
        message={toast.message}
        severity={toast.severity}
        mode={mode}
        bottomOffset={insets.bottom + Spacing.four}
        onDismiss={hideToast}
      />
    </Screen>
  );
}

type ThemeShape = ReturnType<typeof useTheme>;
type Mode = 'light' | 'dark';

/** Shared page chrome: background, safe area, and the back-enabled header. */
function Screen({ theme, mode, children }: { theme: ThemeShape; mode: Mode; children: ReactNode }) {
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScreenHeader title="Order History" onBack={() => router.back()} mode={mode} />
        {children}
      </SafeAreaView>
    </View>
  );
}

/** A single past order: status-accented, tappable, with an inline Reorder. */
function OrderHistoryCard({
  order,
  branchName,
  mode,
  theme,
  onPress,
  onReorder,
  isReordering,
}: {
  order: Order;
  branchName: string;
  mode: Mode;
  theme: ThemeShape;
  onPress: () => void;
  onReorder: () => void;
  isReordering: boolean;
}) {
  const itemsSummary = summarizeOrderItems(order.items);
  const statusColor = getOrderStatusColor(order.status);
  const canReorder = reorderEligibility(order.status);

  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card mode={mode} style={styles.card}>
        <View style={styles.cardRow}>
          <View style={[styles.accent, { backgroundColor: statusColor }]} />
          <View style={styles.cardBody}>
            <View style={styles.headerRow}>
              <Text style={[styles.orderNumber, { color: theme.text }]}>{order.orderNumber}</Text>
              <Text style={[styles.total, { color: theme.text }]}>
                {formatCurrency(order.totalCents)}
              </Text>
            </View>

            <View style={styles.branchRow}>
              <Ionicons name="storefront-outline" size={14} color={theme.textSecondary} />
              <Text style={[styles.branch, { color: theme.text }]} numberOfLines={1}>
                {branchName}
              </Text>
            </View>

            {itemsSummary ? (
              <Text style={[styles.summary, { color: theme.textSecondary }]} numberOfLines={2}>
                {itemsSummary}
              </Text>
            ) : null}

            <View style={styles.metaRow}>
              <OrderStatusBadge status={order.status} mode={mode} />
              <View style={styles.metaRight}>
                <Text style={[styles.date, { color: theme.textSecondary }]}>
                  {formatOrderTimestamp(order.placedAt, new Date())}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
              </View>
            </View>

            {canReorder ? (
              <View style={styles.reorderRow} onStartShouldSetResponder={() => true}>
                <Button
                  label="Reorder"
                  size="sm"
                  variant="outline"
                  loading={isReordering}
                  onPress={onReorder}
                  mode={mode}
                  style={styles.reorderButton}
                />
              </View>
            ) : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  content: { padding: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.six },
  countLabel: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
    marginBottom: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
    marginTop: Spacing.one,
  },
  sectionTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  sectionCount: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.bodySmall,
  },
  // padding:0 + overflow:hidden lets the status accent stripe hug the card's
  // rounded corners; the body re-adds the padding Card would normally supply.
  card: { padding: 0, overflow: 'hidden', marginBottom: Spacing.three },
  cardRow: { flexDirection: 'row' },
  accent: { width: 6 },
  cardBody: { flex: 1, padding: Spacing.three, gap: Spacing.half },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNumber: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h3 },
  total: { fontFamily: FontFamily.body.bold, fontSize: TypeScale.body },
  branchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  branch: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall, flexShrink: 1 },
  summary: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  metaRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  date: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.bodySmall },
  reorderRow: { marginTop: Spacing.two, alignItems: 'flex-start' },
  // Compact secondary action: this in-list Reorder should read lighter than a
  // primary CTA, so it overrides the shared Button's 48dp floor + wide padding
  // with a smaller pill (still a comfortable tap target for a list row).
  reorderButton: { minHeight: 38, paddingVertical: Spacing.one, paddingHorizontal: Spacing.three },
  footer: { paddingVertical: Spacing.four, alignItems: 'center' },
});
