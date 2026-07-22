import { Ionicons } from '@expo/vector-icons';
import type { AppNotification, NotificationType } from '@jojopotato/types';
import {
  ConfirmDialog,
  EmptyState,
  NotificationRow,
  ScreenHeader,
  SwipeableRow,
  Toast,
  Toggle,
} from '@jojopotato/ui';
import { router, useIsFocused, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_FOOTPRINT, useHideTabBarWhile } from '@/components/floating-tab-bar';
import { resolveTabBarClearance } from '@/components/floating-tab-bar.helpers';
import { useNotifications } from '@/features/notifications/hooks/use-notifications';
import { resolveRoute } from '@/features/notifications/lib/notification-factory';
import { ScreenLoader } from '@/features/shared/components/screen-message';
import { useToast } from '@/features/shared/hooks/use-toast';
import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** type → Ionicons glyph for the row's leading icon. */
const TYPE_ICON: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  order_accepted: 'receipt-outline',
  order_preparing: 'receipt-outline',
  order_ready: 'receipt-outline',
  order_cancelled: 'receipt-outline',
  new_deal: 'pricetag-outline',
  branch_promo: 'pricetag-outline',
  coupon_expiring: 'ticket-outline',
  reward_unlocked: 'star-outline',
  one_more_order: 'star-outline',
};

/**
 * Tiny local relative-time formatter (no shared util exists — the only prior
 * one, `formatPlacedAgo`, is private inside `(staff)/active-orders.tsx`). Mirrors
 * that "Just now / N min ago / N h ago / N d ago" shape.
 */
