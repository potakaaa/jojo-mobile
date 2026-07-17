import { Ionicons } from '@expo/vector-icons';
import type { AppNotification, NotificationType } from '@jojopotato/types';
import { EmptyState, NotificationRow, ScreenHeader, Toggle } from '@jojopotato/ui';
import { router, useIsFocused, type Href } from 'expo-router';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_FOOTPRINT, useHideTabBarWhile } from '@/components/floating-tab-bar';
import { resolveTabBarClearance } from '@/components/floating-tab-bar.helpers';
import { useNotifications } from '@/features/notifications/hooks/use-notifications';
import { resolveRoute } from '@/features/notifications/lib/notification-factory';
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
 * an always-on note for order updates, then a newest-first list of mock
 * notifications. Tapping a row marks it read and navigates to its target screen.
 * Empty state when the list is empty. Mock/local state only — #75 swaps the data
 * source via `useNotifications()`.
 */
export default function NotificationsScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();

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

  const { notifications, markRead, marketingOptIn, setMarketingOptIn } = useNotifications();

  const onPressItem = (n: AppNotification) => {
    markRead(n.id);
    const r = resolveRoute(n);
    router.push((r.params ? { pathname: r.pathname, params: r.params } : r.pathname) as Href);
  };

  const onToggleMarketing = async (value: boolean) => {
    const result = await setMarketingOptIn(value);
    if (!result.ok) {
      Alert.alert("Couldn't update preference", result.error ?? 'Please try again.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/*
        TOP edge only. The top inset is ours to supply now: this stack runs with
        `headerShown: false` (see ./_layout.tsx), so no native header covers the
        status bar — without this edge the ScreenHeader title would sit under it.
        There is deliberately NO 'bottom' edge: the bottom device inset arrives
        exactly ONCE via resolveTabBarClearance(…) below, and adding it here would
        count it a second time.
      */}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Notifications" onBack={() => router.back()} mode={mode} />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            Platform.OS !== 'web' && {
              // `true` selects the no-footprint branch: the floating bar is HIDDEN on
              // this screen (via useHideTabBarWhile above), so reserving its ~85dp
              // footprint would be dead space. Only the device safe-area inset is kept,
              // plus this screen's own Spacing.four breathing room. NOTE: the helper's
              // param is named `isNested` and this screen is top-level, not nested —
              // what the branch actually selects is "bar not rendered here", which is
              // true either way. The name is not renamed on purpose: the helper is
              // shared with other call sites and a unit test (NAV-001 owns it).
              paddingBottom:
                resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom) + Spacing.four,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.settingsCard, { borderColor: theme.border }]}>
            <Toggle
              label="Marketing notifications"
              value={marketingOptIn}
              onValueChange={onToggleMarketing}
              mode={mode}
            />
            <Text style={[styles.settingsNote, { color: theme.textSecondary }]}>
              Order updates are always on and can&apos;t be turned off.
            </Text>
          </View>

          {notifications.length === 0 ? (
            <EmptyState
              iconName="notifications-outline"
              title="No notifications yet"
              description="Order updates and deals will show up here."
              mode={mode}
            />
          ) : (
            <View style={styles.list}>
              {notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  title={n.title}
                  body={n.body}
                  timeLabel={formatRelativeTime(n.createdAt)}
                  unread={n.readAt == null}
                  iconName={TYPE_ICON[n.type]}
                  onPress={() => onPressItem(n)}
                  mode={mode}
                />
              ))}
            </View>
          )}
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  settingsCard: {
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  list: {
    gap: Spacing.three,
  },
  settingsNote: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
});