function formatRelativeTime(createdAt: string): string {
  const diffMs = Date.now() - Date.parse(createdAt);
  const mins = Math.max(0, Math.floor(diffMs / 60_000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

/**
 * Notifications screen (push-notifications-ui) — the root of the top-level
 * `(tabs)/notifications` stack (NAV-002 moved it out of the Account tab so back
 * returns to the calling tab; see `./_layout.tsx`). Inline marketing toggle header +
 * an always-on note for order updates, then a newest-first, cursor-paginated
 * (`FlatList` + `onEndReached`) list of notifications. Tapping a row marks it read
 * and navigates to its target screen; a full swipe on a row opens the shared
 * `ConfirmDialog` to confirm before a permanent delete. Empty state
 * when the list is empty. Data source: `useNotifications()` (notif-delete-pagination).
 */
export default function NotificationsScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();
  const { toast, showToast, hideToast } = useToast();

  /*
    Hide the floating tab bar on this screen. Notifications is a leaf screen you
    enter and leave (unlike `deals`, a browsing surface that keeps the bar), but
    it is the ROOT of its own top-level stack — so `isNestedTabRoute()` is false
    and the bar would otherwise paint here. `useHideTabBarWhile` is the existing
    cross-tree seam for exactly this (it is OR-composed with the nested check in
    floating-tab-bar.tsx). Gated on FOCUS, not just mount: this screen stays
    mounted in the Tabs navigator after the user navigates away (e.g. tapping a
    row pushes into another tab), and an always-true flag would leave the bar
    hidden on the destination. Losing focus restores it; unmount also restores.
  */
  useHideTabBarWhile(useIsFocused());

  const {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    marketingOptIn,
    setMarketingOptIn,
    deleteNotification,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
    isPending,
  } = useNotifications();

  // Optimistic local state for the marketing toggle — updates instantly on press
  // and reverts only when the server rejects the change. Same pattern as the staff
  // product-availability row (uses the "previous render" sync rather than useEffect).
  const [localOptIn, setLocalOptIn] = useState(marketingOptIn);
  const [prevMarketingOptIn, setPrevMarketingOptIn] = useState(marketingOptIn);
  if (prevMarketingOptIn !== marketingOptIn) {
    setPrevMarketingOptIn(marketingOptIn);
    setLocalOptIn(marketingOptIn);
  }

  // The row awaiting delete confirmation (null = dialog closed). A full swipe only
  // SETS this — it never deletes directly (AC5).
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const onPressItem = useCallback(
    (n: AppNotification) => {
      markRead(n.id);
      const r = resolveRoute(n);
      router.push((r.params ? { pathname: r.pathname, params: r.params } : r.pathname) as Href);
    },
    [markRead],
  );

  const onToggleMarketing = async (value: boolean) => {
    setLocalOptIn(value);
    const result = await setMarketingOptIn(value);
    if (!result.ok) {
      setLocalOptIn(!value);
      showToast(result.error ?? 'Please try again.', 'error');
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => (
      <SwipeableRow onFullSwipe={() => setPendingDeleteId(item.id)}>
        <NotificationRow
          title={item.title}
          body={item.body}
          timeLabel={formatRelativeTime(item.createdAt)}
          unread={item.readAt == null}
          iconName={TYPE_ICON[item.type]}
          onPress={() => onPressItem(item)}
          mode={mode}
        />
      </SwipeableRow>
    ),
    [mode, onPressItem],
  );

  const listHeader = (
    <View style={styles.header}>
      <View style={[styles.settingsCard, { borderColor: theme.border }]}>
        <Toggle
          label="Marketing notifications"
          value={localOptIn}
          onValueChange={onToggleMarketing}
          mode={mode}
        />
        <Text style={[styles.settingsNote, { color: theme.textSecondary }]}>
          Order updates are always on and can&apos;t be turned off.
        </Text>
      </View>

      {notifications.length > 0 && unreadCount > 0 && (
        <Pressable
          onPress={markAllRead}
          style={styles.markAllRow}
          accessibilityRole="button"
          accessibilityLabel="Mark all notifications as read"
        >
          <Text style={[styles.markAllText, { color: theme.textSecondary }]}>Mark all as read</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/*
        TOP edge only. The top inset is ours to supply now: this stack runs with
        `headerShown: false` (see ./_layout.tsx), so no native header covers the
        status bar — without this edge the ScreenHeader title would sit under it.
        There is deliberately NO 'bottom' edge: the bottom device inset arrives
        exactly ONCE via resolveTabBarClearance(…) below.
      */}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Notifications" onBack={() => router.back()} mode={mode} />
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ItemSeparatorComponent={ItemSeparator}
          ListEmptyComponent={
            isPending ? (
              <ScreenLoader />
            ) : (
              <EmptyState
                iconName="notifications-outline"
                title="No notifications yet"
                description="Order updates and deals will show up here."
                mode={mode}
              />
            )
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator style={styles.footer} color={theme.textSecondary} />
            ) : null
          }
          refreshControl={
            <RefreshControl
              testID="notifications-refresh"
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={theme.text}
              colors={[theme.text]}
            />
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            Platform.OS !== 'web' && {
              // `true` selects the no-footprint branch: the floating bar is HIDDEN on
              // this screen (via useHideTabBarWhile above), so reserving its ~85dp
              // footprint would be dead space. Only the device safe-area inset is kept,
              // plus this screen's own Spacing.four breathing room. (The helper's param
              // is named `isNested`; this top-level screen selects the same
              // "bar not rendered here" branch — see NAV-001, which owns the helper.)
              paddingBottom:
                resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom) + Spacing.four,
            },
          ]}
        />

        <Toast
          visible={toast.visible}
          message={toast.message}
          severity={toast.severity}
          mode={mode}
          bottomOffset={insets.bottom + Spacing.four}
          onDismiss={hideToast}
        />

        <ConfirmDialog
          visible={pendingDeleteId != null}
          title="Delete notification?"
          message="This can't be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="destructive"
          mode={mode}
          onConfirm={() => {
            if (pendingDeleteId) deleteNotification(pendingDeleteId);
            setPendingDeleteId(null);
          }}
          onCancel={() => {
            // The row is already back at rest by the time the dialog can be
            // cancelled (a full swipe springs it back immediately), so there is
            // nothing left to close here (AC7).
            setPendingDeleteId(null);
          }}
        />
      </SafeAreaView>
    </View>
  );
}

/** Inter-row spacer — matches the old `gap: Spacing.three` between rows. */
function ItemSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    flexGrow: 1,
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  settingsCard: {
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  markAllRow: {
    alignSelf: 'flex-end',
  },
  markAllText: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  settingsNote: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
  separator: {
    height: Spacing.three,
  },
  footer: {
    paddingVertical: Spacing.four,
  },
});
